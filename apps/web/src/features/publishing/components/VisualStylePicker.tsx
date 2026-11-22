import { visualStyles, type VisualStyle } from "@/lib/visualStyles";

export function VisualStylePicker({ value, onChange, suggested = [] }: { value: VisualStyle; onChange: (style: VisualStyle) => void; suggested?: readonly VisualStyle[] }) {
  const ordered = [...visualStyles].sort((a, b) => {
    const rank = (id: VisualStyle) => id === "auto" ? -1 : suggested.includes(id) ? suggested.indexOf(id) : 10 + visualStyles.findIndex(style => style.id === id);
    return rank(a.id) - rank(b.id);
  });
  return <fieldset className="space-y-3">
    <legend className="text-sm font-semibold">Choose a visual style</legend>
    <p className="text-sm text-slate-500">Pick a look or leave it on Auto. Examples show the style; your description determines the subject.</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {ordered.map(style => <button type="button" key={style.id} aria-pressed={value === style.id} aria-label={style.name} onClick={() => onChange(style.id)} className={`overflow-hidden rounded-xl border-2 text-left transition focus-visible:outline-violet-500 ${value === style.id ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-300"}`}>
        <div aria-hidden="true" className="relative aspect-square bg-slate-100" style={{ backgroundImage: "url('/images/visual-styles/coffee-style-sheet.webp')", backgroundSize: style.id === "auto" ? "cover" : "300% 200%", backgroundPosition: style.position }}>
          {(style.id === "auto" || style.id === "custom") && <span className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-lg font-bold text-white">{style.id === "auto" ? "Choose for me" : "Your direction"}</span>}
          {value === style.id && <span className="absolute right-2 top-2 rounded-full bg-violet-600 px-2 py-1 text-xs font-semibold text-white">Selected</span>}
          {suggested.includes(style.id) && <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-1 text-xs font-semibold text-violet-700">Suggested</span>}
        </div>
        <span className="block space-y-1 p-3"><span className="block text-sm font-semibold">{style.name}</span><span className="block text-xs leading-relaxed text-slate-600">{style.description}</span></span>
      </button>)}
    </div>
  </fieldset>;
}
