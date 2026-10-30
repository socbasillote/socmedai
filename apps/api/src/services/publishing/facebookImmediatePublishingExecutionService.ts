import Post from "../../models/Post.js";

import type { PublishingAdapter } from "./publishingAdapter.js";

import { PublishingOrchestrator } from "./publishingOrchestrator.js";

import { createPublishingAdapter } from "./publishingAdapterFactory.js";

import {
  claimImmediateFacebookPost,
  FacebookImmediatePublishingError,
  type ClaimImmediateFacebookPostInput,
} from "./facebookImmediatePublishingService.js";

/**
 * Facebook publishing is disabled unless:
 *
 * 1. enabled is explicitly true.
 * 2. A Facebook publishing adapter is explicitly supplied.
 *
 * This is an internal configuration contract,
 * not a request-body or user-controlled option.
 */
export type FacebookPublishingExecutionOptions = {
  enabled?: boolean;
  adapter?: PublishingAdapter;
};

/**
 * Claims and processes one Facebook-only text draft.
 *
 * Important:
 * - Disabled by default.
 * - Never retries an uncertain publishing outcome.
 * - Does not expose a public endpoint.
 * - Does not instantiate a Facebook adapter itself.
 */
export async function publishImmediateFacebookPost(
  input: ClaimImmediateFacebookPostInput,
  options: FacebookPublishingExecutionOptions = {},
) {
  // 1. Fail closed before modifying any post.
  if (options.enabled !== true || !options.adapter) {
    throw new FacebookImmediatePublishingError(
      "Facebook publishing is not enabled.",
      409,
    );
  }

  // 2. Atomically claim an eligible Facebook post.
  //
  // Authorization, workspace ownership, platform
  // restrictions, connection selection, and
  // duplicate-claim protection are handled here.
  //
  // Claim failures are deliberately outside the
  // execution catch block: no publication was
  // attempted, so we should preserve the actual
  // authorization or eligibility error.
  const post = await claimImmediateFacebookPost(input);

  try {
    // 3. Configure Facebook publishing explicitly.
    //
    // Providing a Facebook adapter without
    // enabled: true is insufficient.
    const adapter = createPublishingAdapter(input.authUser, {
      facebook: {
        enabled: true,
        adapter: options.adapter,
      },
    });

    // 4. Reuse Storm's existing orchestration.
    //
    // The orchestrator handles:
    // - Per-platform claims
    // - Published / failed / unknown outcomes
    // - Platform-result persistence
    // - Overall post-status reconciliation
    const orchestrator = new PublishingOrchestrator(adapter);

    return await orchestrator.processPost(post);
  } catch (error) {
    // 5. An interrupted execution must not
    // automatically retry the post.
    //
    // The external outcome may be unknown.
    const message =
      "Facebook publishing execution was interrupted. " +
      "The Facebook publishing outcome may be unknown. " +
      "Check the selected Facebook Page before attempting to publish again.";

    try {
      await Post.updateOne(
        {
          _id: post._id,
          workspaceId: post.workspaceId,
          status: "publishing",
        },
        {
          $set: {
            lastError: message,
          },
        },
      );
    } catch (persistenceError) {
      console.error(
        "[facebook-immediate-publishing] " +
          "Failed to record interrupted publishing:",
        persistenceError,
      );
    }

    console.error(
      "[facebook-immediate-publishing] " + "Publishing execution failed:",
      error,
    );

    throw new FacebookImmediatePublishingError(message, 500);
  }
}
