import { apiFetch } from "@/lib/api";
import type { PostPlatform } from "@/lib/posts";

export type CaptionTone =
  | "professional"
  | "friendly"
  | "bold"
  | "educational"
  | "playful"
  | "inspirational";

export type CaptionLength = "short" | "medium" | "long";

export type GenerateCaptionInput = {
  brief: string;
  platform: PostPlatform;
  tone: CaptionTone;
  audience: string;
  callToAction: string;
  length: CaptionLength;
};

export type ReviseCaptionInput = {
  caption: string;
  instruction: string;
  platform: PostPlatform;
};

type GenerateCaptionResponse = {
  caption: string;
};

export type CaptionVariationStyle = "engaging" | "informative" | "concise";

export type CaptionVariation = {
  style: CaptionVariationStyle;
  caption: string;
};

export type CaptionVariationsResponse = {
  variations: CaptionVariation[];
};

export async function generateCaption(
  input: GenerateCaptionInput,
): Promise<string> {
  const response = await apiFetch<GenerateCaptionResponse>(
    "/api/ai/generate-caption",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return response.caption;
}

export async function reviseCaption(
  input: ReviseCaptionInput,
): Promise<string> {
  const response = await apiFetch<GenerateCaptionResponse>(
    "/api/ai/revise-caption",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return response.caption;
}

/**
 * Requests three AI caption alternatives.
 *
 * Uses the existing authenticated apiFetch client.
 */
export async function generateCaptionVariations(
  input: GenerateCaptionInput,
): Promise<CaptionVariation[]> {
  const response = await apiFetch<CaptionVariationsResponse>(
    "/api/ai/generate-caption-variations",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return response.variations;
}
