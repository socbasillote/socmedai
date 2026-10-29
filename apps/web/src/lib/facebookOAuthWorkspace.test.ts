import { beforeEach, describe, expect, it } from "vitest";

import {
  storeFacebookOAuthWorkspaceId,
  readFacebookOAuthWorkspaceId,
  clearFacebookOAuthWorkspaceId,
} from "./facebookOAuthWorkspace";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

describe("facebookOAuthWorkspace", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores the initiating Facebook OAuth workspace", () => {
    storeFacebookOAuthWorkspaceId(WORKSPACE_A);

    expect(sessionStorage.getItem("storm:facebook-oauth-workspace")).toBe(
      WORKSPACE_A,
    );
  });

  it("retrieves the original OAuth workspace", () => {
    storeFacebookOAuthWorkspaceId(WORKSPACE_A);

    const workspaceId = readFacebookOAuthWorkspaceId();

    expect(workspaceId).toBe(WORKSPACE_A);
  });

  it("clears the temporary OAuth workspace", () => {
    storeFacebookOAuthWorkspaceId(WORKSPACE_A);

    clearFacebookOAuthWorkspaceId();

    expect(readFacebookOAuthWorkspaceId()).toBeNull();

    expect(sessionStorage.getItem("storm:facebook-oauth-workspace")).toBeNull();
  });

  it("replaces the previous workspace when a new OAuth flow starts", () => {
    storeFacebookOAuthWorkspaceId(WORKSPACE_A);

    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);

    storeFacebookOAuthWorkspaceId(WORKSPACE_B);

    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_B);
  });

  it("rejects empty workspace IDs without replacing a valid workspace", () => {
    storeFacebookOAuthWorkspaceId(WORKSPACE_A);

    expect(() => {
      storeFacebookOAuthWorkspaceId("");
    }).toThrow("A workspace ID is required.");

    expect(() => {
      storeFacebookOAuthWorkspaceId("   ");
    }).toThrow("A workspace ID is required.");

    expect(readFacebookOAuthWorkspaceId()).toBe(WORKSPACE_A);
  });
});
