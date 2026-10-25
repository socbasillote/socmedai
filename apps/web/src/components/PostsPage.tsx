import type { ChangeEvent } from "react";

type PostStatusFilter = "all" | "draft" | "scheduled" | "published" | "failed";

type PostPlatformFilter = "all" | "facebook" | "instagram" | "linkedin";

type PostsPageProps = {
  search: string;
  statusFilter: PostStatusFilter;
  platformFilter: PostPlatformFilter;

  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: PostStatusFilter) => void;
  onPlatformFilterChange: (value: PostPlatformFilter) => void;

  children: React.ReactNode;
};

export function PostsPage({
  search,
  statusFilter,
  platformFilter,
  onSearchChange,
  onStatusFilterChange,
  onPlatformFilterChange,
  children,
}: PostsPageProps) {
  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    onSearchChange(event.target.value);
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Posts</h1>

        <p className="mt-1 text-sm text-slate-500">
          Manage your drafts, scheduled posts, and published content.
        </p>
      </div>

      {/* Search and filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Search */}
          <div>
            <label
              htmlFor="posts-search"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Search posts
            </label>

            <input
              id="posts-search"
              type="search"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search by caption or title..."
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          {/* Status filter */}
          <div>
            <label
              htmlFor="posts-status"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Status
            </label>

            <select
              id="posts-status"
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(event.target.value as PostStatusFilter)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            >
              <option value="all">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Platform filter */}
          <div>
            <label
              htmlFor="posts-platform"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Platform
            </label>

            <select
              id="posts-platform"
              value={platformFilter}
              onChange={(event) =>
                onPlatformFilterChange(event.target.value as PostPlatformFilter)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            >
              <option value="all">All platforms</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </div>
        </div>
      </div>

      {/* Post results */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  );
}
