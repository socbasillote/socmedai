import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook, waitFor } from "@testing-library/react";

import { useFacebookConnections } from "./useFacebookConnections";

import {
  getFacebookConnections,
  type FacebookConnectionsResponse,
} from "@/lib/facebookApi";

/**
 * Mock the API client.
 *
 * These tests never send real HTTP requests.
 */
vi.mock("@/lib/facebookApi", () => ({
  getFacebookConnections: vi.fn(),
}));

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

const CONNECTION_A = {
  id: "507f1f77bcf86cd799439013",
  facebookPageId: "123456789",
  pageName: "Storm Business",
  status: "connected" as const,
};

const CONNECTION_B = {
  id: "507f1f77bcf86cd799439014",
  facebookPageId: "987654321",
  pageName: "Storm Community",
  status: "expired" as const,
};

describe("useFacebookConnections", () => {
  beforeEach(() => {
    vi.mocked(getFacebookConnections).mockReset();
  });

  /**
   * Test 1:
   * Load Facebook connections for the selected workspace.
   */
  it("loads connected Facebook Pages", async () => {
    vi.mocked(getFacebookConnections).mockResolvedValue({
      connections: [CONNECTION_A],
    });

    const { result } = renderHook(() => useFacebookConnections(WORKSPACE_A));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.connections).toEqual([CONNECTION_A]);

    expect(result.current.error).toBe("");

    expect(getFacebookConnections).toHaveBeenCalledWith(WORKSPACE_A);

    expect(getFacebookConnections).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 2:
   * A workspace without connections returns an empty array.
   */
  it("handles a workspace with no Facebook connections", async () => {
    vi.mocked(getFacebookConnections).mockResolvedValue({
      connections: [],
    });

    const { result } = renderHook(() => useFacebookConnections(WORKSPACE_A));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.connections).toEqual([]);
    expect(result.current.error).toBe("");
  });

  /**
   * Test 3:
   * API failures are exposed to the UI.
   */
  it("handles Facebook connection loading errors", async () => {
    vi.mocked(getFacebookConnections).mockRejectedValue(
      new Error("Unable to retrieve Facebook connections."),
    );

    const { result } = renderHook(() => useFacebookConnections(WORKSPACE_A));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.connections).toEqual([]);

    expect(result.current.error).toBe(
      "Unable to retrieve Facebook connections.",
    );
  });

  /**
   * Test 4:
   * Manual refresh retrieves the latest connections.
   */
  it("refreshes Facebook connections on demand", async () => {
    vi.mocked(getFacebookConnections)
      .mockResolvedValueOnce({
        connections: [CONNECTION_A],
      })
      .mockResolvedValueOnce({
        connections: [CONNECTION_A, CONNECTION_B],
      });

    const { result } = renderHook(() => useFacebookConnections(WORKSPACE_A));

    await waitFor(() => {
      expect(result.current.connections).toEqual([CONNECTION_A]);
    });

    act(() => {
      result.current.refreshConnections();
    });

    await waitFor(() => {
      expect(result.current.connections).toEqual([CONNECTION_A, CONNECTION_B]);
    });

    expect(getFacebookConnections).toHaveBeenCalledTimes(2);

    expect(getFacebookConnections).toHaveBeenNthCalledWith(1, WORKSPACE_A);

    expect(getFacebookConnections).toHaveBeenNthCalledWith(2, WORKSPACE_A);
  });

  /**
   * Test 5:
   * Requests from a previously selected workspace
   * must not overwrite the new workspace's connections.
   */
  it("ignores stale requests after switching workspaces", async () => {
    let resolveWorkspaceA!: (value: FacebookConnectionsResponse) => void;

    const pendingWorkspaceA = new Promise<FacebookConnectionsResponse>(
      (resolve) => {
        resolveWorkspaceA = resolve;
      },
    );

    vi.mocked(getFacebookConnections).mockImplementation((workspaceId) => {
      if (workspaceId === WORKSPACE_A) {
        return pendingWorkspaceA;
      }

      return Promise.resolve({
        connections: [CONNECTION_B],
      });
    });

    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string }) =>
        useFacebookConnections(workspaceId),
      {
        initialProps: {
          workspaceId: WORKSPACE_A,
        },
      },
    );

    expect(result.current.loading).toBe(true);

    // Switch to Workspace B while A is still pending.
    rerender({
      workspaceId: WORKSPACE_B,
    });

    await waitFor(() => {
      expect(result.current.connections).toEqual([CONNECTION_B]);
    });

    expect(result.current.loading).toBe(false);

    // Workspace A now responds after B has loaded.
    await act(async () => {
      resolveWorkspaceA({
        connections: [CONNECTION_A],
      });

      await pendingWorkspaceA;
    });

    // The stale response must not replace B's data.
    expect(result.current.connections).toEqual([CONNECTION_B]);

    expect(result.current.error).toBe("");

    expect(getFacebookConnections).toHaveBeenCalledWith(WORKSPACE_A);

    expect(getFacebookConnections).toHaveBeenCalledWith(WORKSPACE_B);
  });

  /**
   * Test 6:
   * No workspace means no API request.
   */
  it("does not request connections without a workspace", () => {
    const { result } = renderHook(() => useFacebookConnections(""));

    expect(result.current.connections).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("");

    expect(getFacebookConnections).not.toHaveBeenCalled();
  });
});
