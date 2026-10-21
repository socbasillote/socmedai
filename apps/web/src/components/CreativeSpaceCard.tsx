import { ArrowRight, Image, MessageCircle, Sparkles } from "lucide-react";

type CreativeSpaceCardProps = {
  onOpenStudio: () => void;
};
export function CreativeSpaceCard({ onOpenStudio }: CreativeSpaceCardProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 via-violet-600 to-indigo-600 p-6 text-white shadow-lg shadow-violet-600/10">
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border border-white/10" />
      <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full border border-white/10" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium">
          <Sparkles size={14} /> Your creative space
        </span>
        <h3 className="mt-6 max-w-xs text-2xl font-bold leading-tight">
          Great content starts with one idea.
        </h3>
        <p className="mt-3 max-w-sm text-sm leading-6 text-violet-100">
          Turn your ideas into on-brand visuals and content for your social
          channels.
        </p>

        <button
          onClick={onOpenStudio}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
        >
          Open content studio <ArrowRight size={16} />
        </button>
      </div>

      <div className="relative mt-8 grid grid-cols-3 gap-2">
        <div className="flex h-20 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Image size={27} />
        </div>
        <div className="flex h-20 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Sparkles size={27} />
        </div>
        <div className="flex h-20 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <MessageCircle size={27} />
        </div>
      </div>
    </section>
  );
}

export default CreativeSpaceCard;
