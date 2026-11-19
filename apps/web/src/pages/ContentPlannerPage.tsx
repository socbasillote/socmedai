import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { CalendarDays, Columns3, List, Plus } from "lucide-react";

import { useContentPlanner } from "@/features/content-planner/hooks/useContentPlanner";

import { CalendarMonthView } from "@/features/content-planner/components/CalendarMonthView";

import type { Post } from "@/lib/posts";

import { PostDetailsModal } from "@/components/PostDetailsModal";

import {
  buildPlannerCreatePostUrl,
  parsePlannerMonth,
} from "@/features/content-planner/utils/plannerNavigation";

type PlannerView = "month" | "week" | "list";

type ContentPlannerPageProps = {
  workspaceId: string;
};

const plannerViews: {
  id: PlannerView;
  label: string;
  icon: typeof CalendarDays;
}[] = [
  {
    id: "month",
    label: "Month",
    icon: CalendarDays,
  },
  {
    id: "week",
    label: "Week",
    icon: Columns3,
  },
  {
    id: "list",
    label: "List",
    icon: List,
  },
];

export function ContentPlannerPage({ workspaceId }: ContentPlannerPageProps) {
  return <ContentPlannerWorkspace key={workspaceId} workspaceId={workspaceId} />;
}

function ContentPlannerWorkspace({ workspaceId }: ContentPlannerPageProps) {
  const [view, setView] = useState<PlannerView>("month");

  const location = useLocation();

  const initialMonth = parsePlannerMonth(
    new URLSearchParams(location.search).get("month"),
  );

  const planner = useContentPlanner(workspaceId, initialMonth, view);
  const navigate = useNavigate();

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

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

              <p className="mt-1 text-sm text-slate-600">
                Plan, organize, and manage your social content.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/posts"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Manage Posts
            </Link>

            <Link
              to={buildPlannerCreatePostUrl(plannerMonth)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
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
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(event) => {
                    const index = plannerViews.findIndex((item) => item.id === view);
                    const nextIndex = event.key === "ArrowRight" ? (index + 1) % plannerViews.length
                      : event.key === "ArrowLeft" ? (index + plannerViews.length - 1) % plannerViews.length
                      : event.key === "Home" ? 0 : event.key === "End" ? plannerViews.length - 1 : null;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    const next = plannerViews[nextIndex].id;
                    setView(next);
                    document.getElementById(`planner-tab-${next}`)?.focus();
                  }}
                  aria-controls={`planner-panel-${item.id}`}
                  onClick={() => setView(item.id)}
                  className={[
                    "inline-flex min-h-11 items-center gap-2 rounded-xl",
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
            className="min-h-[360px] pt-5"
          >
            <CalendarMonthView
              key={`${workspaceId}:${view}:${planner.range.start}`}
              view={view}
              weekAnchor={planner.weekAnchor}
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
