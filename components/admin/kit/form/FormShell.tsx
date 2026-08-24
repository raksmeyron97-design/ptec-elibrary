"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useWideContext } from "./use-wide-context";

/**
 * The Split-Context Card: a centred 840px form card, with a 380px sticky
 * context sidebar beside it once the viewport can afford one.
 *
 * The shell owns the `<form>` element rather than sitting outside it. That is
 * the whole reason this contract has slots instead of just `children`: the
 * action bar's buttons are real `type="submit"` buttons, so they must be inside
 * the form — while the context sidebar must be *outside* the 840px card, beside
 * it. Only a component that renders both can put each in the right place, and
 * it can only render the context panel once (see `useWideContext` for why once
 * matters).
 *
 * Below 1440px the context panel inlines at the end of the tab panel, where it
 * reads as the last thing in the section rather than a stranded aside.
 */
export default function FormShell({
  backHref,
  backLabel,
  title,
  description,
  headerActions,
  tabs,
  context,
  actions,
  contentKey,
  onSubmit,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: React.ReactNode;
  description?: string;
  /** Right-aligned affordances on the card's header row. */
  headerActions?: React.ReactNode;
  /** The tab row. Rendered flush to the card edges so its rule spans them. */
  tabs?: React.ReactNode;
  /**
   * Contextual panel for the active tab — SEO preview, validation status, a
   * live card preview. Sidebar at ≥1440px, inline below the fields otherwise.
   */
  context?: React.ReactNode;
  /** The floating action bar (a `StickyActionBar`), rendered at the card foot. */
  actions?: React.ReactNode;
  /**
   * The active tab's key. Changing it replays the panel's entrance animation.
   *
   * Deliberately NOT used as a React `key` on the panel wrapper, which would be
   * the obvious way to restart a CSS animation: the publication and team forms
   * keep every panel mounted (`hidden` on the inactive ones) so uncontrolled
   * field values survive a tab switch, and remounting the wrapper would wipe
   * every one of them. The animation is retriggered imperatively instead — see
   * the effect below.
   */
  contentKey?: string;
  /** When given, the card is a `<form>` and submit buttons in `actions` work. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  const wide = useWideContext();
  const panelRef = useRef<HTMLDivElement>(null);

  /*
    Restart the entrance animation without remounting the children. Removing the
    class, forcing a reflow, then re-adding it is the only way to replay a CSS
    animation on an element that is not being recreated. Under
    prefers-reduced-motion the rule is `animation: none !important`, so this is
    inert rather than needing its own guard.
  */
  useEffect(() => {
    const el = panelRef.current;
    if (!el || contentKey === undefined) return;
    el.classList.remove("tab-panel-in");
    void el.offsetWidth;
    el.classList.add("tab-panel-in");
  }, [contentKey]);

  const CARD_CLASS =
    "w-full min-w-0 border-y border-divider bg-bg-surface shadow-sm sm:rounded-xl sm:border min-[1440px]:w-[840px] min-[1440px]:shrink-0";

  /*
    Two branches rather than a dynamic tag. `<Card onSubmit={…}>` where Card is
    "form" | "div" widens the handler to a div's SubmitEvent and stops type
    checking, and the point of taking `onSubmit` at all is that the submit
    buttons in `actions` are typed against a real form.
  */
  const inner = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-6 sm:px-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-text-heading">{title}</h1>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>

      {tabs}

      <div ref={panelRef} className="tab-panel-in px-5 py-6 sm:px-8">
        {children}
        {/* Inline context, below the fields it describes. */}
        {context && !wide && <div className="mt-8 border-t border-divider pt-6">{context}</div>}
      </div>

      {actions}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[840px] pb-4 min-[1440px]:max-w-[1252px]">
      {/* Breadcrumb sits outside the card: it is navigation away from this page,
          not part of the record being edited. Plain next/link — /admin is
          outside the locale scheme and i18n/navigation would add a /km prefix. */}
      <Link
        href={backHref}
        className="focus-field mb-4 ml-4 inline-flex items-center gap-2 rounded text-sm font-medium text-text-muted transition hover:text-text-heading sm:ml-0"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>

      <div className="flex flex-col items-start gap-8 min-[1440px]:flex-row">
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate className={CARD_CLASS}>
            {inner}
          </form>
        ) : (
          <div className={CARD_CLASS}>{inner}</div>
        )}

        {context && wide && (
          <aside className="sticky top-6 w-[380px] shrink-0" aria-label="Context for the current section">
            {context}
          </aside>
        )}
      </div>
    </div>
  );
}
