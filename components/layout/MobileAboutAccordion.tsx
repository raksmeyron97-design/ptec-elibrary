"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ABOUT_NAV_ITEMS,
  isAboutItemActive,
  isAboutSectionActive,
} from "./about-nav";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type MobileAboutAccordionProps = {
  pathname: string;
  onNavigate: () => void;
};

export default function MobileAboutAccordion({
  pathname,
  onNavigate,
}: MobileAboutAccordionProps) {
  const t = useTranslations("nav");
  const panelId = useId();
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const sectionActive = isAboutSectionActive(pathname);
  const [override, setOverride] = useState<{
    pathname: string;
    open: boolean;
  } | null>(null);
  const open = override?.pathname === pathname ? override.open : sectionActive;

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      activeLinkRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, pathname]);

  return (
    <div className="rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOverride({ pathname, open: !open })}
        className={cx(
          "flex min-h-12 w-full items-center justify-between rounded-lg px-4 py-3 text-left text-[15px] font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
          sectionActive
            ? "bg-brand/10 text-brand"
            : "text-text-body hover:bg-paper hover:text-brand-hover",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Info
            className={cx(
              "h-5 w-5 shrink-0",
              sectionActive ? "text-brand" : "text-text-muted",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 break-words">{t("about")}</span>
        </span>
        <ChevronDown
          className={cx(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        inert={!open}
        aria-hidden={!open}
        className={cx(
          "grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <ul className="min-h-0 overflow-hidden py-1 pl-4">
          {ABOUT_NAV_ITEMS.map((item) => {
            const ItemIcon = item.icon;
            const active = isAboutItemActive(pathname, item);

            return (
              <li key={item.href}>
                <Link
                  ref={active ? activeLinkRef : undefined}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative flex min-h-12 items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-[14.5px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
                    active
                      ? "bg-brand/10 text-brand"
                      : "text-text-body hover:bg-paper hover:text-brand-hover",
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
                      "h-[18px] w-[18px] shrink-0",
                      active ? "text-brand" : "text-text-muted",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {t(item.labelKey)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
