import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { SCHEDULED_PUBLISHING_ENABLED: "true" },
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  start: vi.fn(),
  stop: vi.fn(async () => {}),
}));
vi.mock("../config/env.js", () => ({ env: mocks.env }));
vi.mock("../config/database.js", () => ({
  connectDatabase: mocks.connect, disconnectDatabase: mocks.disconnect,
}));
vi.mock("../services/scheduledPostWorkerRunner.js", () => ({
  startScheduledPostWorker: mocks.start, stopScheduledPostWorker: mocks.stop,
}));
const handlers: Array<{ signal: string; handler: () => void }> = [];

async function load(mongoUri = "mongodb://unused/test") {
  vi.resetModules();
  vi.stubEnv("MONGODB_URI", mongoUri);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "once").mockImplementation(((signal: string, handler: () => void) => {
    handlers.push({ signal, handler });
    return process;
  }) as typeof process.once);
  await import("./scheduledPostWorkerMain.js");
}

afterEach(() => {
  handlers.length = 0;
  mocks.env.SCHEDULED_PUBLISHING_ENABLED = "true";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = undefined;
});

it("connects before starting the dedicated scheduler", async () => {
  await load();
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  expect(mocks.connect.mock.invocationCallOrder[0]).toBeLessThan(mocks.start.mock.invocationCallOrder[0]);
});

it.each(["SIGINT", "SIGTERM"])("%s drains dispatch before disconnecting and is idempotent", async (signal) => {
  let finish!: () => void;
  mocks.stop.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await load();
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  const handler = handlers.find((entry) => entry.signal === signal)!.handler;
  handler(); handler();
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  expect(mocks.disconnect).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
});

it("withholds runner startup if SIGTERM arrives while connecting", async () => {
  let connected!: () => void;
  mocks.connect.mockImplementationOnce(() => new Promise<void>((resolve) => { connected = resolve; }));
  await load();
  handlers.find((entry) => entry.signal === "SIGTERM")!.handler();
  connected();
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  expect(mocks.start).not.toHaveBeenCalled();
});

it("disconnects and exits nonzero on connection failure without logging credentials", async () => {
  mocks.connect.mockRejectedValueOnce(new Error("mongodb://secret:password@host/database"));
  await load();
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("password");
});

it("rejects a disabled scheduled worker before connecting", async () => {
  mocks.env.SCHEDULED_PUBLISHING_ENABLED = "false";
  await load();
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("rejects a missing MongoDB URI before connecting", async () => {
  await load("");
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("disconnects even if draining the worker fails", async () => {
  mocks.stop.mockRejectedValueOnce(new Error("stop failed"));
  await load();
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  handlers.find((entry) => entry.signal === "SIGTERM")!.handler();
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});
