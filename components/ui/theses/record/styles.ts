// The record page's few repeated treatments, named once.
//
// One button in three weights, one uppercase label (which a Khmer page never
// uppercases or letter-spaces — `:lang(km)` inherits from <html lang>), and one
// section heading. The primary weight is spent once per view: the access
// panel's main verb, repeated by the phone dock only after the panel has
// scrolled away.

const BUTTON =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg px-[18px] text-[14.5px] font-semibold leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0";

export const BUTTON_PRIMARY = `${BUTTON} bg-brand text-brand-contrast hover:bg-brand-hover`;

export const BUTTON_SECONDARY = `${BUTTON} border border-reader-control-border bg-bg-surface text-text-heading hover:border-brand hover:text-brand`;

export const BUTTON_QUIET =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-heading transition-colors duration-150 hover:bg-paper hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

export const LABEL =
  "text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-text-muted [&:lang(km)]:text-[12px] [&:lang(km)]:normal-case [&:lang(km)]:leading-[18px] [&:lang(km)]:tracking-normal";

export const SECTION_HEADING =
  "font-record text-[22px] font-semibold leading-7 tracking-[-0.005em] text-text-heading [&:lang(km)]:font-kh [&:lang(km)]:leading-[1.5] [&:lang(km)]:tracking-normal";

/** Anchor targets clear the phone's top bar AND the sticky section nav. */
export const ANCHOR_OFFSET = "scroll-mt-[calc(var(--ptec-sticky-top)+4.5rem)]";

/** The anchor-nav id of the access panel — the phone dock watches it. */
export const ACCESS_PANEL_ID = "thesis-access";
