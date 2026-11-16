import {
  validateImagePrompt,
  type GenerateImageCommand,
} from "@/lib/imageGeneration";

import { snapshotImageGenerationCommand } from "@/lib/imageGenerationCommandSnapshot";

const STORAGE_PREFIX = "storm:publishing-image-recovery:v1";

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

const USER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublishingGenerationRecovery =
  | {
      version: 1;
      state: "accepted";
      ownerUserId: string;
      workspaceId: string;
      assetId: string;
      savedAt: string;
    }
  | {
      version: 1;
      state: "uncertain";
      ownerUserId: string;
      workspaceId: string;
      command: GenerateImageCommand;
      savedAt: string;
    };

export type RecoveryScope = {
  ownerUserId: string;
  workspaceId: string;
};

export type RecoveryReadResult =
  | {
      status: "empty";
      record: null;
    }
  | {
      status: "found";
      record: PublishingGenerationRecovery;
    }
  | {
      status: "invalid" | "unavailable";
      record: null;
    };

export type RecoveryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validScope(scope: RecoveryScope): boolean {
  const validUserId =
    OBJECT_ID_PATTERN.test(scope.ownerUserId) ||
    USER_UUID_PATTERN.test(scope.ownerUserId);

  return validUserId && OBJECT_ID_PATTERN.test(scope.workspaceId);
}

export function getPublishingRecoveryKey(scope: RecoveryScope): string {
  if (!validScope(scope)) {
    throw new Error("Invalid generation recovery scope.");
  }

  return [
    STORAGE_PREFIX,
    scope.ownerUserId.toLowerCase(),
    scope.workspaceId.toLowerCase(),
  ].join(":");
}

function validCommand(value: unknown): value is GenerateImageCommand {
  if (!isObject(value) || !isObject(value.image)) {
    return false;
  }

  if (
    typeof value.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(value.idempotencyKey)
  ) {
    return false;
  }

  if (
    !["square", "portrait", "landscape"].includes(
      String(value.image.aspectRatio),
    )
  ) {
    return false;
  }

  // Initial composer generation supports no branding.
  // Other branding types are introduced in 13.4.4.2E.
  if (!isObject(value.image.branding) || value.image.branding.type !== "none") {
    return false;
  }

  if (
    typeof value.image.prompt !== "string" ||
    value.image.prompt.length > 3000
  ) {
    return false;
  }

  try {
    validateImagePrompt(value.image.prompt);
    return true;
  } catch {
    return false;
  }
}

function parseRecoveryRecord(
  value: unknown,
  scope: RecoveryScope,
): PublishingGenerationRecovery | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    value.ownerUserId !== scope.ownerUserId ||
    value.workspaceId !== scope.workspaceId ||
    typeof value.savedAt !== "string" ||
    !Number.isFinite(Date.parse(value.savedAt))
  ) {
    return null;
  }

  if (value.state === "accepted") {
    if (
      typeof value.assetId !== "string" ||
      !OBJECT_ID_PATTERN.test(value.assetId)
    ) {
      return null;
    }

    return {
      version: 1,
      state: "accepted",
      ownerUserId: scope.ownerUserId,
      workspaceId: scope.workspaceId,
      assetId: value.assetId,
      savedAt: value.savedAt,
    };
  }

  if (value.state === "uncertain") {
    if (!validCommand(value.command)) {
      return null;
    }

    return {
      version: 1,
      state: "uncertain",
      ownerUserId: scope.ownerUserId,
      workspaceId: scope.workspaceId,
      command: snapshotImageGenerationCommand(value.command),
      savedAt: value.savedAt,
    };
  }

  return null;
}

export function readPublishingRecovery(
  storage: RecoveryStorage,
  scope: RecoveryScope,
): RecoveryReadResult {
  let key: string;

  try {
    key = getPublishingRecoveryKey(scope);
  } catch {
    return { status: "invalid", record: null };
  }

  let serialized: string | null;

  try {
    serialized = storage.getItem(key);
  } catch {
    return { status: "unavailable", record: null };
  }

  if (serialized === null) {
    return { status: "empty", record: null };
  }

  try {
    const record = parseRecoveryRecord(
      JSON.parse(serialized) as unknown,
      scope,
    );

    if (!record) {
      // Do NOT silently erase an unrecognized record.
      // It may represent an uncertain charged request.
      return { status: "invalid", record: null };
    }

    return { status: "found", record };
  } catch {
    return { status: "invalid", record: null };
  }
}

export function savePublishingRecovery(
  storage: RecoveryStorage,
  scope: RecoveryScope,
  record: PublishingGenerationRecovery,
): boolean {
  const validRecord = parseRecoveryRecord(record, scope);

  if (!validRecord || !validScope(scope)) {
    return false;
  }

  try {
    storage.setItem(
      getPublishingRecoveryKey(scope),
      JSON.stringify(validRecord),
    );

    return true;
  } catch {
    // Storage can fail due to browser restrictions
    // or storage quota limits.
    return false;
  }
}

export function clearPublishingRecovery(
  storage: RecoveryStorage,
  scope: RecoveryScope,
): boolean {
  try {
    storage.removeItem(getPublishingRecoveryKey(scope));

    return true;
  } catch {
    return false;
  }
}

export function createAcceptedRecovery(
  scope: RecoveryScope,
  assetId: string,
): PublishingGenerationRecovery {
  const record: PublishingGenerationRecovery = {
    version: 1,
    state: "accepted",
    ...scope,
    assetId,
    savedAt: new Date().toISOString(),
  };

  if (!parseRecoveryRecord(record, scope)) {
    throw new Error("Invalid accepted generation record.");
  }

  return record;
}

export function createUncertainRecovery(
  scope: RecoveryScope,
  command: GenerateImageCommand,
): PublishingGenerationRecovery {
  const record: PublishingGenerationRecovery = {
    version: 1,
    state: "uncertain",
    ...scope,
    command: snapshotImageGenerationCommand(command),
    savedAt: new Date().toISOString(),
  };

  if (!parseRecoveryRecord(record, scope)) {
    throw new Error("Invalid uncertain generation record.");
  }

  return record;
}
