import { z } from "zod";

/**
 * Require explicit UTC timestamps.
 *
 * Calendar boundaries are calculated from the
 * user's local calendar in the frontend,
 * then transmitted as UTC instants.
 */
const utcTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith("Z"), "Timestamp must use UTC (Z).");

export const calendarQuerySchema = z
  .object({
    start: utcTimestampSchema,
    end: utcTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const start = Date.parse(value.start);
    const end = Date.parse(value.end);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return;
    }

    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "End must be after start.",
      });
      return;
    }

    const maxRangeMs = 45 * 24 * 60 * 60 * 1000;

    if (end - start > maxRangeMs) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Calendar date range cannot exceed 45 days.",
      });
    }
  });

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
