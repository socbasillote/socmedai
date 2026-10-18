export type PublishingPlatform = "facebook" | "instagram" | "linkedin";

export type PublishingInput = {
  postId: string;
  platform: PublishingPlatform;
  caption: string;
  mediaIds: string[];
};

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
    };

export interface PublishingAdapter {
  publish(input: PublishingInput): Promise<PublishingResult>;
}
