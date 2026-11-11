import { describe, expect, it } from "vitest";
import sharp from "sharp";

import type { ImageStorageBucket } from "./supabaseImageStorage.js";

import {
  uploadWorkspaceLogo,
  downloadVerifiedWorkspaceLogo,
  normalizeWorkspaceLogo,
} from "./workspaceLogoStorage.js";

const workspaceId = "6aeba54a3fe7bf29e916b3f1";
const otherWorkspaceId = "6af27c92174f7f0f7959491c";

function createMemoryBucket() {
  const objects = new Map<string, Buffer>();

  const bucket: ImageStorageBucket = {
    async upload(path, body, options) {
      if (options.upsert !== false || objects.has(path)) {
        return { error: { message: "Object exists." } };
      }

      objects.set(path, Buffer.from(body));

      return { error: null };
    },

    async download(path) {
      const bytes = objects.get(path);

      if (!bytes) {
        return {
          data: null,
          error: { message: "Not found." },
        };
      }

      return {
        data: new Blob([Uint8Array.from(bytes)]),
        error: null,
      };
    },

    async remove(paths) {
      for (const path of paths) {
        objects.delete(path);
      }

      return { error: null };
    },
  };

  return { bucket, objects };
}

async function createLogo() {
  return sharp({
    create: {
      width: 120,
      height: 60,
      channels: 4,
      background: {
        r: 255,
        g: 0,
        b: 0,
        alpha: 0.7,
      },
    },
  })
    .webp()
    .toBuffer();
}

describe("Private workspace logo storage", () => {
  it("normalizes uploaded logos to PNG", async () => {
    const normalized = await normalizeWorkspaceLogo(await createLogo());

    const metadata = await sharp(normalized).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(120);
    expect(metadata.height).toBe(60);
  });

  it("uploads and verifies a private workspace logo", async () => {
    const { bucket, objects } = createMemoryBucket();

    const stored = await uploadWorkspaceLogo(
      {
        workspaceId,
        bytes: await createLogo(),
      },
      bucket,
    );

    expect(stored.storageKey).toMatch(
      new RegExp(`^workspaces/${workspaceId}/logos/[a-f0-9]{24}\\.png$`),
    );

    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(objects.has(stored.storageKey)).toBe(true);

    const downloaded = await downloadVerifiedWorkspaceLogo(
      { workspaceId, ...stored },
      bucket,
    );

    expect(await sharp(downloaded).metadata()).toMatchObject({
      format: "png",
      width: 120,
      height: 60,
    });
  });

  it("creates unique immutable logo versions", async () => {
    const { bucket } = createMemoryBucket();
    const bytes = await createLogo();

    const first = await uploadWorkspaceLogo({ workspaceId, bytes }, bucket);

    const second = await uploadWorkspaceLogo({ workspaceId, bytes }, bucket);

    expect(first.storageKey).not.toBe(second.storageKey);
    expect(first.sha256).toBe(second.sha256);
  });

  it("rejects cross-workspace logo access", async () => {
    const { bucket } = createMemoryBucket();

    const stored = await uploadWorkspaceLogo(
      { workspaceId, bytes: await createLogo() },
      bucket,
    );

    await expect(
      downloadVerifiedWorkspaceLogo(
        {
          workspaceId: otherWorkspaceId,
          ...stored,
        },
        bucket,
      ),
    ).rejects.toThrow("Invalid workspace logo storage key.");
  });

  it("rejects tampered stored logo bytes", async () => {
    const { bucket, objects } = createMemoryBucket();

    const stored = await uploadWorkspaceLogo(
      { workspaceId, bytes: await createLogo() },
      bucket,
    );

    objects.set(stored.storageKey, Buffer.from("tampered"));

    await expect(
      downloadVerifiedWorkspaceLogo({ workspaceId, ...stored }, bucket),
    ).rejects.toThrow("Workspace logo integrity verification failed.");
  });

  it("rejects oversized logo inputs", async () => {
    await expect(
      normalizeWorkspaceLogo(Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).rejects.toThrow("Logo must be between 1 byte and 5 MB.");
  });

  it("preserves an uploaded object after ambiguous verification failure", async () => {
    const { bucket, objects } = createMemoryBucket();

    const originalDownload = bucket.download;

    bucket.download = async () => ({
      data: null,
      error: { message: "Temporary read failure." },
    });

    await expect(
      uploadWorkspaceLogo({ workspaceId, bytes: await createLogo() }, bucket),
    ).rejects.toThrow("requires review");

    expect(objects.size).toBe(1);

    bucket.download = originalDownload;
  });
});
