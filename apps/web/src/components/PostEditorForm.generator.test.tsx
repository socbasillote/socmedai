/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ComponentProps } from "react";

import { PostEditorForm } from "./PostEditorForm";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const IMAGE_ID = "507f1f77bcf86cd799439022";

vi.mock("@/features/publishing/components/MediaLibraryPicker", () => ({
  MediaLibraryPicker: () => (
    <div data-testid="media-library-picker">Media Library picker</div>
  ),
}));

vi.mock("@/features/publishing/components/SelectedMediaPreview", () => ({
  SelectedMediaPreview: () => (
    <div data-testid="selected-media-preview">Selected image</div>
  ),
}));

vi.mock("@/components/FacebookPageConnectionSelect", () => ({
  FacebookPageConnectionSelect: () => null,
}));

function renderForm(
  overrides: Partial<ComponentProps<typeof PostEditorForm>> = {},
) {
  return render(
    <PostEditorForm
      mode="create"
      title=""
      caption="A sample post caption"
      selectedPlatforms={["linkedin"]}
      recoveryOwnerUserId="11111111-2222-4333-8444-555555555555"
      postMode="draft"
      scheduledAt=""
      minScheduledAt=""
      saving={false}
      error=""
      linkedInConnectionId="test-linkedin"
      linkedInDisplayName="Test LinkedIn"
      linkedInStatus="connected"
      facebookConnections={[]}
      selectedFacebookConnectionId={null}
      facebookConnectionsLoading={false}
      facebookConnectionsError={null}
      onFacebookConnectionChange={vi.fn()}
      onTitleChange={vi.fn()}
      onCaptionChange={vi.fn()}
      onPlatformsChange={vi.fn()}
      onPostModeChange={vi.fn()}
      onScheduledAtChange={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      workspaceId={WORKSPACE_ID}
      selectedMediaAssetId={null}
      onMediaSelect={vi.fn()}
      onMediaRemove={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("PostEditorForm AI generator entry point", () => {
  it("shows Generate with AI when a workspace is selected", () => {
    renderForm();

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Generate with AI",
    });

    expect(button.disabled).toBe(false);
  });

  it("opens the AI generator panel", () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate with AI",
      }),
    );

    expect(
      screen.getByRole("region", {
        name: "AI Image Generator",
      }),
    ).toBeTruthy();
  });

  it("closes the AI generator panel", () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate with AI",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close generator",
      }),
    );

    expect(
      screen.queryByRole("region", {
        name: "AI Image Generator",
      }),
    ).toBeNull();
  });

  it("opens the Media Library without showing the generator", () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate with AI",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close generator",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose from Media Library",
      }),
    );

    expect(screen.getByTestId("media-library-picker")).toBeTruthy();

    expect(
      screen.queryByRole("region", {
        name: "AI Image Generator",
      }),
    ).toBeNull();
  });

  it("allows generating a replacement without removing the selected image", () => {
    const onMediaRemove = vi.fn();

    renderForm({
      selectedMediaAssetId: IMAGE_ID,
      onMediaRemove,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate replacement",
      }),
    );

    expect(
      screen.getByRole("region", {
        name: "AI Image Generator",
      }),
    ).toBeTruthy();

    expect(screen.getByTestId("selected-media-preview")).toBeTruthy();

    expect(onMediaRemove).not.toHaveBeenCalled();
  });

  it("disables generation entry when no workspace is available", () => {
    renderForm({
      workspaceId: null,
    });

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Generate with AI",
    });

    expect(button.disabled).toBe(true);
  });

  it("disables generation entry while saving", () => {
    renderForm({
      saving: true,
    });

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Generate with AI",
    });

    expect(button.disabled).toBe(true);
  });

  it("disables generation entry after publishing locks the editor", () => {
    renderForm({
      locked: true,
    });

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Generate with AI",
    });

    expect(button.disabled).toBe(true);
  });
});
