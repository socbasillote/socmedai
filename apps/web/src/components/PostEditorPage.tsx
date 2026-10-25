import type { ReactNode } from "react";
import { ArrowLeft, ImagePlus, Video } from "lucide-react";

type PostEditorPageProps = {
  mode: "create" | "edit";
  onBack: () => void;
  children: ReactNode;
  preview?: ReactNode;
};

export function PostEditorPage({
  mode,
  onBack,
  children,
  preview,
}: PostEditorPageProps) {
  return (
    <div className="space-y-6">
      {/* Navigation and heading */}
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
          {mode === "create" ? "Create Post" : "Edit Post"}
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          {mode === "create"
            ? "Create content for your social media accounts."
            : "Update your content and publishing settings."}
        </p>
      </header>

      {/* Main editor layout */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Editor controls */}
        <section
          aria-label="Post editor"
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {children}
        </section>

        {/* Preview */}
        <aside
          aria-label="Post preview"
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6"
        >
          <h2 className="text-base font-bold text-slate-900">Post Preview</h2>

          <p className="mt-1 text-xs text-slate-500">
            Preview your content before publishing.
          </p>

          <div className="mt-5">
            {preview ?? (
              <div className="space-y-4">
                <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                  <div className="text-center text-slate-400">
                    <div className="mb-3 flex justify-center gap-3">
                      <ImagePlus size={24} />
                      <Video size={24} />
                    </div>

                    <p className="text-sm font-medium">No media attached</p>

                    <p className="mt-1 text-xs">
                      Images and videos will appear here.
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-400">
                  Your post preview will appear here.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
