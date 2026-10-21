import { Plus } from "lucide-react";

type DashboardHeaderProps = {
  onCreatePost: () => void;
};

export function DashboardHeader({ onCreatePost }: DashboardHeaderProps) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-sm font-medium text-violet-600">
          Monday, October 12
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Good evening, creator <span aria-hidden="true">✦</span>
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
          Here's what's happening with your content today. Let's make something
          worth sharing.
        </p>
      </div>

      <button
        onClick={onCreatePost}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700"
      >
        <Plus size={18} />
        Create post
      </button>
    </div>
  );
}
