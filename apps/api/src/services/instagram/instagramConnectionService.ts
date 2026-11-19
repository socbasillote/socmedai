import mongoose from "mongoose";
import InstagramConnection from "../../models/InstagramConnection.js";
import FacebookConnection from "../../models/FacebookConnection.js";
import { env } from "../../config/env.js";
import { getUserWorkspaceById, isValidWorkspaceId } from "../workspaceService.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { getFacebookPublishingCredentials } from "../facebook/facebookPublishingTokenService.js";

export class InstagramConnectionError extends Error {
  constructor(message: string, public readonly statusCode = 409) { super(message); }
}
async function authorize(authUser: AuthenticatedUser, workspaceId: string) {
  if (!isValidWorkspaceId(workspaceId) || !await getUserWorkspaceById(authUser, workspaceId)) {
    throw new InstagramConnectionError("Workspace not found.", 404);
  }
}
export async function listInstagramConnections(authUser: AuthenticatedUser, workspaceId: string) {
  await authorize(authUser, workspaceId);
  const connections = await InstagramConnection.find({ workspaceId }).select("_id instagramUserId username status facebookConnectionId").lean();
  const activePages = await FacebookConnection.find({ workspaceId, status: "connected", tasks: "CREATE_CONTENT" }).select("_id").lean();
  const activeIds = new Set(activePages.map((page) => String(page._id)));
  return connections.map((item) => ({ id: String(item._id), instagramUserId: item.instagramUserId, username: item.username, status: item.status, canPublish: item.status === "connected" && activeIds.has(String(item.facebookConnectionId)) }));
}
export async function discoverInstagramAccount(pageId: string, token: string, fetchImpl: typeof fetch = fetch) {
  if (!/^[0-9]+$/.test(pageId)) throw new InstagramConnectionError("Invalid Page identity.");
  if (!env.FACEBOOK_GRAPH_API_VERSION) throw new InstagramConnectionError("Configure the Facebook Graph API version before connecting Instagram.", 503);
  const url = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/${pageId}`);
  url.searchParams.set("fields", "instagram_business_account{id,username}");
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new InstagramConnectionError("Reconnect Facebook and grant Instagram publishing permissions.");
  const body = await response.json() as { instagram_business_account?: { id?: string; username?: string } };
  const account = body.instagram_business_account;
  if (!account || typeof account.id !== "string" || !/^[0-9]+$/.test(account.id) || typeof account.username !== "string" || !account.username.trim()) {
    throw new InstagramConnectionError("This Page has no accessible Instagram professional account.");
  }
  return { instagramUserId: account.id, username: account.username };
}
export async function assertInstagramPublishingAccess(instagramUserId: string, token: string, fetchImpl: typeof fetch = fetch) {
  if (!/^[0-9]+$/.test(instagramUserId) || !env.FACEBOOK_GRAPH_API_VERSION) throw new InstagramConnectionError("Instagram publishing is not configured.", 503);
  const url = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/${instagramUserId}/content_publishing_limit`);
  url.searchParams.set("fields", "quota_usage,config");
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new InstagramConnectionError("Instagram publishing access is unavailable. Reconnect Facebook and grant Instagram publishing permissions.");
  const body = await response.json() as { data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> };
  const quota = body.data?.[0];
  if (!quota || !Number.isFinite(quota.quota_usage) || !Number.isFinite(quota.config?.quota_total) || quota.quota_usage! < 0 || quota.config!.quota_total! <= 0) {
    throw new InstagramConnectionError("Instagram publishing quota could not be verified.");
  }
  if (quota.quota_usage! >= quota.config!.quota_total!) throw new InstagramConnectionError("Instagram's publishing limit has been reached. Try again after the account quota resets.");
}

// Discovery accepts only a saved, authorized Page connection; never caller tokens or IG IDs.
export async function connectInstagramAccount(authUser: AuthenticatedUser, workspaceId: string, facebookConnectionId: string) {
  await authorize(authUser, workspaceId);
  if (!mongoose.isObjectIdOrHexString(facebookConnectionId)) throw new InstagramConnectionError("Select a valid Facebook Page.", 400);
  const credentials = await getFacebookPublishingCredentials({ authUser, workspaceId, connectionId: facebookConnectionId });
  const account = await discoverInstagramAccount(credentials.facebookPageId, credentials.pageAccessToken);
  await assertInstagramPublishingAccess(account.instagramUserId, credentials.pageAccessToken);
  await InstagramConnection.updateMany({ workspaceId, facebookConnectionId, instagramUserId: { $ne: account.instagramUserId } }, { $set: { status: "revoked" } });
  await InstagramConnection.findOneAndUpdate({ workspaceId, instagramUserId: account.instagramUserId }, { $set: { facebookConnectionId, username: account.username, status: "connected" } }, { upsert: true, runValidators: true });
  return listInstagramConnections(authUser, workspaceId);
}
export async function validateInstagramSelection(workspaceId: string, connectionId: string) {
  if (!mongoose.isObjectIdOrHexString(connectionId)) throw new InstagramConnectionError("Select a valid Instagram account.", 400);
  const connection = await InstagramConnection.findOne({ _id: connectionId, workspaceId, status: "connected" }).select("facebookConnectionId").lean();
  if (!connection || !await FacebookConnection.exists({ _id: connection.facebookConnectionId, workspaceId, status: "connected", tasks: "CREATE_CONTENT" })) {
    throw new InstagramConnectionError("Connect an active Instagram professional account before publishing.");
  }
  return connectionId;
}
export async function getInstagramCredentials(authUser: AuthenticatedUser, workspaceId: string, connectionId: string) {
  await authorize(authUser, workspaceId);
  await validateInstagramSelection(workspaceId, connectionId);
  const connection = await InstagramConnection.findOne({ _id: connectionId, workspaceId, status: "connected" }).select("facebookConnectionId instagramUserId").lean();
  if (!connection) throw new InstagramConnectionError("Instagram account is unavailable.");
  const credentials = await getFacebookPublishingCredentials({ authUser, workspaceId, connectionId: String(connection.facebookConnectionId) });
  const current = await discoverInstagramAccount(credentials.facebookPageId, credentials.pageAccessToken);
  if (current.instagramUserId !== connection.instagramUserId) throw new InstagramConnectionError("The linked Instagram account changed. Reconnect it before publishing.");
  await assertInstagramPublishingAccess(connection.instagramUserId, credentials.pageAccessToken);
  return { instagramUserId: connection.instagramUserId as string, accessToken: credentials.pageAccessToken };
}
