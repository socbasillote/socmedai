import { expect, it } from "vitest";
import { generateImageSchema } from "../schemas/aiImageSchema.js";
import { fingerprintImageGeneration } from "./mediaGenerationClaimService.js";

it("validates an explicit per-image brand-kit choice", () => {
  const image = { prompt: "A subtle neutral studio background", useBrandKit: false };
  expect(generateImageSchema.parse(image).useBrandKit).toBe(false);
  expect(generateImageSchema.safeParse({ ...image, useBrandKit: "false" }).success).toBe(false);
});
it("preserves existing idempotency while separating an explicit opt-out", () => {
  const image = { prompt: "A subtle neutral studio background" };
  const provider = { provider: "mock", model: "mock-image" };
  const legacy = fingerprintImageGeneration(image, provider);
  expect(fingerprintImageGeneration({ ...image, useBrandKit: true }, provider)).toBe(legacy);
  expect(fingerprintImageGeneration({ ...image, useBrandKit: false }, provider)).not.toBe(legacy);
});
