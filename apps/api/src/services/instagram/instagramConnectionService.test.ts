import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), find: vi.fn(), page: vi.fn(), credentials: vi.fn() }));
vi.mock("../../models/InstagramConnection.js", () => ({ default: { findOne: mocks.find } }));
vi.mock("../../models/FacebookConnection.js", () => ({ default: { exists: mocks.page } }));
vi.mock("../workspaceService.js", () => ({ isValidWorkspaceId: () => true, getUserWorkspaceById: mocks.workspace }));
vi.mock("../facebook/facebookPublishingTokenService.js", () => ({ getFacebookPublishingCredentials: mocks.credentials }));
import { assertInstagramPublishingAccess, discoverInstagramAccount, getInstagramCredentials, validateInstagramSelection } from "./instagramConnectionService.js";
const id = "507f1f77bcf86cd799439011";
beforeEach(() => { vi.resetAllMocks(); });
it("discovers only a linked professional account using a server-side token", async () => {
 const fetcher = vi.fn(async (_url: URL | RequestInfo, _options?: RequestInit) => new Response(JSON.stringify({ instagram_business_account: { id: "123", username: "studio" } })));
 expect(await discoverInstagramAccount("456", "secret", fetcher)).toEqual({ instagramUserId: "123", username: "studio" });
 expect(String(fetcher.mock.calls[0][0])).not.toContain("secret");
});
it("rejects a Page without a professional account", async () => {
 await expect(discoverInstagramAccount("456", "secret", vi.fn(async () => new Response("{}")))).rejects.toThrow("professional account");
});
it("never retrieves credentials without workspace access", async () => {
 mocks.workspace.mockResolvedValue(null);
 await expect(getInstagramCredentials({ id: "owner", email: null }, id, id)).rejects.toThrow("Workspace not found");
 expect(mocks.credentials).not.toHaveBeenCalled();
});
it("scopes account selection to the requested workspace", async () => {
 mocks.find.mockReturnValue({ select: () => ({ lean: async () => null }) });
 await expect(validateInstagramSelection(id, id)).rejects.toThrow("active Instagram");
 expect(mocks.find).toHaveBeenCalledWith({ _id: id, workspaceId: id, status: "connected" });
});
it("rejects a revoked underlying Page", async () => {
 mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ facebookConnectionId: id }) }) });
 mocks.page.mockResolvedValue(null);
 await expect(validateInstagramSelection(id, id)).rejects.toThrow("active Instagram");
});

it("refuses publication if the Page now links to a different Instagram account", async () => {
 mocks.workspace.mockResolvedValue({ _id: id });
 mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ facebookConnectionId: id, instagramUserId: "123" }) }) });
 mocks.page.mockResolvedValue({ _id: id });
 mocks.credentials.mockResolvedValue({ facebookPageId: "456", pageAccessToken: "secret" });
 const fetcher = vi.fn(async () => new Response(JSON.stringify({ instagram_business_account: { id: "999", username: "other" } })));
 vi.stubGlobal("fetch", fetcher);
 try { await expect(getInstagramCredentials({ id: "owner", email: null }, id, id)).rejects.toThrow("account changed"); }
 finally { vi.unstubAllGlobals(); }
});

it("verifies publishing access and the provider quota without submitting a post", async () => {
 const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ quota_usage: 2, config: { quota_total: 100 } }] })));
 await assertInstagramPublishingAccess("123", "secret", fetcher);
 expect(fetcher).toHaveBeenCalledOnce();
});
it.each([new Response("{}", { status: 403 }), new Response(JSON.stringify({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] }))])("blocks missing permissions or exhausted quotas", async (response) => {
 await expect(assertInstagramPublishingAccess("123", "secret", vi.fn(async () => response))).rejects.toThrow();
});
