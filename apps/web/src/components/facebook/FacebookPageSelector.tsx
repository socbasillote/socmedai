import { useState } from "react";

import {
  connectSelectedFacebookPages,
  type FacebookOAuthPage,
  type FacebookPageConnection,
} from "../../lib/facebookApi";

type FacebookPageSelectorProps = {
  workspaceId: string;
  pages: FacebookOAuthPage[];
  expiresAt: string;
  onConnected?: (connections: FacebookPageConnection[]) => void;
  onCancel?: () => void;
};

export default function FacebookPageSelector({
  workspaceId,
  pages,
  expiresAt,
  onConnected,
  onCancel,
}: FacebookPageSelectorProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connections, setConnections] = useState<
    FacebookPageConnection[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const publishablePages = pages.filter((page) =>
    page.tasks.includes("CREATE_CONTENT"),
  );

  const allSelected =
    publishablePages.length > 0 &&
    publishablePages.every((page) =>
      selectedPageIds.includes(page.facebookPageId),
    );

  const sessionExpired = Date.now() >= new Date(expiresAt).getTime();

  const canSubmit =
    !isSubmitting &&
    !connections &&
    !sessionExpired &&
    selectedPageIds.length > 0;

  function togglePage(pageId: string) {
    if (isSubmitting || connections || sessionExpired) {
      return;
    }

    setError(null);

    setSelectedPageIds((current) =>
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId],
    );
  }

  function toggleAll() {
    if (isSubmitting || connections || sessionExpired) {
      return;
    }

    setError(null);

    setSelectedPageIds(
      allSelected ? [] : publishablePages.map((page) => page.facebookPageId),
    );
  }

  async function handleConnect() {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await connectSelectedFacebookPages(
        workspaceId,
        selectedPageIds,
      );

      setConnections(result.connections);

      onConnected?.(result.connections);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect Facebook Pages.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (connections) {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-900">
          Facebook Pages Connected
        </h2>

        <p className="mt-2 text-sm text-green-800">
          Successfully connected {connections.length} Facebook{" "}
          {connections.length === 1 ? "Page" : "Pages"}.
        </p>

        <ul className="mt-4 space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.facebookPageId}
              className="rounded-lg border border-green-200 bg-white p-3"
            >
              <p className="font-medium text-gray-900">{connection.pageName}</p>

              <p className="text-xs text-green-700">{connection.status}</p>
            </li>
          ))}
        </ul>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-5 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Done
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">
          Select Facebook Pages
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Choose the Facebook Pages you want to connect to Storm.
        </p>
      </div>

      {sessionExpired && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Your Facebook authorization session has expired. Please reconnect your
          Facebook account.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          No Facebook Pages were found for this account.
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {selectedPageIds.length} of {publishablePages.length} available
              Pages selected
            </p>

            {publishablePages.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                disabled={isSubmitting || sessionExpired}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {pages.map((page) => {
              const canPublish = page.tasks.includes("CREATE_CONTENT");

              const isSelected = selectedPageIds.includes(page.facebookPageId);

              return (
                <label
                  key={page.facebookPageId}
                  className={`flex items-start gap-3 rounded-lg border p-4 ${
                    canPublish
                      ? "cursor-pointer border-gray-200 hover:border-blue-300"
                      : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!canPublish || isSubmitting || sessionExpired}
                    onChange={() => togglePage(page.facebookPageId)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{page.pageName}</p>

                    <p className="mt-1 text-xs text-gray-500">
                      Page ID: {page.facebookPageId}
                    </p>

                    {canPublish ? (
                      <p className="mt-2 text-xs font-medium text-green-700">
                        Publishing permission available
                      </p>
                    ) : (
                      <p className="mt-2 text-xs font-medium text-amber-700">
                        Publishing permission unavailable
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={!canSubmit}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? "Connecting..."
            : `Connect ${selectedPageIds.length} ${
                selectedPageIds.length === 1 ? "Page" : "Pages"
              }`}
        </button>
      </div>
    </section>
  );
}
