"use client";

// components/ui/books/LibraryVisitStrip.tsx
// The physical library's page answers "can I go there now?" — whether it is
// open, until when, and how to get there — in one line above the shelf.
//
// Before this, /catalogs only carried visit information in its EMPTY state:
// the moment the first record was catalogued, the hours and directions
// disappeared from the one page about the physical library.
//
// Same sentence, same resolver and same 60 s refresh as the footer and the
// tab bar's Library sheet (useLibraryOpenStatus), seeded with the status the
// server computed so hydration never mismatches. Deliberately NOT a live
// region: the footer's status line already announces a change, and two
// regions would say it twice.

import { ExternalLink, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AboutLibraryStatus } from "@/lib/about/status";
import type { HoursClosure } from "@/lib/system-settings/types";
import { useLibraryOpenStatus } from "@/components/layout/useLibraryOpenStatus";

const DOT = {
  open: "bg-[var(--ptec-success)]",
  notice: "bg-[var(--ptec-warning)]",
  closed: "bg-[var(--ptec-border-strong)]",
  unknown: "bg-[var(--ptec-border-strong)]",
} as const;

export default function LibraryVisitStrip({
  initialStatus,
  spec,
  closures,
  locale,
  mapHref,
  directionsLabel,
}: {
  initialStatus: AboutLibraryStatus;
  spec: string[];
  closures: HoursClosure[];
  locale: "en" | "km";
  mapHref: string;
  directionsLabel: string;
}) {
  const tNav = useTranslations("nav");
  const { tone, text } = useLibraryOpenStatus({ initialStatus, spec, closures, locale });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-divider bg-paper px-3.5 py-1.5 text-[13.5px]">
      <p className="flex min-w-0 items-center gap-2 py-1.5 font-semibold text-text-heading">
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
        <span>{text}</span>
      </p>
      <a
        href={mapHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-brand underline-offset-4 transition-colors hover:text-brand-hover hover:underline sm:ml-auto"
      >
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        {directionsLabel}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">({tNav("opensNewTab")})</span>
      </a>
    </div>
  );
}
