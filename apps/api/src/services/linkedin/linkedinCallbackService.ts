import {
  consumeLinkedInOAuthState,
  LinkedInOAuthStateError,
} from "./linkedinOAuthStateService.js";
import {
  exchangeLinkedInAuthorizationCode,
  LinkedInTokenExchangeError,
} from "./linkedinTokenService.js";
import {
  fetchLinkedInProfile,
  LinkedInProfileLookupError,
} from "./linkedinProfileService.js";
import {
  saveLinkedInConnection,
  LinkedInConnectionError,
  type LinkedInConnectionSummary,
} from "./linkedinConnectionService.js";

export class LinkedInCallbackError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "LinkedInCallbackError";
  }
}

export async function completeLinkedInOAuthCallback({
  code,
  state,
}: {
  code: string;
  state: string;
}): Promise<LinkedInConnectionSummary> {
  if (typeof code !== "string" || !code.trim()) {
    throw new LinkedInCallbackError(
      "A LinkedIn authorization code is required.",
      400,
    );
  }

  let stateContext: {
    supabaseUserId: string;
    workspaceId: string;
  };

  try {
    stateContext = await consumeLinkedInOAuthState({ state });
  } catch (error) {
    if (error instanceof LinkedInOAuthStateError) {
      throw new LinkedInCallbackError(
        "Invalid or expired LinkedIn authorization state.",
        error.statusCode,
      );
    }

    throw error;
  }

  try {
    const tokens = await exchangeLinkedInAuthorizationCode(code);
    const profile = await fetchLinkedInProfile(tokens.access_token);

    return await saveLinkedInConnection({
      authUser: {
        id: stateContext.supabaseUserId,
        email: null,
      },
      workspaceId: stateContext.workspaceId,
      profile,
      tokens,
    });
  } catch (error) {
    if (
      error instanceof LinkedInTokenExchangeError ||
      error instanceof LinkedInProfileLookupError ||
      error instanceof LinkedInConnectionError
    ) {
      throw new LinkedInCallbackError(error.message, error.statusCode);
    }

    throw error;
  }
}
