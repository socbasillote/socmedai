import mongoose from "mongoose";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../config/env.js";

import UserProfile from "../models/UserProfile.js";
import Workspace from "../models/Workspace.js";
import Post from "../models/Post.js";
import LinkedInConnection from "../models/LinkedInConnection.js";

import { updateWorkspaceDraft } from "./postService.js";

import type { AuthenticatedUser } from "./userProfileService.js";

const TEST_DATABASE_NAME = "storm_post_service_integration_test";

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

describe.skipIf(!integrationEnabled)(
  "postService service-level MongoDB integration",
  () => {
    const authenticatedUser: AuthenticatedUser = {
      id: "integration-supabase-user",
      email: "integration@example.com",
    };

    let profileId: mongoose.Types.ObjectId;
    let workspaceId: mongoose.Types.ObjectId;
    let postId: mongoose.Types.ObjectId;
    let linkedinConnectionId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      if (mongoose.connection.name !== TEST_DATABASE_NAME) {
        throw new Error(
          "Integration tests must use the dedicated test database.",
        );
      }

      await mongoose.connection.dropDatabase();
    });

    afterAll(async () => {
      if (mongoose.connection.readyState === 1) {
        if (mongoose.connection.name === TEST_DATABASE_NAME) {
          await mongoose.connection.dropDatabase();
        }

        await mongoose.disconnect();
      }
    });

    beforeEach(async () => {
      await Promise.all([
        Post.deleteMany({}),
        LinkedInConnection.deleteMany({}),
        Workspace.deleteMany({}),
        UserProfile.deleteMany({}),
      ]);

      const profile = await UserProfile.create({
        supabaseUserId: authenticatedUser.id,
        email: authenticatedUser.email,
      });

      profileId = profile._id;

      const workspace = await Workspace.create({
        name: "Integration Test Workspace",
        ownerUserId: profileId,
      });

      workspaceId = workspace._id;

      const linkedinConnection = await LinkedInConnection.create({
        workspaceId,
        connectedByUserId: authenticatedUser.id,
        linkedinMemberId: "integration-linkedin-member",
        displayName: "Integration LinkedIn Account",
        accessTokenEncrypted: "dummy-encrypted-token",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        scopes: ["w_member_social"],
        status: "connected",
      });

      linkedinConnectionId = linkedinConnection._id;

      const post = await Post.create({
        workspaceId,
        createdByUserId: profileId,
        title: "Original title",
        caption: "Original caption",
        platforms: ["linkedin"],
        platformConnections: {
          linkedin: linkedinConnectionId,
        },
        status: "draft",
      });

      postId = post._id;
    });

    it("updates an authorized draft and increments its version", async () => {
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      const originalVersion = original!.__v;

      const updated = await updateWorkspaceDraft(
        authenticatedUser,
        postId.toString(),
        {
          caption: "Updated LinkedIn caption",
        },
      );

      expect(updated).not.toBeNull();

      expect(updated.caption).toBe("Updated LinkedIn caption");

      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.caption).toBe("Updated LinkedIn caption");

      expect(persisted!.__v).toBe(originalVersion + 1);

      expect(persisted!.status).toBe("draft");

      expect(persisted!.platforms).toEqual(["linkedin"]);

      expect(persisted!.platformConnections?.linkedin?.toString()).toBe(
        linkedinConnectionId.toString(),
      );
    });

    it("allows only one overlapping service update using the same draft version", async () => {
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      const originalVersion = original!.__v;

      const firstUpdate = updateWorkspaceDraft(
        authenticatedUser,
        postId.toString(),
        {
          caption: "Concurrent caption A",
        },
      );

      const secondUpdate = updateWorkspaceDraft(
        authenticatedUser,
        postId.toString(),
        {
          caption: "Concurrent caption B",
        },
      );

      const results = await Promise.allSettled([firstUpdate, secondUpdate]);

      const successes = results.filter(
        (result) => result.status === "fulfilled",
      );

      const failures = results.filter((result) => result.status === "rejected");

      expect(successes.length).toBeGreaterThanOrEqual(1);

      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      expect(["Concurrent caption A", "Concurrent caption B"]).toContain(
        persisted!.caption,
      );

      expect(persisted!.__v).toBe(originalVersion + successes.length);

      for (const failure of failures) {
        if (failure.status === "rejected") {
          expect(failure.reason).toMatchObject({
            statusCode: 409,
          });
        }
      }
    });

    it("rejects a draft update when the user does not own the workspace", async () => {
      const unauthorizedUser: AuthenticatedUser = {
        id: "unauthorized-supabase-user",
        email: "unauthorized@example.com",
      };

      // Create a real profile for the unauthorized user.
      const unauthorizedProfile = await UserProfile.create({
        supabaseUserId: unauthorizedUser.id,
        email: unauthorizedUser.email,
      });

      // Give that user a separate workspace.
      await Workspace.create({
        name: "Unauthorized User Workspace",
        ownerUserId: unauthorizedProfile._id,
      });

      // Capture the original post before attempting the update.
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      // Attempt to modify a post belonging to another workspace.
      await expect(
        updateWorkspaceDraft(unauthorizedUser, postId.toString(), {
          caption: "Unauthorized caption change",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      // Verify that the original post was not modified.
      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.caption).toBe(original!.caption);

      expect(persisted!.__v).toBe(original!.__v);

      expect(persisted!.workspaceId.toString()).toBe(workspaceId.toString());
    });

    it("rejects selecting a LinkedIn connection from another workspace", async () => {
      // Create a second user.
      const otherUser: AuthenticatedUser = {
        id: "other-workspace-supabase-user",
        email: "other-workspace@example.com",
      };

      const otherProfile = await UserProfile.create({
        supabaseUserId: otherUser.id,
        email: otherUser.email,
      });

      // Create a workspace owned by the second user.
      const otherWorkspace = await Workspace.create({
        name: "Other Client Workspace",
        ownerUserId: otherProfile._id,
      });

      // Create a LinkedIn connection belonging to that workspace.
      const otherConnection = await LinkedInConnection.create({
        workspaceId: otherWorkspace._id,
        connectedByUserId: otherUser.id,
        linkedinMemberId: "other-workspace-linkedin-member",
        displayName: "Other Client LinkedIn Account",
        accessTokenEncrypted: "dummy-other-encrypted-token",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        scopes: ["w_member_social"],
        status: "connected",
      });

      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      // The authorized user attempts to select an account
      // belonging to another workspace.
      await expect(
        updateWorkspaceDraft(authenticatedUser, postId.toString(), {
          platformConnections: {
            linkedin: otherConnection._id.toString(),
          },
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      // Verify that the post was not modified.
      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.platformConnections?.linkedin?.toString()).toBe(
        linkedinConnectionId.toString(),
      );

      expect(persisted!.caption).toBe(original!.caption);

      expect(persisted!.__v).toBe(original!.__v);

      expect(persisted!.platforms).toEqual(["linkedin"]);
    });

    it("removes the LinkedIn account selection when LinkedIn is removed", async () => {
      // Arrange: Start with a draft targeting LinkedIn.
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();

      expect(original!.platforms).toContain("linkedin");

      expect(original!.platformConnections?.linkedin?.toString()).toBe(
        linkedinConnectionId.toString(),
      );

      const originalVersion = original!.__v;

      // Act: Remove LinkedIn and switch to Facebook.
      const updated = await updateWorkspaceDraft(
        authenticatedUser,
        postId.toString(),
        {
          platforms: ["facebook"],
        },
      );

      // Assert: The service returns the updated platforms.
      expect(updated.platforms).toEqual(["facebook"]);

      expect(updated.platformConnections?.linkedin).toBeUndefined();

      // Assert: Verify the actual MongoDB document.
      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.platforms).toEqual(["facebook"]);

      expect(persisted!.platformConnections?.linkedin).toBeUndefined();

      // The update must increment the document version.
      expect(persisted!.__v).toBe(originalVersion + 1);

      // The post must remain an editable draft.
      expect(persisted!.status).toBe("draft");

      // Existing content must remain unchanged.
      expect(persisted!.caption).toBe(original!.caption);

      expect(persisted!.title).toBe(original!.title);
    });

    it("rejects editing a post after it becomes scheduled", async () => {
      // Arrange: Retrieve the existing draft.
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();
      expect(original!.status).toBe("draft");

      const originalVersion = original!.__v;

      // Simulate the post being scheduled by another operation.
      const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);

      const schedulingResult = await Post.updateOne(
        {
          _id: postId,
          status: "draft",
        },
        {
          $set: {
            status: "scheduled",
            scheduledAt,
          },
        },
      );

      expect(schedulingResult.modifiedCount).toBe(1);

      // Act: Attempt to edit the post using the draft service.
      await expect(
        updateWorkspaceDraft(authenticatedUser, postId.toString(), {
          caption: "This edit must not be saved",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      // Assert: Verify the persisted post was not modified.
      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.status).toBe("scheduled");

      expect(persisted!.caption).toBe(original!.caption);

      expect(persisted!.scheduledAt?.getTime()).toBe(scheduledAt.getTime());

      expect(persisted!.__v).toBe(originalVersion);

      expect(persisted!.platformConnections?.linkedin?.toString()).toBe(
        linkedinConnectionId.toString(),
      );
    });
    it("rejects editing a draft after it has been deleted", async () => {
      // Arrange: Confirm the draft exists.
      const original = await Post.findById(postId).lean();

      expect(original).not.toBeNull();
      expect(original!.status).toBe("draft");

      // Simulate another operation deleting the draft.
      const deletionResult = await Post.deleteOne({
        _id: postId,
        workspaceId,
        createdByUserId: profileId,
        status: "draft",
      });

      expect(deletionResult.deletedCount).toBe(1);

      // Act: Attempt to save changes to the deleted draft.
      await expect(
        updateWorkspaceDraft(authenticatedUser, postId.toString(), {
          caption: "This deleted draft must not be restored",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      // Assert: The deleted post must remain deleted.
      const persisted = await Post.findById(postId).lean();

      expect(persisted).toBeNull();

      // Verify that the service did not recreate the document.
      const matchingPosts = await Post.countDocuments({
        _id: postId,
      });

      expect(matchingPosts).toBe(0);
    });
  },
);
