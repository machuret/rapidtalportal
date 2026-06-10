/**
 * Application-layer encryption for stored credentials (Access section).
 *
 * Passwords are encrypted with AES-256-GCM *before* they reach Supabase, using
 * a key that lives only in the app's environment (CREDENTIALS_ENCRYPTION_KEY).
 * This means a database dump, a leaked service-role key, or a compromised
 * Supabase dashboard session alone can NOT recover any password — the
 * attacker would also need the app server's env. GCM is authenticated, so
 * tampered ciphertext fails decryption instead of returning garbage.
 *
 * Stored format: "v1.<iv b64>.<auth tag b64>.<ciphertext b64>" — versioned so
 * the scheme can be rotated later without breaking existing rows.
 *
 * Generate a key with: openssl rand -base64 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes of base64 (run `openssl rand -base64 32`).");
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try { getKey(); return true; } catch { return false; }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unrecognised ciphertext format.");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
