"use client";

// components/layout/DigitalLibraryDropdown.tsx
//
// The header's "Digital Library" popover. Same visual language and the same
// accessibility contract as AboutDropdown — navy tile + gold edge in the
// header, solid-navy tile + gold rail on the current page, and each item
// named by its LABEL only (`aria-labelledby`) with the blurb attached as a
// description, so a screen reader hears "Books" rather than a sentence and
// `{ name: /^Books/ }` locators keep matching.
//
// The one difference from About: the last item is an external library. It
// opens in a new tab, says so in its accessible name, and shows the external
// icon where the others show a chevron.

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, ExternalLink, LibraryBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_TRIGGER_CLASS, NAV_TRIGGER_FOCUS_CLASS } from "./nav-chrome";
import {
  DIGITAL_LIBRARY_ITEMS,
  type DigitalLibraryItem,
  isDigitalLibraryItemActive,
  isDigitalLibrarySectionActive,
} from "./digital-library-nav";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const ITEM_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface";

type DigitalLibraryMenuItemProps = {
  item: DigitalLibraryItem;
  active: boolean;
  opensNewTabLabel: string;
  onNavigate: () => void;
};

function DigitalLibraryMenuItem({
  item,
  active,
  opensNewTabLabel,
  onNavigate,
}: DigitalLibraryMenuItemProps) {
  const t = useTranslations("nav");
  const labelId = useId();
  const descriptionId = useId();
  const newTabId = useId();
  const ItemIcon = item.icon;

  const className = cx(
    "group relative flex min-h-12 items-center gap-3 rounded-[10px] py-2 pl-3 pr-2.5 text-left transition-colors duration-150 motion-reduce:transition-none",
    ITEM_FOCUS_CLASS,
    active
      ? "bg-brand/[0.08] ring-1 ring-brand/15 dark:bg-brand/15 dark:ring-brand/25"
      : "hover:bg-paper dark:hover:bg-white/[0.06]",
  );

  const content = (
    <>
      {/* Gold rail: the "you are here" cue shared with the About menu and
          the trigger's own underline. */}
      <span
        aria-hidden="true"
        className={cx(
          "absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full transition-[height,background-color] duration-150 motion-reduce:transition-none",
          active ? "h-7 bg-accent" : "h-0 bg-brand/30 group-hover:h-5",
        )}
      />

      <span
        aria-hidden="true"
        className={cx(
          "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] transition-colors duration-150 motion-reduce:transition-none",
          active
            ? "bg-brand text-brand-contrast shadow-[0_6px_14px_-6px_rgba(30,58,138,0.55)]"
            : "bg-paper text-text-muted group-hover:bg-brand/10 group-hover:text-brand dark:bg-white/[0.06]",
        )}
      >
        {item.imageSrc ? (
          <Image
            src={item.imageSrc}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 object-cover"
          />
        ) : (
          <ItemIcon className="h-[18px] w-[18px]" strokeWidth={2} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          id={labelId}
          className={cx(
            "block break-words text-[14.5px] font-semibold leading-5 transition-colors duration-150 motion-reduce:transition-none",
            active ? "text-brand" : "text-text-heading group-hover:text-brand",
          )}
        >
          {t(item.labelKey)}
        </span>
        <span
          id={descriptionId}
          className="mt-0.5 line-clamp-2 block text-[12px] leading-[1.4] text-text-muted"
        >
          {t(item.descriptionKey)}
        </span>
      </span>

      {item.external ? (
        <>
          <ExternalLink
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-brand motion-reduce:transition-none"
            strokeWidth={2}
          />
          <span id={newTabId} className="sr-only">
            {opensNewTabLabel}
          </span>
        </>
      ) : (
        <ChevronRight
          aria-hidden="true"
          className={cx(
            "h-4 w-4 shrink-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            active
              ? "translate-x-0 text-brand opacity-100"
              : "-translate-x-1 text-text-muted opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
          )}
          strokeWidth={2}
        />
      )}
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-labelledby={`${labelId} ${newTabId}`}
        aria-describedby={descriptionId}
        className={className}
        onClick={onNavigate}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className={className}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

export default function DigitalLibraryDropdown() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const headingId = useId();

  const open = openPath === pathname;
  const active = isDigitalLibrarySectionActive(pathname);
  const close = () => setOpenPath(null);

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

  const internalItems = DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external);
  const externalItems = DIGITAL_LIBRARY_ITEMS.filter((item) => item.external);

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
          // NAV_TRIGGER_CLASS keeps this box in sync with PriorityNav's
          // measuring clones — don't add width-affecting classes here.
          NAV_TRIGGER_CLASS,
          NAV_TRIGGER_FOCUS_CLASS,
          "transition-colors duration-150 motion-reduce:transition-none",
          open || active
            ? "bg-brand/10 text-brand"
            : "text-text-body hover:bg-brand/5 hover:text-text-heading dark:hover:bg-white/[0.06]",
        )}
      >
        <LibraryBig
          className={cx(
            "h-5 w-5 shrink-0",
            open || active ? "text-brand" : "text-text-muted",
          )}
          aria-hidden="true"
          strokeWidth={2}
        />
        <span className="whitespace-nowrap">{t("eResources")}</span>
        <ChevronDown
          className={cx(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
          strokeWidth={2.4}
        />
      </button>

      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-t-md bg-accent"
        />
      )}

      <div
        id={menuId}
        inert={!open}
        aria-hidden={!open}
        className={cx(
          "absolute left-0 top-[calc(100%+7px)] z-[100] w-[344px] max-w-[calc(100vw-2rem)] origin-top-left overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-[0_14px_36px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-black/5",
          "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none dark:shadow-[0_18px_42px_rgba(0,0,0,0.36)]",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1.5 scale-[0.98] opacity-0",
        )}
      >
        {/* Header: navy tile + gold edge, matching the About menu. */}
        <div className="relative flex items-center gap-3 border-b border-divider bg-brand/[0.05] px-4 py-3.5 dark:bg-white/[0.04]">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-0.5 bg-accent"
          />
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-contrast shadow-[0_8px_18px_-8px_rgba(30,58,138,0.7)]"
          >
            <LibraryBig className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p
              id={headingId}
              className="break-words text-[14px] font-bold leading-5 text-text-heading"
            >
              {t("digitalLibraryTitle")}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-5 text-text-muted">
              {t("digitalLibrarySubtitle")}
            </p>
          </div>
        </div>

        <nav aria-labelledby={headingId}>
          <div className="p-2">
            <ul className="space-y-0.5">
              {internalItems.map((item) => (
                <li key={item.href}>
                  <DigitalLibraryMenuItem
                    item={item}
                    active={isDigitalLibraryItemActive(pathname, item)}
                    opensNewTabLabel={t("opensNewTab")}
                    onNavigate={close}
                  />
                </li>
              ))}
            </ul>

            {externalItems.length > 0 && (
              <>
                <p className="flex items-center gap-2.5 px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  <span>{t("digitalLibraryExternalGroup")}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-divider" />
                </p>
                <ul className="space-y-0.5">
                  {externalItems.map((item) => (
                    <li key={item.href}>
                      <DigitalLibraryMenuItem
                        item={item}
                        active={false}
                        opensNewTabLabel={t("opensNewTab")}
                        onNavigate={close}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="border-t border-divider bg-paper/70 p-2 dark:bg-white/[0.03]">
            <Link
              href="/search"
              onClick={close}
              className={cx(
                "group flex min-h-10 items-center justify-between gap-3 rounded-[10px] px-3 text-[13px] font-semibold text-brand transition-colors duration-150 hover:bg-brand/[0.07] motion-reduce:transition-none dark:hover:bg-white/[0.06]",
                ITEM_FOCUS_CLASS,
              )}
            >
              <span className="min-w-0 break-words">{t("digitalLibrarySearchAll")}</span>
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                strokeWidth={2}
              />
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
