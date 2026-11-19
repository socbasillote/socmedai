import { vi } from "vitest";
import { InstagramPublishingAdapter } from "./publishing/instagramPublishingAdapter.js";
import { dispatchScheduledPost } from "./publishing/scheduledPublishingDispatcher.js";
import { ScheduledLeaseSignal } from "./publishing/scheduledPublishingHeartbeat.js";
import InstagramConnection from "../models/InstagramConnection.js";
import FacebookConnection from "../models/FacebookConnection.js";
import MediaAsset from "../models/MediaAsset.js";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import Post from "../models/Post.js";
import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import LinkedInConnection from "../models/LinkedInConnection.js";
import Evidence from "../models/PublishingAttemptEvidence.js";
import { changeWorkspaceSchedule, createWorkspacePost, reconcileWorkspacePublication } from "./postService.js";
import { claimNextDuePost, releaseUnsubmittedScheduledClaim, recoverStalePublishingPosts } from "./scheduledPostWorker.js";
import { createPostSchema } from "../schemas/postSchema.js";
let mongo: MongoMemoryServer;
const owner = { id: "owner", email: null };
const workspace = new mongoose.Types.ObjectId(), profile = new mongoose.Types.ObjectId(), connection = new mongoose.Types.ObjectId();
beforeAll(async () => { mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } }); await mongoose.connect(mongo.getUri()); }, 70000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
 await Promise.all([Post.deleteMany({}), UserProfile.deleteMany({}), Workspace.deleteMany({}), LinkedInConnection.deleteMany({}), Evidence.deleteMany({}), InstagramConnection.deleteMany({}), FacebookConnection.deleteMany({}), MediaAsset.deleteMany({})]);
 await UserProfile.collection.insertOne({ _id: profile, supabaseUserId: owner.id });
 await Workspace.collection.insertOne({ _id: workspace, ownerUserId: profile });
 await LinkedInConnection.collection.insertOne({ _id: connection, workspaceId: workspace, status: "connected", scopes: ["w_member_social"], tokenExpiresAt: new Date(Date.now()+3600000) });
});
async function scheduled() { return Post.create({ workspaceId: workspace, createdByUserId: profile, caption: "Caption", platforms: ["linkedin"], platformConnections: { linkedin: connection }, scheduledAt: new Date(Date.now()-1000), status: "scheduled" }); }
it("rejects scheduled caption limits and credentials expiring before the deadline", async () => {
 const input = { workspaceId: String(workspace), caption: "x".repeat(6000), platforms: ["facebook"], platformConnections: { facebook: String(connection) }, scheduledAt: new Date(Date.now()+86400000).toISOString() };
 expect(createPostSchema.safeParse(input).success).toBe(false);
 const linked = createPostSchema.parse({ ...input, caption: "Caption", platforms: ["linkedin"], platformConnections: { linkedin: String(connection) } });
 await expect(createWorkspacePost(owner, linked)).rejects.toThrow("expire");
});
it("cancels and reschedules only unclaimed schedules and rejects another owner", async () => {
 const post = await scheduled();
 await expect(changeWorkspaceSchedule({ id: "other", email: null }, String(post._id))).rejects.toThrow();
 const deadline = new Date(Date.now()+60000);
 expect((await changeWorkspaceSchedule(owner, String(post._id), deadline)).scheduledAt).toEqual(deadline);
 expect((await changeWorkspaceSchedule(owner, String(post._id))).status).toBe("draft");
 const next = await scheduled(); await claimNextDuePost();
 await expect(changeWorkspaceSchedule(owner, String(next._id))).rejects.toMatchObject({ statusCode: 409 });
});
it("releases an owned unsubmitted claim and refuses the wrong owner", async () => {
 const post = await scheduled(); const claim = await claimNextDuePost();
 expect((await releaseUnsubmittedScheduledClaim(String(post._id), "wrong")).modifiedCount).toBe(0);
 expect((await releaseUnsubmittedScheduledClaim(String(post._id), claim.scheduledClaimId)).modifiedCount).toBe(1);
 expect((await Post.findById(post._id))?.attemptCount).toBe(0);
});
it("preserves uncertain outcomes and reconciles only confirmed evidence without publishing", async () => {
 const post = await scheduled(); const claim = await claimNextDuePost();
 await Post.updateOne({ _id: post._id }, { $set: { scheduledLeaseExpiresAt: new Date(0) } });
 await recoverStalePublishingPosts();
 expect((await Post.findById(post._id))?.status).toBe("unknown");
 await expect(reconcileWorkspacePublication(owner, String(post._id))).rejects.toThrow("No confirmed");
 await Evidence.create({ postId: post._id, claimId: claim.scheduledClaimId, platform: "linkedin", outcome: "published", externalPostId: "urn:li:share:123", publishedAt: new Date() });
 expect((await reconcileWorkspacePublication(owner, String(post._id))).status).toBe("published");
});

it("recovers a confirmed immediate result after overall status persistence fails", async () => {
 const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption: "Caption", platforms: ["linkedin"], status: "publishing", claimedAt: new Date(0), attemptCount: 1,
   platformResults: [{ platform: "linkedin", status: "published", externalPostId: "urn:li:share:456", publishedAt: new Date(), attemptCount: 1 }] });
 await recoverStalePublishingPosts();
 expect((await Post.findById(post._id))?.status).toBe("unknown");
 const recovered = await reconcileWorkspacePublication(owner, String(post._id));
 expect(recovered.status).toBe("published");
 expect(recovered.platformResults[0].externalPostId).toBe("urn:li:share:456");
});
it("does not infer immediate success from an uncertain platform result", async () => {
 const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption: "Caption", platforms: ["facebook"], status: "unknown",
   platformResults: [{ platform: "facebook", status: "unknown", attemptCount: 1 }] });
 await expect(reconcileWorkspacePublication(owner, String(post._id))).rejects.toThrow("No confirmed");
});
it("rejects oversized captions before claiming and leaves the draft editable", async () => {
 const { claimImmediatePost } = await import("./publishing/immediatePublishingService.js");
 for (const [platform, caption] of [["facebook", "x".repeat(5001)], ["linkedin", "x".repeat(3001)], ["linkedin", "\u{1f600}".repeat(1501)]] as const) {
   const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption, platforms: [platform], platformConnections: { [platform]: connection }, status: "draft" });
   await expect(claimImmediatePost({ authUser: owner, workspaceId: String(workspace), postId: String(post._id) })).rejects.toMatchObject({ statusCode: 409 });
   const unchanged = await Post.findById(post._id);
   expect(unchanged.status).toBe("draft");
   expect(unchanged.attemptCount).toBe(0);
 }
});
it("claims captions exactly at the platform limits", async () => {
 const { claimImmediatePost } = await import("./publishing/immediatePublishingService.js");
 for (const [platform, caption] of [["facebook", "x".repeat(5000)], ["linkedin", "\u{1f600}".repeat(1500)]] as const) {
   const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption, platforms: [platform], platformConnections: { [platform]: connection }, status: "draft" });
   expect((await claimImmediatePost({ authUser: owner, workspaceId: String(workspace), postId: String(post._id) })).status).toBe("publishing");
 }
});
it("includes platform results and top-level errors in post reads", async () => {
 const { getWorkspacePostById, listWorkspacePosts } = await import("./postService.js");
 const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption: "Caption", platforms: ["facebook"], status: "failed", lastError: "Preparation failed",
   platformResults: [{ platform: "facebook", status: "failed", lastError: "Credentials unavailable", attemptCount: 1 }] });
 const detail = await getWorkspacePostById(owner, String(post._id));
 expect(detail.platformResults[0].lastError).toBe("Credentials unavailable");
 const listed = await listWorkspacePosts(owner, String(workspace));
 expect(Array.isArray(listed) && listed[0].lastError).toBe("Preparation failed");
});

it("saves, reschedules, and atomically claims a scheduled Instagram image", async () => {
 const page = new mongoose.Types.ObjectId(), instagram = new mongoose.Types.ObjectId(), image = new mongoose.Types.ObjectId();
 await FacebookConnection.collection.insertOne({ _id: page, workspaceId: workspace, status: "connected", tasks: ["CREATE_CONTENT"] });
 await InstagramConnection.create({ _id: instagram, workspaceId: workspace, facebookConnectionId: page, instagramUserId: "123", username: "studio" });
 await MediaAsset.collection.insertOne({ _id: image, workspaceId: workspace, createdByUserId: profile, type: "image", source: "ai-generated", status: "ready", storageProvider: "supabase", storageKey: `workspaces/${workspace}/images/${image}.png`, mimeType: "image/png", width: 1080, height: 1080, fileSize: 100, idempotencyKey: "verified-image", generationExecution: {}, contentSha256: "a".repeat(64) });
 const input = createPostSchema.parse({ workspaceId: String(workspace), platforms: ["instagram"], platformConnections: { instagram: String(instagram) }, caption: "Instagram caption", mediaIds: [String(image)], scheduledAt: new Date(Date.now()+60000).toISOString() });
 const post = await createWorkspacePost(owner, input);
 expect(String(post.platformConnections.instagram)).toBe(String(instagram));
 expect(post.status).toBe("scheduled");
 const deadline = new Date(Date.now()+120000);
 expect((await changeWorkspaceSchedule(owner, String(post._id), deadline)).scheduledAt).toEqual(deadline);
 const outcomes = await Promise.all([claimNextDuePost(new Date(deadline.getTime()+1000)), claimNextDuePost(new Date(deadline.getTime()+1000))]);
 expect(outcomes.filter(Boolean)).toHaveLength(1);
 expect(outcomes.find(Boolean).mediaIds.map(String)).toEqual([String(image)]);
});
it("rejects Instagram scheduling without the image or with an unauthorized connection", async () => {
 const input = { workspaceId: String(workspace), platforms: ["instagram"], platformConnections: { instagram: String(connection) }, caption: "Caption", mediaIds: [], scheduledAt: new Date(Date.now()+60000).toISOString() };
 expect(createPostSchema.safeParse(input).success).toBe(false);
 await expect(createWorkspacePost(owner, { ...input, platforms: ["instagram"], mediaIds: [String(new mongoose.Types.ObjectId())] })).rejects.toMatchObject({ statusCode: 409 });
});

it("dispatches an owned scheduled Instagram image and records confirmed evidence", async () => {
 const instagram = new mongoose.Types.ObjectId(), image = new mongoose.Types.ObjectId();
 const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption: "Instagram caption", platforms: ["instagram"], platformConnections: { instagram }, mediaIds: [image], status: "scheduled", scheduledAt: new Date(Date.now()-1000) });
 const claim = await claimNextDuePost();
 const publish = vi.spyOn(InstagramPublishingAdapter.prototype, "publish").mockResolvedValue({ outcome: "published", platform: "instagram", postId: String(post._id), externalPostId: "789", publishedAt: new Date() });
 try {
   const lease = new ScheduledLeaseSignal(); lease.setExpiration(claim.scheduledLeaseExpiresAt);
   await dispatchScheduledPost(String(post._id), lease);
   expect(publish).toHaveBeenCalledOnce();
   expect(publish).toHaveBeenCalledWith(expect.objectContaining({ platform: "instagram", connectionId: String(instagram), mediaIds: [String(image)], lease }));
   expect((await Post.findById(post._id)).status).toBe("published");
   expect(await Evidence.exists({ postId: post._id, claimId: claim.scheduledClaimId, outcome: "published", externalPostId: "789" })).toBeTruthy();
 } finally { publish.mockRestore(); }
});
