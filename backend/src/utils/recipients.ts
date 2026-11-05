const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export interface RecipientInput {
  email: string;
  name?: string;
}

/**
 * Normalises, validates and de-duplicates recipients while preserving order.
 * Throws on any invalid address so a campaign can never be half-valid.
 */
export function dedupeRecipients(recipients: RecipientInput[]): RecipientInput[] {
  const seen = new Set<string>();
  const result: RecipientInput[] = [];

  for (const recipient of recipients) {
    const email = normalizeEmail(recipient.email);
    if (!isValidEmail(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    result.push({
      email,
      name: recipient.name?.trim() || undefined
    });
  }

  return result;
}
