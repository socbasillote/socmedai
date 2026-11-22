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

const EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
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
 * Log only safe diagnostic metadata.
 *
 * Never log:
 * - API keys
 * - prompts
 * - response bodies
 * - generated images
 * - authorization headers
 */
function logProviderFailure(
  stage: string,
  details: {
    httpStatus?: number;
    errorType?: string;
    providerCode?: string;
    providerType?: string;
    parameter?: string;
    requestId?: string;
  } = {},
): void {
  console.error("[OpenAI Image Provider]", {
    stage,
    ...details,
  });
}

/**
 * Read a bounded response body.
 *
 * Rejecting oversized responses prevents a
 * malformed upstream response from consuming
 * unlimited API-server memory.
 */
async function readBoundedResponse(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
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

      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
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
  return providerError(
    `Image provider request was not completed successfully (HTTP ${status}).`,
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
    const { referenceImage, ...parameters } = request;
    const parsed = generateImageSchema.safeParse(parameters);

    if (!parsed.success) {
      throw providerError("Invalid image generation request.", "rejected");
    }

    const expectedSize = IMAGE_SIZES[parsed.data.aspectRatio];

    let body: BodyInit;
    let endpoint = IMAGE_ENDPOINT;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
    if (referenceImage) {
      if (!(referenceImage.bytes instanceof Uint8Array) || !referenceImage.bytes.length || referenceImage.bytes.length > MAX_IMAGE_BYTES ||
        !["inspiration", "edit", "design"].includes(referenceImage.usage)) {
        throw providerError("Invalid reference photo.", "rejected");
      }
      const instructions = {
        inspiration: "Use the uploaded image only as visual inspiration for mood, colors, style, and composition. Create a new image following the user's description; do not assume its exact subject must be preserved.",
        edit: "Edit the uploaded photo itself. Preserve the main subject's identity, recognizable features, and product details unless the user explicitly asks to change them. Apply the requested edits.",
        design: "Build a polished design around the actual subject in the uploaded photo. Preserve its recognizable identity and product details, and integrate it into the layout, background, and design requested by the user.",
      };
      const form = new FormData();
      form.set("model", this.model);
      form.set("prompt", `${instructions[referenceImage.usage]}\n\nUser instructions: ${parsed.data.prompt}`);
      form.set("size", expectedSize);
      form.set("quality", "low");
      form.set("n", "1");
      form.set("output_format", "png");
      form.append("image[]", new Blob([Uint8Array.from(referenceImage.bytes).buffer], { type: "image/png" }), "reference.png");
      body = form;
      endpoint = EDIT_ENDPOINT;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ model: this.model, prompt: parsed.data.prompt, size: expectedSize, quality: "low", n: 1, output_format: "png" });
    }

    let response: Response;

    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";

      logProviderFailure("transport", {
        errorType,
      });

      throw providerError(
        "Image provider request outcome is uncertain.",
        "uncertain",
      );
    }

    if (!response.ok) {
      // Provider messages can echo prompts or credentials. Only log recognized
      // metadata, never the raw body or arbitrary upstream strings.
      const diagnostics: {
        providerCode?: string; providerType?: string; parameter?: string; requestId?: string;
      } = {};
      const requestId = response.headers.get("x-request-id");
      if (requestId && /^req_[A-Za-z0-9_-]{1,120}$/.test(requestId)) diagnostics.requestId = requestId;
      try {
        const payload: unknown = JSON.parse(await readBoundedResponse(response, 16 * 1024));
        if (payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object") {
          const error = payload.error as Record<string, unknown>;
          if (typeof error.code === "string" && [
            "invalid_api_key", "invalid_request", "invalid_value", "unsupported_value",
            "unsupported_parameter", "unknown_parameter", "missing_required_parameter",
            "model_not_found", "content_policy_violation", "moderation_blocked",
            "billing_hard_limit_reached", "billing_not_active", "insufficient_quota",
            "organization_verification_required", "rate_limit_exceeded",
          ].includes(error.code)) diagnostics.providerCode = error.code;
          if (typeof error.type === "string" && ["invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "server_error", "image_generation_user_error"].includes(error.type)) diagnostics.providerType = error.type;
          if (typeof error.param === "string" && ["model", "prompt", "size", "quality", "n", "output_format", "image", "image[]", "response_format", "moderation", "background"].includes(error.param)) diagnostics.parameter = error.param;
        }
      } catch {
        // Missing, malformed or oversized diagnostics must not alter job handling.
      }
      logProviderFailure("http_response", {
        httpStatus: response.status,
        ...diagnostics,
      });

      await response.body?.cancel().catch(() => undefined);

      throw classifyHttpError(response.status);
    }

    let raw: string;

    try {
      raw = await readBoundedResponse(response);
    } catch {
      logProviderFailure("response_read");

      throw providerError(
        "Image provider response could not be read safely.",
        "uncertain",
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      logProviderFailure("invalid_json");

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
      logProviderFailure("image_validation");

      throw providerError(
        "Image provider returned an invalid or unexpected image.",
        "uncertain",
      );
    }
  }
}
