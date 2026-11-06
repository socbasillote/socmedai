import { useCallback, useEffect, useRef, useState } from "react";

import { getWorkspacePostsPage, type Post } from "@/lib/posts";

export type PlannerListMode = "scheduled" | "all";

const PAGE_SIZE = 20;

type ListState = {
  key: string;
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  error: string;
  nextCursor: string | null;
  hasMore: boolean;
};

const emptyState: ListState = {
  key: "",
  posts: [],
  loading: false,
  loadingMore: false,
  error: "",
  nextCursor: null,
  hasMore: false,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load workspace posts.";
}

export function usePlannerPostList(workspaceId: string, mode: PlannerListMode) {
  const requestKey = JSON.stringify([workspaceId, mode]);

  const [state, setState] = useState<ListState>(emptyState);

  const [refreshVersion, setRefreshVersion] = useState(0);

  const loadMoreInFlight = useRef(false);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    let active = true;

    const generation = ++requestGenerationRef.current;

    loadMoreInFlight.current = false;

    if (!workspaceId) {
      setState({
        ...emptyState,
        key: requestKey,
      });

      return () => {
        active = false;

        if (requestGenerationRef.current === generation) {
          requestGenerationRef.current += 1;
        }
      };
    }

    setState({
      ...emptyState,
      key: requestKey,
      loading: true,
    });

    async function loadFirstPage() {
      try {
        const result = await getWorkspacePostsPage(workspaceId, {
          limit: PAGE_SIZE,
          status: mode,
        });

        if (!active) return;

        setState({
          key: requestKey,
          posts: result.posts,
          loading: false,
          loadingMore: false,
          error: "",
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        });
      } catch (error) {
        if (!active) return;

        setState({
          ...emptyState,
          key: requestKey,
          error: getErrorMessage(error),
        });
      }
    }

    void loadFirstPage();

    return () => {
      active = false;

      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
      }
    };
  }, [workspaceId, mode, requestKey, refreshVersion]);

  const stateIsCurrent = state.key === requestKey;

  const posts = stateIsCurrent ? state.posts : [];

  const loading = Boolean(workspaceId) && (!stateIsCurrent || state.loading);

  const loadingMore = stateIsCurrent && state.loadingMore;

  const error = stateIsCurrent ? state.error : "";

  const hasMore = stateIsCurrent && state.hasMore;

  const loadMore = useCallback(async () => {
    if (
      !workspaceId ||
      !stateIsCurrent ||
      state.loading ||
      state.loadingMore ||
      !state.hasMore ||
      !state.nextCursor ||
      loadMoreInFlight.current
    ) {
      return;
    }

    loadMoreInFlight.current = true;
    const generation = requestGenerationRef.current;

    const cursor = state.nextCursor;

    setState((current) =>
      current.key === requestKey
        ? {
            ...current,
            loadingMore: true,
            error: "",
          }
        : current,
    );

    try {
      const result = await getWorkspacePostsPage(workspaceId, {
        limit: PAGE_SIZE,
        status: mode,
        cursor,
      });

      if (generation !== requestGenerationRef.current) {
        return;
      }

      setState((current) => {
        if (current.key !== requestKey) {
          return current;
        }

        const knownIds = new Set(current.posts.map((post) => post._id));

        const newPosts = result.posts.filter((post) => !knownIds.has(post._id));

        return {
          ...current,
          posts: [...current.posts, ...newPosts],
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          loadingMore: false,
          error: "",
        };
      });
    } catch (error) {
      if (generation !== requestGenerationRef.current) {
        return;
      }
      setState((current) =>
        current.key === requestKey
          ? {
              ...current,
              loadingMore: false,
              error: getErrorMessage(error),
            }
          : current,
      );
    } finally {
      if (generation === requestGenerationRef.current) {
        loadMoreInFlight.current = false;
      }
    }
  }, [workspaceId, mode, requestKey, state, stateIsCurrent]);

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  return {
    posts,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
