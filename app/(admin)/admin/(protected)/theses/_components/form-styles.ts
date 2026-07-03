/**
 * Shared field-styling tokens for the thesis Create/Edit forms.
 *
 * Single source of truth — both CreateThesisForm and EditThesisForm import
 * these so their inputs and labels can never drift apart again.
 */

/** Text input / select base styling. */
export const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-divider/60 bg-transparent px-4 text-sm outline-none transition-all placeholder:text-text-muted/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 hover:border-divider";

/** Field label styling. */
export const LABEL_CLASS = "block text-sm font-semibold text-text-body mb-1.5";
