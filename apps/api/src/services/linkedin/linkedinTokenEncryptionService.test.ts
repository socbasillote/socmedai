import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    LINKEDIN_TOKEN_ENCRYPTION_KEY: "",
  },
}));

vi.mock("../../config/env.js", () => ({
  env: envMock,
}));

import {
  decryptLinkedInToken,
  encryptLinkedInToken,
  LinkedInTokenEncryptionError,
} from "./linkedinTokenEncryptionService.js";

const TEST_KEY = "a".repeat(64);

describe("LinkedIn token encryption service", () => {
  beforeEach(() => {
    envMock.LINKEDIN_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts and decrypts a token successfully", () => {
    const token = "sample-linkedin-access-token";

    const encrypted = encryptLinkedInToken(token);

    expect(encrypted).not.toContain(token);
    expect(decryptLinkedInToken(encrypted)).toBe(token);
  });

  it("uses different ciphertext for the same token", () => {
    const token = "sample-linkedin-access-token";

    const first = encryptLinkedInToken(token);
    const second = encryptLinkedInToken(token);

    expect(first).not.toBe(second);
    expect(decryptLinkedInToken(first)).toBe(token);
    expect(decryptLinkedInToken(second)).toBe(token);
  });

  it("rejects an empty token", () => {
    expect(() => encryptLinkedInToken("")).toThrow(
      LinkedInTokenEncryptionError,
    );
  });

  it("rejects an unsupported encrypted-token format", () => {
    expect(() => decryptLinkedInToken("unsupported-format")).toThrow(
      LinkedInTokenEncryptionError,
    );
  });

  it("rejects a tampered authentication tag", () => {
    const encrypted = encryptLinkedInToken("sample-token");
    const parts = encrypted.split(":");

    parts[2] = Buffer.alloc(16, 1).toString("base64url");

    expect(() => decryptLinkedInToken(parts.join(":"))).toThrow(
      LinkedInTokenEncryptionError,
    );
  });

  it("rejects a missing encryption key", () => {
    envMock.LINKEDIN_TOKEN_ENCRYPTION_KEY = "";

    expect(() => encryptLinkedInToken("sample-token")).toThrow(
      LinkedInTokenEncryptionError,
    );
  });
});
