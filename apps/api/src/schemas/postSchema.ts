import { z } from "zod";

import { POST_PLATFORMS } from "../models/Post.js";

const platformConnectionsSchema = z
  .object({
    instagram: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    facebook: z
      .string()
      .regex(/^[a-fA-F0-9]{24}$/, {
        message: "A valid Facebook connection ID is required.",
      })
      .optional(),

    linkedin: z
      .string()
      .regex(/^[a-f\d]{24}$/i, {
        message: "A valid LinkedIn connection ID is required.",
      })
      .optional(),
  })
  .strict();

export const postMediaIdsSchema = z
  .array(
    z.string().regex(/^[a-f\d]{24}$/i, {
      message: "Each media ID must be a valid ObjectId.",
    }),
  )
  .max(20, "A post can reference at most 20 media items.")
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    {
      message: "Duplicate media attachments are not allowed.",
    },
  );

export const createPostRequestSchema = z
  .object({
    clientDraftId: z.uuid().optional(),
    workspaceId: z.string().regex(/^[a-f\d]{24}$/i, {
      message: "A valid workspace ID is required.",
    }),
    title: z
      .string()
      .trim()
      .max(150, "Title must be 150 characters or fewer.")
      .optional(),
    caption: z
      .string()
      .trim()
      .min(1, "Caption is required.")
      .max(10000, "Caption must be 10,000 characters or fewer."),
    mediaIds: postMediaIdsSchema.default([]),
    platforms: z
      .array(z.enum(POST_PLATFORMS))
      .min(1, "Select at least one publishing platform.")
      .refine((platforms) => new Set(platforms).size === platforms.length, {
        message: "Publishing platforms must not contain duplicates.",
      }),
    platformConnections: platformConnectionsSchema.optional(),
    scheduledAt: z.iso.datetime().optional(),
  })
  .superRefine((data, context) => {
    if (
      data.platformConnections?.linkedin &&
      !data.platforms.includes("linkedin")
    ) {
      context.addIssue({
        code: "custom",
        path: ["platformConnections", "linkedin"],
        message:
          "A LinkedIn account can only be selected when LinkedIn is a publishing platform.",
      });
    }
    if (
      data.platformConnections?.facebook &&
      !data.platforms.includes("facebook")
    ) {
      context.addIssue({
        code: "custom",
        path: ["platformConnections", "facebook"],
        message:
          "A Facebook Page can only be selected when Facebook is a publishing platform.",
      });
    }
    if (data.platformConnections?.instagram && !data.platforms.includes("instagram")) {
      context.addIssue({ code: "custom", path: ["platformConnections", "instagram"], message: "Select Instagram before choosing an Instagram account." });
    }
    if (data.scheduledAt !== undefined) {
      const limit = data.platforms.includes("instagram") ? 2200 : data.platforms.includes("linkedin") ? 3000 : 5000;
      if (data.caption.length > limit) context.addIssue({ code: "custom", path: ["caption"], message: `Caption must not exceed ${limit} characters for scheduled publishing.` });
      // Scheduled publishing currently supports one destination.
      if (
        data.platforms.length !== 1 ||
        !["facebook", "linkedin", "instagram"].includes(data.platforms[0])
      ) {
        context.addIssue({
          code: "custom",
          path: ["platforms"],
          message:
            "Scheduled publishing requires exactly one Facebook, LinkedIn, or Instagram platform.",
        });
      }

      const selectedPlatform = data.platforms[0];

      if (selectedPlatform === "instagram" && (!data.platformConnections?.instagram || data.mediaIds.length !== 1)) {
        context.addIssue({ code: "custom", path: ["mediaIds"], message: "Scheduled Instagram posts require a connected Instagram account and exactly one image." });
      }
      if (selectedPlatform === "facebook") {
        if (!data.platformConnections?.facebook) {
          context.addIssue({
            code: "custom",
            path: ["platformConnections", "facebook"],
            message: "Select a Facebook Page before scheduling.",
          });
        }
      }

      if (selectedPlatform === "linkedin") {
        if (!data.platformConnections?.linkedin) {
          context.addIssue({
            code: "custom",
            path: ["platformConnections", "linkedin"],
            message: "Select a LinkedIn account before scheduling.",
          });
        }
      }

      if (data.mediaIds.length > 1) {
        context.addIssue({
          code: "custom",
          path: ["mediaIds"],
          message: "Scheduled publishing supports at most one image.",
        });
      }
    }
  });

export const createPostSchema = createPostRequestSchema.superRefine((data, context) => {
  if (data.scheduledAt && Date.parse(data.scheduledAt) <= Date.now()) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "Scheduled time must be in the future." });
});

export const validatePostBatchSchema = z.object({ posts: z.array(createPostRequestSchema).min(1).max(60) }).strict();

export const updateDraftPostSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(150, "Title must be 150 characters or fewer.")
      .optional(),
    caption: z
      .string()
      .trim()
      .min(1, "Caption is required.")
      .max(10000, "Caption must be 10,000 characters or fewer.")
      .optional(),
    platforms: z
      .array(z.enum(POST_PLATFORMS))
      .min(1, "Select at least one publishing platform.")
      .refine((platforms) => new Set(platforms).size === platforms.length, {
        message: "Publishing platforms must not contain duplicates.",
      })
      .optional(),
    platformConnections: platformConnectionsSchema.optional(),
    mediaIds: postMediaIdsSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.caption !== undefined ||
      data.mediaIds !== undefined ||
      data.platforms !== undefined ||
      data.platformConnections !== undefined,
    {
      message: "Provide at least one field to update.",
    },
  );

export const listWorkspacePostsQuerySchema = z
  .object({
    sort: z.enum(["newest", "oldest"]).optional(),
    limit: z.coerce
      .number()
      .int("Limit must be a whole number.")
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    cursor: z
      .string()
      .regex(/^[a-fA-F0-9]{24}$/, "Cursor must be a valid post ID.")
      .optional(),
    search: z
      .string()
      .trim()
      .max(200, "Search cannot exceed 200 characters.")
      .default(""),
    status: z
      .enum(["all", "draft", "scheduled", "publishing", "published", "failed"])
      .default("all"),
    platform: z
      .enum(["all", "facebook", "instagram", "linkedin"])
      .default("all"),
  })
  .strict();

export type ListWorkspacePostsQuery = z.infer<
  typeof listWorkspacePostsQuerySchema
>;

export type UpdateDraftPostInput = z.infer<typeof updateDraftPostSchema>;

export type CreatePostInput = z.infer<typeof createPostSchema>;

// Incomplete content is allowed only for draft autosave, never for publishing.
export const autosaveDraftSchema = z.object({
  workspaceId: z.string().regex(/^[a-f0-9]{24}$/i),
  clientDraftId: z.uuid(),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  title: z.string().trim().max(150),
  caption: z.string().max(10000),
  platforms: z.array(z.enum(POST_PLATFORMS)).max(3).refine((items) => new Set(items).size === items.length),
  mediaIds: postMediaIdsSchema,
  scheduledAt: z.iso.datetime().optional(),
}).strict();
export type AutosaveDraftInput = z.infer<typeof autosaveDraftSchema>;
