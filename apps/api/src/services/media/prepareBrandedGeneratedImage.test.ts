import { createHash } from "node:crypto";
import sharp from "sharp";

import { describe, expect, it } from "vitest";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

import { prepareBrandedGeneratedImage } from "./prepareBrandedGeneratedImage.js";

import type { WorkspaceLogoSettings } from "./workspaceLogoConfig.js";

const workspaceId = "6aeba54a3fe7bf29e916b3f1";

const logoId = "6af31be35bba81eee2f1be9b";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function createBase() {
  return sharp({
    create: {
      width: 500,
      height: 500,
      channels: 4,
      background: "#ffffff",
    },
  })
    .png()
    .toBuffer();
}

async function createLogo() {
  return sharp({
    create: {
      width: 100,
      height: 50,
      channels: 4,
      background: "#ff0000",
    },
  })
    .png()
    .toBuffer();
}

function mockBucket(bytes: Buffer): ImageStorageBucket {
  return {
    async download() {
      return {
        data: new Blob([Uint8Array.from(bytes)]),
        error: null,
      };
    },

    async upload() {
      return { error: null };
    },

    async remove() {
      return { error: null };
    },
  };
}

function createSnapshot(logo: Buffer): WorkspaceLogoSettings {
  return {
    enabled: true,
    logo: {
      storageKey: `workspaces/${workspaceId}/logos/${logoId}.png`,
      sha256: sha256(logo),
    },
    position: "bottom-right",
    sizePercent: 20,
    opacity: 1,
  };
}

describe("Branded generated image preparation", () => {
  it("preserves unbranded legacy image behavior", async () => {
    const base = await createBase();

    const result = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes: base,
      },
      mockBucket(await createLogo()),
    );

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(500);
    expect(result.height).toBe(500);
  });

  it("does not download a disabled logo", async () => {
    const base = await createBase();

    const bucket = mockBucket(await createLogo());

    bucket.download = async () => {
      throw new Error("Disabled branding must not download.");
    };

    const result = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes: base,
        snapshot: {
          enabled: false,
          logo: null,
          position: "bottom-right",
          sizePercent: 20,
          opacity: 0.8,
        },
      },
      bucket,
    );

    expect(result.width).toBe(500);
  });

  it("produces a branded final PNG and checksum", async () => {
    const base = await createBase();
    const logo = await createLogo();

    const result = await prepareBrandedGeneratedImage(
      {
        workspaceId,
        bytes: base,
        snapshot: createSnapshot(logo),
      },
      mockBucket(logo),
    );

    expect(result.sha256).toBe(sha256(result.bytes));

    expect(result.width).toBe(500);
    expect(result.height).toBe(500);

    const pixel = await sharp(result.bytes)
      .extract({
        left: 450,
        top: 450,
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    expect([...pixel]).toEqual([255, 0, 0]);
  });

  it("rejects a logo that differs from its saved checksum", async () => {
    const base = await createBase();
    const originalLogo = await createLogo();

    const differentLogo = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 4,
        background: "#0000ff",
      },
    })
      .png()
      .toBuffer();

    await expect(
      prepareBrandedGeneratedImage(
        {
          workspaceId,
          bytes: base,
          snapshot: createSnapshot(originalLogo),
        },
        mockBucket(differentLogo),
      ),
    ).rejects.toThrow("Workspace logo integrity verification failed.");
  });
});
