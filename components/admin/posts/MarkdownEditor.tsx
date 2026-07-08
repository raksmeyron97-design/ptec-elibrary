"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Markdown from "@/app/(public)/posts/[slug]/Markdown";

interface Props {
  name?: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  required?: boolean;
  minRows?: number;
  /** Optional controlled tab (e.g. a sticky "Preview" button elsewhere on the page). Falls back to internal state when omitted. */
  tab?: Tab;
  onTabChange?: (tab: Tab) => void;
  /** Already-uploaded cover images, offered by the "Insert image" tool. */
  images?: { url: string; alt?: string }[];
}

type Tab = "write" | "preview";

interface Tool {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: "wrap" | "line" | "insert";
  prefix: string;
  suffix?: string;
}

const TABLE_TEMPLATE =
  "\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Row 1 | Row 1 |\n| Row 2 | Row 2 |\n\n";

const TOOLS: (Tool | "divider")[] = [
  // Headings
  {
    id: "h1", label: "Heading 1",
    action: "line", prefix: "#",
    icon: <span className="text-[10px] font-black leading-none tracking-tight">H1</span>,
  },
  {
    id: "h2", label: "Heading 2",
    action: "line", prefix: "##",
    icon: <span className="text-[10px] font-black leading-none tracking-tight">H2</span>,
  },
  {
    id: "h3", label: "Heading 3",
    action: "line", prefix: "###",
    icon: <span className="text-[10px] font-black leading-none tracking-tight">H3</span>,
  },
  "divider",
  // Emphasis
  {
    id: "bold", label: "Bold (Ctrl+B)",
    action: "wrap", prefix: "**", suffix: "**",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
        <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
      </svg>
    ),
  },
  {
    id: "italic", label: "Italic (Ctrl+I)",
    action: "wrap", prefix: "*", suffix: "*",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="4" x2="10" y2="4"/>
        <line x1="14" y1="20" x2="5" y2="20"/>
        <line x1="15" y1="4" x2="9" y2="20"/>
      </svg>
    ),
  },
  "divider",
  // Code
  {
    id: "code", label: "Inline code",
    action: "wrap", prefix: "`", suffix: "`",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    id: "codeblock", label: "Code block",
    action: "wrap", prefix: "```\n", suffix: "\n```",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="18" rx="2"/>
        <line x1="8" y1="9" x2="16" y2="9"/>
        <line x1="8" y1="13" x2="14" y2="13"/>
        <line x1="8" y1="17" x2="10" y2="17"/>
      </svg>
    ),
  },
  "divider",
  // Blocks
  {
    id: "quote", label: "Blockquote",
    action: "line", prefix: ">",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
        <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
      </svg>
    ),
  },
  {
    id: "ul", label: "Bullet list",
    action: "line", prefix: "-",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="6" x2="20" y2="6"/>
        <line x1="9" y1="12" x2="20" y2="12"/>
        <line x1="9" y1="18" x2="20" y2="18"/>
        <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/>
        <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/>
        <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: "ol", label: "Numbered list",
    action: "line", prefix: "1.",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="10" y1="6" x2="21" y2="6"/>
        <line x1="10" y1="12" x2="21" y2="12"/>
        <line x1="10" y1="18" x2="21" y2="18"/>
        <path d="M4 6h1v4"/><path d="M4 10h2"/>
        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
      </svg>
    ),
  },
  "divider",
  // Link, table & rule
  {
    id: "link", label: "Link (Ctrl+K)",
    action: "wrap", prefix: "[", suffix: "](url)",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
  {
    id: "table", label: "Insert table",
    action: "insert", prefix: TABLE_TEMPLATE,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="1.5"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="9" y1="4" x2="9" y2="20"/>
      </svg>
    ),
  },
  {
    id: "hr", label: "Horizontal rule",
    action: "insert", prefix: "\n\n---\n\n",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <line x1="2" y1="12" x2="22" y2="12"/>
      </svg>
    ),
  },
];

// Map id → tool for keyboard shortcut lookup
const TOOL_MAP = Object.fromEntries(
  TOOLS.filter((t): t is Tool => t !== "divider").map((t) => [t.id, t])
);

export default function MarkdownEditor({
  name,
  value,
  onChange,
  disabled = false,
  required = false,
  minRows = 18,
  tab: controlledTab,
  onTabChange,
  images = [],
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [internalTab, setInternalTab] = useState<Tab>("write");
  const tab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wordCount = value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = value.length;

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newValue = value.slice(0, start) + text + value.slice(end);
    onChange(newValue);
    const nextPos = start + text.length;
    setTimeout(() => { el.focus(); el.setSelectionRange(nextPos, nextPos); }, 0);
  }, [value, onChange]);

  const applyTool = useCallback((tool: Tool) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const selected = value.slice(start, end);

    let newValue: string;
    let nextStart: number;
    let nextEnd: number;

    if (tool.action === "insert") {
      newValue   = value.slice(0, start) + tool.prefix + value.slice(end);
      nextStart  = start + tool.prefix.length;
      nextEnd    = nextStart;

    } else if (tool.action === "line") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const marker    = tool.prefix + " ";
      const rest      = value.slice(lineStart);

      if (rest.startsWith(marker)) {
        // Toggle off — strip the prefix
        newValue  = value.slice(0, lineStart) + rest.slice(marker.length);
        nextStart = Math.max(lineStart, start - marker.length);
        nextEnd   = nextStart;
      } else {
        // Toggle on — prepend prefix
        newValue  = value.slice(0, lineStart) + marker + rest;
        nextStart = start + marker.length;
        nextEnd   = nextStart;
      }

    } else {
      // wrap
      const suffix = tool.suffix ?? tool.prefix;
      newValue  = value.slice(0, start) + tool.prefix + selected + suffix + value.slice(end);
      nextStart = start + tool.prefix.length;
      nextEnd   = nextStart + selected.length;
    }

    onChange(newValue);
    // Restore cursor after React re-render
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    }, 0);
  }, [value, onChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === "b") { e.preventDefault(); applyTool(TOOL_MAP.bold); }
    if (ctrl && e.key === "i") { e.preventDefault(); applyTool(TOOL_MAP.italic); }
    if (ctrl && e.key === "k") { e.preventDefault(); applyTool(TOOL_MAP.link); }

    // Tab → insert 2 spaces (keeps keyboard nav inside editor)
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const s  = el.selectionStart;
      onChange(value.slice(0, s) + "  " + value.slice(el.selectionEnd));
      setTimeout(() => { el.focus(); el.setSelectionRange(s + 2, s + 2); }, 0);
    }
  }

  // Fullscreen: Escape to exit + a simple focus trap, mirroring the same
  // state-driven overlay pattern used in components/ui/reader/PDFViewer.tsx.
  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setIsFullscreen(false); return; }
      if (e.key !== "Tab") return;
      const focusables = wrapperRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea",
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  return (
    <div
      ref={wrapperRef}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen || undefined}
      aria-label={isFullscreen ? "Fullscreen content editor" : undefined}
      className={[
        "flex flex-col overflow-hidden border-divider bg-bg-surface shadow-sm transition-all",
        isFullscreen
          ? "fixed inset-0 z-[200] rounded-none border-0"
          : "rounded-xl border",
        !disabled && !isFullscreen
          ? "focus-within:border-brand focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand/10"
          : "",
        disabled ? "opacity-60 pointer-events-none" : "",
      ].join(" ")}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-divider bg-paper px-4 py-2.5">
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span className="text-sm font-semibold text-text-body">
            Content{required && <span className="ml-0.5 text-red-500">*</span>}
          </span>
          <span className="hidden text-xs text-text-muted sm:inline">— Markdown</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Write / Preview tabs */}
          <div className="flex items-center rounded-lg border border-divider bg-bg-surface p-0.5 gap-0.5">
            {(["write", "preview"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold capitalize transition-all cursor-pointer",
                  tab === t
                    ? "bg-brand text-white shadow-sm"
                    : "text-text-muted hover:text-text-body",
                ].join(" ")}
              >
                {t === "write" ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
                {t}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-pressed={isFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition hover:bg-blue-50 hover:text-brand"
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/>
                <path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Toolbar (Write tab only) ─────────────────────────────────── */}
      {tab === "write" && (
        <div
          className="flex items-center gap-0.5 overflow-x-auto border-b border-divider bg-paper px-2 py-1.5"
          style={{ scrollbarWidth: "none" }}
        >
          {TOOLS.map((item, i) =>
            item === "divider" ? (
              <div key={`sep-${i}`} className="mx-1 h-4 w-px shrink-0 bg-divider" />
            ) : (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => applyTool(item)}
                className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded px-1 text-text-muted transition-all hover:bg-blue-50 hover:text-brand active:scale-95 cursor-pointer"
              >
                {item.icon}
              </button>
            )
          )}

          {/* Insert image — popover of already-uploaded cover images */}
          <div className="relative">
            <button
              type="button"
              title="Insert image"
              aria-label="Insert image"
              aria-haspopup="menu"
              aria-expanded={imagePickerOpen}
              onClick={() => setImagePickerOpen((v) => !v)}
              className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded px-1 text-text-muted transition-all hover:bg-blue-50 hover:text-brand active:scale-95 cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="m21 15-5-5L5 21"/>
              </svg>
            </button>
            {imagePickerOpen && (
              <div role="menu" aria-label="Insert image" className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-divider bg-bg-surface p-2 shadow-xl">
                {images.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-text-muted">Upload a cover image first — it will show up here to insert.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {images.map((img, idx) => (
                      <button
                        key={img.url}
                        type="button"
                        role="menuitem"
                        title={img.alt || `Image ${idx + 1}`}
                        aria-label={`Insert ${img.alt || `image ${idx + 1}`}`}
                        onClick={() => {
                          insertAtCursor(`![${img.alt ?? ""}](${img.url})`);
                          setImagePickerOpen(false);
                        }}
                        className="overflow-hidden rounded-lg border border-divider transition hover:border-brand"
                        style={{ aspectRatio: "1/1" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Keyboard shortcuts hint — far right */}
          <div className="ml-auto shrink-0 pl-2">
            <span className="text-[10px] text-text-muted/60 font-mono hidden lg:block">
              Ctrl+B · Ctrl+I · Ctrl+K
            </span>
          </div>
        </div>
      )}

      {/* ── Write pane ──────────────────────────────────────────────── */}
      {tab === "write" && (
        <textarea
          ref={textareaRef}
          name={name}
          required={required}
          rows={minRows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            "Start writing in Markdown…\n\n## Introduction\n\nType your content here. Use **bold**, *italic*, or `code`.\n\n> This is a blockquote — great for highlights.\n\n- Bullet point one\n- Bullet point two"
          }
          className={`block w-full resize-y bg-white px-5 py-4 font-mono text-sm leading-7 text-text-heading outline-none placeholder:text-text-muted/40 disabled:cursor-not-allowed ${isFullscreen ? "flex-1 resize-none" : ""}`}
        />
      )}

      {/* ── Preview pane ────────────────────────────────────────────── */}
      {tab === "preview" && (
        <div className={`bg-white px-6 py-5 ${isFullscreen ? "flex-1 overflow-y-auto" : "min-h-[20rem]"}`}>
          {value.trim() ? (
            <Markdown content={value} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-divider bg-paper">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-text-body">Nothing to preview</p>
              <p className="mt-1 text-xs text-text-muted">Switch to Write and add some content first.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-divider bg-paper px-4 py-1.5">
        <div className="flex items-center gap-2.5 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7"/>
            </svg>
            {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
          </span>
          <span className="text-divider">·</span>
          <span>{charCount.toLocaleString()} chars</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
          <span>Markdown</span>
          <span className="text-divider">·</span>
          <span>Tab = 2 spaces{isFullscreen ? " · Esc to exit" : ""}</span>
        </div>
      </div>
    </div>
  );
}
