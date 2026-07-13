"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, ExternalLink } from "lucide-react";

type CmdIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

export type AdminCommand = {
  id: string;
  label: string;
  /** Section header the command is grouped under, e.g. "Actions" / "Go to". */
  group: string;
  href: string;
  icon: CmdIcon;
  /** Extra search terms (never displayed). */
  keywords?: string;
  /** Opens in a new tab instead of client navigation. */
  external?: boolean;
};

/** Lets the admin header's search control open the palette. */
export type AdminCommandPaletteHandle = { open: () => void };

/**
 * Admin command palette (⌘K / Ctrl+K).
 *
 * A keyboard-first launcher for the whole panel: run a permission-scoped
 * action, jump to any section the administrator can reach, or fall through to
 * an e-book search. It is fed the *already permission-gated* command list from
 * the sidebar, so it can never surface a destination the current role cannot
 * open. Implemented as an accessible combobox → listbox: focus is trapped on
 * the input, options are driven by aria-activedescendant, and Escape / outside
 * click / selection all restore focus to wherever the user opened it from.
 */
const AdminCommandPalette = forwardRef<AdminCommandPaletteHandle, { commands: AdminCommand[] }>(
  function AdminCommandPalette({ commands }, ref) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  useImperativeHandle(ref, () => ({
    open: () => {
      setQuery("");
      setActiveIdx(0);
      setOpen(true);
    },
  }), []);

  /** Close and hand focus back to whatever opened the palette. */
  function close() {
    setOpen(false);
    prevFocus.current?.focus?.();
  }

  // ── Global ⌘K / Ctrl+K toggle ──
  // State resets live in the handler (not an effect) so no cascading renders.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) prevFocus.current?.focus?.();
          return !wasOpen;
        });
        setQuery("");
        setActiveIdx(0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Filtered, flat result list (order preserved: Actions → Go to → Search) ──
  const results = useMemo<AdminCommand[]>(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? commands.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q))
      : commands;
    if (!q) return matched;
    return [
      ...matched,
      {
        id: "__search",
        label: `Search e-books for “${query.trim()}”`,
        group: "Search",
        href: `/admin/manage?q=${encodeURIComponent(query.trim())}`,
        icon: Search,
      },
    ];
  }, [commands, query]);

  // ── Group for display while keeping a stable flat index for keyboard nav ──
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { cmd: AdminCommand; idx: number }[]>();
    results.forEach((cmd, idx) => {
      if (!map.has(cmd.group)) {
        map.set(cmd.group, []);
        order.push(cmd.group);
      }
      map.get(cmd.group)!.push({ cmd, idx });
    });
    return order.map((group) => ({ group, items: map.get(group)! }));
  }, [results]);

  // ── Open-only side effects: remember the trigger, lock scroll, focus input.
  // Purely external-system sync — no setState, so no cascading renders. ──
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${baseId}-opt-${activeIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open, baseId]);

  function activate(cmd: AdminCommand | undefined) {
    if (!cmd) return;
    setOpen(false);
    if (cmd.external) {
      window.open(cmd.href, "_blank", "noopener,noreferrer");
    } else {
      router.push(cmd.href);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(results[activeIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Single focus stop — trap focus on the input (options are activedescendant).
      e.preventDefault();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh] pb-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Scrim — click-transparent so the wrapper's outside-click handler fires. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-slate-900/40 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        style={{ maxHeight: "min(70vh, 560px)" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 border-b border-divider px-4">
          <Search className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={results.length ? `${baseId}-opt-${activeIdx}` : undefined}
            aria-label="Search actions and pages"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search actions, pages, e-books…"
            className="h-14 w-full bg-transparent text-[15px] text-text-heading outline-none placeholder:text-text-muted"
          />
          <kbd className="hidden shrink-0 rounded-md border border-divider bg-paper px-1.5 py-0.5 font-sans text-[10px] font-medium text-text-muted sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div id={listboxId} role="listbox" aria-label="Commands" className="overflow-y-auto overscroll-contain py-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-muted">
              No matches for “{query.trim()}”.
            </p>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="mb-1 last:mb-0">
                <div className="px-4 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-widest text-text-muted">
                  {group}
                </div>
                {items.map(({ cmd, idx }) => {
                  const Icon = cmd.icon;
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={cmd.id}
                      id={`${baseId}-opt-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      tabIndex={-1}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        activate(cmd);
                      }}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                        isActive ? "bg-brand/[0.06]" : "hover:bg-paper"
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${
                          isActive ? "bg-brand/10 text-brand ring-brand/15" : "bg-paper text-text-muted ring-divider"
                        }`}
                        aria-hidden="true"
                      >
                        <Icon className="h-[17px] w-[17px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-heading">
                        {cmd.label}
                      </span>
                      {cmd.external ? (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                      ) : (
                        isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-divider bg-paper px-4 py-2.5 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-sans">↑</kbd>
            <kbd className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-sans">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-sans">↵</kbd>
            open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-sans">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
});

export default AdminCommandPalette;
