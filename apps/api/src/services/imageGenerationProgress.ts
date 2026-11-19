export function imageGenerationProgress(status: string, phase?: string) {
  if (status === "ready") return { stage: "completed", label: "Image ready" };
  if (status === "failed") return { stage: "failed", label: "Generation failed" };
  const stages: Record<string, { stage: string; label: string }> = {
    reserved: { stage: "queued", label: "Queued for generation" },
    claimed: { stage: "preparing", label: "Preparing your image" },
    provider_started: { stage: "generating", label: "Generating your image" },
    storage_pending: { stage: "saving", label: "Saving your image" },
    recovery_required: { stage: "needs_review", label: "Recovery needs review" },
  };
  return stages[phase ?? "reserved"] ?? stages.reserved;
}
