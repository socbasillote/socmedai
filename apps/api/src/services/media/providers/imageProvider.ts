import type { GenerateImageInput } from "../../../schemas/aiImageSchema.js";

export type ImageProviderRequest = {
  prompt: GenerateImageInput["prompt"];
  aspectRatio: GenerateImageInput["aspectRatio"];
};

export type ImageProviderResult = {
  bytes: Uint8Array;
  mimeType: "image/png";
  provider: string;
  model: string;
};

export interface ImageProvider {
  readonly provider: string;
  readonly model: string;

  generate(request: ImageProviderRequest): Promise<ImageProviderResult>;
}

export class ImageProviderError extends Error {
  constructor(
    message: string,
    public readonly outcome: "rejected" | "uncertain",
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}
