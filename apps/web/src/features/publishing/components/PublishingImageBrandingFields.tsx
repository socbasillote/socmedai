import { useEffect } from "react";

import { validatePublishingBrandingSettings, type PublishingBrandingSettings } from "../publishingImageBranding";

import { useWorkspaceLogoAvailability } from "@/features/image-studio/hooks/useWorkspaceLogoAvailability";

import { WorkspaceLogoUploader } from "@/features/image-studio/components/WorkspaceLogoUploader";

import { BrandingPlacementPreview } from "@/features/image-studio/components/BrandingPlacementPreview";

import type { ImageAspectRatio, ImageBrandingPosition } from "@/lib/imageGeneration";

export type PublishingLogoAvailability = {
  workspaceId: string | null;
  status: string;
  available: boolean;
  defaultLogoPosition?: ImageBrandingPosition;
};

type Props = {
  workspaceId: string | null;
  aspectRatio: ImageAspectRatio;
  value: PublishingBrandingSettings;
  onChange: (value: PublishingBrandingSettings) => void;
  disabled?: boolean;
  onLogoAvailabilityChange?: (value: PublishingLogoAvailability) => void;
};

export function PublishingImageBrandingFields({
  workspaceId,
  aspectRatio,
  value,
  onChange,
  disabled = false,
  onLogoAvailabilityChange,
}: Props) {
  const {
    status: logoStatus,
    logoAvailable,
    brandKit,
    refresh: refreshLogoAvailability,
  } = useWorkspaceLogoAvailability(workspaceId);

  const defaultLogoPosition = brandKit?.layout.logoPosition;
  useEffect(() => {
    onLogoAvailabilityChange?.({
      workspaceId,
      status: logoStatus,
      available: logoStatus === "available" && logoAvailable,
      ...(defaultLogoPosition ? { defaultLogoPosition } : {}),
    });
  }, [workspaceId, logoStatus, logoAvailable, defaultLogoPosition, onLogoAvailabilityChange]);

  const update = (changes: Partial<PublishingBrandingSettings>) => {
    onChange({
      ...value,
      ...changes,
    });
  };

  const validationError = validatePublishingBrandingSettings(
    value,
    logoAvailable,
  );

  return (
    <fieldset
      disabled={disabled || !workspaceId}
      className="space-y-4 rounded-xl border border-slate-200 p-4"
    >
      <legend className="px-2 text-sm font-semibold text-slate-800">
        Image branding (optional)
      </legend>

      <p className="text-xs leading-5 text-slate-600">
        Add your workspace logo or a text label to the generated image.
      </p>

      <WorkspaceLogoUploader
        workspaceId={workspaceId}
        disabled={disabled || !workspaceId}
        onReady={refreshLogoAvailability}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        {(
          [
            { value: "none", label: "No branding" },
            { value: "logo", label: "Workspace logo" },
            { value: "text", label: "Text label" },
          ] as const
        ).map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-xl border p-3 text-center ${
              value.mode === option.value
                ? "border-violet-500 bg-violet-50"
                : "border-slate-200"
            }`}
          >
            <input
              type="radio"
              name="publishing-image-branding"
              value={option.value}
              checked={value.mode === option.value}
              onChange={() => update({ mode: option.value })}
              className="sr-only"
            />

            <span className="text-xs font-semibold">{option.label}</span>
          </label>
        ))}
      </div>

      {value.mode === "logo" && (
        <div className="space-y-2">
          {logoStatus === "loading" && (
            <p role="status" className="text-xs text-slate-600">
              Checking workspace logo availability...
            </p>
          )}

          {logoStatus === "error" && (
            <p role="alert" className="text-xs text-rose-700">
              Unable to verify workspace logo availability.
            </p>
          )}

          {logoStatus === "unavailable" && (
            <p role="status" className="text-xs text-amber-800">
              Upload and enable a workspace logo before generating a branded
              image.
            </p>
          )}
        </div>
      )}

      {value.mode === "text" && (
        <div className="space-y-2">
          <label
            htmlFor="publishing-branding-text"
            className="block text-xs font-semibold text-slate-700"
          >
            Branding text
          </label>

          <input
            id="publishing-branding-text"
            type="text"
            maxLength={80}
            value={value.text}
            onChange={(event) => update({ text: event.target.value })}
            placeholder="e.g. BREW CO."
            className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-violet-500"
          />

          <p className="text-right text-xs text-slate-500">
            {value.text.length}/80
          </p>
        </div>
      )}

      {value.mode !== "none" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="publishing-branding-position"
              className="block text-xs font-semibold text-slate-700"
            >
              Branding position
            </label>

            <select
              id="publishing-branding-position"
              value={value.position}
              onChange={(event) =>
                update({
                  position: event.target.value as ImageBrandingPosition,
                })
              }
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            >
              <option value="top-left">Top left</option>
              <option value="top-right">Top right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="bottom-right">Bottom right</option>
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="publishing-branding-size"
              className="block text-xs font-semibold text-slate-700"
            >
              Branding size: {value.sizePercent}%
            </label>

            <input
              id="publishing-branding-size"
              type="range"
              min={5}
              max={30}
              step={1}
              value={value.sizePercent}
              onChange={(event) =>
                update({
                  sizePercent: Number(event.target.value),
                })
              }
              className="w-full accent-violet-600"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="publishing-branding-opacity"
              className="block text-xs font-semibold text-slate-700"
            >
              Branding opacity: {value.opacityPercent}%
            </label>

            <input
              id="publishing-branding-opacity"
              type="range"
              min={10}
              max={100}
              step={5}
              value={value.opacityPercent}
              onChange={(event) =>
                update({
                  opacityPercent: Number(event.target.value),
                })
              }
              className="w-full accent-violet-600"
            />
          </div>
        </div>
      )}

      <BrandingPlacementPreview
        aspectRatio={aspectRatio}
        brandingMode={value.mode}
        text={value.text}
        position={value.position}
        sizePercent={value.sizePercent}
        opacity={value.opacityPercent}
      />

      {validationError && (
        <p role="alert" className="text-xs text-rose-700">
          {validationError}
        </p>
      )}

      <p className="text-xs leading-5 text-slate-500">
        Branding will be applied to the generated image itself, not to the post
        caption.
      </p>
    </fieldset>
  );
}
