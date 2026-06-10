/**
 * @jest-environment node
 *
 * Encryption tests for the Access section's stored passwords. These assert the
 * three properties the whole feature's security rests on:
 *   1. round-trip: what we encrypt is exactly what we decrypt;
 *   2. confidentiality: ciphertext never contains the plaintext, and is unique
 *      per call (random IV) so identical passwords aren't detectably identical;
 *   3. integrity: tampered ciphertext fails loudly (GCM auth tag) rather than
 *      returning garbage, and a wrong key cannot decrypt.
 */

// A valid 32-byte base64 key, set before the module is imported.
const TEST_KEY = "QoULuh0atEzu2Mj27fOelKZdPt3XTQZjCznbgNFGNfA=";
process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;

import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/crypto/credentials";

describe("credential encryption", () => {
  test("reports configured when a valid key is present", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  test("round-trips a password unchanged", () => {
    const secret = "S3cr3t!-with-symbols-£€-and-emoji-🔐";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  test("ciphertext does not contain the plaintext", () => {
    const secret = "hunter2";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(enc.startsWith("v1.")).toBe(true);
  });

  test("encrypting the same value twice yields different ciphertext (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  test("tampered ciphertext fails to decrypt", () => {
    const enc = encryptSecret("important");
    const parts = enc.split(".");
    // Flip a character in the ciphertext segment.
    const data = parts[3];
    parts[3] = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  test("a different key cannot decrypt", () => {
    const enc = encryptSecret("topsecret");
    const original = process.env.CREDENTIALS_ENCRYPTION_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY = "alqB2x/zurftZ24CgDgl2WOv2Vgxne8S1xuqmzVNxww=";
    expect(() => decryptSecret(enc)).toThrow();
    process.env.CREDENTIALS_ENCRYPTION_KEY = original;
  });

  test("rejects a malformed key", () => {
    const original = process.env.CREDENTIALS_ENCRYPTION_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY = "too-short";
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow();
    process.env.CREDENTIALS_ENCRYPTION_KEY = original;
  });
});
