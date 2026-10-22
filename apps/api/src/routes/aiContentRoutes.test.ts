import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { app } from "../app.js";
import { supabaseAuthClient } from "../auth/supabase.js";
import * as aiContentService from "../services/aiContentService.js";

const validInput = {
  brief: "Promote our new eco-friendly reusable water bottle.",
  platform: "instagram",
  tone: "friendly",
  audience: "Environmentally conscious young adults",
  callToAction: "Shop the collection",
  length: "medium",
};

function mockAuthenticatedUser() {
  vi.spyOn(supabaseAuthClient.auth, "getUser").mockResolvedValue({
    data: {
      user: {
        id: "test-supabase-user-id",
        email: "test@example.com",
      },
    },
    error: null,
  } as Awaited<ReturnType<typeof supabaseAuthClient.auth.getUser>>);
}

describe("POST /api/ai/generate-caption", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects requests without authentication", async () => {
    const response = await request(app)
      .post("/api/ai/generate-caption")
      .send(validInput);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Unauthorized");
  });

  it("rejects invalid input without calling the AI service", async () => {
    mockAuthenticatedUser();

    const generateSpy = vi.spyOn(aiContentService, "generateCaption");

    const response = await request(app)
      .post("/api/ai/generate-caption")
      .set("Authorization", "Bearer valid-test-token")
      .send({
        ...validInput,
        brief: " ",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("returns a generated caption for valid input", async () => {
    mockAuthenticatedUser();

    const caption = "Make every refill count. Meet your new reusable bottle.";

    const generateSpy = vi
      .spyOn(aiContentService, "generateCaption")
      .mockResolvedValue(caption);

    const response = await request(app)
      .post("/api/ai/generate-caption")
      .set("Authorization", "Bearer valid-test-token")
      .send(validInput);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ caption });
    expect(generateSpy).toHaveBeenCalledWith(validInput);
  });

  it("returns a safe error when AI configuration is missing", async () => {
    mockAuthenticatedUser();

    vi.spyOn(aiContentService, "generateCaption").mockRejectedValue(
      new aiContentService.AIContentServiceError(
        "AI generation is not configured.",
        503,
      ),
    );

    const response = await request(app)
      .post("/api/ai/generate-caption")
      .set("Authorization", "Bearer valid-test-token")
      .send(validInput);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Caption generation failed",
      message: "AI generation is not configured.",
    });
  });

  it("returns a safe error when the AI provider is unavailable", async () => {
    mockAuthenticatedUser();

    vi.spyOn(aiContentService, "generateCaption").mockRejectedValue(
      new aiContentService.AIContentServiceError(
        "The AI provider could not be reached. Please try again.",
        502,
      ),
    );

    const response = await request(app)
      .post("/api/ai/generate-caption")
      .set("Authorization", "Bearer valid-test-token")
      .send(validInput);

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("Caption generation failed");
    expect(response.body.message).toBe(
      "The AI provider could not be reached. Please try again.",
    );
  });
});
