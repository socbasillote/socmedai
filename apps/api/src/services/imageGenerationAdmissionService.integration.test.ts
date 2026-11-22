import { brandKitSchema } from "../schemas/brandKitSchema.js";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import {
  UserCreditWallet,
  ImageDailyUsage,
  ImageWorkspaceCapacity,
  ImageGenerationAdmission,
} from "../models/ImageGenerationAccounting.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import {
  admitImageGeneration,
  releaseImageGenerationCapacity,
  utcUsageDay,
} from "./imageGenerationAdmissionService.js";

let mongo: MongoMemoryReplSet;
let workspaceId: string;
let profileId: mongoose.Types.ObjectId;

const authUser = {
  id: "credit-integration-user",
} as AuthenticatedUser;

const otherUser = {
  id: "another-credit-user",
} as AuthenticatedUser;

const image = {
  prompt: "A beautiful product photograph with professional lighting.",
  aspectRatio: "square" as const,
};

const LOGO_ID = "6af31be35bba81eee2f1be9b";
const SECOND_LOGO_ID = "6af31be35bba81eee2f1be9c";

function createLogoSettings(
  logoId = LOGO_ID,
  overrides: Record<string, unknown> = {},
) {
  return {
    enabled: true,

    logo: {
      storageKey: `workspaces/${workspaceId}/logos/${logoId}.png`,
      sha256: "a".repeat(64),
    },

    position: "bottom-right",
    sizePercent: 20,
    opacity: 0.8,

    ...overrides,
  };
}

async function setWorkspaceLogoSettings(settings: unknown) {
  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $set: {
        "settings.logoOverlay": settings,
      },
    },
  );
}

async function getSavedSnapshot(assetId: string) {
  const asset = await MediaAsset.findById(assetId).lean();

  return asset?.logoOverlaySnapshot;
}

function request(
  key = "credit-request-0001",
  policy: { dailyLimit: number | null; maxActive: number | null } = { dailyLimit: 3, maxActive: 2 },
) {
  return {
    authUser,
    workspaceId,
    idempotencyKey: key,
    image,
    generation: {
      provider: "mock",
      model: "storm-mock-image-v1",
    },
    policy,
  };
}

function logoRequest(key: string) {
  const base = request(key);

  return {
    ...base,
    image: {
      ...base.image,
      branding: {
        type: "logo" as const,
      },
    },
  };
}

async function balance() {
  const wallet = await UserCreditWallet.findOne({
    userId: profileId,
  });

  return wallet?.balance;
}

async function activeCount() {
  const capacity = await ImageWorkspaceCapacity.findOne({
    workspaceId,
  });

  return capacity?.active ?? 0;
}

async function attemptCount() {
  const usage = await ImageDailyUsage.findOne({
    workspaceId,
    dayUtc: utcUsageDay(),
  });

  return usage?.attempts ?? 0;
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoose.connect(mongo.getUri());

  await Promise.all([
    MediaAsset.createIndexes(),
    UserCreditWallet.createIndexes(),
    ImageDailyUsage.createIndexes(),
    ImageWorkspaceCapacity.createIndexes(),
    ImageGenerationAdmission.createIndexes(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    MediaAsset.deleteMany({}),
    UserCreditWallet.deleteMany({}),
    ImageDailyUsage.deleteMany({}),
    ImageWorkspaceCapacity.deleteMany({}),
    ImageGenerationAdmission.deleteMany({}),
  ]);

  await Workspace.collection.deleteMany({});
  await UserProfile.collection.deleteMany({});

  profileId = new mongoose.Types.ObjectId();
  const workspaceObjectId = new mongoose.Types.ObjectId();

  workspaceId = String(workspaceObjectId);

  await UserProfile.collection.insertOne({
    _id: profileId,
    supabaseUserId: authUser.id,
  });

  await Workspace.collection.insertOne({
    _id: workspaceObjectId,
    ownerUserId: profileId,
    name: "Credits Test Workspace",
  });

  // Credits are seeded by trusted test setup.
  // No client-facing credit grant is involved.
  await UserCreditWallet.create({
    userId: profileId,
    balance: 5,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("Credit-aware generation admission", () => {
  it("does not spend a credit when an explicitly requested brand kit is unavailable", async () => {
    const base = request("missing-brand-kit-0001");
    await expect(admitImageGeneration({ ...base, image: { ...base.image, useBrandKit: true } })).rejects.toMatchObject({ statusCode: 409 });
    expect(await balance()).toBe(5);
    expect(await MediaAsset.countDocuments({})).toBe(0);
  });
  it("freezes visual style and exact text for worker recovery and detects changed design retries", async () => {
    const base = request("style-snapshot-request-001");
    const postDesign = { style: "cinematic" as const, details: "Bright daylight", captionContext: "Coffee", text: "Make it count.", author: "Ana" };
    const command = { ...base, image: { ...base.image, useBrandKit: false, postDesign } };
    const admitted = await admitImageGeneration(command);
    expect((await MediaAsset.findById(admitted.asset._id))?.generation.postDesign).toEqual(postDesign);
    expect((await admitImageGeneration(command)).created).toBe(false);
    await expect(admitImageGeneration({ ...command, image: { ...command.image, postDesign: { ...postDesign, style: "editorial" } } })).rejects.toMatchObject({ statusCode: 409 });
    expect(await balance()).toBe(4);
  });
  it("honors a per-image opt-out without mutating the workspace brand kit", async () => {
    const brandKit = brandKitSchema.parse({
      enabled: true,
      colors: { primary: "#7C3AED", accent: "#F59E0B", background: "#FFFFFF", text: "#0F172A" },
      typography: { headingFont: "Georgia", bodyFont: "Arial" }, imageStyle: "Warm studio lighting",
      layout: { textAlignment: "center", logoPosition: "top-left", spacing: "spacious", logoVariant: "primary" },
    });
    await Workspace.updateOne({ _id: workspaceId }, { $set: { "settings.brandKit": brandKit } });
    const base = request("brand-kit-declined-0001");
    const command = { ...base, image: { ...base.image, useBrandKit: false } };
    const admitted = await admitImageGeneration(command);
    expect((await MediaAsset.findById(admitted.asset._id))?.brandKitSnapshot).toBeUndefined();
    expect((await Workspace.findById(workspaceId))?.settings?.brandKit).toEqual(brandKit);
    expect((await admitImageGeneration(command)).created).toBe(false);
    await expect(admitImageGeneration({ ...command, image: { ...command.image, useBrandKit: true } })).rejects.toMatchObject({ statusCode: 409 });
    expect(await balance()).toBe(4);
  });
  it("freezes brand-kit defaults and the selected logo variant for retries and worker completion", async () => {
    const brandKit = brandKitSchema.parse({
    enabled: true,
    colors: { primary: "#7C3AED", accent: "#F59E0B", background: "#FFFFFF", text: "#0F172A" },
    typography: { headingFont: "Georgia", bodyFont: "Arial" },
    imageStyle: "Warm natural light, muted earth tones, and soft paper texture.",
    layout: { textAlignment: "center", logoPosition: "top-left", spacing: "spacious", logoVariant: "light" },
  });
    const primary = createLogoSettings();
    const light = createLogoSettings(SECOND_LOGO_ID);
    await Workspace.updateOne({ _id: workspaceId }, { $set: { "settings.brandKit": brandKit, "settings.logoOverlay": primary, "settings.brandKitLogoVariants.light": light } });
    const command = logoRequest("brand-kit-snapshot-0001");
    const first = await admitImageGeneration(command);
    const asset = await MediaAsset.findById(first.asset._id);
    expect(asset?.brandKitSnapshot).toEqual(brandKit);
    expect(asset?.brandingSnapshot.logo.storageKey).toBe(light.logo.storageKey);
    expect(asset?.brandingSnapshot.position).toBe("top-left");
    await Workspace.updateOne({ _id: workspaceId }, { $set: { "settings.brandKit.imageStyle": "New style", "settings.brandKit.colors.primary": "#FF0000" } });
    const retry = await admitImageGeneration(command);
    expect(retry.created).toBe(false);
    expect((await MediaAsset.findById(retry.asset._id))?.brandKitSnapshot).toEqual(brandKit);
    expect(await balance()).toBe(4);
  });
  it("falls back from a missing logo variant and honors an explicit per-image placement", async () => {
    const brandKit = brandKitSchema.parse({
    enabled: true,
    colors: { primary: "#7C3AED", accent: "#F59E0B", background: "#FFFFFF", text: "#0F172A" },
    typography: { headingFont: "Georgia", bodyFont: "Arial" },
    imageStyle: "Warm natural light, muted earth tones, and soft paper texture.",
    layout: { textAlignment: "center", logoPosition: "top-left", spacing: "spacious", logoVariant: "light" },
  });
    await Workspace.updateOne({ _id: workspaceId }, { $set: { "settings.brandKit": brandKit, "settings.logoOverlay": createLogoSettings() } });
    const base = request("brand-kit-override-0001");
    const admitted = await admitImageGeneration({ ...base, image: { ...base.image, branding: { type: "logo", position: "bottom-right" } } });
    expect(admitted.asset.brandingSnapshot.logo.storageKey).toContain(LOGO_ID);
    expect(admitted.asset.brandingSnapshot.position).toBe("bottom-right");
    expect(admitted.asset.brandKitSnapshot.layout.logoPosition).toBe("bottom-right");
  });

  it("debits one credit for a new generation", async () => {
    const result = await admitImageGeneration(request());

    expect(result.created).toBe(true);
    expect(result.creditsChargedNow).toBe(1);

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(1);
  });

  it("does not charge for an idempotent retry", async () => {
    const first = await admitImageGeneration(request());

    const retry = await admitImageGeneration(request());

    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);

    expect(String(retry.asset._id)).toBe(String(first.asset._id));

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("rejects changed settings under the same key", async () => {
    await admitImageGeneration(request());

    await expect(
      admitImageGeneration({
        ...request(),
        image: {
          ...image,
          prompt: "A completely different product photograph.",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await balance()).toBe(4);
  });

  it("rejects insufficient credits without partial writes", async () => {
    await UserCreditWallet.updateOne(
      { userId: profileId },
      { $set: { balance: 0 } },
    );

    await expect(admitImageGeneration(request())).rejects.toMatchObject({
      statusCode: 402,
    });

    expect(await balance()).toBe(0);
    expect(await attemptCount()).toBe(0);
    expect(await activeCount()).toBe(0);

    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it("enforces the daily workspace limit", async () => {
    const policy = {
      dailyLimit: 1,
      maxActive: 2,
    };

    await admitImageGeneration(request("daily-request-0001", policy));

    await expect(
      admitImageGeneration(request("daily-request-0002", policy)),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("enforces the active workspace limit", async () => {
    const policy = {
      dailyLimit: 3,
      maxActive: 1,
    };

    await admitImageGeneration(request("active-request-0001", policy));

    await expect(
      admitImageGeneration(request("active-request-0002", policy)),
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("releases an active slot once after terminal completion", async () => {
    const admitted = await admitImageGeneration(request());

    await MediaAsset.updateOne(
      { _id: admitted.asset._id },
      { $set: { status: "failed" } },
    );

    const assetId = String(admitted.asset._id);

    expect(
      await releaseImageGenerationCapacity(authUser, workspaceId, assetId),
    ).toBe(true);

    expect(
      await releaseImageGenerationCapacity(authUser, workspaceId, assetId),
    ).toBe(false);

    expect(await activeCount()).toBe(0);
    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
  });

  it("cannot release a pending generation", async () => {
    const admitted = await admitImageGeneration(request());

    await expect(
      releaseImageGenerationCapacity(
        authUser,
        workspaceId,
        String(admitted.asset._id),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await activeCount()).toBe(1);
  });

  it("admits concurrent identical requests only once", async () => {
    const outcomes = await Promise.all([
      admitImageGeneration(request()),
      admitImageGeneration(request()),
      admitImageGeneration(request()),
    ]);

    expect(outcomes.filter((result) => result.created)).toHaveLength(1);

    expect(
      new Set(outcomes.map((result) => String(result.asset._id))).size,
    ).toBe(1);

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("cannot overspend credits across different requests", async () => {
    await UserCreditWallet.updateOne(
      { userId: profileId },
      { $set: { balance: 1 } },
    );

    const outcomes = await Promise.allSettled([
      admitImageGeneration(request("credit-race-request-0001")),
      admitImageGeneration(request("credit-race-request-0002")),
    ]);
    console.log(
      "Concurrent admission outcomes:",
      outcomes.map((result, index) => ({
        request: index + 1,
        status: result.status,
        error:
          result.status === "rejected"
            ? {
                name: result.reason?.name,
                message: result.reason?.message,
                code: result.reason?.code,
                errorLabels: result.reason?.errorLabels,
                stack: result.reason?.stack,
              }
            : null,
      })),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(await balance()).toBe(0);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("rejects unauthorized workspace admission", async () => {
    await expect(
      admitImageGeneration({
        ...request(),
        authUser: otherUser,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await balance()).toBe(5);
  });

  it("uses UTC calendar days", () => {
    expect(utcUsageDay(new Date("2026-11-07T23:59:59Z"))).toBe("2026-11-07");

    expect(utcUsageDay(new Date("2026-11-08T00:00:00Z"))).toBe("2026-11-08");
  });

  it("persists disabled branding for an unconfigured workspace", async () => {
    const result = await admitImageGeneration(
      request("snapshot-disabled-0001"),
    );

    const snapshot = await getSavedSnapshot(String(result.asset._id));

    expect(snapshot).toMatchObject({
      enabled: false,
      logo: null,
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    expect(await balance()).toBe(4);
    expect(await activeCount()).toBe(1);
  });

  it("captures the exact enabled logo configuration", async () => {
    const settings = createLogoSettings();

    await setWorkspaceLogoSettings(settings);

    const result = await admitImageGeneration(
      logoRequest("snapshot-enabled-0001"),
    );

    const snapshot = await getSavedSnapshot(String(result.asset._id));

    expect(snapshot).toMatchObject(settings);

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  it("preserves the admitted logo after workspace branding changes", async () => {
    const original = createLogoSettings();

    await setWorkspaceLogoSettings(original);

    const admitted = await admitImageGeneration(
      logoRequest("snapshot-original-0001"),
    );

    const changed = createLogoSettings(SECOND_LOGO_ID, {
      position: "top-left",
      sizePercent: 10,
      opacity: 0.5,
    });

    await setWorkspaceLogoSettings(changed);

    const snapshot = await getSavedSnapshot(String(admitted.asset._id));

    expect(snapshot).toMatchObject(original);

    expect(snapshot?.logo?.storageKey).not.toBe(changed.logo.storageKey);

    const currentWorkspace = await Workspace.findById(workspaceId).lean();

    expect(currentWorkspace?.settings.logoOverlay.logo.storageKey).toBe(
      changed.logo.storageKey,
    );
  });

  it("returns the original snapshot on idempotent retry after a logo change", async () => {
    await setWorkspaceLogoSettings(createLogoSettings());

    const first = await admitImageGeneration(
      logoRequest("snapshot-retry-0001"),
    );

    await setWorkspaceLogoSettings(
      createLogoSettings(SECOND_LOGO_ID, {
        opacity: 0.4,
      }),
    );

    const retry = await admitImageGeneration(
      logoRequest("snapshot-retry-0001"),
    );

    expect(retry.created).toBe(false);
    expect(retry.creditsChargedNow).toBe(0);

    expect(String(retry.asset._id)).toBe(String(first.asset._id));

    const snapshot = await getSavedSnapshot(String(first.asset._id));

    expect(snapshot?.logo?.storageKey).toBe(
      `workspaces/${workspaceId}/logos/${LOGO_ID}.png`,
    );

    expect(snapshot?.opacity).toBe(0.8);

    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);

    expect(await MediaAsset.countDocuments()).toBe(1);
  });

  it("rejects invalid branding without debiting credits", async () => {
    await setWorkspaceLogoSettings({
      enabled: true,
      logo: null,
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    await expect(
      admitImageGeneration(logoRequest("snapshot-invalid-0001")),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await balance()).toBe(5);
    expect(await attemptCount()).toBe(0);
    expect(await activeCount()).toBe(0);

    expect(await MediaAsset.countDocuments()).toBe(0);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(0);
  });

  it("keeps a consistent logo snapshot when workspace settings change during admission", async () => {
    const original = createLogoSettings();

    const replacement = createLogoSettings(SECOND_LOGO_ID, {
      position: "top-left",
      sizePercent: 10,
      opacity: 0.5,
    });

    await setWorkspaceLogoSettings(original);

    let updateCompleted = false;
    let replacementUpdate: Promise<void> | undefined;

    const admitted = await admitImageGeneration({
      ...request("snapshot-enabled-0001"),
      image: {
        prompt: "Professional product photography with studio lighting.",
        aspectRatio: "square",
        branding: {
          type: "logo",
        },
      },

      faultInjection: {
        async beforeDebitLedgerInsert() {
          // This executes after admission has read
          // workspace settings and created the
          // image asset inside its transaction.
          //
          // Start a competing write. Admission now holds the shared workspace
          // guard, so this update must complete after admission commits.
          replacementUpdate = setWorkspaceLogoSettings(replacement).then(() => {
            updateCompleted = true;
          });
        },
      },
    });

    await replacementUpdate;
    expect(updateCompleted).toBe(true);

    const savedSnapshot = await getSavedSnapshot(String(admitted.asset._id));

    const currentWorkspace = await Workspace.findById(workspaceId).lean();

    // The admitted generation retains Logo A.
    expect(savedSnapshot).toMatchObject(original);

    // The workspace now has Logo B.
    expect(currentWorkspace?.settings.logoOverlay).toMatchObject(replacement);

    // Billing and admission remain consistent.
    expect(await balance()).toBe(4);
    expect(await attemptCount()).toBe(1);
    expect(await activeCount()).toBe(1);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(1);

    expect(await MediaAsset.countDocuments()).toBe(1);
  });

  it("rolls back admission when an asynchronous operation fails", async () => {
    await setWorkspaceLogoSettings(createLogoSettings());

    await expect(
      admitImageGeneration({
        ...request("snapshot-rollback-0001"),

        faultInjection: {
          async beforeDebitLedgerInsert() {
            throw new Error("Simulated asynchronous admission failure");
          },
        },
      }),
    ).rejects.toThrow("Simulated asynchronous admission failure");

    expect(await balance()).toBe(5);
    expect(await attemptCount()).toBe(0);
    expect(await activeCount()).toBe(0);

    expect(await MediaAsset.countDocuments()).toBe(0);

    expect(await ImageGenerationAdmission.countDocuments()).toBe(0);
  });

  it("does not inherit workspace branding when the image selects none", async () => {
    // This test assumes the workspace fixture already
    // has an enabled logo configured.
    const result = await admitImageGeneration({
      ...request("snapshot-no-branding-0001"),
      image: {
        prompt: "A professional studio photograph of a coffee product.",
        aspectRatio: "square",
        branding: {
          type: "none",
        },
      },
    });

    expect(result.asset.logoOverlaySnapshot?.enabled).toBe(false);

    expect(result.asset.logoOverlaySnapshot?.logo).toBeNull();

    expect(result.creditsChargedNow).toBe(1);
  });

  it("admits text branding and persists the immutable label", async () => {
    const result = await admitImageGeneration({
      ...request("text-admission-0001"),

      image: {
        prompt: "A professional studio photograph of a coffee product.",
        aspectRatio: "square",

        branding: {
          type: "text",
          text: "BREW CO.",
          position: "bottom-right",
          sizePercent: 20,
          opacity: 0.8,
        },
      },
    });

    expect(result.created).toBe(true);
    expect(result.creditsChargedNow).toBe(1);

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.toObject()).toMatchObject({
      type: "text",
      text: "BREW CO.",
      position: "bottom-right",
      sizePercent: 20,
      opacity: 0.8,
    });

    expect(saved?.logoOverlaySnapshot?.enabled).toBe(false);

    expect(saved?.logoOverlaySnapshot?.logo).toBeNull();

    expect(saved?.generationExecution?.phase).toBe("reserved");
  });

  it("allows an unbranded image despite invalid unused workspace logo settings", async () => {
    // Persist deliberately invalid logo settings.
    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          "settings.logoOverlay": {
            enabled: true,
            logo: {
              storageKey: "invalid-logo-path",
              sha256: "invalid-checksum",
            },
            position: "bottom-right",
            sizePercent: 20,
            opacity: 0.8,
          },
        },
      },
    );

    const admitted = await admitImageGeneration({
      ...request("snapshot-invalid-unused-0001"),
      image: {
        prompt: "A professional studio photograph of a coffee product.",
        aspectRatio: "square",
        branding: {
          type: "none",
        },
      },
    });

    expect(admitted.created).toBe(true);
    expect(admitted.creditsChargedNow).toBe(1);

    expect(admitted.asset.logoOverlaySnapshot?.enabled).toBe(false);

    expect(admitted.asset.logoOverlaySnapshot?.logo).toBeNull();
  });

  it("persists an explicit none branding snapshot", async () => {
    const result = await admitImageGeneration(
      request("branding-none-new-0001"),
    );

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("none");

    expect(saved?.logoOverlaySnapshot?.enabled).toBe(false);

    expect(saved?.logoOverlaySnapshot?.logo).toBeNull();

    expect(result.creditsChargedNow).toBe(1);
  });

  it("persists matching logo snapshots", async () => {
    // Configure an enabled valid workspace logo
    // using the existing logo fixture setup.
    const settings = createLogoSettings(workspaceId);

    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          "settings.logoOverlay": settings,
        },
      },
    );

    const result = await admitImageGeneration(
      logoRequest("branding-logo-new-0001"),
    );

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("logo");

    expect(saved?.brandingSnapshot?.logo?.storageKey).toBe(
      saved?.logoOverlaySnapshot?.logo?.storageKey,
    );

    expect(saved?.brandingSnapshot?.logo?.sha256).toBe(
      saved?.logoOverlaySnapshot?.logo?.sha256,
    );

    expect(saved?.brandingSnapshot?.position).toBe(
      saved?.logoOverlaySnapshot?.position,
    );

    expect(saved?.brandingSnapshot?.sizePercent).toBe(
      saved?.logoOverlaySnapshot?.sizePercent,
    );

    expect(saved?.brandingSnapshot?.opacity).toBe(
      saved?.logoOverlaySnapshot?.opacity,
    );
  });

  it("persists an explicit none branding snapshot", async () => {
    const result = await admitImageGeneration(
      request("branding-none-new-0001"),
    );

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("none");

    expect(saved?.logoOverlaySnapshot?.enabled).toBe(false);

    expect(saved?.logoOverlaySnapshot?.logo).toBeNull();

    expect(result.creditsChargedNow).toBe(1);
  });

  it("persists matching logo snapshots", async () => {
    // Configure an enabled valid workspace logo
    // using the existing logo fixture setup.
    const settings = createLogoSettings(workspaceId);

    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          "settings.logoOverlay": settings,
        },
      },
    );

    const result = await admitImageGeneration(
      logoRequest("branding-logo-new-0001"),
    );

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("logo");

    expect(saved?.brandingSnapshot?.logo?.storageKey).toBe(
      saved?.logoOverlaySnapshot?.logo?.storageKey,
    );

    expect(saved?.brandingSnapshot?.logo?.sha256).toBe(
      saved?.logoOverlaySnapshot?.logo?.sha256,
    );

    expect(saved?.brandingSnapshot?.position).toBe(
      saved?.logoOverlaySnapshot?.position,
    );

    expect(saved?.brandingSnapshot?.sizePercent).toBe(
      saved?.logoOverlaySnapshot?.sizePercent,
    );

    expect(saved?.brandingSnapshot?.opacity).toBe(
      saved?.logoOverlaySnapshot?.opacity,
    );
  });

  it("persists an explicit none branding snapshot", async () => {
    const result = await admitImageGeneration(
      request("branding-none-new-0001"),
    );

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("none");

    expect(saved?.logoOverlaySnapshot?.enabled).toBe(false);

    expect(saved?.logoOverlaySnapshot?.logo).toBeNull();

    expect(result.creditsChargedNow).toBe(1);
  });

  it("persists matching logo snapshots", async () => {
    // Configure an enabled valid workspace logo
    // using the existing logo fixture setup.
    const settings = createLogoSettings(workspaceId);

    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          "settings.logoOverlay": settings,
        },
      },
    );

    const result = await admitImageGeneration(
      logoRequest("branding-logo-new-0001"),
    );

    const saved = await MediaAsset.findById(result.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("logo");

    expect(saved?.brandingSnapshot?.logo?.storageKey).toBe(
      saved?.logoOverlaySnapshot?.logo?.storageKey,
    );

    expect(saved?.brandingSnapshot?.logo?.sha256).toBe(
      saved?.logoOverlaySnapshot?.logo?.sha256,
    );

    expect(saved?.brandingSnapshot?.position).toBe(
      saved?.logoOverlaySnapshot?.position,
    );

    expect(saved?.brandingSnapshot?.sizePercent).toBe(
      saved?.logoOverlaySnapshot?.sizePercent,
    );

    expect(saved?.brandingSnapshot?.opacity).toBe(
      saved?.logoOverlaySnapshot?.opacity,
    );
  });

  it("returns the same branding snapshot on idempotent retry", async () => {
    const key = "branding-retry-new-0001";

    const first = await admitImageGeneration(request(key));

    const retry = await admitImageGeneration(request(key));

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);

    expect(first.creditsChargedNow).toBe(1);
    expect(retry.creditsChargedNow).toBe(0);

    expect(String(first.asset._id)).toBe(String(retry.asset._id));

    const saved = await MediaAsset.findById(first.asset._id);

    expect(saved?.brandingSnapshot?.type).toBe("none");
  });

  it("does not debit again for an identical text-label retry", async () => {
    const input = {
      ...request("text-idempotency-0001"),

      image: {
        prompt: "Professional coffee photography with warm lighting.",
        aspectRatio: "square" as const,

        branding: {
          type: "text" as const,
          text: "BREW CO.",
          position: "bottom-right" as const,
          sizePercent: 20,
          opacity: 0.8,
        },
      },
    };

    const first = await admitImageGeneration(input);
    const retry = await admitImageGeneration(input);

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);

    expect(first.creditsChargedNow).toBe(1);
    expect(retry.creditsChargedNow).toBe(0);

    expect(String(first.asset._id)).toBe(String(retry.asset._id));

    const saved = await MediaAsset.findById(first.asset._id);

    expect(saved?.brandingSnapshot?.text).toBe("BREW CO.");
  });

  it("rejects a changed label under the same idempotency key", async () => {
    const base = request("text-conflict-0001");

    const image = {
      prompt: "Professional coffee photography with warm lighting.",
      aspectRatio: "square" as const,

      branding: {
        type: "text" as const,
        text: "BREW CO.",
      },
    };

    const first = await admitImageGeneration({
      ...base,
      image,
    });

    expect(first.creditsChargedNow).toBe(1);

    await expect(
      admitImageGeneration({
        ...base,

        image: {
          ...image,
          branding: {
            type: "text",
            text: "COFFEE HOUSE",
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const saved = await MediaAsset.findById(first.asset._id);

    expect(saved?.brandingSnapshot?.text).toBe("BREW CO.");
  });

  it("rejects control characters before charging credits", async () => {
    const balanceBefore = await balance();

    await expect(
      admitImageGeneration({
        ...request("text-invalid-0001"),

        image: {
          prompt: "Professional coffee photography with warm lighting.",
          aspectRatio: "square",

          branding: {
            type: "text",
            text: "BREW\nCO.",
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await balance()).toBe(balanceBefore);
  });

  it("rejects unreadable text labels before deducting credits", async () => {
    const balanceBefore = await balance();
    const assetsBefore = await MediaAsset.countDocuments();

    await expect(
      admitImageGeneration({
        ...request("text-layout-admission-invalid-0001"),

        image: {
          prompt:
            "A professional studio photograph of a premium coffee product.",
          aspectRatio: "square",

          branding: {
            type: "text",
            text: "A".repeat(80),
            position: "bottom-right",
            sizePercent: 5,
            opacity: 0.8,
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    // No credit was deducted.
    expect(await balance()).toBe(balanceBefore);

    // No generation asset was created.
    expect(await MediaAsset.countDocuments()).toBe(assetsBefore);
  });
});
