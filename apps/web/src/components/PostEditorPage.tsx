import type { ReactNode } from "react";
import { ArrowLeft, Eye } from "lucide-react";

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
          {mode === "create" ? "Create a post" : "Edit Post"}
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          {mode === "create"
            ? "Turn an idea into your next post. Write, preview, and publish in one place."
            : "Update your draft and review its publishing requirements."}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Post editor" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {children}
        </section>
        <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
          {sidebar && <aside aria-label="Publishing checklist" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{sidebar}</aside>}
          <section aria-label="Platform previews" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Eye size={16} className="text-violet-500" aria-hidden="true" />Live preview</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Updates as you type</span>
            </div>
            <div className="p-4">{preview ?? <p className="py-8 text-center text-sm text-slate-400">Start writing to preview your post.</p>}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
