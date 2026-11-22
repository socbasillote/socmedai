import { useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { readAIReviewBatch } from "../lib/aiReviewBatch";

export function AIReviewResume({ workspaceId, onResume }: { workspaceId: string; onResume: () => void }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(user?.id && workspaceId ? readAIReviewBatch(user.id, workspaceId)?.posts.length ?? 0 : 0);
    update();
    window.addEventListener("storm:ai-review-changed", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("storm:ai-review-changed", update); window.removeEventListener("storage", update); };
  }, [user?.id, workspaceId]);
  if (!count) return null;
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-sm text-violet-900">{count} AI {count === 1 ? "post is" : "posts are"} waiting for your review in this browser.</p><button type="button" onClick={onResume} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Continue reviewing</button></div>;
}
