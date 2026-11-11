import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_LOGO_SETTINGS,
  getWorkspaceLogoStorageKey,
  parseWorkspaceLogoSettings,
  snapshotWorkspaceLogoSettings,
} from "./workspaceLogoConfig.js";

const workspaceId = "6aeba54a3fe7bf29e916b3f1";
const otherWorkspaceId = "6af27c92174f7f0f7959491c";
const logoId = "6af31be35bba81eee2f1be9b";

const logo = {
  storageKey: getWorkspaceLogoStorageKey(workspaceId, logoId),
  sha256: "a".repeat(64),
};

describe("Workspace logo configuration", () => {
  it("defaults to disabled branding", () => {
    const result = parseWorkspaceLogoSettings(undefined, workspaceId);

    expect(result).toEqual(DEFAULT_WORKSPACE_LOGO_SETTINGS);
  });

  it("accepts a valid workspace-owned logo", () => {
    const result = parseWorkspaceLogoSettings(
      {
        enabled: true,
        logo,
        position: "bottom-right",
        sizePercent: 20,
        opacity: 0.8,
      },
      workspaceId,
    );

    expect(result.enabled).toBe(true);
    expect(result.logo?.storageKey).toBe(logo.storageKey);
  });

  it("rejects a logo from another workspace", () => {
    expect(() =>
      parseWorkspaceLogoSettings(
        {
          enabled: true,
          logo: {
            ...logo,
            storageKey: getWorkspaceLogoStorageKey(otherWorkspaceId, logoId),
          },
        },
        workspaceId,
      ),
    ).toThrow();
  });

  it("rejects enabled branding without a logo", () => {
    expect(() =>
      parseWorkspaceLogoSettings(
        {
          ...DEFAULT_WORKSPACE_LOGO_SETTINGS,
          enabled: true,
        },
        workspaceId,
      ),
    ).toThrow();
  });

  it("rejects unsupported overlay settings", () => {
    expect(() =>
      parseWorkspaceLogoSettings(
        {
          enabled: true,
          logo,
          position: "center",
          sizePercent: 90,
          opacity: 1,
        },
        workspaceId,
      ),
    ).toThrow();
  });

  it("creates an independent configuration snapshot", () => {
    const input = {
      enabled: true,
      logo,
      position: "bottom-right" as const,
      sizePercent: 20,
      opacity: 0.8,
    };

    const snapshot = snapshotWorkspaceLogoSettings(input, workspaceId);

    input.sizePercent = 10;

    expect(snapshot.sizePercent).toBe(20);
  });
});
