import { describe, expect, it } from "vitest";

import {
  addDestination,
  createPublishingDraft,
  setDestinationOverride,
  setSharedCaption,
  setSharedMedia,
  type PublishingDestination,
} from "./publishingDraft";

import {
  evaluatePublishingReadiness,
  type PublishingCapabilityContext,
} from "./publishingReadiness";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";

const facebook: PublishingDestination = {
  id: "facebook:page-1",
  platform: "facebook",
  connectionId: "page-1",
  accountName: "Coffee Shop",
  format: "text",
};

const linkedin: PublishingDestination = {
  id: "linkedin:account-1",
  platform: "linkedin",
  connectionId: "account-1",
  accountName: "Business Owner",
  format: "text",
};

const instagram: PublishingDestination = {
  id: "instagram:account-1",
  platform: "instagram",
  connectionId: "account-1",
  accountName: "Coffee Instagram",
  format: "image",
};

const context: PublishingCapabilityContext = {
  accounts: {
    [facebook.id]: {
      connectionId: facebook.connectionId,
      connected: true,
      canPublish: true,
    },
    [linkedin.id]: {
      connectionId: linkedin.connectionId,
      connected: true,
      canPublish: true,
    },
    [instagram.id]: {
      connectionId: instagram.connectionId,
      connected: false,
      canPublish: false,
    },
  },
};

function draftWith(...destinations: PublishingDestination[]) {
  let draft = createPublishingDraft(WORKSPACE_ID, "Asia/Manila");

  for (const destination of destinations) {
    draft = addDestination(draft, destination);
  }

  return setSharedCaption(draft, "Our new coffee is here!");
}

describe("Publishing readiness", () => {
  it("requires a selected destination", () => {
    const result = evaluatePublishingReadiness(
      createPublishingDraft(WORKSPACE_ID),
      context,
      "now",
    );

    expect(result.ready).toBe(false);
    expect(result.totalCount).toBe(0);
  });

  it("allows a connected Facebook text post", () => {
    const result = evaluatePublishingReadiness(
      draftWith(facebook),
      context,
      "now",
    );

    expect(result.ready).toBe(true);
    expect(result.readyCount).toBe(1);
  });

  it("allows a connected LinkedIn text post", () => {
    const result = evaluatePublishingReadiness(
      draftWith(linkedin),
      context,
      "now",
    );

    expect(result.ready).toBe(true);
  });

  it("blocks immediate multi-destination publishing", () => {
    const result = evaluatePublishingReadiness(
      draftWith(facebook, linkedin),
      context,
      "now",
    );

    expect(result.readyCount).toBe(2);
    expect(result.ready).toBe(false);

    expect(
      result.issues.some((issue) => issue.includes("one destination")),
    ).toBe(true);
  });

  it("identifies missing Instagram image requirements", () => {
    const result = evaluatePublishingReadiness(
      draftWith(instagram),
      context,
      "now",
    );

    expect(result.ready).toBe(false);

    expect(result.destinations[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "media",
          status: "missing",
        }),
      ]),
    );
  });

  it("rejects publishing media before backend support", () => {
    const draft = setSharedMedia(draftWith(facebook), [
      { assetId: "image-1", type: "image" },
    ]);

    const result = evaluatePublishingReadiness(draft, context, "now");

    // Existing immediate publishing requires
    // a text-only draft with empty mediaIds.
    // This test will guide a later hardening change:
    // selected media must block current execution.
    expect(result.ready).toBe(false);

    expect(
      result.destinations[0].items.find(
        (item) => item.id === "media-publishing",
      )?.status,
    ).toBe("invalid");
  });

  it("blocks a disconnected account", () => {
    const disconnectedContext: PublishingCapabilityContext = {
      accounts: {},
    };

    const result = evaluatePublishingReadiness(
      draftWith(facebook),
      disconnectedContext,
      "now",
    );

    expect(result.ready).toBe(false);
  });

  it("supports valid future scheduling", () => {
    const draft = draftWith(facebook);

    draft.publishing.scheduledAt = "2030-01-02T12:00:00.000Z";

    const result = evaluatePublishingReadiness(
      draft,
      context,
      "schedule",
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(result.ready).toBe(true);
  });

  it("blocks a schedule in the past", () => {
    const draft = draftWith(linkedin);

    draft.publishing.scheduledAt = "2029-12-31T12:00:00.000Z";

    const result = evaluatePublishingReadiness(
      draft,
      context,
      "schedule",
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(result.ready).toBe(false);
  });

  it("keeps destination-specific changes isolated", () => {
    let draft = draftWith(facebook, linkedin);

    draft = setDestinationOverride(draft, linkedin.id, { caption: "" });

    const result = evaluatePublishingReadiness(draft, context, "draft");

    const facebookResult = result.destinations.find(
      (item) => item.destinationId === facebook.id,
    );

    const linkedinResult = result.destinations.find(
      (item) => item.destinationId === linkedin.id,
    );

    expect(facebookResult?.ready).toBe(true);
    expect(linkedinResult?.ready).toBe(false);
  });

  it("does not allow unsupported platform scheduling", () => {
    const draft = draftWith(instagram);

    draft.publishing.scheduledAt = "2030-01-02T12:00:00.000Z";

    const result = evaluatePublishingReadiness(
      draft,
      context,
      "schedule",
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(result.ready).toBe(false);

    expect(result.destinations[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "availability",
          status: "invalid",
        }),
      ]),
    );
  });
});
