import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { applyWorkspaceLogoOverlay } from "./workspaceLogoOverlay.js";

describe("Workspace logo overlay", () => {
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

  it("applies a logo and preserves image dimensions", async () => {
    const result = await applyWorkspaceLogoOverlay(
      await createBase(),
      await createLogo(),
      {
        position: "bottom-right",
        sizePercent: 20,
        opacity: 1,
      },
    );

    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("png");
    expect(meta.width).toBe(500);
    expect(meta.height).toBe(500);
  });

  it("does not modify the original input bytes", async () => {
    const base = await createBase();
    const original = Buffer.from(base);

    await applyWorkspaceLogoOverlay(base, await createLogo(), {
      position: "top-left",
      sizePercent: 20,
      opacity: 0.8,
    });

    expect(base.equals(original)).toBe(true);
  });

  it("rejects invalid logo settings", async () => {
    await expect(
      applyWorkspaceLogoOverlay(await createBase(), await createLogo(), {
        position: "bottom-right",
        sizePercent: 90,
        opacity: 1,
      }),
    ).rejects.toThrow("Invalid logo settings.");
  });

  it("produces deterministic output", async () => {
    const base = await createBase();
    const logo = await createLogo();

    const options = {
      position: "bottom-right" as const,
      sizePercent: 20,
      opacity: 0.8,
    };

    const first = await applyWorkspaceLogoOverlay(base, logo, options);

    const second = await applyWorkspaceLogoOverlay(base, logo, options);

    expect(first.equals(second)).toBe(true);
  });

  it("changes the expected corner pixels", async () => {
    const output = await applyWorkspaceLogoOverlay(
      await createBase(),
      await createLogo(),
      {
        position: "bottom-right",
        sizePercent: 20,
        opacity: 1,
      },
    );

    const pixel = await sharp(output)
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
});
