export type LinkedInTextPostInput = {
  accessToken: string;
  linkedinMemberId: string;
  caption: string;
};

export type LinkedInTextPostResult =
  | {
      outcome: "published";
      externalPostId: string;
    }
  | {
      outcome: "failed";
      message: string;
    }
  | {
      outcome: "unknown";
      message: string;
    };

export async function publishLinkedInTextPost(
  input: LinkedInTextPostInput,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInTextPostResult> {
  if (!input.accessToken.trim()) {
    return {
      outcome: "failed",
      message: "LinkedIn access token is unavailable.",
    };
  }

  if (!input.linkedinMemberId.trim()) {
    return {
      outcome: "failed",
      message: "LinkedIn member identity is unavailable.",
    };
  }

  if (!input.caption.trim()) {
    return {
      outcome: "failed",
      message: "A caption is required for LinkedIn publishing.",
    };
  }

  const author = `urn:li:person:${input.linkedinMemberId}`;

  const body = {
    author,
    commentary: input.caption,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  let response: Response;

  try {
    response = await fetchImpl("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": "202610",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return {
      outcome: "unknown",
      message:
        "LinkedIn publishing request could not be confirmed. Check LinkedIn before retrying.",
    };
  }

  if (response.status === 201) {
    const externalPostId = response.headers.get("x-restli-id")?.trim();

    if (!externalPostId) {
      return {
        outcome: "unknown",
        message:
          "LinkedIn accepted the request but did not return a post ID. Check LinkedIn before retrying.",
      };
    }

    return {
      outcome: "published",
      externalPostId,
    };
  }

  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 422
  ) {
    return {
      outcome: "failed",
      message: `LinkedIn rejected the publishing request (HTTP ${response.status}).`,
    };
  }

  return {
    outcome: "unknown",
    message: `LinkedIn publishing outcome is uncertain (HTTP ${response.status}). Check LinkedIn before retrying.`,
  };
}
