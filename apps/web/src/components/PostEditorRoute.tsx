import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { PostEditorPage } from "@/components/PostEditorPage";
import { PostEditorForm } from "@/components/PostEditorForm";
import { PostPreview } from "@/components/PostPreview";

import type { PostPlatform } from "@/lib/posts";

type PostMode = "draft" | "scheduled";

type PostEditorRouteProps = {
  mode: "create" | "edit";
  postId?: string;
};

function getLocalDateTime(): string {
  const now = new Date();

  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  return now.toISOString().slice(0, 16);
}

export function PostEditorRoute({ mode, postId }: PostEditorRouteProps) {
  const navigate = useNavigate();

  // Editor content
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  // Publishing platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<PostPlatform[]>([
    "facebook",
  ]);

  // Publishing options
  const [postMode, setPostMode] = useState<PostMode>("draft");
  const [scheduledAt, setScheduledAt] = useState("");

  // Save state
  const saving = false;
  const [error, setError] = useState("");

  const minScheduledAt = getLocalDateTime();

  function handleSave() {
    // API integration will be implemented in the next steps.
    setError(
      "Saving is not connected yet. This editor is currently in preview mode.",
    );
  }

  function handleCancel() {
    navigate("/posts");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PostEditorPage
          mode={mode}
          onBack={handleCancel}
          preview={
            <PostPreview
              title={title}
              caption={caption}
              platforms={selectedPlatforms}
            />
          }
        >
          <PostEditorForm
            mode={mode}
            title={title}
            caption={caption}
            selectedPlatforms={selectedPlatforms}
            postMode={postMode}
            scheduledAt={scheduledAt}
            minScheduledAt={minScheduledAt}
            saving={saving}
            error={error}
            linkedInConnectionId={null}
            linkedInDisplayName={null}
            linkedInStatus="disconnected"
            onTitleChange={(value) => {
              setTitle(value);
              setError("");
            }}
            onCaptionChange={(value) => {
              setCaption(value);
              setError("");
            }}
            onPlatformsChange={(platforms) => {
              setSelectedPlatforms(platforms);
              setError("");
            }}
            onPostModeChange={(value) => {
              setPostMode(value);
              setError("");
            }}
            onScheduledAtChange={(value) => {
              setScheduledAt(value);
              setError("");
            }}
            onSave={handleSave}
            onCancel={handleCancel}
          />

          {mode === "edit" && postId && (
            <p className="mt-4 text-xs text-slate-400">
              Editing post: {postId}
            </p>
          )}
        </PostEditorPage>
      </div>
    </main>
  );
}
