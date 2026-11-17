import { describe, expect, it } from "vitest";

import { type GenerateImageCommand } from "@/lib/imageGeneration";

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

  it("preserves a branded text generation command", () => {
    const storage = createStorage();

    const command: GenerateImageCommand = {
      ...makeCommand(),
      image: {
        ...makeCommand().image,
        branding: {
          type: "text",
          text: "BREW CO.",
          position: "bottom-right",
          sizePercent: 20,
          opacity: 0.8,
        },
      },
    };

    const record = createUncertainRecovery(scope, command);

    expect(savePublishingRecovery(storage, scope, record)).toBe(true);

    const restored = readPublishingRecovery(storage, scope);

    expect(restored.status).toBe("found");

    if (restored.status !== "found" || restored.record.state !== "uncertain") {
      throw new Error("Expected uncertain recovery.");
    }

    expect(restored.record.command).toEqual(command);

    expect(restored.record.command.idempotencyKey).toBe(command.idempotencyKey);
  });

  it("preserves a workspace-logo generation command", () => {
    const storage = createStorage();

    const command: GenerateImageCommand = {
      ...makeCommand(),
      image: {
        ...makeCommand().image,
        branding: {
          type: "logo",
          position: "top-left",
          sizePercent: 15,
          opacity: 0.6,
        },
      },
    };

    expect(
      savePublishingRecovery(
        storage,
        scope,
        createUncertainRecovery(scope, command),
      ),
    ).toBe(true);

    const restored = readPublishingRecovery(storage, scope);

    expect(restored.status).toBe("found");

    if (restored.status !== "found" || restored.record.state !== "uncertain") {
      throw new Error("Expected uncertain recovery.");
    }

    expect(restored.record.command).toEqual(command);
  });

  it("does not allow form mutations to change recovered branding", () => {
    const storage = createStorage();

    const command: GenerateImageCommand = {
      ...makeCommand(),
      image: {
        ...makeCommand().image,
        branding: {
          type: "text",
          text: "ORIGINAL BRAND",
          position: "top-right",
          sizePercent: 10,
          opacity: 0.5,
        },
      },
    };

    // Capture the original command before editing
    // the source object.
    const recovery = createUncertainRecovery(scope, command);

    // Narrow the discriminated union using a local
    // reference to the branding value.
    const originalBranding = command.image.branding;

    if (!originalBranding || originalBranding.type !== "text") {
      throw new Error("Expected text branding.");
    }

    // Simulate changing the original form state
    // after the immutable recovery snapshot.
    originalBranding.text = "CHANGED BRAND";
    originalBranding.sizePercent = 30;

    expect(savePublishingRecovery(storage, scope, recovery)).toBe(true);

    const restored = readPublishingRecovery(storage, scope);

    if (restored.status !== "found" || restored.record.state !== "uncertain") {
      throw new Error("Expected uncertain recovery.");
    }

    // Narrow the restored branding separately.
    const recoveredBranding = restored.record.command.image.branding;

    if (!recoveredBranding || recoveredBranding.type !== "text") {
      throw new Error("Expected recovered text branding.");
    }

    expect(recoveredBranding.text).toBe("ORIGINAL BRAND");

    expect(recoveredBranding.sizePercent).toBe(10);

    expect(restored.record.command.idempotencyKey).toBe(command.idempotencyKey);
  });

  it("rejects invalid branded command properties", () => {
    const storage = createStorage();

    const key = getPublishingRecoveryKey(scope);

    const invalidRecords = [
      {
        type: "text",
        text: "",
        position: "bottom-right",
        sizePercent: 20,
        opacity: 0.8,
      },
      {
        type: "logo",
        position: "somewhere",
        sizePercent: 20,
        opacity: 0.8,
      },
      {
        type: "logo",
        position: "bottom-right",
        sizePercent: 100,
        opacity: 0.8,
      },
      {
        type: "text",
        text: "BRAND",
        position: "top-left",
        sizePercent: 20,
        opacity: 2,
      },
      {
        type: "logo",
        position: "bottom-right",
        sizePercent: 20,
        opacity: 0.8,
        unauthorizedProperty: true,
      },
    ];

    for (const branding of invalidRecords) {
      const command = makeCommand();

      storage.setItem(
        key,
        JSON.stringify({
          version: 1,
          state: "uncertain",
          ...scope,
          savedAt: new Date().toISOString(),
          command: {
            ...command,
            image: {
              ...command.image,
              branding,
            },
          },
        }),
      );

      expect(readPublishingRecovery(storage, scope).status).toBe("invalid");
    }
  });

  it("remains compatible with existing unbranded records", () => {
    const storage = createStorage();

    const command = makeCommand();

    expect(
      savePublishingRecovery(
        storage,
        scope,
        createUncertainRecovery(scope, command),
      ),
    ).toBe(true);

    const result = readPublishingRecovery(storage, scope);

    expect(result.status).toBe("found");

    if (result.status !== "found" || result.record.state !== "uncertain") {
      throw new Error("Expected unbranded recovery.");
    }

    expect(result.record.command).toEqual(command);
  });
});
