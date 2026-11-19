import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), find: vi.fn(), credentials: vi.fn(), image: vi.fn(), media: vi.fn(), publish: vi.fn(), cleanup: vi.fn() }));
vi.mock("../../models/Post.js", () => ({ default: { findOne: mocks.find } }));
vi.mock("./publishingAuthorizationService.js", () => ({ authorizePublishing: mocks.authorize }));
vi.mock("./publishingMediaService.js", () => ({ loadPublishingImage: mocks.image }));
vi.mock("../instagram/instagramConnectionService.js", () => ({ getInstagramCredentials: mocks.credentials }));
vi.mock("../instagram/instagramMediaService.js", () => ({ prepareInstagramMedia: mocks.media }));
vi.mock("../instagram/instagramPostService.js", () => ({ publishInstagramImage: mocks.publish }));
import { InstagramPublishingAdapter } from "./instagramPublishingAdapter.js";
const input = { platform: "instagram" as const, postId: "post", workspaceId: "workspace", connectionId: "connection", caption: "untrusted caption", mediaIds: ["image"] };
const auth = { id: "owner", email: null };
beforeEach(() => {
 vi.resetAllMocks();
 mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ caption: "saved caption", mediaIds: ["saved-image"], platforms: ["instagram"], platformConnections: { instagram: "connection" } }) }) });
 mocks.credentials.mockResolvedValue({ instagramUserId: "123", accessToken: "secret" });
 mocks.image.mockResolvedValue(Buffer.from("image"));
 mocks.media.mockResolvedValue({ imageUrl: "https://storage.example/image.jpg", cleanup: mocks.cleanup });
 mocks.publish.mockResolvedValue({ outcome: "published", externalPostId: "456" });
});
it("publishes authorized saved content and cleans up temporary media", async () => {
 expect((await new InstagramPublishingAdapter(auth).publish(input)).outcome).toBe("published");
 expect(mocks.image).toHaveBeenCalledWith(auth, "workspace", ["saved-image"]);
 expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ caption: "saved caption" }), expect.any(Function));
 expect(mocks.cleanup).toHaveBeenCalledOnce();
});
it("rejects workspace authorization before loading content or credentials", async () => {
 mocks.authorize.mockRejectedValue(new Error("denied"));
 expect((await new InstagramPublishingAdapter(auth).publish(input)).outcome).toBe("failed");
 expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
});
it("rejects a mismatched selected connection", async () => {
 expect((await new InstagramPublishingAdapter(auth).publish({ ...input, connectionId: "other" })).outcome).toBe("failed");
 expect(mocks.credentials).not.toHaveBeenCalled();
});
it("rejects a missing or unauthorized image before submitting", async () => {
 mocks.image.mockRejectedValue(new Error("denied"));
 expect((await new InstagramPublishingAdapter(auth).publish(input)).outcome).toBe("failed");
 expect(mocks.publish).not.toHaveBeenCalled();
});
it("preserves uncertain provider outcomes and cleans up without retrying", async () => {
 mocks.publish.mockResolvedValue({ outcome: "unknown", message: "Check Instagram" });
 expect((await new InstagramPublishingAdapter(auth).publish(input)).outcome).toBe("unknown");
 expect(mocks.publish).toHaveBeenCalledOnce(); expect(mocks.cleanup).toHaveBeenCalledOnce();
});
