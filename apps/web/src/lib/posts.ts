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
};

type CreatePostResponse = {
  post: Post;
};

type ListPostsResponse = {
  posts: Post[];
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
