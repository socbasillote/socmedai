import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

vi.mock("./config/env.js", () => ({ env: {
  NODE_ENV: "test",
  WEB_ORIGIN: "https://socmedai-web.vercel.app/",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-key",
} }));
vi.mock("./config/database.js", () => ({ connectDatabase: vi.fn() }));
import { connectDatabase } from "./config/database.js";

let app: typeof import("./app.js").app;
beforeAll(async () => {
  vi.stubEnv("VERCEL", "1");
  app = (await import("./app.js")).default;
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
afterAll(() => vi.unstubAllEnvs());

describe("Vercel entry point", () => {
  it("exports the Express app and trusts one proxy hop", async () => {
    expect(app).toBe((await import("./app.js")).app);
    expect(app.get("trust proxy")).toBe(1);
  });
  it("connects before serving the health check", async () => {
    vi.mocked(connectDatabase).mockResolvedValue(undefined);
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(connectDatabase).toHaveBeenCalledTimes(1);
  });
  it("returns 503 when the database is unavailable", async () => {
    vi.mocked(connectDatabase).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Database temporarily unavailable" });
  });
  it("handles CORS preflight without a database connection", async () => {
    const response = await request(app).options("/api/workspaces")
      .set("Origin", "https://socmedai-web.vercel.app")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://socmedai-web.vercel.app");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toBe("authorization,content-type");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(connectDatabase).not.toHaveBeenCalled();
  });
});
