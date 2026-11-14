import type { PublishingReadiness } from "../publishingReadiness";

type PostMode = "draft" | "scheduled" | "immediate";

type Props = {
  editorMode: "create" | "edit";
  postMode: PostMode;
  scheduledAt: string;
  minScheduledAt: string;
  saving: boolean;
  locked: boolean;
  readiness: PublishingReadiness;
  blockers: string[];
  formId: string;
  onPostModeChange: (mode: PostMode) => void;
  onScheduledAtChange: (value: string) => void;
  onCancel: () => void;
};

const modes: {
  id: PostMode;
  label: string;
}[] = [
  { id: "draft", label: "Draft" },
  { id: "immediate", label: "Now" },
  { id: "scheduled", label: "Schedule" },
];

export function PublishingControls({
  editorMode,
  postMode,
  scheduledAt,
  minScheduledAt,
  saving,
  locked,
  readiness,
  blockers,
  formId,
  onPostModeChange,
  onScheduledAtChange,
  onCancel,
}: Props) {
  const requiresExecution = postMode !== "draft";

  const actionBlocked =
    requiresExecution && (!readiness.ready || blockers.length > 0);

  const disabled = saving || locked;

  const buttonLabel = saving
    ? postMode === "immediate"
      ? "Publishing..."
      : "Saving..."
    : locked
      ? "Publishing Attempt Completed"
      : postMode === "immediate"
        ? "Review & Publish"
        : postMode === "scheduled"
          ? "Schedule Post"
          : editorMode === "edit"
            ? "Save Changes"
            : "Save Draft";

  const issue = actionBlocked
    ? ([...readiness.issues, ...blockers][0] ??
      "Publishing requirements are incomplete.")
    : null;

  return (
    <section
      aria-label="Publishing controls"
      className="space-y-4 border-t border-slate-200 pt-5"
    >
      <div>
        <h2 className="text-base font-bold text-slate-900">
          Publishing Options
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          Save your content or choose when to publish.
        </p>
      </div>

      <fieldset disabled={disabled}>
        <legend className="sr-only">Publishing mode</legend>

        <div className="grid grid-cols-3 gap-2">
          {modes.map((mode) => {
            const active = postMode === mode.id;

            const unsupportedEditSchedule =
              editorMode === "edit" && mode.id === "scheduled";

            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                disabled={disabled || unsupportedEditSchedule}
                onClick={() => onPostModeChange(mode.id)}
                title={
                  unsupportedEditSchedule
                    ? "Scheduling existing drafts is not supported yet."
                    : undefined
                }
                className={[
                  "rounded-xl border px-2 py-3",
                  "text-xs font-semibold transition",
                  "disabled:cursor-not-allowed",
                  "disabled:opacity-50",
                  active
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {postMode === "scheduled" && (
        <div className="space-y-2">
          <label
            htmlFor="publishing-scheduled-at"
            className="block text-sm font-semibold text-slate-700"
          >
            Publishing date and time
          </label>

          <input
            id="publishing-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            min={minScheduledAt}
            disabled={disabled}
            required
            onChange={(event) => onScheduledAtChange(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:opacity-50"
          />

          <p className="text-xs text-slate-500">
            Times are entered in your local time zone.
          </p>
        </div>
      )}

      {issue && (
        <p
          id="publishing-action-issue"
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
        >
          {issue}
        </p>
      )}

      <div className="space-y-2">
        <button
          type="submit"
          form={formId}
          disabled={disabled || actionBlocked}
          aria-describedby={issue ? "publishing-action-issue" : undefined}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {postMode === "immediate" && (
        <p className="text-xs leading-5 text-slate-500">
          Publishing requires confirmation before Storm submits the post.
        </p>
      )}
    </section>
  );
}
