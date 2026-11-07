import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";

import {
  createImageRequestKey,
  generateWorkspaceImage,
  getImageGenerationCredits,
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
  imageGenerationPath,
  validateImagePrompt,
} from "./imageGeneration";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const workspaceId = "507f1f77bcf86cd799439011";

const assetId = "507f1f77bcf86cd799439022";

const basePath = `/api/ai/workspaces/${workspaceId}/images`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Image Studio API client", () => {
  it("builds the correct workspace path", () => {
    expect(imageGenerationPath(workspaceId)).toBe(basePath);
  });

  it("rejects an invalid workspace ID", () => {
    expect(() => imageGenerationPath("invalid")).toThrow(
      "Invalid workspace ID.",
    );
  });

  it("creates valid unique request keys", () => {
    const first = createImageRequestKey();
    const second = createImageRequestKey();

    expect(first).toMatch(/^[0-9a-f-]{36}$/i);

    expect(first).not.toBe(second);
  });

  it("normalizes a valid prompt", () => {
    expect(validateImagePrompt("  A premium product photograph.  ")).toBe(
      "A premium product photograph.",
    );
  });

  it("rejects short prompts", () => {
    expect(() => validateImagePrompt("short")).toThrow();
  });

  it("rejects prompts longer than 3000 characters", () => {
    expect(() => validateImagePrompt("a".repeat(3001))).toThrow();
  });

  it("requests authenticated credit information", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      credits: {
        available: 5,
        costPerImage: 1,
      },
      usage: {
        dayUtc: "2026-11-07",
        attempts: 0,
        dailyLimit: 10,
        active: 0,
        maxActive: 2,
      },
    });

    const result = await getImageGenerationCredits(workspaceId);

    expect(result.credits.available).toBe(5);

    expect(apiFetch).toHaveBeenCalledWith(`${basePath}/credits`);
  });

  it("posts the exact idempotent generation command", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      assetId,
      status: "ready",
      created: true,
      creditsChargedNow: 1,
    });

    const command = {
      idempotencyKey: "image-studio-request-0001",
      image: {
        prompt: "A cinematic commercial product photograph.",
        aspectRatio: "square" as const,
      },
    };

    const result = await generateWorkspaceImage(workspaceId, command);

    expect(result.creditsChargedNow).toBe(1);

    expect(apiFetch).toHaveBeenCalledWith(basePath, {
      method: "POST",
      body: JSON.stringify(command),
    });
  });

  it("retrieves generation status without POST", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      assetId,
      status: "pending",
      state: "processing",
    });

    await getWorkspaceImageStatus(workspaceId, assetId);

    expect(apiFetch).toHaveBeenCalledWith(`${basePath}/${assetId}`);
  });

  it("retrieves private image access", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      assetId,
      url: "https://example.test/signed",
      expiresIn: 60,
    });

    const result = await getWorkspaceImageUrl(workspaceId, assetId);

    expect(result.expiresIn).toBe(60);

    expect(apiFetch).toHaveBeenCalledWith(`${basePath}/${assetId}/url`);
  });

  it("rejects invalid image IDs before HTTP", () => {
    expect(() =>
      getWorkspaceImageStatus(workspaceId, "not-an-object-id"),
    ).toThrow("Invalid image ID.");

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
