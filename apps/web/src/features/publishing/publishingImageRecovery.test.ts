import { describe, expect, it } from "vitest";

import type { GenerateImageCommand } from "@/lib/imageGeneration";

import {
  clearPublishingRecovery,
  createAcceptedRecovery,
  createUncertainRecovery,
  getPublishingRecoveryKey,
  readPublishingRecovery,
  savePublishingRecovery,
  type RecoveryScope,
  type RecoveryStorage,
} from "./publishingImageRecovery";

const USER_A = "507f1f77bcf86cd799439001";
const USER_B = "507f1f77bcf86cd799439002";

const WORKSPACE_A = "507f1f77bcf86cd799439011";
const WORKSPACE_B = "507f1f77bcf86cd799439012";

const ASSET_A = "507f1f77bcf86cd799439022";

const scope: RecoveryScope = {
  ownerUserId: USER_A,
  workspaceId: WORKSPACE_A,
};

function createStorage(): RecoveryStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function makeCommand(): GenerateImageCommand {
  return {
    idempotencyKey: "11111111-2222-4333-8444-555555555555",
    image: {
      prompt: "A premium coffee product photographed in a studio.",
      aspectRatio: "square",
      branding: {
        type: "none",
      },
    },
  };
}

describe("Publishing image recovery storage", () => {
  it("saves and restores an accepted generation", () => {
    const storage = createStorage();

    const record = createAcceptedRecovery(scope, ASSET_A);

    expect(savePublishingRecovery(storage, scope, record)).toBe(true);

    expect(readPublishingRecovery(storage, scope)).toEqual({
      status: "found",
      record,
    });
  });

  it("preserves the uncertain request payload", () => {
    const storage = createStorage();

    const command = makeCommand();

    const record = createUncertainRecovery(scope, command);

    expect(savePublishingRecovery(storage, scope, record)).toBe(true);

    const result = readPublishingRecovery(storage, scope);

    expect(result.status).toBe("found");

    if (result.status !== "found") {
      throw new Error("Recovery record was not restored.");
    }

    expect(result.record.state).toBe("uncertain");

    if (result.record.state !== "uncertain") {
      throw new Error("Expected uncertain recovery.");
    }

    expect(result.record.command).toEqual(command);
  });

  it("does not use mutated form values for recovery", () => {
    const storage = createStorage();
    const command = makeCommand();

    const record = createUncertainRecovery(scope, command);

    command.image.prompt = "A completely different landscape at sunset.";

    savePublishingRecovery(storage, scope, record);

    const result = readPublishingRecovery(storage, scope);

    expect(result.status).toBe("found");

    if (result.status === "found" && result.record.state === "uncertain") {
      expect(result.record.command.image.prompt).toBe(
        "A premium coffee product photographed in a studio.",
      );
    }
  });

  it("isolates recovery by workspace", () => {
    const storage = createStorage();

    savePublishingRecovery(
      storage,
      scope,
      createAcceptedRecovery(scope, ASSET_A),
    );

    expect(
      readPublishingRecovery(storage, {
        ownerUserId: USER_A,
        workspaceId: WORKSPACE_B,
      }).status,
    ).toBe("empty");
  });

  it("isolates recovery by user", () => {
    const storage = createStorage();

    savePublishingRecovery(
      storage,
      scope,
      createAcceptedRecovery(scope, ASSET_A),
    );

    expect(
      readPublishingRecovery(storage, {
        ownerUserId: USER_B,
        workspaceId: WORKSPACE_A,
      }).status,
    ).toBe("empty");
  });

  it("rejects malformed recovery records without erasing them", () => {
    const storage = createStorage();
    const key = getPublishingRecoveryKey(scope);

    storage.setItem(key, "{not valid json");

    expect(readPublishingRecovery(storage, scope).status).toBe("invalid");

    expect(storage.getItem(key)).toBe("{not valid json");
  });

  it("rejects malformed uncertain commands", () => {
    const storage = createStorage();
    const key = getPublishingRecoveryKey(scope);

    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        state: "uncertain",
        ...scope,
        savedAt: new Date().toISOString(),
        command: {
          idempotencyKey: "invalid",
          image: {
            prompt: "short",
            aspectRatio: "square",
            branding: { type: "none" },
          },
        },
      }),
    );

    expect(readPublishingRecovery(storage, scope).status).toBe("invalid");
  });

  it("handles unavailable storage", () => {
    const storage: RecoveryStorage = {
      getItem: () => {
        throw new Error("Storage unavailable");
      },
      setItem: () => {
        throw new Error("Storage unavailable");
      },
      removeItem: () => {
        throw new Error("Storage unavailable");
      },
    };

    expect(readPublishingRecovery(storage, scope).status).toBe("unavailable");

    expect(
      savePublishingRecovery(
        storage,
        scope,
        createAcceptedRecovery(scope, ASSET_A),
      ),
    ).toBe(false);

    expect(clearPublishingRecovery(storage, scope)).toBe(false);
  });

  it("clears only the scoped recovery record", () => {
    const storage = createStorage();

    const otherScope: RecoveryScope = {
      ownerUserId: USER_A,
      workspaceId: WORKSPACE_B,
    };

    savePublishingRecovery(
      storage,
      scope,
      createAcceptedRecovery(scope, ASSET_A),
    );

    savePublishingRecovery(
      storage,
      otherScope,
      createAcceptedRecovery(otherScope, ASSET_A),
    );

    expect(clearPublishingRecovery(storage, scope)).toBe(true);

    expect(readPublishingRecovery(storage, scope).status).toBe("empty");

    expect(readPublishingRecovery(storage, otherScope).status).toBe("found");
  });

  it("supports a Supabase UUID user ID", () => {
    const storage = createStorage();

    const supabaseScope: RecoveryScope = {
      ownerUserId: "11111111-2222-4333-8444-555555555555",
      workspaceId: WORKSPACE_A,
    };

    const record = createAcceptedRecovery(supabaseScope, ASSET_A);

    expect(savePublishingRecovery(storage, supabaseScope, record)).toBe(true);

    expect(readPublishingRecovery(storage, supabaseScope)).toEqual({
      status: "found",
      record,
    });
  });

  it("does not confuse different Supabase users", () => {
    const storage = createStorage();

    const firstUser: RecoveryScope = {
      ownerUserId: "11111111-2222-4333-8444-555555555555",
      workspaceId: WORKSPACE_A,
    };

    const secondUser: RecoveryScope = {
      ownerUserId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      workspaceId: WORKSPACE_A,
    };

    savePublishingRecovery(
      storage,
      firstUser,
      createAcceptedRecovery(firstUser, ASSET_A),
    );

    expect(readPublishingRecovery(storage, secondUser).status).toBe("empty");
  });
});
