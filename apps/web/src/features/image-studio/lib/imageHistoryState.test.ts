import { describe, expect, it } from "vitest";

import type {
  ImageGenerationDetails,
  ImageHistoryItem,
} from "@/lib/imageGeneration";

import {
  applyImageHistoryStatus,
  isImageStillProcessing,
} from "./imageHistoryState";

const ASSET_ID = "507f1f77bcf86cd799439011";

function pendingItem(): ImageHistoryItem {
  return {
    assetId: ASSET_ID,
    status: "pending",
    state: "processing",
    createdAt: "2026-11-09T01:00:00.000Z",
    updatedAt: "2026-11-09T01:00:00.000Z",
    aspectRatio: "square",
  };
}

function details(
  overrides: Partial<ImageGenerationDetails> = {},
): ImageGenerationDetails {
  return {
    assetId: ASSET_ID,
    status: "pending",
    state: "processing",
    createdAt: "2026-11-09T01:00:00.000Z",
    updatedAt: "2026-11-09T01:00:00.000Z",
    ...overrides,
  };
}

describe("Image history status restoration", () => {
  it("recognizes pending operations", () => {
    expect(isImageStillProcessing(pendingItem())).toBe(true);
  });

  it("preserves unchanged items", () => {
    const item = pendingItem();

    const result = applyImageHistoryStatus(item, details());

    expect(result).toBe(item);
  });

  it("updates a processing operation to ready", () => {
    const result = applyImageHistoryStatus(
      pendingItem(),
      details({
        status: "ready",
        state: "ready",
        updatedAt: "2026-11-09T01:01:00.000Z",
        image: {
          width: 1024,
          height: 1024,
          mimeType: "image/png",
        },
      }),
    );

    expect(result.status).toBe("ready");
    expect(result.state).toBe("ready");

    expect(result.image).toEqual({
      width: 1024,
      height: 1024,
      mimeType: "image/png",
    });

    expect(isImageStillProcessing(result)).toBe(false);
  });

  it("stops polling an operation requiring review", () => {
    const result = applyImageHistoryStatus(
      pendingItem(),
      details({
        status: "pending",
        state: "action_required",
      }),
    );

    expect(result.state).toBe("action_required");

    expect(isImageStillProcessing(result)).toBe(false);
  });

  it("stops polling failed operations", () => {
    const result = applyImageHistoryStatus(
      pendingItem(),
      details({
        status: "failed",
        state: "failed",
      }),
    );

    expect(result.status).toBe("failed");

    expect(isImageStillProcessing(result)).toBe(false);
  });

  it("ignores status responses for another asset", () => {
    const item = pendingItem();

    const result = applyImageHistoryStatus(
      item,
      details({
        assetId: "507f1f77bcf86cd799439099",
        status: "ready",
        state: "ready",
      }),
    );

    expect(result).toBe(item);
  });
});
