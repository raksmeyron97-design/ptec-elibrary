// lib/seo/phone.ts
//
// A telephone number in JSON-LD is read by machines, and a machine cannot
// dial a bare local number like `0XX XXX XXX` — it has no country. Schema.org
// asks for the
// international form; the site's own footer keeps the local form a Cambodian
// reader expects, because that is what the institution publishes.
//
// So this converts for the STRUCTURED DATA only. The visible number is
// untouched, and there is deliberately no general phone formatter here: one
// country, one rule, and anything it does not recognise is passed through
// rather than mangled.

/** Cambodia. */
const KH_DIALING_CODE = "+855";

/**
 * A published local number in international form, for JSON-LD.
 *
 * `"012 345 678"` → `"+855 12 345 678"`. The leading trunk `0` is dropped,
 * which is the whole reason this cannot be done by prefixing a string.
 *
 * (The example is fictional on purpose: `lib/settings-consistency.test.ts`
 * keeps the institution's real number in `lib/ptec.ts` and nowhere else.)
 *
 * Passed through UNCHANGED when:
 *   - it already starts with `+` (someone published it correctly, or it is
 *     not Cambodian);
 *   - it contains no digits, or so few that it is not a phone number;
 *   - it has no leading `0` and is not a plain 8–9 digit subscriber number,
 *     because then we do not know what we are looking at.
 *
 * Never throws and never returns a partial number: the caller publishes what
 * comes back.
 */
export function toInternationalKhPhone(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value.startsWith("+")) return value;

  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 10) return value;

  // Local mobile/landline numbers are written with a trunk 0 (092…, 023…).
  // Without it we have a bare subscriber number, which is still dialable
  // once the country code is attached.
  const subscriber = digits.startsWith("0") ? digits.slice(1) : digits;
  if (subscriber.length < 8 || subscriber.length > 9) return value;

  // Group as the country writes it: a 2-digit operator prefix, then the
  // subscriber digits split after three — 92 788 990, 97 733 6162.
  const head = subscriber.slice(0, 2);
  const rest = subscriber.slice(2);
  const grouped = `${rest.slice(0, 3)} ${rest.slice(3)}`;

  return `${KH_DIALING_CODE} ${head} ${grouped}`.replace(/\s+/g, " ").trim();
}
