import { useState } from "react";

type Platform = "facebook" | "instagram" | "linkedin";
type PostMode = "draft" | "scheduled";

function getLocalDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function useCreatePostForm() {
  const [minScheduledAt] = useState(() => getLocalDateTime());
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "facebook",
  ]);
  const [postMode, setPostMode] = useState<PostMode>("draft");
  const [scheduledAt, setScheduledAt] = useState("");

  return {
    minScheduledAt,
    caption,
    setCaption,
    selectedPlatforms,
    setSelectedPlatforms,
    postMode,
    setPostMode,
    scheduledAt,
    setScheduledAt,
  };
}
