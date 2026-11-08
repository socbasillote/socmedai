import CreditTransaction from "../models/CreditTransaction.js";

import { ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";

export type ImageCreditAuditIssue = {
  assetId: string;
  code:
    | "missing_debit"
    | "debit_mismatch"
    | "refund_mismatch"
    | "refund_still_active"
    | "duplicate_refund_amount";
};

export type ImageCreditAuditReport = {
  inspected: number;
  issues: ImageCreditAuditIssue[];
  clean: boolean;
};

/**
 * Read-only audit of recent admissions.
 *
 * Missing historical events are reported,
 * not invented or silently backfilled.
 *
 * This is not yet a whole-wallet balance
 * reconciliation. Legacy wallets require a
 * controlled opening-balance cutover.
 */
export async function auditImageCreditAccounting(
  limit = 100,
): Promise<ImageCreditAuditReport> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid credit audit batch size.");
  }

  const admissions = await ImageGenerationAdmission.find({})
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(limit)
    .lean();

  const assetIds = admissions.map((a) => a.assetId);

  const events = await CreditTransaction.find({
    assetId: {
      $in: assetIds,
    },
    type: {
      $in: ["image_debit", "refund"],
    },
  }).lean();

  const byKey = new Map(events.map((event) => [event.eventKey, event]));

  const issues: ImageCreditAuditIssue[] = [];

  for (const admission of admissions) {
    const assetId = String(admission.assetId);

    const debit = byKey.get(`debit:${assetId}`);

    const refund = byKey.get(`refund:${assetId}`);

    if (!debit) {
      issues.push({
        assetId,
        code: "missing_debit",
      });
    } else if (
      debit.type !== "image_debit" ||
      String(debit.userId) !== String(admission.userId) ||
      debit.amount !== -admission.creditsCharged
    ) {
      issues.push({
        assetId,
        code: "debit_mismatch",
      });
    }

    if (refund) {
      if (
        refund.type !== "refund" ||
        String(refund.userId) !== String(admission.userId) ||
        String(refund.assetId) !== assetId
      ) {
        issues.push({
          assetId,
          code: "refund_mismatch",
        });
      }

      if (refund.amount !== admission.creditsCharged) {
        issues.push({
          assetId,
          code: "duplicate_refund_amount",
        });
      }

      if (admission.state === "active") {
        issues.push({
          assetId,
          code: "refund_still_active",
        });
      }
    }
  }

  return {
    inspected: admissions.length,
    issues,
    clean: issues.length === 0,
  };
}
