import mongoose from "mongoose";

import LinkedInConnection from "../../models/LinkedInConnection.js";

export class LinkedInConnectionSelectionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInConnectionSelectionError";
  }
}

type ValidateLinkedInConnectionSelectionInput = {
  workspaceId: string;
  connectionId: string;
};

export async function validateLinkedInConnectionSelection({
  workspaceId,
  connectionId,
}: ValidateLinkedInConnectionSelectionInput): Promise<string> {
  if (
    !mongoose.isValidObjectId(workspaceId) ||
    !mongoose.isValidObjectId(connectionId)
  ) {
    throw new LinkedInConnectionSelectionError(
      "LinkedIn connection not found.",
      404,
    );
  }

  const connection = await LinkedInConnection.findOne({
    _id: connectionId,
    workspaceId,
  })
    .select("_id status scopes")
    .lean();

  if (!connection) {
    throw new LinkedInConnectionSelectionError(
      "LinkedIn connection not found in this workspace.",
      404,
    );
  }

  if (connection.status !== "connected") {
    throw new LinkedInConnectionSelectionError(
      "The selected LinkedIn account is not connected. Reconnect LinkedIn before selecting it.",
      409,
    );
  }

  if (!connection.scopes.includes("w_member_social")) {
    throw new LinkedInConnectionSelectionError(
      "The selected LinkedIn account does not have publishing permission.",
      403,
    );
  }

  return connection._id.toString();
}
