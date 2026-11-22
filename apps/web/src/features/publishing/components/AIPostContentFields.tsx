import { aiPostTypes, postContentFields, type AIPostType } from "@/lib/aiPostTypes";

const field = "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-500";
type Props = {
  type: AIPostType; content: Record<string, string>; onChange: (key: string, value: string) => void;
  brief: string; onBriefChange: (value: string) => void; onPhoto: (file?: File) => void; hasPhoto: boolean;
  showPhoto?: boolean;
};
export function AIPostContentFields({ type, content, onChange, brief, onBriefChange, onPhoto, hasPhoto, showPhoto = true }: Props) {
  const definition = aiPostTypes.find(item => item.id === type)!;
  function input(f: ReturnType<typeof postContentFields>[number]) {
    return <label key={f.key} className="block text-sm font-medium">{f.label}{f.multiline
      ? <textarea className={field} rows={f.key === "quote" ? 5 : 3} maxLength={f.max} required={f.required} value={content[f.key] ?? ""} placeholder={f.placeholder} onChange={event => onChange(f.key, event.target.value)} />
      : <input className={field} type={f.type ?? "text"} maxLength={f.max} required={f.required} value={content[f.key] ?? ""} placeholder={f.placeholder} onChange={event => onChange(f.key, event.target.value)} />}</label>;
  }
  const fields = postContentFields(type, content);
  return <div className="space-y-4">
    {type === "quote" && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Where should the quote come from?</legend><div className="flex flex-wrap gap-4">{[["supplied", "Use my own quote"], ["topic", "Write a quote about a topic"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="quote-source" checked={(content.mode ?? "supplied") === value} onChange={() => onChange("mode", value)} />{label}</label>)}</div></fieldset>}
    {type === "custom" ? <label className="block text-sm font-medium">What’s your post about?<textarea aria-label="Post brief" placeholder="For example: Introduce our new iced coffee." rows={5} maxLength={2800} className={field} value={brief} onChange={event => onBriefChange(event.target.value)} /></label> : fields.filter(f => f.required).map(input)}
    {type !== "custom" && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Optional content details</summary><div className="mt-4 space-y-4">
      {fields.filter(f => !f.required).map(input)}
      {showPhoto && definition.photoLabel && <div>
        <label className="block text-sm font-medium">{definition.photoLabel}<input type="file" aria-describedby={`ai-${type}-photo-help`} accept="image/jpeg,image/png,image/webp" className={field} onChange={event => { onPhoto(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <p id={`ai-${type}-photo-help`} className="mt-2 text-xs text-slate-500">{hasPhoto ? "Photo added. You can manage it in Reference images below." : "Optional. AI will build around the photo’s subject."}</p>
      </div>}
    </div></details>}
  </div>;
}
