import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";

const ALLOWED_TAGS = [
  "a", "b", "strong", "i", "em", "u", "s", "p", "br", "div", "span",
  "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "td", "th", "hr", "pre", "code", "img"
];

/** Sanitises user-authored HTML before it is persisted and emailed. */
export function sanitizeCampaignBody(body: string): string {
  return sanitizeHtml(body, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "width", "height"],
      "*": ["style", "class", "align"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
    }
  }).trim();
}

export function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: 100,
    selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }]
  }).trim();
}

/** A tiny preview string used in the dashboard list view. */
export function previewText(html: string, maxLength = 140): string {
  const text = htmlToPlainText(html).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
