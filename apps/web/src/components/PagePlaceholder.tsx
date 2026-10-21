import { LayoutDashboard, Sparkles } from "lucide-react";

type PagePlaceholderProps = {
  activePage: string;
  onReturnToOverview: () => void;
};

export function PagePlaceholder({
  activePage,
  onReturnToOverview,
}: PagePlaceholderProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Sparkles size={26} />
        </div>

        <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">
          {activePage === "Not found"
            ? "Page not found"
            : `${activePage} is coming soon`}
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          {activePage === "Not found"
            ? "This address does not match a Storm page."
            : "This section is part of the Storm workspace. Its features will be implemented in a later step."}
        </p>

        <button
          onClick={onReturnToOverview}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          <LayoutDashboard size={17} />
          Return to overview
        </button>
      </div>
    </section>
  );
}
