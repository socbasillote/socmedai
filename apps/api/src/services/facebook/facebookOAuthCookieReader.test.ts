import { describe, expect, it } from "vitest";
import type { Request } from "express";

import { FACEBOOK_OAUTH_COOKIE_NAME } from "./facebookOAuthCookieService.js";

import {
  FacebookOAuthCookieReaderError,
  readFacebookOAuthSessionCookie,
} from "./facebookOAuthCookieReader.js";

describe("Facebook OAuth Cookie Reader", () => {
  const validSessionToken = "a".repeat(43);
  const secondSessionToken = "b".repeat(43);

  function createRequest(cookieHeader?: string): Request {
    return {
      headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
    } as Request;
  }

  describe("Valid cookies", () => {
    it("reads a valid Facebook OAuth session cookie", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}`,
      );

      expect(readFacebookOAuthSessionCookie(req)).toBe(validSessionToken);
    });

    it("ignores unrelated cookies", () => {
      const req = createRequest(
        `theme=dark; ${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}; language=en`,
      );

      expect(readFacebookOAuthSessionCookie(req)).toBe(validSessionToken);
    });

    it("handles whitespace around cookie separators", () => {
      const req = createRequest(
        `theme=dark;  ${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}  `,
      );

      expect(readFacebookOAuthSessionCookie(req)).toBe(validSessionToken);
    });

    it("accepts URL-safe Base64 characters", () => {
      const token = "a".repeat(41) + "_-";

      const req = createRequest(`${FACEBOOK_OAUTH_COOKIE_NAME}=${token}`);

      expect(readFacebookOAuthSessionCookie(req)).toBe(token);
    });

    it("ignores malformed unrelated cookies", () => {
      const req = createRequest(
        `malformed; theme=dark; ${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}`,
      );

      expect(readFacebookOAuthSessionCookie(req)).toBe(validSessionToken);
    });
  });

  describe("Missing cookies", () => {
    it("rejects requests without a Cookie header", () => {
      const req = createRequest();

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });

    it("returns HTTP 401 for missing cookies", () => {
      const req = createRequest();

      try {
        readFacebookOAuthSessionCookie(req);
        expect.fail("Expected cookie reader to throw.");
      } catch (error) {
        expect(error).toMatchObject({
          name: "FacebookOAuthCookieReaderError",
          statusCode: 401,
        });
      }
    });

    it("rejects requests containing only unrelated cookies", () => {
      const req = createRequest("theme=dark; language=en");

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        "Facebook authorization session is missing.",
      );
    });

    it("rejects an empty Cookie header", () => {
      const req = createRequest("");

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });
  });

  describe("Malformed session tokens", () => {
    it("rejects an empty session token", () => {
      const req = createRequest(`${FACEBOOK_OAUTH_COOKIE_NAME}=`);

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        "Invalid Facebook authorization session.",
      );
    });

    it("rejects tokens shorter than 43 characters", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${"a".repeat(42)}`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });

    it("rejects tokens longer than 43 characters", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${"a".repeat(44)}`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });

    it("rejects invalid Base64URL characters", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${"a".repeat(42)}=`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });

    it("rejects session tokens containing spaces", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${"a".repeat(20)} ${"b".repeat(22)}`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });

    it("rejects session tokens containing unexpected punctuation", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${"a".repeat(42)}!`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });
  });

  describe("Duplicate cookies", () => {
    it("rejects two Facebook OAuth session cookies", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}; ${FACEBOOK_OAUTH_COOKIE_NAME}=${secondSessionToken}`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        "Invalid Facebook authorization session.",
      );
    });

    it("rejects duplicate cookies even when values match", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}; ${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });

    it("returns HTTP 401 for duplicate session cookies", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${validSessionToken}; ${FACEBOOK_OAUTH_COOKIE_NAME}=${secondSessionToken}`,
      );

      try {
        readFacebookOAuthSessionCookie(req);
        expect.fail("Expected duplicate cookies to be rejected.");
      } catch (error) {
        expect(error).toMatchObject({
          name: "FacebookOAuthCookieReaderError",
          statusCode: 401,
        });
      }
    });
  });

  describe("Security", () => {
    it("does not expose invalid tokens in error messages", () => {
      const sensitiveToken = "sensitive-invalid-session-token";

      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}=${sensitiveToken}`,
      );

      try {
        readFacebookOAuthSessionCookie(req);
        expect.fail("Expected invalid token to be rejected.");
      } catch (error) {
        expect(error).toBeInstanceOf(FacebookOAuthCookieReaderError);

        expect((error as Error).message).not.toContain(sensitiveToken);
      }
    });

    it("does not accept a similarly named cookie", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}_backup=${validSessionToken}`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        "Facebook authorization session is missing.",
      );
    });

    it("rejects quoted session token values", () => {
      const req = createRequest(
        `${FACEBOOK_OAUTH_COOKIE_NAME}="${validSessionToken}"`,
      );

      expect(() => readFacebookOAuthSessionCookie(req)).toThrow(
        FacebookOAuthCookieReaderError,
      );
    });
  });
});
