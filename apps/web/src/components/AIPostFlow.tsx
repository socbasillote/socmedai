import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Sparkles, ImageIcon, Plus, Minus } from "lucide-react";
import { postGoals, type PostGoal } from "@/lib/postGoals";
import { generateCaption, type CaptionTone } from "@/lib/aiContent";
import { createPost, validatePostBatch, type CreatePostInput, type PostPlatform } from "@/lib/posts";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { postSchedulingError } from "@/lib/postScheduling";
import { apiFetch, ApiError } from "@/lib/api";
import { generateWorkspaceImage, getWorkspaceImageStatus, getWorkspaceImageUrl, uploadWorkspaceImageReference } from "@/lib/imageGeneration";
import { MediaLibraryPicker } from "@/features/publishing/components/MediaLibraryPicker";
import { parseZonedInput, zonedInputValue, type WorkspacePreferences } from "@/lib/workspaceSettings";

type Reference = { thumbnail: string; id: string; assetId: string; url: string; name: string; usage: "include" | "style"; useIn: "every" | "choose" };
type Variant = { pendingInput?: CreatePostInput; enabled?: boolean; captionError?: string; extraAssetIds?: string[]; platform: PostPlatform; caption: string; assetId?: string; url?: string; error?: string; saved?: boolean; clientDraftId: string };
type ReviewPost = { scheduleError?: string; id: string; goal: PostGoal; selected: boolean; scheduledAt?: string; variants: Variant[]; busy: boolean };
type Props = { workspaceId: string; timezone: string; onBack: () => void; connections: Partial<Record<PostPlatform, string>>; destinations: ReactNode; headerActions?: ReactNode; scheduleCapabilities?: Record<string, { schedule: boolean }>; publishingRules?: WorkspacePreferences["publishing"]; disabled?: boolean };
const platforms: PostPlatform[] = ["facebook", "instagram", "linkedin"];
const button = "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:border-violet-400 disabled:opacity-40 disabled:cursor-not-allowed";
const primary = "rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed";
const field = "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-500";
function Pills({ values, value, onChange }: { values: readonly string[]; value: string; onChange: (v: string) => void }) {
  return <div className="flex flex-wrap gap-2">{values.map(v => <button type="button" key={v} aria-pressed={value === v} className={`${button} ${value === v ? "border-violet-500 bg-violet-50 text-violet-700" : "text-slate-600"}`} onClick={() => onChange(v)}>{v}</button>)}</div>;
}
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="flex items-center gap-3 font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-sm text-violet-700">{n}</span>{title}</h2>{children}</section>;
}
export function AIPostFlow({ workspaceId, timezone, onBack, connections, destinations, headerActions, scheduleCapabilities, publishingRules, disabled }: Props) {
  const [targets, setTargets] = useState<PostPlatform[]>(["facebook"]);
  const [bulk, setBulk] = useState(false);
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState<CaptionTone>("friendly");
  const [goal, setGoal] = useState<PostGoal>("engagement");
  const [mix, setMix] = useState(false);
  const [cta, setCta] = useState("Ask a question");
  const [captions, setCaptions] = useState(true);
  const [images, setImages] = useState(true);
  const [count, setCount] = useState(3);
  const [style, setStyle] = useState("Photo");
  const [refs, setRefs] = useState<Reference[]>([]);
  const [library, setLibrary] = useState<string | null>(null);
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [frequency, setFrequency] = useState("1");
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [review, setReview] = useState(false);
  const [filter, setFilter] = useState("All");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const total = bulk ? count : 1;
  const selectedGoal = postGoals.find(g => g.id === goal)!;
  const contentReady = (p: ReviewPost) => !p.busy && p.variants.some(v => v.enabled !== false) && p.variants.filter(v => v.enabled !== false).every(v => !v.error && v.caption.trim() && v.caption.length <= (v.platform === "instagram" ? 2200 : v.platform === "linkedin" ? 3000 : 5000) && (v.platform !== "instagram" || v.assetId));
  const scheduleProblem = (p: ReviewPost) => p.scheduleError ?? postSchedulingError(p.scheduledAt, timezone, publishingRules);
  const ready = (p: ReviewPost) => contentReady(p) && !scheduleProblem(p);
  const selected = posts.filter(p => p.selected && contentReady(p));
  function patch(id: string, change: Partial<ReviewPost>) { if (live.current) setPosts(ps => ps.map(p => p.id === id ? { ...p, ...change } : p)); }
  function variantPatch(id: string, platform: PostPlatform, change: Partial<Variant>) {
    setPosts(ps => ps.map(p => p.id === id ? { ...p, variants: p.variants.map(v => v.platform === platform ? { ...v, ...change } : v) } : p));
  }
  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose a JPG, PNG, or WebP image up to 10 MB.");
    return apiFetch<{ assetId: string }>(`/api/ai/workspaces/${workspaceId}/upload-post-image`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  }
  async function addReference(assetId: string, name: string) {
    const item = await getMediaLibraryItem(assetId);
    const url = item.previewUrl ?? (await getWorkspaceImageUrl(item.sourceWorkspaceId, assetId)).url;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load the reference image.");
    const blob = await response.blob();
    if (refs.length >= 20) throw new Error("Use up to 20 reference images.");
    const ref = await uploadWorkspaceImageReference(workspaceId, new File([blob], name, { type: blob.type }));
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 96; canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); throw new Error("Could not prepare the reference preview."); }
    context.drawImage(bitmap, 0, 0, 96, 96); bitmap.close();
    const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
    if (live.current) setRefs(rs => [...rs, { thumbnail, id: ref.referenceId, assetId, url, name, usage: "include", useIn: "every" }]);
  }
  async function handleUpload(file: File | undefined, postId?: string, platform?: PostPlatform) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      if (!postId && refs.length >= 20) throw new Error("Use up to 20 reference images.");
      const { assetId } = await upload(file);
      if (postId && platform) {
        const { url } = await getWorkspaceImageUrl(workspaceId, assetId);
        if (live.current) variantPatch(postId, platform, { assetId, url, error: posts.find(p => p.id === postId)?.variants.find(v => v.platform === platform)?.captionError });
      } else await addReference(assetId, file.name);
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { if (live.current) setBusy(false); }
  }
  async function imageFor(platform: PostPlatform, assignedGoal: PostGoal, reference?: Reference) {
    if (reference?.usage === "include") return { assetId: reference.assetId, url: reference.url };
    if (!images) return {};
    const goalName = postGoals.find(g => g.id === assignedGoal)!.name;
    const submitted = await generateWorkspaceImage(workspaceId, { idempotencyKey: crypto.randomUUID(), image: {
      goal: assignedGoal,
      prompt: `${style} social media image for ${platform}. Goal: ${goalName}. ${brief}`.slice(0, 2400),
      aspectRatio: platform === "linkedin" ? "landscape" : platform === "instagram" ? "portrait" : "square",
      ...(reference ? { reference: { id: reference.id, usage: "inspiration" as const } } : {}),
    } });
    for (let i = 0; i < 180; i++) {
      if (!live.current) throw new Error("Generation canceled.");
      const status = await getWorkspaceImageStatus(workspaceId, submitted.assetId);
      if (status.state === "failed" || status.state === "action_required") throw new Error(status.message || "Image generation failed.");
      if (status.status === "ready") return { assetId: submitted.assetId, url: (await getWorkspaceImageUrl(workspaceId, submitted.assetId)).url };
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Image generation timed out. Try again.");
  }
  async function generateOne(post: ReviewPost, index: number, imageOnly = false) {
    patch(post.id, { busy: true, selected: false });
    const variants: Variant[] = [];
    let applicable = refs.filter(r => r.useIn === "every");
    try {
      const optional = refs.filter(r => r.useIn === "choose");
      if (optional.length) {
        const result = await apiFetch<{ ids: string[] }>("/api/ai/select-post-references", { method: "POST", body: JSON.stringify({ brief, goal: post.goal, index, references: optional.map(r => ({ id: r.id, name: r.name.slice(0, 255), thumbnail: r.thumbnail })) }) });
        applicable = [...applicable, ...optional.filter(r => result.ids.includes(r.id))];
      }
    } catch (e) {
      patch(post.id, { busy: false, selected: false, variants: post.variants.map(v => ({ ...v, error: e instanceof Error ? e.message : "Reference selection failed." })) });
      return;
    }
    const styles = applicable.filter(r => r.usage === "style");
    let styleReference = styles[0];
    if (images && styles.length > 1 && !applicable.some(r => r.usage === "include")) {
      try {
        const canvas = document.createElement("canvas");
        const columns = Math.ceil(Math.sqrt(styles.length));
        canvas.width = columns * 256; canvas.height = Math.ceil(styles.length / columns) * 256;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare the style references.");
        for (let i = 0; i < styles.length; i++) {
          const response = await fetch(styles[i].url);
          if (!response.ok) throw new Error("Could not load a style reference.");
          const bitmap = await createImageBitmap(await response.blob());
          context.drawImage(bitmap, i % columns * 256, Math.floor(i / columns) * 256, 256, 256); bitmap.close();
        }
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not prepare style references.")), "image/png"));
        const board = await uploadWorkspaceImageReference(workspaceId, new File([blob], "style-board.png", { type: "image/png" }));
        styleReference = { ...styles[0], id: board.referenceId };
      } catch (e) {
        patch(post.id, { busy: false, selected: false, variants: post.variants.map(v => ({ ...v, error: e instanceof Error ? e.message : "Style references failed." })) });
        return;
      }
    }
    for (const old of post.variants) {
      const variant: Variant = { ...old, error: undefined, captionError: undefined };
      try {
        if (captions && !imageOnly) variant.caption = await generateCaption({ brief: `${brief}\nCreate a distinct angle for post ${index + 1} of ${total}.`, goal: post.goal, platform: old.platform, tone, audience: "General audience", callToAction: cta === "None" ? "Do not include a call to action." : cta, length: old.platform === "instagram" ? "short" : "medium" });
      } catch (e) { variant.captionError = e instanceof Error ? e.message : "Caption generation failed."; variant.error = variant.captionError; }
      try {
        const included = applicable.filter(r => r.usage === "include");
        if (old.platform === "instagram" && included.length > 1) throw new Error("Instagram supports one image per post. Keep one included reference or use style-only references.");
        const reference = included[0] ?? styleReference;
        Object.assign(variant, await imageFor(old.platform, post.goal, reference));
        variant.extraAssetIds = included.slice(1).map(r => r.assetId);
      } catch (e) { variant.error = `${variant.error ? variant.error + " " : ""}Image: ${e instanceof Error ? e.message : "Generation failed."}`; }
      variants.push(variant);
    }
    const next = { ...post, variants, busy: false };
    patch(post.id, { variants, busy: false, selected: ready(next) });
  }
  function scheduleFor(index: number) {
    const day = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(day.getTime())) throw new Error("Choose a start date.");
    day.setUTCDate(day.getUTCDate() + index * Number(frequency));
    const value = parseZonedInput(`${day.toISOString().slice(0, 10)}T${time}`, timezone);
    if (!value || value.getTime() <= Date.now()) throw new Error("Choose a valid future date and time.");
    return value.toISOString();
  }
  async function generate() {
    setError(""); setNotice("");
    try {
      if (!brief.trim() || brief.trim().length < 3 || !targets.length || (!captions && !images)) throw new Error("Choose platforms, enter a brief, and enable captions or images.");
      const next: ReviewPost[] = Array.from({ length: total }, (_, i) => ({ id: crypto.randomUUID(), goal: mix && bulk ? postGoals[(postGoals.findIndex(g => g.id === goal) + i) % postGoals.length].id : goal, selected: false, busy: true, scheduledAt: schedule ? scheduleFor(i) : undefined, variants: targets.map(platform => ({ platform, caption: "", clientDraftId: crypto.randomUUID() })) }));
      setPosts(next); setReview(true); setBusy(true);
      for (let i = 0; i < next.length && live.current; i++) await generateOne(next[i], i);
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "Generation failed."); }
    finally { if (live.current) setBusy(false); }
  }
  async function save(asSchedule: boolean) {
    setError(""); setNotice(""); setBusy(true);
    let saved = 0;
    try {
      if (disabled) throw new Error("This workspace is archived.");
      const requests = selected.flatMap(post => post.variants.filter(v => v.enabled !== false && !v.saved).map(variant => {
        // An uncertain request must be retried with its original payload and key.
        if (variant.pendingInput && Boolean(variant.pendingInput.scheduledAt) !== asSchedule) throw new Error("Retry the previous save for this post before choosing a different action.");
        const input: CreatePostInput = variant.pendingInput ?? {
          workspaceId, clientDraftId: variant.clientDraftId, caption: variant.caption,
          title: postGoals.find(g => g.id === post.goal)!.name,
          mediaIds: variant.assetId ? [...new Set([variant.assetId, ...(variant.extraAssetIds ?? [])])] : [],
          platforms: [variant.platform],
          platformConnections: connections[variant.platform] ? { [variant.platform]: connections[variant.platform] } : undefined,
          ...(asSchedule ? { scheduledAt: post.scheduledAt } : {}),
        };
        if (asSchedule && !variant.pendingInput) {
          if (!input.scheduledAt) throw new Error("Choose a publishing date and time for every selected post.");
          const issue = postSchedulingError(input.scheduledAt, timezone, publishingRules);
          if (issue) throw new Error(issue);
          if (scheduleCapabilities && !scheduleCapabilities[variant.platform]?.schedule) throw new Error("Scheduled publishing is unavailable for a selected platform.");
          if ((input.mediaIds?.length ?? 0) > 1) throw new Error("Scheduled publishing supports one image per platform post.");
          if (!connections[variant.platform]) throw new Error("Choose a connected account for every selected platform.");
        }
        return { post, variant, input };
      }));
      // The server rechecks current workspace rules, connections, and media for
      // every request. No create request starts if any selected version is invalid.
      const validation = await validatePostBatch(requests.map(request => request.input));
      if (!live.current) return;
      if (validation.issues.length) {
        for (const issue of validation.issues) {
          const request = requests[issue.index];
          if (request) {
            patch(request.post.id, { scheduleError: asSchedule ? issue.message : undefined });
            variantPatch(request.post.id, request.variant.platform, { pendingInput: undefined });
          }
        }
        throw new Error(validation.issues[0].message);
      }
      for (const { post, variant, input } of requests) {
        if (!live.current) return;
        variantPatch(post.id, variant.platform, { pendingInput: input });
        try {
          await createPost(input);
        } catch (error) {
          // A definitive rejection did not commit this request. The user may
          // correct it or choose drafts; network/5xx failures retain the snapshot.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
            variantPatch(post.id, variant.platform, { pendingInput: undefined });
          }
          throw error;
        }
        variantPatch(post.id, variant.platform, { saved: true, pendingInput: undefined });
        saved++;
        if (live.current) setPosts(current => current.filter(item => !item.variants.every(v => v.enabled === false || v.saved)));
      }
      if (live.current) setNotice(`${saved} platform ${asSchedule ? "posts scheduled" : "drafts saved"}.`);
    } catch (e) { if (live.current) setError(`${saved ? `${saved} platform posts saved. Remaining posts are available to retry. ` : ""}${e instanceof Error ? e.message : "Saving failed."}`); }
    finally { if (live.current) setBusy(false); }
  }
  async function regenerate(post: ReviewPost, index: number, imageOnly = false) { setBusy(true); try { await generateOne(post, index, imageOnly); } finally { if (live.current) setBusy(false); } }
  return <div className="space-y-6 pb-24">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><button type="button" className="mb-3 flex items-center gap-2 text-sm text-slate-500" disabled={busy || (review && posts.some(p => p.variants.some(v => v.pendingInput)))} onClick={review ? () => setReview(false) : onBack}><ArrowLeft size={16} />{review ? "Back to AI setup" : "Back to Posts"}</button><h1 className="text-2xl font-bold">{review ? "Review generated posts" : "Create Post"}</h1><p className="mt-1 text-sm text-slate-500">{review ? "Make it yours. Choose the posts you want to keep." : "A little direction. A whole batch of possibilities."}</p></div>{!review && headerActions}{review && <button type="button" className={button} disabled={busy || !posts.length || posts.some(p => p.variants.some(v => v.saved || v.pendingInput))} onClick={async () => { setBusy(true); try { for (let i = 0; i < posts.length; i++) await generateOne(posts[i], i); } finally { if (live.current) setBusy(false); } }}>Regenerate all</button>}</header>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    {review ? <>
      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Publishing accounts</summary><div className="mt-4">{destinations}</div></details>
      <Pills values={[`All (${posts.length})`, `Ready (${posts.filter(ready).length})`, `Needs attention (${posts.filter(p => !ready(p)).length})`]} value={`${filter} (${filter === "All" ? posts.length : filter === "Ready" ? posts.filter(ready).length : posts.filter(p => !ready(p)).length})`} onChange={v => setFilter(v.split(" (")[0])} />
      <div className="grid gap-5 xl:grid-cols-2">{posts.filter(p => filter === "All" || (filter === "Ready" ? ready(p) : !ready(p))).map(p => <article key={p.id} className={`space-y-4 rounded-2xl border bg-white p-5 ${p.selected && ready(p) ? "border-violet-400" : "border-slate-200"}`}>
        <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={p.selected && contentReady(p)} disabled={busy || !contentReady(p)} onChange={e => patch(p.id, { selected: e.target.checked })} />Select post</label><span className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700">{postGoals.find(g => g.id === p.goal)!.name}</span></div>
        <label className="block text-sm text-slate-500">Publish date and time ({timezone})<input aria-label="Publish date and time" type="datetime-local" className={`${field} mt-1`} disabled={busy || p.variants.some(v => v.saved || v.pendingInput)} value={p.scheduledAt ? zonedInputValue(new Date(p.scheduledAt), timezone) : ""} onChange={e => { const parsed = parseZonedInput(e.target.value, timezone); patch(p.id, { scheduledAt: parsed?.toISOString(), scheduleError: undefined }); }} /></label>
        {scheduleProblem(p) && <p role="alert" className="text-sm text-amber-700">{scheduleProblem(p)}</p>}
        {p.scheduledAt && <p className="text-sm text-slate-500">{new Date(p.scheduledAt).toLocaleString(undefined, { timeZone: timezone })} � {timezone}</p>}
        {p.variants.some(v => v.pendingInput) && <p className="text-sm text-amber-700">A save could not be confirmed. Retry its original action to recover it safely.</p>}
        {p.busy && <p role="status" className="animate-pulse text-violet-600">Creating your post�</p>}
        <div className="flex flex-wrap gap-2">{platforms.map(platform => <label key={platform} className={`${button} capitalize`}><input type="checkbox" className="mr-2" checked={p.variants.some(v => v.platform === platform && v.enabled !== false)} disabled={busy || !p.variants.some(v => v.platform === platform) || p.variants.some(v => v.saved || v.pendingInput)} onChange={() => patch(p.id, { variants: p.variants.map(v => v.platform === platform ? { ...v, enabled: v.enabled === false } : v) })} />{platform}</label>)}</div>
        {p.variants.filter(v => v.enabled !== false).map(v => <div key={v.platform} className="space-y-3 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold capitalize">{v.platform}{v.saved ? " � Saved" : ""}</h3>{v.url ? <img src={v.url} alt={`${v.platform} post visual`} className="max-h-80 w-full rounded-xl object-contain bg-slate-50" /> : images && <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><ImageIcon size={32} /></div>}
          {!v.caption.trim() && !p.busy && <p className="text-xs text-amber-700">Add a caption before saving or scheduling this post.</p>}
          {v.platform === "instagram" && !v.assetId && !v.error && !p.busy && <p className="text-xs text-amber-700">Instagram needs an image. Choose Swap image to add one.</p>}
          <p className={`text-xs ${v.caption.length > (v.platform === "instagram" ? 2200 : v.platform === "linkedin" ? 3000 : 5000) ? "text-amber-700" : "text-slate-400"}`}>{v.caption.length} / {v.platform === "instagram" ? 2200 : v.platform === "linkedin" ? 3000 : 5000} characters</p>
          <textarea aria-label={`${v.platform} caption`} className={field} rows={5} value={v.caption} disabled={busy || v.saved || Boolean(v.pendingInput)} onChange={e => variantPatch(p.id, v.platform, { caption: e.target.value, captionError: undefined, error: v.captionError === v.error ? undefined : v.error })} />
          {v.error && <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><p>{v.error}</p><button type="button" className={button} disabled={busy || v.saved || Boolean(v.pendingInput)} onClick={() => void regenerate(p, posts.indexOf(p), v.error?.startsWith("Image:") ?? false)}>Try again</button><label className={`${button} inline-block`}>Upload image<input aria-label="Upload replacement image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy || v.saved || Boolean(v.pendingInput)} onChange={e => void handleUpload(e.target.files?.[0], p.id, v.platform)} /></label></div>}
          <div className="flex gap-2"><button type="button" className={button} disabled={busy || v.saved || Boolean(v.pendingInput)} onClick={() => setLibrary(`${p.id}:${v.platform}`)}>Swap image</button></div>
        </div>)}
        <button type="button" className={button} disabled={busy || p.variants.some(v => v.saved || v.pendingInput)} onClick={() => void regenerate(p, posts.indexOf(p))}>Regenerate</button>
      </article>)}</div>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur"><div><strong>{selected.length} of {posts.length} selected</strong><p className="text-xs text-slate-500">Each platform version is saved as its own post.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || disabled || !selected.length} onClick={() => void save(false)}>Save as drafts</button><button type="button" className={primary} disabled={busy || disabled || !selected.length || selected.some(p => !p.scheduledAt)} onClick={() => void save(true)}>Schedule {selected.length} posts</button></div></div>
    </> : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><fieldset disabled={busy || disabled} className="min-w-0 space-y-5">
      <Step n={1} title="Choose platforms"><div className="flex flex-wrap gap-2">{platforms.map(p => <button type="button" key={p} aria-pressed={targets.includes(p)} className={`${button} capitalize ${targets.includes(p) ? "border-violet-500 bg-violet-50 text-violet-700" : ""}`} onClick={() => setTargets(ps => ps.includes(p) ? ps.filter(v => v !== p) : [...ps, p])}>{p}</button>)}</div><p className="text-xs text-slate-500">Captions, tone, and image dimensions adapt to each platform. Instagram uses portrait, Facebook square, and LinkedIn landscape.</p>{destinations}</Step>
      <Step n={2} title="Describe your post"><Pills values={["Single", "Bulk"]} value={bulk ? "Bulk" : "Single"} onChange={v => setBulk(v === "Bulk")} /><textarea aria-label="Post brief" placeholder="What would you like to share? Tell us about your topic, audience, and key details�" rows={5} maxLength={2800} className={field} value={brief} onChange={e => setBrief(e.target.value)} /><p className="text-sm font-medium">Tone</p><Pills values={["professional", "friendly", "bold", "educational", "playful", "inspirational"]} value={tone} onChange={v => setTone(v as CaptionTone)} /></Step>
      <Step n={3} title="Choose a goal">{[...new Set(postGoals.map(g => g.group))].map(group => <div key={group} className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</h3><div className="flex flex-wrap gap-2">{postGoals.filter(g => g.group === group).map(g => <button type="button" key={g.id} className={`${button} ${goal === g.id ? "border-violet-500 bg-violet-50 text-violet-700" : ""}`} aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>{g.name}</button>)}</div></div>)}<div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-800"><strong>{selectedGoal.name}</strong><p className="mt-1">{selectedGoal.description}</p></div>{bulk && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mix} onChange={e => setMix(e.target.checked)} />Mix different goals across the batch</label>}<p className="text-sm font-medium">Call to action</p><Pills values={["Ask a question", "Visit our link", "Book or order", "None"]} value={cta} onChange={setCta} /></Step>
      <Step n={4} title="Choose what AI should create"><div className="flex gap-6">{[["Captions", captions, setCaptions], ["Images", images, setImages]].map(([name, checked, setter]) => <label key={String(name)} className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" role="switch" checked={Boolean(checked)} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} />{String(name)}</label>)}</div>{bulk && <div className="flex items-center gap-3"><span className="text-sm">Number of posts</span><button aria-label="Fewer posts" type="button" className={button} disabled={count <= 2} onClick={() => setCount(c => c - 1)}><Minus size={16} /></button><output>{count}</output><button aria-label="More posts" type="button" className={button} disabled={count >= 20} onClick={() => setCount(c => c + 1)}><Plus size={16} /></button></div>}{images && <><p className="text-sm font-medium">Image style</p><Pills values={["Photo", "Illustration", "Minimal", "Brand colors"]} value={style} onChange={setStyle} /></>}<p className="text-sm font-medium">Reference images <span className="font-normal text-slate-400">Optional</span></p><p className="text-xs text-slate-500">Included images are attached directly. Style references guide new images. Scheduled posts support one included image.</p><div className="flex gap-2"><label className={`${button} cursor-pointer`}>Upload images<input aria-label="Upload reference images" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => void handleUpload(e.target.files?.[0])} /></label><button type="button" className={button} onClick={() => setLibrary("reference")}>Media Library</button></div>{refs.map(r => <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"><img src={r.url} alt={r.name} className="h-16 w-16 rounded-lg object-cover" /><div className="min-w-0 flex-1 space-y-2"><p className="truncate text-xs text-slate-500">{r.name}</p><select aria-label={`Reference purpose for ${r.name}`} className={field} value={r.usage} onChange={e => setRefs(rs => rs.map(x => x.id === r.id ? { ...x, usage: e.target.value as Reference["usage"] } : x))}><option value="include">Include in post</option><option value="style">Style only</option></select><label className="flex items-center gap-2 text-xs">Use in<select className={field} value={r.useIn} onChange={e => setRefs(rs => rs.map(x => x.id === r.id ? { ...x, useIn: e.target.value as Reference["useIn"] } : x))}><option value="every">Every post</option><option value="choose">Let AI choose</option></select></label></div><button type="button" className={button} onClick={() => setRefs(rs => rs.filter(x => x.id !== r.id))}>Remove</button></div>)}</Step>
      <Step n={5} title="Choose when to publish"><Pills values={["Save as drafts", "Spread across dates"]} value={schedule ? "Spread across dates" : "Save as drafts"} onChange={v => setSchedule(v === "Spread across dates")} />{schedule && <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Start date<input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} /></label><label className="text-sm">Frequency<select className={field} value={frequency} onChange={e => setFrequency(e.target.value)}><option value="1">Every day</option><option value="2">Every other day</option><option value="7">Every week</option></select></label><label className="text-sm">Time<input type="time" className={field} value={time} onChange={e => setTime(e.target.value)} /></label><p className="col-span-full text-xs text-slate-500">Times use {timezone}.</p></div>}</Step>
    </fieldset><aside className="fixed inset-x-3 bottom-3 z-20 space-y-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-lg lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-6 lg:p-6 lg:shadow-sm"><input id="ai-batch-summary" type="checkbox" className="peer sr-only lg:hidden" /><label htmlFor="ai-batch-summary" className="flex cursor-pointer justify-between text-sm font-semibold lg:hidden"><span>Your batch ? {total} {total === 1 ? "post" : "posts"}</span><span className="text-violet-600">Details</span></label><div className="hidden max-h-[50vh] space-y-5 overflow-y-auto peer-checked:block lg:block lg:max-h-none"><h2 className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-violet-500" />Your batch</h2><p className="text-3xl font-bold">{total} <span className="text-sm font-normal text-slate-500">{total === 1 ? "post" : "posts"}</span></p><dl className="space-y-4 text-sm">{[["Goal", mix && bulk ? "Mixed goals" : selectedGoal.name], ["AI creates", [captions && "Captions", images && "Images"].filter(Boolean).join(" + ") || "Nothing selected"], ["Reference images", `${refs.length} selected`], ["Platforms", targets.join(", ") || "None selected"], ["Schedule", schedule ? `${date || "Choose date"} � ${time} � Every ${frequency} day(s)` : "Save as drafts"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 capitalize">{value}</dd></div>)}</dl></div><button type="button" className={`${primary} w-full`} disabled={busy || disabled || !targets.length || brief.trim().length < 3 || (!captions && !images)} onClick={() => void generate()}>{busy ? "Generating�" : `Generate ${total === 1 ? "post" : `${total} posts`}`}</button><p className="text-center text-xs text-slate-500">Nothing is published until you confirm.</p></aside></div>}
    {library && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-5"><div role="dialog" aria-modal="true" aria-label="Choose an image" className="mx-auto max-w-3xl space-y-4 rounded-2xl bg-white p-6"><div className="flex justify-between"><h2 className="font-semibold">Media Library</h2><button type="button" className={button} disabled={busy} onClick={() => setLibrary(null)}>Close</button></div><MediaLibraryPicker workspaceId={workspaceId} selectedAssetId={null} disabled={busy} onSelect={async assetId => { setBusy(true); setError(""); try { if (library === "reference") await addReference(assetId, "Library image"); else { const [id, platform] = library.split(":"); const item = await getMediaLibraryItem(assetId); const url = item.previewUrl ?? (await getWorkspaceImageUrl(item.sourceWorkspaceId, assetId)).url; variantPatch(id, platform as PostPlatform, { assetId, url, error: posts.find(p => p.id === id)?.variants.find(v => v.platform === platform)?.captionError }); } setLibrary(null); } catch (e) { setError(e instanceof Error ? e.message : "Image selection failed."); } finally { setBusy(false); } }} /></div></div>}
  </div>;
}
