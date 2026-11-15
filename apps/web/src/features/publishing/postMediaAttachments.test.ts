import { describe, expect, it } from "vitest";

import {
  createPostMediaState,
  selectPostImage,
  removePostImage,
  hasPostMediaChanged,
  getPostMediaUpdate,
} from "./postMediaAttachments";

const IMAGE_A = "507f1f77bcf86cd799439011";
const IMAGE_B = "507f1f77bcf86cd799439012";

describe("Post media attachment state", () => {
  it("starts empty for a new post", () => {
    const state = createPostMediaState();

    expect(state.originalMediaIds).toEqual([]);
    expect(state.selectedMediaIds).toEqual([]);
    expect(hasPostMediaChanged(state)).toBe(false);
  });

  it("restores attachments from an existing draft", () => {
    const state = createPostMediaState([IMAGE_A]);

    expect(state.selectedMediaIds).toEqual([IMAGE_A]);
    expect(getPostMediaUpdate(state)).toEqual({});
  });

  it("detects a newly selected image", () => {
    const initial = createPostMediaState();
    const updated = selectPostImage(initial, IMAGE_A);

    expect(updated.selectedMediaIds).toEqual([IMAGE_A]);
    expect(hasPostMediaChanged(updated)).toBe(true);
    expect(getPostMediaUpdate(updated)).toEqual({
      mediaIds: [IMAGE_A],
    });
  });

  it("replaces an existing image", () => {
    const initial = createPostMediaState([IMAGE_A]);
    const updated = selectPostImage(initial, IMAGE_B);

    expect(getPostMediaUpdate(updated)).toEqual({
      mediaIds: [IMAGE_B],
    });
  });

  it("explicitly removes an existing attachment", () => {
    const initial = createPostMediaState([IMAGE_A]);
    const updated = removePostImage(initial);

    expect(getPostMediaUpdate(updated)).toEqual({
      mediaIds: [],
    });
  });

  it("preserves attachments when nothing changes", () => {
    const state = createPostMediaState([IMAGE_A]);

    expect(getPostMediaUpdate(state)).toEqual({});
  });

  it("does not mutate the original media array", () => {
    const originalIds = [IMAGE_A];
    const state = createPostMediaState(originalIds);

    const updated = selectPostImage(state, IMAGE_B);

    expect(originalIds).toEqual([IMAGE_A]);
    expect(state.selectedMediaIds).toEqual([IMAGE_A]);
    expect(updated.selectedMediaIds).toEqual([IMAGE_B]);
  });

  it("detects removing media from a multi-image draft", () => {
    const state = createPostMediaState([IMAGE_A, IMAGE_B]);

    const updated = removePostImage(state);

    expect(getPostMediaUpdate(updated)).toEqual({
      mediaIds: [],
    });
  });

  it("does not send an update when restored to the original image", () => {
    const initial = createPostMediaState([IMAGE_A]);
    const replaced = selectPostImage(initial, IMAGE_B);
    const restored = selectPostImage(replaced, IMAGE_A);

    expect(hasPostMediaChanged(restored)).toBe(false);
    expect(getPostMediaUpdate(restored)).toEqual({});
  });
});
