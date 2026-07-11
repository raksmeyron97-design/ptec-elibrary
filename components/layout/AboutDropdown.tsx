"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_TRIGGER_CLASS, NAV_TRIGGER_FOCUS_CLASS } from "./nav-chrome";
import {
  ABOUT_NAV_ITEMS,
  type AboutNavGroup,
  type AboutNavItem,
  isAboutItemActive,
  isAboutSectionActive,
} from "./about-nav";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const ABOUT_GROUPS = [
  { id: "general", labelKey: "aboutGroupGeneral" },
  { id: "library", labelKey: "aboutGroupLibraryInfo" },
] satisfies Array<{ id: AboutNavGroup; labelKey: "aboutGroupGeneral" | "aboutGroupLibraryInfo" }>;

type AboutMenuItemProps = {
  item: AboutNavItem;
  active: boolean;
  onNavigate: () => void;
};

function AboutMenuItem({ item, active, onNavigate }: AboutMenuItemProps) {
  const t = useTranslations("nav");
  const ItemIcon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex min-h-12 items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] font-medium transition-colors duration-150 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
        active
          ? "bg-brand/10 text-brand ring-1 ring-brand/15"
          : "text-text-body hover:bg-paper hover:text-brand dark:hover:bg-white/[0.06]",
      )}
      onClick={onNavigate}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute left-0 top-2.5 h-[calc(100%-20px)] w-[3px] rounded-r-full",
          active ? "bg-brand" : "bg-transparent",
        )}
      />
      <ItemIcon
        className={cx(
          "h-5 w-5 shrink-0",
          active ? "text-brand" : "text-text-muted group-hover:text-brand",
        )}
        aria-hidden="true"
        strokeWidth={2}
      />
      <span
        className={cx(
          "min-w-0 flex-1 break-words text-text-heading",
          active && "font-semibold text-brand",
        )}
      >
        {t(item.labelKey)}
      </span>
    </Link>
  );
}

export default function AboutDropdown() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const headingId = useId();

  const open = openPath === pathname;
  const active = isAboutSectionActive(pathname);

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
        <Info
          className={cx(
            "h-5 w-5 shrink-0",
            open || active ? "text-brand" : "text-text-muted",
          )}
          aria-hidden="true"
          strokeWidth={2}
        />
        <span className="whitespace-nowrap">{t("about")}</span>
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
          "absolute left-0 top-[calc(100%+7px)] z-[100] w-[316px] max-w-[calc(100vw-2rem)] origin-top-left rounded-[14px] border border-divider bg-bg-surface p-2 shadow-[0_14px_36px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-black/5",
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
            {t("aboutDropdownTitle")}
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-text-muted">
            {t("aboutDropdownSubtitle")}
          </p>
        </div>

        <nav aria-labelledby={headingId}>
          {ABOUT_GROUPS.map((group, index) => (
            <div key={group.id} className={index === 0 ? "" : "mt-2"}>
              {index > 0 && <div className="mb-2 h-px bg-divider" />}
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                {t(group.labelKey)}
              </p>
              <ul className="space-y-1">
                {ABOUT_NAV_ITEMS.filter((item) => item.group === group.id).map(
                  (item) => (
                    <li key={item.href}>
                      <AboutMenuItem
                        item={item}
                        active={isAboutItemActive(pathname, item)}
                        onNavigate={() => setOpenPath(null)}
                      />
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
