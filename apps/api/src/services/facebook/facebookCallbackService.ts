import {
  consumeFacebookOAuthState,
  FacebookOAuthStateError,
} from "./facebookOAuthStateService.js";

import {
  exchangeFacebookAuthorizationCode,
  FacebookTokenExchangeError,
} from "./facebookTokenService.js";

import {
  exchangeFacebookLongLivedToken,
  FacebookLongLivedTokenError,
} from "./facebookLongLivedTokenService.js";

import {
  getFacebookUserIdentity,
  FacebookUserIdentityError,
} from "./facebookUserIdentityService.js";

import {
  discoverFacebookPages,
  FacebookPageDiscoveryError,
} from "./facebookPageDiscoveryService.js";

import {
  createFacebookOAuthSession,
  FacebookOAuthSessionError,
  type CreatedFacebookOAuthSession,
} from "./facebookOAuthSessionService.js";

export type CompleteFacebookOAuthCallbackInput = {
  code: string;
  state: string;
};

export type CompletedFacebookOAuthCallback = {
  workspaceId: string;
  sessionToken: string;
  expiresAt: Date;
  pages: CreatedFacebookOAuthSession["pages"];
};

export class FacebookCallbackError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookCallbackError";
  }
}

function normalizeCallbackError(error: unknown): FacebookCallbackError {
  if (error instanceof FacebookCallbackError) {
    return error;
  }

  if (
    error instanceof FacebookOAuthStateError ||
    error instanceof FacebookTokenExchangeError ||
    error instanceof FacebookLongLivedTokenError ||
    error instanceof FacebookUserIdentityError ||
    error instanceof FacebookPageDiscoveryError ||
    error instanceof FacebookOAuthSessionError
  ) {
    return new FacebookCallbackError(
      "Facebook authorization could not be completed.",
      error.statusCode,
    );
  }

  return new FacebookCallbackError(
    "Facebook authorization could not be completed.",
    500,
  );
}

export async function completeFacebookOAuthCallback({
  code,
  state,
}: CompleteFacebookOAuthCallbackInput): Promise<CompletedFacebookOAuthCallback> {
  // 1. Validate the callback input before consuming OAuth state.
  if (typeof code !== "string" || !code.trim()) {
    throw new FacebookCallbackError(
      "Facebook authorization could not be completed.",
      400,
    );
  }

  if (typeof state !== "string" || !state.trim()) {
    throw new FacebookCallbackError(
      "Facebook authorization could not be completed.",
      400,
    );
  }

  try {
    // 2. Consume the OAuth state atomically.
    //
    // This prevents the same callback from being replayed.
    const { supabaseUserId, workspaceId } = await consumeFacebookOAuthState({
      state,
    });

    // 3. Exchange the authorization code for a short-lived user token.
    const shortLivedToken = await exchangeFacebookAuthorizationCode(code);

    // 4. Exchange it for a long-lived user token.
    const longLivedToken = await exchangeFacebookLongLivedToken(
      shortLivedToken.access_token,
    );

    // 5. Retrieve the Facebook user ID.
    const { facebookUserId } = await getFacebookUserIdentity(
      longLivedToken.access_token,
    );

    // 6. Discover Facebook Pages.
    //
    // This returns Page metadata and Page access tokens.
    const pages = await discoverFacebookPages(longLivedToken.access_token);

    // 7. Create the temporary OAuth session.
    //
    // Page tokens are encrypted by the session service.
    const session = await createFacebookOAuthSession({
      supabaseUserId,
      workspaceId,
      facebookUserId,
      pages,
    });

    // 8. Return only the temporary session token and safe metadata.
    //
    // No Facebook access tokens or authorization codes are returned.
    return {
      workspaceId,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      pages: session.pages,
    };
  } catch (error) {
    throw normalizeCallbackError(error);
  }
}
