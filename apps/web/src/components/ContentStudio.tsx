import { useState, type FormEvent } from "react";
import { Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  generateCaption,
  reviseCaption,
  type CaptionLength,
  type CaptionTone,
} from "@/lib/aiContent";
import { createPost, type Post, type PostPlatform } from "@/lib/posts";

const platformOptions: { value: PostPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];

const toneOptions: { value: CaptionTone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "bold", label: "Bold" },
  { value: "educational", label: "Educational" },
  { value: "playful", label: "Playful" },
  { value: "inspirational", label: "Inspirational" },
];

const lengthOptions: { value: CaptionLength; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

type ContentStudioProps = {
  selectedWorkspaceId: string;
  onPostSaved: (post: Post) => void;
};

export function ContentStudio({
  selectedWorkspaceId,
  onPostSaved,
}: ContentStudioProps) {
  const [savingDraft, setSavingDraft] = useState(false);
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState<PostPlatform>("instagram");
  const [tone, setTone] = useState<CaptionTone>("friendly");
  const [audience, setAudience] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [length, setLength] = useState<CaptionLength>("medium");
  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revising, setRevising] = useState(false);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (brief.trim().length < 3) {
      setError("Enter a brief with at least 3 characters.");
      return;
    }

    setGenerating(true);
    setError("");
    setNotice("");

    try {
      const result = await generateCaption({
        brief: brief.trim(),
        platform,
        tone,
        audience: audience.trim() || "General audience",
        callToAction: callToAction.trim(),
        length,
      });

      setCaption(result);
      setNotice("Caption generated. Review and edit it before using it.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate a caption. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleReviseCaption() {
    if (!caption.trim()) {
      setError("Enter or generate a caption before revising it.");
      return;
    }

    if (revisionInstruction.trim().length < 3) {
      setError("Describe how you want to revise the caption.");
      return;
    }

    setRevising(true);
    setError("");
    setNotice("");

    try {
      const revisedCaption = await reviseCaption({
        caption: caption.trim(),
        instruction: revisionInstruction.trim(),
        platform,
      });

      setCaption(revisedCaption);
      setNotice("Caption revised. Review and edit it before saving.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to revise the caption. Please try again.",
      );
    } finally {
      setRevising(false);
    }
  }

  async function handleSaveDraft() {
    const trimmedCaption = caption.trim();

    if (!selectedWorkspaceId) {
      setError("Select a workspace before saving a draft.");
      return;
    }

    if (!trimmedCaption) {
      setError("Generate or enter a caption before saving.");
      return;
    }

    setSavingDraft(true);
    setError("");
    setNotice("");

    try {
      const post = await createPost({
        workspaceId: selectedWorkspaceId,
        caption: trimmedCaption,
        platforms: [platform],
      });

      onPostSaved(post);
      setNotice("Draft saved to your workspace.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save the draft. Please try again.",
      );
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              Content Studio
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Turn your campaign ideas into platform-ready social captions.
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleGenerate} className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Campaign brief
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Describe your product, campaign, offer, or topic. Include only
              claims you can substantiate.
            </p>
          </div>

          <div>
            <label
              htmlFor="studio-brief"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              What would you like to promote?
            </label>
            <textarea
              id="studio-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              maxLength={3000}
              rows={6}
              required
              minLength={3}
              placeholder="Example: Introduce our reusable water bottle for everyday use. Highlight its design and encourage customers to explore the collection."
              className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {brief.length}/3000
            </p>
          </div>

          <div>
            <label
              htmlFor="studio-platform"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Target platform
            </label>
            <select
              id="studio-platform"
              value={platform}
              onChange={(event) =>
                setPlatform(event.target.value as PostPlatform)
              }
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            >
              {platformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="studio-tone"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Writing tone
            </label>
            <select
              id="studio-tone"
              value={tone}
              onChange={(event) => setTone(event.target.value as CaptionTone)}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            >
              {toneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="studio-audience"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Target audience
            </label>
            <input
              id="studio-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              maxLength={500}
              placeholder="e.g. Small business owners"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div>
            <label
              htmlFor="studio-cta"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Call to action
            </label>
            <input
              id="studio-cta"
              value={callToAction}
              onChange={(event) => setCallToAction(event.target.value)}
              maxLength={300}
              placeholder="e.g. Explore the collection"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div>
            <label
              htmlFor="studio-length"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Caption length
            </label>
            <select
              id="studio-length"
              value={length}
              onChange={(event) =>
                setLength(event.target.value as CaptionLength)
              }
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            >
              {lengthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            disabled={generating || brief.trim().length < 3}
            className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <WandSparkles size={17} />
            {generating ? "Generating caption..." : "Generate caption"}
          </Button>
        </section>

        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Review your caption
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Edit the generated copy before saving it to your workspace.
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold capitalize text-violet-700">
              {platform}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">
              {tone}
            </span>
          </div>

          <label
            htmlFor="studio-caption"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Caption editor
          </label>
          <textarea
            id="studio-caption"
            value={caption}
            onChange={(event) => {
              setCaption(event.target.value);
              setNotice("");
            }}
            maxLength={10000}
            rows={14}
            placeholder="Your generated caption will appear here. You can also write or paste your own caption."
            className="min-h-64 w-full flex-1 resize-y rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />

          <p className="mt-2 text-right text-xs text-slate-400">
            {caption.length} characters
          </p>

          <div className="mt-4 space-y-2">
            <label
              htmlFor="studio-revision-instruction"
              className="block text-sm font-medium text-slate-700"
            >
              How would you like to improve this caption?
            </label>

            <textarea
              id="studio-revision-instruction"
              value={revisionInstruction}
              onChange={(event) => setRevisionInstruction(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. Make it shorter and add a stronger call to action."
              className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />

            <Button
              type="button"
              disabled={
                revising ||
                generating ||
                savingDraft ||
                !caption.trim() ||
                revisionInstruction.trim().length < 3
              }
              onClick={() => void handleReviseCaption()}
              className="w-full rounded-xl border border-violet-200 bg-white py-3 font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {revising ? "Revising caption..." : "Revise caption"}
            </Button>
          </div>

          <Button
            type="button"
            disabled={
              savingDraft ||
              generating ||
              !caption.trim() ||
              !selectedWorkspaceId
            }
            onClick={() => void handleSaveDraft()}
            className="mt-3 w-full rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {savingDraft ? "Saving draft..." : "Save as draft"}
          </Button>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
            >
              {notice}
            </p>
          )}

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Generated content is not published. Check facts, links, hashtags,
            and platform requirements before using it.
          </p>
        </section>
      </form>
    </section>
  );
}
