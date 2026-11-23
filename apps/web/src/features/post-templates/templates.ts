import { z } from "zod";
import type { BrandKit } from "@/lib/brandKit";

export const templateIds = ["quote", "product", "sale", "event", "custom"] as const;
export type TemplateId = typeof templateIds[number];
type Field = { key: string; label: string; max: number; required?: boolean; type?: "date" | "textarea" };
export type PostTemplate = { id: TemplateId; name: string; category: string; description: string; sample: string; fields: Field[]; photoLabel: string; photoRequired?: boolean };
export const postTemplates: PostTemplate[] = [
  { id: "quote", name: "Editorial Portrait Quote", category: "Quotes", description: "An editorial quote with an optional portrait on the right.", sample: "Small steps.\nExtraordinary journeys.", photoLabel: "Portrait", fields: [
    { key: "quote", label: "Quote", max: 240, required: true, type: "textarea" }, { key: "author", label: "Author name", max: 60 },
  ] },
  { id: "product", name: "Minimal Product Spotlight", category: "Products", description: "Your product, centered with generous whitespace.", sample: "Meet your\nnew favorite.", photoLabel: "Product photo", photoRequired: true, fields: [
    { key: "name", label: "Product name", max: 80, required: true }, { key: "tagline", label: "Tagline", max: 120 },
  ] },
  { id: "sale", name: "Bold Sale Promo", category: "Promos", description: "A prominent offer and a dedicated product area.", sample: "BIG NEWS.\nBIGGER SAVINGS.", photoLabel: "Product photo", fields: [
    { key: "headline", label: "Offer headline", max: 90, required: true }, { key: "price", label: "Price", max: 35 }, { key: "cta", label: "Call to action", max: 45 },
  ] },
  { id: "event", name: "Event Announcement", category: "Announcements", description: "A clear title, prominent date, and space for your speaker.", sample: "Something\nworth showing up for.", photoLabel: "Speaker photo", fields: [
    { key: "name", label: "Event name", max: 90, required: true }, { key: "date", label: "Event date", max: 10, required: true, type: "date" },
    { key: "venue", label: "Venue", max: 80 }, { key: "cta", label: "Call to action", max: 45 },
  ] },
  { id: "custom", name: "Custom", category: "Custom", description: "Describe your own image. Add editable text if you want it.", sample: "Your idea.\nYour direction.", photoLabel: "Photo", fields: [
    { key: "brief", label: "Image details", max: 1800, required: true, type: "textarea" }, { key: "headline", label: "Headline", max: 120 }, { key: "tagline", label: "Supporting text", max: 120 },
  ] },
];
export const templateDraftSchema = z.object({
  templateId: z.enum(templateIds), values: z.record(z.string(), z.string().max(1800)),
  brandChoice: z.enum(["yes", "no"]).nullable(), format: z.enum(["square", "portrait", "landscape"]),
  photoAssetId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});
export type TemplateDraft = z.infer<typeof templateDraftSchema>;
export function newTemplateDraft(templateId: TemplateId): TemplateDraft {
  return { templateId, values: {}, brandChoice: null, format: "square" };
}
export function templateProblem(draft: TemplateDraft): string | null {
  const template = postTemplates.find(t => t.id === draft.templateId)!;
  if (!draft.brandChoice) return "Choose whether to include the workspace brand kit.";
  for (const field of template.fields) {
    const value = draft.values[field.key]?.trim() ?? "";
    if (field.required && !value) return `Enter ${field.label.toLowerCase()}.`;
    if (value.length > field.max) return `${field.label} is too long.`;
  }
  if (draft.templateId === "event") {
    const date = draft.values.date ?? "";
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "Choose a valid event date.";
  }
  if (template.photoRequired && !draft.photoAssetId) return "Upload a product photo.";
  if (draft.templateId === "custom" && (draft.values.brief?.trim().length ?? 0) < 10) return "Describe your image in at least 10 characters.";
  return null;
}
export function backgroundPrompt(draft: TemplateDraft, kit?: BrandKit): string {
  const template = postTemplates.find(t => t.id === draft.templateId)!;
  return [
    draft.templateId === "custom" ? draft.values.brief : `Create a subtle background texture for a ${template.name} social media design. Keep the center quiet and uncluttered.`,
    draft.templateId === "custom"
      ? "Do not include text, letters, numbers, or logos. Any headline and uploaded photo will be added separately."
      : "Do not include text, letters, numbers, logos, people, or products. Text and uploaded photos are added separately.",
    kit ? `Use primary ${kit.colors.primary} and accent ${kit.colors.accent} where appropriate. Choose the background freely to suit the subject. Visual style: ${kit.imageStyle || "clean and refined"}.` : "Use a neutral, subtle palette.",
  ].join("\n");
}
export function templateCaption(draft: TemplateDraft): string {
  return postTemplates.find(t => t.id === draft.templateId)!.fields
    .filter(f => f.key !== "brief").map(f => draft.values[f.key]?.trim()).filter(Boolean).join("\n\n");
}
