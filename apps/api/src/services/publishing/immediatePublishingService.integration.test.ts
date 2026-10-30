import mongoose from "mongoose";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { env } from "../../config/env.js";
import Post from "../../models/Post.js";

// Authorization has its own tests.
// Here we isolate the actual MongoDB claim behavior.
const mocks = vi.hoisted(() => ({
  authorizePublishing: vi.fn(),
}));

vi.mock("./publishingAuthorizationService.js", () => ({
  authorizePublishing: mocks.authorizePublishing,

  PublishingAuthorizationError: class PublishingAuthorizationError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
      this.name = "PublishingAuthorizationError";
    }
  },
}));

import { claimImmediatePost } from "./immediatePublishingService.js";

const TEST_DATABASE_NAME = "storm_immediate_publishing_claim_integration_test";

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

const authUser = {
  id: "supabase-integration-user",
  email: "integration@example.com",
};

describe.skipIf(!integrationEnabled)(
  "immediatePublishingService MongoDB integration",
  () => {
    let workspaceId: mongoose.Types.ObjectId;
    let createdByUserId: mongoose.Types.ObjectId;
    let linkedinConnectionId: mongoose.Types.ObjectId;
    let facebookConnectionId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      // Never run destructive test operations against
      // an unexpected database.
      if (mongoose.connection.name !== TEST_DATABASE_NAME) {
        await mongoose.disconnect();

        throw new Error(
          "Immediate publishing integration test database mismatch.",
        );
      }
    });

    afterAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    });

    beforeEach(() => {
      vi.clearAllMocks();

      workspaceId = new mongoose.Types.ObjectId();
      createdByUserId = new mongoose.Types.ObjectId();
      linkedinConnectionId = new mongoose.Types.ObjectId();
      facebookConnectionId = new mongoose.Types.ObjectId();

      mocks.authorizePublishing.mockResolvedValue(undefined);
    });

    afterEach(async () => {
      if (mongoose.connection.readyState === 1) {
        // Remove only records belonging to this test's
        // newly generated workspace.
        await Post.deleteMany({ workspaceId });
      }
    });

    async function createTestPost(overrides: Record<string, unknown> = {}) {
      return Post.create({
        workspaceId,
        createdByUserId,
        caption: "Storm MongoDB claim integration test",
        status: "draft",
        platforms: ["linkedin"],
        platformConnections: {
          linkedin: linkedinConnectionId,
        },
        mediaIds: [],
        platformResults: [],
        attemptCount: 0,
        ...overrides,
      });
    }

    function claim(postId: string, selectedWorkspaceId = String(workspaceId)) {
      return claimImmediatePost({
        authUser,
        workspaceId: selectedWorkspaceId,
        postId,
      });
    }

    async function expectRejectedClaim(postId: string) {
      await expect(claim(postId)).rejects.toMatchObject({
        name: "ImmediatePublishingError",
        statusCode: 409,
        message: expect.stringContaining(
          "not eligible for immediate LinkedIn publishing",
        ),
      });
    }

    it("atomically claims an eligible LinkedIn-only text draft", async () => {
      const post = await createTestPost();

      const claimed = await claim(String(post._id));

      expect(claimed._id.toString()).toBe(String(post._id));

      expect(claimed.status).toBe("publishing");
      expect(claimed.attemptCount).toBe(1);
      expect(claimed.claimedAt).toBeInstanceOf(Date);

      const persisted = await Post.findById(post._id).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.status).toBe("publishing");
      expect(persisted!.attemptCount).toBe(1);
      expect(persisted!.claimedAt).toBeInstanceOf(Date);

      expect(mocks.authorizePublishing).toHaveBeenCalledWith({
        authUser,
        workspaceId: String(workspaceId),
        postId: String(post._id),
      });
    });

    const ineligibleCases: Array<[string, Record<string, unknown>]> = [
      [
        "Facebook-only drafts",
        {
          platforms: ["facebook"],
          platformConnections: {
            facebook: new mongoose.Types.ObjectId(),
          },
        },
      ],
      [
        "Instagram-only drafts",
        {
          platforms: ["instagram"],
          platformConnections: {},
        },
      ],
      [
        "mixed Facebook and LinkedIn drafts",
        {
          platforms: ["facebook", "linkedin"],
        },
      ],
      [
        "mixed LinkedIn and Instagram drafts",
        {
          platforms: ["linkedin", "instagram"],
        },
      ],
      [
        "drafts without a LinkedIn connection",
        {
          platformConnections: {},
        },
      ],
      [
        "drafts containing media",
        {
          mediaIds: [new mongoose.Types.ObjectId()],
        },
      ],
      [
        "scheduled posts",
        {
          status: "scheduled",
          scheduledAt: new Date("2099-01-01T00:00:00.000Z"),
        },
      ],
      [
        "drafts with a published LinkedIn result",
        {
          platformResults: [
            {
              platform: "linkedin",
              status: "published",
              attemptCount: 1,
              externalPostId: "existing-linkedin-post",
              publishedAt: new Date(),
            },
          ],
        },
      ],
      [
        "drafts with an unknown LinkedIn result",
        {
          platformResults: [
            {
              platform: "linkedin",
              status: "unknown",
              attemptCount: 1,
            },
          ],
        },
      ],
      [
        "drafts with a failed LinkedIn result",
        {
          platformResults: [
            {
              platform: "linkedin",
              status: "failed",
              attemptCount: 1,
            },
          ],
        },
      ],
    ];

    it.each(ineligibleCases)(
      "rejects %s without mutating the post",
      async (_description, overrides) => {
        const post = await createTestPost(overrides);

        await expectRejectedClaim(String(post._id));

        const persisted = await Post.findById(post._id).lean();

        expect(persisted).not.toBeNull();

        expect(persisted!.status).toBe(post.status);

        expect(persisted!.attemptCount).toBe(0);

        expect(persisted!.claimedAt).toBeFalsy();
      },
    );

    it("rejects a claim from a different workspace", async () => {
      const post = await createTestPost();

      const differentWorkspaceId = new mongoose.Types.ObjectId().toString();

      await expect(
        claim(String(post._id), differentWorkspaceId),
      ).rejects.toMatchObject({
        name: "ImmediatePublishingError",
        statusCode: 409,
      });

      const persisted = await Post.findById(post._id).lean();

      expect(persisted!.status).toBe("draft");
      expect(persisted!.attemptCount).toBe(0);
    });

    it("rejects a second sequential claim", async () => {
      const post = await createTestPost();
      const id = String(post._id);

      const firstClaim = await claim(id);

      expect(firstClaim.status).toBe("publishing");

      await expectRejectedClaim(id);

      const persisted = await Post.findById(post._id).lean();

      expect(persisted!.status).toBe("publishing");

      expect(persisted!.attemptCount).toBe(1);
    });

    it("allows only one of two concurrent claims", async () => {
      const post = await createTestPost();
      const id = String(post._id);

      const attempts = await Promise.allSettled([claim(id), claim(id)]);

      const successful = attempts.filter(
        (attempt) => attempt.status === "fulfilled",
      );

      const rejected = attempts.filter(
        (attempt) => attempt.status === "rejected",
      );

      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejection = rejected[0];

      if (rejection?.status === "rejected") {
        expect(rejection.reason).toMatchObject({
          name: "ImmediatePublishingError",
          statusCode: 409,
        });
      }

      const persisted = await Post.findById(post._id).lean();

      expect(persisted!.status).toBe("publishing");

      // A concurrency race must not increase
      // the attempt count twice.
      expect(persisted!.attemptCount).toBe(1);
    });

    it("allows an initialized pending LinkedIn result", async () => {
      const post = await createTestPost({
        platformResults: [
          {
            platform: "linkedin",
            status: "pending",
            attemptCount: 0,
          },
        ],
      });

      const claimed = await claim(String(post._id));

      expect(claimed.status).toBe("publishing");

      const persisted = await Post.findById(post._id).lean();

      expect(persisted!.status).toBe("publishing");

      expect(persisted!.attemptCount).toBe(1);
    });
  },
);
