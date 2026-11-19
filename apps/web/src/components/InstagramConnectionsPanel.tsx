import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstagramConnections } from "@/hooks/useInstagramConnections";
import type { FacebookConnectionInfo } from "@/lib/facebookApi";

type Props = {
  workspaceId: string;
  workspacesLoading: boolean;
  pages: FacebookConnectionInfo[];
  pagesLoading: boolean;
  pagesError: string;
  facebookConnecting: boolean;
  onReconnectFacebook: () => void;
};

export function InstagramConnectionsPanel({ workspaceId, workspacesLoading, pages, pagesLoading, pagesError, facebookConnecting, onReconnectFacebook }: Props) {
  const instagram = useInstagramConnections(workspaceId, Boolean(workspaceId) && !workspacesLoading);
  const [selection, setSelection] = useState({ workspaceId: "", pageId: "" });
  const availablePages = pages.filter((page) => page.status === "connected" && page.canPublish !== false);
  const pageId = selection.workspaceId === workspaceId && availablePages.some((page) => page.id === selection.pageId) ? selection.pageId : "";
  const disabled = !workspaceId || workspacesLoading || pagesLoading || Boolean(pagesError) || instagram.loading || facebookConnecting;

  return <div className="space-y-3 border-t border-slate-100 pt-4">
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600"><Camera size={20} aria-hidden="true" /></span>
      <div><h3 className="text-sm font-semibold text-slate-900">Instagram</h3><p className="text-xs text-slate-500">Professional accounts linked to Facebook Pages</p></div>
    </div>
    {!workspaceId ? <p className="text-sm text-slate-500">Select a workspace to manage Instagram accounts.</p> : <>
      {(instagram.loading || workspacesLoading) && <p role="status" className="text-sm text-slate-500">Loading Instagram connections...</p>}
      {instagram.error && <p role="alert" className="text-sm text-rose-700">{instagram.error}</p>}
      {!instagram.loading && !workspacesLoading && !instagram.error && <>
        {instagram.connections.length === 0 ? <p className="text-sm text-slate-500">No Instagram accounts connected to this workspace.</p> :
          <ul className="space-y-2">{instagram.connections.map((account) => <li key={account.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="break-words text-sm font-medium">@{account.username}</p>
            <p className={`mt-1 text-xs ${account.status === "connected" && account.canPublish ? "text-emerald-700" : "text-amber-700"}`}>
              {account.status === "connected" && account.canPublish ? "Connected" : "Reconnect required"}
            </p>
          </li>)}</ul>}
      </>}
      <label className="block text-sm font-medium text-slate-700">Facebook Page for Instagram
        <select aria-label="Facebook Page for Instagram" value={pageId} disabled={disabled}
          onChange={(event) => setSelection({ workspaceId, pageId: event.target.value })} className="mt-2 w-full min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-sm">
          <option value="">Choose a connected Page</option>
          {availablePages.map((page) => <option key={page.id} value={page.id}>{page.pageName}</option>)}
        </select>
      </label>
      <Button type="button" variant="outline" className="w-full" disabled={disabled || !pageId} onClick={() => { void instagram.connect(pageId); }}>
        {instagram.loading ? "Connecting..." : "Connect or refresh Instagram"}
      </Button>
      <p className="text-xs leading-5 text-slate-500">Choose the Page linked to your Instagram professional account. Reconnect Facebook to grant Instagram permissions if needed.</p>
      {!pagesLoading && !pagesError && availablePages.length === 0 && <p className="text-xs text-slate-500">Connect a Facebook Page before adding Instagram.</p>}
      <Button type="button" variant="outline" className="w-full" disabled={!workspaceId || workspacesLoading || facebookConnecting || instagram.loading} onClick={onReconnectFacebook}>
        {facebookConnecting ? "Connecting Facebook..." : "Connect Facebook for Instagram"}
      </Button>
    </>}
  </div>;
}
