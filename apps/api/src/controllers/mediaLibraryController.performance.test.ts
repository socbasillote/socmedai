import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), sign: vi.fn() }));
vi.mock("../services/media/mediaLibraryService.js", () => ({ listAuthorizedMediaLibrary: mocks.list, getAuthorizedMediaLibraryItem: vi.fn(), MediaLibraryError: class extends Error {} }));
vi.mock("../services/media/mediaLibraryPreviews.js", () => ({ signAuthorizedLibraryPreviews: mocks.sign }));
import { getMediaLibraryController } from "./mediaLibraryController.js";
const app = express();
app.get("/library", (_req, res, next) => { res.locals.authUser = { id: "owner" }; next(); }, getMediaLibraryController);
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue({ images: [{ assetId: "asset", sourceWorkspaceId: "workspace" }] }); mocks.sign.mockResolvedValue([{ assetId: "asset", previewUrl: "signed" }]); });
it("signs only the authorized library result in a single call", async () => {
  const response = await request(app).get("/library?workspaceId=workspace&includePreviews=true");
  expect(response.status).toBe(200);
  expect(mocks.sign).toHaveBeenCalledExactlyOnceWith([{ assetId: "asset", sourceWorkspaceId: "workspace" }]);
  expect(response.body.images[0].previewUrl).toBe("signed");
  expect(response.headers["cache-control"]).toBe("private, no-store");
});
it("never signs when library authorization fails", async () => {
  mocks.list.mockRejectedValue(new Error("denied"));
  expect((await request(app).get("/library?workspaceId=workspace&includePreviews=true")).status).toBe(500);
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("keeps previews opt-in and rejects malformed flags", async () => {
  expect((await request(app).get("/library?workspaceId=workspace")).status).toBe(200);
  expect(mocks.sign).not.toHaveBeenCalled();
  expect((await request(app).get("/library?workspaceId=workspace&includePreviews=false")).status).toBe(400);
});
