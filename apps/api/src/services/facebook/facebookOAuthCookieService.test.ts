import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";

import { env } from "../../config/env.js";

import {
  FACEBOOK_OAUTH_COOKIE_NAME,
  FACEBOOK_OAUTH_COOKIE_MAX_AGE_MS,
  FACEBOOK_OAUTH_COOKIE_PATH,
  FacebookOAuthCookieError,
  setFacebookOAuthSessionCookie,
  clearFacebookOAuthSessionCookie,
} from "./facebookOAuthCookieService.js";

describe("Facebook OAuth Cookie Service", () => {
  const validSessionToken = "a".repeat(43);

  const originalNodeEnv = env.NODE_ENV;

  const cookieMock = vi.fn();
  const clearCookieMock = vi.fn();

  const response = {
    cookie: cookieMock,
    clearCookie: clearCookieMock,
  } as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();

    env.NODE_ENV = "development";
  });

  afterAll(() => {
    env.NODE_ENV = originalNodeEnv;
  });

  describe("Cookie configuration", () => {
    it("uses the expected cookie name", () => {
      expect(FACEBOOK_OAUTH_COOKIE_NAME).toBe("storm_fb_oauth_session");
    });

    it("restricts the cookie to Facebook API endpoints", () => {
      expect(FACEBOOK_OAUTH_COOKIE_PATH).toBe("/api/facebook");
    });

    it("uses a 10-minute expiration", () => {
      expect(FACEBOOK_OAUTH_COOKIE_MAX_AGE_MS).toBe(600_000);
    });
  });

  describe("Setting the OAuth session cookie", () => {
    it("sets a valid session cookie", () => {
      setFacebookOAuthSessionCookie(response, validSessionToken);

      expect(cookieMock).toHaveBeenCalledTimes(1);

      expect(cookieMock).toHaveBeenCalledWith(
        FACEBOOK_OAUTH_COOKIE_NAME,
        validSessionToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: FACEBOOK_OAUTH_COOKIE_PATH,
          maxAge: FACEBOOK_OAUTH_COOKIE_MAX_AGE_MS,
        }),
      );
    });

    it("uses Secure cookies in production", () => {
      env.NODE_ENV = "production";

      setFacebookOAuthSessionCookie(response, validSessionToken);

      expect(cookieMock).toHaveBeenCalledWith(
        FACEBOOK_OAUTH_COOKIE_NAME,
        validSessionToken,
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        }),
      );
    });

    it("does not enable Secure cookies in development", () => {
      env.NODE_ENV = "development";

      setFacebookOAuthSessionCookie(response, validSessionToken);

      expect(cookieMock).toHaveBeenCalledWith(
        FACEBOOK_OAUTH_COOKIE_NAME,
        validSessionToken,
        expect.objectContaining({
          secure: false,
        }),
      );
    });

    it("does not set a cookie for an empty token", () => {
      expect(() => setFacebookOAuthSessionCookie(response, "")).toThrow(
        FacebookOAuthCookieError,
      );

      expect(cookieMock).not.toHaveBeenCalled();
    });

    it("rejects tokens shorter than 43 characters", () => {
      expect(() =>
        setFacebookOAuthSessionCookie(response, "a".repeat(42)),
      ).toThrow(FacebookOAuthCookieError);

      expect(cookieMock).not.toHaveBeenCalled();
    });

    it("rejects tokens longer than 43 characters", () => {
      expect(() =>
        setFacebookOAuthSessionCookie(response, "a".repeat(44)),
      ).toThrow(FacebookOAuthCookieError);

      expect(cookieMock).not.toHaveBeenCalled();
    });

    it("rejects tokens containing invalid characters", () => {
      expect(() =>
        setFacebookOAuthSessionCookie(response, "a".repeat(42) + "="),
      ).toThrow(FacebookOAuthCookieError);

      expect(cookieMock).not.toHaveBeenCalled();
    });

    it("accepts URL-safe Base64 characters", () => {
      const token = "a".repeat(41) + "_-";

      setFacebookOAuthSessionCookie(response, token);

      expect(cookieMock).toHaveBeenCalledTimes(1);
    });

    it("does not expose the token in an error message", () => {
      const invalidToken = "sensitive-invalid-token";

      expect(() =>
        setFacebookOAuthSessionCookie(response, invalidToken),
      ).toThrow("Invalid Facebook OAuth session token.");

      expect(cookieMock).not.toHaveBeenCalled();
    });
  });

  describe("Clearing the OAuth session cookie", () => {
    it("clears the expected cookie", () => {
      clearFacebookOAuthSessionCookie(response);

      expect(clearCookieMock).toHaveBeenCalledTimes(1);

      expect(clearCookieMock).toHaveBeenCalledWith(
        FACEBOOK_OAUTH_COOKIE_NAME,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: FACEBOOK_OAUTH_COOKIE_PATH,
        }),
      );
    });

    it("uses matching cookie attributes when clearing", () => {
      setFacebookOAuthSessionCookie(response, validSessionToken);

      clearFacebookOAuthSessionCookie(response);

      const setOptions = cookieMock.mock.calls[0]?.[2];
      const clearOptions = clearCookieMock.mock.calls[0]?.[1];

      expect(clearOptions).toEqual({
        httpOnly: setOptions.httpOnly,
        secure: setOptions.secure,
        sameSite: setOptions.sameSite,
        path: setOptions.path,
      });
    });

    it("clears Secure cookies correctly in production", () => {
      env.NODE_ENV = "production";

      clearFacebookOAuthSessionCookie(response);

      expect(clearCookieMock).toHaveBeenCalledWith(
        FACEBOOK_OAUTH_COOKIE_NAME,
        expect.objectContaining({
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          path: FACEBOOK_OAUTH_COOKIE_PATH,
        }),
      );
    });

    it("does not require a session token to clear the cookie", () => {
      expect(() => clearFacebookOAuthSessionCookie(response)).not.toThrow();

      expect(clearCookieMock).toHaveBeenCalledTimes(1);
    });
  });
});
