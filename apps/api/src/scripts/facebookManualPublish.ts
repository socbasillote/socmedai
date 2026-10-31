import mongoose from "mongoose";

import { env } from "../config/env.js";

import Post from "../models/Post.js";

import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../services/workspaceService.js";

import type { AuthenticatedUser } from "../services/userProfileService.js";

import { getFacebookPublishingCredentials } from "../services/facebook/facebookPublishingTokenService.js";

/**
 * Storm manual Facebook publishing test entry point.
 *
 * CURRENT STATE: PREFLIGHT ONLY.
 *
 * This command deliberately does not:
 * - Claim posts
 * - Update MongoDB documents
 * - Instantiate the Facebook publishing adapter
 * - Invoke publishImmediateFacebookPost()
 * - Send Facebook Graph API requests
 *
 * Live publishing must remain disabled until
 * explicit authorization in a later step.
 */

const USAGE = `
Storm Facebook Manual Publishing Test

Available commands:

  --help
      Display this help message.

  --preflight
      Inspect and validate an existing Facebook draft.

Required environment variables for --preflight:

  STORM_FB_TEST_USER_ID
  STORM_FB_TEST_WORKSPACE_ID
  STORM_FB_TEST_POST_ID
  STORM_FB_TEST_EXPECTED_PAGE_ID
  STORM_FB_TEST_EXPECTED_DATABASE

Live publishing is NOT available in this version.
`;

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required test configuration: ${name}`);
  }

  return value.trim();
}

async function runPreflight(): Promise<void> {
  // Never run this developer command in
  // the production Node environment.
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Manual Facebook test commands are disabled in production.",
    );
  }

  const userId = requiredEnv("STORM_FB_TEST_USER_ID");

  const workspaceId = requiredEnv("STORM_FB_TEST_WORKSPACE_ID");

  const postId = requiredEnv("STORM_FB_TEST_POST_ID");

  const expectedPageId = requiredEnv("STORM_FB_TEST_EXPECTED_PAGE_ID");

  const expectedDatabase = requiredEnv("STORM_FB_TEST_EXPECTED_DATABASE");

  // Reject malformed identifiers before
  // opening a database connection.
  if (!isValidWorkspaceId(workspaceId) || !isValidWorkspaceId(postId)) {
    throw new Error("Invalid workspace or post ID.");
  }

  if (!/^[0-9]+$/.test(expectedPageId)) {
    throw new Error("The expected Facebook Page ID must contain digits only.");
  }

  const authUser = {
    id: userId,
  } as AuthenticatedUser;

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    // Fail closed if the connected database
    // is different from the explicitly
    // expected database.
    if (mongoose.connection.name !== expectedDatabase) {
      throw new Error(
        "Connected MongoDB database does not match the expected database.",
      );
    }

    // 1. Verify workspace ownership.
    const workspace = await getUserWorkspaceById(authUser, workspaceId);

    if (!workspace) {
      throw new Error("Workspace is unavailable or unauthorized.");
    }

    // 2. Load only a post in this workspace.
    const post = await Post.findOne({
      _id: postId,
      workspaceId: workspace._id,
    })
      .select(
        "_id workspaceId caption status platforms " +
          "platformConnections mediaIds attemptCount " +
          "claimedAt platformResults",
      )
      .lean();

    if (!post) {
      throw new Error("Post not found in the authorized workspace.");
    }

    // 3. Require a fresh, unclaimed draft.
    if (
      post.status !== "draft" ||
      post.attemptCount !== 0 ||
      post.claimedAt != null
    ) {
      throw new Error("Post is not an unclaimed Facebook draft.");
    }

    // 4. Only Facebook-only posts are allowed.
    if (post.platforms.length !== 1 || post.platforms[0] !== "facebook") {
      throw new Error("The test requires a Facebook-only post.");
    }

    // 5. Only text publishing is supported.
    if (!Array.isArray(post.mediaIds) || post.mediaIds.length !== 0) {
      throw new Error("Facebook media publishing is not supported.");
    }

    if (typeof post.caption !== "string" || !post.caption.trim()) {
      throw new Error("The Facebook post must contain text.");
    }

    // 6. Reject previous platform attempts.
    const results = post.platformResults;

    if (
      !Array.isArray(results) ||
      results.length > 1 ||
      results.some(
        (result) =>
          result.platform !== "facebook" ||
          result.status !== "pending" ||
          result.attemptCount !== 0,
      )
    ) {
      throw new Error("Post contains an ineligible publishing result.");
    }

    // 7. Read the selected Page from
    // the persisted post.
    const connectionId = String(post.platformConnections?.facebook ?? "");

    if (!isValidWorkspaceId(connectionId)) {
      throw new Error("The post has no valid Facebook Page connection.");
    }

    // 8. Verify the existing Page connection
    // and its publishing permissions.
    //
    // This checks:
    // - Workspace ownership
    // - Active connection
    // - CREATE_CONTENT task
    // - Encrypted credential availability
    // - Backend credential decryption
    //
    // Never log the returned access token.
    const credentials = await getFacebookPublishingCredentials({
      authUser,
      workspaceId,
      connectionId,
    });

    // 9. Prevent publishing to an unintended Page.
    if (credentials.facebookPageId !== expectedPageId) {
      throw new Error(
        "The selected Facebook Page does not match the expected Page.",
      );
    }

    // 10. Display only safe metadata.
    console.log("");
    console.log("STORM FACEBOOK PREFLIGHT PASSED");
    console.log("-----------------------------");
    console.log("Database:", mongoose.connection.name);
    console.log("Workspace:", workspaceId);
    console.log("Post:", postId);
    console.log("Facebook Page:", credentials.facebookPageId);
    console.log("Post status:", post.status);
    console.log("Caption:", post.caption);
    console.log("Credential check: passed");
    console.log("Publishing request: NOT SENT");
    console.log("MongoDB writes: NONE");
    console.log("");
    console.log("This command is preflight-only.");
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === "--help") {
    console.log(USAGE);
    return;
  }

  if (args.length === 1 && args[0] === "--preflight") {
    await runPreflight();
    return;
  }

  // Reject unknown commands, including --live.
  // No execution path can publish a Facebook post.
  throw new Error("Unsupported command. Use --help or --preflight.");
}

void main().catch((error: unknown) => {
  console.error(
    "[facebook-manual-test]",
    error instanceof Error ? error.message : "Unexpected preflight error.",
  );

  process.exitCode = 1;
});
