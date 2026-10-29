import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import FacebookPageSelector from "./FacebookPageSelector";

import {
  connectSelectedFacebookPages,
  type FacebookOAuthPage,
  type FacebookPageConnection,
} from "../../lib/facebookApi";

/**
 * Prevent tests from making real Facebook API requests.
 */
vi.mock("../../lib/facebookApi", () => ({
  connectSelectedFacebookPages: vi.fn(),
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const PAGES: FacebookOAuthPage[] = [
  {
    facebookPageId: "111111111",
    pageName: "Storm Business",
    tasks: ["CREATE_CONTENT", "MANAGE"],
  },
  {
    facebookPageId: "222222222",
    pageName: "Storm Community",
    tasks: ["CREATE_CONTENT"],
  },
  {
    facebookPageId: "333333333",
    pageName: "Storm Analytics",
    tasks: ["ANALYZE"],
  },
];

const CONNECTED_PAGES: FacebookPageConnection[] = [
  {
    facebookPageId: "111111111",
    pageName: "Storm Business",
    status: "connected",
  },
  {
    facebookPageId: "222222222",
    pageName: "Storm Community",
    status: "connected",
  },
];

function futureExpiration(): string {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

function renderSelector(
  props: {
    onConnected?: (connections: FacebookPageConnection[]) => void;
  } = {},
) {
  return render(
    <FacebookPageSelector
      workspaceId={WORKSPACE_ID}
      pages={PAGES}
      expiresAt={futureExpiration()}
      onConnected={props.onConnected}
    />,
  );
}

describe("FacebookPageSelector", () => {
  beforeEach(() => {
    vi.mocked(connectSelectedFacebookPages).mockReset();
  });

  /**
   * Test 1:
   * Pages without CREATE_CONTENT must not be selectable.
   */
  it("disables Pages without publishing permission", () => {
    renderSelector();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    ).toBeEnabled();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Community/,
      }),
    ).toBeEnabled();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Analytics/,
      }),
    ).toBeDisabled();

    expect(
      screen.getByText("Publishing permission unavailable"),
    ).toBeInTheDocument();
  });

  /**
   * Test 2:
   * Multiple selected Pages are submitted together.
   */
  it("connects multiple selected Facebook Pages", async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();

    vi.mocked(connectSelectedFacebookPages).mockResolvedValue({
      connections: CONNECTED_PAGES,
    });

    renderSelector({ onConnected });

    await user.click(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /Storm Community/,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Connect 2 Pages",
      }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", {
        name: "Connect 2 Pages",
      }),
    );

    await waitFor(() => {
      expect(connectSelectedFacebookPages).toHaveBeenCalledWith(WORKSPACE_ID, [
        "111111111",
        "222222222",
      ]);
    });

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith(CONNECTED_PAGES);
    });

    expect(
      await screen.findByText("Facebook Pages Connected"),
    ).toBeInTheDocument();

    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 3:
   * Select All must include eligible Pages only.
   */
  it("selects and deselects all eligible Pages", async () => {
    const user = userEvent.setup();

    renderSelector();

    await user.click(
      screen.getByRole("button", {
        name: "Select all",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    ).toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Community/,
      }),
    ).toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Analytics/,
      }),
    ).not.toBeChecked();

    expect(
      screen.getByRole("button", {
        name: "Connect 2 Pages",
      }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", {
        name: "Deselect all",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    ).not.toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Community/,
      }),
    ).not.toBeChecked();

    expect(
      screen.getByRole("button", {
        name: "Connect 0 Pages",
      }),
    ).toBeDisabled();
  });

  /**
   * Test 4:
   * An empty selection cannot be submitted.
   */
  it("prevents connecting with no Pages selected", async () => {
    const user = userEvent.setup();

    renderSelector();

    const connectButton = screen.getByRole("button", {
      name: "Connect 0 Pages",
    });

    expect(connectButton).toBeDisabled();

    await user.click(connectButton);

    expect(connectSelectedFacebookPages).not.toHaveBeenCalled();
  });

  /**
   * Test 5:
   * The UI must block additional submissions
   * while a connection request is pending.
   */
  it("prevents additional submissions while connecting", async () => {
    const user = userEvent.setup();

    // Keep the API request pending.
    vi.mocked(connectSelectedFacebookPages).mockReturnValue(
      new Promise(() => {}),
    );

    renderSelector();

    await user.click(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Connect 1 Page",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Connecting...",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Connecting...",
      }),
    );

    expect(connectSelectedFacebookPages).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 6:
   * Connection failures should allow retry.
   */
  it("displays connection errors and allows retry", async () => {
    const user = userEvent.setup();

    vi.mocked(connectSelectedFacebookPages)
      .mockRejectedValueOnce(new Error("Facebook connection failed."))
      .mockResolvedValueOnce({
        connections: [CONNECTED_PAGES[0]],
      });

    renderSelector();

    await user.click(
      screen.getByRole("checkbox", {
        name: /Storm Business/,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Connect 1 Page",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Facebook connection failed.",
    );

    expect(
      screen.getByRole("button", {
        name: "Connect 1 Page",
      }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", {
        name: "Connect 1 Page",
      }),
    );

    expect(
      await screen.findByText("Facebook Pages Connected"),
    ).toBeInTheDocument();

    expect(connectSelectedFacebookPages).toHaveBeenCalledTimes(2);
  });
});
