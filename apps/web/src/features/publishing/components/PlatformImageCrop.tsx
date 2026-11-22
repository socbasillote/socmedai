import { useEffect, useId, useRef, useState } from "react";
import type { PostPlatform } from "@/lib/posts";
import { getMediaLibraryItem } from "@/lib/mediaLibrary";
import { getWorkspaceImageUrl } from "@/lib/imageGeneration";
import { cropFile, cropFormats, defaultCrop, drawImageCrop, type CropSettings } from "../imageCrop";

type Props = {
  platform: PostPlatform;
  sourceAssetId: string;
  appliedCrop?: CropSettings;
  disabled: boolean;
  onApply: (file: File, crop: CropSettings, sourceAssetId: string) => Promise<void>;
  onRestore?: () => Promise<void>;
};
const button = "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40";
export function PlatformImageCrop({ platform, sourceAssetId, appliedCrop, disabled, onApply, onRestore }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CropSettings>(() => appliedCrop ?? defaultCrop(platform));
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const requestLock = useRef(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    let loaded: ImageBitmap | undefined;
    const controller = new AbortController();
    setLoading(true); setError(""); setBitmap(null); setPreviewReady(false);
    void (async () => {
      try {
        const item = await getMediaLibraryItem(sourceAssetId);
        const signed = await getWorkspaceImageUrl(item.sourceWorkspaceId, sourceAssetId, true);
        const response = await fetch(signed.url, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load the original image. Close the crop preview and try again.");
        loaded = await createImageBitmap(await response.blob());
        if (active) setBitmap(loaded); else loaded.close();
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Could not load image."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); loaded?.close(); };
  }, [open, sourceAssetId]);
  useEffect(() => {
    if (!bitmap || !canvas.current || !open) return;
    try { drawImageCrop(canvas.current, bitmap, settings); setPreviewReady(true); }
    catch (e) { setPreviewReady(false); setError(e instanceof Error ? e.message : "Could not prepare crop."); }
  }, [bitmap, settings, open]);
  const target = cropFormats[settings.format];
  async function apply() {
    if (!canvas.current || !previewReady || disabled || requestLock.current) return;
    requestLock.current = true; setSaving(true); setError("");
    try {
      // Export the exact same pixels shown in the preview.
      drawImageCrop(canvas.current, bitmap!, settings);
      const file = await cropFile(canvas.current, platform);
      await onApply(file, settings, sourceAssetId);
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save crop. Your current image is unchanged."); }
    finally { requestLock.current = false; setSaving(false); }
  }
  async function restore() {
    if (!onRestore || disabled || requestLock.current) return;
    requestLock.current = true; setSaving(true); setError("");
    try { await onRestore(); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not restore the original image."); }
    finally { requestLock.current = false; setSaving(false); }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={disabled || saving} aria-expanded={open} aria-controls={id} onClick={() => { setSettings(appliedCrop ?? defaultCrop(platform)); setError(""); setBitmap(null); setPreviewReady(false); setOpen(value => !value); }}>{open ? "Cancel crop" : "Adjust crop"}</button>
      {onRestore && <button type="button" className={button} disabled={disabled || saving} onClick={() => void restore()}>Use original image</button>}
      {appliedCrop && <span className="text-xs text-slate-500">{cropFormats[appliedCrop.format].label} crop applied</span>}
    </div>
    {error && <p role="alert" className="text-sm text-amber-700">{error}</p>}
    {open && <section id={id} aria-label={`${platform} crop preview`} className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <p className="text-sm text-slate-600">Adjust framing for {platform}. This uses your original image with no additional AI generation. Cropping trims the edges; check that your subject and text remain visible.</p>
      <fieldset disabled={disabled || saving || loading} className="space-y-3">
        <label className="block text-sm">Crop format<select className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2" value={settings.format} onChange={e => setSettings(s => ({ ...s, format: e.target.value as CropSettings["format"] }))}>{Object.entries(cropFormats).map(([value, format]) => <option key={value} value={value}>{format.label}</option>)}</select></label>
        {loading && <p role="status">Loading original image...</p>}
        <canvas ref={canvas} aria-label={`${platform} cropped image preview`} role="img" className="mx-auto w-full max-w-sm rounded-lg bg-slate-100" style={{ aspectRatio: `${target.width} / ${target.height}`, display: previewReady ? "block" : "none" }} />
        <p className="text-xs text-slate-500">Output: {target.width} x {target.height} pixels</p>
        {([ ["Horizontal position", "x", 0, 100, 1], ["Vertical position", "y", 0, 100, 1], ["Zoom", "zoom", 1, 3, 0.05] ] as const).map(([label, field, min, max, step]) => <label key={field} className="block text-sm"><span>{label}</span><input className="mt-1 block w-full" type="range" aria-label={label} min={min} max={max} step={step} value={settings[field]} onChange={e => setSettings(s => ({ ...s, [field]: Number(e.target.value) }))} /></label>)}
      </fieldset>
      <button type="button" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={disabled || saving || loading || !previewReady} onClick={() => void apply()}>{saving ? "Saving crop..." : "Apply crop"}</button>
    </section>}
  </div>;
}
