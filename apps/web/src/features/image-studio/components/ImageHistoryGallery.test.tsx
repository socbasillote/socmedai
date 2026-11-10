/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ImageGenerationDetails,
  ImageHistoryItem,
  ImageHistoryPage,
} from "@/lib/imageGeneration";

import {
  getWorkspaceImageHistory,
  getWorkspaceImageStatus,
  getWorkspaceImageUrl,
  generateWorkspaceImage,
} from "@/lib/imageGeneration";

import { ImageHistoryGallery } from "./ImageHistoryGallery";

vi.mock("@/lib/imageGeneration", () => ({
  getWorkspaceImageHistory: vi.fn(),
  getWorkspaceImageStatus: vi.fn(),
  getWorkspaceImageUrl: vi.fn(),
  generateWorkspaceImage: vi.fn(),
}));

const WORKSPACE_A = "507f1f77bcf86cd799439011";

const WORKSPACE_B = "507f1f77bcf86cd799439012";

function assetId(index: number): string {
  return index.toString(16).padStart(24, "0");
}

function historyItem(
  index: number,
  state: ImageHistoryItem["state"] = "processing",
): ImageHistoryItem {
  const status: ImageHistoryItem["status"] =
    state === "ready" ? "ready" : state === "failed" ? "failed" : "pending";

  return {
    assetId: assetId(index),
    status,
    state,
    createdAt: "2026-11-09T01:00:00.000Z",
    updatedAt: "2026-11-09T01:00:00.000Z",
    aspectRatio: "square",

    ...(state === "ready"
      ? {
          image: {
            width: 1024,
            height: 1024,
            mimeType: "image/png" as const,
          },
        }
      : {}),
  };
}

function page(
  images: ImageHistoryItem[],
  nextCursor: string | null = null,
): ImageHistoryPage {
  return {
    images,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

function details(
  item: ImageHistoryItem,
  state: ImageGenerationDetails["state"],
): ImageGenerationDetails {
  return {
    assetId: item.assetId,
    status:
      state === "ready" ? "ready" : state === "failed" ? "failed" : "pending",
    state,
    createdAt: item.createdAt,
    updatedAt: "2026-11-09T01:01:00.000Z",

    ...(state === "ready"
      ? {
          image: {
            width: 1024,
            height: 1024,
            mimeType: "image/png" as const,
          },
        }
      : {}),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getWorkspaceImageHistory).mockResolvedValue(page([]));

  vi.mocked(getWorkspaceImageStatus).mockImplementation(async () => {
    throw new Error("Unexpected image status request.");
  });

  vi.mocked(getWorkspaceImageUrl).mockResolvedValue({
    assetId: assetId(1),
    url: "https://example.test/private-preview.png",
    expiresIn: 60,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Image Studio history and reload recovery", () => {
  it("restores a pending job using history after mounting", async () => {
    const pending = historyItem(1);

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([pending]));

    vi.mocked(getWorkspaceImageStatus).mockResolvedValueOnce(
      details(pending, "processing"),
    );

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledWith(
        WORKSPACE_A,
        pending.assetId,
      );
    });

    expect(screen.getByText("Generation in progress.")).toBeTruthy();

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("updates a restored pending job to ready", async () => {
    const pending = historyItem(1);

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([pending]));

    vi.mocked(getWorkspaceImageStatus).mockResolvedValueOnce(
      details(pending, "ready"),
    );

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    const openButton = await screen.findByRole("button", {
      name: `Open image ${pending.assetId}`,
    });

    expect(openButton).toBeTruthy();

    expect(generateWorkspaceImage).not.toHaveBeenCalled();

    // A ready status doesn't automatically
    // request private storage access.
    expect(getWorkspaceImageUrl).not.toHaveBeenCalled();
  });

  it("stops treating review-required jobs as processing", async () => {
    const pending = historyItem(2);

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([pending]));

    vi.mocked(getWorkspaceImageStatus).mockResolvedValueOnce(
      details(pending, "action_required"),
    );

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    await screen.findByText("Needs review");

    expect(
      screen.queryByRole("button", {
        name: `Open image ${pending.assetId}`,
      }),
    ).toBeNull();
  });

  it("checks at most three pending jobs immediately", async () => {
    const pending = Array.from({ length: 8 }, (_, index) =>
      historyItem(index + 1),
    );

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page(pending));

    vi.mocked(getWorkspaceImageStatus).mockImplementation(
      async (_workspaceId, id) => {
        const matched = pending.find((item) => item.assetId === id);

        if (!matched) {
          throw new Error("Unknown asset.");
        }

        return details(matched, "processing");
      },
    );

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(3);
    });

    expect(
      new Set(vi.mocked(getWorkspaceImageStatus).mock.calls.map(([, id]) => id))
        .size,
    ).toBe(3);

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("discards a late status response after changing workspaces", async () => {
    const pendingA = historyItem(1);
    const readyB = historyItem(2, "ready");

    const delayedStatus = deferred<ImageGenerationDetails>();

    vi.mocked(getWorkspaceImageHistory).mockImplementation(async (workspace) =>
      workspace === WORKSPACE_A ? page([pendingA]) : page([readyB]),
    );

    vi.mocked(getWorkspaceImageStatus).mockReturnValueOnce(
      delayedStatus.promise,
    );

    const view = render(
      <ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />,
    );

    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledWith(
        WORKSPACE_A,
        pendingA.assetId,
      );
    });

    view.rerender(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_B} />);

    await screen.findByRole("button", {
      name: `Open image ${readyB.assetId}`,
    });

    await act(async () => {
      delayedStatus.resolve(details(pendingA, "ready"));

      await delayedStatus.promise;
    });

    expect(
      screen.queryByRole("button", {
        name: `Open image ${pendingA.assetId}`,
      }),
    ).toBeNull();

    expect(
      screen.getByRole("button", {
        name: `Open image ${readyB.assetId}`,
      }),
    ).toBeTruthy();
  });

  it("loads private previews only on demand and renews access", async () => {
    const ready = historyItem(1, "ready");

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([ready]));

    vi.mocked(getWorkspaceImageUrl)
      .mockResolvedValueOnce({
        assetId: ready.assetId,
        url: "https://example.test/image-first.png",
        expiresIn: 60,
      })
      .mockResolvedValueOnce({
        assetId: ready.assetId,
        url: "https://example.test/image-renewed.png",
        expiresIn: 60,
      });

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    const open = await screen.findByRole("button", {
      name: `Open image ${ready.assetId}`,
    });

    expect(getWorkspaceImageUrl).not.toHaveBeenCalled();

    fireEvent.click(open);

    const dialog = await screen.findByRole("dialog", {
      name: "Generated image preview",
    });

    await waitFor(() => {
      expect(within(dialog).getByRole("img").getAttribute("src")).toBe(
        "https://example.test/image-first.png",
      );
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Refresh private URL" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByRole("img").getAttribute("src")).toBe(
        "https://example.test/image-renewed.png",
      );
    });

    expect(getWorkspaceImageUrl).toHaveBeenCalledTimes(2);

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("clears a private preview after closing it", async () => {
    const ready = historyItem(1, "ready");

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([ready]));

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Open image ${ready.assetId}`,
      }),
    );

    const dialog = await screen.findByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close preview" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("appends an older history page without duplicate cards", async () => {
    const newest = historyItem(1, "ready");
    const older = historyItem(2, "failed");

    vi.mocked(getWorkspaceImageHistory)
      .mockResolvedValueOnce(page([newest], "next_page_cursor"))
      .mockResolvedValueOnce(page([newest, older]));

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    await screen.findByText("Failed");

    expect(screen.getAllByRole("article")).toHaveLength(2);

    expect(getWorkspaceImageHistory).toHaveBeenNthCalledWith(2, WORKSPACE_A, {
      limit: 12,
      cursor: "next_page_cursor",
    });

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("keeps a pending card when a status request fails", async () => {
    const pending = historyItem(3);

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([pending]));

    vi.mocked(getWorkspaceImageStatus).mockRejectedValueOnce(
      new Error("Temporary network failure"),
    );

    render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

    await waitFor(() => {
      expect(getWorkspaceImageStatus).toHaveBeenCalledOnce();
    });

    expect(screen.getByText("Generation in progress.")).toBeTruthy();

    expect(generateWorkspaceImage).not.toHaveBeenCalled();
  });

  it("polls again after eight seconds without creating a job", async () => {
    const pending = historyItem(4);

    vi.mocked(getWorkspaceImageHistory).mockResolvedValueOnce(page([pending]));

    vi.mocked(getWorkspaceImageStatus).mockResolvedValue(
      details(pending, "processing"),
    );

    vi.useFakeTimers();

    try {
      render(<ImageHistoryGallery selectedWorkspaceId={WORKSPACE_A} />);

      // Flush the initial history load and
      // the first read-only status request.
      await act(async () => {
        for (let index = 0; index < 5; index++) {
          await Promise.resolve();
        }
      });

      expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(7999);
      });

      expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(getWorkspaceImageStatus).toHaveBeenCalledTimes(2);

      expect(generateWorkspaceImage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
