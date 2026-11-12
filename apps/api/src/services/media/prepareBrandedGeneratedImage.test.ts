import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { prepareBrandedGeneratedImage } from "./prepareBrandedGeneratedImage.js";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

/**
 * Text and unbranded composition must not
 * access private logo storage.
 *
 * The empty bucket is intentional:
 * any unexpected storage access should fail.
 */
const unusedBucket = {} as ImageStorageBucket;

const workspaceId = "507f1f77bcf86cd799439011";

async function createImage() {
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: "#465969",
    },
  })
    .png()
    .toBuffer();
}

const appearance = {
  position: "bottom-right" as const,
  sizePercent: 20,
  opacity: 0.8,
};

describe("Branded generated image composition", () => {
  it("supports new unbranded snapshots", async () => {
    const bytes = await createImage();

    const result = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes,
        brandingSnapshot: {
          type: "none",
        },
      },
      unusedBucket,
    );

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it("preserves legacy unbranded assets", async () => {
    const bytes = await createImage();

    const result = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes,
      },
      unusedBucket,
    );

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it("applies a persisted text label", async () => {
    const bytes = await createImage();

    const clean = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes,
        brandingSnapshot: {
          type: "none",
        },
      },
      unusedBucket,
    );

    const labeled = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes,
        brandingSnapshot: {
          type: "text",
          text: "BREW CO.",
          ...appearance,
        },
      },
      unusedBucket,
    );

    expect(labeled.mimeType).toBe("image/png");
    expect(labeled.width).toBe(512);
    expect(labeled.height).toBe(512);

    // Branding must affect the final artifact.
    expect(labeled.sha256).not.toBe(clean.sha256);
  });

  it("is deterministic for the same admitted label", async () => {
    const bytes = await createImage();

    const input = {
      workspaceId,
      bytes,
      brandingSnapshot: {
        type: "text" as const,
        text: "BREW CO.",
        ...appearance,
      },
    };

    const first = await prepareBrandedGeneratedImage(input, unusedBucket);

    const second = await prepareBrandedGeneratedImage(input, unusedBucket);

    expect(first.sha256).toBe(second.sha256);

    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(
      true,
    );
  });

  it("changes the artifact when label text changes", async () => {
    const bytes = await createImage();

    const first = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes,
        brandingSnapshot: {
          type: "text",
          text: "BREW CO.",
          ...appearance,
        },
      },
      unusedBucket,
    );

    const second = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes,
        brandingSnapshot: {
          type: "text",
          text: "COFFEE HOUSE",
          ...appearance,
        },
      },
      unusedBucket,
    );

    expect(first.sha256).not.toBe(second.sha256);
  });

  it("rejects conflicting new and legacy snapshots", async () => {
    const bytes = await createImage();

    const logo = {
      storageKey: `workspaces/${workspaceId}/logos/507f1f77bcf86cd799439012.png`,
      sha256: "a".repeat(64),
    };

    await expect(
      prepareBrandedGeneratedImage(
        {
          workspaceId,
          bytes,

          brandingSnapshot: {
            type: "text",
            text: "BREW CO.",
            ...appearance,
          },

          snapshot: {
            enabled: true,
            logo,
            ...appearance,
          },
        },
        unusedBucket,
      ),
    ).rejects.toThrow("Text branding conflicts with an enabled logo.");
  });

  it("rejects invalid persisted text before composition", async () => {
    const bytes = await createImage();

    await expect(
      prepareBrandedGeneratedImage(
        {
          workspaceId,
          bytes,

          brandingSnapshot: {
            type: "text",
            text: "BREW\nCO.",
            ...appearance,
          },
        } as Parameters<typeof prepareBrandedGeneratedImage>[0],
        unusedBucket,
      ),
    ).rejects.toThrow();
  });
});
