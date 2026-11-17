export type LinkedInTextPostInput = {
  accessToken: string;
  linkedinMemberId: string;
  caption: string;
  image?: Uint8Array;
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

  let imageUrn: string | undefined;
  if (input.image) {
    // These steps only upload an asset. No public post exists until /rest/posts.
    try {
      if (!input.image.length || input.image.length > 10 * 1024 * 1024) throw new Error("Invalid image");
      const registration = await fetchImpl("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          "Linkedin-Version": "202610",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!registration.ok) throw new Error("Registration rejected");
      const registered = await registration.json() as { value?: { image?: string; uploadUrl?: string } };
      const value = registered.value;
      if (!value?.image || !/^urn:li:image:[A-Za-z0-9_-]+$/.test(value.image) || !value.uploadUrl) throw new Error("Invalid registration");
      const uploadUrl = new URL(value.uploadUrl);
      // Avoid sending tokens or private bytes to an unexpected upload host.
      if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "www.linkedin.com" ||
          !uploadUrl.pathname.startsWith("/dms-uploads/") || uploadUrl.port || uploadUrl.username || uploadUrl.password) throw new Error("Invalid upload URL");
      const uploaded = await fetchImpl(uploadUrl.toString(), {
        method: "PUT",
        headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "image/jpeg" },
        body: Uint8Array.from(input.image).buffer,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!uploaded.ok) throw new Error("Upload rejected");
      imageUrn = value.image;
    } catch {
      return { outcome: "failed", message: "LinkedIn image upload failed. No post was submitted." };
    }
  }

  const body = {
    author,
    ...(imageUrn ? { content: { media: { id: imageUrn } } } : {}),
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
      redirect: "error",
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
