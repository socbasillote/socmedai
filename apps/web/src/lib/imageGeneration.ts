import { apiFetch } from "@/lib/api";

export type ImageAspectRatio = "square" | "portrait" | "landscape";

export type ImageGenerationStatus = "pending" | "ready" | "failed";

export type ImageGenerationState =
  | "processing"
  | "ready"
  | "failed"
  | "action_required";

export type ImageGenerationCredits = {
  credits: {
    available: number;
    costPerImage: number;
  };
  usage: {
    dayUtc: string;
    attempts: number;
    dailyLimit: number;
    active: number;
    maxActive: number;
  };
};

export type ImageGenerationSubmission = {
  assetId: string;
  status: ImageGenerationStatus;
  created: boolean;
  creditsChargedNow: number;
};

export type ImageGenerationDetails = {
  assetId: string;
  status: ImageGenerationStatus;
  state: ImageGenerationState;
  createdAt: string;
  updatedAt: string;
  image?: {
    width: number;
    height: number;
    mimeType: "image/png";
  };
};

export type PrivateImageAccess = {
  assetId: string;
  url: string;
  expiresIn: number;
};

export type GenerateImageCommand = {
  idempotencyKey: string;
  image: {
    prompt: string;
    aspectRatio: ImageAspectRatio;
  };
};

const WORKSPACE_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export function imageGenerationPath(workspaceId: string): string {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new Error("Invalid workspace ID.");
  }

  return `/api/ai/workspaces/` + `${encodeURIComponent(workspaceId)}/images`;
}

export function createImageRequestKey(): string {
  // Browser-generated UUID, not an asset ID.
  // The server's unique MongoDB index is the
  // actual idempotency guarantee.
  return crypto.randomUUID();
}

export function validateImagePrompt(prompt: string): string {
  const normalized = prompt.trim();

  if (normalized.length < 10 || normalized.length > 3000) {
    throw new Error("The image prompt must contain 10–3000 characters.");
  }

  return normalized;
}

export function getImageGenerationCredits(workspaceId: string) {
  return apiFetch<ImageGenerationCredits>(
    `${imageGenerationPath(workspaceId)}/credits`,
  );
}

export function generateWorkspaceImage(
  workspaceId: string,
  command: GenerateImageCommand,
) {
  return apiFetch<ImageGenerationSubmission>(imageGenerationPath(workspaceId), {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export function getWorkspaceImageStatus(workspaceId: string, assetId: string) {
  if (!WORKSPACE_ID_PATTERN.test(assetId)) {
    throw new Error("Invalid image ID.");
  }

  return apiFetch<ImageGenerationDetails>(
    `${imageGenerationPath(workspaceId)}/` + encodeURIComponent(assetId),
  );
}

export function getWorkspaceImageUrl(workspaceId: string, assetId: string) {
  if (!WORKSPACE_ID_PATTERN.test(assetId)) {
    throw new Error("Invalid image ID.");
  }

  return apiFetch<PrivateImageAccess>(
    `${imageGenerationPath(workspaceId)}/` +
      `${encodeURIComponent(assetId)}/url`,
  );
}
