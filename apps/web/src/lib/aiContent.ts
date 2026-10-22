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

type GenerateCaptionResponse = {
  caption: string;
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
