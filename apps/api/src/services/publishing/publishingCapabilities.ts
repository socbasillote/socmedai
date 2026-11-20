export function getPublishingCapabilities() {
  const facebookEnabled = process.env.FACEBOOK_PUBLISHING_ENABLED === "true";
  const schedulingEnabled = process.env.SCHEDULED_PUBLISHING_ENABLED === "true";
  return {
    facebook: { publishNow: facebookEnabled, schedule: facebookEnabled && schedulingEnabled },
    linkedin: { publishNow: true, schedule: schedulingEnabled },
    instagram: { publishNow: true, schedule: schedulingEnabled },
  };
}

export function publishingUnavailableReason(platform: string, action: "now" | "schedule"): string | undefined {
  const capabilities = getPublishingCapabilities();
  if (!(platform in capabilities)) return "This publishing platform is not supported.";
  const capability = capabilities[platform as keyof typeof capabilities];
  if (!(action === "now" ? capability.publishNow : capability.schedule)) {
    return action === "schedule" ? "Scheduled publishing is disabled for this platform on the server." : "Publishing is disabled for this platform on the server.";
  }
}
