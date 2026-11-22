import { useState } from "react";
import { brandFonts, brandFontFamily, type BrandKit } from "@/lib/brandKit";
import { WorkspaceLogoUploader } from "@/features/image-studio/components/WorkspaceLogoUploader";
import { BrandKitTemplatePreview } from "./BrandKitTemplatePreview";

type Props = { workspaceId: string; name: string; value: BrandKit; onChange: (kit: BrandKit) => void; disabled: boolean; archived: boolean };
const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50";
const colorRoles = { primary: "Headlines and main design elements.", accent: "Quote marks, highlights, and sale badges.", background: "The canvas behind your content.", text: "Supporting text and body copy." };

export function BrandKitFields({ workspaceId, name, value, onChange, disabled, archived }: Props) {
  const [logoVersion, setLogoVersion] = useState(0);
  function changeLayout<K extends keyof BrandKit["layout"]>(key: K, next: BrandKit["layout"][K]) {
    onChange({ ...value, layout: { ...value.layout, [key]: next } });
  }
  return <div className="space-y-8">
    <label className="flex items-start gap-3 rounded-xl bg-violet-50 p-4 text-sm"><input type="checkbox" className="mt-1" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><span><strong className="block text-violet-950">Use brand kit for new images</strong><span className="mt-1 block text-slate-600">Guide new imagery with your colors, typography, and image style. Existing images stay as they are.</span></span></label>
    <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr]">
      <div className="space-y-8">
        <section aria-labelledby="brand-colors"><h3 id="brand-colors" className="font-semibold">Colors</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.keys(colorRoles) as Array<keyof typeof colorRoles>).map((role) => <div key={role}>
            <label htmlFor={`brand-color-${role}`} className="text-sm font-semibold capitalize">{role.charAt(0).toUpperCase() + role.slice(1)} color</label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2">
              <input type="color" aria-label={`Choose ${role} color`} className="h-9 w-10 shrink-0 cursor-pointer rounded border-0 p-0" value={/^#[a-f\d]{6}$/i.test(value.colors[role]) ? value.colors[role] : "#000000"} onChange={(event) => onChange({ ...value, colors: { ...value.colors, [role]: event.target.value.toUpperCase() } })} />
              <input id={`brand-color-${role}`} value={value.colors[role]} maxLength={7} pattern="#[A-Fa-f0-9]{6}" title="Use a six-digit hex color, such as #7C3AED" required className="min-h-11 w-full min-w-0 bg-transparent px-1 text-sm uppercase outline-none" onChange={(event) => onChange({ ...value, colors: { ...value.colors, [role]: event.target.value.toUpperCase() } })} />
            </div><p className="mt-1 text-xs leading-5 text-slate-500">{colorRoles[role]}</p>
          </div>)}
        </div></section>
        <section aria-labelledby="brand-typography"><h3 id="brand-typography" className="font-semibold">Typography</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">
          {([ ["headingFont", "Heading font"], ["bodyFont", "Body font"] ] as const).map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}<select className={field} value={value.typography[key]} style={{ fontFamily: brandFontFamily(value.typography[key]) }} onChange={(event) => onChange({ ...value, typography: { ...value.typography, [key]: event.target.value as BrandKit["typography"][typeof key] } })}>{brandFonts.map((font) => <option key={font}>{font}</option>)}</select></label>)}
        </div><p className="mt-2 text-xs leading-5 text-slate-500">Used for headlines and supporting text in supported layouts. System font availability can vary; a matching fallback is used when needed.</p></section>
        <section aria-labelledby="brand-image-style"><h3 id="brand-image-style" className="font-semibold">Image style</h3><label className="mt-3 block text-sm font-semibold">Describe your image style<textarea className={field} rows={4} maxLength={600} value={value.imageStyle} placeholder="Warm natural light, muted earth tones, and soft paper texture." onChange={(event) => onChange({ ...value, imageStyle: event.target.value })} /></label><p className="mt-2 text-xs leading-5 text-slate-500">Describe lighting, mood, texture, and composition. This guides generated imagery; exact fonts and color placement are applied in supported layouts.</p></section>
      </div>
      <div className="self-start lg:sticky lg:top-6"><BrandKitTemplatePreview workspaceId={workspaceId} name={name} kit={value} logoVersion={logoVersion} archived={archived} /></div>
    </div>
    <section aria-labelledby="brand-layout"><h3 id="brand-layout" className="font-semibold">Layout preferences</h3><p className="mt-1 text-sm text-slate-500">Defaults for supported layouts. Explicit placement chosen for an individual image takes priority.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-semibold">Text alignment<select className={field} value={value.layout.textAlignment} onChange={(event) => changeLayout("textAlignment", event.target.value as BrandKit["layout"]["textAlignment"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label className="text-sm font-semibold">Logo position<select className={field} value={value.layout.logoPosition} onChange={(event) => changeLayout("logoPosition", event.target.value as BrandKit["layout"]["logoPosition"])}><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label>
      <label className="text-sm font-semibold">Spacing<select className={field} value={value.layout.spacing} onChange={(event) => changeLayout("spacing", event.target.value as BrandKit["layout"]["spacing"])}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
      <label className="text-sm font-semibold">Preferred logo<select className={field} value={value.layout.logoVariant} onChange={(event) => changeLayout("logoVariant", event.target.value as BrandKit["layout"]["logoVariant"])}><option value="primary">Primary</option><option value="light">Light variant</option><option value="dark">Dark variant</option></select></label>
    </div></section>
    <section aria-labelledby="brand-logos"><h3 id="brand-logos" className="font-semibold">Logos</h3><p className="mt-1 text-sm text-slate-500">Your existing workspace logo is the primary logo. Add optional light and dark versions for different backgrounds. Uploads are saved immediately; images use a logo only when logo branding is selected.</p>
      {archived ? <p className="mt-4 text-sm text-amber-800">Restore the workspace to manage logos.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-3">{([undefined, "light", "dark"] as const).map((variant) => <WorkspaceLogoUploader key={variant ?? "primary"} workspaceId={workspaceId} variant={variant} disabled={disabled} onReady={() => setLogoVersion((version) => version + 1)} />)}</div>}
      <p className="mt-3 text-xs text-slate-500">A missing preferred variant falls back to the primary logo.</p>
    </section>
  </div>;
}
