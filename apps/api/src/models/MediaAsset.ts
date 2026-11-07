import mongoose, { Schema } from "mongoose";

export const MEDIA_ASSET_STATUSES = ["pending", "ready", "failed"] as const;

export type MediaAssetStatus = (typeof MEDIA_ASSET_STATUSES)[number];

export const MEDIA_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type MediaAssetMimeType = (typeof MEDIA_ASSET_MIME_TYPES)[number];

export const MEDIA_ASSET_SOURCES = ["ai-generated"] as const;

export const MEDIA_STORAGE_PROVIDERS = ["supabase"] as const;

export const MEDIA_ASPECT_RATIOS = ["square", "portrait", "landscape"] as const;

export const MEDIA_GENERATION_PHASES = [
  "reserved",
  "claimed",
  "provider_started",
  "storage_pending",
  "recovery_required",
] as const;

export type MediaGenerationPhase = (typeof MEDIA_GENERATION_PHASES)[number];

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const CLAIM_TOKEN_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const generationSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },

    model: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },

    prompt: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 3000,
    },

    aspectRatio: {
      type: String,
      enum: MEDIA_ASPECT_RATIOS,
      required: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/**
 * Durable metadata for an image-generation operation.
 *
 * Optional for legacy assets created before
 * the idempotency and lease system existed.
 */
const generationExecutionSchema = new Schema(
  {
    phase: {
      type: String,
      enum: MEDIA_GENERATION_PHASES,
      required: true,
      default: "reserved",
    },

    claimToken: {
      type: String,
      trim: true,
      match: CLAIM_TOKEN_PATTERN,
      default: undefined,
    },

    leaseExpiresAt: {
      type: Date,
      default: undefined,
    },

    providerStartedAt: {
      type: Date,
      default: undefined,
    },

    attemptCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  },
);

const mediaAssetSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      immutable: true,
    },

    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      immutable: true,
    },

    type: {
      type: String,
      enum: ["image"],
      default: "image",
      required: true,
      immutable: true,
    },

    source: {
      type: String,
      enum: MEDIA_ASSET_SOURCES,
      default: "ai-generated",
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: MEDIA_ASSET_STATUSES,
      default: "pending",
      required: true,
    },

    storageProvider: {
      type: String,
      enum: MEDIA_STORAGE_PROVIDERS,
      default: "supabase",
      required: true,
    },

    /**
     * Private object-storage key.
     *
     * Do not store public URLs or signed URLs here.
     */
    storageKey: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 1024,
      default: undefined,
    },

    mimeType: {
      type: String,
      enum: MEDIA_ASSET_MIME_TYPES,
      default: undefined,
    },

    width: {
      type: Number,
      min: 1,
      max: 16384,
      validate: Number.isInteger,
      default: undefined,
    },

    height: {
      type: Number,
      min: 1,
      max: 16384,
      validate: Number.isInteger,
      default: undefined,
    },

    fileSize: {
      type: Number,
      min: 1,
      max: MAX_IMAGE_BYTES,
      validate: Number.isInteger,
      default: undefined,
    },

    generation: {
      type: generationSchema,
      required: true,
    },

    /**
     * A client-provided request identifier scoped
     * to one workspace.
     *
     * Assigned on creation, never reassigned.
     */
    idempotencyKey: {
      type: String,
      trim: true,
      minlength: 16,
      maxlength: 128,
      immutable: true,
      default: undefined,
    },

    /**
     * SHA-256 of the canonical generation request.
     *
     * This detects reuse of the same key with
     * different generation parameters.
     */
    requestFingerprint: {
      type: String,
      match: SHA256_HEX_PATTERN,
      immutable: true,
      default: undefined,
    },

    /**
     * Internal operation tracking.
     *
     * Legacy records do not automatically gain
     * a generation execution record.
     */
    generationExecution: {
      type: generationExecutionSchema,
      default: undefined,
    },

    /**
     * SHA-256 of the verified, normalized PNG bytes.
     *
     * Populated by a future claim-aware completion
     * service, not from client input.
     */
    contentSha256: {
      type: String,
      match: SHA256_HEX_PATTERN,
      default: undefined,
    },

    failureReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
  },
  {
    collection: "media_assets",
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

/**
 * A ready image must have an identifiable
 * storage object and valid file metadata.
 */
mediaAssetSchema.pre("validate", function () {
  const hasKey = this.idempotencyKey != null;
  const hasFingerprint = this.requestFingerprint != null;
  const hasExecution = this.generationExecution != null;

  // New operation metadata is all-or-nothing.
  // Legacy assets without it remain valid.
  if (
    [hasKey, hasFingerprint, hasExecution].some((value) => value !== hasKey)
  ) {
    this.invalidate(
      "generationExecution",
      "Generation idempotency metadata must be complete.",
    );
  }

  const execution = this.generationExecution;

  if (execution) {
    const hasClaim = Boolean(execution.claimToken);
    const hasLease = Boolean(execution.leaseExpiresAt);

    if (hasClaim !== hasLease) {
      this.invalidate(
        "generationExecution",
        "Claim token and lease expiration must be paired.",
      );
    }

    if (execution.phase === "claimed" && (!hasClaim || !hasLease)) {
      this.invalidate(
        "generationExecution",
        "A claimed operation requires a lease.",
      );
    }

    if (
      execution.phase === "provider_started" &&
      !execution.providerStartedAt
    ) {
      this.invalidate(
        "generationExecution.providerStartedAt",
        "Provider start time is required.",
      );
    }
  }

  if (this.status !== "ready") {
    return;
  }

  if (!this.storageKey) {
    this.invalidate("storageKey", "A ready image requires a storage key.");
  }

  if (!this.mimeType) {
    this.invalidate("mimeType", "A ready image requires a MIME type.");
  }

  if (!this.width) {
    this.invalidate("width", "A ready image requires a width.");
  }

  if (!this.height) {
    this.invalidate("height", "A ready image requires a height.");
  }

  if (!this.fileSize) {
    this.invalidate("fileSize", "A ready image requires a file size.");
  }
});

/**
 * Efficient workspace Media Library queries.
 * Most recently created images first.
 */
mediaAssetSchema.index({
  workspaceId: 1,
  createdAt: -1,
  _id: -1,
});

/**
 * Workspace-scoped status and history queries.
 */
mediaAssetSchema.index({
  workspaceId: 1,
  status: 1,
  createdAt: -1,
});

/**
 * One database asset per stored object key.
 * Only records with string keys are indexed.
 */
mediaAssetSchema.index(
  { storageKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      storageKey: { $type: "string" },
    },
  },
);

/**
 * One durable generation request per
 * workspace and idempotency key.
 *
 * Legacy assets lacking the key are excluded.
 */
mediaAssetSchema.index(
  {
    workspaceId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: {
        $type: "string",
      },
    },
  },
);

mediaAssetSchema.index({
  status: 1,
  "generationExecution.phase": 1,
  "generationExecution.leaseExpiresAt": 1,
});

const MediaAsset =
  mongoose.models.MediaAsset ?? mongoose.model("MediaAsset", mediaAssetSchema);

export default MediaAsset;
