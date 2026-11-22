import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api";
import { brandKitSchema } from "@/lib/brandKit";
import type { Workspace } from "@/lib/workspaces";
import { getWorkspaceLogoPreview } from "@/lib/workspaceLogo";
import { hasWorkspaceLogo } from "@/lib/workspaceLogoAvailability";
import { createImageRequestKey, generateWorkspaceImage, getImageGenerationCredits, getWorkspaceImageStatus, getWorkspaceImageUrl, type GenerateImageCommand } from "@/lib/imageGeneration";
import { backgroundPrompt, newTemplateDraft, postTemplates, templateCaption, templateDraftSchema, templateProblem, type TemplateDraft, type TemplateId } from "./templates";
import { renderTemplate } from "./renderTemplate";

const button = "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const primary = "rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-base";
const recoverySchema = z.object({
  draft: templateDraftSchema.nullable(), backgroundAssetId: z.string().optional(), jobAssetId: z.string().optional(),
  command: z.object({ idempotencyKey: z.string(), image: z.object({ prompt: z.string(), aspectRatio: z.enum(["square", "portrait", "landscape"]), useBrandKit: z.boolean(), branding: z.object({ type: z.literal("none") }) }) }).optional(),
});
type Recovery = z.infer<typeof recoverySchema>;
function readRecovery(key: string): Recovery {
  try { return recoverySchema.parse(JSON.parse(localStorage.getItem(key) ?? "null")); } catch { return { draft: null }; }
}
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load an image. Try again.");
  return createImageBitmap(await response.blob());
}
async function assetBitmap(workspaceId: string, assetId: string) {
  return loadBitmap((await getWorkspaceImageUrl(workspaceId, assetId, true)).url);
}
type Props = {
  ownerId: string;
  workspace: Workspace;
  headerActions?: ReactNode;
  onComposer: (image: { assetId: string; title: string; caption: string }) => void;
};
export function PostTemplateFlow({ ownerId, workspace, headerActions, onComposer }: Props) {
  const storageKey = `storm:post-template:v1:${ownerId}:${workspace._id}`;
  const [initial] = useState(() => readRecovery(storageKey));
  const [draft, setDraft] = useState<TemplateDraft | null>(initial.draft);
  const [category, setCategory] = useState("All");
  const [backgroundAssetId, setBackgroundAssetId] = useState(initial.backgroundAssetId);
  const [jobAssetId, setJobAssetId] = useState(initial.jobAssetId);
  const [statusRefresh, setStatusRefresh] = useState(0);
  const [command, setCommand] = useState<GenerateImageCommand | undefined>(initial.command);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [previewActive, setPreviewActive] = useState(false);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rendering, setRendering] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const lock = useRef(false);
  const live = useRef(true);
  const exported = useRef<{ blob: Blob; assetId: string } | null>(null);
  const kitResult = brandKitSchema.safeParse(workspace.settings?.brandKit);
  const availableKit = kitResult.success && kitResult.data.enabled ? kitResult.data : undefined;
  const kit = draft?.brandChoice === "yes" ? availableKit : undefined;
  const kitJson = JSON.stringify(kit);
  const logoAvailable = hasWorkspaceLogo(workspace);
  const generating = Boolean(jobAssetId || command);
  const disabled = busy || generating || Boolean(workspace.archivedAt);
  const template = postTemplates.find(t => t.id === draft?.templateId);
  const recovery: Recovery = { draft, backgroundAssetId, jobAssetId, command: command as Recovery["command"] };
  function persist(value: Recovery) {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); return true; }
    catch { setStorageError("This design could not be saved in this browser. Keep this page open."); return false; }
  }
  useEffect(() => { persist(recovery); }, [draft, backgroundAssetId, jobAssetId, command]);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void getImageGenerationCredits(workspace._id).then(result => { if (active) setCost(result.credits.costPerImage); }).catch(() => {});
    return () => { active = false; };
  }, [workspace._id]);
  useEffect(() => {
    if (!jobAssetId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await getWorkspaceImageStatus(workspace._id, jobAssetId!);
        if (!active) return;
        if (result.status === "ready") { setBackgroundAssetId(jobAssetId); setJobAssetId(undefined); setError(""); setPreviewActive(true); return; }
        if (result.state === "failed" || result.state === "action_required") {
          setError(result.message ?? "Background generation failed. Your previous design is still available.");
          // Action-required operations must be resolved in Image Studio before another is charged.
          if (result.state === "failed") setJobAssetId(undefined);
          return;
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not check generation status."); }
      if (active) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [workspace._id, jobAssetId, statusRefresh]);
  useEffect(() => {
    if (!draft || !previewActive) return;
    const problem = templateProblem(draft);
    if (problem || (draft.brandChoice === "yes" && !kitJson)) {
      setPreview(null); setRendering(false); setError(problem ?? "The workspace brand kit is unavailable. Choose design defaults."); return;
    }
    let active = true;
    const bitmaps: ImageBitmap[] = [];
    setRendering(true); setPreview(null);
    void (async () => {
      try {
        const add = async (task: Promise<ImageBitmap>) => { const image = await task; bitmaps.push(image); return image; };
        const photo = draft.photoAssetId ? await add(assetBitmap(workspace._id, draft.photoAssetId)) : undefined;
        const background = backgroundAssetId ? await add(assetBitmap(workspace._id, backgroundAssetId)) : undefined;
        const selectedKit = kitJson ? JSON.parse(kitJson) : undefined;
        let logo: ImageBitmap | undefined;
        if (selectedKit && logoAvailable) {
          try { logo = await add(loadBitmap((await getWorkspaceLogoPreview(workspace._id, selectedKit.layout.logoVariant)).url)); }
          catch (cause) {
            // A kit can be used without a logo. Permission, network, and storage
            // failures must not silently drop a logo that should have been used.
            if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
          }
        }
        const blob = await renderTemplate(draft, selectedKit, { photo, background, logo });
        if (active) { setPreview(blob); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not create the preview."); }
      finally { bitmaps.forEach(image => image.close()); if (active) setRendering(false); }
    })();
    return () => { active = false; };
  }, [draft, previewActive, backgroundAssetId, kitJson, workspace._id, logoAvailable]);
  useEffect(() => {
    if (!preview) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(preview); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  function choose(id: TemplateId) {
    setDraft(newTemplateDraft(id)); setBackgroundAssetId(undefined); setPreviewActive(false); setPreview(null); setError("");
  }
  async function uploadPhoto(file?: File) {
    if (!file || !draft || lock.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP photo up to 10 MB."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const { assetId } = await apiFetch<{ assetId: string }>(`/api/ai/workspaces/${workspace._id}/upload-post-image`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (live.current) setDraft(current => current ? { ...current, photoAssetId: assetId } : current);
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  async function submitBackground(next: GenerateImageCommand) {
    if (lock.current || workspace.archivedAt) return;
    if (!persist({ ...recovery, command: next as Recovery["command"] })) { setError("Save recovery information before starting a background request. No credits were spent."); return; }
    lock.current = true; setBusy(true); setCommand(next); setError("");
    try {
      const result = await generateWorkspaceImage(workspace._id, next);
      // Save the known job even if the user navigated away during admission.
      persist({ ...recovery, command: undefined, jobAssetId: result.assetId });
      if (live.current) { setCommand(undefined); setJobAssetId(result.assetId); }
    } catch (cause) {
      if (live.current) {
        if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) setCommand(undefined);
        setError(cause instanceof Error ? cause.message : "Background submission could not be confirmed. Retry the original request.");
      }
    } finally { lock.current = false; if (live.current) setBusy(false); }
  }
  function generateBackground() {
    if (!draft || disabled) return;
    const problem = templateProblem(draft);
    if (problem) { setError(problem); return; }
    void submitBackground({ idempotencyKey: createImageRequestKey(), image: { prompt: backgroundPrompt(draft, kit), aspectRatio: draft.format, useBrandKit: Boolean(kit), branding: { type: "none" } } });
  }
  async function sendToComposer() {
    if (!preview || !draft || disabled || lock.current || rendering) return;
    lock.current = true; setBusy(true); setError("");
    try {
      let assetId = exported.current?.blob === preview ? exported.current.assetId : undefined;
      if (!assetId) {
        const result = await apiFetch<{ assetId: string }>(`/api/ai/workspaces/${workspace._id}/upload-post-image`, { method: "POST", headers: { "Content-Type": "image/png" }, body: preview });
        assetId = result.assetId; exported.current = { blob: preview, assetId };
      }
      if (live.current) onComposer({ assetId, title: template!.name, caption: templateCaption(draft) });
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "Could not send this design to the composer."); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  return <section className="space-y-6 pb-8" aria-label="Post design templates">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-violet-600">Create Post</p><h1 className="mt-1 text-2xl font-bold">Start with a design</h1><p className="mt-2 text-sm text-slate-600">Choose a template, add your content, and make it yours.</p></div>{headerActions}</header>
    {storageError && <p role="alert" className="text-sm text-amber-800">{storageError}</p>}
    {workspace.archivedAt && <p role="status">This workspace is archived. Restore it to create a post.</p>}
    {!draft ? <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Template categories">{["All", "Quotes", "Products", "Promos", "Announcements", "Custom"].map(value => <button type="button" key={value} aria-pressed={category === value} className={`${button} ${category === value ? "border-violet-500 text-violet-700" : ""}`} onClick={() => setCategory(value)}>{value}</button>)}</div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{postTemplates.filter(t => category === "All" || t.category === category).map(t => <button type="button" key={t.id} disabled={Boolean(workspace.archivedAt)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-violet-500 focus-visible:outline-violet-500 disabled:opacity-50" onClick={() => choose(t.id)}>
        <div aria-hidden="true" className={`relative flex aspect-square flex-col justify-center overflow-hidden p-8 ${t.id === "sale" ? "bg-violet-950 text-white" : t.id === "custom" ? "bg-gradient-to-br from-violet-200 via-sky-100 to-rose-100 text-violet-950" : "bg-slate-50 text-slate-900"}`}>
          <span className="mb-6 text-xs font-semibold uppercase tracking-widest">{t.category === "Custom" ? "Create something new" : t.category}</span>
          {t.id === "product" && <div className="mx-auto mb-6 h-24 w-16 rounded-t-2xl rounded-b-lg bg-violet-300 shadow-xl" />}
          <span className={`relative z-10 whitespace-pre-line text-3xl font-semibold leading-tight ${t.id === "quote" ? "max-w-[65%] font-serif" : t.id === "product" ? "text-center" : ""}`}>{t.sample}</span>
          {t.id === "quote" && <div className="absolute bottom-0 right-0 h-3/4 w-1/3 rounded-t-full bg-violet-200" />}
          {t.id === "event" && <span className="mt-6 text-sm font-semibold text-violet-700">OCT 24 · YOUR VENUE</span>}
          {t.id === "sale" && <span className="mt-6 w-fit rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-violet-950">Discover the offer</span>}
        </div><div className="space-y-2 p-5"><h2 className="font-semibold">{t.name}</h2><p className="text-sm text-slate-600">{t.description}</p></div>
      </button>)}</div>
    </> : <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{template!.name}</h2><button type="button" disabled={disabled} className={button} onClick={() => { setDraft(null); setBackgroundAssetId(undefined); setPreviewActive(false); setPreview(null); setError(""); }}>Choose another design</button></div>
        <fieldset disabled={disabled} className="space-y-4"><legend className="mb-3 font-semibold">Include the workspace brand kit in the image details?</legend><p className="text-sm text-slate-600">Use workspace colors, fonts, visual style, and an available logo while keeping this design’s layout.</p>
          <div className="flex flex-wrap gap-3">{([ ["yes", "Yes, use brand kit"], ["no", "No, use design defaults"] ] as const).map(([value, label]) => <label key={value} className={button}><input type="radio" name="template-brand-kit" value={value} checked={draft.brandChoice === value} disabled={value === "yes" && !availableKit} onChange={() => setDraft({ ...draft, brandChoice: value })} className="mr-2" />{label}</label>)}</div>
          {!availableKit && <p className="text-sm text-slate-500">No enabled brand kit is available. Add one in Workspace Settings, or use design defaults.</p>}
          {kit && <div className="flex flex-wrap gap-3 text-sm"><span>{kit.typography.headingFont} / {kit.typography.bodyFont}</span>{Object.values(kit.colors).map((color, index) => <span key={index} className="rounded border border-slate-200 px-2 py-1" style={{ borderLeft: `12px solid ${color}` }}>{color}</span>)}</div>}
        </fieldset>
        <form onSubmit={event => { event.preventDefault(); const problem = templateProblem(draft); if (problem) { setError(problem); return; } if (draft.brandChoice === "yes" && !availableKit) { setError("The workspace brand kit is unavailable. Choose design defaults."); return; } setError(""); if (draft.templateId === "custom" && !backgroundAssetId) generateBackground(); else setPreviewActive(true); }}>
          <fieldset disabled={disabled} className="space-y-5">
            {template!.fields.filter(f => f.required).map(f => <label key={f.key} className="block text-sm font-semibold">{f.label}{f.type === "textarea" ? <textarea className={field} rows={4} required maxLength={f.max} value={draft.values[f.key] ?? ""} onChange={e => setDraft({ ...draft, values: { ...draft.values, [f.key]: e.target.value } })} /> : <input className={field} type={f.type ?? "text"} required maxLength={f.max} value={draft.values[f.key] ?? ""} onChange={e => setDraft({ ...draft, values: { ...draft.values, [f.key]: e.target.value } })} />}</label>)}
            {template!.photoRequired && <label className="block text-sm font-semibold">{template!.photoLabel}<input type="file" accept="image/jpeg,image/png,image/webp" className={field} onChange={e => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} />{draft.photoAssetId && <span className="mt-2 block font-normal text-violet-700">Photo uploaded</span>}</label>}
            <details><summary className="cursor-pointer text-sm font-semibold text-slate-700">Optional details</summary><div className="mt-4 space-y-4">
              {template!.fields.filter(f => !f.required).map(f => <label key={f.key} className="block text-sm font-semibold">{f.label}<input className={field} maxLength={f.max} value={draft.values[f.key] ?? ""} onChange={e => setDraft({ ...draft, values: { ...draft.values, [f.key]: e.target.value } })} /></label>)}
              {!template!.photoRequired && <label className="block text-sm font-semibold">{template!.photoLabel}<input type="file" accept="image/jpeg,image/png,image/webp" className={field} onChange={e => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>}
              {draft.photoAssetId && <button type="button" className={button} onClick={() => setDraft({ ...draft, photoAssetId: undefined })}>Remove photo</button>}
            </div></details>
            <label className="block text-sm font-semibold">Image size<select className={field} value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value as TemplateDraft["format"] })}><option value="square">Square · 1:1</option><option value="portrait">Portrait · 4:5</option><option value="landscape">Landscape · 1.91:1</option></select></label>
            <button type="submit" className={`${primary} w-full`} disabled={!draft.brandChoice || (draft.brandChoice === "yes" && !availableKit)}>{busy ? "Working…" : draft.templateId === "custom" && !backgroundAssetId ? `Generate custom image${cost !== null ? ` · ${cost} credits` : ""}` : "Generate preview"}</button>
          </fieldset>
        </form>
        <p className="text-sm text-slate-500">Text edits and template previews use no AI credits. Generating a new AI background uses workspace credits.</p>
      </div>
      <section aria-label="Template preview" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Preview</h2>
        <div className="flex min-h-80 items-center justify-center rounded-xl bg-slate-100">{previewUrl ? <img src={previewUrl} alt={`${template!.name} preview`} className="max-h-[560px] w-full object-contain" /> : <p className="p-8 text-center text-sm text-slate-500">{generating ? "Generating your image…" : rendering ? "Updating preview…" : "Add your content and generate a preview."}</p>}</div>
        {preview && <div className="flex flex-wrap gap-3"><a download={`${draft.templateId}-post.png`} href={previewUrl} className={button}>Download PNG</a><button type="button" disabled={disabled || rendering} className={primary} onClick={() => void sendToComposer()}>Send to composer</button></div>}
        <button type="button" className={button} disabled={disabled || !draft.brandChoice || (draft.brandChoice === "yes" && !availableKit)} onClick={generateBackground}>{backgroundAssetId ? "Regenerate background" : "Generate AI background"}{cost !== null ? ` · ${cost} credits` : ""}</button>
        <p className="text-sm text-slate-500">Edit text on the left to update your preview. Background regeneration keeps your layout, text, and uploaded photo.</p>
      </section>
    </div>}
    {generating && <p role="status" className="text-sm text-violet-700">{command ? "A background request needs confirmation. Retry the original request before starting another." : "Your image is processing. You can check it in Image Studio."}</p>}
    {command && <button type="button" className={button} disabled={busy || Boolean(workspace.archivedAt)} onClick={() => void submitBackground(command)}>Check / retry original background request</button>}
    {jobAssetId && <button type="button" className={button} onClick={() => setStatusRefresh(value => value + 1)}>Check background status</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
