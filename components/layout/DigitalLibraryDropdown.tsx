"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ExternalLink, LibraryBig } from "lucide-react";
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
  const ItemIcon = item.icon;

  const className = cx(
    "group relative flex min-h-14 items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
    active
      ? "bg-brand/10 text-brand ring-1 ring-brand/15"
      : "text-text-body hover:bg-paper hover:text-brand dark:hover:bg-white/[0.06]",
  );

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "absolute left-0 top-2.5 h-[calc(100%-20px)] w-[3px] rounded-r-full",
          active ? "bg-brand" : "bg-transparent",
        )}
      />
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 motion-reduce:transition-none",
          active
            ? "bg-brand/15 text-brand"
            : "bg-paper text-text-muted group-hover:bg-brand/10 group-hover:text-brand dark:bg-white/[0.06]",
        )}
      >
        {item.imageSrc ? (
          <Image
            src={item.imageSrc}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover"
          />
        ) : (
          <ItemIcon className="h-5 w-5" strokeWidth={2} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            "block text-[14.5px] font-semibold leading-5 text-text-heading",
            active && "text-brand",
          )}
        >
          {t(item.labelKey)}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-text-muted">
          {t(item.descriptionKey)}
        </span>
      </span>
      {item.external && (
        <span className="mt-1 flex shrink-0 items-center text-text-muted group-hover:text-brand">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only"> {opensNewTabLabel}</span>
        </span>
      )}
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
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
      href={item.href}
      aria-current={active ? "page" : undefined}
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
          "absolute left-0 top-[calc(100%+7px)] z-[100] w-[336px] max-w-[calc(100vw-2rem)] origin-top-left rounded-[14px] border border-divider bg-bg-surface p-2 shadow-[0_14px_36px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-black/5",
          "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none dark:shadow-[0_18px_42px_rgba(0,0,0,0.36)]",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1.5 opacity-0",
        )}
      >
        <div className="px-3 py-2.5">
          <p
            id={headingId}
            className="text-[13px] font-bold uppercase tracking-[0.08em] text-text-heading"
          >
            {t("digitalLibraryTitle")}
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-text-muted">
            {t("digitalLibrarySubtitle")}
          </p>
        </div>

        <nav aria-labelledby={headingId}>
          <ul className="space-y-1">
            {DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external).map(
              (item) => (
                <li key={item.href}>
                  <DigitalLibraryMenuItem
                    item={item}
                    active={isDigitalLibraryItemActive(pathname, item)}
                    opensNewTabLabel={t("opensNewTab")}
                    onNavigate={() => setOpenPath(null)}
                  />
                </li>
              ),
            )}
          </ul>

          <div className="my-2 h-px bg-divider" />

          <ul>
            {DIGITAL_LIBRARY_ITEMS.filter((item) => item.external).map(
              (item) => (
                <li key={item.href}>
                  <DigitalLibraryMenuItem
                    item={item}
                    active={false}
                    opensNewTabLabel={t("opensNewTab")}
                    onNavigate={() => setOpenPath(null)}
                  />
                </li>
              ),
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}
