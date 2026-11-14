import type { PostPlatform } from "@/lib/posts";

export type PublishingFormat = "text" | "image" | "video";

export type PublishingMedia = {
  assetId: string;
  type: "image" | "video";
};

export type PublishingDestination = {
  id: string;
  platform: PostPlatform;
  connectionId: string;
  accountName: string;
  format: PublishingFormat;
};

export type DestinationOverride = {
  caption?: string;
  title?: string;
  media?: PublishingMedia[];
};

export type PublishingDraft = {
  workspaceId: string;

  shared: {
    title: string;
    caption: string;
    media: PublishingMedia[];
  };

  destinations: PublishingDestination[];

  overrides: Record<string, DestinationOverride>;

  publishing: {
    mode: "draft" | "now" | "schedule";
    scheduledAt: string;
    timezone: string;
  };
};

export type EffectiveDestinationContent = {
  destination: PublishingDestination;
  title: string;
  caption: string;
  media: PublishingMedia[];
};

export function createPublishingDraft(
  workspaceId: string,
  timezone = "UTC",
): PublishingDraft {
  return {
    workspaceId,

    shared: {
      title: "",
      caption: "",
      media: [],
    },

    destinations: [],
    overrides: {},

    publishing: {
      mode: "draft",
      scheduledAt: "",
      timezone,
    },
  };
}

export function getDestinationContent(
  draft: PublishingDraft,
  destinationId: string,
): EffectiveDestinationContent | null {
  const destination = draft.destinations.find(
    (item) => item.id === destinationId,
  );

  if (!destination) {
    return null;
  }

  const override = draft.overrides[destinationId];

  return {
    destination,

    title: override?.title ?? draft.shared.title,

    caption: override?.caption ?? draft.shared.caption,

    media: override?.media ?? draft.shared.media,
  };
}

export function addDestination(
  draft: PublishingDraft,
  destination: PublishingDestination,
): PublishingDraft {
  if (draft.destinations.some((item) => item.id === destination.id)) {
    return draft;
  }

  return {
    ...draft,
    destinations: [...draft.destinations, destination],
  };
}

export function removeDestination(
  draft: PublishingDraft,
  destinationId: string,
): PublishingDraft {
  const overrides = { ...draft.overrides };

  delete overrides[destinationId];

  return {
    ...draft,

    destinations: draft.destinations.filter(
      (item) => item.id !== destinationId,
    ),

    overrides,
  };
}

export function setSharedCaption(
  draft: PublishingDraft,
  caption: string,
): PublishingDraft {
  return {
    ...draft,
    shared: {
      ...draft.shared,
      caption,
    },
  };
}

export function setSharedMedia(
  draft: PublishingDraft,
  media: PublishingMedia[],
): PublishingDraft {
  return {
    ...draft,
    shared: {
      ...draft.shared,
      media: [...media],
    },
  };
}

export function setDestinationOverride(
  draft: PublishingDraft,
  destinationId: string,
  override: DestinationOverride,
): PublishingDraft {
  if (!draft.destinations.some((item) => item.id === destinationId)) {
    return draft;
  }

  return {
    ...draft,

    overrides: {
      ...draft.overrides,

      [destinationId]: {
        ...draft.overrides[destinationId],
        ...override,

        ...(override.media !== undefined ? { media: [...override.media] } : {}),
      },
    },
  };
}

export function clearDestinationOverride(
  draft: PublishingDraft,
  destinationId: string,
): PublishingDraft {
  const overrides = { ...draft.overrides };

  delete overrides[destinationId];

  return {
    ...draft,
    overrides,
  };
}
