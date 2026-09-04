/* Page-number input and digit localisation for the reader. */

export const KH_DIGITS = "០១២៣៤៥៦៧៨៩";

/** Render digits in Khmer numerals when the active locale is Khmer. */
export function localizeDigits(value: number | string, locale: string): string {
  const s = String(value);
  return locale === "km" ? s.replace(/[0-9]/g, (d) => KH_DIGITS[+d]) : s;
}

/** Khmer numerals → ASCII, so a reader typing ១២៥ is understood. */
export function normalizeDigits(raw: string): string {
  return raw.replace(/[០-៩]/g, (d) => String(KH_DIGITS.indexOf(d)));
}

/**
 * Parse what a reader typed into the "Go to page" field. Accepts ASCII or
 * Khmer digits, surrounding whitespace and a stray "p." / "ទំព័រ" prefix.
 * Returns the CLAMPED page, or null when there is no usable number — the
 * caller shows a hint rather than jumping somewhere surprising.
 */
export function parsePageInput(raw: string, numPages: number): number | null {
  const digits = normalizeDigits(raw).replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  if (!numPages) return n;
  return Math.max(1, Math.min(numPages, n));
}
