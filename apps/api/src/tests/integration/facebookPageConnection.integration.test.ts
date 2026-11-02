import { createHash, randomBytes } from "node:crypto";

import mongoose, { type Connection } from "mongoose";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import UserProfile from "../../models/UserProfile.js";
import Workspace from "../../models/Workspace.js";
import FacebookOAuthSession from "../../models/FacebookOAuthSession.js";
import FacebookConnection from "../../models/FacebookConnection.js";

import { connectFacebookPages } from "../../services/facebook/facebookPageConnectionService.js";

import {
  encryptFacebookToken,
  decryptFacebookToken,
} from "../../services/facebook/facebookTokenEncryptionService.js";

import {
  connectIntegrationMongo,
  disconnectIntegrationMongo,
} from "./integrationMongoConnection.js";

describe("Facebook Page connection — MongoDB integration", () => {
  let connection: Connection;

  // Unique identifier for this test run.
  const testRunId = randomBytes(12).toString("hex");

  const authUser = {
    id: `integration-facebook-user-${testRunId}`,
    email: `facebook-${testRunId}@example.test`,
  };

  const facebookPageId = "123456789012345";

  // Temporary OAuth session token.
  const sessionToken = randomBytes(32).toString("base64url");

  // Test-only credential. Never a real Facebook token.
  const pageAccessToken = `integration-page-token-${testRunId}`;

  let profileId: mongoose.Types.ObjectId | undefined;
  let workspaceId: mongoose.Types.ObjectId | undefined;

  beforeAll(async () => {
    connection = await connectIntegrationMongo();
  });

  afterAll(async () => {
    if (!connection) {
      return;
    }

    try {
      // Cleanup must remain restricted to the test database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing integration test cleanup outside the test database.",
        );
      }

      const UserProfileModel = connection.model(
        UserProfile.modelName,
        UserProfile.schema,
      );

      const WorkspaceModel = connection.model(
        Workspace.modelName,
        Workspace.schema,
      );

      const OAuthSessionModel = connection.model(
        FacebookOAuthSession.modelName,
        FacebookOAuthSession.schema,
      );

      const FacebookConnectionModel = connection.model(
        FacebookConnection.modelName,
        FacebookConnection.schema,
      );

      if (workspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: workspaceId,
        });
      }

      if (profileId) {
        await UserProfileModel.deleteOne({
          _id: profileId,
          supabaseUserId: authUser.id,
        });
      }
    } finally {
      await disconnectIntegrationMongo(connection);
    }
  });

  it("atomically consumes an OAuth session and persists a selected Facebook Page", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    // --------------------------------------------------
    // 1. Create the authenticated user's profile.
    // --------------------------------------------------

    const profile = await UserProfileModel.create({
      supabaseUserId: authUser.id,
      email: authUser.email,
    });

    if (!(profile._id instanceof mongoose.Types.ObjectId)) {
      throw new Error("Integration test profile has an invalid ObjectId.");
    }

    profileId = profile._id;

    // --------------------------------------------------
    // 2. Create a workspace owned by that profile.
    // --------------------------------------------------

    const workspace = await WorkspaceModel.create({
      name: "Facebook Integration Workspace",
      ownerUserId: profile._id,
      settings: {},
    });

    if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
      throw new Error("Integration test workspace has an invalid ObjectId.");
    }

    workspaceId = workspace._id;

    // --------------------------------------------------
    // 3. Create a temporary Facebook OAuth session.
    // --------------------------------------------------

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    await OAuthSessionModel.create({
      sessionHash,
      supabaseUserId: authUser.id,
      workspaceId: workspace._id,
      facebookUserId: "987654321",
      pages: [
        {
          facebookPageId,
          pageName: "Integration Test Page",
          pageAccessTokenEncrypted: encryptFacebookToken(pageAccessToken),
          tasks: ["CREATE_CONTENT"],
        },
      ],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // --------------------------------------------------
    // 4. Execute the real transaction orchestrator.
    // --------------------------------------------------

    const result = await connectFacebookPages(
      {
        sessionToken,
        authUser,
        workspaceId: String(workspace._id),
        selectedPageIds: [facebookPageId],
      },
      {
        connection,
      },
    );

    // --------------------------------------------------
    // 5. Verify the public result.
    // --------------------------------------------------

    expect(result.connections).toEqual([
      {
        facebookPageId,
        pageName: "Integration Test Page",
        status: "connected",
      },
    ]);

    // --------------------------------------------------
    // 6. Verify OAuth session consumption.
    // --------------------------------------------------

    const remainingSession = await OAuthSessionModel.findOne({
      sessionHash,
    });

    expect(remainingSession).toBeNull();

    // --------------------------------------------------
    // 7. Verify persisted Facebook Page connection.
    // --------------------------------------------------

    const savedConnection = await FacebookConnectionModel.findOne({
      workspaceId: workspace._id,
      facebookPageId,
    }).select("+pageAccessTokenEncrypted");

    expect(savedConnection).not.toBeNull();

    expect(savedConnection?.status).toBe("connected");

    expect(savedConnection?.pageName).toBe("Integration Test Page");

    expect(savedConnection?.connectedByUserId).toBe(authUser.id);

    expect(savedConnection?.facebookUserId).toBe("987654321");

    // --------------------------------------------------
    // 8. Verify credential encryption.
    // --------------------------------------------------

    expect(savedConnection?.pageAccessTokenEncrypted).toBeDefined();

    expect(savedConnection?.pageAccessTokenEncrypted).not.toBe(pageAccessToken);

    const encryptedToken = savedConnection?.pageAccessTokenEncrypted;

    if (typeof encryptedToken !== "string") {
      throw new Error(
        "Integration test Facebook Page token was not retrieved.",
      );
    }

    expect(decryptFacebookToken(encryptedToken)).toBe(pageAccessToken);

    // --------------------------------------------------
    // 9. Verify credentials are not exposed.
    // --------------------------------------------------

    const serializedResult = JSON.stringify(result);

    expect(serializedResult).not.toContain(pageAccessToken);

    expect(serializedResult).not.toContain("pageAccessTokenEncrypted");

    expect(serializedResult).not.toContain("sessionToken");
  });

  it("rolls back the OAuth session claim and all Page writes when persistence fails", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    // Create unique data for this rollback scenario.
    const rollbackId = randomBytes(12).toString("hex");

    const rollbackAuthUser = {
      id: `integration-rollback-${rollbackId}`,
      email: `rollback-${rollbackId}@example.test`,
    };

    const rollbackSessionToken = randomBytes(32).toString("base64url");

    const rollbackSessionHash = createHash("sha256")
      .update(rollbackSessionToken)
      .digest("hex");

    const firstPageId = "111111111111111";
    const secondPageId = "222222222222222";

    // Create a separate user and workspace for this scenario.
    const rollbackProfile = await UserProfileModel.create({
      supabaseUserId: rollbackAuthUser.id,
      email: rollbackAuthUser.email,
    });

    if (!(rollbackProfile._id instanceof mongoose.Types.ObjectId)) {
      throw new Error("Invalid rollback test profile ID.");
    }

    const rollbackWorkspace = await WorkspaceModel.create({
      name: "Facebook Rollback Integration Workspace",
      ownerUserId: rollbackProfile._id,
      settings: {},
    });

    if (!(rollbackWorkspace._id instanceof mongoose.Types.ObjectId)) {
      throw new Error("Invalid rollback test workspace ID.");
    }

    const rollbackWorkspaceId = rollbackWorkspace._id;

    // Create a session containing two publishable Pages.
    await OAuthSessionModel.create({
      sessionHash: rollbackSessionHash,
      supabaseUserId: rollbackAuthUser.id,
      workspaceId: rollbackWorkspaceId,
      facebookUserId: "987654321",
      pages: [
        {
          facebookPageId: firstPageId,
          pageName: "Rollback Page A",
          pageAccessTokenEncrypted: encryptFacebookToken(
            `rollback-token-a-${rollbackId}`,
          ),
          tasks: ["CREATE_CONTENT"],
        },
        {
          facebookPageId: secondPageId,
          pageName: "Rollback Page B",
          pageAccessTokenEncrypted: encryptFacebookToken(
            `rollback-token-b-${rollbackId}`,
          ),
          tasks: ["CREATE_CONTENT"],
        },
      ],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Force the second Page write to fail by creating a
    // unique index collision on the second Page's name.
    //
    // IMPORTANT:
    // We do NOT modify production indexes or schemas.
    // Instead, we deliberately reject the transaction
    // after its first write, inside a transaction callback.

    await expect(
      connection.transaction(async (mongoSession) => {
        // Delete the session inside this transaction.
        const claimedSession = await OAuthSessionModel.findOneAndDelete({
          sessionHash: rollbackSessionHash,
        }).session(mongoSession);

        expect(claimedSession).not.toBeNull();

        // Write Page A inside the transaction.
        await FacebookConnectionModel.create(
          [
            {
              workspaceId: rollbackWorkspaceId,
              connectedByUserId: rollbackAuthUser.id,
              facebookUserId: "987654321",
              facebookPageId: firstPageId,
              pageName: "Rollback Page A",
              pageAccessTokenEncrypted: encryptFacebookToken(
                `rollback-token-a-${rollbackId}`,
              ),
              status: "connected",
            },
          ],
          {
            session: mongoSession,
          },
        );

        // Simulate a failure after Page A was written.
        throw new Error("SIMULATED_SECOND_PAGE_FAILURE");
      }),
    ).rejects.toThrow("SIMULATED_SECOND_PAGE_FAILURE");

    // Verify that Page A did not survive the rollback.
    const savedPages = await FacebookConnectionModel.find({
      workspaceId: rollbackWorkspaceId,
      facebookPageId: {
        $in: [firstPageId, secondPageId],
      },
    }).lean();

    expect(savedPages).toHaveLength(0);

    // Verify that the OAuth session was restored.
    const restoredSession = await OAuthSessionModel.findOne({
      sessionHash: rollbackSessionHash,
    });

    expect(restoredSession).not.toBeNull();

    // Cleanup only this test's records.
    await FacebookConnectionModel.deleteMany({
      workspaceId: rollbackWorkspaceId,
    });

    await OAuthSessionModel.deleteMany({
      workspaceId: rollbackWorkspaceId,
    });

    await WorkspaceModel.deleteOne({
      _id: rollbackWorkspaceId,
    });

    await UserProfileModel.deleteOne({
      _id: rollbackProfile._id,
      supabaseUserId: rollbackAuthUser.id,
    });
  });

  it("rolls back the real orchestrator when the second Page persistence fails", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const testAuthUser = {
      id: `integration-orchestrator-rollback-${testId}`,
      email: `orchestrator-rollback-${testId}@example.test`,
    };

    const testSessionToken = randomBytes(32).toString("base64url");

    const testSessionHash = createHash("sha256")
      .update(testSessionToken)
      .digest("hex");

    const firstPageId = "333333333333333";
    const secondPageId = "444444444444444";

    let testProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    let validatorInstalled = false;

    try {
      // 1. Create the test profile.
      const profile = await UserProfileModel.create({
        supabaseUserId: testAuthUser.id,
        email: testAuthUser.email,
      });

      if (!(profile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid test profile ID.");
      }

      testProfileId = profile._id;

      // 2. Create an owned workspace.
      const workspace = await WorkspaceModel.create({
        name: "Orchestrator Rollback Workspace",
        ownerUserId: profile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid test workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 3. Create a temporary session containing two Pages.
      await OAuthSessionModel.create({
        sessionHash: testSessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "987654321",
        pages: [
          {
            facebookPageId: firstPageId,
            pageName: "Orchestrator Rollback Page A",
            pageAccessTokenEncrypted: encryptFacebookToken(
              `orchestrator-token-a-${testId}`,
            ),
            tasks: ["CREATE_CONTENT"],
          },
          {
            facebookPageId: secondPageId,
            pageName: "Orchestrator Rollback Page B",
            pageAccessTokenEncrypted: encryptFacebookToken(
              `orchestrator-token-b-${testId}`,
            ),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 4. Install a test-only validator that rejects Page B.
      //
      // IMPORTANT:
      // This changes a collection-level validator.
      // Only do this against the isolated integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing to modify a collection outside the test database.",
        );
      }

      const collectionName = FacebookConnectionModel.collection.collectionName;

      await connection.db.command({
        collMod: collectionName,
        validator: {
          facebookPageId: {
            $ne: secondPageId,
          },
        },
        validationLevel: "strict",
        validationAction: "error",
      });

      validatorInstalled = true;

      // 5. Execute the real orchestrator.
      await expect(
        connectFacebookPages(
          {
            sessionToken: testSessionToken,
            authUser: testAuthUser,
            workspaceId: String(workspace._id),
            selectedPageIds: [firstPageId, secondPageId],
          },
          {
            connection,
          },
        ),
      ).rejects.toThrow();

      // 6. Verify that neither Page was persisted.
      const savedPages = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId: {
          $in: [firstPageId, secondPageId],
        },
      }).lean();

      expect(savedPages).toHaveLength(0);

      // 7. Verify that the OAuth session was restored.
      const restoredSession = await OAuthSessionModel.findOne({
        sessionHash: testSessionHash,
      });

      expect(restoredSession).not.toBeNull();
    } finally {
      // 8. Restore the collection validator.
      if (validatorInstalled) {
        await connection.db?.command({
          collMod: FacebookConnectionModel.collection.collectionName,
          validator: {},
          validationLevel: "strict",
          validationAction: "error",
        });
      }

      // 9. Clean up only records created by this test.
      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (testProfileId) {
        await UserProfileModel.deleteOne({
          _id: testProfileId,
          supabaseUserId: testAuthUser.id,
        });
      }
    }
  });

  it("rejects reuse of a successfully consumed Facebook OAuth session", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const testAuthUser = {
      id: `integration-replay-${testId}`,
      email: `replay-${testId}@example.test`,
    };

    const testSessionToken = randomBytes(32).toString("base64url");

    const testSessionHash = createHash("sha256")
      .update(testSessionToken)
      .digest("hex");

    const facebookPageId = "555555555555555";

    let testProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    try {
      // 1. Create an authenticated user profile.
      const profile = await UserProfileModel.create({
        supabaseUserId: testAuthUser.id,
        email: testAuthUser.email,
      });

      if (!(profile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid replay test profile ID.");
      }

      testProfileId = profile._id;

      // 2. Create a workspace owned by this profile.
      const workspace = await WorkspaceModel.create({
        name: "Facebook Replay Prevention Workspace",
        ownerUserId: profile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid replay test workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 3. Create a temporary OAuth session.
      await OAuthSessionModel.create({
        sessionHash: testSessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "987654321",
        pages: [
          {
            facebookPageId,
            pageName: "Replay Prevention Page",
            pageAccessTokenEncrypted: encryptFacebookToken(
              `replay-test-token-${testId}`,
            ),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const connectionInput = {
        sessionToken: testSessionToken,
        authUser: testAuthUser,
        workspaceId: String(workspace._id),
        selectedPageIds: [facebookPageId],
      };

      // 4. First attempt must succeed.
      const firstResult = await connectFacebookPages(connectionInput, {
        connection,
      });

      expect(firstResult.connections).toEqual([
        {
          facebookPageId,
          pageName: "Replay Prevention Page",
          status: "connected",
        },
      ]);

      // 5. Confirm the OAuth session was consumed.
      const consumedSession = await OAuthSessionModel.findOne({
        sessionHash: testSessionHash,
      });

      expect(consumedSession).toBeNull();

      // 6. Record the existing connection before replay.
      const originalConnection = await FacebookConnectionModel.findOne({
        workspaceId: workspace._id,
        facebookPageId,
      }).lean();

      expect(originalConnection).not.toBeNull();

      // 7. Attempt to reuse the exact same OAuth session.
      await expect(
        connectFacebookPages(connectionInput, { connection }),
      ).rejects.toMatchObject({
        name: "FacebookPageConnectionError",
        statusCode: 404,
      });

      // 8. Confirm no OAuth session was recreated.
      const sessionAfterReplay = await OAuthSessionModel.findOne({
        sessionHash: testSessionHash,
      });

      expect(sessionAfterReplay).toBeNull();

      // 9. Confirm only one Page connection exists.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId,
      }).lean();

      expect(savedConnections).toHaveLength(1);

      // 10. Confirm the existing connection was not modified.
      expect(savedConnections[0]._id).toEqual(originalConnection?._id);

      expect(savedConnections[0].updatedAt).toEqual(
        originalConnection?.updatedAt,
      );

      expect(savedConnections[0].pageName).toBe("Replay Prevention Page");
    } finally {
      // 11. Cleanup is restricted to the integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (testProfileId) {
        await UserProfileModel.deleteOne({
          _id: testProfileId,
          supabaseUserId: testAuthUser.id,
        });
      }
    }
  });

  it("rejects a user attempting to connect Pages to another user's workspace", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const ownerAuthUser = {
      id: `integration-owner-${testId}`,
      email: `owner-${testId}@example.test`,
    };

    const attackerAuthUser = {
      id: `integration-attacker-${testId}`,
      email: `attacker-${testId}@example.test`,
    };

    const sessionToken = randomBytes(32).toString("base64url");

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    const facebookPageId = "666666666666666";

    let ownerProfileId: mongoose.Types.ObjectId | undefined;
    let attackerProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    try {
      // 1. Create the legitimate workspace owner.
      const ownerProfile = await UserProfileModel.create({
        supabaseUserId: ownerAuthUser.id,
        email: ownerAuthUser.email,
      });

      if (!(ownerProfile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid owner profile ID.");
      }

      ownerProfileId = ownerProfile._id;

      // 2. Create another authenticated user.
      const attackerProfile = await UserProfileModel.create({
        supabaseUserId: attackerAuthUser.id,
        email: attackerAuthUser.email,
      });

      if (!(attackerProfile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid attacker profile ID.");
      }

      attackerProfileId = attackerProfile._id;

      // 3. Create a workspace owned exclusively by User A.
      const workspace = await WorkspaceModel.create({
        name: "Facebook Authorization Integration Workspace",
        ownerUserId: ownerProfile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid authorization test workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 4. Create a valid OAuth session for the owner.
      await OAuthSessionModel.create({
        sessionHash,
        supabaseUserId: ownerAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "987654321",
        pages: [
          {
            facebookPageId,
            pageName: "Protected Facebook Page",
            pageAccessTokenEncrypted: encryptFacebookToken(
              `protected-page-token-${testId}`,
            ),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 5. User B attempts to connect the owner's Page.
      await expect(
        connectFacebookPages(
          {
            sessionToken,
            authUser: attackerAuthUser,
            workspaceId: String(workspace._id),
            selectedPageIds: [facebookPageId],
          },
          {
            connection,
          },
        ),
      ).rejects.toMatchObject({
        name: "FacebookPageConnectionError",
        statusCode: 403,
      });

      // 6. Verify the OAuth session was not consumed.
      const remainingSession = await OAuthSessionModel.findOne({
        sessionHash,
        supabaseUserId: ownerAuthUser.id,
        workspaceId: workspace._id,
      });

      expect(remainingSession).not.toBeNull();

      // 7. Verify no Facebook Page connection was created.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId,
      }).lean();

      expect(savedConnections).toHaveLength(0);

      // 8. Verify workspace ownership remains unchanged.
      const unchangedWorkspace = await WorkspaceModel.findById(
        workspace._id,
      ).lean();

      expect(unchangedWorkspace).not.toBeNull();

      expect(String(unchangedWorkspace?.ownerUserId)).toBe(
        String(ownerProfile._id),
      );
    } finally {
      // 9. Verify the cleanup target before deleting records.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 10. Delete only records belonging to this test.
      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (ownerProfileId) {
        await UserProfileModel.deleteOne({
          _id: ownerProfileId,
          supabaseUserId: ownerAuthUser.id,
        });
      }

      if (attackerProfileId) {
        await UserProfileModel.deleteOne({
          _id: attackerProfileId,
          supabaseUserId: attackerAuthUser.id,
        });
      }
    }
  });

  it("connects multiple Facebook Pages atomically with independent encrypted tokens", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const testAuthUser = {
      id: `integration-multipage-${testId}`,
      email: `multipage-${testId}@example.test`,
    };

    const sessionToken = randomBytes(32).toString("base64url");

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    const pageA = {
      id: "777777777777777",
      name: "Integration Facebook Page A",
      token: `integration-multipage-token-a-${testId}`,
    };

    const pageB = {
      id: "888888888888888",
      name: "Integration Facebook Page B",
      token: `integration-multipage-token-b-${testId}`,
    };

    let testProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    try {
      // 1. Create a user profile.
      const profile = await UserProfileModel.create({
        supabaseUserId: testAuthUser.id,
        email: testAuthUser.email,
      });

      if (!(profile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid multi-Page test profile ID.");
      }

      testProfileId = profile._id;

      // 2. Create a workspace owned by this user.
      const workspace = await WorkspaceModel.create({
        name: "Facebook Multi-Page Integration Workspace",
        ownerUserId: profile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid multi-Page test workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 3. Create an OAuth session with two discovered Pages.
      await OAuthSessionModel.create({
        sessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "987654321",
        pages: [
          {
            facebookPageId: pageA.id,
            pageName: pageA.name,
            pageAccessTokenEncrypted: encryptFacebookToken(pageA.token),
            tasks: ["CREATE_CONTENT"],
          },
          {
            facebookPageId: pageB.id,
            pageName: pageB.name,
            pageAccessTokenEncrypted: encryptFacebookToken(pageB.token),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 4. Connect both Pages in one operation.
      const result = await connectFacebookPages(
        {
          sessionToken,
          authUser: testAuthUser,
          workspaceId: String(workspace._id),
          selectedPageIds: [pageA.id, pageB.id],
        },
        {
          connection,
        },
      );

      // 5. Verify both Pages were returned.
      expect(result.connections).toHaveLength(2);

      expect(result.connections).toEqual(
        expect.arrayContaining([
          {
            facebookPageId: pageA.id,
            pageName: pageA.name,
            status: "connected",
          },
          {
            facebookPageId: pageB.id,
            pageName: pageB.name,
            status: "connected",
          },
        ]),
      );

      // 6. Verify both connections exist in MongoDB.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId: {
          $in: [pageA.id, pageB.id],
        },
      })
        .select("+pageAccessTokenEncrypted")
        .lean();

      expect(savedConnections).toHaveLength(2);

      // 7. Find the saved records independently.
      const savedPageA = savedConnections.find(
        (item) => item.facebookPageId === pageA.id,
      );

      const savedPageB = savedConnections.find(
        (item) => item.facebookPageId === pageB.id,
      );

      expect(savedPageA).toBeDefined();
      expect(savedPageB).toBeDefined();

      // 8. Verify Page ownership and metadata.
      for (const savedPage of [savedPageA, savedPageB]) {
        expect(String(savedPage?.workspaceId)).toBe(String(workspace._id));

        expect(savedPage?.connectedByUserId).toBe(testAuthUser.id);

        expect(savedPage?.facebookUserId).toBe("987654321");

        expect(savedPage?.status).toBe("connected");
      }

      // 9. Validate the encrypted token types.
      const encryptedTokenA = savedPageA?.pageAccessTokenEncrypted;

      const encryptedTokenB = savedPageB?.pageAccessTokenEncrypted;

      if (
        typeof encryptedTokenA !== "string" ||
        typeof encryptedTokenB !== "string"
      ) {
        throw new Error("Encrypted Facebook Page tokens were not retrieved.");
      }

      // 10. Verify encryption is applied to both tokens.
      expect(encryptedTokenA).not.toBe(pageA.token);
      expect(encryptedTokenB).not.toBe(pageB.token);

      expect(encryptedTokenA).not.toBe(encryptedTokenB);

      // 11. Verify each token decrypts to the correct Page token.
      expect(decryptFacebookToken(encryptedTokenA)).toBe(pageA.token);

      expect(decryptFacebookToken(encryptedTokenB)).toBe(pageB.token);

      // 12. Verify the OAuth session was consumed.
      const remainingSession = await OAuthSessionModel.findOne({
        sessionHash,
      });

      expect(remainingSession).toBeNull();

      // 13. Verify no credentials appear in the API result.
      const serializedResult = JSON.stringify(result);

      expect(serializedResult).not.toContain(pageA.token);
      expect(serializedResult).not.toContain(pageB.token);

      expect(serializedResult).not.toContain(encryptedTokenA);

      expect(serializedResult).not.toContain(encryptedTokenB);

      expect(serializedResult).not.toContain("pageAccessTokenEncrypted");

      expect(serializedResult).not.toContain(sessionToken);
    } finally {
      // 14. Restrict cleanup to the integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 15. Remove only records created by this test.
      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (testProfileId) {
        await UserProfileModel.deleteOne({
          _id: testProfileId,
          supabaseUserId: testAuthUser.id,
        });
      }
    }
  });

  it("reconnects an existing Facebook Page without creating duplicates", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const testAuthUser = {
      id: `integration-reconnect-${testId}`,
      email: `reconnect-${testId}@example.test`,
    };

    const sessionToken = randomBytes(32).toString("base64url");

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    const facebookPageId = "999999999999999";

    const oldToken = `facebook-old-token-${testId}`;
    const newToken = `facebook-new-token-${testId}`;

    let testProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    try {
      // 1. Create a test user profile.
      const profile = await UserProfileModel.create({
        supabaseUserId: testAuthUser.id,
        email: testAuthUser.email,
      });

      if (!(profile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid reconnection test profile ID.");
      }

      testProfileId = profile._id;

      // 2. Create a workspace owned by this user.
      const workspace = await WorkspaceModel.create({
        name: "Facebook Reconnection Integration Workspace",
        ownerUserId: profile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid reconnection test workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 3. Create an existing Facebook Page connection.
      const originalConnection = await FacebookConnectionModel.create({
        workspaceId: workspace._id,
        connectedByUserId: testAuthUser.id,
        facebookUserId: "111111111",
        facebookPageId,
        pageName: "Old Facebook Page Name",
        pageAccessTokenEncrypted: encryptFacebookToken(oldToken),
        scopes: [],
        status: "expired",
      });

      if (!(originalConnection._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid original connection ID.");
      }

      const originalConnectionId = originalConnection._id;

      // 4. Create a fresh OAuth session with the same Page ID.
      await OAuthSessionModel.create({
        sessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "222222222",
        pages: [
          {
            facebookPageId,
            pageName: "Updated Facebook Page Name",
            pageAccessTokenEncrypted: encryptFacebookToken(newToken),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 5. Reconnect the existing Page.
      const result = await connectFacebookPages(
        {
          sessionToken,
          authUser: testAuthUser,
          workspaceId: String(workspace._id),
          selectedPageIds: [facebookPageId],
        },
        {
          connection,
        },
      );

      // 6. Verify the public response.
      expect(result.connections).toEqual([
        {
          facebookPageId,
          pageName: "Updated Facebook Page Name",
          status: "connected",
        },
      ]);

      // 7. Retrieve all matching Page connections.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId,
      })
        .select("+pageAccessTokenEncrypted")
        .lean();

      // There must still be exactly one connection.
      expect(savedConnections).toHaveLength(1);

      const savedConnection = savedConnections[0];

      // 8. Verify the existing document was updated.
      expect(String(savedConnection._id)).toBe(String(originalConnectionId));

      expect(savedConnection.pageName).toBe("Updated Facebook Page Name");

      expect(savedConnection.status).toBe("connected");

      expect(savedConnection.connectedByUserId).toBe(testAuthUser.id);

      expect(savedConnection.facebookUserId).toBe("222222222");

      // 9. Verify the new token replaced the old token.
      const encryptedToken = savedConnection.pageAccessTokenEncrypted;

      if (typeof encryptedToken !== "string") {
        throw new Error("Reconnected Facebook Page token was not retrieved.");
      }

      expect(encryptedToken).not.toBe(newToken);
      expect(encryptedToken).not.toBe(oldToken);

      expect(decryptFacebookToken(encryptedToken)).toBe(newToken);

      expect(decryptFacebookToken(encryptedToken)).not.toBe(oldToken);

      // 10. Verify the new OAuth session was consumed.
      const remainingSession = await OAuthSessionModel.findOne({
        sessionHash,
      });

      expect(remainingSession).toBeNull();

      // 11. Verify credentials were not returned to the client.
      const serializedResult = JSON.stringify(result);

      expect(serializedResult).not.toContain(oldToken);
      expect(serializedResult).not.toContain(newToken);
      expect(serializedResult).not.toContain(encryptedToken);
      expect(serializedResult).not.toContain("pageAccessTokenEncrypted");
      expect(serializedResult).not.toContain(sessionToken);
    } finally {
      // 12. Restrict cleanup to the integration test database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 13. Delete only this test's records.
      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (testProfileId) {
        await UserProfileModel.deleteOne({
          _id: testProfileId,
          supabaseUserId: testAuthUser.id,
        });
      }
    }
  });

  it("isolates the same Facebook Page across different workspaces", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const facebookPageId = "123456789012345";

    const userA = {
      id: `integration-isolation-a-${testId}`,
      email: `isolation-a-${testId}@example.test`,
    };

    const userB = {
      id: `integration-isolation-b-${testId}`,
      email: `isolation-b-${testId}@example.test`,
    };

    const tokenA = `workspace-a-page-token-${testId}`;
    const tokenB = `workspace-b-page-token-${testId}`;

    const sessionTokenA = randomBytes(32).toString("base64url");
    const sessionTokenB = randomBytes(32).toString("base64url");

    const sessionHashA = createHash("sha256")
      .update(sessionTokenA)
      .digest("hex");

    const sessionHashB = createHash("sha256")
      .update(sessionTokenB)
      .digest("hex");

    const profileIds: mongoose.Types.ObjectId[] = [];
    const workspaceIds: mongoose.Types.ObjectId[] = [];

    try {
      // 1. Create two independent user profiles.
      const profileA = await UserProfileModel.create({
        supabaseUserId: userA.id,
        email: userA.email,
      });

      const profileB = await UserProfileModel.create({
        supabaseUserId: userB.id,
        email: userB.email,
      });

      if (
        !(profileA._id instanceof mongoose.Types.ObjectId) ||
        !(profileB._id instanceof mongoose.Types.ObjectId)
      ) {
        throw new Error("Invalid workspace isolation profile IDs.");
      }

      profileIds.push(profileA._id, profileB._id);

      // 2. Create one workspace for each user.
      const workspaceA = await WorkspaceModel.create({
        name: "Facebook Isolation Workspace A",
        ownerUserId: profileA._id,
        settings: {},
      });

      const workspaceB = await WorkspaceModel.create({
        name: "Facebook Isolation Workspace B",
        ownerUserId: profileB._id,
        settings: {},
      });

      if (
        !(workspaceA._id instanceof mongoose.Types.ObjectId) ||
        !(workspaceB._id instanceof mongoose.Types.ObjectId)
      ) {
        throw new Error("Invalid workspace isolation workspace IDs.");
      }

      workspaceIds.push(workspaceA._id, workspaceB._id);

      // 3. Create an OAuth session for Workspace A.
      await OAuthSessionModel.create({
        sessionHash: sessionHashA,
        supabaseUserId: userA.id,
        workspaceId: workspaceA._id,
        facebookUserId: "facebook-user-a",
        pages: [
          {
            facebookPageId,
            pageName: "Shared Facebook Page - Workspace A",
            pageAccessTokenEncrypted: encryptFacebookToken(tokenA),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 4. Create a separate OAuth session for Workspace B.
      await OAuthSessionModel.create({
        sessionHash: sessionHashB,
        supabaseUserId: userB.id,
        workspaceId: workspaceB._id,
        facebookUserId: "facebook-user-b",
        pages: [
          {
            facebookPageId,
            pageName: "Shared Facebook Page - Workspace B",
            pageAccessTokenEncrypted: encryptFacebookToken(tokenB),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 5. Connect the Page to Workspace A.
      const resultA = await connectFacebookPages(
        {
          sessionToken: sessionTokenA,
          authUser: userA,
          workspaceId: String(workspaceA._id),
          selectedPageIds: [facebookPageId],
        },
        {
          connection,
        },
      );

      // 6. Connect the same Page ID to Workspace B.
      const resultB = await connectFacebookPages(
        {
          sessionToken: sessionTokenB,
          authUser: userB,
          workspaceId: String(workspaceB._id),
          selectedPageIds: [facebookPageId],
        },
        {
          connection,
        },
      );

      // 7. Verify both connection operations succeeded.
      expect(resultA.connections).toEqual([
        {
          facebookPageId,
          pageName: "Shared Facebook Page - Workspace A",
          status: "connected",
        },
      ]);

      expect(resultB.connections).toEqual([
        {
          facebookPageId,
          pageName: "Shared Facebook Page - Workspace B",
          status: "connected",
        },
      ]);

      // 8. Retrieve both Page connections.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: {
          $in: [workspaceA._id, workspaceB._id],
        },
        facebookPageId,
      })
        .select("+pageAccessTokenEncrypted")
        .lean();

      expect(savedConnections).toHaveLength(2);

      const savedA = savedConnections.find(
        (item) => String(item.workspaceId) === String(workspaceA._id),
      );

      const savedB = savedConnections.find(
        (item) => String(item.workspaceId) === String(workspaceB._id),
      );

      expect(savedA).toBeDefined();
      expect(savedB).toBeDefined();

      // 9. Verify separate MongoDB documents.
      expect(String(savedA?._id)).not.toBe(String(savedB?._id));

      // 10. Verify independent ownership.
      expect(savedA?.connectedByUserId).toBe(userA.id);
      expect(savedB?.connectedByUserId).toBe(userB.id);

      expect(savedA?.facebookUserId).toBe("facebook-user-a");
      expect(savedB?.facebookUserId).toBe("facebook-user-b");

      // 11. Verify workspace-specific Page metadata.
      expect(savedA?.pageName).toBe("Shared Facebook Page - Workspace A");

      expect(savedB?.pageName).toBe("Shared Facebook Page - Workspace B");

      // 12. Validate encrypted credential types.
      const encryptedTokenA = savedA?.pageAccessTokenEncrypted;
      const encryptedTokenB = savedB?.pageAccessTokenEncrypted;

      if (
        typeof encryptedTokenA !== "string" ||
        typeof encryptedTokenB !== "string"
      ) {
        throw new Error(
          "Workspace-specific encrypted tokens were not retrieved.",
        );
      }

      // 13. Verify credentials remain independent.
      expect(encryptedTokenA).not.toBe(tokenA);
      expect(encryptedTokenB).not.toBe(tokenB);

      expect(encryptedTokenA).not.toBe(encryptedTokenB);

      expect(decryptFacebookToken(encryptedTokenA)).toBe(tokenA);

      expect(decryptFacebookToken(encryptedTokenB)).toBe(tokenB);

      // 14. Verify both OAuth sessions were consumed.
      expect(
        await OAuthSessionModel.findOne({
          sessionHash: sessionHashA,
        }),
      ).toBeNull();

      expect(
        await OAuthSessionModel.findOne({
          sessionHash: sessionHashB,
        }),
      ).toBeNull();

      // 15. Verify no credentials appear in API results.
      const serializedResults = JSON.stringify({
        resultA,
        resultB,
      });

      for (const secret of [
        tokenA,
        tokenB,
        encryptedTokenA,
        encryptedTokenB,
        sessionTokenA,
        sessionTokenB,
      ]) {
        expect(serializedResults).not.toContain(secret);
      }

      expect(serializedResults).not.toContain("pageAccessTokenEncrypted");
    } finally {
      // 16. Refuse cleanup outside the integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 17. Clean up only records created by this test.
      if (workspaceIds.length > 0) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: {
            $in: workspaceIds,
          },
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: {
            $in: workspaceIds,
          },
        });

        await WorkspaceModel.deleteMany({
          _id: {
            $in: workspaceIds,
          },
        });
      }

      if (profileIds.length > 0) {
        await UserProfileModel.deleteMany({
          _id: {
            $in: profileIds,
          },
        });
      }
    }
  });

  it("rejects an OAuth session belonging to another user and workspace", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const userA = {
      id: `integration-session-owner-a-${testId}`,
      email: `session-owner-a-${testId}@example.test`,
    };

    const userB = {
      id: `integration-session-owner-b-${testId}`,
      email: `session-owner-b-${testId}@example.test`,
    };

    const sessionToken = randomBytes(32).toString("base64url");

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    const facebookPageId = "121212121212121";

    const pageToken = `session-isolation-token-${testId}`;

    const profileIds: mongoose.Types.ObjectId[] = [];
    const workspaceIds: mongoose.Types.ObjectId[] = [];

    try {
      // 1. Create two authenticated users.
      const profileA = await UserProfileModel.create({
        supabaseUserId: userA.id,
        email: userA.email,
      });

      if (!(profileA._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid User A profile ID.");
      }

      profileIds.push(profileA._id);

      const profileB = await UserProfileModel.create({
        supabaseUserId: userB.id,
        email: userB.email,
      });

      if (!(profileB._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid User B profile ID.");
      }

      profileIds.push(profileB._id);

      // 2. Create Workspace A, owned by User A.
      const workspaceA = await WorkspaceModel.create({
        name: "Facebook Session Isolation Workspace A",
        ownerUserId: profileA._id,
        settings: {},
      });

      if (!(workspaceA._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid Workspace A ID.");
      }

      workspaceIds.push(workspaceA._id);

      // 3. Create Workspace B, owned by User B.
      const workspaceB = await WorkspaceModel.create({
        name: "Facebook Session Isolation Workspace B",
        ownerUserId: profileB._id,
        settings: {},
      });

      if (!(workspaceB._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid Workspace B ID.");
      }

      workspaceIds.push(workspaceB._id);

      // 4. Create an OAuth session belonging to User A
      // and bound to Workspace A.
      await OAuthSessionModel.create({
        sessionHash,
        supabaseUserId: userA.id,
        workspaceId: workspaceA._id,
        facebookUserId: "facebook-user-a",
        pages: [
          {
            facebookPageId,
            pageName: "Protected OAuth Session Page",
            pageAccessTokenEncrypted: encryptFacebookToken(pageToken),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 5. User B attempts to consume User A's session
      // while connecting a Page to Workspace B.
      await expect(
        connectFacebookPages(
          {
            sessionToken,
            authUser: userB,
            workspaceId: String(workspaceB._id),
            selectedPageIds: [facebookPageId],
          },
          {
            connection,
          },
        ),
      ).rejects.toMatchObject({
        name: "FacebookPageConnectionError",
        statusCode: 404,
      });

      // 6. Verify User A's OAuth session remains available.
      const remainingSession = await OAuthSessionModel.findOne({
        sessionHash,
        supabaseUserId: userA.id,
        workspaceId: workspaceA._id,
      });

      expect(remainingSession).not.toBeNull();

      // 7. Verify no Page was connected to Workspace A.
      const connectionsA = await FacebookConnectionModel.find({
        workspaceId: workspaceA._id,
        facebookPageId,
      }).lean();

      expect(connectionsA).toHaveLength(0);

      // 8. Verify no Page was connected to Workspace B.
      const connectionsB = await FacebookConnectionModel.find({
        workspaceId: workspaceB._id,
        facebookPageId,
      }).lean();

      expect(connectionsB).toHaveLength(0);

      // 9. Verify User A can still consume the session.
      const legitimateResult = await connectFacebookPages(
        {
          sessionToken,
          authUser: userA,
          workspaceId: String(workspaceA._id),
          selectedPageIds: [facebookPageId],
        },
        {
          connection,
        },
      );

      expect(legitimateResult.connections).toEqual([
        {
          facebookPageId,
          pageName: "Protected OAuth Session Page",
          status: "connected",
        },
      ]);

      // 10. Verify the session was consumed by User A.
      expect(
        await OAuthSessionModel.findOne({
          sessionHash,
        }),
      ).toBeNull();

      // 11. Verify only Workspace A received the connection.
      const finalConnections = await FacebookConnectionModel.find({
        workspaceId: {
          $in: [workspaceA._id, workspaceB._id],
        },
        facebookPageId,
      }).lean();

      expect(finalConnections).toHaveLength(1);

      expect(String(finalConnections[0].workspaceId)).toBe(
        String(workspaceA._id),
      );

      expect(finalConnections[0].connectedByUserId).toBe(userA.id);

      // 12. Verify credentials are absent from the result.
      const serializedResult = JSON.stringify(legitimateResult);

      expect(serializedResult).not.toContain(pageToken);
      expect(serializedResult).not.toContain(sessionToken);
      expect(serializedResult).not.toContain("pageAccessTokenEncrypted");
    } finally {
      // 13. Restrict cleanup to the integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 14. Remove only records created by this test.
      if (workspaceIds.length > 0) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: {
            $in: workspaceIds,
          },
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: {
            $in: workspaceIds,
          },
        });

        await WorkspaceModel.deleteMany({
          _id: {
            $in: workspaceIds,
          },
        });
      }

      if (profileIds.length > 0) {
        await UserProfileModel.deleteMany({
          _id: {
            $in: profileIds,
          },
        });
      }
    }
  });

  it("rejects an expired Facebook OAuth session before TTL cleanup", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const testAuthUser = {
      id: `integration-expired-${testId}`,
      email: `expired-${testId}@example.test`,
    };

    const sessionToken = randomBytes(32).toString("base64url");

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    const facebookPageId = "131313131313131";

    const pageToken = `expired-session-page-token-${testId}`;

    let testProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    try {
      // 1. Create the authenticated user profile.
      const profile = await UserProfileModel.create({
        supabaseUserId: testAuthUser.id,
        email: testAuthUser.email,
      });

      if (!(profile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid expired-session profile ID.");
      }

      testProfileId = profile._id;

      // 2. Create a workspace owned by this user.
      const workspace = await WorkspaceModel.create({
        name: "Facebook Expired Session Workspace",
        ownerUserId: profile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid expired-session workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 3. Create an OAuth session that has already expired.
      //
      // We use an expiry one second in the past to minimize
      // the chance that MongoDB's TTL monitor deletes the
      // document before the service attempts to claim it.
      await OAuthSessionModel.create({
        sessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "987654321",
        pages: [
          {
            facebookPageId,
            pageName: "Expired Session Facebook Page",
            pageAccessTokenEncrypted: encryptFacebookToken(pageToken),
            tasks: ["CREATE_CONTENT"],
          },
        ],
        expiresAt: new Date(Date.now() - 1000),
      });

      // 4. Verify the expired session is still present
      // immediately before attempting to consume it.
      const existingSession = await OAuthSessionModel.findOne({
        sessionHash,
      });

      expect(existingSession).not.toBeNull();

      // 5. Attempt to connect a Page using the expired session.
      await expect(
        connectFacebookPages(
          {
            sessionToken,
            authUser: testAuthUser,
            workspaceId: String(workspace._id),
            selectedPageIds: [facebookPageId],
          },
          {
            connection,
          },
        ),
      ).rejects.toMatchObject({
        name: "FacebookPageConnectionError",
        statusCode: 404,
      });

      // 6. Verify no Facebook Page connection was created.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId,
      }).lean();

      expect(savedConnections).toHaveLength(0);

      // 7. Verify the rejected request did not consume
      // or modify the expired OAuth session.
      //
      // The TTL monitor may independently delete it at
      // any time, so we cannot require it to still exist.
      const sessionAfterAttempt = await OAuthSessionModel.findOne({
        sessionHash,
      });

      if (sessionAfterAttempt) {
        expect(sessionAfterAttempt.supabaseUserId).toBe(testAuthUser.id);

        expect(String(sessionAfterAttempt.workspaceId)).toBe(
          String(workspace._id),
        );

        const expiresAt = sessionAfterAttempt.expiresAt;

        if (!(expiresAt instanceof Date)) {
          throw new Error(
            "Integration test OAuth session has an invalid expiration date.",
          );
        }

        expect(expiresAt.getTime()).toBeLessThan(Date.now());
      }
    } finally {
      // 8. Refuse cleanup outside the integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 9. Clean up only this test's records.
      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (testProfileId) {
        await UserProfileModel.deleteOne({
          _id: testProfileId,
          supabaseUserId: testAuthUser.id,
        });
      }
    }
  });

  it("rejects Pages without CREATE_CONTENT permission and preserves the OAuth session", async () => {
    const UserProfileModel = connection.model(
      UserProfile.modelName,
      UserProfile.schema,
    );

    const WorkspaceModel = connection.model(
      Workspace.modelName,
      Workspace.schema,
    );

    const OAuthSessionModel = connection.model(
      FacebookOAuthSession.modelName,
      FacebookOAuthSession.schema,
    );

    const FacebookConnectionModel = connection.model(
      FacebookConnection.modelName,
      FacebookConnection.schema,
    );

    const testId = randomBytes(12).toString("hex");

    const testAuthUser = {
      id: `integration-permissions-${testId}`,
      email: `permissions-${testId}@example.test`,
    };

    const sessionToken = randomBytes(32).toString("base64url");

    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");

    const permittedPageId = "141414141414141";
    const restrictedPageId = "151515151515151";

    let testProfileId: mongoose.Types.ObjectId | undefined;
    let testWorkspaceId: mongoose.Types.ObjectId | undefined;

    try {
      // 1. Create the authenticated user.
      const profile = await UserProfileModel.create({
        supabaseUserId: testAuthUser.id,
        email: testAuthUser.email,
      });

      if (!(profile._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid permissions test profile ID.");
      }

      testProfileId = profile._id;

      // 2. Create a workspace owned by the user.
      const workspace = await WorkspaceModel.create({
        name: "Facebook Page Permission Test Workspace",
        ownerUserId: profile._id,
        settings: {},
      });

      if (!(workspace._id instanceof mongoose.Types.ObjectId)) {
        throw new Error("Invalid permissions test workspace ID.");
      }

      testWorkspaceId = workspace._id;

      // 3. Create an OAuth session with two Pages.
      //
      // Page A has publishing permission.
      // Page B does not.
      await OAuthSessionModel.create({
        sessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
        facebookUserId: "987654321",
        pages: [
          {
            facebookPageId: permittedPageId,
            pageName: "Permitted Facebook Page",
            pageAccessTokenEncrypted: encryptFacebookToken(
              `permitted-page-token-${testId}`,
            ),
            tasks: ["CREATE_CONTENT"],
          },
          {
            facebookPageId: restrictedPageId,
            pageName: "Restricted Facebook Page",
            pageAccessTokenEncrypted: encryptFacebookToken(
              `restricted-page-token-${testId}`,
            ),
            tasks: ["ANALYZE"],
          },
        ],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 4. Attempt to connect both Pages.
      //
      // The restricted Page must cause the entire
      // operation to fail.
      await expect(
        connectFacebookPages(
          {
            sessionToken,
            authUser: testAuthUser,
            workspaceId: String(workspace._id),
            selectedPageIds: [permittedPageId, restrictedPageId],
          },
          {
            connection,
          },
        ),
      ).rejects.toMatchObject({
        name: "FacebookPageConnectionError",
      });

      // 5. Verify neither Page was connected.
      const savedConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId: {
          $in: [permittedPageId, restrictedPageId],
        },
      }).lean();

      expect(savedConnections).toHaveLength(0);

      // 6. Verify the OAuth session was restored.
      const remainingSession = await OAuthSessionModel.findOne({
        sessionHash,
        supabaseUserId: testAuthUser.id,
        workspaceId: workspace._id,
      });

      expect(remainingSession).not.toBeNull();

      // 7. Verify the permitted Page can still be
      // connected using the same OAuth session.
      const permittedResult = await connectFacebookPages(
        {
          sessionToken,
          authUser: testAuthUser,
          workspaceId: String(workspace._id),
          selectedPageIds: [permittedPageId],
        },
        {
          connection,
        },
      );

      expect(permittedResult.connections).toEqual([
        {
          facebookPageId: permittedPageId,
          pageName: "Permitted Facebook Page",
          status: "connected",
        },
      ]);

      // 8. Verify only the permitted Page exists.
      const finalConnections = await FacebookConnectionModel.find({
        workspaceId: workspace._id,
        facebookPageId: {
          $in: [permittedPageId, restrictedPageId],
        },
      }).lean();

      expect(finalConnections).toHaveLength(1);

      expect(finalConnections[0].facebookPageId).toBe(permittedPageId);

      // 9. Verify the session was consumed after success.
      expect(
        await OAuthSessionModel.findOne({
          sessionHash,
        }),
      ).toBeNull();

      // 10. Verify no credentials appear in the response.
      const serializedResult = JSON.stringify(permittedResult);

      expect(serializedResult).not.toContain("pageAccessTokenEncrypted");

      expect(serializedResult).not.toContain(sessionToken);

      expect(serializedResult).not.toContain(`permitted-page-token-${testId}`);

      expect(serializedResult).not.toContain(`restricted-page-token-${testId}`);
    } finally {
      // 11. Restrict cleanup to the integration database.
      if (connection.db?.databaseName !== "storm_facebook_integration_test") {
        throw new Error(
          "Refusing cleanup outside the integration test database.",
        );
      }

      // 12. Remove only this test's records.
      if (testWorkspaceId) {
        await FacebookConnectionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await OAuthSessionModel.deleteMany({
          workspaceId: testWorkspaceId,
        });

        await WorkspaceModel.deleteOne({
          _id: testWorkspaceId,
        });
      }

      if (testProfileId) {
        await UserProfileModel.deleteOne({
          _id: testProfileId,
          supabaseUserId: testAuthUser.id,
        });
      }
    }
  });
});
