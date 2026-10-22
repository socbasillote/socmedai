import { useState } from "react";

export type PostStatusFilter =
  | "all"
  | "draft"
  | "scheduled"
  | "published"
  | "failed";

export type PostPlatformFilter = "all" | "facebook" | "instagram" | "linkedin";

export function usePostFilters() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PostStatusFilter>("all");
  const [platformFilter, setPlatformFilter] =
    useState<PostPlatformFilter>("all");

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
  };
}
