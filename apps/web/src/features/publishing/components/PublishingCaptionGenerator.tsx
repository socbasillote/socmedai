import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  generateCaption,
  type CaptionLength,
  type CaptionTone,
} from "@/lib/aiContent";
import type { PostPlatform } from "@/lib/posts";

type Props = {
  disabled: boolean;
  initialBrief: string;
  defaultPlatform: PostPlatform;
  defaultLanguage?: string;
  hasCaption: boolean;
  onApply: (caption: string) => void;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
const buttonClass =
  "rounded-lg border border-violet-300 bg-white px-2 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50";

export function PublishingCaptionGenerator({
  disabled,
  initialBrief,
  defaultPlatform,
  defaultLanguage = "en",
  hasCaption,
  onApply,
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(initialBrief.slice(0, 3000));
  const [platform, setPlatform] = useState<PostPlatform>(defaultPlatform);
  const [tone, setTone] = useState<CaptionTone>("friendly");
  const [language, setLanguage] = useState(defaultLanguage);
  const [length, setLength] = useState<CaptionLength>("medium");
  const [audience, setAudience] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function generate() {
    if (disabled || inFlight.current) return;
    const normalizedBrief = brief.trim();
    if (normalizedBrief.length < 3 || normalizedBrief.length > 3000) {
      setError("Describe your post in 3-3,000 characters.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError("");
    setSuggestion("");
    try {
      const caption = await generateCaption({
        brief: normalizedBrief,
        platform,
        language: language as import("@/lib/aiContent").GenerateCaptionInput["language"],
        tone,
        length,
        audience: audience.trim(),
        callToAction: callToAction.trim(),
      });
      if (!active.current) return;
      if (
        typeof caption !== "string" ||
        !caption.trim() ||
        caption.length > 10000
      ) {
        throw new Error("AI returned an invalid caption. Please try again.");
      }
      setSuggestion(caption.trim());
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to generate a caption. Please try again.",
        );
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(!open)}
        className={`${buttonClass} inline-flex items-center gap-2`}
      >
        <Sparkles size={16} aria-hidden="true" />
        {open ? "Hide caption AI" : "Generate caption with AI"}
      </button>
      {open && (
        <section
          id={`${id}-panel`}
          aria-label="AI Caption Generator"
          className="mt-3 space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Write a caption with AI
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Describe your idea, then review the suggestion before using it in
              your post.
            </p>
          </div>
          <fieldset disabled={disabled || pending} className="space-y-4">
            <div>
              <label
                htmlFor={`${id}-brief`}
                className="text-sm font-normal text-slate-700"
              >
                What is this post about?
              </label>
              <textarea
                id={`${id}-brief`}
                rows={3}
                maxLength={3000}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="Share the topic, product details, or campaign message..."
                className={fieldClass}
              />
            </div>
            <label className="block text-sm text-slate-700">Content language<select className={fieldClass} value={language} onChange={(e) => setLanguage(e.target.value)}>{Object.entries({ en: "English", fil: "Filipino", es: "Spanish", fr: "French", de: "German", ja: "Japanese", ko: "Korean", pt: "Portuguese", zh: "Chinese" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor={`${id}-platform`}
                  className="text-sm font-normal text-slate-700"
                >
                  Caption style
                </label>
                <select
                  id={`${id}-platform`}
                  value={platform}
                  onChange={(event) =>
                    setPlatform(event.target.value as PostPlatform)
                  }
                  className={fieldClass}
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor={`${id}-tone`}
                  className="text-sm font-normal text-slate-700"
                >
                  Tone
                </label>
                <select
                  id={`${id}-tone`}
                  value={tone}
                  onChange={(event) =>
                    setTone(event.target.value as CaptionTone)
                  }
                  className={fieldClass}
                >
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="bold">Bold</option>
                  <option value="educational">Educational</option>
                  <option value="playful">Playful</option>
                  <option value="inspirational">Inspirational</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor={`${id}-length`}
                  className="text-sm font-normal text-slate-700"
                >
                  Length
                </label>
                <select
                  id={`${id}-length`}
                  value={length}
                  onChange={(event) =>
                    setLength(event.target.value as CaptionLength)
                  }
                  className={fieldClass}
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`${id}-audience`}
                  className="text-sm font-normal text-slate-700"
                >
                  Audience (optional)
                </label>
                <input
                  id={`${id}-audience`}
                  value={audience}
                  maxLength={500}
                  onChange={(event) => setAudience(event.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label
                  htmlFor={`${id}-cta`}
                  className="text-sm font-normal text-slate-700"
                >
                  Call to action (optional)
                </label>
                <input
                  id={`${id}-cta`}
                  value={callToAction}
                  maxLength={300}
                  onChange={(event) => setCallToAction(event.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          </fieldset>
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => void generate()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {pending
              ? "Generating caption..."
              : suggestion
                ? "Generate another caption"
                : "Generate caption"}
          </button>
          {pending && (
            <p role="status" className="text-sm text-slate-600">
              Writing your caption...
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          {suggestion && (
            <div
              className="space-y-3 rounded-lg border border-violet-200 bg-white p-4"
              aria-live="polite"
            >
              <h4 className="text-sm font-semibold text-slate-900">
                Suggested caption
              </h4>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {suggestion}
              </p>
              <p className="text-xs text-slate-500">
                {hasCaption
                  ? "Using this suggestion replaces your current caption."
                  : "Using this suggestion fills the post caption."}{" "}
                Review the details before publishing.
              </p>
              <button
                type="button"
                disabled={disabled || pending}
                className={buttonClass}
                onClick={() => {
                  if (disabled || pending) return;
                  onApply(suggestion);
                  setSuggestion("");
                  setOpen(false);
                }}
              >
                Use this caption
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
