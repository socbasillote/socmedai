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

// Authorization is mocked so these tests focus on
// real MongoDB claim behavior, not workspace lookup.
const mocks = vi.hoisted(() => ({
  getUserWorkspaceById: vi.fn(),
  isValidWorkspaceId: vi.fn(),
}));

vi.mock("../workspaceService.js", () => ({
  getUserWorkspaceById: mocks.getUserWorkspaceById,

  isValidWorkspaceId: mocks.isValidWorkspaceId,
}));

import { claimImmediateFacebookPost } from "./facebookImmediatePublishingService.js";

const TEST_DATABASE_NAME = "storm_facebook_immediate_claim_integration_test";

const integrationEnabled = process.env.RUN_MONGODB_INTEGRATION_TESTS === "true";

const authUser = {
  id: "supabase-facebook-integration-user",
  email: "facebook-integration@example.com",
};

describe.skipIf(!integrationEnabled)(
  "Facebook immediate publishing MongoDB integration",
  () => {
    let workspaceId: mongoose.Types.ObjectId;
    let createdByUserId: mongoose.Types.ObjectId;
    let facebookConnectionId: mongoose.Types.ObjectId;
    let linkedinConnectionId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: TEST_DATABASE_NAME,
        serverSelectionTimeoutMS: 5000,
      });

      // Verify the dedicated test database before
      // executing any data-modifying operations.
      if (mongoose.connection.name !== TEST_DATABASE_NAME) {
        await mongoose.disconnect();

        throw new Error("Facebook claim integration test database mismatch.");
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
      facebookConnectionId = new mongoose.Types.ObjectId();
      linkedinConnectionId = new mongoose.Types.ObjectId();

      mocks.isValidWorkspaceId.mockImplementation((value: string) =>
        /^[a-f0-9]{24}$/i.test(value),
      );

      mocks.getUserWorkspaceById.mockResolvedValue({
        _id: workspaceId,
      });
    });

    afterEach(async () => {
      if (mongoose.connection.readyState === 1) {
        // Delete only posts created under this test's
        // unique workspace identifier.
        await Post.deleteMany({
          workspaceId,
        });
      }
    });

    async function createTestPost(overrides: Record<string, unknown> = {}) {
      return Post.create({
        workspaceId,
        createdByUserId,

        caption: "Storm Facebook MongoDB integration test",

        status: "draft",
        platforms: ["facebook"],

        platformConnections: {
          facebook: facebookConnectionId,
        },

        mediaIds: [],
        platformResults: [],
        attemptCount: 0,

        ...overrides,
      });
    }

    function claim(postId: string, selectedWorkspaceId = String(workspaceId)) {
      return claimImmediateFacebookPost({
        authUser,
        workspaceId: selectedWorkspaceId,
        postId,
      });
    }

    async function expectRejectedClaim(postId: string) {
      await expect(claim(postId)).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
        statusCode: 409,
        message: expect.stringContaining(
          "not eligible for immediate Facebook publishing",
        ),
      });
    }

    it("atomically claims an eligible Facebook-only text draft", async () => {
      const post = await createTestPost();

      const claimed = await claim(String(post._id));

      expect(String(claimed._id)).toBe(String(post._id));

      expect(claimed.status).toBe("publishing");

      expect(claimed.attemptCount).toBe(1);

      expect(claimed.claimedAt).toBeInstanceOf(Date);

      expect(String(claimed.platformConnections?.facebook)).toBe(
        String(facebookConnectionId),
      );

      const persisted = await Post.findById(post._id).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.status).toBe("publishing");

      expect(persisted!.attemptCount).toBe(1);

      expect(persisted!.claimedAt).toBeInstanceOf(Date);

      expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
        authUser,
        String(workspaceId),
      );
    });

    const ineligibleCases: Array<[string, Record<string, unknown>]> = [
      [
        "LinkedIn-only drafts",
        {
          platforms: ["linkedin"],
          platformConnections: {
            linkedin: new mongoose.Types.ObjectId(),
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
        "mixed Facebook and Instagram drafts",
        {
          platforms: ["facebook", "instagram"],
        },
      ],
      [
        "drafts without a Facebook Page",
        {
          platformConnections: {},
        },
      ],
      [
        "drafts containing media attachments",
        {
          mediaIds: [new mongoose.Types.ObjectId()],
        },
      ],
      [
        "scheduled Facebook posts",
        {
          status: "scheduled",
          scheduledAt: new Date("2099-01-01T00:00:00.000Z"),
        },
      ],
      [
        "drafts with a published Facebook result",
        {
          platformResults: [
            {
              platform: "facebook",
              status: "published",
              attemptCount: 1,
              externalPostId: "existing-facebook-post",
              publishedAt: new Date("2026-10-30T00:00:00.000Z"),
            },
          ],
        },
      ],
      [
        "drafts with a failed Facebook result",
        {
          platformResults: [
            {
              platform: "facebook",
              status: "failed",
              attemptCount: 1,
            },
          ],
        },
      ],
      [
        "drafts with an unknown Facebook result",
        {
          platformResults: [
            {
              platform: "facebook",
              status: "unknown",
              attemptCount: 1,
            },
          ],
        },
      ],
    ];

    it.each(ineligibleCases)(
      "rejects %s without modifying the post",
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

    it("rejects claims from a different workspace", async () => {
      const post = await createTestPost();

      const differentWorkspaceId = new mongoose.Types.ObjectId().toString();

      // Simulate an authorized workspace lookup that
      // returns the workspace actually requested.
      //
      // The requested workspace is different from
      // the workspace that owns the post.
      mocks.getUserWorkspaceById.mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(differentWorkspaceId),
      });

      await expect(
        claim(String(post._id), differentWorkspaceId),
      ).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
        statusCode: 409,
      });

      // Verify the workspace lookup received
      // the different workspace ID.
      expect(mocks.getUserWorkspaceById).toHaveBeenCalledWith(
        authUser,
        differentWorkspaceId,
      );

      // Most importantly, MongoDB must not modify
      // a post belonging to another workspace.
      const persisted = await Post.findById(post._id).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.status).toBe("draft");

      expect(persisted!.attemptCount).toBe(0);

      expect(persisted!.claimedAt).toBeFalsy();
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

      // Exactly one request can change the
      // post from draft to publishing.
      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejection = rejected[0];

      if (rejection?.status === "rejected") {
        expect(rejection.reason).toMatchObject({
          name: "FacebookImmediatePublishingError",
          statusCode: 409,
        });
      }

      const persisted = await Post.findById(post._id).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.status).toBe("publishing");

      // Concurrent requests must never
      // increment the counter twice.
      expect(persisted!.attemptCount).toBe(1);
    });

    it("accepts an initialized pending Facebook result", async () => {
      const post = await createTestPost({
        platformResults: [
          {
            platform: "facebook",
            status: "pending",
            attemptCount: 0,
          },
        ],
      });

      const claimed = await claim(String(post._id));

      expect(claimed.status).toBe("publishing");

      const persisted = await Post.findById(post._id).lean();

      expect(persisted).not.toBeNull();

      expect(persisted!.status).toBe("publishing");

      expect(persisted!.attemptCount).toBe(1);

      expect(persisted!.platformResults).toHaveLength(1);

      expect(persisted!.platformResults[0]?.status).toBe("pending");
    });

    it("rejects a draft with a previous publishing attempt", async () => {
      const post = await createTestPost();

      // Simulate an interrupted publishing attempt whose
      // overall status was incorrectly restored to draft.
      await Post.updateOne(
        { _id: post._id },
        {
          $set: {
            status: "draft",
            attemptCount: 1,
          },
          $unset: {
            claimedAt: "",
          },
        },
      );

      await expect(claim(String(post._id))).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
        statusCode: 409,
      });

      const persisted = await Post.findById(post._id).lean();

      expect(persisted?.status).toBe("draft");
      expect(persisted?.attemptCount).toBe(1);
      expect(persisted?.claimedAt).toBeFalsy();
    });

    it("rejects a draft with a previous claim timestamp", async () => {
      const post = await createTestPost();

      const previousClaim = new Date("2026-10-29T10:00:00.000Z");

      // Simulate corrupted state where the attempt
      // counter was reset but the claim timestamp remains.
      await Post.updateOne(
        { _id: post._id },
        {
          $set: {
            status: "draft",
            attemptCount: 0,
            claimedAt: previousClaim,
          },
        },
      );

      await expect(claim(String(post._id))).rejects.toMatchObject({
        name: "FacebookImmediatePublishingError",
        statusCode: 409,
      });

      const persisted = await Post.findById(post._id).lean();

      expect(persisted?.status).toBe("draft");
      expect(persisted?.attemptCount).toBe(0);
      expect(persisted?.claimedAt).toEqual(previousClaim);
    });
  },
);
