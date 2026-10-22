import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

type UseLinkedInCallbackOptions = {
  refreshStatus: () => void;
  setConnectError: (message: string) => void;
  setNotice: (message: string) => void;
};

export function useLinkedInCallback({
  refreshStatus,
  setConnectError,
  setNotice,
}: UseLinkedInCallbackOptions) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const callbackStatus = params.get("linkedin");

    if (callbackStatus !== "connected" && callbackStatus !== "error") {
      return;
    }

    let active = true;

    const handleCallbackResult = async () => {
      await Promise.resolve();

      if (!active) return;

      if (callbackStatus === "connected") {
        setNotice("LinkedIn connected successfully.");
        setConnectError("");
        refreshStatus();
      } else {
        const reason = params.get("reason");

        setNotice("");
        setConnectError(
          reason === "denied"
            ? "LinkedIn authorization was denied. You can try connecting again."
            : "LinkedIn connection failed. Please try again.",
        );
      }
    };

    void handleCallbackResult();

    params.delete("linkedin");
    params.delete("reason");

    const remainingSearch = params.toString();

    navigate(
      {
        pathname: location.pathname,
        search: remainingSearch ? `?${remainingSearch}` : "",
        hash: location.hash,
      },
      { replace: true },
    );

    return () => {
      active = false;
    };
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    refreshStatus,
    setConnectError,
    setNotice,
  ]);
}
