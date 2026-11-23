import { expect, it } from "vitest";
import { brandKitSchema, defaultBrandKit, readableTextColor } from "./brandKit";
it("accepts a brand palette without a configured text color", () => {
  const { text, ...colors } = defaultBrandKit.colors;
  expect(text).toBeTruthy();
  expect(brandKitSchema.safeParse({ ...defaultBrandKit, colors }).success).toBe(true);
});
it("chooses text by background contrast instead of a saved text color", () => {
  expect(readableTextColor("#FFFFFF")).toBe("#111827");
  expect(readableTextColor("#000000")).toBe("#FFFFFF");
  expect(readableTextColor("#FFFF00")).toBe("#111827");
});
