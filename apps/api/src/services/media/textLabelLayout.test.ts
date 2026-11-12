import { describe, expect, it } from "vitest";

import { planTextLabelLayout } from "./textLabelLayout.js";

const base = {
  imageWidth: 512,
  imageHeight: 512,
  sizePercent: 20,
};

describe("Text-label layout planning", () => {
  it("keeps short labels readable", () => {
    const result = planTextLabelLayout({
      ...base,
      text: "BREW CO.",
    });

    expect(result.fontSize).toBeGreaterThanOrEqual(12);
    expect(result.lines).toEqual(["BREW CO."]);
  });

  it("wraps longer labels into multiple lines", () => {
    const result = planTextLabelLayout({
      ...base,
      text: "STORM CREATIVE STUDIO",
    });

    expect(result.lines.length).toBeGreaterThan(1);

    expect(result.lines.join("")).toBe("STORM CREATIVE STUDIO");
  });

  it("rejects 80-character labels at a tiny size", () => {
    expect(() =>
      planTextLabelLayout({
        ...base,
        text: "STORM BRAND ".repeat(6).trim(),
        sizePercent: 5,
      }),
    ).toThrow();
  });

  it("never produces a one-pixel font", () => {
    const result = planTextLabelLayout({
      ...base,
      text: "STORM",
    });

    expect(result.fontSize).toBeGreaterThanOrEqual(12);
  });

  it("rejects invalid image dimensions", () => {
    expect(() =>
      planTextLabelLayout({
        ...base,
        text: "STORM",
        imageWidth: 0,
      }),
    ).toThrow();
  });

  it("rejects oversized label percentages", () => {
    expect(() =>
      planTextLabelLayout({
        ...base,
        text: "STORM",
        sizePercent: 50,
      }),
    ).toThrow();
  });
});
