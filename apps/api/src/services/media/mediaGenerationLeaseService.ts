import MediaAsset from "../../models/MediaAsset.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import { getWorkspaceMediaAsset } from "../mediaAssetService.js";

export const GENERATION_LEASE_MS = 2 * 60 * 1000;

export const GENERATION_HEARTBEAT_MS = 30 * 1000;

export class MediaGenerationLeaseError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "MediaGenerationLeaseError";
  }
}

export type GenerationLeaseContext = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  assetId: string;
  claimToken: string;
};

const RENEWABLE_PHASES = [
  "claimed",
  "provider_started",
  "storage_pending",
] as const;

/**
 * Renew only an active, owned lease.
 *
 * Expired claims must not be revived.
 * A different token must never be accepted.
 * recovery_required is not renewable.
 */
export async function renewGenerationLease(context: GenerationLeaseContext) {
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

      "generationExecution.phase": {
        $in: [...RENEWABLE_PHASES],
      },

      "generationExecution.claimToken": context.claimToken,

      "generationExecution.leaseExpiresAt": {
        $gt: now,
      },
    },
    {
      $set: {
        "generationExecution.leaseExpiresAt": new Date(
          now.getTime() + GENERATION_LEASE_MS,
        ),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updated) {
    throw new MediaGenerationLeaseError(
      "Generation lease is expired, invalid, or no longer owned by this worker.",
      409,
    );
  }

  return updated;
}

/**
 * Keep a lease alive while an asynchronous
 * operation, such as a storage upload, runs.
 *
 * If renewal fails, preserve the result's
 * uncertainty and reject completion.
 */
export async function withGenerationLeaseHeartbeat<T>(
  context: GenerationLeaseContext,
  operation: () => Promise<T>,
): Promise<T> {
  await renewGenerationLease(context);

  let renewalError: unknown = null;
  let renewalInProgress = false;
  let stopped = false;
  let activeRenewal: Promise<void> | undefined;

  const timer = setInterval(() => {
    if (stopped || renewalError !== null || renewalInProgress) {
      return;
    }

    renewalInProgress = true;

    activeRenewal = renewGenerationLease(context)
      .then(() => undefined)
      .catch((error: unknown) => {
        renewalError = error;
      })
      .finally(() => {
        renewalInProgress = false;
      });
  }, GENERATION_HEARTBEAT_MS);

  try {
    const value = await operation();

    // Prevent a pending heartbeat from racing
    // with the final ownership check.
    if (activeRenewal) {
      await activeRenewal;
    }

    if (renewalError !== null) {
      throw new MediaGenerationLeaseError(
        "Generation lease renewal failed during storage.",
        409,
      );
    }

    await renewGenerationLease(context);

    return value;
  } finally {
    stopped = true;
    clearInterval(timer);

    if (activeRenewal) {
      await activeRenewal;
    }
  }
}
