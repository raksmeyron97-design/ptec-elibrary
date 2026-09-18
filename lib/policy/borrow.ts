// lib/policy/borrow.ts
//
// The reader-facing shape of the Borrow & Return policy at /policy.
//
// EVERY FIGURE AND EVERY CONSEQUENCE HERE IS READ FROM lib/about/content.ts.
// Nothing in this file states a rule; it selects, orders and labels rules that
// already exist, so /policy and /about/rules can never disagree about how many
// days a loan runs or what a lost book costs. If a number needs changing, it
// changes in content.ts and both pages move together.
//
// The division of labour with the message catalogue is equally strict:
//   - `lib/about/content.ts`  → the library's own wording (bilingual, official)
//   - `messages/{en,km}.json` → labels, questions and captions this UI invented
// A question is ours to phrase; an answer is never ours to write.

import { BORROWING_ALLOWANCES, PENALTIES } from "@/lib/about/content";
import type { BorrowingAllowance, LocalizedText, Penalty } from "@/lib/about/types";

/** Find one audience's allowance. Returns undefined rather than a default: a
 *  missing audience must render nothing, never a plausible invented figure
 *  (rule 3 at the top of content.ts). */
function allowanceFor(audience: BorrowingAllowance["audience"]) {
  return BORROWING_ALLOWANCES.find((a) => a.audience === audience);
}

const STUDENTS = allowanceFor("students");
const STAFF = allowanceFor("staff");

function loanDays(
  allowance: BorrowingAllowance | undefined,
  key: "khmer" | "english" | "default",
): number | undefined {
  return allowance?.loanDays.find((d) => d.key === key)?.days;
}

/**
 * The four headline figures.
 *
 * `value` is a NUMBER where the policy states one and `null` where it does
 * not — the caller renders the number large and falls back to the card's
 * qualifier text otherwise. That distinction is the whole reason this is not
 * four strings: a card with no figure must look like a card with no figure,
 * not like a card whose figure failed to load.
 */
export type KeyNumber = {
  /** Translation key under `policy.keyNumbers.<id>`. */
  id: "loan" | "items" | "renewals" | "fines";
  icon: "clock" | "stack" | "repeat" | "coins";
  /** The figure to set large, or null when the policy states no number. */
  value: number | null;
  /** Values interpolated into `policy.keyNumbers.<id>.{value,detail}`. */
  vars: Record<string, number | string>;
};

export const KEY_NUMBERS: readonly KeyNumber[] = [
  {
    id: "loan",
    icon: "clock",
    // Khmer-language material is the collection's majority and the longer of
    // the two student periods; the English period and the staff period ride in
    // the detail line rather than being averaged into one misleading number.
    value: loanDays(STUDENTS, "khmer") ?? null,
    vars: {
      khmerDays: loanDays(STUDENTS, "khmer") ?? 0,
      englishDays: loanDays(STUDENTS, "english") ?? 0,
      staffDays: loanDays(STAFF, "default") ?? 0,
    },
  },
  {
    id: "items",
    icon: "stack",
    value: STUDENTS?.maxItems ?? null,
    vars: { maxItems: STUDENTS?.maxItems ?? 0, staffMaxItems: STAFF?.maxItems ?? 0 },
  },
  {
    id: "renewals",
    icon: "repeat",
    // Renewals differ by material language and one of them is unlimited, so
    // there is no single number to print. The card carries words.
    value: null,
    vars: {},
  },
  {
    id: "fines",
    icon: "coins",
    // TODO(library): the regulations state only "a fine is payable at the rate
    // set by the library" — no per-day amount exists in the source form
    // (docs/assets/library_info_form.docx §6). When the library supplies the
    // rate, add it to lib/about/content.ts and give this card a `value`.
    // Until then the card prints the policy's own wording; it must NOT print a
    // placeholder figure, because a reader has no way to tell an invented
    // number on a policy page from a real one.
    value: null,
    vars: {},
  },
];

/**
 * The loan lifecycle, as the four moments a borrower actually passes through.
 * Labels and descriptions are UI copy (`policy.lifecycle.<id>`); the figures
 * interpolated into them come from KEY_NUMBERS' source above.
 */
export type LifecycleStep = {
  id: "borrow" | "due" | "renew" | "return";
  icon: "card" | "calendar" | "repeat" | "check";
  vars: Record<string, number | string>;
};

export const LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  { id: "borrow", icon: "card", vars: { maxItems: STUDENTS?.maxItems ?? 0 } },
  {
    id: "due",
    icon: "calendar",
    vars: {
      khmerDays: loanDays(STUDENTS, "khmer") ?? 0,
      englishDays: loanDays(STUDENTS, "english") ?? 0,
    },
  },
  { id: "renew", icon: "repeat", vars: {} },
  { id: "return", icon: "check", vars: {} },
];

/**
 * The edge cases, as an FAQ.
 *
 * The ANSWER is the library's own `consequence` string, verbatim and
 * bilingual. Only the question is ours, and it is a translation key — so this
 * list can never become a second, paraphrased statement of a penalty.
 *
 * Ordered gentlest-first: a reader arriving from "I'm going to be late" should
 * not have to scroll past theft and disciplinary action to find their answer.
 */
export type PolicyFaqEntry = {
  /** Penalty id, which is also the key under `policy.faq.<id>`. */
  id: string;
  /** `policy.faq.<id>.q` — the question, phrased by this UI. */
  questionKey: string;
  /** The library's official answer, both languages. */
  answer: LocalizedText;
  /** The condition, in the library's words — rendered as the answer's lead-in. */
  trigger: LocalizedText;
  tone: Penalty["tone"];
};

const FAQ_ORDER = ["late-return", "damaged", "lost", "card-misuse", "suspension", "theft"];

export const POLICY_FAQ: readonly PolicyFaqEntry[] = FAQ_ORDER.flatMap((id) => {
  const penalty = PENALTIES.find((p) => p.id === id);
  // A penalty renamed in content.ts drops out of the FAQ rather than rendering
  // an empty accordion row with a question and no answer.
  if (!penalty) return [];
  return [
    {
      id: penalty.id,
      questionKey: penalty.id.replace(/-/g, "_"),
      answer: penalty.consequence,
      trigger: penalty.trigger,
      tone: penalty.tone,
    },
  ];
});

/** Section ids on /policy, in display order — the anchors and the TOC. */
export const POLICY_SECTIONS = [
  "summary",
  "lifecycle",
  "borrowing",
  "returning",
  "digital",
  "faq",
  "help",
] as const;

export type PolicySectionId = (typeof POLICY_SECTIONS)[number];
