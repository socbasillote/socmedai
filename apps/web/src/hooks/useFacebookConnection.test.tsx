import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@testing-library/react";

import { useFacebookConnection } from "./useFacebookConnection";

import { startFacebookConnect } from "@/lib/facebookApi";

import {
  readFacebookOAuthWorkspaceId,
  clearFacebookOAuthWorkspaceId,
} from "@/lib/facebookOAuthWorkspace";

/**
 * Mock Facebook OAuth initiation.
 *
 * No real HTTP requests or Facebook redirects
 * will occur during these tests.
 */
vi.mock("@/lib/facebookApi", () => ({
  startFacebookConnect: vi.fn(),
}));

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

/**
 * Create a request that never resolves.
 *
 * This allows us to inspect the OAuth initiation
 * state without redirecting the test browser.
 */
function pendingAuthorization(): Promise<string> {
  return new Promise<string>(() => {});
}

describe("useFacebookConnection", () => {
  beforeEach(() => {
    vi.mocked(startFacebookConnect).mockReset();
    clearFacebookOAuthWorkspaceId();
  });

  afterEach(() => {
    clearFacebookOAuthWorkspaceId();
  });

  /**
   * Test 1:
   * Facebook OAuth cannot begin without a workspace.
   */
  it("prevents OAuth initiation without a workspace", async () => {
    const { result } = renderHook(() => useFacebookConnection(""));

    await act(async () => {
      await result.current.connect();
    });

    expect(startFacebookConnect).not.toHaveBeenCalled();

    expect(result.current.connectError).toBe(
      "Select a workspace before connecting Facebook.",
    );

    expect(result.current.connecting).toBe(false);

    expect(readFacebookOAuthWorkspaceId()).toBeNull();
  });

  /**
   * Test 2:
   * The initiating workspace is saved before the API
   * request begins.
   */
  it("stores the initiating workspace before requesting authorization", () => {
    vi.mocked(startFacebookConnect).mockImplementation((workspaceId) => {
      expect(workspaceId).toBe(WORKSPACE_A);

      expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);

      return pendingAuthorization();
    });

    const { result } = renderHook(() => useFacebookConnection(WORKSPACE_A));

    act(() => {
      void result.current.connect();
    });

    expect(startFacebookConnect).toHaveBeenCalledWith(WORKSPACE_A);

    expect(result.current.connecting).toBe(true);

    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);
  });

  /**
   * Test 3:
   * Multiple rapid connection attempts must not
   * generate duplicate OAuth initiation requests.
   */
  it("prevents duplicate OAuth initiation requests", () => {
    vi.mocked(startFacebookConnect).mockReturnValue(pendingAuthorization());

    const { result } = renderHook(() => useFacebookConnection(WORKSPACE_A));

    act(() => {
      void result.current.connect();
      void result.current.connect();
      void result.current.connect();
    });

    expect(startFacebookConnect).toHaveBeenCalledTimes(1);

    expect(result.current.connecting).toBe(true);

    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);
  });

  /**
   * Test 4:
   * Failed OAuth initiation must clear the temporary
   * workspace reference.
   */
  it("clears the stored workspace when OAuth initiation fails", async () => {
    vi.mocked(startFacebookConnect).mockRejectedValue(
      new Error("Unable to start Facebook connection."),
    );

    const { result } = renderHook(() => useFacebookConnection(WORKSPACE_A));

    await act(async () => {
      await result.current.connect();
    });

    expect(startFacebookConnect).toHaveBeenCalledWith(WORKSPACE_A);

    expect(result.current.connectError).toBe(
      "Unable to start Facebook connection.",
    );

    expect(result.current.connecting).toBe(false);

    expect(readFacebookOAuthWorkspaceId()).toBeNull();
  });

  /**
   * Test 5:
   * Switching workspaces while OAuth initiation is
   * pending must not overwrite the initiating workspace.
   */
  it("preserves the original workspace when the selection changes", () => {
    vi.mocked(startFacebookConnect).mockReturnValue(pendingAuthorization());

    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string }) =>
        useFacebookConnection(workspaceId),
      {
        initialProps: {
          workspaceId: WORKSPACE_A,
        },
      },
    );

    act(() => {
      void result.current.connect();
    });

    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);

    // Simulate switching the selected workspace.
    rerender({
      workspaceId: WORKSPACE_B,
    });

    // The original OAuth workspace must remain unchanged.
    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);

    expect(startFacebookConnect).toHaveBeenCalledWith(WORKSPACE_A);

    expect(startFacebookConnect).toHaveBeenCalledTimes(1);
  });
});
