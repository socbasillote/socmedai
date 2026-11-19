import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import type { ImageGenerationProgress as Progress } from "@/lib/imageGeneration";

const stages = ["queued", "preparing", "generating", "saving", "completed"] as const;
const labels = ["Queued", "Preparing", "Generating", "Saving", "Ready"];

export function ImageGenerationProgress({ progress, compact = false }: { progress?: Progress; compact?: boolean }) {
  const stage = progress?.stage ?? "queued";
  const current = stages.findIndex((item) => item === stage);
  const label = progress?.label ?? "Generation in progress.";
  return (
    <div role="status" aria-live="polite" className="w-full space-y-3 p-3 text-sm text-slate-700">
      <p className="font-medium">{label}</p>
      {!compact && current >= 0 && (
        <ol aria-label="Image generation progress" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {stages.map((item, index) => {
            const done = index < current || stage === "completed";
            const Icon = done ? CheckCircle2 : index === current ? LoaderCircle : Circle;
            return <li key={item} aria-current={index === current ? "step" : undefined}
              className={`flex items-center gap-1.5 ${index <= current ? "text-violet-700" : "text-slate-600"}`}>
              <Icon size={15} aria-hidden="true" className={index === current && !done ? "animate-spin" : ""} />
              {labels[index]}<span className="sr-only">{done ? ": complete" : index === current ? ": current" : ": pending"}</span>
            </li>;
          })}
        </ol>
      )}
    </div>
  );
}
