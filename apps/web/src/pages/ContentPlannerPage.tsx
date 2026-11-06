import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { CalendarDays, Clock3, List, Plus } from "lucide-react";

import { useContentPlanner } from "@/features/content-planner/hooks/useContentPlanner";

import { CalendarMonthView } from "@/features/content-planner/components/CalendarMonthView";
import { PlannerPostListView } from "@/features/content-planner/components/PlannerPostListView";

import type { Post } from "@/lib/posts";

import { PostDetailsModal } from "@/components/PostDetailsModal";

import {
  buildPlannerCreatePostUrl,
  parsePlannerMonth,
} from "@/features/content-planner/utils/plannerNavigation";

type PlannerView = "calendar" | "scheduled" | "all";

type ContentPlannerPageProps = {
  workspaceId: string;
};

const plannerViews: {
  id: PlannerView;
  label: string;
  icon: typeof CalendarDays;
}[] = [
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
  },
  {
    id: "scheduled",
    label: "Scheduled",
    icon: Clock3,
  },
  {
    id: "all",
    label: "All Posts",
    icon: List,
  },
];

export function ContentPlannerPage({ workspaceId }: ContentPlannerPageProps) {
  const [view, setView] = useState<PlannerView>("calendar");

  const location = useLocation();

  const initialMonth = parsePlannerMonth(
    new URLSearchParams(location.search).get("month"),
  );

  const planner = useContentPlanner(workspaceId, initialMonth);
  const navigate = useNavigate();

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  useEffect(() => {
    setSelectedPost(null);
  }, [workspaceId]);

  const visibleSelectedPost =
    selectedPost?.workspaceId === workspaceId ? selectedPost : null;

  const plannerMonth = {
    year: planner.year,
    monthIndex: planner.monthIndex,
  };

  function handleCreateForDate(dateKey: string) {
    navigate(buildPlannerCreatePostUrl(plannerMonth, dateKey));
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
              <CalendarDays size={24} />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Content Planner
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Plan, organize, and manage your social content.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/posts"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Manage Posts
            </Link>

            <Link
              to={buildPlannerCreatePostUrl(plannerMonth)}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              <Plus size={17} />
              Create Post
            </Link>
          </div>
        </header>

        {!workspaceId && (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            Select a workspace to view its content calendar.
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div
            role="tablist"
            aria-label="Content planner views"
            className="flex flex-wrap gap-2 border-b border-slate-200 pb-4"
          >
            {plannerViews.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`planner-tab-${item.id}`}
                  aria-selected={active}
                  aria-controls={`planner-panel-${item.id}`}
                  onClick={() => setView(item.id)}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl",
                    "px-4 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-violet-100 text-violet-700"
                      : "text-slate-600 hover:bg-slate-100",
                  ].join(" ")}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`planner-panel-${view}`}
            aria-labelledby={`planner-tab-${view}`}
            className="min-h-[360px] py-8"
          >
            {view === "calendar" && (
              <CalendarMonthView
                year={planner.year}
                monthIndex={planner.monthIndex}
                posts={planner.posts}
                loading={planner.loading}
                error={planner.error}
                onPreviousMonth={planner.goToPreviousMonth}
                onNextMonth={planner.goToNextMonth}
                onToday={planner.goToCurrentMonth}
                onRetry={planner.refreshCalendar}
                onViewPost={setSelectedPost}
                onCreateForDate={handleCreateForDate}
              />
            )}

            {view === "scheduled" && (
              <PlannerPostListView
                key={`${workspaceId}:scheduled`}
                workspaceId={workspaceId}
                mode="scheduled"
                onViewPost={setSelectedPost}
              />
            )}

            {view === "all" && (
              <PlannerPostListView
                key={`${workspaceId}:all`}
                workspaceId={workspaceId}
                mode="all"
                onViewPost={setSelectedPost}
              />
            )}
          </div>
        </section>
        {visibleSelectedPost && (
          <PostDetailsModal
            post={visibleSelectedPost}
            onClose={() => setSelectedPost(null)}
          />
        )}
      </div>
    </main>
  );
}

/* type PlannerEmptyStateProps = {
  icon: typeof CalendarDays;
  title: string;
  description: string;
};

function PlannerEmptyState({
  icon: Icon,
  title,
  description,
}: PlannerEmptyStateProps) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl bg-slate-100 p-4 text-slate-500">
        <Icon size={28} />
      </div>

      <h2 className="mt-4 text-lg font-semibold">{title}</h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>

      <p className="mt-4 text-xs text-slate-400">
        Workspace post integration is coming next.
      </p>
    </div>
  );
}
 */
