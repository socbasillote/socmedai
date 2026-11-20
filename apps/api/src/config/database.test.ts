import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./env.js", () => ({ env: { MONGODB_URI: "mongodb://unused/test" } }));
vi.mock("mongoose", () => ({
  default: {
    set: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connection: { get readyState() { return 0; } },
  },
}));

import mongoose from "mongoose";
import { connectDatabase } from "./database.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("serverless database connections", () => {
  it("shares an in-flight connection between concurrent requests", async () => {
    let resolve!: (value: typeof mongoose) => void;
    vi.mocked(mongoose.connect).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const first = connectDatabase();
    const second = connectDatabase();
    expect(first).toBe(second);
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    resolve(mongoose);
    await Promise.all([first, second]);
  });

  it("reuses an already connected instance", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    await connectDatabase();
    expect(mongoose.connect).not.toHaveBeenCalled();
  });

  it("allows the next request to retry after a connection failure", async () => {
    vi.mocked(mongoose.connect).mockRejectedValueOnce(new Error("offline"));
    await expect(connectDatabase()).rejects.toThrow("offline");
    vi.mocked(mongoose.connect).mockResolvedValueOnce(mongoose);
    await expect(connectDatabase()).resolves.toBeUndefined();
    expect(mongoose.connect).toHaveBeenCalledTimes(2);
  });
});
