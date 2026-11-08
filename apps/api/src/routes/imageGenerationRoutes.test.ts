import express from "express";
import request from "supertest";

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import imageGenerationRoutes from "./imageGenerationRoutes.js";

import { enqueueImageGeneration } from "../services/imageGenerationQueueService.js";
import {
  getImageGenerationCredits,
  getImageGenerationStatus,
} from "../services/imageGenerationApiQueryService.js";

import { createPrivateImageAccessUrl } from "../services/media/mediaImageAccessService.js";

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const token = req.headers.authorization;

    if (token !== "Bearer test-user") {
      res.status(401).json({
        error: "Unauthorized",
      });
      return;
    }

    res.locals.authUser = {
      id: "test-supabase-user",
    };

    next();
  },
}));

vi.mock("../services/imageGenerationQueueService.js", () => ({
  enqueueImageGeneration: vi.fn(),
}));
vi.mock("../services/imageGenerationApiQueryService.js", () => ({
  getImageGenerationCredits: vi.fn(),
  getImageGenerationStatus: vi.fn(),
}));

vi.mock("../services/media/supabaseImageStorage.js", () => ({
  getPrivateImageBucket: vi.fn(() => ({
    upload: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock("../services/media/mediaImageAccessService.js", () => ({
  createPrivateImageAccessUrl: vi.fn(),
}));

const workspaceId = "507f1f77bcf86cd799439011";

const assetId = "507f1f77bcf86cd799439022";

const app = express();

app.use(express.json());
app.use("/api/ai", imageGenerationRoutes);

const endpoint = `/api/ai/workspaces/${workspaceId}/images`;

const validBody = {
  idempotencyKey: "image-route-request-0001",
  image: {
    prompt: "A cinematic premium product photograph.",
    aspectRatio: "square",
  },
};

function authorizedPost() {
  return request(app).post(endpoint).set("Authorization", "Bearer test-user");
}

function authorizedGet(path: string) {
  return request(app).get(path).set("Authorization", "Bearer test-user");
}

beforeEach(() => {
  vi.clearAllMocks();

  process.env.IMAGE_GENERATION_PROVIDER = "mock";
  process.env.IMAGE_GENERATION_LIVE_ENABLED = "false";
  process.env.IMAGE_GENERATION_HTTP_ENABLED = "true";

  vi.mocked(enqueueImageGeneration).mockResolvedValue({
    assetId,
    status: "pending",
    created: true,
    creditsChargedNow: 1,
  });
});

afterEach(() => {
  delete process.env.IMAGE_GENERATION_HTTP_ENABLED;
  delete process.env.IMAGE_GENERATION_PROVIDER;
  delete process.env.IMAGE_GENERATION_LIVE_ENABLED;
});

describe("Image generation HTTP routes", () => {
  it("requires authentication for generation", async () => {
    const response = await request(app).post(endpoint).send(validBody);

    expect(response.status).toBe(401);

    expect(enqueueImageGeneration).not.toHaveBeenCalled();
  });

  it("accepts a queued generation with a safe response", async () => {
    const response = await authorizedPost().send(validBody);

    expect(response.status).toBe(202);

    expect(response.body).toEqual({
      assetId,
      status: "pending",
      created: true,
      creditsChargedNow: 1,
    });

    expect(response.body).not.toHaveProperty("contentSha256");

    expect(response.body).not.toHaveProperty("claimToken");

    expect(response.body).not.toHaveProperty("storageKey");

    expect(enqueueImageGeneration).toHaveBeenCalledOnce();
  });

  it("returns 200 for an idempotent retry", async () => {
    vi.mocked(enqueueImageGeneration).mockResolvedValueOnce({
      assetId,
      status: "ready",
      created: false,
      creditsChargedNow: 0,
    });

    const response = await authorizedPost().send(validBody);

    expect(response.status).toBe(200);
    expect(response.body.creditsChargedNow).toBe(0);
  });

  it("rejects invalid generation input", async () => {
    const response = await authorizedPost().send({
      ...validBody,
      image: {
        prompt: "short",
        aspectRatio: "square",
      },
    });

    expect(response.status).toBe(400);

    expect(enqueueImageGeneration).not.toHaveBeenCalled();
  });

  it("rejects client-controlled provider fields", async () => {
    const response = await authorizedPost().send({
      ...validBody,
      provider: "openai",
    });

    expect(response.status).toBe(400);

    expect(enqueueImageGeneration).not.toHaveBeenCalled();
  });

  it("keeps generation disabled by default", async () => {
    delete process.env.IMAGE_GENERATION_HTTP_ENABLED;

    const response = await authorizedPost().send(validBody);

    expect(response.status).toBe(503);

    expect(enqueueImageGeneration).not.toHaveBeenCalled();
  });

  it("rejects live provider configuration", async () => {
    process.env.IMAGE_GENERATION_PROVIDER = "openai";
    process.env.IMAGE_GENERATION_LIVE_ENABLED = "true";

    const response = await authorizedPost().send(validBody);

    expect(response.status).toBe(503);

    expect(enqueueImageGeneration).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's credit summary", async () => {
    vi.mocked(getImageGenerationCredits).mockResolvedValueOnce({
      credits: {
        available: 5,
        costPerImage: 1,
      },
      usage: {
        dayUtc: "2026-11-07",
        attempts: 2,
        dailyLimit: 10,
        active: 1,
        maxActive: 2,
      },
    });

    const response = await authorizedGet(`${endpoint}/credits`);

    expect(response.status).toBe(200);

    expect(response.body.credits).toEqual({
      available: 5,
      costPerImage: 1,
    });

    expect(getImageGenerationCredits).toHaveBeenCalledOnce();
  });

  it("returns a safe image status DTO", async () => {
    vi.mocked(getImageGenerationStatus).mockResolvedValueOnce({
      assetId,
      status: "ready",
      state: "ready",
      createdAt: new Date("2026-11-07T00:00:00Z"),
      updatedAt: new Date("2026-11-07T00:01:00Z"),
      image: {
        width: 1024,
        height: 1024,
        mimeType: "image/png",
      },
    });

    const response = await authorizedGet(`${endpoint}/${assetId}`);

    expect(response.status).toBe(200);

    expect(response.body.assetId).toBe(assetId);
    expect(response.body.state).toBe("ready");

    expect(response.body).not.toHaveProperty("claimToken");

    expect(response.body).not.toHaveProperty("storageKey");
  });

  it("maps insufficient credits to HTTP 402", async () => {
    vi.mocked(enqueueImageGeneration).mockRejectedValueOnce(
      Object.assign(new Error("Internal credit check"), { statusCode: 402 }),
    );

    const response = await authorizedPost().send(validBody);

    expect(response.status).toBe(402);

    expect(response.body.error).toBe("Insufficient image generation credits.");
  });

  it("maps generation quota failures to HTTP 429", async () => {
    vi.mocked(enqueueImageGeneration).mockRejectedValueOnce(
      Object.assign(new Error("Internal quota details"), { statusCode: 429 }),
    );

    const response = await authorizedPost().send(validBody);

    expect(response.status).toBe(429);

    expect(response.body).not.toHaveProperty("details");
  });

  it("does not expose credit information without authentication", async () => {
    const response = await request(app).get(`${endpoint}/credits`);

    expect(response.status).toBe(401);

    expect(getImageGenerationCredits).not.toHaveBeenCalled();
  });

  it("does not expose generation status without authentication", async () => {
    const response = await request(app).get(`${endpoint}/${assetId}`);

    expect(response.status).toBe(401);

    expect(getImageGenerationStatus).not.toHaveBeenCalled();
  });

  it("requires authentication for private image URLs", async () => {
    const response = await request(app).get(`${endpoint}/${assetId}/url`);

    expect(response.status).toBe(401);

    expect(createPrivateImageAccessUrl).not.toHaveBeenCalled();
  });

  it("returns a short-lived signed URL without caching", async () => {
    vi.mocked(createPrivateImageAccessUrl).mockResolvedValueOnce({
      assetId,
      url: "https://example.test/private-signed-image",
      expiresIn: 60,
    });

    const response = await authorizedGet(`${endpoint}/${assetId}/url`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      assetId,
      url: "https://example.test/private-signed-image",
      expiresIn: 60,
    });

    expect(response.headers["cache-control"]).toBe("no-store");

    expect(response.headers["referrer-policy"]).toBe("no-referrer");

    expect(response.body).not.toHaveProperty("storageKey");

    expect(response.body).not.toHaveProperty("claimToken");
  });

  it("does not expose storage signing errors", async () => {
    vi.mocked(createPrivateImageAccessUrl).mockRejectedValueOnce(
      Object.assign(new Error("Internal storage signing secret"), {
        statusCode: 503,
      }),
    );

    const response = await authorizedGet(`${endpoint}/${assetId}/url`);

    expect(response.status).toBe(503);

    expect(JSON.stringify(response.body)).not.toContain(
      "Internal storage signing secret",
    );
  });
});
