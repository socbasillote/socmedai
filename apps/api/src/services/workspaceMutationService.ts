import mongoose, { type ClientSession } from "mongoose";
import Workspace from "../models/Workspace.js";

export class WorkspaceInactiveError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("Workspace is no longer active. Reload before trying again.");
  }
}

/**
 * Write the same workspace document as lifecycle transitions, before admitting
 * work. A read alone permits snapshot-isolation write skew across collections.
 * The callback must use this session and must never perform external effects:
 * MongoDB can retry it after a competing lifecycle/admission transaction.
 */
export async function withActiveWorkspaceMutation<T>(
  workspaceId: unknown,
  mutate: (session: ClientSession) => Promise<T>,
): Promise<T> {
  return mongoose.connection.transaction(async (session) => {
    const workspace = await Workspace.findOneAndUpdate(
      { _id: workspaceId },
      { $inc: { mutationVersion: 1 } },
      { session, returnDocument: "after", timestamps: false },
    );
    if (!workspace) throw new WorkspaceInactiveError();
    return mutate(session);
  });
}
