import { describe, expect, it } from "vitest";
import { dedupeRecipients, isValidEmail, normalizeEmail } from "../src/utils/recipients";

describe("recipients", () => {
  it("normalises and de-duplicates addresses case-insensitively", () => {
    const result = dedupeRecipients([
      { email: "  Alice@Example.com ", name: "Alice" },
      { email: "alice@example.com", name: "Duplicate" },
      { email: "BOB@example.com" }
    ]);

    expect(result).toEqual([
      { email: "alice@example.com", name: "Alice" },
      { email: "bob@example.com", name: undefined }
    ]);
  });

  it("drops invalid addresses", () => {
    const result = dedupeRecipients([
      { email: "not-an-email" },
      { email: "valid@example.com" },
      { email: "missing@domain" }
    ]);
    expect(result).toHaveLength(1);
  });

  it("validates email shape", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("person@localhost")).toBe(false);
    expect(normalizeEmail("A@B.CO")).toBe("a@b.co");
  });
});
