import type {
  PublishingAdapter,
  PublishingInput,
  PublishingPlatform,
  PublishingResult,
} from "./publishingAdapter.js";

/**
 * Explicit platform-to-adapter configuration.
 *
 * A missing adapter means publishing is disabled
 * for that platform.
 */
export type PlatformPublishingAdapters = Readonly<
  Partial<Record<PublishingPlatform, PublishingAdapter>>
>;

/**
 * Routes publishing requests to the adapter
 * configured for the requested platform.
 *
 * No live publishing adapter is instantiated here.
 * No automatic fallback to a different platform.
 */
export class PlatformPublishingAdapterRouter implements PublishingAdapter {
  private readonly adapters: PlatformPublishingAdapters;

  constructor(adapters: PlatformPublishingAdapters) {
    // Copy the configured adapters so later mutation
    // of the original object does not change routing.
    this.adapters = {
      facebook: adapters.facebook,
      linkedin: adapters.linkedin,
      instagram: adapters.instagram,
    };
  }

  async publish(input: PublishingInput): Promise<PublishingResult> {
    let adapter: PublishingAdapter | undefined;

    // Explicit dispatch prevents accidentally
    // sending a request to the wrong platform.
    switch (input.platform) {
      case "facebook":
        adapter = this.adapters.facebook;
        break;

      case "linkedin":
        adapter = this.adapters.linkedin;
        break;

      case "instagram":
        adapter = this.adapters.instagram;
        break;
    }

    // Fail closed: never choose another adapter.
    if (!adapter) {
      return {
        outcome: "failed",
        postId: input.postId,
        platform: input.platform,
        message: `Publishing is not configured for ${input.platform}.`,
      };
    }

    // Forward the original input unchanged.
    //
    // Each adapter remains responsible for its
    // own authorization, saved-post verification,
    // credential checks, and publishing operation.
    //
    // Do not catch exceptions here: an unexpected
    // exception after an external request may mean
    // the publication outcome is unknown.
    return adapter.publish(input);
  }
}
