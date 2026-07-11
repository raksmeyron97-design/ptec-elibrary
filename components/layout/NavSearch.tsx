"use client";

import { useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const SearchIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="h-[18px] w-[18px] flex-shrink-0"
  >
    <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export default function NavSearch() {
  const t = useTranslations("nav");
  const router = useRouter();

  // Site-wide "/" shortcut → search page (the search page itself re-binds
  // "/" to focus its input, so the hint stays truthful everywhere).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      router.push("/search");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return (
    <>
      {/* Compact variant (below 1440px): icon-only button. Keeps the actions
          zone narrow so long Khmer nav labels collapse into "More" instead of
          fighting the search field for space. 44px tap target on touch. */}
      <Link
        href="/search"
        aria-label={t("searchLibrary")}
        className="group flex min-[1440px]:hidden relative h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-divider bg-bg-surface shadow-sm text-text-muted transition-colors duration-200 hover:border-brand/30 hover:text-brand active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none"
      >
        <SearchIcon />
      </Link>

      {/* Full variant (1440px+): label is always visible — hover feedback via
          color/shadow only, never a width animation that shifts the navbar. */}
      <Link
        href="/search"
        aria-label={t("searchLibrary")}
        className="hidden min-[1440px]:flex shrink-0 items-center gap-2 h-10 rounded-full border border-divider bg-bg-surface pl-3.5 pr-4 shadow-sm text-text-muted transition-colors duration-200 hover:border-brand/30 hover:text-brand hover:shadow-[0_4px_16px_rgba(30,58,138,0.12)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none"
      >
        <SearchIcon />
        <span className="whitespace-nowrap text-sm">{t("searchLibrary")}</span>
        <kbd
          aria-hidden="true"
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-divider bg-paper px-1.5 text-[11px] font-semibold text-text-muted"
        >
          /
        </kbd>
      </Link>
    </>
  );
}
