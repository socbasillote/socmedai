import { useRef, useState } from "react";

import { startFacebookConnect } from "@/lib/facebookApi";

import {
  storeFacebookOAuthWorkspaceId,
  clearFacebookOAuthWorkspaceId,
} from "@/lib/facebookOAuthWorkspace";

export function useFacebookConnection(selectedWorkspaceId: string) {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  // Prevent duplicate requests even before React re-renders.
  const connectingRef = useRef(false);

  async function connect() {
    if (connectingRef.current) {
      return;
    }

    const workspaceId = selectedWorkspaceId.trim();

    if (!workspaceId) {
      setConnectError("Select a workspace before connecting Facebook.");
      return;
    }

    connectingRef.current = true;
    setConnecting(true);
    setConnectError("");

    try {
      // Remember the workspace that started OAuth.
      // Do this before leaving the application.
      storeFacebookOAuthWorkspaceId(workspaceId);

      // Request the authorization URL from Storm's API.
      const authorizationUrl = await startFacebookConnect(workspaceId);

      // Navigate to Facebook.
      window.location.assign(authorizationUrl);

      // Do not reset the loading state here.
      // A successful redirect leaves the current page.
    } catch (error) {
      // OAuth initiation failed. The saved workspace
      // must not be reused by a later attempt.
      clearFacebookOAuthWorkspaceId();

      setConnectError(
        error instanceof Error
          ? error.message
          : "Unable to start Facebook connection.",
      );

      connectingRef.current = false;
      setConnecting(false);
    }
  }

  return {
    connecting,
    connectError,
    connect,
    setConnectError,
  };
}
