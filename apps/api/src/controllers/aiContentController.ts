import type { RequestHandler } from "express";

import {
  generateCaptionSchema,
  generateCaptionVariationsSchema,
  reviseCaptionSchema,
} from "../schemas/aiContentSchema.js";

import {
  AIContentServiceError,
  generateCaption,
  generateCaptionVariations,
  reviseCaption,
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

export const reviseCaptionController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const parsed = reviseCaptionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        message:
          parsed.error.issues[0]?.message ?? "Invalid caption revision data.",
      });
      return;
    }

    const caption = await reviseCaption(parsed.data);

    res.status(200).json({ caption });
  } catch (error) {
    if (error instanceof AIContentServiceError) {
      res.status(error.statusCode).json({
        error: "Caption revision failed",
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const generateCaptionVariationsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const parsed = generateCaptionVariationsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        message:
          parsed.error.issues[0]?.message ?? "Invalid caption generation data.",
      });
      return;
    }

    const result = await generateCaptionVariations(parsed.data);

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AIContentServiceError) {
      res.status(error.statusCode).json({
        error: "Caption variations generation failed",
        message: error.message,
      });
      return;
    }

    next(error);
  }
};
