import { describe, expect, it } from "vitest";

import {
  addDestination,
  clearDestinationOverride,
  createPublishingDraft,
  getDestinationContent,
  removeDestination,
  setDestinationOverride,
  setSharedCaption,
  setSharedMedia,
  type PublishingDestination,
} from "./publishingDraft";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const facebook: PublishingDestination = {
  id: "facebook:page-1",
  platform: "facebook",
  connectionId: "page-1",
  accountName: "My Facebook Page",
  format: "text",
};

const linkedin: PublishingDestination = {
  id: "linkedin:account-1",
  platform: "linkedin",
  connectionId: "account-1",
  accountName: "My LinkedIn Account",
  format: "text",
};

function createTwoDestinationDraft() {
  let draft = createPublishingDraft(WORKSPACE_ID, "Asia/Manila");

  draft = addDestination(draft, facebook);
  draft = addDestination(draft, linkedin);

  return draft;
}

describe("Unified publishing draft", () => {
  it("creates an empty workspace draft", () => {
    const draft = createPublishingDraft(WORKSPACE_ID, "Asia/Manila");

    expect(draft.workspaceId).toBe(WORKSPACE_ID);
    expect(draft.shared.caption).toBe("");
    expect(draft.shared.media).toEqual([]);
    expect(draft.destinations).toEqual([]);
    expect(draft.publishing.mode).toBe("draft");
    expect(draft.publishing.timezone).toBe("Asia/Manila");
  });

  it("shares caption across destinations", () => {
    const draft = setSharedCaption(
      createTwoDestinationDraft(),
      "New coffee available!",
    );

    expect(getDestinationContent(draft, facebook.id)?.caption).toBe(
      "New coffee available!",
    );

    expect(getDestinationContent(draft, linkedin.id)?.caption).toBe(
      "New coffee available!",
    );
  });

  it("keeps destination overrides isolated", () => {
    let draft = createTwoDestinationDraft();

    draft = setSharedCaption(draft, "Our new coffee is here!");

    draft = setDestinationOverride(draft, linkedin.id, {
      caption: "We are excited to announce our newest product.",
    });

    expect(getDestinationContent(draft, facebook.id)?.caption).toBe(
      "Our new coffee is here!",
    );

    expect(getDestinationContent(draft, linkedin.id)?.caption).toBe(
      "We are excited to announce our newest product.",
    );
  });

  it("does not overwrite customized content when shared text changes", () => {
    let draft = createTwoDestinationDraft();

    draft = setDestinationOverride(draft, linkedin.id, {
      caption: "LinkedIn-specific caption",
    });

    draft = setSharedCaption(draft, "Updated shared caption");

    expect(getDestinationContent(draft, facebook.id)?.caption).toBe(
      "Updated shared caption",
    );

    expect(getDestinationContent(draft, linkedin.id)?.caption).toBe(
      "LinkedIn-specific caption",
    );
  });

  it("shares selected media by default", () => {
    const draft = setSharedMedia(createTwoDestinationDraft(), [
      {
        assetId: "image-1",
        type: "image",
      },
    ]);

    expect(getDestinationContent(draft, facebook.id)?.media).toEqual([
      {
        assetId: "image-1",
        type: "image",
      },
    ]);

    expect(getDestinationContent(draft, linkedin.id)?.media).toHaveLength(1);
  });

  it("supports destination-specific media", () => {
    let draft = setSharedMedia(createTwoDestinationDraft(), [
      { assetId: "image-1", type: "image" },
    ]);

    draft = setDestinationOverride(draft, linkedin.id, {
      media: [{ assetId: "image-2", type: "image" }],
    });

    expect(getDestinationContent(draft, facebook.id)?.media[0].assetId).toBe(
      "image-1",
    );

    expect(getDestinationContent(draft, linkedin.id)?.media[0].assetId).toBe(
      "image-2",
    );
  });

  it("allows intentionally empty overrides", () => {
    let draft = createTwoDestinationDraft();

    draft = setSharedCaption(draft, "Shared caption");

    draft = setDestinationOverride(draft, facebook.id, {
      caption: "",
      media: [],
    });

    const content = getDestinationContent(draft, facebook.id);

    expect(content?.caption).toBe("");
    expect(content?.media).toEqual([]);
  });

  it("restores shared content when overrides are cleared", () => {
    let draft = createTwoDestinationDraft();

    draft = setSharedCaption(draft, "Shared caption");

    draft = setDestinationOverride(draft, linkedin.id, {
      caption: "Custom caption",
    });

    draft = clearDestinationOverride(draft, linkedin.id);

    expect(getDestinationContent(draft, linkedin.id)?.caption).toBe(
      "Shared caption",
    );
  });

  it("removes destination overrides with the destination", () => {
    let draft = createTwoDestinationDraft();

    draft = setDestinationOverride(draft, linkedin.id, { caption: "Custom" });

    draft = removeDestination(draft, linkedin.id);

    expect(draft.destinations).toHaveLength(1);
    expect(draft.overrides[linkedin.id]).toBeUndefined();

    expect(getDestinationContent(draft, linkedin.id)).toBeNull();
  });

  it("prevents duplicate destinations", () => {
    let draft = createPublishingDraft(WORKSPACE_ID);

    draft = addDestination(draft, facebook);
    draft = addDestination(draft, facebook);

    expect(draft.destinations).toHaveLength(1);
  });

  it("rejects overrides for unselected destinations", () => {
    const draft = createPublishingDraft(WORKSPACE_ID);

    const result = setDestinationOverride(draft, facebook.id, {
      caption: "Should not apply",
    });

    expect(result).toBe(draft);
    expect(result.overrides).toEqual({});
  });
});
