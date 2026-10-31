export type FacebookPageConnectionOption = {
  id: string;
  facebookPageId: string;
  pageName: string;
  status: "connected" | "expired" | "revoked";
  canPublish: boolean;
};

type FacebookPageConnectionSelectProps = {
  connections: FacebookPageConnectionOption[];
  selectedConnectionId: string | null;
  loading: boolean;
  disabled?: boolean;
  error?: string | null;
  onChange: (connectionId: string | null) => void;
};

export function FacebookPageConnectionSelect({
  connections,
  selectedConnectionId,
  loading,
  disabled = false,
  error,
  onChange,
}: FacebookPageConnectionSelectProps) {
  const availableConnections = connections.filter(
    (connection) => connection.status === "connected" && connection.canPublish,
  );

  const isDisabled = disabled || loading || availableConnections.length === 0;

  return (
    <div className="space-y-2">
      <label
        htmlFor="facebook-page-connection"
        className="block text-sm font-semibold text-slate-700"
      >
        Facebook Page
      </label>

      <select
        id="facebook-page-connection"
        value={selectedConnectionId ?? ""}
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
        disabled={isDisabled}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        <option value="">
          {loading ? "Loading Facebook Pages..." : "Select a Facebook Page"}
        </option>

        {availableConnections.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.pageName}
          </option>
        ))}
      </select>

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : availableConnections.length === 0 && !loading ? (
        <p className="text-sm text-amber-700">
          No Facebook Pages with publishing permission are available in this
          workspace. Connect a Facebook Page before selecting it.
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Choose the Facebook Page where this post should eventually be
          published.
        </p>
      )}
    </div>
  );
}
