import mongoose from "mongoose";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { env } from "../../config/env.js";

import Post from "../../models/Post.js";

import type { AuthenticatedUser } from "../userProfileService.js";

const mocks = vi.hoisted(() => ({
  isValidWorkspaceId: vi.fn(),
  getUserWorkspaceById: vi.fn(),

  getFacebookPublishingCredentials: vi.fn(),
  publishFacebookTextPost: vi.fn(),
}));

// Only mock dependencies outside the publishing
// lifecycle under test.
//
// MongoDB, the post model, claim service,
// authorization service, orchestrator, platform
// results, and reconciliation remain real.
vi.mock("../workspaceService.js", () => ({
  isValidWorkspaceId: mocks.isValidWorkspaceId,

  getUserWorkspaceById: mocks.getUserWorkspaceById,
}));

vi.mock("../facebook/facebookPublishingTokenService.js", () => ({
  getFacebookPublishingCredentials: mocks.getFacebookPublishingCredentials,
}));

vi.mock("../facebook/facebookPostService.js", () => ({
  publishFacebookTextPost: mocks.publishFacebookTextPost,
}));

import { FacebookPublishingAdapter } from "./facebookPublishingAdapter.js";

import { publishImmediateFacebookPost } from "./facebookImmediatePublishingExecutionService.js";

const TEST_DATABASE_NAME =
  "storm_facebook_immediate_execution_integration_test";

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

describe.skipIf(!integrationEnabled)(
  "Facebook immediate publishing — MongoDB lifecycle",
  () => {
    const workspaceObjectId = new mongoose.Types.ObjectId();

    const connectionObjectId = new mongoose.Types.ObjectId();

    const workspaceId = workspaceObjectId.toString();

    const connectionId = connectionObjectId.toString();

    const authUser = {
      id: "storm-facebook-lifecycle-test",
      email: "facebook-lifecycle@example.com",
    } as AuthenticatedUser;

    let postId: string;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      // Never drop a database unless the
      // connection is pointed at this test's
      // dedicated database.
      if (mongoose.connection.name !== TEST_DATABASE_NAME) {
        throw new Error("Refusing to run against a non-test database.");
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
      vi.resetAllMocks();

      await Post.deleteMany({});

      // Mock workspace validation and ownership.
      mocks.isValidWorkspaceId.mockImplementation(
        (value: unknown) =>
          typeof value === "string" && mongoose.isValidObjectId(value),
      );

      mocks.getUserWorkspaceById.mockImplementation(
        async (user: AuthenticatedUser, requestedWorkspaceId: string) => {
          if (user.id !== authUser.id || requestedWorkspaceId !== workspaceId) {
            return null;
          }

          return {
            _id: workspaceObjectId,
          };
        },
      );

      // Mock backend Page credential retrieval.
      mocks.getFacebookPublishingCredentials.mockResolvedValue({
        connectionId,
        facebookPageId: "123456789",
        pageAccessToken: "mock-facebook-token",
      });

      // Simulate confirmed Facebook publication.
      mocks.publishFacebookTextPost.mockResolvedValue({
        outcome: "published",
        externalPostId: "123456789_987654321",
      });

      // This injected transport must never
      // make a real external HTTP request.
      fetchMock = vi.fn(async () => {
        throw new Error("Unexpected external HTTP request.");
      });

      // Create a real MongoDB draft.
      const post = await Post.create({
        workspaceId: workspaceObjectId,

        createdByUserId: new mongoose.Types.ObjectId(),

        caption: "Storm MongoDB Facebook lifecycle test",

        mediaIds: [],
        platforms: ["facebook"],

        platformConnections: {
          facebook: connectionObjectId,
        },

        status: "draft",
        attemptCount: 0,
        platformResults: [],
      });

      postId = String(post._id);
    });

    function execute() {
      const adapter = new FacebookPublishingAdapter(
        authUser,
        fetchMock as unknown as typeof fetch,
      );

      // Explicit test-only activation.
      // This does not modify the production
      // adapter factory's default behavior.
      return publishImmediateFacebookPost(
        {
          authUser,
          workspaceId,
          postId,
        },
        {
          enabled: true,
          adapter,
        },
      );
    }

    it("persists a successful Facebook publication and blocks duplicate execution", async () => {
      const result = await execute();

      expect(result.results).toMatchObject([
        {
          outcome: "published",
          postId,
          platform: "facebook",
          externalPostId: "123456789_987654321",
        },
      ]);

      const persisted = await Post.findById(postId).lean();

      expect(persisted).not.toBeNull();

      // The post-level claim was persisted.
      expect(persisted?.attemptCount).toBe(1);
      expect(persisted?.claimedAt).toBeInstanceOf(Date);

      // The platform result was persisted.
      expect(persisted?.platformResults).toHaveLength(1);

      expect(persisted?.platformResults[0]).toMatchObject({
        platform: "facebook",
        status: "published",
        attemptCount: 1,
        externalPostId: "123456789_987654321",
        publishedAt: expect.any(Date),
      });

      // Overall post status was reconciled.
      expect(persisted?.status).toBe("published");

      expect(persisted?.publishedAt).toBeInstanceOf(Date);

      expect(mocks.publishFacebookTextPost).toHaveBeenCalledWith(
        {
          pageId: "123456789",
          pageAccessToken: "mock-facebook-token",
          message: "Storm MongoDB Facebook lifecycle test",
        },
        fetchMock,
      );

      expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();

      // Attempting the same post again must
      // fail before reaching Facebook.
      await expect(execute()).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("persists a definite failure when Facebook credentials are unavailable", async () => {
      mocks.getFacebookPublishingCredentials.mockRejectedValue(
        new Error("Facebook Page connection revoked."),
      );

      const result = await execute();

      expect(result.results).toMatchObject([
        {
          outcome: "failed",
          postId,
          platform: "facebook",
          message:
            "Facebook Page publishing credentials are unavailable or unauthorized.",
        },
      ]);

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.attemptCount).toBe(1);

      expect(persisted?.platformResults[0]).toMatchObject({
        platform: "facebook",
        status: "failed",
        attemptCount: 1,
      });

      expect(persisted?.status).toBe("failed");

      expect(mocks.publishFacebookTextPost).not.toHaveBeenCalled();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("persists an unknown outcome without automatically retrying", async () => {
      // Simulate an exception after an external
      // publishing operation may have started.
      mocks.publishFacebookTextPost.mockRejectedValue(
        new Error("Facebook publishing outcome uncertain."),
      );

      const result = await execute();

      expect(result.results).toMatchObject([
        {
          outcome: "unknown",
          postId,
          platform: "facebook",
        },
      ]);

      const persisted = await Post.findById(postId).lean();

      expect(persisted?.attemptCount).toBe(1);

      expect(persisted?.platformResults[0]).toMatchObject({
        platform: "facebook",
        status: "unknown",
        attemptCount: 1,
      });

      // Unknown outcomes must not be
      // incorrectly marked as published.
      expect(persisted?.status).toBe("publishing");

      expect(persisted?.publishedAt).toBeUndefined();

      expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();

      // No automatic retry is allowed.
      await expect(execute()).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.publishFacebookTextPost).toHaveBeenCalledOnce();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  },
);
