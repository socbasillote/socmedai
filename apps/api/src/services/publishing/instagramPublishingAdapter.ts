import Post from "../../models/Post.js";
import type { AuthenticatedUser } from "../userProfileService.js";
import { authorizePublishing } from "./publishingAuthorizationService.js";
import { loadPublishingImage } from "./publishingMediaService.js";
import { getInstagramCredentials } from "../instagram/instagramConnectionService.js";
import { prepareInstagramMedia } from "../instagram/instagramMediaService.js";
import { publishInstagramImage } from "../instagram/instagramPostService.js";
import { ScheduledLeaseLostError } from "./scheduledPublishingHeartbeat.js";
import type { PublishingAdapter, PublishingInput, PublishingResult } from "./publishingAdapter.js";
export class InstagramPublishingAdapter implements PublishingAdapter {
  constructor(private readonly authUser: AuthenticatedUser, private readonly fetchImpl: typeof fetch = fetch) {}
  async publish(input: PublishingInput): Promise<PublishingResult> {
    const failed = (message: string): PublishingResult => ({ outcome: "failed", postId: input.postId, platform: input.platform, message });
    if (input.platform !== "instagram" || !input.connectionId || input.mediaIds.length !== 1) return failed("Instagram publishing requires a selected account and one image.");
    let executionStarted = false;
    let media: Awaited<ReturnType<typeof prepareInstagramMedia>> | undefined;
    try {
      await authorizePublishing({ authUser: this.authUser, workspaceId: input.workspaceId, postId: input.postId });
      const post = await Post.findOne({ _id: input.postId, workspaceId: input.workspaceId, status: "publishing" }).select("caption mediaIds platforms platformConnections").lean();
      if (!post || post.platforms.length !== 1 || post.platforms[0] !== "instagram" || String(post.platformConnections?.instagram) !== input.connectionId || post.mediaIds.length !== 1 || !post.caption.trim() || post.caption.length > 2200) return failed("The saved Instagram post is not eligible for publishing.");
      const credentials = await getInstagramCredentials(this.authUser, input.workspaceId, input.connectionId);
      const image = await loadPublishingImage(this.authUser, input.workspaceId, post.mediaIds.map(String));
      if (!image) return failed("Instagram requires an available image.");
      input.lease?.assertOwnership();
      media = await prepareInstagramMedia(image);
      executionStarted = true;
      const result = await publishInstagramImage({ ...credentials, caption: post.caption, imageUrl: media.imageUrl, beforeRequest: () => input.lease?.assertOwnership() }, this.fetchImpl);
      return result.outcome === "published"
        ? { ...result, postId: input.postId, platform: input.platform, publishedAt: new Date() }
        : { ...result, postId: input.postId, platform: input.platform };
    } catch (error) {
      if (error instanceof ScheduledLeaseLostError) throw error;
      if (executionStarted) return { outcome: "unknown", postId: input.postId, platform: input.platform, message: "Instagram publishing was interrupted. Check Instagram before attempting another publication." };
      return failed("Instagram publishing could not be prepared. Reconnect the account and verify the selected image.");
    } finally { await media?.cleanup(); }
  }
}
