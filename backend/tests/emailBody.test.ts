import { describe, expect, it } from "vitest";
import { htmlToPlainText, previewText, sanitizeCampaignBody } from "../src/utils/emailBody";

describe("email body handling", () => {
  it("removes scripts and event handlers", () => {
    const dirty = `<p onclick="alert(1)">Hello</p><script>alert("xss")</script>`;
    const clean = sanitizeCampaignBody(dirty);
    expect(clean).toContain("Hello");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
  });

  it("keeps safe formatting tags", () => {
    const clean = sanitizeCampaignBody("<p><strong>Hi</strong> <em>there</em></p>");
    expect(clean).toBe("<p><strong>Hi</strong> <em>there</em></p>");
  });

  it("adds safe rel/target to links", () => {
    const clean = sanitizeCampaignBody('<a href="https://example.com">Link</a>');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it("creates a plain-text alternative", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toContain("Hello world");
  });

  it("creates a short preview", () => {
    expect(previewText("<p>Hello world</p>", 8)).toBe("Hello w…");
  });
});
