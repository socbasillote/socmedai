import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";

import type { AuthenticatedUser } from "../userProfileService.js";

import {
  createFacebookOAuthState,
  FacebookOAuthStateError,
} from "./facebookOAuthStateService.js";

import {
  getFacebookOAuthConfig,
  FacebookConfigurationError,
} from "./facebookConfig.js";

import { env } from "../../config/env.js";

const FACEBOOK_PAGE_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

export class FacebookAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookAuthorizationError";
  }
}

export async function createFacebookAuthorizationUrl(
  authUser: AuthenticatedUser,
  workspaceId: string,
): Promise<string> {
  // Step 1: Validate the workspace ID.
  if (!isValidWorkspaceId(workspaceId)) {
    throw new FacebookAuthorizationError("Workspace not found.", 404);
  }

  // Step 2: Verify workspace access.
  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new FacebookAuthorizationError("Workspace not found.", 404);
  }

  // Step 3: Validate Facebook configuration.
  let config: ReturnType<typeof getFacebookOAuthConfig>;

  try {
    config = getFacebookOAuthConfig();
  } catch (error) {
    if (error instanceof FacebookConfigurationError) {
      throw new FacebookAuthorizationError(error.message, 503);
    }

    throw error;
  }

  // Step 4: Require an explicitly configured Graph API version.
  const graphApiVersion = env.FACEBOOK_GRAPH_API_VERSION;

  if (!graphApiVersion) {
    throw new FacebookAuthorizationError(
      "Facebook Graph API version is not configured on the server.",
      503,
    );
  }

  // Step 5: Create a secure OAuth state.
  let state: string;

  try {
    state = await createFacebookOAuthState({
      supabaseUserId: authUser.id,
      workspaceId,
    });
  } catch (error) {
    if (error instanceof FacebookOAuthStateError) {
      throw new FacebookAuthorizationError(error.message, error.statusCode);
    }

    throw error;
  }

  // Step 6: Construct the Facebook Login URL.
  const authorizationUrl = new URL(
    `https://www.facebook.com/${graphApiVersion}/dialog/oauth`,
  );

  authorizationUrl.searchParams.set("client_id", config.appId);

  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);

  authorizationUrl.searchParams.set("response_type", "code");

  authorizationUrl.searchParams.set("state", state);

  authorizationUrl.searchParams.set("scope", FACEBOOK_PAGE_SCOPES.join(","));

  return authorizationUrl.toString();
}
