import type { VisualStyle } from "./visualStyles";

export const aiPostTypeIds = ["quote", "product", "promo", "announcement", "event", "education", "custom"] as const;
export type AIPostType = typeof aiPostTypeIds[number];
export type AIPostContent = Partial<Record<AIPostType, Record<string, string>>>;
type ContentField = { key: string; label: string; max: number; required?: boolean; multiline?: boolean; type?: "date" | "url"; placeholder?: string };
type PostTypeDefinition = { id: AIPostType; name: string; description: string; suggested: readonly VisualStyle[]; fields: readonly ContentField[]; photoLabel?: string };
const details: ContentField = { key: "details", label: "Additional details", max: 600, multiline: true };
export const aiPostTypes: readonly PostTypeDefinition[] = [
  { id: "quote", name: "Quotes", description: "Share a thought or inspire your audience.", suggested: ["editorial", "minimal"], photoLabel: "Portrait photo", fields: [] },
  { id: "product", name: "Products", description: "Put a product and its benefits in focus.", suggested: ["product-studio", "lifestyle"], photoLabel: "Product photo", fields: [
    { key: "name", label: "Product name", required: true, max: 100, placeholder: "House blend iced coffee" },
    { key: "benefit", label: "Key benefit", required: true, max: 300, multiline: true, placeholder: "Smooth, refreshing coffee brewed fresh every morning." },
    { key: "audience", label: "Who is it for?", max: 150 }, details,
  ] },
  { id: "promo", name: "Promos", description: "Highlight an offer or a limited-time deal.", suggested: ["product-studio", "cinematic"], photoLabel: "Product photo", fields: [
    { key: "offer", label: "Offer", required: true, max: 200, placeholder: "Buy one iced coffee, get one free" },
    { key: "price", label: "Price", max: 60 }, { key: "deadline", label: "Offer ends", type: "date", max: 10 },
    { key: "cta", label: "Call to action", max: 100, placeholder: "Visit our store this weekend" }, details,
  ] },
  { id: "announcement", name: "Announcements", description: "Tell people what’s new and why it matters.", suggested: ["editorial", "minimal"], fields: [
    { key: "news", label: "What’s new?", required: true, max: 200, placeholder: "Our second store opens next week" },
    { key: "information", label: "What should people know?", required: true, max: 600, multiline: true }, details,
  ] },
  { id: "event", name: "Events", description: "Invite your audience to something worth attending.", suggested: ["editorial", "cinematic"], photoLabel: "Speaker photo", fields: [
    { key: "name", label: "Event name", required: true, max: 120 }, { key: "date", label: "Event date", type: "date", required: true, max: 10 },
    { key: "venue", label: "Venue", max: 150 }, { key: "link", label: "Registration link", type: "url", max: 300 }, details,
  ] },
  { id: "education", name: "Tips & Education", description: "Explain an idea or share something useful.", suggested: ["illustration", "minimal"], fields: [
    { key: "topic", label: "Topic", required: true, max: 200 }, { key: "audience", label: "Audience", required: true, max: 150 },
    { key: "points", label: "Key points", max: 600, multiline: true }, details,
  ] },
  { id: "custom", name: "Custom", description: "Start with your own description.", suggested: [], fields: [] },
];
export function postContentFields(type: AIPostType, content: Record<string, string>): readonly ContentField[] {
  if (type !== "quote") return aiPostTypes.find(item => item.id === type)!.fields;
  return content.mode === "topic" ? [
    { key: "topic", label: "Quote topic", required: true, max: 300, multiline: true, placeholder: "Finding confidence in small daily steps" }, details,
  ] : [
    { key: "quote", label: "Quote", required: true, max: 240, multiline: true, placeholder: "Enter your exact quote." },
    { key: "author", label: "Quote author", max: 60 }, details,
  ];
}
export function aiPostContentProblem(type: AIPostType | null, content: Record<string, string>, customBrief: string): string | null {
  if (!type) return "Choose a post type.";
  if (type === "custom") return customBrief.trim().length < 3 ? "Describe your post in at least three characters." : customBrief.length > 2800 ? "Keep your description within 2,800 characters." : null;
  for (const field of postContentFields(type, content)) {
    const value = content[field.key]?.trim() ?? "";
    if (field.required && !value) return `Enter ${field.label.toLowerCase()}.`;
    if (value.length > field.max) return `${field.label} is too long.`;
    if (value && field.type === "date") {
      const parsed = new Date(`${value}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return `Choose a valid ${field.label.toLowerCase()}.`;
    }
    if (value && field.type === "url") {
      try { if (!["https:", "http:"].includes(new URL(value).protocol)) return "Enter a valid registration link."; }
      catch { return "Enter a valid registration link."; }
    }
  }
  if (type === "quote" && content.mode !== "topic" && (content.quote ?? "").trim().split("\n").length > 8) return "Use up to eight lines in your quote.";
  return null;
}
export function buildAIPostBrief(type: AIPostType | null, content: Record<string, string>, customBrief: string): string {
  if (!type || type === "custom") return customBrief.trim();
  return [
    `Post type: ${aiPostTypes.find(item => item.id === type)!.name}.`,
    ...(type === "quote" ? [content.mode === "topic"
      ? "Create an original quote about the supplied topic. Leave it unattributed; do not invent an author. The quote should appear in the image."
      : "Create a quote post using the supplied exact wording. Preserve spelling, punctuation, and the supplied author. Do not invent an author. The quote should appear in the image."] : []),
    ...postContentFields(type, content).filter(field => content[field.key]?.trim()).map(field => `${field.label}: ${content[field.key].trim()}`),
    "Use only the facts supplied. Do not invent prices, offer terms, dates, links, or product claims.",
  ].join("\n");
}
