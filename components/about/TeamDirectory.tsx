"use client";

// components/about/TeamDirectory.tsx
//
// The public team directory on /about/team.
//
// ── What changed, and why ──
// This used to be the committee's ROSTER layout: one navy band per service
// area, a panel under each, a grid inside each panel. That is the right shape
// for a body whose structure IS the message (a committee has a leadership
// tier and a membership), and the wrong shape for a page whose reader is
// almost always looking for one person and does not know which department
// they are in. Four bands meant four grids to scan, and the page grew by a
// whole screen every time a department was added.
//
// So the grouping became a CONTROL. One grid, one sticky filter bar, and the
// department rides on each card as a labelled chip. Everything the bar does —
// filter, search, switch view — runs in memory over the roster the server
// component already fetched. There is no API route behind this component and
// no request is made when it is used.
//
// ── The decisions live next door ──
// Which departments exist, their counts and accents, which script leads,
// what a query matches and which member a `?member=` link names are all in
// lib/team/directory.ts — pure, and unit-tested offline without React. This
// file owns rendering and browser state, nothing else.
//
// ── One link per person ──
// A card is a single <a> to that person's profile page, with no interactive
// element inside it: one tab stop per person, a real href for a crawler and
// for a middle click, and nothing for the HTML parser to re-parent. A plain
// left click is intercepted and opens the panel instead; a modified click is
// left alone, so ⌘-click still opens the full profile in a new tab. A member
// with no slug has no profile page, so their card is a <button>.
//
// ── Accessibility ──
// The panel is a modal dialog (focus moves in, Tab is trapped, Escape closes,
// focus returns to the card). Filter chips are buttons with `aria-pressed`,
// the view toggle is a two-button group with the same, and the result count
// is announced politely — debounced with the search itself, so typing does
// not fire one announcement per keystroke.

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronRight, LayoutGrid, List, Search, Users, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { photoAltText, type PublicTeamMember, type PublicTeamSection } from "@/lib/team/public";
import { committeeInitials } from "@/lib/committee/public";
import {
  ALL_DEPARTMENTS,
  departmentAccents,
  departmentIdOf,
  filterTeamMembers,
  MEMBER_PARAM,
  memberBySlug,
  memberDepartment,
  memberNames,
  memberPosition,
  memberSummary,
  teamDepartments,
  TEAM_VIEW_KEY,
  isTeamView,
  type TeamDepartment,
  type TeamView,
} from "@/lib/team/directory";
import type { AboutLocale } from "@/lib/about/format";
import TeamMemberDialog, { type TeamDeskInfo } from "./TeamMemberDialog";

export type { TeamDeskInfo };

/** ~150 ms: long enough that a fast typist gets one filter pass per word,
 *  short enough that the grid never feels detached from the keyboard. */
const SEARCH_DEBOUNCE_MS = 150;

function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** Write (or strip) `?member=<slug>` without an RSC round trip — the same
 *  `history.replaceState` the PDF reader uses for `?page=N`. A pushState here
 *  would put one history entry behind the Back button per card opened. */
function syncMemberParam(slug: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set(MEMBER_PARAM, slug);
  else url.searchParams.delete(MEMBER_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

export default function TeamDirectory({
  members,
  sections,
  locale,
  desk,
}: {
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
  locale: AboutLocale;
  desk: TeamDeskInfo;
}) {
  const t = useTranslations("about.team");
  const searchId = useId();
  const [department, setDepartment] = useState<string>(ALL_DEPARTMENTS);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TeamView>("grid");
  // `openSlug` means exactly "what `?member=` says", so it stays null for a
  // member who has no slug (a pre-0115 row cannot be named in a URL). Those
  // open by id instead — the panel works either way, only the deep link does
  // not exist.
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const debouncedQuery = useDebounced(query, SEARCH_DEBOUNCE_MS);
  // The grid may lag the (already debounced) query by a frame under load;
  // the field never does.
  const effectiveQuery = useDeferredValue(debouncedQuery);

  const departments = useMemo(
    () => teamDepartments(members, sections, locale, t("directory.other")),
    [members, sections, locale, t],
  );
  const accents = useMemo(() => departmentAccents(departments), [departments]);
  const visible = useMemo(
    () => filterTeamMembers(members, { department, query: effectiveQuery }),
    [members, department, effectiveQuery],
  );

  const selected = useMemo(() => memberBySlug(members, openSlug), [members, openSlug]);

  // Deep link: open the named member on load. An unknown, retired or empty
  // slug is ignored in silence — a stale link to someone who has left should
  // land the reader in the directory, not in an error.
  //
  // An Effect Event, so the roster is read at its latest value without being a
  // DEPENDENCY. The URL is a fact about the browser, not about the props: this
  // must run once, on mount, and never again. Listing `members` would make it
  // an effect that re-opens a panel whenever the prop identity changes, which
  // is a different behaviour from the one this reads as.
  const openFromUrl = useEffectEvent((slug: string) => {
    if (members.some((m) => m.slug === slug)) setOpenSlug(slug);
    else syncMemberParam(null);
  });

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get(MEMBER_PARAM);
    if (slug) openFromUrl(slug);
  }, []);

  // The stored view is applied after hydration rather than before paint: grid
  // is the server-rendered default and the swap costs one frame. An inline
  // script to avoid that frame would be a second theme-init script for a
  // preference nobody notices changing.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TEAM_VIEW_KEY);
      if (isTeamView(stored)) setView(stored);
    } catch {
      // Private mode, blocked storage: grid, silently.
    }
  }, []);

  const chooseView = useCallback((next: TeamView) => {
    setView(next);
    try {
      window.localStorage.setItem(TEAM_VIEW_KEY, next);
    } catch {
      // The choice still applies to this visit; it just is not remembered.
    }
  }, []);

  const open = useCallback((member: PublicTeamMember) => {
    setOpenSlug(member.slug);
    setOpenId(member.slug ? null : member.id);
    if (member.slug) syncMemberParam(member.slug);
  }, []);

  const close = useCallback(() => {
    setOpenSlug(null);
    setOpenId(null);
    syncMemberParam(null);
  }, []);

  const selectedMember = selected ?? members.find((m) => m.id === openId) ?? null;

  const resultLabel = effectiveQuery.trim()
    ? t("directory.showingSearch", {
        count: visible.length,
        total: members.length,
        query: effectiveQuery.trim(),
      })
    : department === ALL_DEPARTMENTS
      ? t("directory.showingAll", { count: members.length })
      : t("directory.showingFiltered", { count: visible.length, total: members.length });

  return (
    <>
      <div className="team-filterbar glass-surface glass-surface--strong">
        <div
          role="group"
          aria-label={t("directory.filterLabel")}
          className="team-filterbar__chips scroll-row"
        >
          <Chip
            label={t("directory.all")}
            count={members.length}
            active={department === ALL_DEPARTMENTS}
            onClick={() => setDepartment(ALL_DEPARTMENTS)}
          />
          {departments.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.label}
              count={entry.count}
              accent={entry.accent}
              active={department === entry.id}
              onClick={() => setDepartment(entry.id)}
            />
          ))}
        </div>

        <div className="team-filterbar__tools">
          <label htmlFor={searchId} className="sr-only">
            {t("directory.searchLabel")}
          </label>
          {/* .focus-shell on the wrapper of a grouped control — the input
              itself carries no second indicator (docs/ACCESSIBILITY-FOCUS.md). */}
          <div className="team-filterbar__search focus-shell">
            <Search
              className="pointer-events-none absolute left-3 h-4 w-4 text-text-body"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("directory.searchPlaceholder")}
              autoComplete="off"
              // text-base (16px): iOS Safari zooms the whole page into any
              // smaller field on focus and leaves it zoomed.
              className="min-h-11 w-full flex-1 rounded-[0.625rem] bg-transparent py-1.5 pl-9 pr-9 text-base text-text-heading outline-none placeholder:text-text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("directory.searchClear")}
                className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-md text-text-body transition-colors hover:text-text-heading"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label={t("directory.viewLabel")}
            className="team-view-toggle"
          >
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => chooseView("grid")}
              className="team-view-toggle__button"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("directory.viewGrid")}</span>
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => chooseView("list")}
              className="team-view-toggle__button"
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("directory.viewList")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ONE live region on this page, and it is the visible count — a second
          sr-only copy would announce the same sentence twice, and the empty
          state below already says nothing the count has not said. Announced
          per SETTLED query, never once per keystroke, because the query it
          reads is the debounced one. */}
      <p aria-live="polite" className="mb-4 text-xs text-text-muted">
        {resultLabel}
      </p>

      {visible.length === 0 ? (
        // An empty filter must not dead-end: the chips are repeated here so
        // the way back is where the reader is looking, not back up the page.
        <div className="team-empty">
          <Users className="h-8 w-8 text-text-muted" aria-hidden="true" />
          <p className="about-copy max-w-md text-sm text-text-body">
            {effectiveQuery.trim()
              ? t("directory.noSearchResults", { query: effectiveQuery.trim() })
              : t("directory.emptyArea")}
          </p>
          <div className="team-filterbar__chips scroll-row justify-center">
            <Chip
              label={t("directory.all")}
              count={members.length}
              active={false}
              onClick={() => {
                setDepartment(ALL_DEPARTMENTS);
                setQuery("");
              }}
            />
            {departments.map((entry) => (
              <Chip
                key={entry.id}
                label={entry.label}
                count={entry.count}
                accent={entry.accent}
                active={false}
                onClick={() => {
                  setDepartment(entry.id);
                  setQuery("");
                }}
              />
            ))}
          </div>
        </div>
      ) : view === "grid" ? (
        <ul className="team-grid">
          {visible.map((member) => (
            <li key={member.id} className="about-reveal">
              <MemberCard
                member={member}
                locale={locale}
                accent={accents[departmentIdOf(member)] ?? 1}
                onOpen={open}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="team-list">
          {visible.map((member) => (
            <li key={member.id} className="about-reveal">
              <MemberRow
                member={member}
                locale={locale}
                accent={accents[departmentIdOf(member)] ?? 1}
                onOpen={open}
              />
            </li>
          ))}
        </ul>
      )}

      {selectedMember && (
        <TeamMemberDialog
          member={selectedMember}
          locale={locale}
          desk={desk}
          accent={accents[departmentIdOf(selectedMember)] ?? 1}
          onClose={close}
        />
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function Chip({
  label,
  count,
  accent,
  active,
  onClick,
}: {
  label: string;
  count: number;
  accent?: TeamDepartment["accent"];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`team-chip ${accent ? `team-accent--${accent}` : ""}`}
    >
      {accent && <span aria-hidden="true" className="team-chip__dot" />}
      <span className="about-wrap">{label}</span>
      <span className="team-chip__count">{count}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** A plain left click opens the panel; every modified click is the browser's
 *  (new tab, new window, download, middle click). */
function isPlainClick(event: React.MouseEvent): boolean {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);
}

function Portrait({ member }: { member: PublicTeamMember }) {
  if (member.photo_url) {
    return (
      <Image
        src={member.photo_url}
        alt={photoAltText(member)}
        fill
        loading="lazy"
        sizes="(min-width: 1024px) 18rem, (min-width: 640px) 30vw, 45vw"
        className="object-cover object-top"
      />
    );
  }
  // A <span>, because this sits inside the card's <a>, whose content is all
  // phrasing — a <div> there is invalid even though the parser tolerates it.
  return (
    <span className="team-monogram" aria-hidden="true">
      {committeeInitials(member) || "?"}
    </span>
  );
}

function MemberCard({
  member,
  locale,
  accent,
  onOpen,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  accent: number;
  onOpen: (member: PublicTeamMember) => void;
}) {
  const t = useTranslations("about.team");
  const name = memberNames(member, locale);
  const role = memberPosition(member, locale);
  const department = memberDepartment(member, locale);
  // Short on purpose: the full biography is in the panel and, for a crawler,
  // in the page's Person nodes.
  const summary = memberSummary(member, locale, 78);

  const body = (
    <>
      <span className="team-card__photo">
        <Portrait member={member} />
      </span>
      <span className="team-card__body">
        <span className="team-card__name about-wrap">
          <span lang={name.primaryLang} className="block">
            {name.primary}
          </span>
          {name.secondary && (
            <span lang={name.secondaryLang} className="team-card__alt about-wrap">
              {name.secondary}
            </span>
          )}
        </span>
        {role && (
          <span
            lang={locale === "km" && member.position_km ? "km" : "en"}
            className="team-card__role about-wrap block"
          >
            <span className="sr-only">{t("profile.position")}: </span>
            {role}
          </span>
        )}
        {summary && (
          <span lang={summary.lang} className="team-card__line about-wrap block line-clamp-2">
            {summary.text}
          </span>
        )}
        <span className="team-card__foot">
          {department && <span className="team-tag about-wrap">{department}</span>}
          {member.is_featured && (
            <span className="team-card__key">{t("directory.keyContact")}</span>
          )}
        </span>
      </span>
      <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
    </>
  );

  const className = `team-card team-accent--${accent}`;

  if (!member.slug) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.focus();
          onOpen(member);
        }}
        className={className}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={`/about/team/${member.slug}`}
      className={className}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        // Focus the card BEFORE the dialog mounts, so the focus trap has the
        // right element to return focus to when it closes.
        event.currentTarget.focus();
        onOpen(member);
      }}
    >
      {body}
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function MemberRow({
  member,
  locale,
  accent,
  onOpen,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  accent: number;
  onOpen: (member: PublicTeamMember) => void;
}) {
  const t = useTranslations("about.team");
  const name = memberNames(member, locale);
  const role = memberPosition(member, locale);
  const department = memberDepartment(member, locale);

  const body = (
    <>
      <span className="team-row__avatar">
        <Portrait member={member} />
      </span>
      <span className="team-row__main">
        <span className="team-row__name about-wrap block">
          <span lang={name.primaryLang}>{name.primary}</span>
          {name.secondary && (
            <span lang={name.secondaryLang} className="team-card__alt about-wrap">
              {name.secondary}
            </span>
          )}
        </span>
        {role && (
          <span className="team-row__role about-wrap block">
            <span className="sr-only">{t("profile.position")}: </span>
            {role}
          </span>
        )}
      </span>
      {department && <span className="team-tag about-wrap hidden sm:inline-flex">{department}</span>}
      {member.is_featured && <span className="team-card__key">{t("directory.keyContact")}</span>}
      <ChevronRight className="team-row__chevron h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
    </>
  );

  const className = `team-row team-accent--${accent}`;

  if (!member.slug) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.focus();
          onOpen(member);
        }}
        className={className}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={`/about/team/${member.slug}`}
      className={className}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        event.currentTarget.focus();
        onOpen(member);
      }}
    >
      {body}
    </Link>
  );
}
