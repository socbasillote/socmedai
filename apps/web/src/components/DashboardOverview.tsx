import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardMetrics } from "@/components/DashboardMetrics";
import { PublishingActivityCard } from "@/components/PublishingActivityCard";
import { CreativeSpaceCard } from "@/components/CreativeSpaceCard";
import { RecentPostsSection } from "@/components/RecentPostsSection";
import type { RecentPostItem } from "@/components/RecentPostsList";

type DashboardOverviewProps = {
  draftCount: number;
  statusFilter: Parameters<typeof RecentPostsSection>[0]["statusFilter"];
  setStatusFilter: Parameters<typeof RecentPostsSection>[0]["setStatusFilter"];
  platformFilter: Parameters<typeof RecentPostsSection>[0]["platformFilter"];
  setPlatformFilter: Parameters<
    typeof RecentPostsSection
  >[0]["setPlatformFilter"];
  deletePostError: string;
  posts: RecentPostItem[];
  postsLoading: boolean;
  postsLoadError: string;
  search: string;
  deletingPostId: string | null;
  hasMorePosts: boolean;
  loadingMorePosts: boolean;
  onEdit: (postId: string) => void;
  onDelete: (postId: string, postTitle: string) => void;
  onMoreOptions: (postTitle: string) => void;
  onLoadMore: () => void;
  onCreatePost: () => void;
  onOpenStudio: () => void;
  onViewPublishing: () => void;
};

export function DashboardOverview({
  draftCount,
  statusFilter,
  setStatusFilter,
  platformFilter,
  setPlatformFilter,
  deletePostError,
  posts,
  postsLoading,
  postsLoadError,
  search,
  deletingPostId,
  hasMorePosts,
  loadingMorePosts,
  onEdit,
  onDelete,
  onMoreOptions,
  onLoadMore,
  onCreatePost,
  onOpenStudio,
  onViewPublishing,
}: DashboardOverviewProps) {
  return (
    <>
      <DashboardHeader onCreatePost={onCreatePost} />

      <DashboardMetrics draftCount={draftCount} />

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <PublishingActivityCard />
        <CreativeSpaceCard onOpenStudio={onOpenStudio} />
      </div>

      <RecentPostsSection
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        platformFilter={platformFilter}
        setPlatformFilter={setPlatformFilter}
        onViewPublishing={onViewPublishing}
        deletePostError={deletePostError}
        posts={posts}
        loading={postsLoading}
        loadError={postsLoadError}
        search={search}
        deletingPostId={deletingPostId}
        hasMorePosts={hasMorePosts}
        loadingMorePosts={loadingMorePosts}
        onEdit={onEdit}
        onDelete={onDelete}
        onMoreOptions={onMoreOptions}
        onLoadMore={onLoadMore}
      />

      <footer className="flex flex-col justify-between gap-2 py-8 text-xs text-slate-400 sm:flex-row">
        <p>© 2026 Storm. Create something remarkable.</p>
        <p>Workspace · Saved content</p>
      </footer>
    </>
  );
}
