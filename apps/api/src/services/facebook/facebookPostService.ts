import { env } from "../../config/env.js";

import { FACEBOOK_POST_MESSAGE_MAX_LENGTH } from "./facebookPublishInput.js";

export type FacebookTextPostInput = {
  pageId: string;
  pageAccessToken: string;
  message: string;
};

export type FacebookTextPostResult =
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

/**
 * Low-level Facebook Page text publishing.
 *
 * IMPORTANT:
 * - Requires an explicit fetch implementation.
 * - Does not load or decrypt credentials.
 * - Does not authorize workspace access.
 * - Must only be invoked by an authorized adapter.
 *
 * Unknown outcomes must NOT be retried automatically.
 */
export async function publishFacebookTextPost(
  input: FacebookTextPostInput,
  fetchImpl: typeof fetch,
): Promise<FacebookTextPostResult> {
  const failed = (message: string): FacebookTextPostResult => ({
    outcome: "failed",
    message,
  });

  const unknown = (message: string): FacebookTextPostResult => ({
    outcome: "unknown",
    message,
  });

  // 1. Validate Page ID.
  if (typeof input.pageId !== "string" || !/^[0-9]+$/.test(input.pageId)) {
    return failed("A valid Facebook Page ID is required.");
  }

  // 2. Validate Page access token.
  if (
    typeof input.pageAccessToken !== "string" ||
    !input.pageAccessToken.trim()
  ) {
    return failed("Facebook Page credentials are unavailable.");
  }

  // 3. Validate text content.
  if (typeof input.message !== "string") {
    return failed("Post content is required.");
  }

  const message = input.message.trim();

  if (!message) {
    return failed("Post content cannot be empty.");
  }

  if (message.length > FACEBOOK_POST_MESSAGE_MAX_LENGTH) {
    return failed("Facebook post content exceeds Storm's limit.");
  }

  // 4. Validate the configured Graph API version.
  const graphVersion = env.FACEBOOK_GRAPH_API_VERSION;

  if (
    typeof graphVersion !== "string" ||
    !/^v[0-9]+\.[0-9]+$/.test(graphVersion)
  ) {
    return failed("Facebook Graph API version is not configured.");
  }

  // 5. Build the Page feed endpoint.
  const endpoint =
    `https://graph.facebook.com/${graphVersion}` + `/${input.pageId}/feed`;

  const body = new URLSearchParams({
    message,
  });

  // 6. Submit the request.
  let response: Response;

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.pageAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return unknown(
      "Facebook publishing could not be confirmed. " +
        "Check the Page before retrying.",
    );
  }

  // 7. Handle confirmed success.
  if (response.status === 200) {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return unknown(
        "Facebook returned an invalid publishing response. " +
          "Check the Page before retrying.",
      );
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      !payload.id.trim()
    ) {
      return unknown(
        "Facebook did not return a valid post ID. " +
          "Check the Page before retrying.",
      );
    }

    return {
      outcome: "published",
      externalPostId: payload.id,
    };
  }

  // 8. Handle definite request rejection.
  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 422
  ) {
    return failed(
      `Facebook rejected the publishing request ` +
        `(HTTP ${response.status}).`,
    );
  }

  // 9. Treat other outcomes conservatively.
  return unknown(
    `Facebook publishing outcome is uncertain ` +
      `(HTTP ${response.status}). ` +
      "Check the Page before retrying.",
  );
}
