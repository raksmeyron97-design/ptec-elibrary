/**
 * Canonical control styling for admin forms.
 *
 * These values are the ones `theses/_components/form-styles.ts` has always
 * shipped — they moved here so the field layer and its fourteen existing
 * importers read from one place instead of two. `form-styles.ts` now re-exports
 * from this module, so nothing had to be touched to adopt it and nothing
 * changed visually.
 *
 * Do not add a ninth label variant. If a form needs a different control size,
 * add a documented modifier here rather than a local class string — the panel
 * currently carries eight label styles and three input bases, and that drift is
 * exactly what this module exists to stop.
 */

/** Text input / select base styling. */
export const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-divider/60 bg-transparent px-4 text-sm outline-none transition-all placeholder:text-text-muted/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 hover:border-divider";

/** Field label styling. */
export const LABEL_CLASS = "block text-sm font-semibold text-text-body mb-1.5";

/** Multi-line variant: the base is a fixed-height control. */
export const TEXTAREA_CLASS = `${INPUT_CLASS} h-auto py-3 leading-relaxed`;

/** Identifier-shaped values — slugs, DOIs, ISBNs — read better monospaced. */
export const MONO_INPUT_CLASS = `${INPUT_CLASS} font-mono text-xs`;

/** Applied on top of the base when a control is reporting an error. */
export const INPUT_INVALID_CLASS =
  "border-danger/70 focus:border-danger focus:ring-danger/15 hover:border-danger";

/** Hint and error share one slot, so correcting an error never shifts layout. */
export const HINT_CLASS = "mt-1.5 text-xs text-text-muted";
export const ERROR_CLASS = "mt-1.5 text-xs font-medium text-danger";
