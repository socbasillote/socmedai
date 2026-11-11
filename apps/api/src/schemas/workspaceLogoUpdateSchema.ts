import { z } from "zod";

import { workspaceLogoPositionSchema } from "../services/media/workspaceLogoConfig.js";

export const updateWorkspaceLogoSchema = z
  .object({
    enabled: z.boolean().optional(),
    position: workspaceLogoPositionSchema.optional(),
    sizePercent: z.number().int().min(5).max(30).optional(),
    opacity: z.number().min(0.1).max(1).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting is required.",
  });

export type UpdateWorkspaceLogoInput = z.infer<
  typeof updateWorkspaceLogoSchema
>;
