import mongoose from "mongoose";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env.js";
import { timeStamp } from "console";

export const app = express();

// Security headers.
app.use(helmet());

//Allow requests from the configured frontend origin.
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  }),
);

// Parse JSON request bodies with a size limit.
app.use(express.json({ limit: "1mb" }));

// Limit repeated requests to API endpoints.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

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
// Handle unknown routes.
app.use((_req: Request, res: Response) => {
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
