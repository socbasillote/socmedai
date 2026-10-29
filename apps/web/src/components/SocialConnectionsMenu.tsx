import { useEffect, useId, useRef, useState } from "react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { LinkedInConnectionPanel } from "@/components/LinkedInConnectionPanel";
import type { FacebookConnectionInfo } from "@/lib/facebookApi";

type FacebookConnectionProps = {
  workspaceId: string;
  workspacesLoading: boolean;

  connecting: boolean;
  connectError: string;

  connections?: FacebookConnectionInfo[];
  connectionsLoading?: boolean;
  connectionsError?: string;

  onConnect: () => void;
};

type SocialConnectionsMenuProps = {
  linkedInProps: ComponentProps<typeof LinkedInConnectionPanel>;
  facebookProps: FacebookConnectionProps;
};

export function SocialConnectionsMenu({
  linkedInProps,
  facebookProps,
}: SocialConnectionsMenuProps) {
  const [open, setOpen] = useState(false);

  const facebookConnections = facebookProps.connections ?? [];

  const facebookConnectionsLoading = facebookProps.connectionsLoading ?? false;

  const facebookConnectionsError = facebookProps.connectionsError ?? "";

  const connectedPageCount = facebookConnections.filter(
    (connection) => connection.status === "connected",
  ).length;

  const hasFacebookConnections = facebookConnections.length > 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);

      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="gap-2"
      >
        <span className="hidden sm:inline">Social Accounts</span>

        <span className="sm:hidden">Accounts</span>

        <span aria-hidden="true" className="text-slate-400">
          {open ? "▴" : "▾"}
        </span>
      </Button>

      {open && (
        <section
          id={panelId}
          aria-label="Social account connections"
          className="
            absolute right-0 top-full z-50 mt-2
            w-[min(22rem,calc(100vw-2rem))]
            rounded-xl border border-slate-200
            bg-white p-4 shadow-xl
          "
        >
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Social Accounts
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Connect and manage platforms for this workspace.
            </p>
          </div>

          <div className="space-y-4">
            {/* LinkedIn */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="
                  flex h-9 w-9 items-center justify-center
                  rounded-lg bg-blue-50
                  text-sm font-bold text-blue-700
                "
                >
                  in
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    LinkedIn
                  </h3>

                  <p className="text-xs text-slate-500">Professional network</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <LinkedInConnectionPanel {...linkedInProps} />
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Facebook */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg font-bold text-blue-600">
                  f
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Facebook
                  </h3>

                  <p className="text-xs text-slate-500">
                    Manage Facebook Pages
                  </p>
                </div>

                {!facebookConnectionsLoading &&
                  !facebookConnectionsError &&
                  connectedPageCount > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {connectedPageCount} connected
                    </span>
                  )}
              </div>

              {/* Loading state */}
              {facebookConnectionsLoading && (
                <p role="status" className="mb-3 text-sm text-slate-500">
                  Loading Facebook connections...
                </p>
              )}

              {/* Error state */}
              {facebookConnectionsError && (
                <p
                  role="alert"
                  className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {facebookConnectionsError}
                </p>
              )}

              {/* Saved Facebook Pages */}
              {!facebookConnectionsLoading &&
                !facebookConnectionsError &&
                hasFacebookConnections && (
                  <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
                    {facebookConnections.map((connection) => {
                      const isConnected = connection.status === "connected";

                      const isExpired = connection.status === "expired";

                      const statusLabel = isConnected
                        ? "Connected"
                        : isExpired
                          ? "Session expired"
                          : "Access revoked";

                      const statusClassName = isConnected
                        ? "text-emerald-700"
                        : "text-amber-700";

                      return (
                        <div
                          key={connection.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium text-slate-900">
                                {connection.pageName}
                              </p>

                              <p className="mt-1 break-all text-xs text-slate-500">
                                Page ID: {connection.facebookPageId}
                              </p>

                              <p
                                className={`mt-2 text-xs font-medium ${statusClassName}`}
                              >
                                {statusLabel}
                              </p>
                            </div>

                            <span
                              aria-label={statusLabel}
                              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                                isConnected ? "bg-emerald-500" : "bg-amber-500"
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Empty state */}
              {!facebookConnectionsLoading &&
                !facebookConnectionsError &&
                !hasFacebookConnections && (
                  <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    No Facebook Pages connected to this workspace.
                  </p>
                )}

              {/* Connect / Connect More */}
              <Button
                type="button"
                variant="outline"
                disabled={
                  !facebookProps.workspaceId ||
                  facebookProps.workspacesLoading ||
                  facebookProps.connecting
                }
                onClick={facebookProps.onConnect}
                className="w-full"
              >
                {facebookProps.connecting
                  ? "Connecting..."
                  : hasFacebookConnections
                    ? "Connect More Facebook Pages"
                    : "Connect Facebook"}
              </Button>

              {/* OAuth initiation error */}
              {facebookProps.connectError && (
                <p role="alert" className="mt-2 text-sm text-rose-600">
                  {facebookProps.connectError}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
