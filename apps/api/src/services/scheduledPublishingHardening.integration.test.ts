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
 await Promise.all([Post.deleteMany({}), UserProfile.deleteMany({}), Workspace.deleteMany({}), LinkedInConnection.deleteMany({}), Evidence.deleteMany({})]);
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
 for (const [platform, caption] of [["facebook", "x".repeat(5001)], ["linkedin", "x".repeat(3001)], ["linkedin", "??".repeat(1501)]] as const) {
   const post = await Post.create({ workspaceId: workspace, createdByUserId: profile, caption, platforms: [platform], platformConnections: { [platform]: connection }, status: "draft" });
   await expect(claimImmediatePost({ authUser: owner, workspaceId: String(workspace), postId: String(post._id) })).rejects.toMatchObject({ statusCode: 409 });
   const unchanged = await Post.findById(post._id);
   expect(unchanged.status).toBe("draft");
   expect(unchanged.attemptCount).toBe(0);
 }
});
it("claims captions exactly at the platform limits", async () => {
 const { claimImmediatePost } = await import("./publishing/immediatePublishingService.js");
 for (const [platform, caption] of [["facebook", "x".repeat(5000)], ["linkedin", "??".repeat(1500)]] as const) {
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
