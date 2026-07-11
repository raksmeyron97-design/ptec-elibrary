// Single source of truth for the top-level navbar trigger box (links,
// dropdown triggers, and the "More" overflow trigger). PriorityNav renders
// invisible clones with these same classes to measure natural widths — if a
// trigger's box model diverges from this class, the overflow math breaks.
export const NAV_TRIGGER_CLASS =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[15px] font-medium font-khmer-serif";

export const NAV_TRIGGER_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface";
