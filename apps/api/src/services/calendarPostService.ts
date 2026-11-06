import Post from "../models/Post.js";

import type { CalendarQuery } from "../schemas/calendarQuerySchema.js";

const MAX_CALENDAR_POSTS = 1000;

export class CalendarPostServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CalendarPostServiceError";
  }
}

/**
 * Only call this function after the workspace
 * has been authorized for the authenticated user.
 *
 * authorizedWorkspaceId must come from server-side
 * authorization, never directly from req.params.
 */
export async function findAuthorizedCalendarPosts(
  authorizedWorkspaceId: string,
  range: CalendarQuery,
) {
  const start = new Date(range.start);
  const end = new Date(range.end);

  const posts = await Post.find({
    workspaceId: authorizedWorkspaceId,

    $or: [
      {
        status: {
          $in: ["scheduled", "publishing", "failed"],
        },
        scheduledAt: {
          $gte: start,
          $lt: end,
        },
      },
      {
        status: "published",
        publishedAt: {
          $gte: start,
          $lt: end,
        },
      },
    ],
  })
    .select(
      [
        "_id",
        "workspaceId",
        "createdByUserId",
        "title",
        "caption",
        "mediaIds",
        "platforms",
        "status",
        "scheduledAt",
        "publishedAt",
        "lastError",
        "createdAt",
        "updatedAt",
      ].join(" "),
    )
    .sort({
      scheduledAt: 1,
      publishedAt: 1,
      _id: 1,
    })
    .limit(MAX_CALENDAR_POSTS + 1)
    .lean();

  if (posts.length > MAX_CALENDAR_POSTS) {
    throw new CalendarPostServiceError(
      "Calendar contains too many posts for this " +
        "range. Select a smaller date range.",
      422,
    );
  }

  return {
    posts,
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}
