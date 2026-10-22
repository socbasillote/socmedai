import type { RequestHandler } from "express";

import { generateCaptionSchema } from "../schemas/aiContentSchema.js";
import {
  AIContentServiceError,
  generateCaption,
} from "../services/aiContentService.js";

export const generateCaptionController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const parsed = generateCaptionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        message:
          parsed.error.issues[0]?.message ?? "Invalid caption generation data.",
      });
      return;
    }

    const caption = await generateCaption(parsed.data);

    res.status(200).json({ caption });
  } catch (error) {
    if (error instanceof AIContentServiceError) {
      res.status(error.statusCode).json({
        error: "Caption generation failed",
        message: error.message,
      });
      return;
    }

    next(error);
  }
};
