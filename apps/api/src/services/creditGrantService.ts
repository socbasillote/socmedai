import mongoose from "mongoose";

import UserProfile from "../models/UserProfile.js";
import CreditTransaction from "../models/CreditTransaction.js";

import { UserCreditWallet } from "../models/ImageGenerationAccounting.js";

export class CreditGrantError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CreditGrantError";
  }
}

type GrantCreditsInput = {
  userId: string;
  grantKey: string;
  amount: number;
  reason: "development_seed" | "support_adjustment";
};

export type CreditGrantResult = {
  eventKey: string;
  amount: number;
  balance: number;
  created: boolean;
};

function retryableTransactionError(error: unknown): boolean {
  if (error instanceof Error && "code" in error && error.code === 11000) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "hasErrorLabel" in error &&
    typeof error.hasErrorLabel === "function" &&
    error.hasErrorLabel("TransientTransactionError")
  );
}

/**
 * Trusted backend operation only.
 *
 * Never expose this service directly through
 * a public client-controlled credit endpoint.
 */
export async function grantUserCredits(
  input: GrantCreditsInput,
): Promise<CreditGrantResult> {
  if (
    !mongoose.isObjectIdOrHexString(input.userId) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(input.grantKey) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount < 1 ||
    input.amount > 1000 ||
    !["development_seed", "support_adjustment"].includes(input.reason)
  ) {
    throw new CreditGrantError("Invalid trusted credit grant.", 400);
  }

  const userId = new mongoose.Types.ObjectId(input.userId);

  const eventKey = `grant:${input.grantKey}`;

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const existing = await CreditTransaction.findOne({
          eventKey,
        }).session(session);

        if (existing) {
          if (
            String(existing.userId) !== input.userId.toLowerCase() ||
            existing.type !== "grant" ||
            existing.amount !== input.amount ||
            existing.reason !== input.reason
          ) {
            throw new CreditGrantError(
              "Grant key was reused with different details.",
              409,
            );
          }

          return {
            eventKey,
            amount: existing.amount,
            balance: existing.balanceAfter,
            created: false,
          };
        }

        const profile = await UserProfile.findById(userId)
          .select("_id")
          .session(session);

        if (!profile) {
          throw new CreditGrantError("Credit recipient not found.", 404);
        }

        // Ensure the wallet exists.
        await UserCreditWallet.updateOne(
          { userId },
          {
            $setOnInsert: {
              userId,
              balance: 0,
            },
          },
          {
            upsert: true,
            session,
          },
        );

        const wallet = await UserCreditWallet.findOneAndUpdate(
          { userId },
          {
            $inc: {
              balance: input.amount,
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!wallet || !Number.isSafeInteger(wallet.balance)) {
          throw new CreditGrantError("Unable to update credit wallet.", 500);
        }

        await CreditTransaction.create(
          [
            {
              userId,
              eventKey,
              type: "grant",
              amount: input.amount,
              balanceAfter: wallet.balance,
              reason: input.reason,
            },
          ],
          { session },
        );

        return {
          eventKey,
          amount: input.amount,
          balance: wallet.balance,
          created: true,
        };
      });
    } catch (error) {
      if (attempt < 7 && retryableTransactionError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new CreditGrantError("Credit grant could not be completed.", 503);
}
