import mongoose from "mongoose";
import sharp from "sharp";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import MediaAsset from "../models/MediaAsset.js";
import ImageReference from "../models/ImageReference.js";
import { UserCreditWallet, ImageDailyUsage, ImageWorkspaceCapacity, ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";
import { uploadImageReference } from "./media/imageReferenceService.js";
import { enqueueImageGeneration } from "./imageGenerationQueueService.js";
import { runImageGenerationWorkerOnce } from "./imageGenerationWorkerService.js";
import { parseImageGenerationConfig } from "../config/imageGenerationConfig.js";
import { MockImageProvider } from "./media/providers/mockImageProvider.js";
import type { ImageStorageBucket } from "./media/supabaseImageStorage.js";
import type { ImageProviderRequest } from "./media/providers/imageProvider.js";

let mongo: MongoMemoryReplSet;
const owner = { id: "photo-owner", email: "owner@example.test" };
const userId = new mongoose.Types.ObjectId();
const workspaceId = new mongoose.Types.ObjectId();
const foreignWorkspace = new mongoose.Types.ObjectId();
const config = parseImageGenerationConfig({ IMAGE_GENERATION_PROVIDER: "mock" });
const objects = new Map<string, Uint8Array>();
const bucket: ImageStorageBucket = {
  upload: async (key, body) => { objects.set(key, new Uint8Array(body)); return { error: null }; },
  download: async (key) => ({ data: objects.has(key) ? new Blob([Uint8Array.from(objects.get(key)!).buffer]) : null, error: null }),
  remove: async (keys) => { keys.forEach((key) => objects.delete(key)); return { error: null }; },
};
async function photo() { return sharp({ create: { width: 80, height: 60, channels: 3, background: "red" } }).jpeg().toBuffer(); }
function command(id: string, usage: "inspiration" | "edit" | "design" = "edit") {
  return { workspaceId: String(workspaceId), idempotencyKey: "reference-photo-command-0001", image: {
    prompt: "Replace the background with a clean studio setting.", aspectRatio: "square" as const, reference: { id, usage },
  } };
}
beforeAll(async () => {
  vi.stubEnv("IMAGE_GENERATION_PROVIDER", "mock");
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([MediaAsset.createIndexes(), ImageReference.createIndexes(), UserCreditWallet.createIndexes(), ImageDailyUsage.createIndexes(), ImageWorkspaceCapacity.createIndexes(), ImageGenerationAdmission.createIndexes()]);
  await UserProfile.collection.insertOne({ _id: userId, supabaseUserId: owner.id });
  await Workspace.collection.insertOne({ _id: workspaceId, ownerUserId: userId, name: "Photos" });
});
beforeEach(async () => {
  await Promise.all([MediaAsset.deleteMany({}), ImageReference.deleteMany({}), UserCreditWallet.deleteMany({}), ImageDailyUsage.deleteMany({}), ImageWorkspaceCapacity.deleteMany({}), ImageGenerationAdmission.deleteMany({})]);
  objects.clear();
  await UserCreditWallet.create({ userId, balance: 5 });
});
afterAll(async () => { vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo.stop(); });
it("uploads privately, persists the exact input, and delivers it to the background worker", async () => {
  const reference = await uploadImageReference(owner, String(workspaceId), await photo(), bucket);
  expect((await UserCreditWallet.findOne({ userId })).balance).toBe(5);
  const queued = await enqueueImageGeneration({ authUser: owner, config, command: command(reference.referenceId) });
  const asset = await MediaAsset.findById(queued.assetId);
  expect(asset.referenceImage.usage).toBe("edit");
  const generate = vi.fn(async (request: ImageProviderRequest) => new MockImageProvider().generate(request));
  await runImageGenerationWorkerOnce({ bucket, provider: { provider: "mock", model: "storm-mock-image-v1", generate } });
  expect(generate).toHaveBeenCalledOnce();
  const input = generate.mock.calls[0][0].referenceImage!;
  expect(input.usage).toBe("edit");
  expect((await sharp(input.bytes).metadata()).format).toBe("png");
  expect((await MediaAsset.findById(queued.assetId)).status).toBe("ready");
  expect((await UserCreditWallet.findOne({ userId })).balance).toBe(4);
});
it("does not debit for a foreign reference, and disallows uploading into another workspace", async () => {
  await expect(uploadImageReference(owner, String(foreignWorkspace), await photo(), bucket)).rejects.toMatchObject({ statusCode: 404 });
  const id = new mongoose.Types.ObjectId();
  await ImageReference.create({ _id: id, workspaceId: foreignWorkspace, createdByUserId: new mongoose.Types.ObjectId(), storageKey: "private", sha256: "a".repeat(64), width: 80, height: 60 });
  await expect(enqueueImageGeneration({ authUser: owner, config, command: command(String(id)) })).rejects.toMatchObject({ statusCode: 404 });
  expect((await UserCreditWallet.findOne({ userId })).balance).toBe(5);
});
it("rejects corrupt input before storing or charging", async () => {
  await expect(uploadImageReference(owner, String(workspaceId), Buffer.from("not an image"), bucket)).rejects.toMatchObject({ statusCode: 400 });
  expect(objects.size).toBe(0);
  expect(await ImageReference.countDocuments()).toBe(0);
});
it("includes reference and usage in idempotency and rejects a changed photo mode", async () => {
  const reference = await uploadImageReference(owner, String(workspaceId), await photo(), bucket);
  await enqueueImageGeneration({ authUser: owner, config, command: command(reference.referenceId) });
  const retry = await enqueueImageGeneration({ authUser: owner, config, command: command(reference.referenceId) });
  expect(retry.creditsChargedNow).toBe(0);
  await expect(enqueueImageGeneration({ authUser: owner, config, command: command(reference.referenceId, "inspiration") })).rejects.toMatchObject({ statusCode: 409 });
  expect((await UserCreditWallet.findOne({ userId })).balance).toBe(4);
});
it("never calls the provider if stored reference bytes were altered", async () => {
  const reference = await uploadImageReference(owner, String(workspaceId), await photo(), bucket);
  const queued = await enqueueImageGeneration({ authUser: owner, config, command: command(reference.referenceId) });
  const asset = await MediaAsset.findById(queued.assetId);
  objects.set(asset.referenceImage.storageKey, await sharp({ create: { width: 80, height: 60, channels: 3, background: "blue" } }).png().toBuffer());
  const generate = vi.fn();
  const result = await runImageGenerationWorkerOnce({ bucket, provider: { provider: "mock", model: "storm-mock-image-v1", generate } });
  expect(generate).not.toHaveBeenCalled();
  expect(result[0].outcome).toBe("recovery_required");
});
