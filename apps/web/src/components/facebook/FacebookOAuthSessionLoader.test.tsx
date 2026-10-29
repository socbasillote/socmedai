import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import FacebookOAuthSessionLoader from "./FacebookOAuthSessionLoader";

import {
  getFacebookOAuthSession,
  connectSelectedFacebookPages,
  type FacebookOAuthSession,
} from "../../lib/facebookApi";

/**
 * Mock the Facebook API client.
 *
 * These tests never make real HTTP requests
 * or initiate Facebook OAuth.
 */
vi.mock("../../lib/facebookApi", () => ({
  getFacebookOAuthSession: vi.fn(),
  connectSelectedFacebookPages: vi.fn(),
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const OTHER_WORKSPACE_ID = "507f1f77bcf86cd799439012";

/**
 * Create a valid OAuth session for testing.
 */
function createMockSession(
  overrides: Partial<FacebookOAuthSession> = {},
): FacebookOAuthSession {
  return {
    workspaceId: WORKSPACE_ID,

    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),

    pages: [
      {
        facebookPageId: "123456789",
        pageName: "Storm Demo Business",
        tasks: ["CREATE_CONTENT", "MANAGE"],
      },
      {
        facebookPageId: "987654321",
        pageName: "Storm Community",
        tasks: ["CREATE_CONTENT"],
      },
    ],

    ...overrides,
  };
}

describe("FacebookOAuthSessionLoader", () => {
  beforeEach(() => {
    vi.mocked(getFacebookOAuthSession).mockReset();

    vi.mocked(connectSelectedFacebookPages).mockReset();
  });

  /**
   * Test 1:
   * The loader displays its loading UI while
   * the session request is pending.
   */
  it("displays a loading state while fetching the OAuth session", () => {
    vi.mocked(getFacebookOAuthSession).mockReturnValue(
      new Promise<FacebookOAuthSession>(() => {
        // Keep the request pending for this test.
      }),
    );

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    expect(screen.getByText("Loading Facebook Pages")).toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  /**
   * Test 2:
   * A valid session displays the discovered
   * Facebook Pages.
   */
  it("displays Facebook Pages after successful session retrieval", async () => {
    vi.mocked(getFacebookOAuthSession).mockResolvedValue(createMockSession());

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    expect(
      await screen.findByText("Select Facebook Pages"),
    ).toBeInTheDocument();

    expect(screen.getByText("Storm Demo Business")).toBeInTheDocument();

    expect(screen.getByText("Storm Community")).toBeInTheDocument();

    expect(getFacebookOAuthSession).toHaveBeenCalledWith(WORKSPACE_ID);

    expect(getFacebookOAuthSession).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 3:
   * The loader rejects OAuth sessions belonging
   * to another workspace.
   */
  it("rejects an OAuth session for a different workspace", async () => {
    vi.mocked(getFacebookOAuthSession).mockResolvedValue(
      createMockSession({
        workspaceId: OTHER_WORKSPACE_ID,
      }),
    );

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("does not belong to this workspace");

    expect(screen.queryByText("Select Facebook Pages")).not.toBeInTheDocument();
  });

  /**
   * Test 4:
   * The loader rejects expired OAuth sessions.
   */
  it("rejects an expired Facebook OAuth session", async () => {
    vi.mocked(getFacebookOAuthSession).mockResolvedValue(
      createMockSession({
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
    );

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("authorization session has expired");

    expect(screen.queryByText("Select Facebook Pages")).not.toBeInTheDocument();
  });

  it("displays an error when retrieving the OAuth session fails", async () => {
    vi.mocked(getFacebookOAuthSession).mockRejectedValue(
      new Error("Unable to retrieve Facebook OAuth session."),
    );

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent(
      "Unable to retrieve Facebook OAuth session.",
    );

    expect(
      screen.getByRole("button", {
        name: "Try Again",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByText("Select Facebook Pages")).not.toBeInTheDocument();
  });

  it("retries retrieving the OAuth session after a failure", async () => {
    vi.mocked(getFacebookOAuthSession)
      .mockRejectedValueOnce(new Error("Temporary network error."))
      .mockResolvedValueOnce(createMockSession());

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("Temporary network error.");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Try Again",
      }),
    );

    expect(
      await screen.findByText("Select Facebook Pages"),
    ).toBeInTheDocument();

    expect(screen.getByText("Storm Demo Business")).toBeInTheDocument();

    expect(getFacebookOAuthSession).toHaveBeenCalledTimes(2);

    expect(getFacebookOAuthSession).toHaveBeenNthCalledWith(1, WORKSPACE_ID);

    expect(getFacebookOAuthSession).toHaveBeenNthCalledWith(2, WORKSPACE_ID);
  });

  it("rejects a session with an invalid expiration timestamp", async () => {
    vi.mocked(getFacebookOAuthSession).mockResolvedValue(
      createMockSession({
        expiresAt: "invalid-date",
      }),
    );

    render(<FacebookOAuthSessionLoader workspaceId={WORKSPACE_ID} />);

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("authorization session has expired");

    expect(screen.queryByText("Select Facebook Pages")).not.toBeInTheDocument();
  });

  it("calls onConnected after successfully connecting selected Pages", async () => {
    const onConnected = vi.fn();

    const connectedPages = [
      {
        facebookPageId: "123456789",
        pageName: "Storm Demo Business",
        status: "connected" as const,
      },
    ];

    vi.mocked(getFacebookOAuthSession).mockResolvedValue(createMockSession());

    vi.mocked(connectSelectedFacebookPages).mockResolvedValue({
      connections: connectedPages,
    });

    render(
      <FacebookOAuthSessionLoader
        workspaceId={WORKSPACE_ID}
        onConnected={onConnected}
      />,
    );

    // Wait until Page selection becomes available.
    expect(
      await screen.findByText("Select Facebook Pages"),
    ).toBeInTheDocument();

    // Select the first Facebook Page.
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Storm Demo Business/,
      }),
    );

    // Submit the selected Page.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Connect 1 Page",
      }),
    );

    // Verify the API receives the intended workspace and Page.
    await waitFor(() => {
      expect(connectSelectedFacebookPages).toHaveBeenCalledWith(WORKSPACE_ID, [
        "123456789",
      ]);
    });

    // Verify the loader forwards the successful connection.
    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith(connectedPages);
    });

    expect(onConnected).toHaveBeenCalledTimes(1);
  });
});
