import { CalendarDays, FileText, Heart, Send } from "lucide-react";

import { MetricCard } from "./MetricCard";

type DashboardMetricsProps = {
  draftCount: number;
};

export function DashboardMetrics({ draftCount }: DashboardMetricsProps) {
  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        useSharedCard
        title="Total published"
        value="128"
        change="+12.8%"
        detail="vs. last month"
        icon={Send}
        iconClass="bg-violet-50 text-violet-600"
      />
      <MetricCard
        title="Scheduled posts"
        value="08"
        change="3 upcoming"
        detail="Next 7 days"
        icon={CalendarDays}
        iconClass="bg-blue-50 text-blue-600"
      />
      <MetricCard
        title="Drafts"
        value={String(draftCount).padStart(2, "0")}
        change="Keep creating"
        detail="Ready when you are"
        icon={FileText}
        iconClass="bg-amber-50 text-amber-600"
      />
      <MetricCard
        title="Engagement rate"
        value="4.82%"
        change="+0.6%"
        detail="vs. last month"
        icon={Heart}
        iconClass="bg-rose-50 text-rose-600"
      />
    </div>
  );
}
