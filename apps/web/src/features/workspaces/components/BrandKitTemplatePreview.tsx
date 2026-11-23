import { useEffect, useState } from "react";
import { brandFontFamily, readBrandKit, readableTextColor, type BrandKit } from "@/lib/brandKit";
import { getWorkspaceLogoPreview } from "@/lib/workspaceLogo";
import { ApiError } from "@/lib/api";

type Props = { workspaceId: string; name: string; kit: BrandKit; logoVersion: number; archived?: boolean };

export function BrandKitTemplatePreview({ workspaceId, name, kit: draft, logoVersion, archived }: Props) {
  const kit = readBrandKit(draft);
  const [template, setTemplate] = useState<"announcement" | "quote" | "sale">("quote");
  const [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<{ scope: string; url: string } | null>(null);
  const variant = kit.layout.logoVariant;
  const scope = `${workspaceId}:${variant}:${logoVersion}:${refresh}:${archived}`;
  useEffect(() => {
    if (archived) return;
    let active = true;
    async function loadLogo() {
      try {
        const result = await getWorkspaceLogoPreview(workspaceId, variant);
        if (active) setPreview({ scope, url: result.url });
      } catch (error) {
        // An optional variant can fall back to the existing primary logo.
        if (variant !== "primary" && error instanceof ApiError && error.status === 404) {
          try {
            const result = await getWorkspaceLogoPreview(workspaceId);
            if (active) setPreview({ scope, url: result.url });
          } catch { if (active) setPreview({ scope, url: "" }); }
        } else if (active) setPreview({ scope, url: "" });
      }
    }
    void loadLogo();
    return () => { active = false; };
  }, [workspaceId, variant, archived, scope]);
  const padding = { compact: 20, comfortable: 32, spacious: 44 }[kit.layout.spacing];
  const topLogo = kit.layout.logoPosition.startsWith("top");
  const url = preview?.scope === scope ? preview.url : "";
  return <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-slate-900">Template preview</h3><p className="mt-1 text-xs text-slate-500">See how your colors, fonts, and layout work together.</p></div>
      <select aria-label="Preview template" value={template} onChange={(event) => setTemplate(event.target.value as typeof template)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
        <option value="quote">Quote</option><option value="announcement">Announcement</option><option value="sale">Sale</option>
      </select>
    </div>
    <div aria-label="Brand kit template preview" data-testid="brand-kit-preview" className="relative mx-auto flex aspect-square w-full max-w-md flex-col justify-center overflow-hidden rounded-xl border shadow-sm" style={{
      backgroundColor: kit.colors.background, color: readableTextColor(kit.colors.background), fontFamily: brandFontFamily(kit.typography.bodyFont),
      textAlign: kit.layout.textAlignment, padding, paddingTop: topLogo ? padding + 64 : padding,
      paddingBottom: topLogo ? padding : padding + 64, borderColor: kit.colors.primary,
    }}>
      {template === "quote" && <span aria-hidden="true" className="text-4xl font-bold leading-none sm:text-6xl" style={{ color: kit.colors.accent, fontFamily: brandFontFamily(kit.typography.headingFont) }}>&ldquo;</span>}
      {template === "sale" && <span className="mb-4 self-start rounded-full px-3 py-1 text-sm font-bold" style={{ backgroundColor: kit.colors.accent, color: readableTextColor(kit.colors.accent), alignSelf: kit.layout.textAlignment === "center" ? "center" : kit.layout.textAlignment === "right" ? "flex-end" : "flex-start" }}>JUST FOR YOU</span>}
      <h4 className="text-xl font-bold leading-tight sm:text-3xl" style={{ color: kit.colors.primary, fontFamily: brandFontFamily(kit.typography.headingFont) }}>
        {template === "quote" ? "Small moments. Lasting impressions." : template === "sale" ? "A little more of what you love." : "Something good is coming."}
      </h4>
      <p className="mt-2 text-xs leading-relaxed sm:mt-4 sm:text-sm">{template === "quote" ? "Made with care, shared with you." : template === "sale" ? "Discover this week’s favorites and make them yours." : "A fresh idea, a familiar feeling. Stay close for the reveal."}</p>
      <div className="absolute flex h-12 max-w-[45%] items-center" style={{
        [topLogo ? "top" : "bottom"]: padding,
        [kit.layout.logoPosition.endsWith("right") ? "right" : "left"]: padding,
      }}>
        {url ? <img src={url} alt={`${name} brand logo`} referrerPolicy="no-referrer" className="max-h-12 max-w-full object-contain" onError={() => setPreview({ scope, url: "" })} />
          : <span className="truncate text-sm font-bold" style={{ color: kit.colors.primary }}>{name}</span>}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Sample copy. Changes preview before saving.</span><button type="button" disabled={archived} onClick={() => setRefresh((value) => value + 1)} className="min-h-11 px-1 font-medium text-violet-700 disabled:opacity-50">Refresh logo preview</button></div>
  </aside>;
}
