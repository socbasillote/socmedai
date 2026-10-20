import {
  getUserWorkspaceById,
  isValidWorkspaceId,
} from "../workspaceService.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import {
  createLinkedInOAuthState,
  LinkedInOAuthStateError,
} from "./linkedinOAuthStateService.js";
import {
  getLinkedInOAuthConfig,
  LinkedInConfigurationError,
} from "./linkedinConfig.js";

const LINKEDIN_AUTHORIZATION_ENDPOINT =
  "https://www.linkedin.com/oauth/v2/authorization";

export class LinkedInAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInAuthorizationError";
  }
}

export async function createLinkedInAuthorizationUrl(
  authUser: AuthenticatedUser,
  workspaceId: string,
): Promise<string> {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new LinkedInAuthorizationError("Workspace not found.", 404);
  }

  const workspace = await getUserWorkspaceById(authUser, workspaceId);

  if (!workspace) {
    throw new LinkedInAuthorizationError("Workspace not found.", 404);
  }

  let config: ReturnType<typeof getLinkedInOAuthConfig>;

  try {
    config = getLinkedInOAuthConfig();
  } catch (error) {
    if (error instanceof LinkedInConfigurationError) {
      throw new LinkedInAuthorizationError(error.message, 503);
    }

    throw error;
  }

  let state: string;

  try {
    state = await createLinkedInOAuthState({
      supabaseUserId: authUser.id,
      workspaceId,
    });
  } catch (error) {
    if (error instanceof LinkedInOAuthStateError) {
      throw new LinkedInAuthorizationError(error.message, error.statusCode);
    }

    throw error;
  }

  const authorizationUrl = new URL(LINKEDIN_AUTHORIZATION_ENDPOINT);

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("scope", "openid profile w_member_social");

  return authorizationUrl.toString();
}
