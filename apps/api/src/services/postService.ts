import { validateInstagramSelection, InstagramConnectionError } from "./instagram/instagramConnectionService.js";
import PublishingAttemptEvidence from "../models/PublishingAttemptEvidence.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import mongoose from "mongoose";
import { publishingUnavailableReason } from "./publishing/publishingCapabilities.js";
import { schedulingRuleError } from "../schemas/workspaceSettingsSchema.js";

import Post from "../models/Post.js";
import FacebookConnection from "../models/FacebookConnection.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import type { AuthenticatedUser } from "./userProfileService.js";
import type {
  AutosaveDraftInput,
  CreatePostInput,
  UpdateDraftPostInput,
} from "../schemas/postSchema.js";
import {
  validateLinkedInConnectionSelection,
  LinkedInConnectionSelectionError,
} from "./linkedin/linkedinConnectionSelectionService.js";

import { findAuthorizedCalendarPosts } from "./calendarPostService.js";

import type { CalendarQuery } from "../schemas/calendarQuerySchema.js";

import {
  validateDraftMediaAttachments,
  DraftMediaAttachmentError,
} from "./media/validateDraftMediaAttachments.js";

export class PostServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PostServiceError";
    this.statusCode = statusCode;
  }
}

async function validatePostDraftMedia(
  authUser: AuthenticatedUser,
  workspaceId: string,
  mediaIds: readonly string[],
): Promise<string[]> {
  try {
    return await validateDraftMediaAttachments({
      authUser,
      destinationWorkspaceId: workspaceId,
      mediaIds,
    });
  } catch (error) {
    if (error instanceof DraftMediaAttachmentError) {
      throw new PostServiceError(error.message, error.statusCode);
    }

    throw error;
  }
}

async function getAuthorizedWorkspace(
  authUser: AuthenticatedUser,
  workspaceId: string,
) {
  if (!mongoose.isValidObjectId(workspaceId)) {
    return null;
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    return null;
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerUserId: profile._id,
  }).select("_id settings");

  if (!workspace) {
    return null;
  }

  return { profile, workspace };
}

async function validatePostLinkedInSelection(
  workspaceId: string,
  platforms: readonly string[],
  connectionId?: string,
): Promise<string | undefined> {
  if (!connectionId) {
    return undefined;
  }

  if (!platforms.includes("linkedin")) {
    throw new PostServiceError(
      "A LinkedIn account can only be selected when LinkedIn is a publishing platform.",
      400,
    );
  }

  try {
    return await validateLinkedInConnectionSelection({
      workspaceId,
      connectionId,
    });
  } catch (error) {
    if (error instanceof LinkedInConnectionSelectionError) {
      throw new PostServiceError(error.message, error.statusCode);
    }

    throw error;
  }
}

async function validatePostFacebookSelection(
  workspaceId: string,
  platforms: readonly string[],
  connectionId?: string,
): Promise<string | undefined> {
  // No automatic Page selection.
  if (connectionId === undefined) {
    return undefined;
  }

  // A Page can only be selected for Facebook posts.
  if (!platforms.includes("facebook")) {
    throw new PostServiceError(
      "A Facebook Page can only be selected when Facebook is a publishing platform.",
      400,
    );
  }

  // Validate both identifiers.
  if (
    !mongoose.isObjectIdOrHexString(workspaceId) ||
    !mongoose.isObjectIdOrHexString(connectionId)
  ) {
    throw new PostServiceError("A valid Facebook connection is required.", 400);
  }

  // The workspace must already be authorized by the caller.
  // Never query the connection by its ID alone.
  const connection = await FacebookConnection.findOne({
    _id: connectionId,
    workspaceId,
  })
    .select("_id status tasks")
    .lean();

  if (!connection) {
    throw new PostServiceError(
      "Facebook Page connection not found in this workspace.",
      404,
    );
  }

  if (connection.status !== "connected") {
    throw new PostServiceError(
      "Facebook Page connection is not active. Reconnect the Page.",
      409,
    );
  }

  if (
    !Array.isArray(connection.tasks) ||
    !connection.tasks.includes("CREATE_CONTENT")
  ) {
    throw new PostServiceError(
      "Facebook Page publishing permission is unavailable.",
      403,
    );
  }

  return String(connection._id);
}

async function validatePostInstagramSelection(workspaceId: string, platforms: readonly string[], connectionId?: string) {
  if (!connectionId) return undefined;
  if (!platforms.includes("instagram")) throw new PostServiceError("An Instagram account can only be selected for Instagram posts.", 400);
  try { return await validateInstagramSelection(workspaceId, connectionId); }
  catch (error) { if (error instanceof InstagramConnectionError) throw new PostServiceError(error.message, error.statusCode); throw error; }
}

export async function createWorkspacePost(
  authUser: AuthenticatedUser,
  input: CreatePostInput,
) {
  const authorization = await getAuthorizedWorkspace(
    authUser,
    input.workspaceId,
  );

  if (!authorization) {
    throw new PostServiceError("Workspace not found.", 404);
  }

  // Validate scheduled publishing separately from drafts.
  const isScheduled = input.scheduledAt !== undefined;
  if (isScheduled) {
    for (const platform of input.platforms) {
      const reason = publishingUnavailableReason(platform, "schedule");
      if (reason) throw new PostServiceError(reason, 409);
    }
  }

  const scheduledAt = isScheduled ? new Date(input.scheduledAt!) : undefined;

  if (isScheduled) {
    const ruleError = schedulingRuleError(authorization.workspace.settings ?? {}, scheduledAt!);
    if (ruleError) throw new PostServiceError(ruleError, 400);
    const captionLimit = input.platforms.includes("instagram") ? 2200 : input.platforms.includes("linkedin") ? 3000 : 5000;
    if (input.caption.length > captionLimit) throw new PostServiceError(`Caption must not exceed ${captionLimit} characters.`, 400);
    // 1. Require a valid future date.
    if (
      !scheduledAt ||
      !Number.isFinite(scheduledAt.getTime()) ||
      scheduledAt.getTime() <= Date.now()
    ) {
      throw new PostServiceError(
        "Scheduled publishing requires a valid future date.",
        400,
      );
    }

    // 2. Allow exactly one supported destination.
    if (
      input.platforms.length !== 1 ||
      !["facebook", "linkedin", "instagram"].includes(input.platforms[0])
    ) {
      throw new PostServiceError(
        "Scheduled publishing requires exactly one Facebook, LinkedIn, or Instagram platform.",
        400,
      );
    }

    // 3. Require a nonempty caption.
    if (typeof input.caption !== "string" || !input.caption.trim()) {
      throw new PostServiceError(
        "Scheduled publishing requires a caption.",
        400,
      );
    }

    // 4. Require an explicitly selected connection.
    const platform = input.platforms[0];

    const selectedConnection =
      platform === "instagram"
        ? input.platformConnections?.instagram
        : platform === "facebook"
        ? input.platformConnections?.facebook
        : input.platformConnections?.linkedin;

    if (typeof selectedConnection !== "string" || !selectedConnection.trim()) {
      throw new PostServiceError(
        `Select a ${platform === "instagram" ? "Instagram account" : platform === "facebook" ? "Facebook Page" : "LinkedIn account"} before scheduling.`,
        400,
      );
    }
  }

  // Each scheduled destination supports at most one authorized image.
  if (isScheduled && input.mediaIds.length > 1) {
    throw new PostServiceError(
      "Scheduled publishing supports at most one image.",
      400,
    );
  }

  if (isScheduled && input.platforms[0] === "instagram" && input.mediaIds.length !== 1) {
    throw new PostServiceError("Scheduled Instagram publishing requires exactly one image.", 400);
  }
  const instagramConnectionId = await validatePostInstagramSelection(String(authorization.workspace._id), input.platforms, input.platformConnections?.instagram);

  const validatedMediaIds = await validatePostDraftMedia(
    authUser,
    String(authorization.workspace._id),
    input.mediaIds,
  );

  const linkedinConnectionId = await validatePostLinkedInSelection(
    String(authorization.workspace._id),
    input.platforms,
    input.platformConnections?.linkedin,
  );

  const facebookConnectionId = await validatePostFacebookSelection(
    String(authorization.workspace._id),
    input.platforms,
    input.platformConnections?.facebook,
  );

  if (isScheduled) {
    const platform = input.platforms[0];

    const validatedConnectionId =
      platform === "instagram" ? instagramConnectionId : platform === "facebook" ? facebookConnectionId : linkedinConnectionId;

    if (!validatedConnectionId) {
      throw new PostServiceError(
        "Scheduled publishing requires a valid, authorized publishing connection.",
        400,
      );
    }
  }

  if (isScheduled && linkedinConnectionId) {
    const connection = await LinkedInConnection.findById(linkedinConnectionId).select("tokenExpiresAt").lean();
    if (!connection?.tokenExpiresAt || connection.tokenExpiresAt.getTime() <= scheduledAt!.getTime()) {
      throw new PostServiceError("Reconnect LinkedIn: its credentials expire before the scheduled publishing time.", 409);
    }
  }

  const postData = {
    workspaceId: authorization.workspace._id,
    createdByUserId: authorization.profile._id,

    ...(input.title !== undefined ? { title: input.title } : {}),

    caption: input.caption,
    mediaIds: validatedMediaIds,
    platforms: input.platforms,

    ...(instagramConnectionId || linkedinConnectionId || facebookConnectionId
      ? {
          platformConnections: {
            ...(instagramConnectionId ? { instagram: instagramConnectionId } : {}),
            ...(linkedinConnectionId ? { linkedin: linkedinConnectionId } : {}),

            ...(facebookConnectionId ? { facebook: facebookConnectionId } : {}),
          },
        }
      : {}),

    status: isScheduled ? "scheduled" : "draft",

    attemptCount: 0,

    ...(scheduledAt ? { scheduledAt } : {}),
  };
  const post = input.clientDraftId
    ? await writeComposerDraft(authorization.workspace._id, authorization.profile._id, input.clientDraftId, postData, true)
    : await Post.create(postData);

  return post.toObject();
}

export async function listWorkspacePosts(
  authUser: AuthenticatedUser,
  workspaceId: string,
  pagination?: {
    limit: number;
    sort?: "newest" | "oldest";
    cursor?: string;
    search?: string;
    status?:
      | "all"
      | "draft"
      | "scheduled"
      | "publishing"
      | "published"
      | "failed";
    platform?: "all" | "facebook" | "instagram" | "linkedin";
  },
) {
  const authorization = await getAuthorizedWorkspace(authUser, workspaceId);

  if (!authorization) {
    throw new PostServiceError("Workspace not found.", 404);
  }

  const fields =
    "_id workspaceId createdByUserId title caption mediaIds platforms status scheduledAt publishedAt lastError platformResults createdAt updatedAt";

  const workspaceFilter = {
    workspaceId: authorization.workspace._id,
  };

  // Preserve the existing full-list behavior for callers without pagination.
  if (!pagination) {
    return Post.find(workspaceFilter)
      .select(fields)
      .sort({ updatedAt: -1, _id: -1 })
      .lean();
  }

  const filter: Record<string, unknown> = {
    ...workspaceFilter,
  };

  if (pagination.status && pagination.status !== "all") {
    filter.status = pagination.status;
  }

  if (pagination.platform && pagination.platform !== "all") {
    filter.platforms = pagination.platform;
  }

  const search = pagination.search?.trim();

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");

    filter.$and = [
      {
        $or: [
          { title: searchRegex },
          { caption: searchRegex },
          { platforms: searchRegex },
          { status: searchRegex },
        ],
      },
    ];
  }

  const countsFilter = { ...filter };
  delete countsFilter.status;
  const statusCountsPromise = Promise.all(
    ["all", "published", "scheduled", "draft", "failed"].map(async (status) => [
      status, await Post.countDocuments(status === "all" ? countsFilter : { ...countsFilter, status }),
    ]),
  ).then(Object.fromEntries);
  const direction = pagination.sort === "oldest" ? 1 : -1;

  const draftCountPromise = Post.countDocuments({
    ...workspaceFilter,
    status: "draft",
  });

  if (pagination.cursor) {
    const cursorPost = await Post.findOne({
      _id: pagination.cursor,
      ...workspaceFilter,
    })
      .select("_id updatedAt")
      .lean();

    if (!cursorPost) {
      throw new PostServiceError("Invalid post cursor.", 400);
    }

    filter.$and = [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      {
        $or: [
          { updatedAt: { [direction === 1 ? "$gt" : "$lt"]: cursorPost.updatedAt } },
          {
            updatedAt: cursorPost.updatedAt,
            _id: { [direction === 1 ? "$gt" : "$lt"]: cursorPost._id },
          },
        ],
      },
    ];
  }

  const [results, draftCount, statusCounts] = await Promise.all([
    Post.find(filter)
      .select(fields)
      .sort({ updatedAt: direction, _id: direction })
      .limit(pagination.limit + 1)
      .lean(),
    draftCountPromise,
    statusCountsPromise,
  ]);

  const hasMore = results.length > pagination.limit;
  const posts = hasMore ? results.slice(0, pagination.limit) : results;
  const lastPost = posts[posts.length - 1];

  return {
    posts,
    nextCursor: hasMore && lastPost ? String(lastPost._id) : null,
    hasMore,
    draftCount,
    statusCounts,
  };
}

export async function getWorkspacePostById(
  authUser: AuthenticatedUser,
  postId: string,
) {
  // Reject invalid MongoDB IDs.
  if (!mongoose.isValidObjectId(postId)) {
    throw new PostServiceError("Post not found.", 404);
  }

  // Locate the post to determine its workspace.
  const post = await Post.findById(postId).select("_id workspaceId").lean();

  if (!post) {
    throw new PostServiceError("Post not found.", 404);
  }

  // Reuse the existing workspace authorization.
  const authorization = await getAuthorizedWorkspace(
    authUser,
    String(post.workspaceId),
  );

  if (!authorization) {
    throw new PostServiceError("Post not found.", 404);
  }

  // Return only a post belonging to the authorized workspace.
  const authorizedPost = await Post.findOne({
    _id: postId,
    workspaceId: authorization.workspace._id,
  })
    .select(
      "_id workspaceId createdByUserId title caption mediaIds platforms platformConnections status scheduledAt publishedAt lastError platformResults createdAt updatedAt",
    )
    .lean();

  if (!authorizedPost) {
    throw new PostServiceError("Post not found.", 404);
  }

  return authorizedPost;
}

export async function deleteWorkspaceDraft(
  authUser: AuthenticatedUser,
  postId: string,
) {
  if (!mongoose.isValidObjectId(postId)) {
    throw new PostServiceError("Post not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    throw new PostServiceError("Post not found.", 404);
  }

  const post = await Post.findOne({
    _id: postId,
    createdByUserId: profile._id,
  }).select("_id workspaceId status");

  if (!post) {
    throw new PostServiceError("Post not found.", 404);
  }

  const workspace = await Workspace.findOne({
    _id: post.workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    throw new PostServiceError("Post not found.", 404);
  }

  if (post.status !== "draft") {
    throw new PostServiceError("Only draft posts can be deleted.", 409);
  }

  const deletion = await Post.deleteOne({
    _id: post._id,
    workspaceId: workspace._id,
    createdByUserId: profile._id,
    status: "draft",
  });

  if (deletion.deletedCount !== 1) {
    throw new PostServiceError(
      "The draft could not be deleted because its status changed or it no longer exists.",
      409,
    );
  }

  return { id: postId };
}

export async function updateWorkspaceDraft(
  authUser: AuthenticatedUser,
  postId: string,
  input: UpdateDraftPostInput,
) {
  if (!mongoose.isValidObjectId(postId)) {
    throw new PostServiceError("Post not found.", 404);
  }

  const profile = await UserProfile.findOne({
    supabaseUserId: authUser.id,
  }).select("_id");

  if (!profile) {
    throw new PostServiceError("Post not found.", 404);
  }

  const post = await Post.findOne({
    _id: postId,
    createdByUserId: profile._id,
  }).select("_id workspaceId status platforms platformConnections __v");

  if (!post) {
    throw new PostServiceError("Post not found.", 404);
  }

  const workspace = await Workspace.findOne({
    _id: post.workspaceId,
    ownerUserId: profile._id,
  }).select("_id");

  if (!workspace) {
    throw new PostServiceError("Post not found.", 404);
  }

  if (post.status !== "draft") {
    throw new PostServiceError("Only draft posts can be edited.", 409);
  }

  if (!Number.isSafeInteger(post.__v) || post.__v < 0) {
    throw new PostServiceError(
      "The draft version is unavailable. Refresh the post and try again.",
      409,
    );
  }

  const finalPlatforms = input.platforms ?? post.platforms;
  const validatedInstagramConnection = await validatePostInstagramSelection(String(workspace._id), finalPlatforms, input.platformConnections?.instagram);

  // Undefined means preserve existing attachments.
  // An empty array means explicitly remove them.
  const validatedMediaIds =
    input.mediaIds === undefined
      ? undefined
      : await validatePostDraftMedia(
          authUser,
          String(workspace._id),
          input.mediaIds,
        );

  const linkedinIsSelected = finalPlatforms.includes("linkedin");

  const facebookIsSelected = finalPlatforms.includes("facebook");

  const requestedFacebookConnection = input.platformConnections?.facebook;

  const validatedFacebookConnection = await validatePostFacebookSelection(
    String(workspace._id),
    finalPlatforms,
    requestedFacebookConnection,
  );

  const requestedLinkedInConnection = input.platformConnections?.linkedin;

  if (requestedLinkedInConnection && !linkedinIsSelected) {
    throw new PostServiceError(
      "A LinkedIn account can only be selected when LinkedIn is a publishing platform.",
      400,
    );
  }

  let validatedLinkedInConnection: string | undefined;

  if (requestedLinkedInConnection) {
    validatedLinkedInConnection = await validatePostLinkedInSelection(
      String(workspace._id),
      finalPlatforms,
      requestedLinkedInConnection,
    );
  }

  const update: {
    title?: string;
    caption?: string;
    mediaIds?: string[];
    platforms?: UpdateDraftPostInput["platforms"];
    "platformConnections.instagram"?: string;
    "platformConnections.linkedin"?: string;
    "platformConnections.facebook"?: string;
  } = {};

  const unset: Record<string, ""> = {};

  if (input.title !== undefined) {
    update.title = input.title;
  }

  if (input.caption !== undefined) {
    update.caption = input.caption;
  }

  if (validatedMediaIds !== undefined) {
    update.mediaIds = validatedMediaIds;
  }

  if (input.platforms !== undefined) {
    update.platforms = input.platforms;
  }

  if (!finalPlatforms.includes("instagram")) unset["platformConnections.instagram"] = "";
  else if (validatedInstagramConnection) update["platformConnections.instagram"] = validatedInstagramConnection;

  if (!linkedinIsSelected) {
    unset["platformConnections.linkedin"] = "";
  } else if (validatedLinkedInConnection) {
    update["platformConnections.linkedin"] = validatedLinkedInConnection;
  }

  if (!facebookIsSelected) {
    unset["platformConnections.facebook"] = "";
  } else if (validatedFacebookConnection) {
    update["platformConnections.facebook"] = validatedFacebookConnection;
  }

  const mongoUpdate: {
    $set: typeof update & { autosaveClosed: boolean };
    $unset?: Record<string, "">;
    $inc: {
      __v: number;
    };
  } = {
    // Manual editing takes ownership from the original composer outbox.
    $set: { ...update, autosaveClosed: true },
    $inc: {
      __v: 1,
    },
  };

  if (Object.keys(unset).length > 0) {
    mongoUpdate.$unset = unset;
  }

  const updatedPost = await Post.findOneAndUpdate(
    {
      _id: post._id,
      workspaceId: workspace._id,
      createdByUserId: profile._id,
      status: "draft",
      __v: post.__v,
    },
    mongoUpdate,
    {
      new: true,
      runValidators: true,
    },
  )
    .select(
      "_id workspaceId createdByUserId title caption mediaIds platforms platformConnections status scheduledAt publishedAt createdAt updatedAt __v",
    )
    .lean();

  if (!updatedPost) {
    throw new PostServiceError(
      "The draft could not be updated because its status changed or it no longer exists.",
      409,
    );
  }

  return updatedPost;
}

/**
 * List calendar posts for an authorized workspace.
 *
 * Reuses Storm's existing workspace authorization.
 */
export async function listWorkspaceCalendarPosts(
  authUser: AuthenticatedUser,
  workspaceId: string,
  range: CalendarQuery,
) {
  const authorization = await getAuthorizedWorkspace(authUser, workspaceId);

  if (!authorization) {
    throw new PostServiceError("Workspace not found.", 404);
  }

  return findAuthorizedCalendarPosts(
    String(authorization.workspace._id),
    range,
  );
}

export async function changeWorkspaceSchedule(authUser: AuthenticatedUser, postId: string, scheduledAt?: Date) {
  const existing = await getWorkspacePostById(authUser, postId);
  if (!existing) throw new PostServiceError("Post not found.", 404);
  const workspaceId = String(existing.workspaceId);
  if (scheduledAt) {
    for (const platform of existing.platforms) {
      const reason = publishingUnavailableReason(platform, "schedule");
      if (reason) throw new PostServiceError(reason, 409);
    }
    const workspace = await Workspace.findOne({ _id: workspaceId }).select("settings").lean();
    const ruleError = schedulingRuleError(workspace?.settings ?? {}, scheduledAt);
    if (ruleError) throw new PostServiceError(ruleError, 400);
    if (existing.platforms.length !== 1 || !["facebook", "linkedin", "instagram"].includes(existing.platforms[0]) ||
        (existing.platforms[0] === "instagram" ? existing.mediaIds.length !== 1 : existing.mediaIds.length > 1)) {
      throw new PostServiceError("Schedule one destination with at most one image. Instagram requires an image.", 400);
    }
    if (existing.platforms[0] === "instagram") {
      if (!existing.platformConnections?.instagram) throw new PostServiceError("Select an Instagram account before scheduling.", 409);
      await validatePostInstagramSelection(workspaceId, existing.platforms, String(existing.platformConnections.instagram));
    }
    const limit = existing.platforms[0] === "instagram" ? 2200 : existing.platforms[0] === "linkedin" ? 3000 : 5000;
    if (!existing.caption.trim() || existing.caption.length > limit) throw new PostServiceError(`Caption must contain 1-${limit} characters.`, 400);
    if (existing.platforms[0] === "facebook" && !await validatePostFacebookSelection(workspaceId, existing.platforms, existing.platformConnections?.facebook ? String(existing.platformConnections.facebook) : undefined)) throw new PostServiceError("Select an active Facebook Page before rescheduling.", 409);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) throw new PostServiceError("Choose a valid future publishing time.", 400);
    if (existing.platforms.includes("linkedin")) {
      const connection = await LinkedInConnection.findOne({ _id: existing.platformConnections?.linkedin, workspaceId, status: "connected" }).select("tokenExpiresAt").lean();
      if (!connection?.tokenExpiresAt || connection.tokenExpiresAt.getTime() <= scheduledAt.getTime()) throw new PostServiceError("Reconnect LinkedIn before scheduling beyond credential expiry.", 409);
    }
  }
  const post = await Post.findOneAndUpdate({ _id: postId, workspaceId, status: "scheduled", attemptCount: 0 },
    scheduledAt ? { $set: { scheduledAt } } : { $set: { status: "draft" }, $unset: { scheduledAt: "" } },
    { returnDocument: "after", runValidators: true });
  if (!post) throw new PostServiceError("This schedule has already been claimed or changed. Refresh before trying again.", 409);
  return post.toObject();
}

export async function reconcileWorkspacePublication(authUser: AuthenticatedUser, postId: string) {
  const authorizedPost = await getWorkspacePostById(authUser, postId);
  const post = await Post.findById(postId)
    .select("status platforms platformResults scheduledAt +scheduledClaimId")
    .lean();
  if (!post || post.status !== "unknown") {
    throw new PostServiceError("Only uncertain publishing outcomes can be reconciled.", 409);
  }

  // Scheduled attempts require evidence for their claim. Immediate attempts
  // can already have a confirmed result when only overall reconciliation failed.
  const evidence = post.scheduledClaimId
    ? await PublishingAttemptEvidence.findOne({
        postId,
        claimId: post.scheduledClaimId,
        outcome: "published",
        platform: post.platforms[0],
        externalPostId: { $type: "string", $ne: "" },
      }).sort({ createdAt: -1 }).lean()
    : !post.scheduledAt ? post.platformResults.find(
        (result: { platform: string; status: string }) =>
          result.platform === post.platforms[0] && result.status === "published",
      ) : undefined;

  if (post.platforms.length !== 1 || !evidence?.externalPostId?.trim() ||
      !(evidence.publishedAt instanceof Date) || !Number.isFinite(evidence.publishedAt.getTime())) {
    throw new PostServiceError("No confirmed publication evidence is available. Check the destination account before retrying.", 409);
  }

  const updated = await Post.findOneAndUpdate({
    _id: postId,
    workspaceId: authorizedPost.workspaceId,
    status: "unknown",
    platforms: post.platforms,
    scheduledClaimId: post.scheduledClaimId ?? null,
    ...(!post.scheduledClaimId ? {
      scheduledAt: null,
      platformResults: { $elemMatch: {
        platform: evidence.platform,
        status: "published",
        externalPostId: evidence.externalPostId,
        publishedAt: evidence.publishedAt,
      } },
    } : {}),
  }, {
    $set: {
      status: "published",
      publishedAt: evidence.publishedAt,
      platformResults: [{
        platform: evidence.platform,
        status: "published",
        externalPostId: evidence.externalPostId,
        publishedAt: evidence.publishedAt,
        attemptCount: 1,
      }],
    },
    $unset: { lastError: "" },
  }, { returnDocument: "after", runValidators: true });
  if (!updated) throw new PostServiceError("The publishing outcome changed. Refresh and review it again.", 409);
  return updated.toObject();
}

/** Reject late revisions and prevent background saves from changing finalized drafts. */
async function writeComposerDraft(workspaceId: unknown, userId: unknown, clientDraftId: string,
  data: Record<string, unknown>, finalize = false, revision = 0) {
  const identity = { workspaceId, createdByUserId: userId, clientDraftId };
  const filter = { ...identity, status: "draft", autosaveClosed: { $ne: true },
    ...(!finalize ? { autosaveRevision: { $lte: revision } } : {}),
  };
  try {
    return await Post.findOneAndUpdate(filter, {
      $set: { ...data, ...(finalize ? { autosaveClosed: true } : { autosaveRevision: revision }) },
      // Concurrent manual edits must detect an intervening autosave.
      $inc: { __v: 1 },
      ...(!data.scheduledAt ? { $unset: { scheduledAt: "" } } : {}),
    }, { upsert: true, returnDocument: "after", runValidators: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error;
    const existing = await Post.findOne(identity);
    if (!existing) throw error;
    if (!finalize && (existing.autosaveClosed || existing.status !== "draft" || existing.autosaveRevision >= revision)) return existing;
    throw new PostServiceError("This composer draft was already saved. Open it from Posts.", 409);
  }
}

export async function autosaveWorkspaceDraft(authUser: AuthenticatedUser, input: AutosaveDraftInput) {
  const authorization = await getAuthorizedWorkspace(authUser, input.workspaceId);
  if (!authorization) throw new PostServiceError("Workspace not found.", 404);
  const mediaIds = await validatePostDraftMedia(authUser, input.workspaceId, input.mediaIds);
  const post = await writeComposerDraft(authorization.workspace._id, authorization.profile._id, input.clientDraftId, {
    title: input.title.trim() || "Untitled", caption: input.caption, mediaIds,
    platforms: input.platforms, status: "draft", ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {}),
  }, false, input.revision);
  return post.toObject();
}
