import { describe, expect, it } from "vitest";

import { resolveAdmittedImageBranding } from "./resolveAdmittedImageBranding.js";

const workspaceId = "507f1f77bcf86cd799439011";

const logo = {
  storageKey: `workspaces/${workspaceId}/logos/507f1f77bcf86cd799439012.png`,
  sha256: "a".repeat(64),
};

const appearance = {
  position: "bottom-right" as const,
  sizePercent: 20,
  opacity: 0.8,
};

const legacyLogo = {
  enabled: true,
  logo,
  ...appearance,
};

describe("Admitted image branding resolution", () => {
  it("supports assets without branding snapshots", () => {
    expect(
      resolveAdmittedImageBranding({
        workspaceId,
      }),
    ).toEqual({
      type: "none",
    });
  });

  it("preserves legacy enabled logo branding", () => {
    expect(
      resolveAdmittedImageBranding({
        workspaceId,
        logoOverlaySnapshot: legacyLogo,
      }),
    ).toEqual({
      type: "logo",
      logo,
      ...appearance,
    });
  });

  it("accepts explicit no branding", () => {
    expect(
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "none",
        },
        logoOverlaySnapshot: {
          ...legacyLogo,
          enabled: false,
          logo: null,
        },
      }),
    ).toEqual({
      type: "none",
    });
  });

  it("accepts matching new and legacy logos", () => {
    expect(
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "logo",
          logo,
          ...appearance,
        },
        logoOverlaySnapshot: legacyLogo,
      }).type,
    ).toBe("logo");
  });

  it("accepts a persisted text label", () => {
    expect(
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "text",
          text: "BREW CO.",
          ...appearance,
        },
      }),
    ).toEqual({
      type: "text",
      text: "BREW CO.",
      ...appearance,
    });
  });

  it("rejects conflicting branding snapshots", () => {
    expect(() =>
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "none",
        },
        logoOverlaySnapshot: legacyLogo,
      }),
    ).toThrow("Conflicting admitted branding snapshots.");
  });

  it("rejects cross-workspace logo references", () => {
    expect(() =>
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "logo",
          logo: {
            ...logo,
            storageKey:
              "workspaces/507f1f77bcf86cd799439099/logos/507f1f77bcf86cd799439012.png",
          },
          ...appearance,
        },
      }),
    ).toThrow("Branding logo does not belong to the asset workspace.");
  });

  it("rejects control characters in text labels", () => {
    expect(() =>
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "text",
          text: "BREW\nCO.",
          ...appearance,
        },
      }),
    ).toThrow();
  });

  it("rejects incomplete text appearance", () => {
    expect(() =>
      resolveAdmittedImageBranding({
        workspaceId,
        brandingSnapshot: {
          type: "text",
          text: "BREW CO.",
        },
      }),
    ).toThrow();
  });
});
