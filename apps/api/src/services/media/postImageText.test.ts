import sharp from "sharp";
import { expect, it } from "vitest";
import { applyPostImageText } from "./postImageText.js";
import { postImageDesignSchema } from "../../schemas/postImageDesignSchema.js";

it("renders supplied text without changing the outer photo or losing it in platform crops", async () => {
  const original = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#0000FF" } }).png().toBuffer();
  const design = postImageDesignSchema.parse({ style: "editorial", text: 'Make every day count. <Keep going> & grow.', author: "Ana & Co." });
  const result = await applyPostImageText(original, design);
  const { data, info } = await sharp(result).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  expect(pixel(0, 0)).toEqual([0, 0, 255]);
  expect(pixel(220, 512)).not.toEqual([0, 0, 255]);
  // No text-panel pixels lie outside the shared center region of the three crops.
  for (const [left, top, width, height] of [[0, 0, 1024, 235], [0, 789, 1024, 235], [0, 0, 100, 1024], [924, 0, 100, 1024]]) {
    const cropped = await sharp(result).extract({ left, top, width, height }).toBuffer();
    const { channels } = await sharp(cropped).stats();
    expect(channels[0].max).toBe(0); expect(channels[1].max).toBe(0); expect(channels[2].min).toBe(255);
  }
});
it("does not add a text panel unless wording is supplied", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  expect(await applyPostImageText(bytes, { style: "auto" })).toBe(bytes);
});
