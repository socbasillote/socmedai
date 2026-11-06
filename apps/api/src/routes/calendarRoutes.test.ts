import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import request from "supertest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostServiceError } from "../services/postService.js";

import { CalendarPostServiceError } from "../services/calendarPostService.js";

const mocks = vi.hoisted(() => ({
  listCalendar: vi.fn(),
}));

vi.mock("../services/postService.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../services/postService.js")>();

  return {
    ...original,
    listWorkspaceCalendarPosts: mocks.listCalendar,
  };
});

vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== "Bearer test-token") {
      res.status(401).json({
        error: "Unauthorized",
      });
      return;
    }

    res.locals.authUser = {
      id: "test-user",
    };

    next();
  },
}));

import postRoutes from "./postRoutes.js";

const app = express();

app.use(express.json());
app.use("/api/posts", postRoutes);

const workspaceId = "507f1f77bcf86cd799439011";

const validQuery = {
  start: "2026-11-01T00:00:00.000Z",
  end: "2026-12-01T00:00:00.000Z",
};

const url = `/api/posts/workspaces/${workspaceId}/calendar`;

beforeEach(() => {
  mocks.listCalendar.mockReset();

  mocks.listCalendar.mockResolvedValue({
    posts: [],
    range: validQuery,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET workspace calendar", () => {
  it("requires authentication", async () => {
    const response = await request(app).get(url).query(validQuery);

    expect(response.status).toBe(401);

    expect(mocks.listCalendar).not.toHaveBeenCalled();
  });

  it("returns 200 for an authorized workspace", async () => {
    const response = await request(app)
      .get(url)
      .set("Authorization", "Bearer test-token")
      .query(validQuery);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      posts: [],
      range: validQuery,
    });

    expect(mocks.listCalendar).toHaveBeenCalledWith(
      { id: "test-user" },
      workspaceId,
      validQuery,
    );
  });

  it("returns 400 for missing parameters", async () => {
    const response = await request(app)
      .get(url)
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(400);

    expect(mocks.listCalendar).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid range", async () => {
    const response = await request(app)
      .get(url)
      .set("Authorization", "Bearer test-token")
      .query({
        start: validQuery.end,
        end: validQuery.start,
      });

    expect(response.status).toBe(400);

    expect(mocks.listCalendar).not.toHaveBeenCalled();
  });

  it("returns 404 for an inaccessible workspace", async () => {
    mocks.listCalendar.mockRejectedValueOnce(
      new PostServiceError("Workspace not found.", 404),
    );

    const response = await request(app)
      .get(url)
      .set("Authorization", "Bearer test-token")
      .query(validQuery);

    expect(response.status).toBe(404);

    expect(response.body.error).toBe("Workspace not found");
  });

  it("returns 422 when the result cap is exceeded", async () => {
    mocks.listCalendar.mockRejectedValueOnce(
      new CalendarPostServiceError("Calendar contains too many posts.", 422),
    );

    const response = await request(app)
      .get(url)
      .set("Authorization", "Bearer test-token")
      .query(validQuery);

    expect(response.status).toBe(422);

    expect(response.body.error).toBe("Calendar query failed");
  });
});
