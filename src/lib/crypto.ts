// Encryption library for sensitive data at rest (OAuth tokens, client secrets).
// Uses AES-256-GCM (authenticated encryption) with a key derived from the
// ENCRYPTION_KEY environment variable.
//
// The key is derived via PBKDF2 with 100,000 iterations and a fixed salt.
// This means changing ENCRYPTION_KEY requires re-encrypting all existing
// data (the app handles this automatically on first decrypt failure —
// see the migration logic in youtube.ts).
//
// If ENCRYPTION_KEY is not set, a warning is logged and a derived key
// from JWT_SECRET is used as fallback. This is NOT as secure as a
// dedicated ENCRYPTION_KEY but is better than plaintext.

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits
const SALT = "zephyrstream-static-salt-v1"; // Fixed salt (key rotation is handled at app level)

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "zephyrstream-dev-fallback";

  if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
    console.warn(
      "⚠️  WARNING: ENCRYPTION_KEY is not set. Using JWT_SECRET as fallback.\n" +
      "   For better security, set a dedicated ENCRYPTION_KEY in your .env file:\n" +
      '   echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env\n' +
      "   Note: changing ENCRYPTION_KEY requires re-authorizing all channels."
    );
  }

  cachedKey = crypto.pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LENGTH, "sha256");
  return cachedKey;
}

/**
 * Encrypt a plaintext string. Returns a base64 string containing the
 * IV + auth tag + ciphertext, prefixed with "enc:" so we can detect
 * encrypted vs plaintext values.
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Format: enc:<iv_base64>:<authTag_base64>:<ciphertext_base64>
    return `enc:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
  } catch (err: any) {
    console.error("[Encryption] Failed to encrypt:", err.message);
    // Fallback: return plaintext (better than crashing the app)
    return plaintext;
  }
}

/**
 * Decrypt an encrypted string. Returns the plaintext.
 * If the value is NOT prefixed with "enc:", it's treated as plaintext
 * (backward compatibility with pre-encryption data).
 */
export function decrypt(ciphertext: string): string {
  // Not encrypted (plaintext from old DB rows) — return as-is
  if (!ciphertext || !ciphertext.startsWith("enc:")) {
    return ciphertext;
  }

  try {
    const key = getEncryptionKey();
    const parts = ciphertext.split(":");
    if (parts.length !== 4) {
      // Malformed encrypted value — return as-is (might be plaintext)
      return ciphertext;
    }

    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const encrypted = parts[3];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err: any) {
    // Decryption failed — could be key change. Return empty string
    // so the caller knows the token is invalid and needs re-auth.
    console.warn("[Encryption] Failed to decrypt (key changed or corrupted):", err.message);
    return "";
  }
}

/**
 * Check if a value is encrypted (starts with "enc:").
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith("enc:");
}
