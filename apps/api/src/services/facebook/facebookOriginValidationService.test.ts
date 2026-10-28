import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Request } from "express";

import { env } from "../../config/env.js";

import {
  FacebookOriginValidationError,
  validateFacebookRequestOrigin,
} from "./facebookOriginValidationService.js";

describe("Facebook Request Origin Validation", () => {
  const originalWebOrigin = env.WEB_ORIGIN;

  function createRequest(origin?: string): Request {
    return {
      headers:
        origin === undefined
          ? {}
          : {
              origin,
            },
    } as Request;
  }

  beforeEach(() => {
    env.WEB_ORIGIN = "http://localhost:5173";
  });

  afterAll(() => {
    env.WEB_ORIGIN = originalWebOrigin;
  });

  describe("Allowed origins", () => {
    it("accepts the exact configured frontend origin", () => {
      const req = createRequest("http://localhost:5173");

      expect(() => validateFacebookRequestOrigin(req)).not.toThrow();
    });

    it("accepts an exact HTTPS origin", () => {
      env.WEB_ORIGIN = "https://storm.example.com";

      const req = createRequest("https://storm.example.com");

      expect(() => validateFacebookRequestOrigin(req)).not.toThrow();
    });

    it("rejects a noncanonical HTTPS origin with an explicit default port", () => {
      env.WEB_ORIGIN = "https://storm.example.com";

      const req = createRequest("https://storm.example.com:443");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Invalid request origin.",
      );
    });

    it("rejects a noncanonical HTTP origin with an explicit default port", () => {
      env.WEB_ORIGIN = "http://localhost";

      const req = createRequest("http://localhost:80");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Invalid request origin.",
      );
    });
  });

  describe("Unauthorized origins", () => {
    it("rejects a different localhost port", () => {
      const req = createRequest("http://localhost:5174");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Request origin is not allowed.",
      );
    });

    it("rejects a different hostname", () => {
      const req = createRequest("http://127.0.0.1:5173");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects attacker-controlled subdomains", () => {
      const req = createRequest("http://localhost:5173.evil.example");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects an unrelated HTTPS origin", () => {
      const req = createRequest("https://evil.example");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Request origin is not allowed.",
      );
    });

    it("rejects HTTP when HTTPS is configured", () => {
      env.WEB_ORIGIN = "https://storm.example.com";

      const req = createRequest("http://storm.example.com");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects HTTPS when HTTP is configured", () => {
      const req = createRequest("https://localhost:5173");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });
  });

  describe("Missing and malformed origins", () => {
    it("rejects requests without an Origin header", () => {
      const req = createRequest();

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Request origin is required.",
      );
    });

    it("rejects an empty Origin header", () => {
      const req = createRequest("");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects whitespace-only origins", () => {
      const req = createRequest("   ");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects a null origin", () => {
      const req = createRequest("null");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects malformed URLs", () => {
      const req = createRequest("not-a-valid-origin");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });

    it("rejects an Origin containing a path", () => {
      const req = createRequest("http://localhost:5173/dashboard");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Invalid request origin.",
      );
    });

    it("rejects an Origin containing a query string", () => {
      const req = createRequest("http://localhost:5173?source=evil");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Invalid request origin.",
      );
    });

    it("rejects an Origin containing a fragment", () => {
      const req = createRequest("http://localhost:5173#fragment");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Invalid request origin.",
      );
    });

    it("rejects an Origin containing credentials", () => {
      const req = createRequest("http://username:password@localhost:5173");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        "Invalid request origin.",
      );
    });

    it("rejects whitespace surrounding an otherwise valid origin", () => {
      const req = createRequest(" http://localhost:5173 ");

      expect(() => validateFacebookRequestOrigin(req)).toThrow(
        FacebookOriginValidationError,
      );
    });
  });

  describe("HTTP error handling", () => {
    it("returns HTTP 403 for missing origins", () => {
      const req = createRequest();

      try {
        validateFacebookRequestOrigin(req);

        expect.fail("Expected origin validation to fail.");
      } catch (error) {
        expect(error).toMatchObject({
          name: "FacebookOriginValidationError",
          statusCode: 403,
        });
      }
    });

    it("returns HTTP 403 for unauthorized origins", () => {
      const req = createRequest("https://evil.example");

      try {
        validateFacebookRequestOrigin(req);

        expect.fail("Expected origin validation to fail.");
      } catch (error) {
        expect(error).toMatchObject({
          name: "FacebookOriginValidationError",
          statusCode: 403,
        });
      }
    });

    it("does not expose sensitive information in error messages", () => {
      const req = createRequest(
        "https://attacker.example/private?token=secret",
      );

      try {
        validateFacebookRequestOrigin(req);

        expect.fail("Expected origin validation to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(FacebookOriginValidationError);

        const message = (error as Error).message;

        expect(message).not.toContain("secret");
        expect(message).not.toContain("attacker.example");
      }
    });
  });
});
