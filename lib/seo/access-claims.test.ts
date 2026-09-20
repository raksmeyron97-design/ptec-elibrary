// lib/seo/access-claims.test.ts
//
// What the site PROMISES about access must match what the server DOES.
//
// ── The defect this pins ─────────────────────────────────────────────────────
//
// Measured on production 2026-09-20, the site said in three places that no
// account was needed to READ:
//
//   meta description   "Read and download … free, with no account needed"
//   FAQ JSON-LD        "No account is needed to search, browse, or read."
//   og:description     "No account needed."
//
// and `GET /api/books/<id>/file` without a session answered **401**. Reading
// online has required a signed-in reader for as long as that route has, by
// design — the comment in it says so.
//
// This is not a wording preference. The FAQ answer is emitted as
// `FAQPage`/`acceptedAnswer` structured data, so the false claim was being
// handed to search engines as a machine-readable fact about the service,
// and a reader arriving from that snippet hits a sign-in wall.
//
// The rule these tests enforce: SEARCHING and BROWSING may be advertised as
// account-free. READING and DOWNLOADING may not.

import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

const LOCALES = { en, km } as Record<string, { home: Record<string, string> }>;

/** English phrasings that deny an account requirement. */
const EN_NO_ACCOUNT = /no account|without an account|no sign[- ]?up|without signing/i;
/** Khmer phrasings for the same. */
const KM_NO_ACCOUNT = /មិនចាំបាច់មានគណនី|មិនត្រូវការគណនី|គ្មានគណនី/;
/** English words for the gated actions. */
const EN_GATED_ACTION = /\b(read|reading|download|downloading)\b/i;
/** Khmer words for the same. */
const KM_GATED_ACTION = /អាន|ទាញយក/;

/**
 * An explicit statement that the gated actions DO need an account.
 *
 * The first version of this test forbade "no account" and a reading verb
 * from appearing in the same string at all — which fails the honest
 * phrasing too ("search and browse with no account; reading needs a free
 * one"). What makes a claim false is the denial standing ALONE, so what is
 * required is the counter-statement, not the absence of the subject.
 *
 * "A free account adds extras" deliberately does NOT match: that was the
 * original FAQ wording, and it describes a bonus rather than a requirement.
 */
const EN_REQUIRES_ACCOUNT = /\b(need|needs|require|requires)\b[^.;]{0,30}\ba free (account|one)\b/i;
const KM_REQUIRES_ACCOUNT = /ត្រូវការគណនី/;

const claim = (locale: string, key: string) => LOCALES[locale].home[key] ?? "";

describe("no public copy denies an account requirement for reading", () => {
  // Every homepage string that carries an access claim. Listed explicitly:
  // a new one must be added here deliberately, which is the moment to think
  // about whether it is true.
  const CLAIM_KEYS = [
    "seoDescription",
    "ogDescription",
    "aboutAccessValue",
    "howStep1Title",
    "faqA3",
  ];

  it.each(CLAIM_KEYS)("en.home.%s does not promise account-free reading", (key) => {
    const text = claim("en", key);
    if (!EN_NO_ACCOUNT.test(text)) return; // makes no such claim at all
    if (!EN_GATED_ACTION.test(text)) return; // denies an account, but only for search/browse
    // It denies an account AND talks about reading, so it must say plainly
    // that reading needs one. Otherwise a reader takes the denial as
    // covering everything in the sentence — which is what happened.
    expect(
      EN_REQUIRES_ACCOUNT.test(text),
      `en.home.${key} denies an account requirement beside a reading/downloading verb, without saying an account IS required: ${text}`,
    ).toBe(true);
  });

  it.each(CLAIM_KEYS)("km.home.%s does not promise account-free reading", (key) => {
    const text = claim("km", key);
    if (!KM_NO_ACCOUNT.test(text)) return;
    if (!KM_GATED_ACTION.test(text)) return;
    expect(
      KM_REQUIRES_ACCOUNT.test(text),
      `km.home.${key} denies an account beside អាន/ទាញយក without stating ត្រូវការគណនី: ${text}`,
    ).toBe(true);
  });

  it("still advertises the thing that IS account-free", () => {
    // The fix must not over-correct into saying nothing. Searching and
    // browsing genuinely need no account, and that is worth saying.
    expect(EN_NO_ACCOUNT.test(claim("en", "howStep1Title"))).toBe(true);
    expect(KM_NO_ACCOUNT.test(claim("km", "howStep1Title"))).toBe(true);
  });

  it("the FAQ answer states the account requirement rather than omitting it", () => {
    // This one is emitted as FAQPage structured data, so silence would leave
    // the reader to discover the wall at the sign-in page.
    expect(claim("en", "faqA3")).toMatch(/free account/i);
    expect(claim("en", "faqA3")).toMatch(/\b(read|reading)\b/i);
    expect(claim("km", "faqA3")).toMatch(/គណនីឥតគិតថ្លៃ/);
    expect(claim("km", "faqA3")).toMatch(/អាន/);
  });

  it("keeps the meta description within a search snippet", () => {
    expect(claim("en", "seoDescription").length).toBeLessThanOrEqual(165);
  });
});
