import mongoose from "mongoose";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import * as helmet from "helmet";
import { rateLimit } from "express-rate-limit";

import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { requireAuth } from "./auth/requireAuth.js";

import workspaceRoutes from "./routes/workspaceRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import linkedInRoutes from "./routes/linkedinRoutes.js";
import instagramRoutes from "./routes/instagramRoutes.js";
import facebookRoutes from "./routes/facebookRoutes.js";
import aiContentRoutes from "./routes/aiContentRoutes.js";
import imageGenerationRoutes from "./routes/imageGenerationRoutes.js";

export const app = express();

if (process.env.VERCEL === "1") {
  // Vercel overwrites X-Forwarded-For with the connecting client's address.
  app.set("trust proxy", 1);
}

// Security headers.
app.use(helmet.default());

//Allow requests from the configured frontend origin.
app.use(
  cors({
    origin: new URL(env.WEB_ORIGIN).origin,
    credentials: true,
    exposedHeaders: ["Retry-After"],
  }),
);

// Parse JSON request bodies with a size limit.
app.use(express.json({ limit: "1mb" }));

// Limit repeated requests to API endpoints.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return readLimiter(req, res, next);
  }
  return apiLimiter(req, res, next);
});

if (process.env.VERCEL === "1") {
  // The serverless entry does not execute the standalone server's startup.
  app.use("/api", async (_req, res, next) => {
    try {
      await connectDatabase();
      next();
    } catch (error) {
      console.error("API database connection failed:", error);
      res.status(503).json({ error: "Database temporarily unavailable" });
    }
  });
}

// Health check: confirms the HTTP API is responding.
app.get("/api/health", (_req: Request, res: Response) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    service: "storm-api",
    database: databaseConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/linkedin", linkedInRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/instagram", instagramRoutes);

app.get("/api/me", requireAuth, (_req, res) => {
  res.status(200).json({
    user: res.locals.authUser,
  });
});

app.use("/api/workspaces", workspaceRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/ai", aiContentRoutes);
app.use("/api/ai", imageGenerationRoutes);

// Handle unknown routes.
app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// centralized error handler. Avoid exposing internal error details.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error:", error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: "Internal server error",
  });
});

// Recognized by Vercel's Express framework detection.
export default app;
