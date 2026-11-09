import mongoose from "mongoose";

import MediaAsset from "../models/MediaAsset.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";

import type { AuthenticatedUser } from "./userProfileService.js";

export class ImageGenerationHistoryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageGenerationHistoryError";
  }
}

export type ImageHistoryStatus = "pending" | "ready" | "failed";

export type ImageHistoryState =
  | "processing"
  | "ready"
  | "failed"
  | "action_required";

export type ImageHistoryItem = {
  assetId: string;
  status: ImageHistoryStatus;
  state: ImageHistoryState;
  createdAt: string;
  updatedAt: string;
  aspectRatio: "square" | "portrait" | "landscape";
  image?: {
    width: number;
    height: number;
    mimeType: "image/png";
  };
};

export type ImageHistoryResponse = {
  images: ImageHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type HistoryInput = {
  authUser: AuthenticatedUser;
  workspaceId: string;
  limit?: number;
  cursor?: string;
};

type DecodedCursor = {
  createdAt: Date;
  id: mongoose.Types.ObjectId;
};

const MAX_PAGE_SIZE = 30;
const DEFAULT_PAGE_SIZE = 12;

function encodeCursor(createdAt: Date, id: mongoose.Types.ObjectId): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      t: createdAt.toISOString(),
      id: String(id),
    }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): DecodedCursor {
  if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new ImageGenerationHistoryError("Invalid image history cursor.", 400);
  }

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");

    const value: unknown = JSON.parse(raw);

    if (
      typeof value !== "object" ||
      value === null ||
      !("v" in value) ||
      value.v !== 1 ||
      !("t" in value) ||
      typeof value.t !== "string" ||
      !("id" in value) ||
      typeof value.id !== "string"
    ) {
      throw new Error("Invalid cursor payload.");
    }

    const date = new Date(value.t);

    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== value.t ||
      !/^[a-fA-F0-9]{24}$/.test(value.id)
    ) {
      throw new Error("Invalid cursor values.");
    }

    // Reject malformed or noncanonical encodings.
    if (encodeCursor(date, new mongoose.Types.ObjectId(value.id)) !== cursor) {
      throw new Error("Invalid cursor encoding.");
    }

    return {
      createdAt: date,
      id: new mongoose.Types.ObjectId(value.id),
    };
  } catch {
    throw new ImageGenerationHistoryError("Invalid image history cursor.", 400);
  }
}

function historyState(
  status: ImageHistoryStatus,
  phase?: string,
): ImageHistoryState {
  if (status === "ready") {
    return "ready";
  }

  if (status === "failed") {
    return "failed";
  }

  if (phase === "recovery_required") {
    return "action_required";
  }

  return "processing";
}

export async function listWorkspaceImageHistory(
  input: HistoryInput,
): Promise<ImageHistoryResponse> {
  if (!/^[a-fA-F0-9]{24}$/.test(input.workspaceId)) {
    throw new ImageGenerationHistoryError("Workspace not found.", 404);
  }

  const limit = input.limit ?? DEFAULT_PAGE_SIZE;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ImageGenerationHistoryError("Invalid history page size.", 400);
  }

  // Decode before the database query.
  // Cursor contents are never used as raw
  // MongoDB operators.
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;

  const profile = await UserProfile.findOne({
    supabaseUserId: input.authUser.id,
  })
    .select("_id")
    .lean();

  const workspace = profile
    ? await Workspace.findOne({
        _id: input.workspaceId,
        ownerUserId: profile._id,
      })
        .select("_id")
        .lean()
    : null;

  if (!profile || !workspace) {
    throw new ImageGenerationHistoryError("Workspace not found.", 404);
  }

  const paginationFilter = cursor
    ? {
        $or: [
          {
            createdAt: {
              $lt: cursor.createdAt,
            },
          },
          {
            createdAt: cursor.createdAt,
            _id: {
              $lt: cursor.id,
            },
          },
        ],
      }
    : {};

  const assets = await MediaAsset.find({
    workspaceId: workspace._id,
    createdByUserId: profile._id,
    type: "image",
    source: "ai-generated",
    ...paginationFilter,
  })
    .select(
      [
        "_id",
        "status",
        "createdAt",
        "updatedAt",
        "generation.aspectRatio",
        "generationExecution.phase",
        "width",
        "height",
        "mimeType",
      ].join(" "),
    )
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(limit + 1)
    .lean();

  const hasMore = assets.length > limit;
  const page = assets.slice(0, limit);

  const images: ImageHistoryItem[] = page.map((asset) => {
    const status = asset.status as ImageHistoryStatus;

    const aspectRatio = asset.generation?.aspectRatio;

    const item: ImageHistoryItem = {
      assetId: String(asset._id),
      status,
      state: historyState(status, asset.generationExecution?.phase),
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      aspectRatio:
        aspectRatio === "portrait" || aspectRatio === "landscape"
          ? aspectRatio
          : "square",
    };

    if (
      status === "ready" &&
      typeof asset.width === "number" &&
      typeof asset.height === "number" &&
      asset.mimeType === "image/png"
    ) {
      item.image = {
        width: asset.width,
        height: asset.height,
        mimeType: "image/png",
      };
    }

    return item;
  });

  const last = page.at(-1);

  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last._id) : null;

  return {
    images,
    nextCursor,
    hasMore,
  };
}
