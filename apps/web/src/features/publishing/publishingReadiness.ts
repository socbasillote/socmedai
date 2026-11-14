import {
  getDestinationContent,
  type PublishingDestination,
  type PublishingDraft,
  type PublishingFormat,
} from "./publishingDraft";

export type PublishingAction = "draft" | "now" | "schedule";

export type ChecklistStatus = "added" | "missing" | "optional" | "invalid";

export type AccountCapability = {
  connectionId: string;
  connected: boolean;
  canPublish: boolean;
};

export type PublishingCapabilityContext = {
  accounts: Record<string, AccountCapability | undefined>;
};

export type ChecklistItem = {
  id: string;
  label: string;
  status: ChecklistStatus;
  message: string;
};

export type DestinationReadiness = {
  destinationId: string;
  platform: string;
  accountName: string;
  ready: boolean;
  items: ChecklistItem[];
  issues: string[];
};

export type PublishingReadiness = {
  action: PublishingAction;
  ready: boolean;
  readyCount: number;
  totalCount: number;
  destinations: DestinationReadiness[];
  issues: string[];
};

type PlatformCapability = {
  formats: readonly PublishingFormat[];
  publishNow: boolean;
  schedule: boolean;
};

// These are Storm's currently VERIFIED backend
// execution capabilities, not general social
// platform capabilities.
//
// Do not enable a new format here merely
// because its external API supports it.
const EXECUTION_CAPABILITIES: Record<string, PlatformCapability> = {
  facebook: {
    formats: ["text"],
    publishNow: true,
    schedule: true,
  },
  linkedin: {
    formats: ["text"],
    publishNow: true,
    schedule: true,
  },
  instagram: {
    formats: [],
    publishNow: false,
    schedule: false,
  },
};

function checklist(
  id: string,
  label: string,
  status: ChecklistStatus,
  message: string,
): ChecklistItem {
  return { id, label, status, message };
}

function checkAccount(
  destination: PublishingDestination,
  context: PublishingCapabilityContext,
): ChecklistItem {
  const account = context.accounts[destination.id];

  if (!account) {
    return checklist(
      "account",
      "Publishing account",
      "missing",
      "Account connection has not been verified.",
    );
  }

  if (account.connectionId !== destination.connectionId) {
    return checklist(
      "account",
      "Publishing account",
      "invalid",
      "Selected account does not match the verified connection.",
    );
  }

  if (!account.connected) {
    return checklist(
      "account",
      "Publishing account",
      "missing",
      "Reconnect this account before publishing.",
    );
  }

  if (!account.canPublish) {
    return checklist(
      "account",
      "Publishing account",
      "invalid",
      "This account does not have publishing permission.",
    );
  }

  return checklist(
    "account",
    "Publishing account",
    "added",
    "Connected account has publishing permission.",
  );
}

function checkSchedule(draft: PublishingDraft, now: Date): ChecklistItem {
  const { scheduledAt, timezone } = draft.publishing;

  // The readiness engine expects the schedule to be
  // normalized to an ISO UTC timestamp before use.
  // Convert datetime-local input with the existing
  // scheduling utilities at the form boundary.
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(scheduledAt)
  ) {
    return checklist(
      "schedule",
      "Publishing time",
      "missing",
      "Select a valid future date and time.",
    );
  }

  const date = new Date(scheduledAt);

  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) {
    return checklist(
      "schedule",
      "Publishing time",
      "invalid",
      "Scheduled publishing time must be in the future.",
    );
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    }).format(date);
  } catch {
    return checklist(
      "schedule",
      "Time zone",
      "invalid",
      "Select a valid IANA time zone.",
    );
  }

  return checklist(
    "schedule",
    "Publishing time",
    "added",
    "Valid future publishing time.",
  );
}

export function evaluatePublishingReadiness(
  draft: PublishingDraft,
  context: PublishingCapabilityContext,
  action: PublishingAction,
  now = new Date(),
): PublishingReadiness {
  const selected = draft.destinations;

  const issues: string[] = [];

  if (selected.length === 0) {
    issues.push("Select at least one publishing destination.");
  }

  // Current backend publishing and scheduling
  // claim services accept exactly one destination.
  //
  // Drafts can represent multiple platforms,
  // but execution must remain fail-closed.
  if (action !== "draft" && selected.length > 1) {
    issues.push(
      "Storm currently supports one destination per " +
        "publishing or scheduling request.",
    );
  }

  const destinationResults: DestinationReadiness[] = selected.map(
    (destination) => {
      const content = getDestinationContent(draft, destination.id);

      const capability = EXECUTION_CAPABILITIES[destination.platform];

      const items: ChecklistItem[] = [];

      if (!content) {
        items.push(
          checklist(
            "content",
            "Post content",
            "invalid",
            "Destination content could not be resolved.",
          ),
        );
      } else {
        items.push(
          checklist(
            "caption",
            "Caption",
            content.caption.trim() ? "added" : "missing",
            content.caption.trim()
              ? "Caption added."
              : "A caption is required.",
          ),
        );

        const mediaRequired =
          destination.format === "image" || destination.format === "video";

        const compatibleMedia = content.media.some(
          (media) => media.type === destination.format,
        );

        items.push(
          checklist(
            "media",
            "Media",
            mediaRequired
              ? compatibleMedia
                ? "added"
                : "missing"
              : content.media.length > 0
                ? "added"
                : "optional",
            mediaRequired
              ? compatibleMedia
                ? "Compatible media selected."
                : `A ${destination.format} is required.`
              : content.media.length > 0
                ? "Media selected."
                : "Media is optional for a text post.",
          ),
        );
      }

      if (action === "draft") {
        // Saving is not external publication.
        // Existing Post API supports platform identifiers
        // facebook, linkedin, and instagram as drafts.
        items.push(
          checklist(
            "format",
            "Draft format",
            capability ? "added" : "invalid",
            capability
              ? "Platform recognized for draft creation."
              : "Platform is not supported by the Post API.",
          ),
        );
      } else {
        items.push(checkAccount(destination, context));

        const formatSupported =
          capability?.formats.includes(destination.format) ?? false;

        items.push(
          checklist(
            "format",
            "Publishing format",
            formatSupported ? "added" : "invalid",
            formatSupported
              ? "Format supported by Storm publishing."
              : "This format is not available for publishing yet.",
          ),
        );

        const actionSupported =
          action === "now" ? capability?.publishNow : capability?.schedule;

        items.push(
          checklist(
            "availability",
            action === "now"
              ? "Publish Now availability"
              : "Scheduling availability",
            actionSupported ? "added" : "invalid",
            actionSupported
              ? "Supported by the current Storm integration."
              : action === "now"
                ? "Publish Now is unavailable for this platform."
                : "Scheduling is unavailable for this platform.",
          ),
        );

        if (action === "schedule") {
          items.push(checkSchedule(draft, now));
        }
      }

      if (
        action !== "draft" &&
        content &&
        destination.format === "text" &&
        content.media.length > 0
      ) {
        items.push(
          checklist(
            "media-publishing",
            "Media publishing support",
            "invalid",
            "The current Storm publisher supports " +
              "text-only posts. Remove attached media " +
              "or save this post as a draft.",
          ),
        );
      }

      const destinationIssues = items
        .filter(
          (item) => item.status === "missing" || item.status === "invalid",
        )
        .map((item) => item.message);

      return {
        destinationId: destination.id,
        platform: destination.platform,
        accountName: destination.accountName,
        ready: destinationIssues.length === 0,
        items,
        issues: destinationIssues,
      };
    },
  );

  const readyCount = destinationResults.filter((result) => result.ready).length;

  for (const result of destinationResults) {
    for (const issue of result.issues) {
      issues.push(`${result.platform} (${result.accountName}): ${issue}`);
    }
  }

  return {
    action,
    ready:
      selected.length > 0 &&
      issues.length === 0 &&
      readyCount === selected.length,
    readyCount,
    totalCount: selected.length,
    destinations: destinationResults,
    issues,
  };
}
