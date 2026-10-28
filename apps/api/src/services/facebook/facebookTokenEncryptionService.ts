import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../../config/env.js";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = "v1";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class FacebookTokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookTokenEncryptionError";
  }
}

function getEncryptionKey(): Buffer {
  const configuredKey = env.FACEBOOK_TOKEN_ENCRYPTION_KEY;

  if (!configuredKey) {
    throw new FacebookTokenEncryptionError(
      "Facebook token encryption is not configured on the server.",
    );
  }

  if (!/^[a-f0-9]{64}$/i.test(configuredKey)) {
    throw new FacebookTokenEncryptionError(
      "Facebook token encryption key is invalid.",
    );
  }

  return Buffer.from(configuredKey, "hex");
}

export function encryptFacebookToken(plaintextToken: string): string {
  if (typeof plaintextToken !== "string" || !plaintextToken.trim()) {
    throw new FacebookTokenEncryptionError(
      "A Facebook access token is required.",
    );
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintextToken, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptFacebookToken(encryptedToken: string): string {
  if (typeof encryptedToken !== "string" || !encryptedToken.trim()) {
    throw new FacebookTokenEncryptionError(
      "An encrypted Facebook access token is required.",
    );
  }

  const parts = encryptedToken.split(":");

  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    throw new FacebookTokenEncryptionError(
      "Encrypted Facebook token format is invalid.",
    );
  }

  const [, encodedIv, encodedAuthTag, encodedCiphertext] = parts;

  if (!encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new FacebookTokenEncryptionError(
      "Encrypted Facebook token format is invalid.",
    );
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const authTag = Buffer.from(encodedAuthTag, "base64url");
  const ciphertext = Buffer.from(encodedCiphertext, "base64url");

  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH ||
    ciphertext.length === 0
  ) {
    throw new FacebookTokenEncryptionError(
      "Encrypted Facebook token format is invalid.",
    );
  }

  const key = getEncryptionKey();

  try {
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    throw new FacebookTokenEncryptionError(
      "Unable to decrypt Facebook access token.",
    );
  }
}
