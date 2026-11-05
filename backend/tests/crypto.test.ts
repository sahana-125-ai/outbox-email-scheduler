import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/utils/crypto";

describe("credential encryption", () => {
  it("round-trips a password", () => {
    const encrypted = encryptSecret("super-secret-smtp-password");
    expect(encrypted).not.toContain("super-secret");
    expect(decryptSecret(encrypted)).toBe("super-secret-smtp-password");
  });

  it("uses a random IV so identical inputs differ", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("password");
    const parts = encrypted.split(".");
    parts[2] = `${parts[2].slice(0, -2)}aa`;
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
