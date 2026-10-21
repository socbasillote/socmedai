import { ArrowUpRight } from "lucide-react";

export type PostStatusFilter =
  | "all"
  | "draft"
  | "scheduled"
  | "published"
  | "failed";

export type PostPlatformFilter = "all" | "facebook" | "instagram" | "linkedin";

type RecentPostsHeaderProps = {
  statusFilter: PostStatusFilter;
  setStatusFilter: (value: PostStatusFilter) => void;
  platformFilter: PostPlatformFilter;
  setPlatformFilter: (value: PostPlatformFilter) => void;
  onViewPublishing: () => void;
};

export function RecentPostsHeader({
  statusFilter,
  setStatusFilter,
  platformFilter,
  setPlatformFilter,
  onViewPublishing,
}: RecentPostsHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
      <div>
        <h3 className="text-base font-bold text-slate-900">Recent posts</h3>
        <p className="mt-1 text-sm text-slate-500">
          Keep track of your latest content
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter posts by status"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as PostStatusFilter)
          }
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-400"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
        </select>

        <select
          aria-label="Filter posts by platform"
          value={platformFilter}
          onChange={(event) =>
            setPlatformFilter(event.target.value as PostPlatformFilter)
          }
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-400"
        >
          <option value="all">All platforms</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </div>

      <button
        type="button"
        onClick={onViewPublishing}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-violet-600 hover:bg-violet-50"
      >
        View publishing <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
