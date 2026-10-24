import { apiFetch } from "@/lib/api";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type PostPlatform = "facebook" | "instagram" | "linkedin";

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
    linkedin?: string;
  };
};

export type UpdateDraftPostInput = {
  title?: string;
  caption?: string;
  platforms?: PostPlatform[];
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

export async function createPost(input: CreatePostInput): Promise<Post> {
  const response = await apiFetch<CreatePostResponse>("/api/posts", {
    method: "POST",
    body: JSON.stringify(input),
  });

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
    limit?: number;
    search?: string;
    status?:
      | "all"
      | "draft"
      | "scheduled"
      | "publishing"
      | "published"
      | "failed";
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

  return apiFetch<PaginatedPostsResponse & { draftCount: number }>(path);
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
