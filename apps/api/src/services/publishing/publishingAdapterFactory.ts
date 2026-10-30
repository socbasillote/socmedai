import type { AuthenticatedUser } from "../userProfileService.js";

import type { PublishingAdapter } from "./publishingAdapter.js";

import { LinkedInPublishingAdapter } from "./linkedinPublishingAdapter.js";

import {
  PlatformPublishingAdapterRouter,
  type PlatformPublishingAdapters,
} from "./platformPublishingAdapterRouter.js";

/**
 * Explicit activation configuration.
 *
 * Supplying a Facebook adapter does NOT activate it.
 * The enabled flag must also be exactly true.
 */
export type PublishingAdapterFactoryOptions = {
  facebook?: {
    enabled?: boolean;
    adapter?: PublishingAdapter;
  };
};

/**
 * Creates a platform-aware publishing adapter.
 *
 * Default behavior:
 * - LinkedIn: enabled, using the existing live adapter.
 * - Facebook: disabled.
 * - Instagram: disabled.
 *
 * This factory does not publish anything itself.
 */
export function createPublishingAdapter(
  authUser: AuthenticatedUser,
  options: PublishingAdapterFactoryOptions = {},
): PublishingAdapter {
  const adapters: PlatformPublishingAdapters = {
    linkedin: new LinkedInPublishingAdapter(authUser),

    // Facebook requires BOTH:
    // 1. Explicit activation.
    // 2. An explicitly supplied adapter.
    //
    // If either is absent, Facebook remains disabled.
    ...(options.facebook?.enabled === true && options.facebook.adapter
      ? {
          facebook: options.facebook.adapter,
        }
      : {}),
  };

  return new PlatformPublishingAdapterRouter(adapters);
}
