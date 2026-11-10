export type ImageAspectRatio = "square" | "portrait" | "landscape";

export type OpenAIImageRequest = {
  model: "gpt-image-2";
  prompt: string;
  aspectRatio: ImageAspectRatio;
};

export type OpenAIImageResult = {
  bytes: Uint8Array;
  mimeType: "image/png";
  provider: "openai";
  model: "gpt-image-2";
  providerRequestId: string | null;
};

export class ImageProviderPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProviderPreflightError";
  }
}

/**
 * The paid request may have reached OpenAI.
 * Never automatically retry based on this error.
 */
export class ImageProviderOutcomeUnknown extends Error {
  constructor(
    public readonly category: "transport" | "http" | "invalid_response",
    public readonly httpStatus?: number,
  ) {
    super("Image provider outcome requires reconciliation.");
    this.name = "ImageProviderOutcomeUnknown";
  }
}

type ImageFetch = typeof fetch;

type TransportOptions = {
  apiKey: string;
  fetchImpl: ImageFetch;
  timeoutMs?: number;
};

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 36 * 1024 * 1024;

function sizeForRatio(ratio: ImageAspectRatio): string {
  switch (ratio) {
    case "square":
      return "1024x1024";
    case "portrait":
      return "1024x1536";
    case "landscape":
      return "1536x1024";
  }
}

function validateRequest(request: OpenAIImageRequest): void {
  if (
    request.model !== "gpt-image-2" ||
    !["square", "portrait", "landscape"].includes(request.aspectRatio) ||
    typeof request.prompt !== "string" ||
    request.prompt.trim().length === 0 ||
    request.prompt.length > 10000
  ) {
    throw new ImageProviderPreflightError("Invalid persisted image request.");
  }
}

function decodePng(encoded: string): Uint8Array {
  if (
    !encoded ||
    encoded.length > MAX_RESPONSE_BYTES ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new ImageProviderOutcomeUnknown("invalid_response");
  }

  const bytes = Buffer.from(encoded, "base64");

  if (
    bytes.length === 0 ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) {
    throw new ImageProviderOutcomeUnknown("invalid_response");
  }

  return new Uint8Array(bytes);
}

/**
 * Exactly one HTTP attempt.
 *
 * There is deliberately no retry loop.
 * Caller must durably record provider_started
 * before invoking this function.
 */
export async function generateOpenAIImageOnce(
  request: OpenAIImageRequest,
  options: TransportOptions,
): Promise<OpenAIImageResult> {
  validateRequest(request);

  if (
    !options.apiKey ||
    !options.apiKey.trim() ||
    !Number.isSafeInteger(options.timeoutMs ?? 180000) ||
    (options.timeoutMs ?? 180000) < 1000
  ) {
    throw new ImageProviderPreflightError(
      "Invalid image provider configuration.",
    );
  }

  const timeoutMs = options.timeoutMs ?? 180000;

  let response: Response;

  try {
    response = await options.fetchImpl(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        size: sizeForRatio(request.aspectRatio),
        quality: "low",
        output_format: "png",
        n: 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Connection failures and timeouts do
    // not prove the provider did nothing.
    throw new ImageProviderOutcomeUnknown("transport");
  }

  if (!response.ok) {
    // Conservatively classify all HTTP
    // failures as requiring investigation.
    // Billing-aware classification comes
    // in Step 12.3.6.4.
    throw new ImageProviderOutcomeUnknown("http", response.status);
  }

  const responseLength = Number(response.headers.get("content-length"));

  if (responseLength > MAX_RESPONSE_BYTES) {
    throw new ImageProviderOutcomeUnknown("invalid_response");
  }

  let payload: unknown;

  try {
    const text = await response.text();

    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Provider response exceeded limit.");
    }

    payload = JSON.parse(text);
  } catch {
    throw new ImageProviderOutcomeUnknown("invalid_response");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !Array.isArray(payload.data) ||
    payload.data.length !== 1
  ) {
    throw new ImageProviderOutcomeUnknown("invalid_response");
  }

  const image = payload.data[0];

  if (
    typeof image !== "object" ||
    image === null ||
    !("b64_json" in image) ||
    typeof image.b64_json !== "string"
  ) {
    throw new ImageProviderOutcomeUnknown("invalid_response");
  }

  return {
    bytes: decodePng(image.b64_json),
    mimeType: "image/png",
    provider: "openai",
    model: request.model,
    providerRequestId: response.headers.get("x-request-id"),
  };
}
