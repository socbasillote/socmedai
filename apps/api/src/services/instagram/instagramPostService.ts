import { env } from "../../config/env.js";
import { ScheduledLeaseLostError } from "../publishing/scheduledPublishingHeartbeat.js";
export type InstagramPostResult = { outcome: "published"; externalPostId: string } | { outcome: "failed" | "unknown"; message: string };
export async function publishInstagramImage(input: {
  instagramUserId: string; accessToken: string; caption: string; imageUrl: string; beforeRequest?: () => void;
}, fetchImpl: typeof fetch = fetch, wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<InstagramPostResult> {
  if (!/^[0-9]+$/.test(input.instagramUserId) || !input.accessToken.trim() || !input.caption.trim() || input.caption.length > 2200) {
    return { outcome: "failed", message: "Instagram requires an account, one image, and a caption of 1-2,200 characters." };
  }
  if (!env.FACEBOOK_GRAPH_API_VERSION) return { outcome: "failed", message: "Configure the Facebook Graph API version before publishing to Instagram." };
  const base = `https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}`;
  const headers = { Authorization: `Bearer ${input.accessToken}` };
  let containerId: string;
  // Container creation and processing do not create a public post.
  try {
    if (new URL(input.imageUrl).protocol !== "https:") throw new Error("Invalid media URL");
    input.beforeRequest?.();
    const response = await fetchImpl(`${base}/${input.instagramUserId}/media`, { method: "POST", headers, body: new URLSearchParams({ image_url: input.imageUrl, caption: input.caption }), redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("Container rejected");
    const body = await response.json() as { id?: string };
    if (typeof body.id !== "string" || !/^[0-9]+$/.test(body.id)) throw new Error("Invalid container");
    containerId = body.id;
    let finished = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      input.beforeRequest?.();
      const status = await fetchImpl(`${base}/${containerId}?fields=status_code`, { headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!status.ok) throw new Error("Container status unavailable");
      const data = await status.json() as { status_code?: string };
      if (data.status_code === "FINISHED") { finished = true; break; }
      if (data.status_code !== "IN_PROGRESS") throw new Error("Container processing failed");
      if (attempt < 4) await wait(60_000);
    }
    if (!finished) throw new Error("Container processing timed out");
  } catch (error) {
    if (error instanceof ScheduledLeaseLostError) throw error;
    return { outcome: "failed", message: "Instagram image preparation failed. No post was submitted. Check the account permissions and image." };
  }
  // Never retry this request: a lost response may still mean a published post.
  try {
    input.beforeRequest?.();
    const response = await fetchImpl(`${base}/${input.instagramUserId}/media_publish`, { method: "POST", headers, body: new URLSearchParams({ creation_id: containerId }), redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (response.ok) {
      const body = await response.json() as { id?: string };
      if (typeof body.id === "string" && /^[0-9]+$/.test(body.id)) return { outcome: "published", externalPostId: body.id };
    } else if ([400, 401, 403, 404, 422].includes(response.status)) {
      return { outcome: "failed", message: `Instagram rejected publication (HTTP ${response.status}).` };
    }
  } catch (error) { if (error instanceof ScheduledLeaseLostError) throw error; }
  return { outcome: "unknown", message: "Instagram publication could not be confirmed. Check Instagram before attempting another publication." };
}
