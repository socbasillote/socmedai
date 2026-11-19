import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { uploadWorkspaceImageReference, type ImageReference, type ImageReferenceUsage } from "@/lib/imageGeneration";

const choices: { value: ImageReferenceUsage; title: string; description: string }[] = [
  { value: "inspiration", title: "Use as inspiration", description: "Borrow the colors, mood, or style to create a new image." },
  { value: "edit", title: "Edit this photo", description: "Keep the main subject and change its background, lighting, or details." },
  { value: "design", title: "Design around this photo", description: "Use the actual subject in a social graphic, promotion, or layout." },
];
type Props = {
  workspaceId: string | null;
  disabled: boolean;
  onSelection: (reference: ImageReference | undefined, blocked: boolean) => void;
};
export function ImageReferenceInput({ workspaceId, disabled, onSelection }: Props) {
  const inputId = useId();
  const [photo, setPhoto] = useState<{ file: File; url: string; id?: string } | null>(null);
  const [usage, setUsage] = useState<ImageReferenceUsage>("inspiration");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo?.url]);

  function remove() {
    pending.current?.abort();
    pending.current = null;
    setPhoto(null); setError(""); setUploading(false);
    onSelection(undefined, false);
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !workspaceId || disabled) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    onSelection(undefined, true);
    setError("");
    setUploading(true);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
        setPhoto(null);
        throw new Error("Choose a JPG, PNG, or WebP photo up to 10 MB.");
      }
      const url = URL.createObjectURL(file);
      setPhoto({ file, url });
      const result = await uploadWorkspaceImageReference(workspaceId, file, controller.signal);
      if (controller.signal.aborted) return;
      setPhoto({ file, url, id: result.referenceId });
      onSelection({ id: result.referenceId, usage }, false);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Photo upload failed. Please try again.");
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  }
  function selectUsage(next: ImageReferenceUsage) {
    setUsage(next);
    if (photo?.id) onSelection({ id: photo.id, usage: next }, false);
  }
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4" aria-label="Reference photo">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Add a photo <span className="font-normal text-slate-600">(optional)</span></h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Guide the visual style or give AI a real photo to work with.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {photo && <img src={photo.url} alt="Selected reference photo" className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-contain" />}
        <div className="min-w-0 flex-1 space-y-2">
          {photo && <p className="truncate text-xs font-medium text-slate-700" title={photo.file.name}>{photo.file.name}</p>}
          <label htmlFor={inputId} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 focus-within:ring-2 focus-within:ring-violet-500 ${disabled || !workspaceId ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-violet-50"}`}>
            <ImagePlus size={17} aria-hidden="true" />{photo ? "Replace photo" : "Upload photo"}
            <input id={inputId} type="file" aria-label="Upload reference photo" accept="image/jpeg,image/png,image/webp" disabled={disabled || !workspaceId} onChange={(event) => { void upload(event); }} className="sr-only" />
          </label>
          <p className="text-xs text-slate-600">JPG, PNG, or WebP. Up to 10 MB. Stored privately.</p>
        </div>
        {(photo || error) && <button type="button" disabled={disabled} onClick={remove} aria-label="Remove reference photo" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200 disabled:opacity-50"><X size={18} /></button>}
      </div>
      {uploading && <p role="status" className="flex items-center gap-2 text-xs text-violet-700"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Uploading photo...</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error} Replace or remove the photo to continue.</p>}
      {photo && !error && <fieldset disabled={disabled || uploading} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-slate-800">How should AI use your image?</legend>
        {choices.map((choice) => <label key={choice.value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${usage === choice.value ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}>
          <input type="radio" name={`${inputId}-usage`} value={choice.value} checked={usage === choice.value} onChange={() => selectUsage(choice.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600" />
          <span><span className="block text-sm font-medium text-slate-800">{choice.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-600">{choice.description}</span></span>
        </label>)}
        <p className="text-xs leading-5 text-slate-600">Use the prompt below to describe what to create, change, or keep.</p>
      </fieldset>}
    </section>
  );
}
