/* The reader's keyboard bindings — ONE list, consumed by the keydown handler
   (`useReaderKeyboard`) and by the help dialog (`ReaderShortcuts`). A binding
   that is not in this list does not exist, so the dialog can never advertise a
   key that does nothing. `lib/reader/shortcuts.test.ts` cross-checks the
   handler source against it. */

export type ReaderAction =
  | "nextPage"
  | "prevPage"
  | "firstPage"
  | "lastPage"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "focusMode"
  | "rotate"
  | "search"
  | "bookmark"
  | "shortcuts"
  | "escape";

export type Shortcut = {
  action: ReaderAction;
  /** Keys as the handler matches them (`KeyboardEvent.key`). */
  keys: string[];
  /** Display form for the help dialog. */
  display: string[];
  /** Requires Ctrl/⌘ (only the reset-zoom binding — browser zoom stays free). */
  modifier?: "mod";
  /** Message key under the `reader` namespace. */
  labelKey: string;
};

export const READER_SHORTCUTS: readonly Shortcut[] = [
  { action: "prevPage", keys: ["ArrowLeft", "ArrowUp", "PageUp"], display: ["←", "↑", "PgUp"], labelKey: "shortcutPrev" },
  { action: "nextPage", keys: ["ArrowRight", "ArrowDown", "PageDown"], display: ["→", "↓", "PgDn"], labelKey: "shortcutNext" },
  { action: "firstPage", keys: ["Home"], display: ["Home"], labelKey: "shortcutFirst" },
  { action: "lastPage", keys: ["End"], display: ["End"], labelKey: "shortcutLast" },
  { action: "zoomIn", keys: ["+", "="], display: ["+"], labelKey: "shortcutZoomIn" },
  { action: "zoomOut", keys: ["-"], display: ["−"], labelKey: "shortcutZoomOut" },
  { action: "resetZoom", keys: ["0"], display: ["0"], modifier: "mod", labelKey: "shortcutResetZoom" },
  { action: "focusMode", keys: ["f", "F"], display: ["F"], labelKey: "shortcutFocus" },
  { action: "rotate", keys: ["r", "R"], display: ["R"], labelKey: "shortcutRotate" },
  { action: "search", keys: ["/"], display: ["/"], labelKey: "shortcutSearch" },
  { action: "bookmark", keys: ["b", "B"], display: ["B"], labelKey: "shortcutBookmark" },
  { action: "shortcuts", keys: ["?"], display: ["?"], labelKey: "shortcutHelp" },
  { action: "escape", keys: ["Escape"], display: ["Esc"], labelKey: "shortcutEscape" },
];

/** Resolve a key event to an action, or null. Modifier-bearing bindings only
    match with the modifier; plain bindings never match with Ctrl/⌘/Alt held
    (browser shortcuts stay the browser's). */
export function shortcutFor(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): ReaderAction | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  if (e.altKey) return null;
  for (const s of READER_SHORTCUTS) {
    if (!s.keys.includes(e.key)) continue;
    if (s.modifier === "mod") {
      if (mod) return s.action;
      continue;
    }
    if (mod) return null;
    return s.action;
  }
  return null;
}
