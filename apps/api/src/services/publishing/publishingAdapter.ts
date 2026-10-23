export type PublishingPlatform = "facebook" | "instagram" | "linkedin";

type BasePublishingInput = {
  postId: string;
  workspaceId: string;
  caption: string;
  mediaIds: string[];
};

export type PublishingInput =
  | (BasePublishingInput & {
      platform: "linkedin";
      connectionId: string;
    })
  | (BasePublishingInput & {
      platform: "facebook" | "instagram";
      connectionId?: never;
    });

export type PublishingResult =
  | {
      outcome: "simulated";
      postId: string;
      platform: PublishingPlatform;
      simulatedAt: Date;
      message: string;
    }
  | {
      outcome: "published";
      postId: string;
      platform: PublishingPlatform;
      externalPostId: string;
      publishedAt: Date;
    }
  | {
      outcome: "failed";
      postId: string;
      platform: PublishingPlatform;
      message: string;
    }
  | {
      outcome: "unknown";
      postId: string;
      platform: PublishingPlatform;
      message: string;
    };

export interface PublishingAdapter {
  publish(input: PublishingInput): Promise<PublishingResult>;
}
