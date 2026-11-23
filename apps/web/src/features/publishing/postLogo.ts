import { getWorkspaceLogo, getWorkspaceLogoPreview, type LogoVariant } from "@/lib/workspaceLogo";
import type { ImageBrandingPosition } from "@/lib/imageGeneration";
export type PostLogo = { position: ImageBrandingPosition; variant: LogoVariant };
export async function drawPostLogo(canvas: HTMLCanvasElement, workspaceId: string, logo?: PostLogo) {
  if (!logo) return;
  let variant = logo.variant;
  const selected = await getWorkspaceLogo(workspaceId, variant);
  if (!selected.enabled || !selected.logo) variant = "primary";
  if (variant === "primary" && logo.variant !== "primary") {
    const primary = await getWorkspaceLogo(workspaceId);
    if (!primary.enabled || !primary.logo) throw new Error("Enable a workspace logo before including it.");
  } else if (!selected.enabled || !selected.logo) throw new Error("Enable a workspace logo before including it.");
  const access = await getWorkspaceLogoPreview(workspaceId, variant);
  const response = await fetch(access.url);
  if (!response.ok) throw new Error("Could not load the workspace logo.");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not apply the workspace logo.");
    const scale = Math.min(canvas.width * 0.16 / bitmap.width, canvas.height * 0.12 / bitmap.height);
    const width = bitmap.width * scale, height = bitmap.height * scale;
    const margin = Math.min(canvas.width, canvas.height) * 0.04;
    context.drawImage(bitmap, logo.position.endsWith("right") ? canvas.width - width - margin : margin, logo.position.startsWith("bottom") ? canvas.height - height - margin : margin, width, height);
  } finally { bitmap.close(); }
}
export async function addPostLogo(file: File, workspaceId: string, logo?: PostLogo): Promise<File> {
  if (!logo) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Could not prepare the image.");
    context.drawImage(bitmap, 0, 0); await drawPostLogo(canvas, workspaceId, logo);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(new File([blob], file.name, { type: "image/png" })) : reject(new Error("Could not export the branded image.")), "image/png"));
  } finally { bitmap.close(); }
}
