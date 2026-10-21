import { ChevronDown, TrendingUp } from "lucide-react";

const weeklyActivity = [
  { day: "Mon", height: 42 },
  { day: "Tue", height: 66 },
  { day: "Wed", height: 52 },
  { day: "Thu", height: 86 },
  { day: "Fri", height: 62 },
  { day: "Sat", height: 35 },
  { day: "Sun", height: 48 },
];

export function PublishingActivityCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Publishing activity
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Your weekly content overview
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          This week <ChevronDown size={14} />
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <span className="text-4xl font-bold tracking-tight text-slate-950">
          24
        </span>
        <span className="mb-1 flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
          <TrendingUp size={13} /> 18.4%
        </span>
        <span className="mb-1 text-xs text-slate-400">
          posts published this week
        </span>
      </div>

      <div
        className="flex h-48 items-end justify-between gap-3 border-b border-slate-100 pb-3"
        aria-label="Sample publishing activity bar chart"
      >
        {weeklyActivity.map((item, index) => (
          <div
            key={item.day}
            className="flex h-full flex-1 flex-col items-center justify-end gap-3"
          >
            <div className="flex h-full w-full items-end justify-center">
              <div
                className={`w-full max-w-12 rounded-t-lg transition hover:opacity-75 ${
                  index === 3 ? "bg-violet-600" : "bg-violet-100"
                }`}
                style={{ height: `${item.height}%` }}
                title={`${item.day}: sample activity`}
              />
            </div>
            <span
              className={`text-xs ${
                index === 3 ? "font-bold text-violet-700" : "text-slate-400"
              }`}
            >
              {item.day}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Illustrative activity data. Analytics will be connected later.
      </p>
    </section>
  );
}
