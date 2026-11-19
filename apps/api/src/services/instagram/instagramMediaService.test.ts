import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), sign: vi.fn(), remove: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.sign, remove: mocks.remove }) } }) }));
vi.mock("../../config/env.js", () => ({ env: { SUPABASE_URL: "https://storage.example", SUPABASE_SERVICE_ROLE_KEY: "server-only" } }));
import { prepareInstagramMedia } from "./instagramMediaService.js";
beforeEach(() => { vi.resetAllMocks(); mocks.upload.mockResolvedValue({ error: null }); mocks.sign.mockResolvedValue({ error: null, data: { signedUrl: "https://storage.example/signed.jpg" } }); mocks.remove.mockResolvedValue({ error: null }); });
it("shares only a bounded JPEG copy through an expiring URL and deletes it", async () => {
 const source = await sharp({ create: { width: 200, height: 100, channels: 3, background: "red" } }).png().toBuffer();
 const media = await prepareInstagramMedia(source);
 const [key, bytes, options] = mocks.upload.mock.calls[0];
 expect(key).toMatch(/^publishing\/instagram\/.*\.jpg$/);
 expect(options.contentType).toBe("image/jpeg");
 expect(await sharp(bytes).metadata()).toMatchObject({ format: "jpeg", width: 1080, height: 1080 });
 expect(mocks.sign).toHaveBeenCalledWith(key, 600);
 await media.cleanup(); expect(mocks.remove).toHaveBeenCalledWith([key]);
});
it("cleans up a copy when signing fails", async () => {
 mocks.sign.mockResolvedValue({ error: { message: "failed" } });
 const source = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
 await expect(prepareInstagramMedia(source)).rejects.toThrow("URL is unavailable");
 expect(mocks.remove).toHaveBeenCalledOnce();
});
