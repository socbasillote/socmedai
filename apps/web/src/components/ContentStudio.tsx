import { useRef, useState, type FormEvent } from "react";
import { Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  generateCaption,
  generateCaptionVariations,
  generatePlatformCaptions,
  reviseCaption,
  type CaptionVariation,
  type CaptionVariationStyle,
  type CaptionLength,
  type CaptionTone,
} from "@/lib/aiContent";

import {
  createPost,
  updateDraftPost,
  type Post,
  type PostPlatform,
} from "@/lib/posts";

import {
  parseLocalScheduleDate,
  toScheduledAtISOString,
} from "@/shared/utils/schedulingDate";

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

const variationLabels: Record<CaptionVariationStyle, string> = {
  engaging: "Engaging",
  informative: "Informative",
  concise: "Concise",
};

const variationDescriptions: Record<CaptionVariationStyle, string> = {
  engaging: "Designed to start conversations and encourage interaction.",
  informative:
    "Focused on clarity, useful details, and explaining your message.",
  concise: "A shorter, direct approach with a memorable message.",
};

type ContentStudioProps = {
  selectedWorkspaceId: string;

  linkedInConnectionId: string | null;
  linkedInDisplayName: string | null;
  linkedInStatus: string;

  onPostSaved: (post: Post) => void;
};

type PostSaveMode = "draft" | "scheduled";

type DualPlatform = "facebook" | "linkedin";

type DualPlatformCaptions = Record<DualPlatform, string>;

type DualPlatformSaved = Record<DualPlatform, boolean>;

const dualPlatformLabels: Record<DualPlatform, string> = {
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

const dualPlatforms: DualPlatform[] = ["facebook", "linkedin"];

type SavedPlatformDraft = {
  postId: string;
  workspaceId: string;
  savedCaption: string;
};

type SavedPlatformDrafts = Record<DualPlatform, SavedPlatformDraft | null>;

const emptySavedPlatformDrafts = (): SavedPlatformDrafts => ({
  facebook: null,
  linkedin: null,
});

export function ContentStudio({
  selectedWorkspaceId,
  linkedInConnectionId,
  linkedInDisplayName,
  linkedInStatus,
  onPostSaved,
}: ContentStudioProps) {
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

  const [savingDraft, setSavingDraft] = useState(false);

  const [postSaveMode, setPostSaveMode] = useState<PostSaveMode>("draft");

  const [scheduledAt, setScheduledAt] = useState("");

  const [variations, setVariations] = useState<CaptionVariation[]>([]);

  const [generatingVariations, setGeneratingVariations] = useState(false);

  const [selectedVariationStyle, setSelectedVariationStyle] =
    useState<CaptionVariationStyle | null>(null);

  const [platformCaptions, setPlatformCaptions] =
    useState<DualPlatformCaptions | null>(null);

  const [generatingPlatformCaptions, setGeneratingPlatformCaptions] =
    useState(false);

  const [savingPlatformDraft, setSavingPlatformDraft] =
    useState<DualPlatform | null>(null);

  const [platformDraftSaved, setPlatformDraftSaved] =
    useState<DualPlatformSaved>({
      facebook: false,
      linkedin: false,
    });

  const [platformCaptionError, setPlatformCaptionError] = useState("");

  const [platformCaptionNotice, setPlatformCaptionNotice] = useState("");

  // Prevents an outdated AI response from replacing
  // captions generated for newer campaign settings.
  const platformRequestId = useRef(0);

  // Prevents concurrent draft-save requests.
  const platformSaveLock = useRef(false);

  // Invalidates an unfinished request when the user
  // changes generation settings or starts another request.
  const variationRequestId = useRef(0);

  const [platformRevisionInstructions, setPlatformRevisionInstructions] =
    useState<Record<DualPlatform, string>>({
      facebook: "",
      linkedin: "",
    });

  const [revisingPlatform, setRevisingPlatform] = useState<DualPlatform | null>(
    null,
  );

  // Tracks changes to each caption independently.
  // Used to reject revision responses for outdated text.
  const platformCaptionVersions = useRef<Record<DualPlatform, number>>({
    facebook: 0,
    linkedin: 0,
  });

  // Prevent concurrent revision requests.
  const platformRevisionLock = useRef(false);

  const [savedPlatformDrafts, setSavedPlatformDrafts] =
    useState<SavedPlatformDrafts>(emptySavedPlatformDrafts);

  // Synchronously tracks the newest editor text.
  const latestPlatformCaptionsRef = useRef<DualPlatformCaptions | null>(null);

  // Captures the current workspace even when an
  // asynchronous save is still running.
  const activeWorkspaceIdRef = useRef(selectedWorkspaceId);

  activeWorkspaceIdRef.current = selectedWorkspaceId;

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (brief.trim().length < 3) {
      setError("Enter a brief with at least 3 characters.");
      return;
    }

    clearCaptionVariations();

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

  async function handleGenerateVariations(): Promise<void> {
    if (brief.trim().length < 3) {
      setError("Enter a brief with at least 3 characters.");
      return;
    }

    if (generating || generatingVariations || revising) {
      return;
    }

    const requestId = ++variationRequestId.current;

    setGeneratingVariations(true);
    setVariations([]);
    setSelectedVariationStyle(null);
    setError("");
    setNotice("");

    try {
      const result = await generateCaptionVariations({
        brief: brief.trim(),
        platform,
        tone,
        audience: audience.trim() || "General audience",
        callToAction: callToAction.trim(),
        length,
      });

      // Ignore a response if settings changed
      // while the request was in progress.
      if (variationRequestId.current !== requestId) {
        return;
      }

      setVariations(result);

      setNotice(
        "Three caption suggestions generated. " +
          "Choose one to use in the editor.",
      );
    } catch (err) {
      if (variationRequestId.current !== requestId) {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate caption variations.",
      );
    } finally {
      setGeneratingVariations(false);
    }
  }

  async function handleGeneratePlatformCaptions(): Promise<void> {
    if (brief.trim().length < 3) {
      setPlatformCaptionError(
        "Enter a campaign brief with at least 3 characters.",
      );
      return;
    }

    if (
      generating ||
      generatingVariations ||
      generatingPlatformCaptions ||
      revising ||
      savingDraft ||
      platformSaveLock.current
    ) {
      return;
    }

    const requestId = ++platformRequestId.current;

    setGeneratingPlatformCaptions(true);
    setPlatformCaptionError("");
    setPlatformCaptionNotice("");

    try {
      const result = await generatePlatformCaptions({
        brief: brief.trim(),
        tone,
        audience: audience.trim() || "General audience",
        callToAction: callToAction.trim(),
        length,
      });

      if (platformRequestId.current !== requestId) {
        return;
      }

      const nextCaptions: DualPlatformCaptions = {
        facebook: result.captions.facebook,
        linkedin: result.captions.linkedin,
      };

      // Replacing generated content invalidates older
      // revision responses.
      platformCaptionVersions.current.facebook += 1;
      platformCaptionVersions.current.linkedin += 1;

      latestPlatformCaptionsRef.current = nextCaptions;

      setPlatformCaptions(nextCaptions);

      setPlatformDraftSaved({
        facebook: false,
        linkedin: false,
      });

      setPlatformCaptionNotice(
        "Facebook and LinkedIn captions generated. " +
          "Review each caption before saving.",
      );
    } catch (error) {
      if (platformRequestId.current !== requestId) {
        return;
      }

      setPlatformCaptionError(
        error instanceof Error
          ? error.message
          : "Unable to generate platform captions.",
      );
    } finally {
      setGeneratingPlatformCaptions(false);
    }
  }

  function handlePlatformCaptionChange(
    platform: DualPlatform,
    value: string,
  ): void {
    // Invalidate any outstanding AI revision
    // for this particular platform.
    platformCaptionVersions.current[platform] += 1;

    if (latestPlatformCaptionsRef.current) {
      latestPlatformCaptionsRef.current = {
        ...latestPlatformCaptionsRef.current,
        [platform]: value,
      };
    }

    setPlatformCaptions((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [platform]: value,
      };
    });

    setPlatformDraftSaved((current) => ({
      ...current,
      [platform]: false,
    }));

    setPlatformCaptionError("");
    setPlatformCaptionNotice("");
  }

  async function handleRevisePlatformCaption(
    platform: DualPlatform,
  ): Promise<void> {
    if (platformRevisionLock.current) {
      return;
    }

    const originalCaption = platformCaptions?.[platform]?.trim() ?? "";

    const instruction = platformRevisionInstructions[platform].trim();

    if (!originalCaption) {
      setPlatformCaptionError(
        `Enter a ${dualPlatformLabels[platform]} caption first.`,
      );
      return;
    }

    if (instruction.length < 3) {
      setPlatformCaptionError("Describe how you want to revise the caption.");
      return;
    }

    if (
      generating ||
      generatingVariations ||
      generatingPlatformCaptions ||
      revising ||
      savingDraft ||
      savingPlatformDraft !== null ||
      platformSaveLock.current
    ) {
      return;
    }

    platformRevisionLock.current = true;

    const version = platformCaptionVersions.current[platform];

    setRevisingPlatform(platform);
    setPlatformCaptionError("");
    setPlatformCaptionNotice("");

    try {
      const revisedCaption = await reviseCaption({
        caption: originalCaption,
        instruction,
        platform,
      });

      // Do not overwrite text that changed while
      // this request was in progress.
      if (platformCaptionVersions.current[platform] !== version) {
        setPlatformCaptionNotice(
          "Your caption changed during AI revision. " +
            "The outdated result was not applied.",
        );
        return;
      }

      platformCaptionVersions.current[platform] += 1;

      if (latestPlatformCaptionsRef.current) {
        latestPlatformCaptionsRef.current = {
          ...latestPlatformCaptionsRef.current,
          [platform]: revisedCaption,
        };
      }

      setPlatformCaptions((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          [platform]: revisedCaption,
        };
      });

      setPlatformDraftSaved((current) => ({
        ...current,
        [platform]: false,
      }));

      setPlatformCaptionNotice(
        `${dualPlatformLabels[platform]} caption revised. ` +
          "Review the updated text before saving.",
      );
    } catch (error) {
      setPlatformCaptionError(
        error instanceof Error
          ? error.message
          : `Unable to revise the ${platform} caption.`,
      );
    } finally {
      platformRevisionLock.current = false;
      setRevisingPlatform(null);
    }
  }

  async function handleSavePlatformDraft(
    platform: DualPlatform,
  ): Promise<void> {
    // Prevent two saves from starting together.
    if (platformSaveLock.current) {
      return;
    }

    if (platformRevisionLock.current) {
      return;
    }

    const workspaceId = selectedWorkspaceId;

    const captionToSave = platformCaptions?.[platform]?.trim() ?? "";

    const existingDraft = savedPlatformDrafts[platform];

    if (!workspaceId) {
      setPlatformCaptionError("Select a workspace before saving.");
      return;
    }

    if (!captionToSave) {
      setPlatformCaptionError(
        `Enter a ${dualPlatformLabels[platform]} caption.`,
      );
      return;
    }

    if (existingDraft && existingDraft.workspaceId !== workspaceId) {
      setPlatformCaptionError(
        "This draft belongs to another workspace. " +
          "Switch back before saving.",
      );
      return;
    }

    // No API request when content is unchanged.
    if (existingDraft && existingDraft.savedCaption === captionToSave) {
      setPlatformCaptionNotice(
        `${dualPlatformLabels[platform]} is already saved.`,
      );
      return;
    }

    if (
      generating ||
      generatingVariations ||
      generatingPlatformCaptions ||
      revising ||
      revisingPlatform !== null ||
      savingDraft ||
      savingPlatformDraft !== null
    ) {
      return;
    }

    // Synchronous lock prevents double-click races.
    platformSaveLock.current = true;
    setSavingPlatformDraft(platform);

    setPlatformCaptionError("");
    setPlatformCaptionNotice("");

    // Remember the exact editor version submitted.
    const versionAtSave = platformCaptionVersions.current[platform];

    try {
      let savedPost: Post;

      if (existingDraft) {
        // UPDATE: preserve the existing MongoDB _id.
        savedPost = await updateDraftPost(existingDraft.postId, {
          caption: captionToSave,
        });
      } else {
        // CREATE: only on the first save.
        savedPost = await createPost({
          workspaceId,
          caption: captionToSave,
          platforms: [platform],
        });
      }

      // A workspace switch must not make an old
      // response appear saved in the new workspace.
      if (activeWorkspaceIdRef.current !== workspaceId) {
        return;
      }

      setSavedPlatformDrafts((current) => ({
        ...current,
        [platform]: {
          postId: savedPost._id,
          workspaceId,
          savedCaption: captionToSave,
        },
      }));

      // Only show "Saved" if the current editor text
      // still matches what was submitted.
      const currentCaption =
        latestPlatformCaptionsRef.current?.[platform]?.trim() ?? "";

      const editorIsUnchanged =
        platformCaptionVersions.current[platform] === versionAtSave &&
        currentCaption === captionToSave;

      setPlatformDraftSaved((current) => ({
        ...current,
        [platform]: editorIsUnchanged,
      }));

      // The parent callback is needed for new posts.
      // Its current behavior may append records,
      // so don't call it for updates until the parent
      // supports replacing posts by _id.
      if (!existingDraft) {
        onPostSaved(savedPost);
      }

      setPlatformCaptionNotice(
        editorIsUnchanged
          ? `${dualPlatformLabels[platform]} draft ${
              existingDraft ? "updated" : "created"
            } successfully.`
          : `${dualPlatformLabels[platform]} draft saved, ` +
              "but the editor has newer changes. " +
              "Save again to include them.",
      );
    } catch (error) {
      setPlatformCaptionError(
        error instanceof Error
          ? error.message
          : `Unable to save the ${platform} draft.`,
      );
    } finally {
      platformSaveLock.current = false;
      setSavingPlatformDraft(null);
    }
  }

  function handleUseVariation(variation: CaptionVariation): void {
    if (generating || generatingVariations || revising) {
      return;
    }

    setCaption(variation.caption);
    setSelectedVariationStyle(variation.style);

    setError("");
    setNotice(
      `${variationLabels[variation.style]} caption selected. ` +
        "Review and edit it before saving.",
    );
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
      setError("Select a workspace before saving a post.");
      return;
    }

    if (!trimmedCaption) {
      setError("Generate or enter a caption before saving.");
      return;
    }

    if (
      platform === "linkedin" &&
      postSaveMode === "scheduled" &&
      (linkedInStatus !== "connected" || !linkedInConnectionId)
    ) {
      setError("Connect a LinkedIn account before scheduling a LinkedIn post.");
      return;
    }

    let scheduledAtISO: string | undefined;

    if (postSaveMode === "scheduled") {
      if (!scheduledAt) {
        setError("Select a publishing date and time.");
        return;
      }

      const scheduledDate = parseLocalScheduleDate(scheduledAt);

      if (!scheduledDate || scheduledDate.getTime() <= Date.now()) {
        setError("Select a valid future publishing date and time.");
        return;
      }

      scheduledAtISO = toScheduledAtISOString(scheduledDate);
    }

    setSavingDraft(true);
    setError("");
    setNotice("");

    try {
      const post = await createPost({
        workspaceId: selectedWorkspaceId,
        caption: trimmedCaption,
        platforms: [platform],

        ...(platform === "linkedin" &&
        linkedInStatus === "connected" &&
        linkedInConnectionId
          ? {
              platformConnections: {
                linkedin: linkedInConnectionId,
              },
            }
          : {}),

        ...(scheduledAtISO ? { scheduledAt: scheduledAtISO } : {}),
      });

      onPostSaved(post);

      setNotice(
        postSaveMode === "scheduled"
          ? "Post scheduled successfully."
          : "Draft saved to your workspace.",
      );

      setPostSaveMode("draft");
      setScheduledAt("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save the post. Please try again.",
      );
    } finally {
      setSavingDraft(false);
    }
  }

  function clearCaptionVariations(): void {
    variationRequestId.current += 1;
    setVariations([]);
    setSelectedVariationStyle(null);
  }

  function clearPlatformCaptions(): void {
    platformRequestId.current += 1;

    // Preserve any captions the user has already generated
    // and edited. Only invalidate the unfinished request.
    //
    // Existing captions remain visible and editable.
    setPlatformCaptionNotice("");
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
              onChange={(event) => {
                setBrief(event.target.value);
                clearCaptionVariations();
                clearPlatformCaptions();
              }}
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
              onChange={(event) => {
                setPlatform(event.target.value as PostPlatform);
                clearCaptionVariations();
                clearPlatformCaptions();
              }}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            >
              {platformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {/* LinkedIn account information */}
          {platform === "linkedin" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Connected LinkedIn account
              </label>

              {linkedInStatus === "connected" && linkedInConnectionId ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800">
                    {linkedInDisplayName || "LinkedIn account"}
                  </p>

                  <p className="mt-1 text-xs text-emerald-700">
                    Connected and ready for post scheduling.
                  </p>
                </div>
              ) : (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm font-semibold text-amber-800">
                    No connected LinkedIn account
                  </p>

                  <p className="mt-1 text-xs text-amber-700">
                    Connect your LinkedIn account using the dashboard before
                    scheduling a LinkedIn post.
                  </p>
                </div>
              )}
            </div>
          )}
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
              onChange={(event) => {
                setTone(event.target.value as CaptionTone);
                clearCaptionVariations();
                clearPlatformCaptions();
              }}
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
              onChange={(event) => {
                setAudience(event.target.value);
                clearCaptionVariations();
                clearPlatformCaptions();
              }}
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
              onChange={(event) => {
                setCallToAction(event.target.value);
                clearCaptionVariations();
                clearPlatformCaptions();
              }}
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
              onChange={(event) => {
                setLength(event.target.value as CaptionLength);
                clearCaptionVariations();
                clearPlatformCaptions();
              }}
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
            disabled={
              generating ||
              generatingVariations ||
              revising ||
              brief.trim().length < 3
            }
            className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <WandSparkles size={17} />
            {generating ? "Generating caption..." : "Generate caption"}
          </Button>

          <Button
            type="button"
            disabled={
              generating ||
              generatingVariations ||
              revising ||
              brief.trim().length < 3
            }
            onClick={() => void handleGenerateVariations()}
            className="w-full rounded-xl border border-violet-200 bg-violet-50 py-3 font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            <Sparkles size={17} />
            {generatingVariations
              ? "Generating 3 variations..."
              : "Generate 3 Variations"}
          </Button>

          <Button
            type="button"
            disabled={
              generating ||
              generatingVariations ||
              generatingPlatformCaptions ||
              revising ||
              savingDraft ||
              savingPlatformDraft !== null ||
              brief.trim().length < 3
            }
            onClick={() => void handleGeneratePlatformCaptions()}
            className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Sparkles size={17} />

            {generatingPlatformCaptions
              ? "Generating Facebook + LinkedIn..."
              : "Generate Facebook + LinkedIn"}
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

          {platformCaptions && (
            <section
              aria-label="Facebook and LinkedIn captions"
              className="mb-6 space-y-4 border-b border-slate-200 pb-6"
            >
              <div>
                <h4 className="text-lg font-semibold text-slate-900">
                  Platform-Specific Captions
                </h4>

                <p className="mt-1 text-sm text-slate-500">
                  Edit and save each platform caption independently. Saving
                  creates a draft, not a published post.
                </p>
              </div>

              <div className="space-y-4">
                {dualPlatforms.map((targetPlatform) => (
                  <article
                    key={targetPlatform}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-slate-900">
                        {dualPlatformLabels[targetPlatform]}
                      </h5>

                      {platformDraftSaved[targetPlatform] && (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          Draft saved
                        </span>
                      )}
                    </div>

                    <label
                      htmlFor={`studio-${targetPlatform}-caption`}
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      {dualPlatformLabels[targetPlatform]} caption
                    </label>

                    <textarea
                      id={`studio-${targetPlatform}-caption`}
                      value={platformCaptions[targetPlatform]}
                      onChange={(event) =>
                        handlePlatformCaptionChange(
                          targetPlatform,
                          event.target.value,
                        )
                      }
                      maxLength={10000}
                      rows={8}
                      className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />

                    <p className="mt-1 text-right text-xs text-slate-400">
                      {platformCaptions[targetPlatform].length}
                      /10000 characters
                    </p>

                    <div className="mt-4 space-y-2">
                      <label
                        htmlFor={`studio-${targetPlatform}-revision`}
                        className="block text-sm font-medium text-slate-700"
                      >
                        Revise {dualPlatformLabels[targetPlatform]} caption
                      </label>

                      <textarea
                        id={`studio-${targetPlatform}-revision`}
                        value={platformRevisionInstructions[targetPlatform]}
                        onChange={(event) => {
                          const value = event.target.value;

                          setPlatformRevisionInstructions((current) => ({
                            ...current,
                            [targetPlatform]: value,
                          }));
                        }}
                        maxLength={500}
                        rows={3}
                        placeholder={
                          targetPlatform === "facebook"
                            ? "e.g. Make it friendlier and end with a question."
                            : "e.g. Make it more professional and highlight business value."
                        }
                        className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      />

                      <Button
                        type="button"
                        disabled={
                          revisingPlatform !== null ||
                          generating ||
                          generatingVariations ||
                          generatingPlatformCaptions ||
                          revising ||
                          savingDraft ||
                          savingPlatformDraft !== null ||
                          !platformCaptions[targetPlatform].trim() ||
                          platformRevisionInstructions[targetPlatform].trim()
                            .length < 3
                        }
                        onClick={() =>
                          void handleRevisePlatformCaption(targetPlatform)
                        }
                        className="w-full rounded-xl border border-violet-200 bg-violet-50 py-3 font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                      >
                        {revisingPlatform === targetPlatform
                          ? "Revising caption..."
                          : `Revise ${dualPlatformLabels[targetPlatform]} Caption`}
                      </Button>
                    </div>

                    <Button
                      type="button"
                      disabled={
                        savingPlatformDraft !== null ||
                        revisingPlatform !== null ||
                        savingDraft ||
                        generating ||
                        generatingVariations ||
                        generatingPlatformCaptions ||
                        revising ||
                        !platformCaptions[targetPlatform].trim() ||
                        platformDraftSaved[targetPlatform] ||
                        !selectedWorkspaceId ||
                        (savedPlatformDrafts[targetPlatform] !== null &&
                          savedPlatformDrafts[targetPlatform]?.workspaceId !==
                            selectedWorkspaceId)
                      }
                      onClick={() =>
                        void handleSavePlatformDraft(targetPlatform)
                      }
                      className="mt-3 w-full rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {savingPlatformDraft === targetPlatform
                        ? "Saving draft..."
                        : platformDraftSaved[targetPlatform]
                          ? "Draft Saved"
                          : savedPlatformDrafts[targetPlatform]
                            ? `Update ${dualPlatformLabels[targetPlatform]} Draft`
                            : `Save ${dualPlatformLabels[targetPlatform]} Draft`}
                    </Button>
                  </article>
                ))}
              </div>

              {platformCaptionError && (
                <p
                  role="alert"
                  className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {platformCaptionError}
                </p>
              )}

              {platformCaptionNotice && (
                <p
                  role="status"
                  className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
                >
                  {platformCaptionNotice}
                </p>
              )}
            </section>
          )}

          {variations.length > 0 && (
            <section
              aria-label="AI caption suggestions"
              className="mb-6 space-y-3"
            >
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  AI Caption Suggestions
                </h4>

                <p className="mt-1 text-xs text-slate-500">
                  Review the alternatives and select one to edit. Selecting a
                  caption will replace the current editor text.
                </p>
              </div>

              <div className="space-y-3">
                {variations.map((variation) => {
                  const selected = selectedVariationStyle === variation.style;

                  return (
                    <article
                      key={variation.style}
                      className={`rounded-xl border p-4 transition ${
                        selected
                          ? "border-violet-400 bg-violet-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h5 className="text-sm font-semibold text-slate-900">
                          {variationLabels[variation.style]}
                        </h5>

                        {selected && (
                          <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                            Selected
                          </span>
                        )}
                      </div>

                      <p className="mb-3 text-xs text-slate-500">
                        {variationDescriptions[variation.style]}
                      </p>

                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                        {variation.caption}
                      </p>

                      <Button
                        type="button"
                        disabled={
                          generating ||
                          generatingVariations ||
                          revising ||
                          savingDraft
                        }
                        onClick={() => handleUseVariation(variation)}
                        className="mt-4 w-full rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {selected
                          ? "Use This Caption Again"
                          : "Use This Caption"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

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
              setSelectedVariationStyle(null);
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

          {/* Publishing options */}
          <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Publishing options
              </h4>

              <p className="mt-1 text-xs text-slate-500">
                Save your content as a draft or schedule it for later.
              </p>
            </div>

            {/* Save mode */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPostSaveMode("draft")}
                aria-pressed={postSaveMode === "draft"}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  postSaveMode === "draft"
                    ? "border-violet-400 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Save as Draft
              </button>

              <button
                type="button"
                onClick={() => setPostSaveMode("scheduled")}
                aria-pressed={postSaveMode === "scheduled"}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  postSaveMode === "scheduled"
                    ? "border-violet-400 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Schedule Post
              </button>
            </div>

            {/* Scheduling date and time */}
            {postSaveMode === "scheduled" && (
              <div className="space-y-2">
                <label
                  htmlFor="studio-scheduled-at"
                  className="block text-sm font-medium text-slate-700"
                >
                  Publishing date and time
                </label>

                <input
                  id="studio-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />

                <p className="text-xs text-slate-500">
                  Choose a future date and time in your local timezone.
                </p>
              </div>
            )}

            {/* Save button */}
            <Button
              type="button"
              disabled={
                savingDraft ||
                generating ||
                revising ||
                !caption.trim() ||
                !selectedWorkspaceId ||
                (postSaveMode === "scheduled" && !scheduledAt)
              }
              onClick={() => void handleSaveDraft()}
              className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {savingDraft
                ? "Saving..."
                : postSaveMode === "scheduled"
                  ? "Schedule Post"
                  : "Save as Draft"}
            </Button>
          </div>
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
