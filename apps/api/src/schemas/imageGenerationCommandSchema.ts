import { z } from "zod";

import { generateImageSchema } from "./aiImageSchema.js";

/**
 * Internal representation of a validated
 * generation request.
 *
 * The workspaceId comes from an authenticated
 * route parameter, not an arbitrary body field.
 */
export const imageGenerationCommandSchema = z
  .object({
    workspaceId: z
      .string()
      .regex(/^[a-fA-F0-9]{24}$/, "A valid workspace ID is required."),

    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,128}$/, "A valid idempotency key is required."),

    image: generateImageSchema,
  })
  .strict();

export type ImageGenerationCommand = z.infer<
  typeof imageGenerationCommandSchema
>;
