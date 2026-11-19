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

/** Presentation must not claim that an unowned or expired job is still running. */
export function imageGenerationPresentation(status: string,
  execution: { phase?: string; leaseExpiresAt?: Date | string } | undefined,
  admissionActive: boolean, now = Date.now()) {
  let state: "ready" | "failed" | "processing" | "action_required" = status === "ready" ? "ready" : status === "failed" ? "failed" : "processing";
  let message: string | undefined;
  const expiry = execution?.leaseExpiresAt ? new Date(execution.leaseExpiresAt).getTime() : NaN;
  const interrupted = ["provider_started", "storage_pending"].includes(execution?.phase ?? "") && Number.isFinite(expiry) && expiry <= now;
  if (status === "pending" && !admissionActive) {
    state = "action_required";
    message = "This old request is not in the active generation queue. Start a new generation to create an image.";
  } else if (status === "pending" && (interrupted || execution?.phase === "recovery_required")) {
    state = "action_required";
    message = "Generation was interrupted. The image worker must recover the existing result before this request can finish. Do not generate it again to retry.";
  }
  return {
    state,
    progress: state === "action_required"
      ? { stage: "needs_review", label: admissionActive ? "Generation interrupted" : "Request is not queued" }
      : imageGenerationProgress(status, execution?.phase),
    ...(message ? { message } : {}),
  };
}
