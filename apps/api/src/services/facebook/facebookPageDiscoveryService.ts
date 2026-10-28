import { z } from "zod";

import { env } from "../../config/env.js";

const facebookPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  access_token: z.string().min(1),
  tasks: z.array(z.string()).optional(),
});

const facebookPagesResponseSchema = z.object({
  data: z.array(facebookPageSchema),
  paging: z
    .object({
      cursors: z
        .object({
          before: z.string().optional(),
          after: z.string().optional(),
        })
        .optional(),
      next: z.string().url().optional(),
    })
    .optional(),
});

export type DiscoveredFacebookPage = {
  facebookPageId: string;
  pageName: string;
  pageAccessToken: string;
  tasks: string[];
};

export class FacebookPageDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FacebookPageDiscoveryError";
  }
}

export async function discoverFacebookPages(
  userAccessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveredFacebookPage[]> {
  if (typeof userAccessToken !== "string" || !userAccessToken.trim()) {
    throw new FacebookPageDiscoveryError(
      "A Facebook user access token is required.",
      400,
    );
  }

  const graphApiVersion = env.FACEBOOK_GRAPH_API_VERSION;

  if (!graphApiVersion) {
    throw new FacebookPageDiscoveryError(
      "Facebook Graph API version is not configured on the server.",
      503,
    );
  }

  const discoveredPages: DiscoveredFacebookPage[] = [];

  const seenPageIds = new Set<string>();

  let afterCursor: string | undefined;

  const seenCursors = new Set<string>();

  // Protect against unexpected or circular pagination.
  const MAX_PAGES = 100;

  for (let requestNumber = 0; requestNumber < MAX_PAGES; requestNumber++) {
    const url = new URL(
      `https://graph.facebook.com/${graphApiVersion}/me/accounts`,
    );

    url.searchParams.set("fields", "id,name,access_token,tasks");

    url.searchParams.set("limit", "100");

    if (afterCursor) {
      url.searchParams.set("after", afterCursor);
    }

    let response: Response;

    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${userAccessToken}`,
        },
      });
    } catch {
      throw new FacebookPageDiscoveryError(
        "Unable to contact Facebook's Page service.",
        502,
      );
    }

    if (!response.ok) {
      throw new FacebookPageDiscoveryError(
        "Facebook rejected the Page discovery request.",
        502,
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new FacebookPageDiscoveryError(
        "Facebook returned an invalid Page discovery response.",
        502,
      );
    }

    const parsed = facebookPagesResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new FacebookPageDiscoveryError(
        "Facebook returned an invalid Page discovery response.",
        502,
      );
    }

    for (const page of parsed.data.data) {
      if (seenPageIds.has(page.id)) {
        continue;
      }

      seenPageIds.add(page.id);

      discoveredPages.push({
        facebookPageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        tasks: page.tasks ?? [],
      });
    }

    const nextCursor = parsed.data.paging?.cursors?.after;

    // No next page.
    if (!parsed.data.paging?.next) {
      return discoveredPages;
    }

    // Reject malformed or circular pagination.
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new FacebookPageDiscoveryError(
        "Facebook returned invalid Page pagination.",
        502,
      );
    }

    seenCursors.add(nextCursor);
    afterCursor = nextCursor;
  }

  throw new FacebookPageDiscoveryError(
    "Facebook Page discovery exceeded the pagination limit.",
    502,
  );
}
