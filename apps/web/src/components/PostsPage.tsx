import { Plus } from "lucide-react";
import type { ReactNode } from "react";

type PostStatusFilter = "all" | "draft" | "scheduled" | "published" | "failed";
type PostPlatformFilter = "all" | "facebook" | "instagram" | "linkedin";
type PostsPageProps = {
  search: string;
  statusFilter: PostStatusFilter;
  platformFilter: PostPlatformFilter;
  statusCounts: Record<string, number>;
  sort: "newest" | "oldest";
  onSortChange: (value: "newest" | "oldest") => void;
  onCreatePost: () => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: PostStatusFilter) => void;
  onPlatformFilterChange: (value: PostPlatformFilter) => void;
  children: ReactNode;
};
const filters = [
  ["all", "All"], ["published", "Published"], ["scheduled", "Scheduled"],
  ["draft", "Drafts"], ["failed", "Failed"],
] as const;
const control = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

export function PostsPage({ search, statusFilter, platformFilter, statusCounts, sort,
  onSortChange, onCreatePost, onSearchChange, onStatusFilterChange, onPlatformFilterChange, children,
}: PostsPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Posts</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your drafts, scheduled posts, and published content.</p>
        </div>
        <button onClick={onCreatePost} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700">
          <Plus size={18} aria-hidden="true" /> Create post
        </button>
      </div>
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter posts by status">
          {filters.map(([value, label]) => (
            <button key={value} aria-pressed={statusFilter === value} onClick={() => onStatusFilterChange(value)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${statusFilter === value ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {label}{" "}<span className="rounded-full bg-white/80 px-2 py-0.5 text-xs tabular-nums">{statusCounts[value] ?? "..."}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label htmlFor="posts-search" className="mb-2 block text-sm font-medium text-slate-700">Search posts</label>
            <input id="posts-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by caption or title..." className={control} />
          </div>
          <div>
            <label htmlFor="posts-platform" className="mb-2 block text-sm font-medium text-slate-700">Platform</label>
            <select id="posts-platform" value={platformFilter} onChange={(event) => onPlatformFilterChange(event.target.value as PostPlatformFilter)} className={control}>
              <option value="all">All platforms</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option>
            </select>
          </div>
          <div>
            <label htmlFor="posts-sort" className="mb-2 block text-sm font-medium text-slate-700">Sort</label>
            <select id="posts-sort" value={sort} onChange={(event) => onSortChange(event.target.value as "newest" | "oldest")} className={control}>
              <option value="newest">Recently updated</option><option value="oldest">Least recently updated</option>
            </select>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div>
    </div>
  );
}
