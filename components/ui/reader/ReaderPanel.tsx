"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

export type PanelTabId = "pages" | "outline" | "bookmarks" | "search" | "annotations";

export type PanelTab = { id: PanelTabId; label: string; icon: ReactNode };

/* The reader navigation panel. Desktop (md+): an in-flow side column beside
   the document — the page re-fits to the narrower viewport, which the
   focal-point effect anchors on the page being read. Phones: a bottom sheet
   over the document, modal, focus-trapped, dismissed by the scrim, the ✕ or
   Escape (the viewer's global handler). Tabs are a real tablist. */
export default function ReaderPanel({
  open,
  tab,
  tabs,
  onSelectTab,
  onClose,
  isDesktop,
  children,
}: {
  open: boolean;
  tab: PanelTabId;
  tabs: PanelTab[];
  onSelectTab: (id: PanelTabId) => void;
  onClose: () => void;
  isDesktop: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("reader");
  const baseId = useId();
  // The search tab owns its own initial focus (the field); every other tab
  // starts on the tab strip.
  const trapRef = useFocusTrap<HTMLDivElement>(open && !isDesktop, {
    initialFocus: tab === "search" ? "#ptec-reader-search" : undefined,
  });
  const tabRefs = useRef<Map<PanelTabId, HTMLButtonElement>>(new Map());

  // Keep the tab bar keyboard-navigable per the WAI-ARIA tabs pattern.
  const onTabKey = (e: React.KeyboardEvent) => {
    const ids = tabs.map((x) => x.id);
    const at = ids.indexOf(tab);
    let next: PanelTabId | null = null;
    if (e.key === "ArrowRight") next = ids[(at + 1) % ids.length];
    else if (e.key === "ArrowLeft") next = ids[(at - 1 + ids.length) % ids.length];
    else if (e.key === "Home") next = ids[0];
    else if (e.key === "End") next = ids[ids.length - 1];
    if (!next) return;
    e.preventDefault();
    onSelectTab(next);
    tabRefs.current.get(next)?.focus();
  };

  // Desktop panel: nothing traps focus, but a freshly opened panel should be
  // reachable — move focus to the active tab once.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && isDesktop && tab !== "search") {
      const raf = requestAnimationFrame(() => tabRefs.current.get(tab)?.focus());
      wasOpen.current = true;
      return () => cancelAnimationFrame(raf);
    }
    wasOpen.current = open;
  }, [open, isDesktop, tab]);

  if (!open) return null;

  const tabBar = (
    <div className="reader-line-b flex items-center gap-1 px-2 py-1.5">
      <div role="tablist" aria-label={t("panelLabel")} className="flex min-w-0 flex-1 items-center gap-0.5" onKeyDown={onTabKey}>
        {tabs.map((x) => (
          <button
            key={x.id}
            ref={(el) => {
              if (el) tabRefs.current.set(x.id, el);
              else tabRefs.current.delete(x.id);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === x.id ? 0 : -1}
            aria-label={x.label}
            title={x.label}
            onClick={() => onSelectTab(x.id)}
            className="reader-tab"
          >
            {x.icon}
            <span className="sr-only lg:not-sr-only">{x.label}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} aria-label={t("close")} className="reader-btn">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );

  const body = (
    <div
      role="tabpanel"
      id={`${baseId}-panel`}
      aria-labelledby={`${baseId}-tab-${tab}`}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
    >
      {children}
    </div>
  );

  if (isDesktop) {
    return (
      <aside
        data-reader-overlay
        aria-label={t("panelLabel")}
        className="reader-surface flex h-full w-[300px] shrink-0 flex-col border-r lg:w-[340px]"
        style={{ paddingTop: "var(--reader-inset-top)", paddingBottom: "var(--reader-inset-bottom)" }}
      >
        {tabBar}
        {body}
      </aside>
    );
  }

  return (
    <div data-reader-overlay className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="reader-scrim absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("panelLabel")}
        tabIndex={-1}
        className="reader-surface relative flex max-h-[78%] flex-col rounded-t-2xl border-t shadow-2xl outline-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full" style={{ background: "var(--reader-line)" }} aria-hidden />
        {tabBar}
        {body}
      </div>
    </div>
  );
}
