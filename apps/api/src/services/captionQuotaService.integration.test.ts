import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { withCaptionQuota, CaptionQuotaError } from "./captionQuotaService.js";
let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongo.getUri());
}, 70_000);
beforeEach(async () => { await mongoose.model("CaptionQuota").deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
it("enforces concurrency atomically and releases slots on failure", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const running = [0, 1].map(() => withCaptionQuota("user", async () => { started++; await gate; }));
  try {
    while (started < 2) await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(withCaptionQuota("user", async () => "forbidden")).rejects.toBeInstanceOf(CaptionQuotaError);
  } finally { release(); await Promise.all(running); }
  await expect(withCaptionQuota("user", async () => { throw new Error("provider"); })).rejects.toThrow("provider");
  await expect(withCaptionQuota("user", async () => "ok")).resolves.toBe("ok");
});
it("rejects exhausted budgets before calling the provider and isolates users", async () => {
  const model = mongoose.model("CaptionQuota");
  await model.create({ _id: "user", day: new Date().toISOString().slice(0, 10), attempts: 100, leases: [] });
  await expect(withCaptionQuota("user", async () => { throw new Error("must not run"); })).rejects.toBeInstanceOf(CaptionQuotaError);
  await expect(withCaptionQuota("other", async () => "ok")).resolves.toBe("ok");
});
it("resets daily budgets and recovers expired leases", async () => {
  await mongoose.model("CaptionQuota").create({ _id: "user", day: "2000-01-01", attempts: 100,
    leases: [{ id: "old", expiresAt: new Date(0) }, { id: "old2", expiresAt: new Date(0) }] });
  await expect(withCaptionQuota("user", async () => "ok")).resolves.toBe("ok");
});

it("cannot overspend the final daily attempt with simultaneous requests", async () => {
  await mongoose.model("CaptionQuota").create({ _id: "user", day: new Date().toISOString().slice(0, 10), attempts: 99, leases: [] });
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => withCaptionQuota("user", async () => "ok")));
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
});
