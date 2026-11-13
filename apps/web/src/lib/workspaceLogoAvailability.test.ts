import { describe, expect, it } from "vitest";

import type { Workspace } from "./workspaces";

import { hasWorkspaceLogo } from "./workspaceLogoAvailability";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const LOGO_ID = "507f1f77bcf86cd799439022";

function workspace(logoOverlay: unknown): Workspace {
  return {
    _id: WORKSPACE_ID,
    name: "Storm Test Workspace",
    ownerUserId: "507f1f77bcf86cd799439033",
    settings: { logoOverlay },
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  };
}

function validLogoSettings() {
  return {
    enabled: true,
    logo: {
      storageKey: `workspaces/${WORKSPACE_ID}/logos/${LOGO_ID}.png`,
      sha256: "a".repeat(64),
    },
    position: "bottom-right",
    sizePercent: 20,
    opacity: 0.8,
  };
}

describe("Workspace logo availability", () => {
  it("accepts an enabled logo with valid metadata", () => {
    expect(hasWorkspaceLogo(workspace(validLogoSettings()))).toBe(true);
  });

  it("rejects a disabled workspace logo", () => {
    expect(
      hasWorkspaceLogo(
        workspace({
          ...validLogoSettings(),
          enabled: false,
        }),
      ),
    ).toBe(false);
  });

  it("rejects a workspace without a logo", () => {
    expect(hasWorkspaceLogo(workspace(undefined))).toBe(false);
  });

  it("rejects an invalid checksum", () => {
    expect(
      hasWorkspaceLogo(
        workspace({
          ...validLogoSettings(),
          logo: {
            ...validLogoSettings().logo,
            sha256: "invalid",
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects a logo belonging to another workspace", () => {
    const otherWorkspaceId = "507f1f77bcf86cd799439099";

    expect(
      hasWorkspaceLogo(
        workspace({
          ...validLogoSettings(),
          logo: {
            ...validLogoSettings().logo,
            storageKey: `workspaces/${otherWorkspaceId}/logos/${LOGO_ID}.png`,
          },
        }),
      ),
    ).toBe(false);
  });
});
