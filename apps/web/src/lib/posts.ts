import { apiFetch } from "@/lib/api";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed" | "unknown";

export type PostPlatform = "facebook" | "instagram" | "linkedin";

export type PostPlatformResult = {
  platform: PostPlatform;
  status: "pending" | "publishing" | "published" | "failed" | "unknown" | "unknown";
  externalPostId?: string;
  publishedAt?: string;
  lastError?: string;
  attemptCount?: number;
};

export type Post = {
  _id: string;
  workspaceId: string;
  createdByUserId: string;
  title?: string;
  caption: string;
  mediaIds: string[];
  platforms: PostPlatform[];
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  lastError?: string;

  platformResults?: PostPlatformResult[];

  platformConnections?: {
    facebook?: string;
    linkedin?: string;
  };

  createdAt: string;
  updatedAt: string;
};

export type CreatePostInput = {
  workspaceId: string;
  title?: string;
  caption: string;
  mediaIds?: string[];
  platforms: PostPlatform[];
  scheduledAt?: string;
  platformConnections?: {
    facebook?: string;
    linkedin?: string;
  };
};

export type UpdateDraftPostInput = {
  title?: string;
  caption?: string;
  mediaIds?: string[];
  platforms?: PostPlatform[];
  platformConnections?: {
    facebook?: string;
    linkedin?: string;
  };
};

type CreatePostResponse = {
  post: Post;
};

type ListPostsResponse = {
  posts: Post[];
};

export type PaginatedPostsResponse = {
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
  draftCount: number;
};

export type PublishingOutcome =
  | "published"
  | "failed" | "unknown"
  | "unknown"
  | "simulated";

export type PlatformPublishingResult = {
  outcome: PublishingOutcome;
  postId: string;
  platform: PostPlatform;
  externalPostId?: string;
  publishedAt?: string;
  message?: string;
};

export type PublishPostResponse = {
  message: string;
  result: {
    postId: string;
    results: PlatformPublishingResult[];
  };
  post: Post;
};

export async function createPost(input: CreatePostInput): Promise<Post> {
  const response = await apiFetch<CreatePostResponse>("/api/posts", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.post;
}

export async function getPostById(postId: string): Promise<Post> {
  const response = await apiFetch<CreatePostResponse>(
    `/api/posts/${encodeURIComponent(postId)}`,
  );

  return response.post;
}

export async function getWorkspacePosts(workspaceId: string): Promise<Post[]> {
  const response = await apiFetch<ListPostsResponse>(
    `/api/posts/workspaces/${encodeURIComponent(workspaceId)}`,
  );

  return response.posts;
}

export async function getWorkspacePostsPage(
  workspaceId: string,
  options?: {
    cursor?: string;
    signal?: AbortSignal;
    limit?: number;
    search?: string;
    status?:
      | "all"
      | "draft"
      | "scheduled"
      | "publishing"
      | "published"
      | "failed" | "unknown";
    platform?: "all" | "facebook" | "instagram" | "linkedin";
  },
): Promise<PaginatedPostsResponse & { draftCount: number }> {
  const params = new URLSearchParams();

  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  if (options?.search?.trim()) {
    params.set("search", options.search.trim());
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  if (options?.platform && options.platform !== "all") {
    params.set("platform", options.platform);
  }

  const query = params.toString();
  const path =
    `/api/posts/workspaces/${encodeURIComponent(workspaceId)}` +
    (query ? `?${query}` : "");

  return apiFetch<PaginatedPostsResponse & { draftCount: number }>(path, options?.signal ? { signal: options.signal } : {});
}

export async function deleteDraftPost(postId: string): Promise<void> {
  await apiFetch<{ message: string; postId: string }>(
    `/api/posts/${encodeURIComponent(postId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function updateDraftPost(
  postId: string,
  input: UpdateDraftPostInput,
): Promise<Post> {
  const response = await apiFetch<CreatePostResponse>(
    `/api/posts/${encodeURIComponent(postId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return response.post;
}

export async function publishPostNow(
  postId: string,
): Promise<PublishPostResponse> {
  return apiFetch<PublishPostResponse>(
    `/api/posts/${encodeURIComponent(postId)}/publish`,
    {
      method: "POST",
    },
  );
}

export async function changePostSchedule(postId: string, scheduledAt?: string): Promise<Post> {
  const result = await apiFetch<{ post: Post }>(`/api/posts/${encodeURIComponent(postId)}/schedule`, { method: scheduledAt ? "PATCH" : "DELETE", ...(scheduledAt ? { body: JSON.stringify({ scheduledAt }) } : {}) });
  return result.post;
}
export async function reconcilePublication(postId: string): Promise<Post> {
  return (await apiFetch<{ post: Post }>(`/api/posts/${encodeURIComponent(postId)}/reconcile`, { method: "POST" })).post;
}
