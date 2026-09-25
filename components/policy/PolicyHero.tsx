// components/policy/PolicyHero.tsx
//
// The masthead both trust documents share: breadcrumb, mark, eyebrow, title,
// plain-language description, the meta row, and a slot for the page's actions.
//
// The gradient is written as an inline style rather than a Tailwind utility
// because it is the one surface in the app that is deliberately NOT themed:
// it stays the PTEC navy in light and dark, so a reader who switches theme
// mid-document does not see the document's identity change under them. Print
// strips it back to black on white.
//
// `actions` is a slot rather than a prop list because the two pages need
// different ones and one of them is auth-gated — /privacy shows "Manage my
// privacy" only to a signed-in reader, which has to be decided in the browser
// so the page HTML stays cacheable.
//
// Server component.

import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import PolicyMetaBar, { type PolicyMetaLabels } from "./PolicyMetaBar";
import BreadcrumbNav from "@/components/ui/core/BreadcrumbNav";

export default function PolicyHero({
  id,
  Icon,
  eyebrow,
  title,
  description,
  breadcrumb,
  isoDate,
  version,
  metaLabels,
  note,
  km,
  actions,
}: {
  /** Anchor id, and the hook the print stylesheet uses. */
  id: string;
  Icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  breadcrumb: { home: string; current: string };
  isoDate: string;
  version: string;
  metaLabels: PolicyMetaLabels;
  note?: string;
  km: boolean;
  actions?: ReactNode;
}) {
  const headingFont = km ? "font-khmer-serif" : "";

  return (
    <header
      id={id}
      className="policy-hero relative overflow-hidden print:bg-white print:text-black"
      style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#0B1530 100%)" }}
    >
      <div
        className="absolute inset-0 opacity-[0.06] print:hidden"
        style={{
          backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[1200px] px-4 py-10 sm:px-6 md:px-8 md:py-14">
        <BreadcrumbNav className="print:hidden">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-white/70">
            <li>
              <Link
                href="/"
                className="rounded transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                {breadcrumb.home}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li aria-current="page" className="font-medium text-white/90">
              {breadcrumb.current}
            </li>
          </ol>
        </BreadcrumbNav>

        <div className="mt-6 flex items-start gap-4">
          <span
            className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 sm:flex print:hidden"
            aria-hidden="true"
          >
            <Icon className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p
              className="text-[12px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "#DDB022" }}
            >
              {eyebrow}
            </p>
            <h1
              className={`policy-wrap mt-1.5 text-[28px] font-bold leading-tight text-white sm:text-[34px] print:text-black ${headingFont}`}
            >
              {title}
            </h1>
            <p className="policy-copy mt-3 max-w-2xl text-[15px] text-white/80 print:text-black">
              {description}
            </p>
          </div>
        </div>

        <PolicyMetaBar
          isoDate={isoDate}
          version={version}
          labels={metaLabels}
          note={note}
          tone="dark"
        />

        {actions}
      </div>
    </header>
  );
}
