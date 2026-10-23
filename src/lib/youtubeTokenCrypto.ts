import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const raw = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error("Missing YOUTUBE_TOKEN_ENCRYPTION_KEY");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "YOUTUBE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
    );
  }

  return key;
}

export function encryptYouTubeToken(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptYouTubeToken(payload: string): string {
  const [version, ivB64, tagB64, encryptedB64] = payload.split(".");

  if (
    version !== "v1" ||
    !ivB64 ||
    !tagB64 ||
    !encryptedB64
  ) {
    throw new Error("Invalid encrypted YouTube token");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivB64, "base64")
  );

  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
