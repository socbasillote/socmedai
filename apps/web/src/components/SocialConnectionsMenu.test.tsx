import { describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen } from "@testing-library/react";

import type { ComponentProps } from "react";

import { SocialConnectionsMenu } from "./SocialConnectionsMenu";

/**
 * Keep existing LinkedIn behavior outside the scope
 * of these Facebook-specific component tests.
 */
vi.mock("@/components/LinkedInConnectionPanel", () => ({
  LinkedInConnectionPanel: () => null,
}));

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

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

const CONNECTION_C = {
  id: "507f1f77bcf86cd799439015",
  facebookPageId: "555555555",
  pageName: "Storm Support",
  status: "revoked" as const,
};

/**
 * Render the menu with Facebook test props.
 *
 * The LinkedIn component is mocked, so its
 * real authentication and connection logic
 * is not executed.
 *
 * If your menu requires additional outer props,
 * preserve their existing values in this helper.
 */
function renderMenu(facebookOverrides: Record<string, unknown> = {}) {
  const onConnect = vi.fn();

  const props = {
    linkedInProps: {},
    facebookProps: {
      workspaceId: WORKSPACE_ID,
      workspacesLoading: false,
      connecting: false,
      connectError: "",
      connections: [],
      connectionsLoading: false,
      connectionsError: "",
      onConnect,
      ...facebookOverrides,
    },
  } as unknown as ComponentProps<typeof SocialConnectionsMenu>;

  render(<SocialConnectionsMenu {...props} />);

  return { onConnect };
}

/**
 * Open the dropdown before checking its content.
 *
 * Use the actual accessible button name from
 * SocialConnectionsMenu if it differs.
 */
function openSocialAccounts() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /social accounts/i,
    }),
  );
}

describe("SocialConnectionsMenu — Facebook", () => {
  it("displays a connected Facebook Page", () => {
    renderMenu({
      connections: [CONNECTION_A],
    });

    openSocialAccounts();

    expect(screen.getByText("Storm Business")).toBeInTheDocument();

    expect(screen.getByText(/Page ID: 123456789/)).toBeInTheDocument();

    expect(screen.getByText("1 connected")).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /connect more facebook pages/i,
      }),
    ).toBeInTheDocument();
  });

  it("counts only actively connected Pages", () => {
    renderMenu({
      connections: [CONNECTION_A, CONNECTION_B, CONNECTION_C],
    });

    openSocialAccounts();

    expect(screen.getByText("1 connected")).toBeInTheDocument();

    expect(screen.getByText("Storm Business")).toBeInTheDocument();

    expect(screen.getByText("Storm Community")).toBeInTheDocument();

    expect(screen.getByText("Storm Support")).toBeInTheDocument();

    expect(screen.getByText("Session expired")).toBeInTheDocument();

    expect(screen.getByText("Access revoked")).toBeInTheDocument();
  });

  it("displays the empty state", () => {
    renderMenu({
      connections: [],
    });

    openSocialAccounts();

    expect(
      screen.getByText("No Facebook Pages connected to this workspace."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /^connect facebook$/i,
      }),
    ).toBeInTheDocument();
  });

  it("displays the loading state", () => {
    renderMenu({
      connections: [],
      connectionsLoading: true,
    });

    openSocialAccounts();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Facebook connections...",
    );

    expect(
      screen.queryByText("No Facebook Pages connected to this workspace."),
    ).not.toBeInTheDocument();
  });

  it("displays Facebook connection loading errors", () => {
    renderMenu({
      connectionsError: "Unable to retrieve Facebook connections.",
    });

    openSocialAccounts();

    expect(
      screen.getByText("Unable to retrieve Facebook connections."),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("No Facebook Pages connected to this workspace."),
    ).not.toBeInTheDocument();
  });

  it("calls the Facebook OAuth handler", () => {
    const { onConnect } = renderMenu({
      connections: [CONNECTION_A],
    });

    openSocialAccounts();

    fireEvent.click(
      screen.getByRole("button", {
        name: /connect more facebook pages/i,
      }),
    );

    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});
