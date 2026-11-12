import type {
  ImageAspectRatio,
  ImageBrandingMode,
  ImageBrandingPosition,
} from "@/lib/imageGeneration";

type BrandingPlacementPreviewProps = {
  aspectRatio: ImageAspectRatio;
  brandingMode: ImageBrandingMode;
  text: string;
  position: ImageBrandingPosition;
  sizePercent: number;
  opacity: number;
};

const ASPECT_RATIO_VALUES = {
  square: "1 / 1",
  portrait: "2 / 3",
  landscape: "3 / 2",
} as const;

const POSITION_CLASSES = {
  "top-left": "top-[5%] left-[5%]",
  "top-right": "top-[5%] right-[5%]",
  "bottom-left": "bottom-[5%] left-[5%]",
  "bottom-right": "bottom-[5%] right-[5%]",
} as const;

export function BrandingPlacementPreview({
  aspectRatio,
  brandingMode,
  text,
  position,
  sizePercent,
  opacity,
}: BrandingPlacementPreviewProps) {
  const isText = brandingMode === "text";
  const isLogo = brandingMode === "logo";

  const label = isText ? text.trim() || "Your text" : "Workspace logo";

  return (
    <section
      aria-label="Branding placement preview"
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-800">
          Branding preview
        </h3>

        <p className="text-xs text-slate-500">
          Approximate placement only. The final image will be rendered by Storm.
        </p>
      </div>

      <div className="flex justify-center">
        <div
          className="relative w-full max-w-[300px] overflow-hidden rounded-xl bg-gradient-to-br from-slate-500 via-slate-700 to-slate-900 shadow-sm"
          style={{
            aspectRatio: ASPECT_RATIO_VALUES[aspectRatio],
          }}
        >
          {/* Decorative mock image background. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-1/3 w-1/3 rounded-full bg-white/10 blur-xl" />
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="select-none text-center text-xs font-medium tracking-widest text-white/30">
              IMAGE AREA
            </span>
          </div>

          {brandingMode !== "none" && (
            <div
              className={`absolute flex items-center justify-center ${
                POSITION_CLASSES[position]
              }`}
              style={{
                opacity: opacity / 100,
                maxWidth: `${Math.min(80, Math.max(28, sizePercent * 2.5))}%`,
              }}
            >
              {isText && (
                <span
                  className="break-words text-center text-xs font-bold text-white"
                  style={{
                    overflowWrap: "anywhere",
                    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                    fontSize: `${Math.max(
                      10,
                      Math.min(18, sizePercent * 0.6),
                    )}px`,
                  }}
                >
                  {label}
                </span>
              )}

              {isLogo && (
                <div className="rounded-md border border-white/50 bg-white/20 px-2 py-1 text-center text-[10px] font-bold text-white shadow-sm">
                  {label}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 text-center text-xs text-slate-500">
        {brandingMode === "none" ? (
          <p>No branding will be applied.</p>
        ) : (
          <>
            <p>
              {isText ? "Text label" : "Workspace logo"}
              {" · "}
              {position.replace("-", " ")}
            </p>

            <p>
              Size: {sizePercent}% · Opacity: {opacity}%
            </p>
          </>
        )}
      </div>
    </section>
  );
}
