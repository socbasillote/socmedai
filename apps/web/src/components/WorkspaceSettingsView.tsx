import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Settings2, Globe2, CalendarClock, ShieldAlert, Camera, Check } from "lucide-react";
import type { Workspace } from "@/lib/workspaces";
import { readWorkspacePreferences, saveWorkspacePreferences, setWorkspaceLifecycle, type WorkspacePreferences } from "@/lib/workspaceSettings";
import { useFacebookConnections } from "@/hooks/useFacebookConnections";
import { useFacebookConnection } from "@/hooks/useFacebookConnection";
import { useLinkedInConnection } from "@/hooks/useLinkedInConnection";

const fieldClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50";
const outlineClass = "min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const languages = { en: "English", fil: "Filipino", es: "Spanish", fr: "French", de: "German", ja: "Japanese", ko: "Korean", pt: "Portuguese", zh: "Chinese" };
const tabs = ["General Settings", "Social Accounts", "Publishing Preferences"] as const;
type Tab = typeof tabs[number];

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{children}{help && <span className="mt-2 block text-sm font-normal text-slate-500">{help}</span>}</label>;
}

export function WorkspaceSettingsView({ workspace, onUpdated, onDeleted }: { workspace: Workspace; onUpdated: (workspace: Workspace) => void; onDeleted: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("General Settings");
  const [name, setName] = useState(workspace.name);
  const [preferences, setPreferences] = useState(() => readWorkspacePreferences(workspace));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  // Parent keys this view by workspace ID; late responses update only that ID.
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!action) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector("input")?.focus();
    return () => previous?.focus();
  }, [action]);
  const archived = Boolean(workspace.archivedAt);
  const facebook = useFacebookConnections(archived ? "" : workspace._id);
  const facebookConnect = useFacebookConnection(archived ? "" : workspace._id);
  const linkedin = useLinkedInConnection(archived ? "" : workspace._id, setMessage);
  const timezoneList = Array.from(new Set(["UTC", preferences.timezone, ...Intl.supportedValuesOf("timeZone")]));

  function update<K extends keyof WorkspacePreferences>(key: K, value: WorkspacePreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setMessage(""); setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage(""); setError("");
    const patch = tab === "General Settings" ? { name, description: preferences.description, timezone: preferences.timezone, defaultLanguage: preferences.defaultLanguage, avatar: preferences.avatar }
      : tab === "Social Accounts" ? { defaultDestinations: preferences.defaultDestinations }
      : { timezone: preferences.timezone, publishing: preferences.publishing };
    try {
      const updated = await saveWorkspacePreferences(workspace._id, patch);
      onUpdated(updated);
      if (tab === "General Settings") { setName(updated.name); update("avatar", readWorkspacePreferences(updated).avatar); }
      setMessage(`${tab} saved.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save settings."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function lifecycle(event: FormEvent) {
    event.preventDefault();
    if (!action || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const updated = await setWorkspaceLifecycle(workspace._id, action, confirmation);
      if (updated) onUpdated(updated); else onDeleted(workspace._id);
      setAction(null); setConfirmation(""); setMessage(action === "restore" ? "Workspace restored." : "Workspace archived.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change workspace."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 120 * 1024) { setError("Choose a PNG, JPG, or WebP avatar under 120 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (mounted.current) update("avatar", String(reader.result)); };
    reader.onerror = () => setError("Unable to read this avatar.");
    reader.readAsDataURL(file);
  }

  const statusError = error || facebook.error || facebookConnect.connectError || linkedin.statusError || linkedin.connectError || linkedin.disconnectError;
  return <section className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-violet-600">WORKSPACE</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Workspace settings</h1><p className="mt-2 text-base text-slate-500">Manage {workspace.name} and the defaults your team starts with.</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-medium ${archived ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{archived ? "Archived" : "Active workspace"}</span>
    </header>
    <nav aria-label="Workspace settings sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
      {tabs.map((item, index) => { const Icon = [Settings2, Globe2, CalendarClock][index]; return <button key={item} type="button" aria-pressed={tab === item} onClick={() => { setTab(item); setMessage(""); }} className={`flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${tab === item ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-50"}`}><Icon size={18} aria-hidden="true" />{item}</button>; })}
    </nav>
    {statusError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{statusError}</p>}
    {message && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><Check size={18} />{message}</p>}
    {archived && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This workspace is archived. Restore it below to create content, connect accounts, or edit its settings.</p>}
    <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <fieldset disabled={busy || archived} className="space-y-6 p-5 sm:p-8">
        <legend className="sr-only">{tab}</legend>
        <div><h2 className="text-lg font-bold">{tab}</h2><p className="mt-1 text-sm text-slate-500">{tab === "General Settings" ? "Your workspace identity and regional defaults." : tab === "Social Accounts" ? "Choose the accounts suggested when you start a new post." : "Set a starting point for new posts. Your explicit choices always take priority."}</p></div>
        {tab === "General Settings" && <>
          <div className="flex flex-wrap items-center gap-5"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-100 text-2xl font-bold text-violet-700">{preferences.avatar ? <img src={preferences.avatar} alt="Workspace avatar" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}</div><div><label className={`${outlineClass} inline-flex cursor-pointer items-center gap-2`}><Camera size={16} />Upload avatar<input aria-label="Upload workspace avatar" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void uploadAvatar(event.target.files?.[0])} /></label>{preferences.avatar && <button type="button" className="ml-3 min-h-11 text-sm text-slate-600" onClick={() => update("avatar", "")}>Remove avatar</button>}<p className="mt-2 text-sm text-slate-500">PNG, JPG, or WebP. Maximum 120 KB. Separate from your branding logo.</p></div></div>
          <Field label="Workspace name"><input className={fieldClass} value={name} required maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description"><textarea className={fieldClass} rows={3} value={preferences.description} maxLength={1000} onChange={(e) => update("description", e.target.value)} /></Field>
          <div className="grid gap-6 sm:grid-cols-2"><Field label="Timezone" help="Also used by publishing preferences."><select className={fieldClass} value={preferences.timezone} onChange={(e) => update("timezone", e.target.value)}>{timezoneList.map((zone) => <option key={zone}>{zone}</option>)}</select></Field><Field label="Default language" help="Suggested content language; saved posts are never translated."><select className={fieldClass} value={preferences.defaultLanguage} onChange={(e) => update("defaultLanguage", e.target.value)}>{Object.entries(languages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
        </>}
        {tab === "Social Accounts" && <>
          <p className="text-sm text-slate-500">If both defaults are set, new posts start with Facebook. Change the platform or account in the composer at any time.</p>
          <article className="space-y-4 rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">Facebook Pages</h3><p className="mt-1 text-sm text-slate-500">{facebook.loading ? "Loading Pages…" : `${facebook.connections.length} connected Page${facebook.connections.length === 1 ? "" : "s"}`}</p></div><button type="button" className={outlineClass} disabled={facebookConnect.connecting} onClick={() => void facebookConnect.connect()}>{facebookConnect.connecting ? "Connecting…" : facebook.connections.length ? "Reconnect Facebook" : "Connect Facebook"}</button></div>
            {facebook.connections.map((page) => <div key={page.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-sm"><span className="font-medium">{page.pageName}</span><span className={page.status === "connected" && page.canPublish ? "text-emerald-700" : "text-amber-700"}>{page.status === "connected" && !page.canPublish ? "Publishing permission missing" : page.status}</span></div>)}
            <Field label="Default Facebook Page"><select className={fieldClass} value={preferences.defaultDestinations.facebook ?? ""} disabled={facebook.loading} onChange={(e) => update("defaultDestinations", { ...preferences.defaultDestinations, facebook: e.target.value || null })}><option value="">No default — choose for each post</option>{preferences.defaultDestinations.facebook && !facebook.connections.some((page) => page.id === preferences.defaultDestinations.facebook) && <option value={preferences.defaultDestinations.facebook} disabled>Saved Page unavailable — choose another or clear</option>}{facebook.connections.map((page) => <option key={page.id} value={page.id} disabled={page.status !== "connected" || !page.canPublish}>{page.pageName} ({page.status})</option>)}</select></Field>
          </article>
          <article className="space-y-4 rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">LinkedIn account</h3><p className="mt-1 text-sm text-slate-500">{linkedin.displayName || "No account selected"} · {linkedin.status}</p></div><div className="flex gap-2"><button type="button" className={outlineClass} disabled={linkedin.connecting} onClick={() => void linkedin.connect()}>{linkedin.connecting ? "Connecting…" : linkedin.connectionId ? "Reconnect LinkedIn" : "Connect LinkedIn"}</button>{linkedin.connectionId && <button type="button" className={outlineClass} disabled={linkedin.disconnecting} onClick={() => void linkedin.disconnect()}>Disconnect</button>}</div></div>
            <Field label="Default LinkedIn account"><select className={fieldClass} value={preferences.defaultDestinations.linkedin ?? ""} onChange={(e) => update("defaultDestinations", { ...preferences.defaultDestinations, linkedin: e.target.value || null })}><option value="">No default — choose for each post</option>{preferences.defaultDestinations.linkedin && preferences.defaultDestinations.linkedin !== linkedin.connectionId && <option value={preferences.defaultDestinations.linkedin} disabled>Saved account unavailable — choose another or clear</option>}{linkedin.connectionId && <option value={linkedin.connectionId} disabled={linkedin.status !== "connected"}>{linkedin.displayName || "LinkedIn account"} ({linkedin.status})</option>}</select></Field>
          </article>
          <article className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5"><h3 className="font-semibold text-slate-600">Instagram <span className="ml-2 rounded-full bg-slate-200 px-2 py-1 text-xs">Unavailable in settings</span></h3><p className="mt-3 text-sm text-slate-500">Instagram defaults will be available when its workspace integration is complete.</p></article>
          <button type="button" className={outlineClass} onClick={() => { facebook.refreshConnections(); linkedin.refreshStatus(); }}>Refresh connection status</button>
        </>}
        {tab === "Publishing Preferences" && <>
          <div className="grid gap-6 sm:grid-cols-2"><Field label="Default post mode"><select className={fieldClass} value={preferences.publishing.defaultPostMode} onChange={(e) => update("publishing", { ...preferences.publishing, defaultPostMode: e.target.value as WorkspacePreferences["publishing"]["defaultPostMode"] })}><option value="draft">Draft</option><option value="scheduled">Schedule</option><option value="immediate">Now (review required)</option></select></Field><Field label="Publishing timezone" help="Shared with General Settings. New schedules use this timezone."><select className={fieldClass} value={preferences.timezone} onChange={(e) => update("timezone", e.target.value)}>{timezoneList.map((zone) => <option key={zone}>{zone}</option>)}</select></Field></div>
          <div><h3 className="text-sm font-semibold text-slate-700">Preferred publishing times</h3><p className="mt-1 text-sm text-slate-500">Optional suggestions in {preferences.timezone}; they do not restrict manually chosen times.</p><div className="mt-3 flex flex-wrap gap-3">{preferences.publishing.preferredTimes.map((time, index) => <div key={index} className="flex items-center gap-2"><input aria-label={`Preferred time ${index + 1}`} type="time" required className={`${fieldClass} mt-0 w-auto`} value={time} onChange={(e) => update("publishing", { ...preferences.publishing, preferredTimes: preferences.publishing.preferredTimes.map((value, i) => i === index ? e.target.value : value) })} /><button type="button" aria-label={`Remove preferred time ${index + 1}`} className="min-h-11 px-2 text-sm text-rose-700" onClick={() => update("publishing", { ...preferences.publishing, preferredTimes: preferences.publishing.preferredTimes.filter((_, i) => i !== index) })}>Remove</button></div>)}</div><button type="button" className={`${outlineClass} mt-3`} disabled={preferences.publishing.preferredTimes.length >= 12} onClick={() => update("publishing", { ...preferences.publishing, preferredTimes: [...preferences.publishing.preferredTimes, "09:00"] })}>Add preferred time</button></div>
          <fieldset><legend className="text-sm font-semibold text-slate-700">Allowed scheduling days</legend><div className="mt-3 flex flex-wrap gap-2">{weekdays.map((day, index) => <label key={day} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm"><input type="checkbox" checked={preferences.publishing.allowedWeekdays.includes(index)} onChange={(e) => update("publishing", { ...preferences.publishing, allowedWeekdays: e.target.checked ? [...preferences.publishing.allowedWeekdays, index].sort() : preferences.publishing.allowedWeekdays.filter((value) => value !== index) })} />{day.slice(0, 3)}</label>)}</div><p className="mt-2 text-sm text-slate-500">Rules apply to new schedules and reschedules. Existing scheduled posts stay unchanged.</p></fieldset>
          <div className="grid gap-6 sm:grid-cols-2"><Field label="Minimum notice (minutes)"><input type="number" className={fieldClass} min={0} max={10080} required value={preferences.publishing.minimumNoticeMinutes} onChange={(e) => update("publishing", { ...preferences.publishing, minimumNoticeMinutes: Number(e.target.value) })} /></Field><Field label="Maximum advance (days)"><input type="number" className={fieldClass} min={1} max={365} required value={preferences.publishing.maximumAdvanceDays} onChange={(e) => update("publishing", { ...preferences.publishing, maximumAdvanceDays: Number(e.target.value) })} /></Field></div>
          <div className="rounded-xl bg-slate-50 p-4"><label className="flex items-center gap-3 text-sm font-medium text-slate-500"><input type="checkbox" disabled />Require approval before publishing <span className="rounded-full bg-slate-200 px-2 py-1 text-xs">Coming later</span></label><p className="mt-2 text-sm text-slate-500">Approval workflows are not enforced yet. Publishing now always requires review and confirmation.</p></div>
        </>}
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-8"><p className="text-sm text-slate-500">Changes apply to this workspace only.</p><button className={buttonClass} disabled={busy || archived} type="submit">{busy ? "Saving…" : `Save ${tab === "General Settings" ? "general settings" : tab === "Social Accounts" ? "publishing destinations" : "publishing preferences"}`}</button></footer>
    </form>
    <section aria-label="Danger zone" className="rounded-2xl border border-rose-200 bg-white p-5 sm:p-8"><h2 className="flex items-center gap-2 text-lg font-bold text-rose-800"><ShieldAlert size={20} />Danger zone</h2><div className="mt-5 flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-semibold">{archived ? "Restore workspace" : "Archive workspace"}</h3><p className="mt-1 max-w-xl text-sm text-slate-500">Archive to pause work without losing content. Restore it here at any time.</p></div><button className={outlineClass} type="button" disabled={busy} onClick={() => { setAction(archived ? "restore" : "archive"); setConfirmation(""); }}>{archived ? "Restore workspace" : "Archive workspace"}</button></div><div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-rose-100 pt-5"><div><h3 className="font-semibold">Delete workspace</h3><p className="mt-1 max-w-xl text-sm text-slate-500">Remove this workspace from the app. This cannot be undone here. Stored records and media are retained; this does not erase published social posts or revoke provider access.</p></div><button className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50" type="button" disabled={busy} onClick={() => { setAction("delete"); setConfirmation(""); }}>Delete workspace</button></div><p className="mt-4 text-sm text-slate-500">Cancel scheduled posts and let publishing or image generation finish before archiving or deleting.</p></section>
    {action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form ref={dialogRef} onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); setAction(null); setError(""); }
      if (event.key === "Tab") {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} role="dialog" aria-modal="true" aria-labelledby="workspace-action-title" onSubmit={lifecycle} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 id="workspace-action-title" className="text-xl font-bold capitalize">{action} workspace</h2><p className="mt-3 text-sm text-slate-600">Type <strong>{workspace.name}</strong> to confirm. {action === "delete" ? "The workspace will no longer be accessible in the app." : "Your content will be preserved."}</p><label className="mt-4 block text-sm font-semibold">Confirm workspace name<input autoFocus className={fieldClass} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" className={outlineClass} disabled={busy} onClick={() => { setAction(null); setError(""); }}>Cancel</button><button type="submit" className={buttonClass} disabled={busy || confirmation !== workspace.name}>{busy ? "Working…" : `Confirm ${action}`}</button></div></form></div>}
  </section>;
}
