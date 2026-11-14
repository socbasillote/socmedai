import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Info,
  ShieldAlert,
} from "lucide-react";

import type {
  ChecklistItem,
  PublishingReadiness,
} from "../publishingReadiness";

type Props = {
  readiness: PublishingReadiness;
  blockers?: string[];
};

const statusLabels = {
  added: "Added",
  missing: "Missing",
  optional: "Optional",
  invalid: "Invalid",
} as const;

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const Icon =
    item.status === "added"
      ? CheckCircle2
      : item.status === "missing"
        ? AlertCircle
        : item.status === "invalid"
          ? ShieldAlert
          : Circle;

  const color =
    item.status === "added"
      ? "text-emerald-700"
      : item.status === "missing"
        ? "text-amber-700"
        : item.status === "invalid"
          ? "text-rose-700"
          : "text-slate-500";

  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon
        size={16}
        className={`mt-0.5 shrink-0 ${color}`}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-800">
            {item.label}
          </span>

          <span className={`text-xs font-semibold ${color}`}>
            {statusLabels[item.status]}
          </span>
        </div>

        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          {item.message}
        </p>
      </div>
    </li>
  );
}

export function PublishingChecklistPanel({ readiness, blockers = [] }: Props) {
  const ready = readiness.ready && blockers.length === 0;

  const actionName =
    readiness.action === "now"
      ? "Publish now"
      : readiness.action === "schedule"
        ? "Schedule post"
        : "Save draft";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            Publishing Checklist
          </h2>

          {ready ? (
            <CheckCircle2
              size={20}
              className="text-emerald-600"
              aria-label="Ready"
            />
          ) : (
            <AlertCircle
              size={20}
              className="text-amber-600"
              aria-label="Not ready"
            />
          )}
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Requirements for {actionName.toLowerCase()}.
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <p
          className="text-2xl font-bold text-slate-900"
          data-testid="publishing-ready-count"
        >
          {readiness.readyCount}/{readiness.totalCount}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Destinations passing individual checks
        </p>

        <p
          className={`mt-2 text-xs font-semibold ${
            ready ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {ready
            ? `Ready to ${actionName.toLowerCase()}`
            : "Action requirements not yet satisfied"}
        </p>
      </div>

      {readiness.destinations.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          Select a publishing destination to see its requirements.
        </div>
      )}

      <div className="space-y-4">
        {readiness.destinations.map((destination) => (
          <section
            key={destination.destinationId}
            aria-label={`${destination.platform} ${destination.accountName} checklist`}
            className="rounded-xl border border-slate-200 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold capitalize text-slate-900">
                  {destination.platform}
                </h3>

                <p className="mt-0.5 break-words text-xs text-slate-500">
                  {destination.accountName}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                  destination.ready
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {destination.ready ? "Ready" : "Needs attention"}
              </span>
            </div>

            <ul className="mt-3 divide-y divide-slate-100">
              {destination.items.map((item) => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {(readiness.issues.length > 0 || blockers.length > 0) && (
        <section
          aria-label="Publishing issues"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertCircle size={16} aria-hidden="true" />
            Before continuing
          </h3>

          <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-5 text-amber-900">
            {[...readiness.issues, ...blockers].map((issue, index) => (
              <li key={`${index}-${issue}`}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3">
        <Info
          size={16}
          className="mt-0.5 shrink-0 text-slate-500"
          aria-hidden="true"
        />

        <p className="text-xs leading-5 text-slate-600">
          This checklist is guidance for the current editor. The server
          independently validates each publishing request before execution.
        </p>
      </div>
    </div>
  );
}
