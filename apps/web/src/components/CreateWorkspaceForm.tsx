import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type CreateWorkspaceFormProps = {
  name: string;
  creating: boolean;
  error: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function CreateWorkspaceForm({
  name,
  creating,
  error,
  onNameChange,
  onSubmit,
  onCancel,
}: CreateWorkspaceFormProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workspace-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="create-workspace-title"
              className="text-xl font-bold text-slate-950"
            >
              Create a workspace
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a separate space for a brand, client, or team.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close dialog"
            disabled={creating}
            onClick={onCancel}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label
            htmlFor="workspace-name"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Workspace name
          </label>

          <input
            id="workspace-name"
            autoFocus
            maxLength={100}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="e.g. Acme Marketing"
            disabled={creating}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
          />

          {error && (
            <p role="alert" className="mt-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={onCancel}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={creating}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              {creating ? "Creating..." : "Create workspace"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
