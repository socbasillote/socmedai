import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => ({})),
  disconnect: vi.fn(async () => {}),
  command: vi.fn(async () => ({ setName: "rs0" })),
  stop: vi.fn(async () => {}),
  start: vi.fn(),
}));
vi.mock("dotenv/config", () => ({}));
vi.mock("mongoose", () => ({ default: {
  connect: mocks.connect, disconnect: mocks.disconnect,
  connection: { db: { admin: () => ({ command: mocks.command }) } },
} }));
vi.mock("../config/imageGenerationConfig.js", () => ({ getImageGenerationConfig: () => ({
  IMAGE_GENERATION_PROVIDER: "mock", IMAGE_GENERATION_LIVE_ENABLED: false,
}) }));
vi.mock("../services/imageGenerationLiveGate.js", () => ({ parseLiveImageGateConfig: vi.fn() }));
vi.mock("../services/imageGenerationWorkerProviderGate.js", () => ({ LIVE_PAID_WORKER_ARMED: true }));
vi.mock("../services/imageGenerationLiveAdmissionReadiness.js", () => ({ evaluateLiveAdmissionReadiness: () => ({ ready: false }) }));
vi.mock("./imageGenerationWorkerRunner.js", () => ({
  parseImageWorkerRunnerConfig: () => ({ changeStreamEnabled: true, intervalMs: 60_000 }),
  startImageGenerationWorker: mocks.start,
}));
const handlers: Array<{ signal: "SIGINT" | "SIGTERM"; handler: () => void }> = [];
async function load() {
  vi.resetModules();
  vi.stubEnv("IMAGE_GENERATION_WORKER_ENABLED", "true");
  vi.stubEnv("IMAGE_WORKER_MONGODB_URI", "mongodb://unused/test");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "once").mockImplementation(((signal: "SIGINT" | "SIGTERM", handler: () => void) => {
    handlers.push({ signal, handler });
    return process;
  }) as typeof process.once);
  mocks.start.mockReturnValue(mocks.stop);
  await import("./imageGenerationWorkerMain.js");
}
afterEach(() => {
  handlers.length = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = undefined;
});

it.each(["SIGINT", "SIGTERM"] as const)("%s waits for active work before disconnecting", async (signal) => {
  let finish!: () => void;
  mocks.stop.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await load();
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  handlers.find((item) => item.signal === signal)!.handler();
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  expect(mocks.disconnect).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
});

it("prevents startup after a signal during initial connection", async () => {
  let connected!: () => void;
  mocks.connect.mockImplementationOnce(() => new Promise((resolve) => { connected = () => resolve({}); }));
  await load();
  handlers.find((item) => item.signal === "SIGTERM")!.handler();
  expect(mocks.disconnect).not.toHaveBeenCalled();
  connected();
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  expect(mocks.start).not.toHaveBeenCalled();
});

it("disconnects safely after an initial database connection failure", async () => {
  mocks.connect.mockRejectedValueOnce(new Error("credentials must not be logged"));
  await load();
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("credentials");
});
