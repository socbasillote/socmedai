import type { RequestHandler } from "express";

import { supabaseAuthClient } from "./supabase.js";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  const accessToken = match?.[1];

  if (!accessToken) {
    res.status(401).json({
      error: "Unauthorized",
      message: "A valid Bearer access token is required.",
    });
    return;
  }

  try {
    const {
      data: { user },
      error,
    } = await supabaseAuthClient.auth.getUser(accessToken);

    if (error || !user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "The access token is invalid or expired.",
      });
      return;
    }

    res.locals.authUser = {
      id: user.id,
      email: user.email ?? null,
    };

    next();
  } catch (error) {
    console.error("Supabase token verification failed:", error);

    res.status(503).json({
      error: "Authentication service unavailable",
    });
  }
};
