import { X } from "lucide-react";

type NoticeBannerProps = {
  message: string;
  onDismiss: () => void;
};

export function NoticeBanner({ message, onDismiss }: NoticeBannerProps) {
  return (
    <div
      role="status"
      className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900"
    >
      <span>{message}</span>
      <button
        aria-label="Dismiss message"
        onClick={onDismiss}
        className="rounded p-1 hover:bg-violet-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}
