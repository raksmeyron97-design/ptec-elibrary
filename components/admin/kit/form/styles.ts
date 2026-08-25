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

/**
 * Text input / select base styling.
 *
 * Focus comes from `.focus-field`, not from a `focus:ring-*` utility. The
 * previous value hand-wrote `focus:border-brand focus:ring-[3px]`, which
 * `lib/focus-system.test.ts` did not catch because it greps for
 * `focus-visible:ring-` — and plain `focus:` paints the full ring on a mouse
 * click too, which is exactly the distinction the focus system exists to draw.
 * `.focus-field` is modality-aware: a border change on click, the halo on Tab.
 * (Flagged as a known deviation when the kit landed in 57df2b7; this is it.)
 *
 * `border-divider` at full strength rather than `/60`: at 60% the resting
 * border was 1.3:1 against white, so an empty field had no visible edge.
 */
export const INPUT_CLASS =
  "focus-field h-11 w-full rounded-lg border border-divider bg-bg-surface px-3.5 text-sm shadow-sm transition-all duration-200 placeholder:text-text-muted/60 hover:border-border-strong disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-60";

/** Field label styling. */
export const LABEL_CLASS = "block text-sm font-medium text-text-body mb-1.5";

/** Multi-line variant: the base is a fixed-height control. */
export const TEXTAREA_CLASS = `${INPUT_CLASS} h-auto py-3 leading-relaxed`;

/** Identifier-shaped values — slugs, DOIs, ISBNs — read better monospaced. */
export const MONO_INPUT_CLASS = `${INPUT_CLASS} font-mono text-xs`;

/**
 * Applied on top of the base when a control is reporting an error.
 *
 * Resting border only. The focused-while-invalid state is already handled by
 * `.focus-field[aria-invalid="true"]:focus-visible` in globals.css — which
 * `Field` triggers for free, since it sets `aria-invalid` whenever it renders
 * an error. Restating it here would give red two owners.
 */
export const INPUT_INVALID_CLASS = "border-danger hover:border-danger";

/** Hint and error share one slot, so correcting an error never shifts layout. */
export const HINT_CLASS = "mt-1.5 text-xs text-text-muted";
export const ERROR_CLASS = "mt-1.5 text-xs font-medium text-danger";

/**
 * Section heading inside a tab panel. Related fields are grouped by space and
 * a heading rather than by a nested box — a card inside a card inside a tab
 * gives three borders to look past before reaching a label.
 */
export const SECTION_TITLE_CLASS = "text-base font-semibold text-text-heading";

/** Two-column field grid. Collapses to one below `sm`. */
export const FIELD_GRID_CLASS = "grid grid-cols-1 gap-6 sm:grid-cols-2";

/** Put on a child of FIELD_GRID_CLASS that must span the full measure. */
export const FIELD_FULL_CLASS = "sm:col-span-2";

/** Dashed dropzone frame, shared by cover, avatar, logo and favicon pickers. */
export const DROPZONE_CLASS =
  "focus-field flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-divider bg-paper/40 p-8 text-center transition-all duration-200 hover:border-admin-accent/50 hover:bg-admin-accent-soft/40";
