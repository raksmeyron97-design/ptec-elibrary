// Shared class strings for the journal article page.
//
// EYEBROW is the small label above a block ("ARTICLE", "PUBLISHED IN",
// "PREVIOUS ARTICLE"). Uppercase and letter-spacing are applied only where the
// inherited language is English: letter-spacing pulls Khmer consonant clusters
// apart, and Khmer has no case, so on /km the label is the same size and weight
// without either.
export const EYEBROW =
  "text-[12px] font-bold leading-5 [&:lang(en)]:uppercase [&:lang(en)]:tracking-[0.12em]";

/** Khmer script, for choosing a title's `lang` and line height. */
export const KHMER_RE = /[ក-៿᧠-᧿]/;
