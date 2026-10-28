import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    FACEBOOK_TOKEN_ENCRYPTION_KEY: "a".repeat(64) as string | undefined,
  },
}));

vi.mock("../../config/env.js", () => ({
  env: mockEnv,
}));

import {
  encryptFacebookToken,
  decryptFacebookToken,
  FacebookTokenEncryptionError,
} from "./facebookTokenEncryptionService.js";

const TEST_TOKEN = "EAAB-test-facebook-page-access-token";

const FIRST_KEY = "a".repeat(64);
const SECOND_KEY = "b".repeat(64);

describe("Facebook token encryption service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.FACEBOOK_TOKEN_ENCRYPTION_KEY = FIRST_KEY;
  });

  it("encrypts and decrypts a Facebook access token", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    expect(encrypted).not.toBe(TEST_TOKEN);

    const decrypted = decryptFacebookToken(encrypted);

    expect(decrypted).toBe(TEST_TOKEN);
  });

  it("uses the expected encrypted token format", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    const parts = encrypted.split(":");

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");

    const [, encodedIv, encodedTag, encodedCiphertext] = parts;

    expect(encodedIv).toBeTruthy();
    expect(encodedTag).toBeTruthy();
    expect(encodedCiphertext).toBeTruthy();

    expect(Buffer.from(encodedIv!, "base64url")).toHaveLength(12);

    expect(Buffer.from(encodedTag!, "base64url")).toHaveLength(16);
  });

  it("generates different ciphertext for the same token", () => {
    const first = encryptFacebookToken(TEST_TOKEN);
    const second = encryptFacebookToken(TEST_TOKEN);

    expect(first).not.toBe(second);

    expect(decryptFacebookToken(first)).toBe(TEST_TOKEN);
    expect(decryptFacebookToken(second)).toBe(TEST_TOKEN);
  });

  it("rejects an empty plaintext token", () => {
    expect(() => encryptFacebookToken(" ")).toThrow(
      FacebookTokenEncryptionError,
    );
  });

  it("rejects an empty encrypted token", () => {
    expect(() => decryptFacebookToken(" ")).toThrow(
      FacebookTokenEncryptionError,
    );
  });

  it("rejects encryption when the key is missing", () => {
    mockEnv.FACEBOOK_TOKEN_ENCRYPTION_KEY = undefined;

    expect(() => encryptFacebookToken(TEST_TOKEN)).toThrow(
      "Facebook token encryption is not configured on the server.",
    );
  });

  it("rejects decryption when the key is missing", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    mockEnv.FACEBOOK_TOKEN_ENCRYPTION_KEY = undefined;

    expect(() => decryptFacebookToken(encrypted)).toThrow(
      "Facebook token encryption is not configured on the server.",
    );
  });

  it("rejects an invalid encryption key", () => {
    mockEnv.FACEBOOK_TOKEN_ENCRYPTION_KEY = "invalid-key";

    expect(() => encryptFacebookToken(TEST_TOKEN)).toThrow(
      "Facebook token encryption key is invalid.",
    );
  });

  it("rejects an unsupported encryption version", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    const invalid = encrypted.replace(/^v1:/, "v2:");

    expect(() => decryptFacebookToken(invalid)).toThrow(
      "Encrypted Facebook token format is invalid.",
    );
  });

  it("rejects malformed encrypted tokens", () => {
    const malformedTokens = [
      "invalid",
      "v1",
      "v1:abc",
      "v1:abc:def",
      "v1:abc:def:ghi:extra",
      "v1:::",
    ];

    for (const token of malformedTokens) {
      expect(() => decryptFacebookToken(token)).toThrow(
        FacebookTokenEncryptionError,
      );
    }
  });

  it("rejects an invalid IV length", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    const parts = encrypted.split(":");

    parts[1] = Buffer.from("short").toString("base64url");

    expect(() => decryptFacebookToken(parts.join(":"))).toThrow(
      "Encrypted Facebook token format is invalid.",
    );
  });

  it("rejects an invalid authentication tag length", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    const parts = encrypted.split(":");

    parts[2] = Buffer.from("short").toString("base64url");

    expect(() => decryptFacebookToken(parts.join(":"))).toThrow(
      "Encrypted Facebook token format is invalid.",
    );
  });

  it("detects ciphertext tampering", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    const parts = encrypted.split(":");

    const ciphertext = Buffer.from(parts[3]!, "base64url");

    ciphertext[0] ^= 0xff;

    parts[3] = ciphertext.toString("base64url");

    expect(() => decryptFacebookToken(parts.join(":"))).toThrow(
      "Unable to decrypt Facebook access token.",
    );
  });

  it("detects authentication tag tampering", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    const parts = encrypted.split(":");

    const authTag = Buffer.from(parts[2]!, "base64url");

    authTag[0] ^= 0xff;

    parts[2] = authTag.toString("base64url");

    expect(() => decryptFacebookToken(parts.join(":"))).toThrow(
      "Unable to decrypt Facebook access token.",
    );
  });

  it("rejects decryption with a different encryption key", () => {
    const encrypted = encryptFacebookToken(TEST_TOKEN);

    mockEnv.FACEBOOK_TOKEN_ENCRYPTION_KEY = SECOND_KEY;

    expect(() => decryptFacebookToken(encrypted)).toThrow(
      "Unable to decrypt Facebook access token.",
    );
  });

  it("supports different Facebook token values", () => {
    const tokens = [
      "short-token",
      "long-lived-facebook-page-token",
      "EAAB1234567890",
      "token-with-special-characters_+-/=",
    ];

    for (const token of tokens) {
      const encrypted = encryptFacebookToken(token);

      expect(decryptFacebookToken(encrypted)).toBe(token);
    }
  });
});
