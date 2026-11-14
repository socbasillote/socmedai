import type { ReactNode } from "react";
import { ArrowLeft, ImagePlus, Video } from "lucide-react";

type PostEditorPageProps = {
  mode: "create" | "edit";
  onBack: () => void;
  children: ReactNode;
  sidebar?: ReactNode;
  preview?: ReactNode;
};

export function PostEditorPage({
  mode,
  onBack,
  children,
  sidebar,
  preview,
}: PostEditorPageProps) {
  return (
    <div className="space-y-6">
      <header>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-violet-700"
        >
          <ArrowLeft size={17} />
          Back to Posts
        </button>

        <h1 className="text-2xl font-bold text-slate-900">
          {mode === "create" ? "Content Publishing" : "Edit Post"}
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          {mode === "create"
            ? "Create, customize, and review your social media content."
            : "Update your draft and review its publishing requirements."}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <section
          aria-label="Post editor"
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        >
          {children}
        </section>

        {sidebar && (
          <aside
            aria-label="Publishing checklist"
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:sticky lg:top-6"
          >
            {sidebar}
          </aside>
        )}
      </div>

      <section
        aria-label="Platform previews"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <h2 className="text-base font-bold text-slate-900">
          Platform Previews
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          Review the content for your selected destinations. Previews are
          illustrative and may differ from the final social platform
          presentation.
        </p>

        <div className="mt-5">
          {preview ?? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="mb-3 flex gap-3 text-slate-400">
                <ImagePlus size={24} />
                <Video size={24} />
              </div>

              <p className="text-sm font-medium text-slate-600">
                No preview available
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Select a destination and enter post content to begin.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
