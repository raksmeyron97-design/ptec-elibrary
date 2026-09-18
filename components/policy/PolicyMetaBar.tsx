// components/policy/PolicyMetaBar.tsx
//
// Last updated · Version · Reading time, as one badge row under a policy
// title.
//
// The date is a real `<time datetime>` carrying the ISO value, formatted for
// the viewer's locale — never a hardcoded localized string, which is how a
// Khmer page ends up displaying an English month name.
//
// Reading time is computed from the page's own catalogue text by
// lib/policy/reading-time.ts, which measures Khmer by character because Khmer
// has no spaces to split on. See that file for why the usual one-liner reports
// "1 min" for the entire Khmer policy.
//
// Server component: three spans and a formatter.

import { getFormatter } from "next-intl/server";
import { CalendarClock, Clock, Languages, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PolicyMetaLabels = {
  updated: string;
  version: string;
  /** Already interpolated with the minute count, e.g. "8 min read". */
  readingTime: string;
};

/** One icon + term/definition pair. Declared at module scope, not inside the
 *  component: a component created during render is a NEW component type on
 *  every render, so React remounts it and any state inside it is reset. */
function Item({
  Icon,
  iconClass,
  children,
}: {
  Icon: LucideIcon;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-4 w-4 shrink-0 ${iconClass} print:hidden`} aria-hidden="true" />
      {children}
    </div>
  );
}

export default async function PolicyMetaBar({
  isoDate,
  version,
  labels,
  note,
  noteIcon: NoteIcon = Languages,
  tone = "dark",
}: {
  /** ISO date, e.g. "2026-07-25". */
  isoDate: string;
  version: string;
  labels: PolicyMetaLabels;
  /** An extra note on the same row, e.g. "Available in English and Khmer."
   *  Rendered as a <p> NEXT TO the list, not inside it: a <dl> may only hold
   *  <dt>/<dd> pairs, and a note is a statement with no term to define. The
   *  hero this replaced had it as a bare <dd> with no <dt>. */
  note?: string;
  noteIcon?: LucideIcon;
  /** `dark` sits on the navy hero; `light` on a page surface. */
  tone?: "dark" | "light";
}) {
  const format = await getFormatter();
  const updated = format.dateTime(new Date(isoDate), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const text = tone === "dark" ? "text-white/75" : "text-text-muted";
  const icon = tone === "dark" ? "text-white/50" : "text-text-muted/70";
  const strong = tone === "dark" ? "text-white/90" : "text-text-heading";

  return (
    <div
      className={`mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] ${text} print:text-black`}
    >
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Item Icon={CalendarClock} iconClass={icon}>
        <dt className="font-medium">{labels.updated}:</dt>
        <dd className={strong}>
          <time dateTime={isoDate}>{updated}</time>
        </dd>
      </Item>
      <Item Icon={Tag} iconClass={icon}>
        <dt className="font-medium">{labels.version}:</dt>
        <dd className={strong}>{version}</dd>
      </Item>
      <Item Icon={Clock} iconClass={icon}>
        {/* No visible label: "8 min read" already says what it is, and a
            "Reading time:" prefix in front of it is the same words twice. */}
        <dt className="sr-only">{labels.readingTime}</dt>
        <dd>{labels.readingTime}</dd>
      </Item>
      </dl>
      {note && (
        <p className="flex items-center gap-1.5">
          <NoteIcon className={`h-4 w-4 shrink-0 ${icon} print:hidden`} aria-hidden="true" />
          {note}
        </p>
      )}
    </div>
  );
}
