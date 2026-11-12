import { apiFetch } from "@/lib/api";

export type ImageAspectRatio = "square" | "portrait" | "landscape";

export type ImageBrandingPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type ImageBranding =
  | {
      type: "none";
    }
  | {
      type: "logo";
      position: ImageBrandingPosition;
      sizePercent: number;
      opacity: number;
    }
  | {
      type: "text";
      text: string;
      position: ImageBrandingPosition;
      sizePercent: number;
      opacity: number;
    };

export type ImageBrandingMode = ImageBranding["type"];

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
    branding?: ImageBranding;
  };
};

export type ImageHistoryItem = {
  assetId: string;
  status: "pending" | "ready" | "failed";
  state: "processing" | "ready" | "failed" | "action_required";
  createdAt: string;
  updatedAt: string;
  aspectRatio: "square" | "portrait" | "landscape";
  image?: {
    width: number;
    height: number;
    mimeType: "image/png";
  };
};

export type ImageHistoryPage = {
  images: ImageHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
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

export function validateImageBranding(branding: ImageBranding): ImageBranding {
  if (branding.type === "none") {
    return { type: "none" };
  }

  const positions: ImageBrandingPosition[] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];

  if (!positions.includes(branding.position)) {
    throw new Error("Select a valid branding position.");
  }

  if (
    !Number.isInteger(branding.sizePercent) ||
    branding.sizePercent < 5 ||
    branding.sizePercent > 30
  ) {
    throw new Error("Branding size must be between 5% and 30%.");
  }

  if (
    !Number.isFinite(branding.opacity) ||
    branding.opacity < 0.1 ||
    branding.opacity > 1
  ) {
    throw new Error("Branding opacity must be between 10% and 100%.");
  }

  const appearance = {
    position: branding.position,
    sizePercent: branding.sizePercent,
    opacity: branding.opacity,
  };

  if (branding.type === "logo") {
    return {
      type: "logo",
      ...appearance,
    };
  }

  const text = branding.text.trim();

  if (
    text.length < 1 ||
    text.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(text)
  ) {
    throw new Error(
      "Enter a text label containing 1–80 characters without control characters.",
    );
  }

  return {
    type: "text",
    text,
    ...appearance,
  };
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

export function getWorkspaceImageHistory(
  workspaceId: string,
  options: {
    limit?: number;
    cursor?: string;
  } = {},
): Promise<ImageHistoryPage> {
  const path = imageGenerationPath(workspaceId);

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 30)
  ) {
    throw new Error("Invalid history page size.");
  }

  if (
    options.cursor !== undefined &&
    (!options.cursor || !/^[A-Za-z0-9_-]{1,256}$/.test(options.cursor))
  ) {
    throw new Error("Invalid image history cursor.");
  }

  const query = new URLSearchParams();

  if (options.limit !== undefined) {
    query.set("limit", String(options.limit));
  }

  if (options.cursor !== undefined) {
    query.set("cursor", options.cursor);
  }

  const suffix = query.toString();

  return apiFetch<ImageHistoryPage>(
    `${path}/history${suffix ? `?${suffix}` : ""}`,
  );
}
