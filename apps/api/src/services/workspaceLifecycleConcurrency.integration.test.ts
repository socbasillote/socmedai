import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Workspace from "../models/Workspace.js";
import UserProfile from "../models/UserProfile.js";
import Post from "../models/Post.js";
import MediaAsset from "../models/MediaAsset.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import { UserCreditWallet, ImageDailyUsage, ImageWorkspaceCapacity, ImageGenerationAdmission } from "../models/ImageGenerationAccounting.js";
import CreditTransaction from "../models/CreditTransaction.js";
import { changeWorkspaceLifecycle } from "./workspaceSettingsService.js";
import { withActiveWorkspaceMutation } from "./workspaceMutationService.js";
import { createWorkspacePost } from "./postService.js";
import { admitImageGeneration } from "./imageGenerationAdmissionService.js";
import { claimImmediatePost } from "./publishing/immediatePublishingService.js";
import { claimImmediateFacebookPost } from "./publishing/facebookImmediatePublishingService.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const user = { id: "lifecycle-concurrency-owner", email: null };
const ownerId = new mongoose.Types.ObjectId();
const workspaceId = new mongoose.Types.ObjectId();
const connectionId = new mongoose.Types.ObjectId();
let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Workspace.init(), UserProfile.init(), Post.init(), MediaAsset.init(), LinkedInConnection.init(),
    UserCreditWallet.init(), ImageDailyUsage.init(), ImageWorkspaceCapacity.init(), ImageGenerationAdmission.init(), CreditTransaction.init()]);
}, 60000);
beforeEach(async () => {
  vi.restoreAllMocks();
  process.env.SCHEDULED_PUBLISHING_ENABLED = "true";
  process.env.FACEBOOK_PUBLISHING_ENABLED = "true";
  await Promise.all([Workspace.deleteMany({}), UserProfile.deleteMany({}), Post.deleteMany({}), MediaAsset.deleteMany({}),
    LinkedInConnection.deleteMany({}), UserCreditWallet.deleteMany({}), ImageDailyUsage.deleteMany({}),
    ImageWorkspaceCapacity.deleteMany({}), ImageGenerationAdmission.deleteMany({}), CreditTransaction.deleteMany({})]);
  await UserProfile.collection.insertOne({ _id: ownerId, supabaseUserId: user.id });
  await Workspace.create({ _id: workspaceId, ownerUserId: ownerId, name: "Race test" });
  await LinkedInConnection.collection.insertOne({ _id: connectionId, workspaceId, status: "connected", scopes: ["w_member_social"], tokenExpiresAt: new Date(Date.now() + 7 * 86400000) });
  await UserCreditWallet.create({ userId: ownerId, balance: 5 });
});
afterAll(async () => { vi.restoreAllMocks(); await mongoose.disconnect(); await mongo?.stop(); });

describe.each(["archive", "delete"] as const)("%s serialization", (action) => {
  it.each(["schedule", "publish", "facebook", "image"] as const)("rejects %s admission authorized before the lifecycle commit", async (kind) => {
    const post = await Post.create({ workspaceId, createdByUserId: ownerId, caption: "Caption", mediaIds: [],
      platforms: [kind === "facebook" ? "facebook" : "linkedin"],
      platformConnections: { [kind === "facebook" ? "facebook" : "linkedin"]: connectionId }, status: "draft" });
    const lifecycleLocked = deferred(), releaseLifecycle = deferred(), admissionStarted = deferred();
    const exists = Post.exists.bind(Post);
    // Hold the lifecycle transaction after it has written its workspace guard
    // and checked posts, reproducing the original check-before-update window.
    vi.spyOn(Post, "exists").mockImplementationOnce((...args) => {
      const query = exists(...args);
      const exec = query.exec.bind(query);
      query.exec = async () => {
        const result = await exec();
        lifecycleLocked.resolve();
        await releaseLifecycle.promise;
        return result;
      };
      return query;
    });
    const mutateWorkspace = Workspace.findOneAndUpdate.bind(Workspace);
    vi.spyOn(Workspace, "findOneAndUpdate").mockImplementation((...args) => {
      const filter = args[0] as Record<string, unknown> | undefined;
      if (!filter?.name) admissionStarted.resolve();
      return mutateWorkspace(...args);
    });
    const transition = changeWorkspaceLifecycle(user, String(workspaceId), action, "Race test");
    await lifecycleLocked.promise;
    const input = { authUser: user, workspaceId: String(workspaceId), postId: String(post._id) };
    const admission = kind === "schedule"
      ? createWorkspacePost(user, { workspaceId: String(workspaceId), caption: "Scheduled", platforms: ["linkedin"], mediaIds: [],
          platformConnections: { linkedin: String(connectionId) }, scheduledAt: new Date(Date.now() + 86400000).toISOString() })
      : kind === "publish" ? claimImmediatePost(input)
      : kind === "facebook" ? claimImmediateFacebookPost(input)
      : admitImageGeneration({ authUser: user, workspaceId: String(workspaceId), idempotencyKey: "lifecycle-image-request",
          image: { prompt: "A professional photograph of coffee", aspectRatio: "square" },
          generation: { provider: "mock", model: "mock-image" }, policy: { dailyLimit: 10, maxActive: 2 } });
    // Attach a rejection handler immediately, including while the gate is held.
    const outcome = Promise.allSettled([admission]);
    try { await admissionStarted.promise; } finally { releaseLifecycle.resolve(); }
    await expect(transition).resolves.toBeTruthy();
    expect((await outcome)[0]).toMatchObject({ status: "rejected", reason: { statusCode: kind === "image" ? 404 : 409 } });
    expect(await Post.countDocuments({ status: { $in: ["scheduled", "publishing"] } })).toBe(0);
    expect(await MediaAsset.countDocuments()).toBe(0);
    expect((await UserCreditWallet.findOne({ userId: ownerId }))?.balance).toBe(5);
    expect(await CreditTransaction.countDocuments()).toBe(0);
  }, 15000);

  it("rolls back the lifecycle transition when work commits first", async () => {
    const admitted = deferred(), releaseWork = deferred();
    const work = withActiveWorkspaceMutation(workspaceId, async (session) => {
      admitted.resolve();
      await releaseWork.promise;
      await Post.create([{ workspaceId, createdByUserId: ownerId, caption: "Scheduled", platforms: ["linkedin"], mediaIds: [],
        status: "scheduled", scheduledAt: new Date(Date.now() + 86400000) }], { session });
    });
    await admitted.promise;
    const transition = changeWorkspaceLifecycle(user, String(workspaceId), action, "Race test");
    const outcome = Promise.allSettled([transition]);
    releaseWork.resolve();
    await work;
    expect((await outcome)[0]).toMatchObject({ status: "rejected", reason: { statusCode: 409 } });
    expect(await Workspace.findById(workspaceId)).toMatchObject({ archivedAt: null, deletedAt: null });
    expect(await Post.countDocuments({ status: "scheduled" })).toBe(1);
  });
});
