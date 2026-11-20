import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { supabaseAuthClient } from "../auth/supabase.js";
import * as posts from "../services/postService.js";
const input = { workspaceId: "507f1f77bcf86cd799439011", clientDraftId: "11111111-2222-4333-8444-555555555555",
  caption: "A useful post", platforms: ["facebook"], mediaIds: [], platformConnections: { facebook: "507f1f77bcf86cd799439022" }, scheduledAt: "2099-01-15T01:00:00Z" };
function authenticate() {
  vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({ data: { user: { id: "batch-owner", email: "batch@example.test" } }, error: null } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);
}
afterEach(() => vi.restoreAllMocks());
it("requires authentication before validating batch data", async () => {
  const validate = vi.spyOn(posts, "validateWorkspacePostBatch");
  expect((await request(app).post("/api/posts/validate-batch").send({ posts: [input] })).status).toBe(401);
  expect(validate).not.toHaveBeenCalled();
});
it("returns per-post validation issues without calling create", async () => {
  authenticate();
  const issues = [{ index: 1, message: "This weekday is disabled in workspace publishing preferences." }];
  const validate = vi.spyOn(posts, "validateWorkspacePostBatch").mockResolvedValue({ issues });
  const create = vi.spyOn(posts, "createWorkspacePost");
  const response = await request(app).post("/api/posts/validate-batch").set("Authorization", "Bearer test-token").send({ posts: [input, input] });
  expect(response.status).toBe(200);
  expect(response.body.issues).toEqual(issues);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(validate).toHaveBeenCalledWith(expect.objectContaining({ id: "batch-owner" }), [input, input]);
  expect(create).not.toHaveBeenCalled();
});
it("bounds batch validation and rejects malformed data", async () => {
  authenticate();
  const validate = vi.spyOn(posts, "validateWorkspacePostBatch");
  for (const body of [{ posts: [] }, { posts: Array.from({ length: 61 }, () => input) }, { posts: [{ ...input, workspaceId: "invalid" }] }]) {
    expect((await request(app).post("/api/posts/validate-batch").set("Authorization", "Bearer test-token").send(body)).status).toBe(400);
  }
  expect(validate).not.toHaveBeenCalled();
});
it("admits expired retries to the authorized service so they can be reconciled", async () => {
  authenticate();
  const expired = { ...input, scheduledAt: "2020-01-15T01:00:00Z" };
  const create = vi.spyOn(posts, "createWorkspacePost").mockResolvedValue({ _id: "already-saved", status: "published" } as unknown as Awaited<ReturnType<typeof posts.createWorkspacePost>>);
  const response = await request(app).post("/api/posts").set("Authorization", "Bearer test-token").send(expired);
  expect(response.status).toBe(201);
  expect(response.body.post._id).toBe("already-saved");
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "batch-owner" }), expired);
});
