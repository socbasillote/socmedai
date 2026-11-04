import { useState } from "react";
import { Link } from "react-router-dom";

import { CalendarDays, Clock3, FileText, List, Plus } from "lucide-react";

type PlannerView = "calendar" | "scheduled" | "all";

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

export function ContentPlannerPage() {
  const [view, setView] = useState<PlannerView>("calendar");

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

          <Link
            to="/posts"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <Plus size={17} />
            Manage Posts
          </Link>
        </header>

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
              <PlannerEmptyState
                icon={CalendarDays}
                title="Content Calendar"
                description={
                  "Your monthly and weekly publishing calendar will appear here."
                }
              />
            )}

            {view === "scheduled" && (
              <PlannerEmptyState
                icon={Clock3}
                title="Scheduled Posts"
                description={
                  "Review upcoming posts and publishing times in one place."
                }
              />
            )}

            {view === "all" && (
              <PlannerEmptyState
                icon={FileText}
                title="All Posts"
                description={
                  "Browse drafts, scheduled posts, published posts, and failures."
                }
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

type PlannerEmptyStateProps = {
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
