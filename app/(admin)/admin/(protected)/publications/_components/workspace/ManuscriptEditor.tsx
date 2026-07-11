"use client";

// Constrained manuscript editor for one abstract language.
//
// The stored source stays plain text (the exact syntax the public
// AcademicText renderer understands), edited through a native <textarea> so
// Khmer IME input, undo/redo, and caret behavior all come from the browser.
// A metric-identical overlay renders behind the transparent textarea text and
// paints [cite:…] tokens as atomic-looking pills (brand for resolvable,
// danger for broken). Backspace/Delete at a token edge and clicks inside a
// token treat the whole token as one unit, so citations are effectively
// atomic without giving up plain-text safety.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Bold, Italic, Redo2, Subscript, Superscript, Undo2 } from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import {
  citationToken,
  extractCitationTokens,
  resolveCitationGroup,
  splitCitationKeys,
} from "@/lib/publications/citations";
import type { EditorLocale } from "./shared";
import { LOCALE_LABEL } from "./shared";

export interface ManuscriptEditorHandle {
  /** Insert (or merge into an adjacent group) a citation at the saved caret. */
  insertCitation: (referenceIds: readonly string[]) => boolean;
  focus: () => void;
  /** True once the administrator has placed a real caret in this editor. */
  hasCaret: () => boolean;
}

export interface ManuscriptEditorProps {
  locale: EditorLocale;
  value: string;
  onChange: (value: string) => void;
  references: PublicationReference[];
  disabled?: boolean;
  required?: boolean;
  placeholder: string;
  id: string;
  name: string;
  /** Editor height; the workspace passes mode-appropriate classes. */
  heightClass?: string;
  describedBy?: string;
  invalid?: boolean;
  /** Fired whenever caret availability changes (drives the Insert button). */
  onCaretStateChange?: (hasCaret: boolean) => void;
  /** Cmd/Ctrl+Shift+C — let the workspace open the citation manager. */
  onRequestCitationPanel?: () => void;
}

type Selection = { start: number; end: number };

const FORMATS = [
  { label: "Bold", open: "**", close: "**", icon: Bold },
  { label: "Italic", open: "*", close: "*", icon: Italic },
  { label: "Subscript", open: "<sub>", close: "</sub>", icon: Subscript },
  { label: "Superscript", open: "<sup>", close: "</sup>", icon: Superscript },
] as const;

// Metrics-critical classes shared by the textarea and its overlay. Any
// divergence here breaks the alignment between visible text and caret.
const SHARED_METRICS =
  "whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-7 [scrollbar-gutter:stable]";

/**
 * Apply an edit through execCommand so the browser records native undo
 * history; fall back to setRangeText when the command is unavailable.
 */
function applyTextEdit(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  insert: string,
): void {
  textarea.focus();
  textarea.setSelectionRange(start, end);
  let handled = false;
  try {
    handled = insert
      ? document.execCommand("insertText", false, insert)
      : document.execCommand("delete", false);
  } catch {
    handled = false;
  }
  if (!handled) {
    textarea.setRangeText(insert, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function tokenRangeAt(
  value: string,
  position: number,
  mode: "inside" | "before" | "after",
): { start: number; end: number; key: string } | null {
  for (const token of extractCitationTokens(value)) {
    if (mode === "inside" && position > token.start && position < token.end) return token;
    if (mode === "before" && position === token.end) return token;
    if (mode === "after" && position === token.start) return token;
    if (token.start > position) break;
  }
  return null;
}

const ManuscriptEditor = forwardRef<ManuscriptEditorHandle, ManuscriptEditorProps>(
  function ManuscriptEditor(
    {
      locale,
      value,
      onChange,
      references,
      disabled = false,
      required = false,
      placeholder,
      id,
      name,
      heightClass = "h-[min(60vh,34rem)] min-h-[20rem]",
      describedBy,
      invalid = false,
      onCaretStateChange,
      onRequestCitationPanel,
    },
    forwardedRef,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const selectionRef = useRef<Selection>({ start: value.length, end: value.length });
    const hasCaretRef = useRef(false);
    const [, forceCaretRender] = useState(false);

    const isKhmer = locale === "km";
    const fontClass = isKhmer ? "font-khmer-serif" : "";

    const markCaret = useCallback(() => {
      if (hasCaretRef.current) return;
      hasCaretRef.current = true;
      onCaretStateChange?.(true);
      forceCaretRender((v) => !v);
    }, [onCaretStateChange]);

    const rememberSelection = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      selectionRef.current = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };
    }, []);

    const syncScroll = useCallback(() => {
      const textarea = textareaRef.current;
      const overlay = overlayRef.current;
      if (textarea && overlay) overlay.scrollTop = textarea.scrollTop;
    }, []);

    // Expand a click landing inside a token to select the whole token, so a
    // stray keystroke replaces the citation instead of corrupting it.
    const guardTokenClick = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { selectionStart, selectionEnd } = textarea;
      if (selectionStart !== selectionEnd) return;
      const token = tokenRangeAt(textarea.value, selectionStart, "inside");
      if (token) {
        textarea.setSelectionRange(token.start, token.end);
      }
      rememberSelection();
    }, [rememberSelection]);

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = event.currentTarget;

        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          rememberSelection();
          onRequestCitationPanel?.();
          return;
        }

        // Atomic token deletion: Backspace right after a token, or Delete
        // right before one, removes the entire token in a single stroke.
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          textarea.selectionStart === textarea.selectionEnd
        ) {
          const position = textarea.selectionStart;
          const token =
            event.key === "Backspace"
              ? tokenRangeAt(textarea.value, position, "before") ??
                tokenRangeAt(textarea.value, position, "inside")
              : tokenRangeAt(textarea.value, position, "after") ??
                tokenRangeAt(textarea.value, position, "inside");
          if (token) {
            event.preventDefault();
            applyTextEdit(textarea, token.start, token.end, "");
            rememberSelection();
          }
        }
      },
      [onRequestCitationPanel, rememberSelection],
    );

    const applyFormat = useCallback(
      (open: string, close: string) => {
        const textarea = textareaRef.current;
        if (!textarea || disabled) return;
        const { start, end } = selectionRef.current;
        const selected = textarea.value.slice(start, end);
        applyTextEdit(textarea, start, end, `${open}${selected}${close}`);
        const caret = selected
          ? { start: start + open.length, end: end + open.length }
          : { start: start + open.length, end: start + open.length };
        textarea.setSelectionRange(caret.start, caret.end);
        selectionRef.current = caret;
        markCaret();
      },
      [disabled, markCaret],
    );

    const runHistory = useCallback((command: "undo" | "redo") => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      try {
        document.execCommand(command);
      } catch {
        /* history unavailable — nothing safe to do */
      }
    }, []);

    const insertCitation = useCallback(
      (referenceIds: readonly string[]): boolean => {
        const textarea = textareaRef.current;
        if (!textarea || disabled) return false;
        const ids = referenceIds.filter((refId) =>
          references.some((reference) => reference.id === refId),
        );
        if (ids.length === 0) return false;

        const source = textarea.value;
        const { start, end } = selectionRef.current;

        // Caret touching an existing token extends it into a group: [1] → [1, 2].
        if (start === end) {
          const adjacent =
            tokenRangeAt(source, start, "before") ??
            tokenRangeAt(source, start, "inside") ??
            tokenRangeAt(source, start, "after");
          if (adjacent) {
            const mergedKeys = [...splitCitationKeys(adjacent.key), ...ids];
            const merged = citationToken(mergedKeys);
            applyTextEdit(textarea, adjacent.start, adjacent.end, merged);
            const caret = adjacent.start + merged.length;
            textarea.setSelectionRange(caret, caret);
            selectionRef.current = { start: caret, end: caret };
            markCaret();
            return true;
          }
        }

        const before = source.slice(0, start);
        const after = source.slice(end);
        const leading = before.length > 0 && !/[\s([{]$/.test(before) ? " " : "";
        const trailing = after.length > 0 && !/^[\s.,;:!?\])}]/.test(after) ? " " : "";
        const inserted = `${leading}${citationToken(ids)}${trailing}`;
        applyTextEdit(textarea, start, end, inserted);
        const caret = start + inserted.length;
        textarea.setSelectionRange(caret, caret);
        selectionRef.current = { start: caret, end: caret };
        markCaret();
        return true;
      },
      [disabled, references, markCaret],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        insertCitation,
        focus: () => textareaRef.current?.focus(),
        hasCaret: () => hasCaretRef.current,
      }),
      [insertCitation],
    );

    // Overlay segments: plain runs + token pills. Recomputed per keystroke,
    // but bounded by abstract size (a few KB), so this stays cheap.
    const overlaySegments = useMemo<ReactNode[]>(() => {
      const segments: ReactNode[] = [];
      let cursor = 0;
      extractCitationTokens(value).forEach((token, index) => {
        if (token.start > cursor) {
          segments.push(value.slice(cursor, token.start));
        }
        const resolved = resolveCitationGroup(token.keys, references);
        const known = token.keys.length > 0 && resolved.length === token.keys.length;
        segments.push(
          <mark
            key={`token-${index}`}
            className={`rounded-[0.3rem] bg-transparent font-medium ${
              known ? "text-brand [background:color-mix(in_srgb,var(--color-brand)_11%,transparent)]" : "text-danger [background:color-mix(in_srgb,var(--color-danger)_12%,transparent)]"
            }`}
          >
            {token.raw}
          </mark>,
        );
        cursor = token.end;
      });
      if (cursor < value.length) segments.push(value.slice(cursor));
      // Trailing newline needs a visible line in the overlay too.
      if (value.endsWith("\n")) segments.push("\n");
      return segments;
    }, [value, references]);

    const overlayStyle: CSSProperties = { overflow: "hidden" };

    return (
      <div
        className={`relative rounded-lg border bg-bg-surface transition-colors focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/15 ${
          invalid ? "border-danger" : "border-divider"
        }`}
      >
        <div
          role="toolbar"
          aria-label={`Format ${LOCALE_LABEL[locale]} abstract`}
          className="flex flex-wrap items-center gap-0.5 border-b border-divider bg-paper/50 px-1.5 py-1"
        >
          {FORMATS.map((format) => (
            <button
              key={format.label}
              type="button"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat(format.open, format.close)}
              aria-label={`${format.label} in ${LOCALE_LABEL[locale]} abstract`}
              title={format.label}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <format.icon className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-divider" />
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runHistory("undo")}
            aria-label={`Undo in ${LOCALE_LABEL[locale]} abstract`}
            title="Undo (⌘Z)"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runHistory("redo")}
            aria-label={`Redo in ${LOCALE_LABEL[locale]} abstract`}
            title="Redo (⇧⌘Z)"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Redo2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="ml-auto hidden px-1.5 text-[11px] text-text-muted sm:block">
            ⌘⇧C cites at the caret
          </span>
        </div>

        <div className={`relative ${heightClass}`}>
          <div
            ref={overlayRef}
            aria-hidden="true"
            style={overlayStyle}
            className={`pointer-events-none absolute inset-0 select-none text-text-body ${SHARED_METRICS} ${fontClass}`}
          >
            {overlaySegments}
          </div>
          <textarea
            ref={textareaRef}
            id={id}
            name={name}
            lang={locale}
            value={value}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            spellCheck={!isKhmer}
            onChange={(event) => {
              rememberSelection();
              onChange(event.currentTarget.value);
            }}
            onScroll={syncScroll}
            onFocus={() => {
              markCaret();
              rememberSelection();
            }}
            onSelect={rememberSelection}
            onKeyDown={handleKeyDown}
            onKeyUp={rememberSelection}
            onClick={guardTokenClick}
            onBlur={rememberSelection}
            className={`absolute inset-0 h-full w-full resize-none bg-transparent text-transparent caret-brand outline-none transition selection:bg-brand/20 placeholder:text-text-muted/50 disabled:cursor-not-allowed ${SHARED_METRICS} ${fontClass} overflow-y-auto`}
          />
        </div>
      </div>
    );
  },
);

export default ManuscriptEditor;
