export type PostMediaState = {
  originalMediaIds: string[];
  selectedMediaIds: string[];
};

export function createPostMediaState(
  mediaIds: readonly string[] = [],
): PostMediaState {
  return {
    originalMediaIds: [...mediaIds],
    selectedMediaIds: [...mediaIds],
  };
}

export function selectPostImage(
  state: PostMediaState,
  assetId: string,
): PostMediaState {
  return {
    ...state,
    selectedMediaIds: [assetId],
  };
}

export function removePostImage(state: PostMediaState): PostMediaState {
  return {
    ...state,
    selectedMediaIds: [],
  };
}

export function hasPostMediaChanged(state: PostMediaState): boolean {
  if (state.originalMediaIds.length !== state.selectedMediaIds.length) {
    return true;
  }

  return state.originalMediaIds.some(
    (id, index) => id !== state.selectedMediaIds[index],
  );
}

export function getPostMediaUpdate(state: PostMediaState): {
  mediaIds?: string[];
} {
  if (!hasPostMediaChanged(state)) {
    return {};
  }

  return {
    mediaIds: [...state.selectedMediaIds],
  };
}
