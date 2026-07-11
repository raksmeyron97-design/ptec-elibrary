"use client";

// Priority+ primary navigation (desktop, lg+).
//
// Layout contract with Navbar.tsx: this is the middle `minmax(0, 1fr)` grid
// zone. It may shrink to any width — items that no longer fit collapse, in
// reverse order, into a trailing "More" menu, so the actions zone (search,
// bell, avatar) is never pushed off-viewport in any locale.
//
// Measurement strategy: an invisible in-flow measuring row renders a clone of
// every trigger (same NAV_TRIGGER_CLASS box), giving natural widths for all
// items even while some are display:none. Because the measuring row stays in
// flow, the zone's intrinsic max-content width is stable regardless of how
// many items are collapsed — this keeps the scrolled "pill" mode (whose shell
// is w-fit) from feeding its own width back into the collapse computation.
// A ResizeObserver on the zone (container resizes, zoom) and on the measuring
// row (webfont loads change label widths) drives recomputation.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ExternalLink,
  Info,
  LibraryBig,
  MoreHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_TRIGGER_CLASS, NAV_TRIGGER_FOCUS_CLASS } from "./nav-chrome";
import { computeVisibleCount } from "./priority-nav-core";
import DigitalLibraryDropdown from "./DigitalLibraryDropdown";
import AboutDropdown from "./AboutDropdown";
import {
  DIGITAL_LIBRARY_ITEMS,
  isDigitalLibraryItemActive,
  isDigitalLibrarySectionActive,
  isRouteSegmentActive,
} from "./digital-library-nav";
import {
  ABOUT_NAV_ITEMS,
  isAboutItemActive,
  isAboutSectionActive,
} from "./about-nav";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type PriorityNavLinkEntry = {
  kind: "link";
  href: string;
  label: string;
  icon: ReactNode;
};

export type PriorityNavEntry =
  | PriorityNavLinkEntry
  | { kind: "digitalLibrary" }
  | { kind: "about" };

function isEntryActive(entry: PriorityNavEntry, pathname: string) {
  switch (entry.kind) {
    case "link":
      return isRouteSegmentActive(pathname, entry.href);
    case "digitalLibrary":
      return isDigitalLibrarySectionActive(pathname);
    case "about":
      return isAboutSectionActive(pathname);
  }
}

function ActiveUnderline() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-2 right-2 h-[3px] rounded-t-md bg-accent"
    />
  );
}

// ── Measuring clones ─────────────────────────────────────────────────────────
// Must mirror the real triggers' box exactly: same NAV_TRIGGER_CLASS, same
// icon sizes, same gaps. Link clones use font-semibold (the active-state
// weight) so the measured width covers the widest state.

function EntryClone({ entry }: { entry: PriorityNavEntry }) {
  const t = useTranslations("nav");
  if (entry.kind === "link") {
    return (
      <span className={cx(NAV_TRIGGER_CLASS, "font-semibold")}>
        <span className="shrink-0 text-[18px]">{entry.icon}</span>
        {entry.label}
      </span>
    );
  }
  const IconComponent = entry.kind === "digitalLibrary" ? LibraryBig : Info;
  const label = entry.kind === "digitalLibrary" ? t("eResources") : t("about");
  return (
    <span className={NAV_TRIGGER_CLASS}>
      <IconComponent className="h-5 w-5 shrink-0" strokeWidth={2} />
      <span className="whitespace-nowrap">{label}</span>
      <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.4} />
    </span>
  );
}

// ── "More" overflow menu ─────────────────────────────────────────────────────

type MoreMenuRowProps = {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  external?: boolean;
  opensNewTabLabel?: string;
  onNavigate: () => void;
};

function MoreMenuRow({
  href,
  label,
  icon,
  active,
  external,
  opensNewTabLabel,
  onNavigate,
}: MoreMenuRowProps) {
  const className = cx(
    "group relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[14.5px] font-medium transition-colors duration-150 motion-reduce:transition-none",
    NAV_TRIGGER_FOCUS_CLASS,
    active
      ? "bg-brand/10 text-brand ring-1 ring-brand/15"
      : "text-text-body hover:bg-paper hover:text-brand dark:hover:bg-white/[0.06]",
  );

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "flex h-5 w-5 shrink-0 items-center justify-center",
          active ? "text-brand" : "text-text-muted group-hover:text-brand",
        )}
      >
        {icon}
      </span>
      <span className={cx("min-w-0 flex-1 truncate", active && "font-semibold")}>
        {label}
      </span>
      {external && (
        <span className="flex shrink-0 items-center text-text-muted group-hover:text-brand">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only"> {opensNewTabLabel}</span>
        </span>
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onNavigate}
      >
        {content}
      </a>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={className}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

function MoreGroupHeading({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
      {children}
    </p>
  );
}

function MoreMenu({ entries }: { entries: PriorityNavEntry[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // Keyed to the pathname so navigating closes the menu automatically —
  // same pattern as AboutDropdown / DigitalLibraryDropdown.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const open = openPath === pathname;
  const active = entries.some((entry) => isEntryActive(entry, pathname));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPath(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenPath(null);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpenPath(null);

  return (
    <div ref={rootRef} className="relative flex h-full items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() =>
          setOpenPath((value) => (value === pathname ? null : pathname))
        }
        className={cx(
          NAV_TRIGGER_CLASS,
          NAV_TRIGGER_FOCUS_CLASS,
          "transition-colors duration-150 motion-reduce:transition-none",
          open || active
            ? "bg-brand/10 text-brand"
            : "text-text-body hover:bg-brand/5 hover:text-text-heading dark:hover:bg-white/[0.06]",
        )}
      >
        <MoreHorizontal
          className={cx(
            "h-5 w-5 shrink-0",
            open || active ? "text-brand" : "text-text-muted",
          )}
          aria-hidden="true"
          strokeWidth={2}
        />
        <span className="whitespace-nowrap">{t("more")}</span>
        <ChevronDown
          className={cx(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
          strokeWidth={2.4}
        />
      </button>

      {active && <ActiveUnderline />}

      <div
        id={menuId}
        inert={!open}
        aria-hidden={!open}
        className={cx(
          "absolute right-0 top-[calc(100%+7px)] z-[100] max-h-[min(70vh,560px)] w-[300px] max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto rounded-[14px] border border-divider bg-bg-surface p-2 shadow-[0_14px_36px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-black/5",
          "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none dark:shadow-[0_18px_42px_rgba(0,0,0,0.36)]",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1.5 opacity-0",
        )}
      >
        <nav aria-label={t("more")}>
          <ul className="space-y-1">
            {entries.map((entry, index) => {
              if (entry.kind === "link") {
                return (
                  <li key={entry.href}>
                    <MoreMenuRow
                      href={entry.href}
                      label={entry.label}
                      icon={entry.icon}
                      active={isRouteSegmentActive(pathname, entry.href)}
                      onNavigate={close}
                    />
                  </li>
                );
              }
              if (entry.kind === "digitalLibrary") {
                return (
                  <li key="digitalLibrary">
                    {index > 0 && <div className="my-2 h-px bg-divider" />}
                    <MoreGroupHeading>
                      {t("digitalLibraryTitle")}
                    </MoreGroupHeading>
                    <ul className="space-y-1">
                      {DIGITAL_LIBRARY_ITEMS.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <li key={item.href}>
                            <MoreMenuRow
                              href={item.href}
                              label={t(item.labelKey)}
                              icon={
                                <ItemIcon
                                  className="h-[18px] w-[18px]"
                                  strokeWidth={2}
                                />
                              }
                              active={isDigitalLibraryItemActive(
                                pathname,
                                item,
                              )}
                              external={item.external}
                              opensNewTabLabel={t("opensNewTab")}
                              onNavigate={close}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              }
              return (
                <li key="about">
                  {index > 0 && <div className="my-2 h-px bg-divider" />}
                  <MoreGroupHeading>{t("aboutDropdownTitle")}</MoreGroupHeading>
                  <ul className="space-y-1">
                    {ABOUT_NAV_ITEMS.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <li key={item.href}>
                          <MoreMenuRow
                            href={item.href}
                            label={t(item.labelKey)}
                            icon={
                              <ItemIcon
                                className="h-[18px] w-[18px]"
                                strokeWidth={2}
                              />
                            }
                            active={isAboutItemActive(pathname, item)}
                            onNavigate={close}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

// ── Priority+ nav ────────────────────────────────────────────────────────────

export default function PriorityNav({
  entries,
}: {
  entries: PriorityNavEntry[];
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const cloneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const moreCloneRef = useRef<HTMLDivElement>(null);
  // SSR renders every item; the real row is overflow-clipped until the first
  // client measurement so pre-hydration wide locales can't push the actions
  // zone off-screen.
  const [visibleCount, setVisibleCount] = useState(entries.length);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const measureRow = measureRowRef.current;
    if (!root || !measureRow) return;

    const recompute = () => {
      const available = root.clientWidth;
      if (available <= 0) return; // display:none below lg
      const widths = entries.map((_, index) => {
        const clone = cloneRefs.current[index];
        return clone ? clone.getBoundingClientRect().width : 0;
      });
      const moreWidth =
        moreCloneRef.current?.getBoundingClientRect().width ?? 0;
      setVisibleCount(computeVisibleCount(widths, moreWidth, available));
      setMeasured(true);
    };

    const observer = new ResizeObserver(recompute);
    observer.observe(root); // container width: resizes, zoom, pill mode
    observer.observe(measureRow); // natural widths: webfont loads, locale
    recompute();
    return () => observer.disconnect();
  }, [entries]);

  const overflowEntries = entries.slice(visibleCount);

  return (
    <div
      ref={rootRef}
      className="relative hidden h-full min-w-0 self-stretch lg:block"
    >
      {/* Invisible in-flow measuring row (see file header). The More clone is
          absolutely positioned so it's measurable without inflating the
          zone's intrinsic width when everything fits. */}
      <div
        aria-hidden="true"
        inert
        className="invisible relative h-0 overflow-hidden"
      >
        <div ref={measureRowRef} className="flex w-max items-center">
          {entries.map((entry, index) => (
            <div
              key={index}
              ref={(el) => {
                cloneRefs.current[index] = el;
              }}
              className="shrink-0"
            >
              <EntryClone entry={entry} />
            </div>
          ))}
        </div>
        <div ref={moreCloneRef} className="absolute left-0 top-0">
          <span className={NAV_TRIGGER_CLASS}>
            <MoreHorizontal className="h-5 w-5 shrink-0" strokeWidth={2} />
            <span className="whitespace-nowrap">{t("more")}</span>
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.4} />
          </span>
        </div>
      </div>

      {/* Real row */}
      <nav
        aria-label="Primary"
        className={cx(
          "flex h-full items-center",
          !measured && "overflow-x-hidden",
        )}
      >
        {entries.map((entry, index) => {
          const hidden = index >= visibleCount;
          if (entry.kind === "link") {
            const linkActive = isRouteSegmentActive(pathname, entry.href);
            return (
              <div
                key={entry.href}
                className={cx(
                  "relative flex h-full shrink-0 items-center",
                  hidden && "hidden",
                )}
              >
                <Link
                  href={entry.href}
                  aria-current={linkActive ? "page" : undefined}
                  className={cx(
                    NAV_TRIGGER_CLASS,
                    NAV_TRIGGER_FOCUS_CLASS,
                    "transition-colors duration-150 motion-reduce:transition-none",
                    linkActive
                      ? "font-semibold text-brand"
                      : "text-text-body hover:bg-brand/5 hover:text-text-heading dark:hover:bg-white/[0.06]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "shrink-0 text-[18px]",
                      linkActive ? "text-brand" : "text-text-muted",
                    )}
                  >
                    {entry.icon}
                  </span>
                  {entry.label}
                </Link>
                {linkActive && <ActiveUnderline />}
              </div>
            );
          }
          return (
            <div
              key={entry.kind}
              className={cx(
                "relative flex h-full shrink-0 items-center",
                hidden && "hidden",
              )}
            >
              {entry.kind === "digitalLibrary" ? (
                <DigitalLibraryDropdown />
              ) : (
                <AboutDropdown />
              )}
            </div>
          );
        })}

        <div
          className={cx(
            "relative flex h-full shrink-0 items-center",
            overflowEntries.length === 0 && "hidden",
          )}
        >
          <MoreMenu entries={overflowEntries} />
        </div>
      </nav>
    </div>
  );
}
