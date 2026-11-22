import { z } from "zod";
import type { Reference, ReviewPost } from "@/components/AIPostFlow";
import type { CaptionTone } from "@/lib/aiContent";
import type { PostPlatform } from "@/lib/posts";
import { postGoals } from "@/lib/postGoals";

export type AIReviewBatch = {
  version: 1;
  posts: ReviewPost[];
  setup: {
    targets: PostPlatform[]; bulk: boolean; brief: string; tone: CaptionTone;
    goal: ReviewPost["goal"]; mix: boolean; cta: string; captions: boolean;
    images: boolean; count: number; style: string; refs: Reference[];
    schedule: boolean; date: string; time: string; frequency: string;
  };
};
const platform = z.enum(["facebook", "instagram", "linkedin"]);
const input = z.object({ workspaceId: z.string(), clientDraftId: z.string(), caption: z.string(), platforms: z.array(platform) }).passthrough();
const command = z.object({ idempotencyKey: z.string(), image: z.object({ prompt: z.string(), aspectRatio: z.enum(["square", "portrait", "landscape"]) }).passthrough() });
const schema = z.object({
  version: z.literal(1),
  posts: z.array(z.object({
    sharedContent: z.boolean().optional(),
    id: z.string(), goal: z.string(), selected: z.boolean(), busy: z.boolean(), scheduledAt: z.string().optional(), scheduleError: z.string().optional(),
    variants: z.array(z.object({
      platform, caption: z.string(), clientDraftId: z.string(), assetId: z.string().optional(),
      originalAssetId: z.string().optional(),
      autoCropPending: z.boolean().optional(), cropError: z.string().optional(),
      crop: z.object({ format: z.enum(["square", "portrait", "landscape"]), x: z.number().min(0).max(100), y: z.number().min(0).max(100), zoom: z.number().min(1).max(3) }).optional(),
      pendingImage: command.optional(), imagePending: z.boolean().optional(), pendingInput: input.optional(),
      enabled: z.boolean().optional(), saved: z.boolean().optional(), error: z.string().optional(), captionError: z.string().optional(), extraAssetIds: z.array(z.string()).optional(),
    })).min(1).max(3),
  })).max(20),
  setup: z.object({
    targets: z.array(platform), bulk: z.boolean(), brief: z.string(),
    tone: z.enum(["professional", "friendly", "bold", "educational", "playful", "inspirational"]), goal: z.string(), mix: z.boolean(), cta: z.string(), captions: z.boolean(), images: z.boolean(), count: z.number().int().min(1).max(20), style: z.string(),
    refs: z.array(z.object({ thumbnail: z.string(), id: z.string(), assetId: z.string(), name: z.string(), usage: z.enum(["include", "style"]), useIn: z.enum(["every", "choose"]) })).max(20),
    schedule: z.boolean(), date: z.string(), time: z.string(), frequency: z.string(),
  }),
});
const key = (ownerId: string, workspaceId: string) => `storm:ai-review:v1:${ownerId}:${workspaceId}`;
export function readAIReviewBatch(ownerId: string, workspaceId: string): AIReviewBatch | null {
  try {
    const raw = localStorage.getItem(key(ownerId, workspaceId));
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    // Signed URLs are refreshed on opening. Never persist access URLs.
    const batch = parsed.data;
    if ((batch.setup.goal && !postGoals.some(g => g.id === batch.setup.goal)) || batch.posts.some(p => p.goal && !postGoals.some(g => g.id === p.goal))) return null;
    if (batch.posts.some(p => p.variants.some(v => v.pendingInput && (v.pendingInput.workspaceId !== workspaceId || v.pendingInput.clientDraftId !== v.clientDraftId)))) return null;
    return { ...batch, posts: batch.posts.filter(p => !p.variants.every(v => v.saved || v.enabled === false)) as ReviewPost[], setup: { ...batch.setup, refs: batch.setup.refs.map(r => ({ ...r, url: "" })) } } as AIReviewBatch;
  } catch { return null; }
}
export function writeAIReviewBatch(ownerId: string, workspaceId: string, batch: AIReviewBatch): boolean {
  try {
    if (!batch.posts.length) localStorage.removeItem(key(ownerId, workspaceId));
    else localStorage.setItem(key(ownerId, workspaceId), JSON.stringify(batch, (name, value) => name === "url" ? undefined : value));
    window.dispatchEvent(new Event("storm:ai-review-changed"));
    return true;
  } catch { return false; }
}
