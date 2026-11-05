import { describe, expect, it } from "vitest";

import type { Post } from "@/lib/posts";

import {
  getPostStatusLabel,
  getPostStatusColor,
} from "./postStatusPresentation";

describe("postStatusPresentation", () => {
  it.each([
    ["draft", "Draft"],
    ["scheduled", "Scheduled"],
    ["published", "Published"],
    ["failed", "Failed"],
  ] as const)("formats %s as %s", (status, expected) => {
    expect(getPostStatusLabel(status)).toBe(expected);
  });

  it.each([
    ["draft", "bg-violet-100 text-violet-700"],
    ["scheduled", "bg-blue-100 text-blue-700"],
    ["published", "bg-emerald-100 text-emerald-700"],
    ["failed", "bg-rose-100 text-rose-700"],
  ] as const)("returns the correct color for %s", (status, expected) => {
    expect(getPostStatusColor(status)).toBe(expected);
  });

  it("preserves the fallback styling", () => {
    const unexpected = "unexpected" as Post["status"];

    expect(getPostStatusColor(unexpected)).toBe(
      "bg-violet-100 text-violet-700",
    );

    expect(getPostStatusLabel(unexpected)).toBe("Unexpected");
  });
});
