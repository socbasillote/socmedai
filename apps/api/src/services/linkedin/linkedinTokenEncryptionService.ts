import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = "v1";

export class LinkedInTokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInTokenEncryptionError";
  }
}

function getEncryptionKey(): Buffer {
  const configuredKey = env.LINKEDIN_TOKEN_ENCRYPTION_KEY;

  if (!configuredKey || !/^[a-f0-9]{64}$/i.test(configuredKey)) {
    throw new LinkedInTokenEncryptionError(
      "LinkedIn token encryption is not configured on the server.",
    );
  }

  return Buffer.from(configuredKey, "hex");
}

export function encryptLinkedInToken(token: string): string {
  if (typeof token !== "string" || token.length === 0) {
    throw new LinkedInTokenEncryptionError("A non-empty token is required.");
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptLinkedInToken(encryptedToken: string): string {
  if (typeof encryptedToken !== "string") {
    throw new LinkedInTokenEncryptionError("The encrypted token is invalid.");
  }

  const parts = encryptedToken.split(":");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new LinkedInTokenEncryptionError(
      "The encrypted token has an unsupported format.",
    );
  }

  const [, ivEncoded, authTagEncoded, ciphertextEncoded] = parts;

  if (!ivEncoded || !authTagEncoded || ciphertextEncoded === undefined) {
    throw new LinkedInTokenEncryptionError("The encrypted token is invalid.");
  }

  const iv = Buffer.from(ivEncoded, "base64url");
  const authTag = Buffer.from(authTagEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new LinkedInTokenEncryptionError("The encrypted token is invalid.");
  }

  try {
    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new LinkedInTokenEncryptionError(
      "Unable to decrypt the LinkedIn token. Check the encryption key and stored data.",
    );
  }
}
