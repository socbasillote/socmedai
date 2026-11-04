import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  readFacebookOAuthWorkspaceId,
  clearFacebookOAuthWorkspaceId,
} from "@/lib/facebookOAuthWorkspace";

import { storeWorkspaceId } from "@/lib/workspaceSelection";

type Workspace = {
  _id: string;
  name: string;
};

type UseFacebookOAuthCallbackOptions = {
  workspaces: readonly Workspace[];
  selectedWorkspaceId: string;
  workspacesLoading: boolean;
  setSelectedWorkspaceId: (id: string) => void;
  setNotice: (message: string) => void;
};

export function useFacebookOAuthCallback({
  workspaces,
  selectedWorkspaceId,
  workspacesLoading,
  setSelectedWorkspaceId,
  setNotice,
}: UseFacebookOAuthCallbackOptions) {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);

  const facebookCallbackPending = params.get("facebook") === "connected";

  const facebookCallbackWorkspaceId = facebookCallbackPending
    ? readFacebookOAuthWorkspaceId()
    : null;

  const facebookCallbackWorkspace = facebookCallbackWorkspaceId
    ? workspaces.find(
        (workspace) => workspace._id === facebookCallbackWorkspaceId,
      )
    : undefined;

  /**
   * Removes Facebook callback parameters
   * while preserving unrelated query parameters.
   */
  const removeCallbackParameters = useCallback(
    (includeReason: boolean) => {
      const nextParams = new URLSearchParams(location.search);

      nextParams.delete("facebook");

      if (includeReason) {
        nextParams.delete("reason");
      }

      const search = nextParams.toString();

      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
          hash: location.hash,
        },
        {
          replace: true,
        },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  /**
   * Handle unsuccessful Facebook OAuth.
   *
   * The backend redirects to:
   * ?facebook=error&reason=denied
   * ?facebook=error&reason=failed
   */
  useEffect(() => {
    const callbackParams = new URLSearchParams(location.search);

    if (callbackParams.get("facebook") !== "error") {
      return;
    }

    const reason = callbackParams.get("reason");

    clearFacebookOAuthWorkspaceId();

    if (reason === "denied") {
      setNotice(
        "Facebook authorization was cancelled. " +
          "No Facebook Pages were connected.",
      );
    } else {
      setNotice(
        "Facebook authorization failed. " + "Please try connecting again.",
      );
    }

    removeCallbackParameters(true);
  }, [location.search, removeCallbackParameters, setNotice]);

  /**
   * Restore the workspace that originally
   * initiated Facebook OAuth.
   *
   * This prevents Page connections from being
   * associated with the wrong workspace.
   */
  useEffect(() => {
    if (
      !facebookCallbackPending ||
      workspacesLoading ||
      !facebookCallbackWorkspaceId ||
      !facebookCallbackWorkspace
    ) {
      return;
    }

    if (selectedWorkspaceId === facebookCallbackWorkspaceId) {
      return;
    }

    setSelectedWorkspaceId(facebookCallbackWorkspaceId);

    storeWorkspaceId(facebookCallbackWorkspaceId);
  }, [
    facebookCallbackPending,
    facebookCallbackWorkspaceId,
    facebookCallbackWorkspace,
    workspacesLoading,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
  ]);

  /**
   * Called after successful Page selection
   * or when dismissing the callback flow.
   */
  const clearFacebookCallback = useCallback(() => {
    clearFacebookOAuthWorkspaceId();
    removeCallbackParameters(false);
  }, [removeCallbackParameters]);

  return {
    facebookCallbackPending,
    facebookCallbackWorkspaceId,
    facebookCallbackWorkspace,
    clearFacebookCallback,
  };
}
