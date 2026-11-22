/**
 * @vitest-environment jsdom
 */

import { useState } from "react";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  PublishingImageBrandingFields,
} from "./PublishingImageBrandingFields";
import {
  DEFAULT_PUBLISHING_BRANDING,
  createPublishingImageBranding,
  validatePublishingBrandingSettings,
  type PublishingBrandingSettings,
} from "../publishingImageBranding";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

vi.mock("@/features/image-studio/hooks/useWorkspaceLogoAvailability", () => ({
  useWorkspaceLogoAvailability: () => ({
    status: "available",
    logoAvailable: true,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/features/image-studio/components/WorkspaceLogoUploader", () => ({
  WorkspaceLogoUploader: () => null,
}));

vi.mock("@/features/image-studio/components/BrandingPlacementPreview", () => ({
  BrandingPlacementPreview: ({
    position,
    sizePercent,
    opacity,
    brandingMode,
  }: {
    position: string;
    sizePercent: number;
    opacity: number;
    brandingMode: string;
  }) => (
    <div
      data-testid="branding-placement-preview"
      data-position={position}
      data-size={sizePercent}
      data-opacity={opacity}
      data-mode={brandingMode}
    />
  ),
}));

function TestHost() {
  const [value, setValue] = useState<PublishingBrandingSettings>({
    ...DEFAULT_PUBLISHING_BRANDING,
  });

  return (
    <PublishingImageBrandingFields
      workspaceId={WORKSPACE_ID}
      aspectRatio="square"
      value={value}
      onChange={setValue}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("Publishing image branding fields", () => {
  it("starts with no branding", () => {
    render(<TestHost />);

    const none = screen.getByRole<HTMLInputElement>("radio", {
      name: "No branding",
    });

    expect(none.checked).toBe(true);
  });

  it("allows configuring a text label", () => {
    render(<TestHost />);

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Branding text",
      }),
      {
        target: {
          value: "BREW CO.",
        },
      },
    );

    const text = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Branding text",
    });

    expect(text.value).toBe("BREW CO.");
  });

  it("validates text branding through the existing validator", () => {
    const settings: PublishingBrandingSettings = {
      ...DEFAULT_PUBLISHING_BRANDING,
      mode: "text",
      text: "BREW CO.",
    };

    expect(validatePublishingBrandingSettings(settings, true)).toBeNull();

    expect(
      validatePublishingBrandingSettings({ ...settings, text: "" }, true),
    ).not.toBeNull();
  });

  it("requires a verified logo for logo branding", () => {
    const settings: PublishingBrandingSettings = {
      ...DEFAULT_PUBLISHING_BRANDING,
      mode: "logo",
    };

    expect(validatePublishingBrandingSettings(settings, false)).toBe(
      "An enabled workspace logo is required.",
    );

    expect(validatePublishingBrandingSettings(settings, true)).toBeNull();
  });

  it("allows changing branding position", () => {
    render(<TestHost />);

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    fireEvent.change(screen.getByLabelText("Branding position"), {
      target: {
        value: "top-left",
      },
    });

    const position =
      screen.getByLabelText<HTMLSelectElement>("Branding position");

    expect(position.value).toBe("top-left");
  });

  it("updates placement, size, and opacity in the preview", () => {
    render(<TestHost />);

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Text label",
      }),
    );

    fireEvent.change(screen.getByLabelText("Branding text"), {
      target: { value: "BREW CO." },
    });

    fireEvent.change(screen.getByLabelText(/branding position/i), {
      target: { value: "top-left" },
    });

    fireEvent.change(screen.getByLabelText(/branding size/i), {
      target: { value: "30" },
    });

    fireEvent.change(screen.getByLabelText(/branding opacity/i), {
      target: { value: "20" },
    });

    const preview = screen.getByTestId("branding-placement-preview");

    expect(preview.getAttribute("data-position")).toBe("top-left");
    expect(preview.getAttribute("data-size")).toBe("30");
    expect(preview.getAttribute("data-opacity")).toBe("20");
    expect(preview.getAttribute("data-mode")).toBe("text");
  });

  it("rejects logo branding when no logo is available", () => {
    const settings: PublishingBrandingSettings = {
      ...DEFAULT_PUBLISHING_BRANDING,
      mode: "logo",
    };

    expect(validatePublishingBrandingSettings(settings, false)).toBe(
      "An enabled workspace logo is required.",
    );
  });

  it("builds a valid text-branding command", () => {
    const branding = createPublishingImageBranding(
      {
        ...DEFAULT_PUBLISHING_BRANDING,
        mode: "text",
        text: "BREW CO.",
        position: "top-left",
        sizePercent: 15,
        opacityPercent: 60,
      },
      false,
    );

    expect(branding).toEqual({
      type: "text",
      text: "BREW CO.",
      position: "top-left",
      sizePercent: 15,
      opacity: 0.6,
    });
  });

  it("builds a verified workspace-logo command", () => {
    const settings = {
      ...DEFAULT_PUBLISHING_BRANDING,
      mode: "logo" as const,
    };

    expect(createPublishingImageBranding(settings, true)).toEqual({
      type: "logo",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });
  });

  it("blocks logo commands without verification", () => {
    const settings = {
      ...DEFAULT_PUBLISHING_BRANDING,
      mode: "logo" as const,
    };

    expect(() => createPublishingImageBranding(settings, false)).toThrow(
      "An enabled workspace logo is required.",
    );
  });

  it("does not allow an empty text label", () => {
    expect(() =>
      createPublishingImageBranding(
        {
          ...DEFAULT_PUBLISHING_BRANDING,
          mode: "text",
          text: "",
        },
        false,
      ),
    ).toThrow();
  });
});
