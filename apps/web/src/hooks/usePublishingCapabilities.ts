import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type ServerPublishingCapabilities = Record<string, { publishNow: boolean; schedule: boolean }>;

export function usePublishingCapabilities() {
  const [capabilities, setCapabilities] = useState<ServerPublishingCapabilities>({});
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void apiFetch<{ capabilities: ServerPublishingCapabilities }>("/api/posts/capabilities", {
        signal: request.signal, cache: "no-store",
      }).then((result) => {
        if (!request.signal.aborted) setCapabilities(result.capabilities);
      }).catch(() => {
        if (!request.signal.aborted) setCapabilities({});
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { controller?.abort(); window.removeEventListener("focus", refresh); };
  }, []);
  return capabilities;
}
