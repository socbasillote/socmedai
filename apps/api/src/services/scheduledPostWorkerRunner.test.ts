import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recoverStalePublishingPosts: vi.fn(),
}));

vi.mock("./scheduledPostWorker.js", () => ({
  recoverStalePublishingPosts: mocks.recoverStalePublishingPosts,
}));

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("scheduledPostWorkerRunner", () => {
  let stopWorker: (() => Promise<void>) | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();

    mocks.recoverStalePublishingPosts.mockResolvedValue({
      acknowledged: true,
      modifiedCount: 0,
    });
  });

  afterEach(async () => {
    await stopWorker?.();
    stopWorker = undefined;
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function startWorker() {
    const runner = await import("./scheduledPostWorkerRunner.js");
    stopWorker = runner.stopScheduledPostWorker;
    runner.startScheduledPostWorker();
    await flushPromises();
  }

  it("runs recovery immediately when started", async () => {
    await startWorker();

    expect(mocks.recoverStalePublishingPosts).toHaveBeenCalledTimes(1);
  });

  it("continues recovery on the polling interval", async () => {
    await startWorker();

    expect(mocks.recoverStalePublishingPosts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.recoverStalePublishingPosts).toHaveBeenCalledTimes(2);
  });

  it("does not continue polling after shutdown", async () => {
    await startWorker();

    expect(mocks.recoverStalePublishingPosts).toHaveBeenCalledTimes(1);

    await stopWorker?.();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(mocks.recoverStalePublishingPosts).toHaveBeenCalledTimes(1);
  });

  it("handles recovery failures and continues polling", async () => {
    const error = new Error("Temporary database failure");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.recoverStalePublishingPosts.mockRejectedValueOnce(error);

    try {
      await startWorker();

      expect(consoleError).toHaveBeenCalledWith(
        "[scheduled-post-worker] Recovery poll failed:",
        error,
      );

      await vi.advanceTimersByTimeAsync(5_000);

      expect(mocks.recoverStalePublishingPosts).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });
});
