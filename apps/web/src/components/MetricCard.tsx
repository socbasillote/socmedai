import { Activity, CheckCircle2, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  change,
  detail,
  icon: Icon,
  iconClass,
  useSharedCard = false,
}: {
  title: string;
  value: string;
  change: string;
  detail: string;
  icon: typeof Activity;
  iconClass: string;
  useSharedCard?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon size={21} />
        </div>
        <button
          aria-label={`More information about ${title}`}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          title={detail}
        >
          <MoreHorizontal size={19} />
        </button>
      </div>

      <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-950">
          {value}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          {title === "Total published" || title === "Engagement rate" ? (
            <CheckCircle2 size={13} />
          ) : null}
          {change}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </>
  );

  const className =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-0 transition hover:-translate-y-0.5 hover:shadow-md";

  if (useSharedCard) {
    return <Card className={className}>{content}</Card>;
  }

  return <section className={className}>{content}</section>;
}
