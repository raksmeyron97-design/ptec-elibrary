// Pure helpers for telling assistive tech and CSS WHICH language a run of text
// is in. The site stores many strings bilingually in one field ("ខ្មែរ / English")
// and renders them on pages whose <html lang> is the page locale, so a Khmer
// title on an English page was read aloud with an English voice and styled with
// Latin rules (uppercase, letter-spacing) that break Khmer script.

/** Khmer block (U+1780–U+17FF) plus Khmer Symbols (U+19E0–U+19FF). */
const KHMER_RE = /[ក-៿᧠-᧿]/;

/** True when the text contains at least one Khmer code point. */
export function hasKhmer(text: string | null | undefined): boolean {
  return !!text && KHMER_RE.test(text);
}

/**
 * The BCP-47 tag a run should carry, or null when it needs none. Only two
 * answers exist here on purpose: this library is Khmer/English, and a wrong
 * guess ("fr" for a French title) is worse than inheriting the page language.
 */
export function langFor(text: string | null | undefined, pageLocale: string): "km" | "en" | null {
  if (!text) return null;
  const km = hasKhmer(text);
  if (km && pageLocale !== "km") return "km";
  if (!km && pageLocale === "km" && /[A-Za-z]{2,}/.test(text)) return "en";
  return null;
}

export interface BilingualParts {
  km: string | null;
  en: string | null;
}

/**
 * Split a " / "-joined bilingual field into its halves, deciding which half is
 * which by SCRIPT rather than by position — editors write both orders.
 * A value with no separator is returned whole on the side its script says.
 */
export function splitBilingual(value: string | null | undefined): BilingualParts {
  if (!value) return { km: null, en: null };
  const parts = value.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { km: null, en: null };
  if (parts.length === 1) return hasKhmer(parts[0]) ? { km: parts[0], en: null } : { km: null, en: parts[0] };
  const km = parts.find((p) => hasKhmer(p)) ?? null;
  const en = parts.find((p) => !hasKhmer(p)) ?? null;
  // Two halves in the same script: keep them both rather than drop one.
  if (km && en) return { km, en };
  return hasKhmer(parts[0]) ? { km: parts.join(" / "), en: null } : { km: null, en: parts.join(" / ") };
}
