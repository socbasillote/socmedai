import { z } from "zod";

import { POST_PLATFORMS } from "../models/Post.js";

const platformConnectionsSchema = z
  .object({
    linkedin: z
      .string()
      .regex(/^[a-f\d]{24}$/i, {
        message: "A valid LinkedIn connection ID is required.",
      })
      .optional(),
  })
  .strict();

export const createPostSchema = z
  .object({
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
    mediaIds: z
      .array(
        z.string().regex(/^[a-f\d]{24}$/i, {
          message: "Each media ID must be a valid ObjectId.",
        }),
      )
      .max(20, "A post can reference at most 20 media items.")
      .default([]),
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
    if (data.scheduledAt) {
      const scheduledTime = new Date(data.scheduledAt).getTime();

      if (scheduledTime <= Date.now()) {
        context.addIssue({
          code: "custom",
          path: ["scheduledAt"],
          message: "Scheduled time must be in the future.",
        });
      }
    }
  });

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
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.caption !== undefined ||
      data.platforms !== undefined ||
      data.platformConnections !== undefined,
    {
      message: "Provide at least one field to update.",
    },
  );

export const listWorkspacePostsQuerySchema = z
  .object({
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
