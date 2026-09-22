"use client";

// components/about/TeamDirectory.tsx
//
// The people half of /about/team. This file is ORCHESTRATION only — filter and
// query state, the deep link, and which member the sheet is showing.
// Everything it draws lives elsewhere:
//
//   lib/team/directory.ts        the pure rules (search, filter, bilingual names)
//   TeamFeatured.tsx             "Meet the Library Team", the editorial opening
//   TeamDirectoryToolbar.tsx     search + service-area chips + result count
//   TeamCard.tsx                 one person
//   TeamProfileSheet.tsx         the quick look
//
// ── Why the featured section is rendered from here ──
// Both sections draw the SAME card, and that card's plain click opens the
// quick-look sheet. Two visually identical cards where one opens a panel and
// the other navigates is a difference a reader cannot see until they click it.
// So one component owns one sheet, one ?member= parameter and one focus
// restoration, and the featured section is presentational.
//
// ── Layout ──
// One calm grid at 1 / 2 / 3 columns, in the library's own display order —
// which already runs head, deputy, lecturers, librarians. The service area a
// person belongs to is on their card and in the chip row, so the grid does not
// need to be broken into one banded panel per area; that treatment belongs to
// /about/committee, where the groups are a body's actual structure rather than
// a filter.
//
// ── Privacy ──
// Nothing in this tree decides what may be published. `phone`/`email` arrive
// already nulled unless an admin approved public display, because the page
// reads the `team_members_public` view (migration 0070), which applies those
// toggles in SQL.
//
// ── The ?member= deep link ──
// Read from `window.location.search` on mount and written with
// `history.replaceState`, deliberately NOT with `useSearchParams` or the
// router: `useSearchParams()` opts the closest Suspense boundary out of static
// rendering, and this page is prerendered (verified: /about/team still builds
// as ● SSG in both locales). `replaceState` also means a reader who opened
// four people in a row does not have four entries stacked behind their Back
// button. An unknown slug is ignored and stripped rather than rendering an
// error — the URL is a convenience, not a route.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PublicTeamMember, PublicTeamSection } from "@/lib/team/public";
import { FILTER_ALL, SEARCH_THRESHOLD, areaChips, filterMembers } from "@/lib/team/directory";
import type { AboutLocale } from "@/lib/about/format";
import TeamCard from "./TeamCard";
import TeamFeatured from "./TeamFeatured";
import TeamDirectoryToolbar from "./TeamDirectoryToolbar";
import TeamProfileSheet, { type TeamDeskInfo } from "./TeamProfileSheet";

export type { TeamDeskInfo };

/** The query parameter that deep-links a quick look. */
const MEMBER_PARAM = "member";

/** Rewrites ?member= without a navigation, an RSC round-trip or a history
 *  entry. Guarded: a browser that refuses `replaceState` (or a test
 *  environment without one) must not take the sheet down with it. */
function syncMemberParam(slug: string | null) {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  try {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set(MEMBER_PARAM, slug);
    else url.searchParams.delete(MEMBER_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* A URL the browser will not let us rewrite is not worth an error. */
  }
}

export default function TeamDirectory({
  members,
  featured,
  sections,
  locale,
  desk,
  lead,
}: {
  members: PublicTeamMember[];
  /** The `is_featured` members, already capped by splitFeatured(). They are
   *  ALSO in `members` — the roster stays complete and searchable. */
  featured: PublicTeamMember[];
  sections: PublicTeamSection[];
  locale: AboutLocale;
  desk: TeamDeskInfo;
  /** The page's introduction + figures. Rendered in the featured header when
   *  there is one, and above the roster when there is not — so it appears
   *  exactly once wherever the page starts. */
  lead: ReactNode;
}) {
  const t = useTranslations("about.team");
  const [area, setArea] = useState<string>(FILTER_ALL);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const chips = useMemo(() => areaChips(members, sections, locale), [members, sections, locale]);
  const visible = useMemo(() => filterMembers(members, { area, query }), [members, area, query]);
  const selected = useMemo(
    () => (selectedId ? (members.find((m) => m.id === selectedId) ?? null) : null),
    [members, selectedId],
  );

  // Open whatever ?member= names, once, on mount. An unknown slug is stripped
  // rather than surfaced: the parameter is a convenience, and a reader who
  // followed a stale link should land on a working directory.
  //
  // `react-hooks/set-state-in-effect` is suppressed rather than designed
  // around, and the alternative is worse: the only other place to read this is
  // a lazy `useState` initializer, which runs during the SERVER render too,
  // where `window` does not exist — and guarding it there makes the server
  // produce `null` while the client produces the slug, which is a hydration
  // mismatch. Reading the URL after hydration is the correct shape; the cost
  // is one extra render, once, only for a reader who arrived on a deep link.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get(MEMBER_PARAM);
    if (!slug) return;
    const match = members.find((m) => m.slug === slug);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setSelectedId(match.id);
    else syncMemberParam(null);
    // Mount only — later changes to ?member= are this component's own writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useCallback((member: PublicTeamMember, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setSelectedId(member.id);
    syncMemberParam(member.slug);
  }, []);

  const close = useCallback(() => {
    setSelectedId(null);
    syncMemberParam(null);
    // Returning focus to the control that opened the sheet is what keeps a
    // keyboard user from being dumped back at the top of the document. It is
    // null for a deep-linked open, where there was no trigger — leaving focus
    // where the browser put it is right there.
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  const trimmed = query.trim();
  const status = trimmed
    ? t("directory.showingSearch", { count: visible.length, total: members.length, query: trimmed })
    : area === FILTER_ALL
      ? t("directory.showingAll", { count: members.length })
      : t("directory.showingFiltered", { count: visible.length, total: members.length });

  return (
    <>
      <TeamFeatured members={featured} locale={locale} onQuickLook={open} lead={lead} />

      <section id="directory" aria-labelledby="team-directory-heading" className="scroll-mt-24">
        <div className="team-section-head mb-5">
          <div className="min-w-0">
            <h2
              id="team-directory-heading"
              className="about-wrap text-xl font-semibold tracking-tight text-text-heading sm:text-2xl"
            >
              {t("directory.heading")}
            </h2>
            {featured.length === 0 && lead}
          </div>
        </div>

        <TeamDirectoryToolbar
          chips={chips}
          area={area}
          onAreaChange={setArea}
          query={query}
          onQueryChange={setQuery}
          showSearch={members.length >= SEARCH_THRESHOLD}
          status={status}
        />

        {/* The grid is the live region; the count in the toolbar is its own
            `role="status"`. Two regions, one announcement each — not one region
            announcing the whole grid's text on every keystroke. */}
        <div aria-live="polite" aria-relevant="additions removals">
          {visible.length === 0 ? (
            <p role="status" className="team-empty about-copy text-sm text-text-muted">
              {trimmed ? t("directory.noSearchResults", { query: trimmed }) : t("directory.emptyArea")}
            </p>
          ) : (
            <ul className="team-grid">
              {visible.map((member) => (
                <li key={member.id}>
                  <TeamCard member={member} locale={locale} onQuickLook={open} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {selected && (
        <TeamProfileSheet member={selected} locale={locale} desk={desk} onClose={close} />
      )}
    </>
  );
}
