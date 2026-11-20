import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { app } from "../app.js";
import { supabaseAuthClient } from "../auth/supabase.js";
import * as assets from "../services/mediaAssetService.js";
import * as storage from "../services/media/mediaAssetStorageService.js";
const workspaceId = "507f1f77bcf86cd799439011";
const assetId = "507f1f77bcf86cd799439022";
const path = `/api/ai/workspaces/${workspaceId}/upload-post-image`;
function authenticate() {
  vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({ data: { user: { id: "owner", email: "owner@example.com" } }, error: null } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);
}
afterEach(() => vi.restoreAllMocks());
it("requires authentication for post image uploads", async () => {
  expect((await request(app).post(path).set("Content-Type", "image/png").send(Buffer.from("image"))).status).toBe(401);
});
it("normalizes uploaded images through authorized, verified asset storage", async () => {
  authenticate();
  const create = vi.spyOn(assets, "createPendingMediaAsset").mockResolvedValue({ _id: assetId } as Awaited<ReturnType<typeof assets.createPendingMediaAsset>>);
  const complete = vi.spyOn(storage, "completePendingMediaAsset").mockResolvedValue({} as Awaited<ReturnType<typeof storage.completePendingMediaAsset>>);
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#5522aa" } }).png().toBuffer();
  const response = await request(app).post(path).set("Authorization", "Bearer test-token").set("Content-Type", "image/png").send(bytes);
  expect(response.status).toBe(201);
  expect(response.body.assetId).toBe(assetId);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "owner" }), workspaceId, expect.anything(), expect.objectContaining({ source: "uploaded" }));
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, assetId, bytes }));
});
it("rejects unreadable files before creating media", async () => {
  authenticate();
  const create = vi.spyOn(assets, "createPendingMediaAsset");
  const response = await request(app).post(path).set("Authorization", "Bearer test-token").set("Content-Type", "image/png").send(Buffer.from("not an image"));
  expect(response.status).toBe(400);
  expect(create).not.toHaveBeenCalled();
});
it("preserves workspace authorization failures", async () => {
  authenticate();
  vi.spyOn(assets, "createPendingMediaAsset").mockRejectedValue(new assets.MediaAssetServiceError("Workspace not found.", 404));
  const complete = vi.spyOn(storage, "completePendingMediaAsset");
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#5522aa" } }).png().toBuffer();
  const response = await request(app).post(path).set("Authorization", "Bearer test-token").set("Content-Type", "image/png").send(bytes);
  expect(response.status).toBe(404);
  expect(complete).not.toHaveBeenCalled();
});
