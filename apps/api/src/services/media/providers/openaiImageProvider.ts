import { generateImageSchema } from "../../../schemas/aiImageSchema.js";

import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  validateGeneratedImage,
} from "../imageValidation.js";

import {
  ImageProviderError,
  type ImageProvider,
  type ImageProviderRequest,
  type ImageProviderResult,
} from "./imageProvider.js";

const IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 30 * 1024 * 1024;

const IMAGE_SIZES = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
} as const;

type OpenAIImageProviderOptions = {
  apiKey: string;
  model: string;

  /**
   * Required injection:
   * Tests provide a mock function.
   * The trusted production factory will
   * eventually provide global fetch.
   */
  fetchImpl: typeof fetch;
};

function providerError(
  message: string,
  outcome: "rejected" | "uncertain",
): ImageProviderError {
  return new ImageProviderError(message, outcome);
}

/**
 * Read a bounded response body.
 *
 * Rejecting oversized responses prevents a
 * malformed upstream response from consuming
 * unlimited API-server memory.
 */
async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let total = 0;
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_RESPONSE_BYTES) {
        throw providerError(
          "Image provider response exceeded the allowed size.",
          "uncertain",
        );
      }

      output += decoder.decode(value, {
        stream: true,
      });
    }

    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function classifyHttpError(status: number): ImageProviderError {
  /**
   * These statuses indicate that the request
   * was rejected rather than successfully
   * returning an image.
   *
   * Unexpected statuses remain uncertain.
   */
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 422
  ) {
    return providerError(
      `Image provider rejected the request (HTTP ${status}).`,
      "rejected",
    );
  }

  return providerError(
    `Image provider outcome is uncertain (HTTP ${status}).`,
    "uncertain",
  );
}

function isStrictBase64(value: string): boolean {
  if (
    !value ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return false;
  }

  return true;
}

export class OpenAIImageProvider implements ImageProvider {
  readonly provider = "openai";
  readonly model: string;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIImageProviderOptions) {
    const apiKey = options.apiKey.trim();
    const model = options.model.trim();

    if (!apiKey) {
      throw new Error("OpenAI image provider credentials are unavailable.");
    }

    if (!model || model.length > 120 || !/^[A-Za-z0-9._-]+$/.test(model)) {
      throw new Error("Invalid OpenAI image model configuration.");
    }

    if (
      !/^gpt-image-(?:1-mini|1\.5|2(?:-[A-Za-z0-9.-]+)?|2\.5-(?:sunburst|flare)(?:-[A-Za-z0-9.-]+)?|2\.6-(?:sunburst|flare)(?:-[A-Za-z0-9.-]+)?)$/.test(
        model,
      )
    ) {
      throw new Error("Unsupported OpenAI image model configuration.");
    }

    if (typeof options.fetchImpl !== "function") {
      throw new Error("An HTTP transport is required.");
    }

    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = options.fetchImpl;
  }

  async generate(request: ImageProviderRequest): Promise<ImageProviderResult> {
    const parsed = generateImageSchema.safeParse(request);

    if (!parsed.success) {
      throw providerError("Invalid image generation request.", "rejected");
    }

    const expectedSize = IMAGE_SIZES[parsed.data.aspectRatio];

    let response: Response;

    try {
      response = await this.fetchImpl(IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: parsed.data.prompt,
          size: expectedSize,
          n: 1,
          output_format: "png",
        }),
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw providerError(
        "Image provider request outcome is uncertain.",
        "uncertain",
      );
    }

    if (!response.ok) {
      /**
       * Don't expose provider response bodies
       * to callers: they can contain details
       * inappropriate for API responses.
       */
      await response.body?.cancel().catch(() => undefined);

      throw classifyHttpError(response.status);
    }

    let raw: string;

    try {
      raw = await readBoundedResponse(response);
    } catch {
      throw providerError(
        "Image provider response could not be read safely.",
        "uncertain",
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      throw providerError("Image provider returned invalid JSON.", "uncertain");
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !("data" in payload) ||
      !Array.isArray(payload.data) ||
      payload.data.length !== 1
    ) {
      throw providerError(
        "Image provider returned an unexpected image count.",
        "uncertain",
      );
    }

    const item: unknown = payload.data[0];

    if (
      !item ||
      typeof item !== "object" ||
      !("b64_json" in item) ||
      typeof item.b64_json !== "string"
    ) {
      throw providerError(
        "Image provider returned no image data.",
        "uncertain",
      );
    }

    const base64 = item.b64_json;

    if (
      base64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4 ||
      !isStrictBase64(base64)
    ) {
      throw providerError(
        "Image provider returned invalid image encoding.",
        "uncertain",
      );
    }

    const decoded = Buffer.from(base64, "base64");

    if (decoded.length === 0 || decoded.length > MAX_IMAGE_BYTES) {
      throw providerError(
        "Image provider returned an oversized image.",
        "uncertain",
      );
    }

    try {
      const validated = await validateGeneratedImage(decoded);

      const [expectedWidth, expectedHeight] = expectedSize
        .split("x")
        .map(Number);

      if (
        validated.width !== expectedWidth ||
        validated.height !== expectedHeight ||
        validated.width > MAX_IMAGE_DIMENSION ||
        validated.height > MAX_IMAGE_DIMENSION
      ) {
        throw new Error("Unexpected generated image dimensions.");
      }

      return {
        bytes: validated.bytes,
        mimeType: "image/png",
        provider: this.provider,
        model: this.model,
      };
    } catch {
      throw providerError(
        "Image provider returned an invalid or unexpected image.",
        "uncertain",
      );
    }
  }
}
