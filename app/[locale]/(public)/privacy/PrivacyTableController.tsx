"use client";

// app/[locale]/(public)/privacy/PrivacyTableController.tsx
//
// Filtering and row expansion for the data-practice table.
//
// THE TABLE IS NOT RENDERED HERE. It arrives as `children`, fully
// server-rendered, and this component attaches behaviour to it. Two reasons,
// and both are load-bearing:
//
//   1. Ten rows × seven translated cells, twice (table + mobile cards), is the
//      single largest block of text on the page. Passing it through a client
//      component would serialise every string into the RSC flight payload as
//      well as the HTML — the same bytes, paid for twice, in a locale whose
//      catalogue is already the larger of the two.
//   2. A table that only exists after hydration is a table that is not in the
//      HTML: no rows for a crawler, nothing to print from a cold cache, and
//      nothing at all for a reader whose JS failed. The filter is an
//      enhancement on top of a complete document, never the thing that
//      produces it.
//
// So there is NO React state here. The controls are server-rendered
// `<button aria-pressed>`s, the active one is styled from that attribute by
// CSS, and this component only ever sets attributes — which also means a
// filter change never re-renders anything and never re-flows the table.
//
// The one rule the filter must obey lives in lib/privacy/policy.ts
// (`rowMatchesFilter`). It is imported rather than re-implemented, so the
// print stylesheet, the server and this listener cannot disagree about which
// rows belong to "Shared".

import { useEffect, useRef, type ReactNode } from "react";
import {
  parsePrivacyFilter,
  rowMatchesFilter,
  type PrivacyFilter,
  type PrivacyRowMeta,
} from "@/lib/privacy/policy";

export default function PrivacyTableController({
  statusTemplate,
  children,
}: {
  /**
   * The announced status, as a TEMPLATE with `{shown}` and `{total}` still in
   * it — e.g. "Showing {shown} of {total} categories".
   *
   * A formatter function would be the obvious prop here, and it cannot be one:
   * this is a client component, the caller is a server component, and a
   * function is not serialisable across that boundary — React refuses it at
   * runtime rather than at build time, so the whole table renders into the
   * error boundary. The string crosses fine and the substitution is two
   * numbers.
   */
  statusTemplate: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const status = root.querySelector<HTMLElement>("[data-filter-status]");
    const empty = root.querySelector<HTMLElement>("[data-filter-empty]");

    /** Reconstruct a row's classification from the attributes the server put
     *  on it, so the shared predicate can decide. */
    const metaOf = (el: HTMLElement): PrivacyRowMeta => ({
      visibility: (el.dataset.visibility ?? "steward") as PrivacyRowMeta["visibility"],
      source: (el.dataset.source ?? "you") as PrivacyRowMeta["source"],
      retention: (el.dataset.retention ?? "long") as PrivacyRowMeta["retention"],
    });

    function apply(filter: PrivacyFilter) {
      const rows = Array.from(root!.querySelectorAll<HTMLElement>("[data-filter-row]"));
      let shown = 0;

      for (const row of rows) {
        const visible = rowMatchesFilter(metaOf(row), filter);
        row.hidden = !visible;
        // A detail belongs to the category above it: hiding a category must
        // take its expanded detail with it, or an orphaned detail is left
        // floating under a different category. The handle is scoped to the
        // surface, because the desktop table and the mobile cards render the
        // same ten categories and an unscoped id would match the wrong copy.
        if (!visible) {
          const key = `${row.dataset.rowId}:${row.dataset.surface}`;
          const detail = root!.querySelector<HTMLElement>(`[data-detail-for="${key}"]`);
          if (detail) detail.hidden = true;
          root!
            .querySelector<HTMLElement>(`[data-row-toggle="${key}"]`)
            ?.setAttribute("aria-expanded", "false");
        }
        // The desktop table and the mobile card list are two renderings of the
        // same ten categories, so only one of them is on screen — count once.
        if (visible && row.dataset.surface === "table") shown++;
      }

      const total = rows.filter((r) => r.dataset.surface === "table").length;
      if (status) {
        status.textContent = statusTemplate
          .replace("{shown}", String(shown))
          .replace("{total}", String(total));
      }
      if (empty) empty.hidden = shown > 0;

      for (const btn of root!.querySelectorAll<HTMLElement>("[data-filter]")) {
        btn.setAttribute("aria-pressed", String(btn.dataset.filter === filter));
      }
    }

    /** Write the filter into the URL so the view is shareable and survives a
     *  reload. `replaceState`, not a router push: this page is prerendered and
     *  a navigation would round-trip to the server to re-render markup that is
     *  already correct — and it would push a history entry per chip, so Back
     *  would walk the reader through their own filtering instead of leaving
     *  the page. */
    function syncUrl(filter: PrivacyFilter) {
      const url = new URL(window.location.href);
      if (filter === "all") url.searchParams.delete("filter");
      else url.searchParams.set("filter", filter);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;

      const chip = target?.closest<HTMLElement>("[data-filter]");
      if (chip && root.contains(chip)) {
        const filter = parsePrivacyFilter(chip.dataset.filter);
        apply(filter);
        syncUrl(filter);
        return;
      }

      const toggle = target?.closest<HTMLElement>("[data-row-toggle]");
      if (toggle && root.contains(toggle)) {
        const detail = root.querySelector<HTMLElement>(
          `[data-detail-for="${toggle.dataset.rowToggle}"]`,
        );
        if (!detail) return;
        const open = detail.hidden;
        detail.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
      }
    };

    /**
     * Escape collapses an expanded detail — from INSIDE the panel, and from
     * the toggle that opened it. Both matter: after clicking Details the
     * reader's focus is still on the button, so handling only the panel means
     * Escape does nothing at the exact moment it is most likely to be pressed.
     *
     * Focus is then returned to the toggle, because collapsing a panel while
     * focus is inside it strands a keyboard reader on a hidden node.
     */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;

      const handle =
        target?.closest<HTMLElement>("[data-detail-for]")?.dataset.detailFor ??
        target?.closest<HTMLElement>("[data-row-toggle]")?.dataset.rowToggle;
      if (!handle) return;

      const detail = root.querySelector<HTMLElement>(`[data-detail-for="${handle}"]`);
      if (!detail || detail.hidden) return;

      detail.hidden = true;
      const toggle = root.querySelector<HTMLElement>(`[data-row-toggle="${handle}"]`);
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.focus();
    };

    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKeyDown);

    // Restore the filter the URL asked for. Anything unrecognised reads as
    // "all", so a hand-edited link shows the whole table rather than none of
    // it. Runs after paint, so the server's complete table is what the reader
    // sees first and the filter narrows it — never a flash of an empty table.
    const initial = parsePrivacyFilter(
      new URLSearchParams(window.location.search).get("filter"),
    );
    apply(initial);

    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeyDown);
    };
    // The template is read straight from the prop rather than through a ref.
    // Mirroring a prop into a ref during render is a write during render, and
    // it buys nothing here: this string is fixed for the life of the page, so
    // listing it as a dependency means the effect re-runs never.
  }, [statusTemplate]);

  return (
    <div ref={ref} className="policy-filterable">
      {children}
    </div>
  );
}
