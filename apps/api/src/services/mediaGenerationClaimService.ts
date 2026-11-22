import ImageReference from "../models/ImageReference.js";
import { referenceStorageKey, type ReferenceSnapshot } from "./media/imageReferenceService.js";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { type HydratedDocument } from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import {
  generateImageSchema,
  type GenerateImageInput,
} from "../schemas/aiImageSchema.js";

import type { AuthenticatedUser } from "./userProfileService.js";

import { getWorkspaceMediaAsset } from "./mediaAssetService.js";

const CLAIM_LEASE_MS = 2 * 60 * 1000;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export class MediaGenerationClaimError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaGenerationClaimError";
  }
}

type GenerationConfiguration = {
  provider: string;
  model: string;
};

type ReservationInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  idempotencyKey: string;
  image: GenerateImageInput;
  generation: GenerationConfiguration;
};

type AssetContext = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
};

type MediaGenerationExecution = {
  phase:
    | "reserved"
    | "claimed"
    | "provider_started"
    | "storage_pending"
    | "recovery_required";

  claimToken?: string;
  leaseExpiresAt?: Date;
  providerStartedAt?: Date;
  attemptCount: number;
};

type ClaimedMediaAsset = HydratedDocument<{
  brandKitSnapshot?: unknown;
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  createdByUserId: mongoose.Types.ObjectId;

  status: "pending" | "ready" | "failed";

  referenceImage?: ReferenceSnapshot;
  generationExecution?: MediaGenerationExecution;
}>;

type ClaimedGeneration = {
  asset: ClaimedMediaAsset;
  claimToken: string;
};

function isObjectId(value: string): boolean {
  return mongoose.isObjectIdOrHexString(value);
}

/**
 * Match Storm's existing authorization model:
 *
 * Supabase user -> UserProfile -> owned Workspace.
 */
async function authorizeWorkspace(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  if (!isObjectId(workspaceId)) {
    throw new MediaGenerationClaimError("Workspace not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    throw new MediaGenerationClaimError("Workspace not found.", 404);
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    throw new MediaGenerationClaimError("Workspace not found.", 404);
  }

  return {
    profileId: profile._id,
    workspaceId: workspace._id,
  };
}

/**
 * Canonical request fingerprint.
 *
 * The provider/model values must come from trusted
 * backend configuration, not from browser input.
 *
 * A fixed array order avoids object key ordering
 * differences when hashing request fields.
 */
export function fingerprintImageGeneration(
  input: GenerateImageInput,
  generation: GenerationConfiguration,
): string {
  const validated = generateImageSchema.parse(input);

  if (validated.postDesign) {
    return createHash("sha256").update(JSON.stringify([
      "storm-post-image-v1", validated.prompt, validated.aspectRatio,
      generation.provider, generation.model, validated.branding,
      validated.reference ?? null, validated.useBrandKit !== false,
      validated.postDesign.style, validated.postDesign.details,
      validated.postDesign.captionContext, validated.postDesign.text, validated.postDesign.author,
    ])).digest("hex");
  }

  // Keep historical fingerprints for existing callers, while ensuring an
  // explicit opt-out cannot reuse a key admitted with workspace branding.
  if (validated.useBrandKit === false) {
    return createHash("sha256").update(JSON.stringify([
      "storm-image-generation-v4", validated.prompt, validated.aspectRatio,
      generation.provider, generation.model, validated.branding,
      validated.reference ?? null, false,
    ])).digest("hex");
  }

  if (validated.reference) {
    return createHash("sha256").update(JSON.stringify([
      "storm-image-generation-v3", validated.prompt, validated.aspectRatio,
      generation.provider, generation.model, validated.branding,
      validated.reference.id, validated.reference.usage,
    ])).digest("hex");
  }

  // Preserve historical fingerprints for requests
  // without branding. This protects existing
  // idempotency keys and previously admitted jobs.
  if (validated.branding.type === "none") {
    const legacyCanonical = JSON.stringify([
      "storm-image-generation-v1",
      validated.prompt,
      validated.aspectRatio,
      generation.provider,
      generation.model,
    ]);

    return createHash("sha256").update(legacyCanonical).digest("hex");
  }

  // Branded requests use a separate fingerprint
  // version and include the normalized branding
  // selection, including appearance parameters.
  const canonical = JSON.stringify([
    "storm-image-generation-v2",
    validated.prompt,
    validated.aspectRatio,
    generation.provider,
    generation.model,
    validated.branding.type,
    validated.branding.type === "text" ? validated.branding.text : null,
    validated.branding.position,
    validated.branding.sizePercent,
    validated.branding.opacity,
  ]);

  return createHash("sha256").update(canonical).digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

/**
 * Atomically reserve an image generation.
 *
 * A MongoDB unique index on
 * { workspaceId, idempotencyKey } prevents
 * duplicate reservations under concurrency.
 *
 * No image provider call occurs here.
 */
export async function reserveImageGeneration(input: ReservationInput) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    throw new MediaGenerationClaimError(
      "Invalid image generation request key.",
      400,
    );
  }

  const parsed = generateImageSchema.safeParse(input.image);

  if (!parsed.success) {
    throw new MediaGenerationClaimError(
      parsed.error.issues[0]?.message ?? "Invalid image generation request.",
      400,
    );
  }

  const provider = input.generation.provider.trim();
  const model = input.generation.model.trim();

  if (!provider || provider.length > 80 || !model || model.length > 120) {
    throw new MediaGenerationClaimError(
      "Invalid image generation configuration.",
      500,
    );
  }

  const authorized = await authorizeWorkspace(
    input.authUser,
    input.workspaceId,
  );

  const fingerprint = fingerprintImageGeneration(parsed.data, {
    provider,
    model,
  });

  const reservationFilter = {
    workspaceId: authorized.workspaceId,
    idempotencyKey: input.idempotencyKey,
  };

  const existing = await MediaAsset.findOne(reservationFilter);

  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      throw new MediaGenerationClaimError(
        "The request key was already used with different image settings.",
        409,
      );
    }

    return {
      asset: existing,
      created: false,
    };
  }

  let referenceImage;
  if (parsed.data.reference) {
    const reference = await ImageReference.findOne({ _id: parsed.data.reference.id,
      workspaceId: authorized.workspaceId, createdByUserId: authorized.profileId }).lean();
    if (!reference || reference.storageKey !== referenceStorageKey(String(authorized.workspaceId), String(reference._id))) {
      throw new MediaGenerationClaimError("Reference photo not found in this workspace.", 404);
    }
    referenceImage = { referenceId: reference._id, storageKey: reference.storageKey, sha256: reference.sha256, usage: parsed.data.reference.usage };
  }
  try {
    const asset = await MediaAsset.create({
      workspaceId: authorized.workspaceId,
      createdByUserId: authorized.profileId,

      type: "image",
      source: "ai-generated",
      status: "pending",
      storageProvider: "supabase",

      generation: {
        provider,
        model,
        prompt: parsed.data.prompt,
        ...(parsed.data.postDesign ? { postDesign: parsed.data.postDesign } : {}),
        aspectRatio: parsed.data.aspectRatio,
      },

      idempotencyKey: input.idempotencyKey,
      ...(referenceImage ? { referenceImage } : {}),
      requestFingerprint: fingerprint,

      generationExecution: {
        phase: "reserved",
        attemptCount: 0,
      },
    });

    return {
      asset,
      created: true,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    /**
     * Another request may have inserted the same
     * workspace/key between our read and create.
     *
     * The unique index selects the winner.
     */
    const winner = await MediaAsset.findOne(reservationFilter);

    if (!winner) {
      throw new MediaGenerationClaimError(
        "The generation reservation could not be confirmed.",
        503,
      );
    }

    if (winner.requestFingerprint !== fingerprint) {
      throw new MediaGenerationClaimError(
        "The request key was already used with different image settings.",
        409,
      );
    }

    return {
      asset: winner,
      created: false,
    };
  }
}

/**
 * Claim a generation before any provider call.
 *
 * Reclaiming is allowed only when:
 * - the operation is reserved; or
 * - the operation was claimed but its lease expired.
 *
 * provider_started is NEVER automatically
 * eligible for another claim.
 */
export async function claimImageGeneration(
  context: AssetContext,
): Promise<ClaimedGeneration> {
  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);

  const claimToken = randomUUID();

  const claimed = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",

      $or: [
        {
          "generationExecution.phase": "reserved",
        },
        {
          "generationExecution.phase": "claimed",

          "generationExecution.leaseExpiresAt": {
            $lte: now,
          },

          "generationExecution.providerStartedAt": {
            $exists: false,
          },
        },
      ],
    },
    {
      $set: {
        "generationExecution.phase": "claimed",
        "generationExecution.claimToken": claimToken,
        "generationExecution.leaseExpiresAt": leaseExpiresAt,
      },

      $inc: {
        "generationExecution.attemptCount": 1,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!claimed) {
    throw new MediaGenerationClaimError(
      "This generation is already claimed or cannot be restarted.",
      409,
    );
  }

  return {
    asset: claimed as ClaimedMediaAsset,
    claimToken,
  };
}

/**
 * Durable boundary immediately before a paid
 * provider call may occur.
 *
 * Only the current valid claim holder can
 * transition claimed -> provider_started.
 *
 * The future provider adapter must call this
 * BEFORE sending any paid request.
 */
export async function beginImageProviderCall(
  context: AssetContext & {
    claimToken: string;
  },
) {
  const current = await getWorkspaceMediaAsset(
    context.authUser,
    context.workspaceId,
    context.assetId,
  );

  const now = new Date();

  const updated = await MediaAsset.findOneAndUpdate(
    {
      _id: current._id,
      workspaceId: current.workspaceId,
      status: "pending",

      "generationExecution.phase": "claimed",
      "generationExecution.claimToken": context.claimToken,

      "generationExecution.leaseExpiresAt": {
        $gt: now,
      },
    },
    {
      $set: {
        "generationExecution.phase": "provider_started",
        "generationExecution.providerStartedAt": now,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updated) {
    throw new MediaGenerationClaimError(
      "Generation claim is invalid, expired, or already started.",
      409,
    );
  }

  return updated;
}
