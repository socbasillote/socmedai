import { afterEach, expect, it, vi } from "vitest";
import { getWorkspaceLogo, getWorkspaceLogoPreview } from "@/lib/workspaceLogo";
import { drawPostLogo } from "./postLogo";
vi.mock("@/lib/workspaceLogo", () => ({ getWorkspaceLogo: vi.fn(), getWorkspaceLogoPreview: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("applies the actual enabled logo inside the final platform dimensions", async () => {
  vi.mocked(getWorkspaceLogo).mockResolvedValue({ enabled: true, logo: { storageKey: "logo", sha256: "a".repeat(64) }, position: "bottom-right", sizePercent: 20, opacity: 1 });
  vi.mocked(getWorkspaceLogoPreview).mockResolvedValue({ url: "https://example.test/logo", expiresIn: 60 });
  const close = vi.fn(), drawImage = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["logo"]) })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 400, height: 200, close })));
  const canvas = { width: 1080, height: 1350, getContext: () => ({ drawImage }) } as unknown as HTMLCanvasElement;
  await drawPostLogo(canvas, "workspace", { position: "bottom-right", variant: "primary" });
  const [, x, y, width, height] = drawImage.mock.calls[0];
  expect(x).toBeGreaterThan(0); expect(y).toBeGreaterThan(0);
  expect(x + width).toBeLessThan(canvas.width); expect(y + height).toBeLessThan(canvas.height);
  expect(close).toHaveBeenCalledOnce();
});
it("does not fetch or draw a logo when excluded", async () => {
  await drawPostLogo({} as HTMLCanvasElement, "workspace");
  expect(getWorkspaceLogo).not.toHaveBeenCalled();
});
