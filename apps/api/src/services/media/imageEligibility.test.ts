import mongoose from "mongoose";

import { describe, expect, it } from "vitest";

import {
  evaluateImageEligibility,
  isPreviewReadyImage,
} from "./imageEligibility.js";

import { getImageStorageKey } from "./supabaseImageStorage.js";

const WORKSPACE_ID = new mongoose.Types.ObjectId().toString();

const ASSET_ID = new mongoose.Types.ObjectId().toString();

function makeReadyAsset() {
  return {
    _id: ASSET_ID,
    workspaceId: WORKSPACE_ID,

    type: "image",
    source: "ai-generated",
    status: "ready",

    storageProvider: "supabase",
    storageKey: getImageStorageKey(WORKSPACE_ID, ASSET_ID),

    mimeType: "image/png",

    width: 1024,
    height: 1024,
    fileSize: 4096,

    idempotencyKey: "integration-test-idempotency-key",

    generationExecution: {
      phase: "storage_pending",
      attemptCount: 1,
    },

    contentSha256: "a".repeat(64),
  };
}

describe("Image eligibility", () => {
  it("accepts complete verified image metadata", () => {
    const asset = makeReadyAsset();

    expect(isPreviewReadyImage(asset)).toBe(true);

    expect(evaluateImageEligibility(asset)).toEqual({
      eligible: true,
    });
  });

  it("rejects pending images", () => {
    const asset = {
      ...makeReadyAsset(),
      status: "pending",
    };

    expect(evaluateImageEligibility(asset)).toEqual({
      eligible: false,
      reason: "invalid-status",
    });
  });

  it("rejects failed images", () => {
    const asset = {
      ...makeReadyAsset(),
      status: "failed",
    };

    expect(isPreviewReadyImage(asset)).toBe(false);
  });

  it("rejects an unexpected storage key", () => {
    const asset = {
      ...makeReadyAsset(),
      storageKey: "unexpected/path.png",
    };

    expect(evaluateImageEligibility(asset)).toEqual({
      eligible: false,
      reason: "invalid-storage",
    });
  });

  it("rejects unsupported image formats", () => {
    const asset = {
      ...makeReadyAsset(),
      mimeType: "image/jpeg",
    };

    expect(isPreviewReadyImage(asset)).toBe(false);
  });

  it("rejects missing checksums", () => {
    const asset = {
      ...makeReadyAsset(),
      contentSha256: undefined,
    };

    expect(evaluateImageEligibility(asset)).toEqual({
      eligible: false,
      reason: "missing-generation-verification",
    });
  });

  it("rejects legacy assets without generation execution", () => {
    const asset = {
      ...makeReadyAsset(),
      generationExecution: undefined,
    };

    expect(isPreviewReadyImage(asset)).toBe(false);
  });

  it("rejects invalid image dimensions", () => {
    const asset = {
      ...makeReadyAsset(),
      width: 0,
    };

    expect(evaluateImageEligibility(asset)).toEqual({
      eligible: false,
      reason: "invalid-file-metadata",
    });
  });

  it("rejects missing generation idempotency keys", () => {
    const asset = {
      ...makeReadyAsset(),
      idempotencyKey: undefined,
    };

    expect(isPreviewReadyImage(asset)).toBe(false);
  });

  it("rejects invalid asset identifiers", () => {
    const asset = {
      ...makeReadyAsset(),
      _id: "invalid-id",
    };

    expect(evaluateImageEligibility(asset)).toEqual({
      eligible: false,
      reason: "invalid-identity",
    });
  });
});
