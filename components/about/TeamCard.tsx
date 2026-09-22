"use client";

// components/about/TeamCard.tsx
//
// One person, as a card in a university staff directory: a circular portrait
// beside the name, the position under it, one small service-area label, a
// short professional summary, and one editorial link out.
//
// ── Reading order ──
// Name → position → portrait → summary → action. The portrait sits beside the
// name rather than above it precisely so the NAME is what a reader lands on
// first; a tall image block on top makes the photograph the headline and the
// person the caption.
//
// ── One interactive element, and it is a real link ──
// The card has exactly one control: `View full profile`, whose `::after`
// stretches across the whole card so the card is the target. It is a real
// <a href="/about/team/slug">, which is what makes it crawlable, ⌘-clickable,
// middle-clickable and copyable — none of which a click handler on a <div>
// can do.
//
// A PLAIN left-click is intercepted and opens the quick-look sheet instead of
// navigating: it is the same information without a page load, and the sheet
// itself ends with the route to the real page. Any modified click (⌘, Ctrl,
// Shift, Alt, middle button) is left alone and navigates, so "open in new tab"
// behaves. `aria-haspopup="dialog"` tells assistive tech what activating it
// actually does, because for a keyboard user Enter opens the sheet too.
//
// There is deliberately no second square icon button beside it. Two controls
// per card is twenty-four controls on a twelve-person page, and the one they
// replaced looked like application chrome on an editorial card.

import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PublicTeamMember } from "@/lib/team/public";
import {
  memberArea,
  memberNames,
  memberPosition,
  memberSummary,
} from "@/lib/team/directory";
import type { AboutLocale } from "@/lib/about/format";
import TeamPortrait from "./TeamPortrait";

/** The portrait is a fixed-size circle at every breakpoint, so one pair of
 *  candidates covers the whole grid. */
const AVATAR_SIZES = "(min-width: 768px) 6rem, 5.25rem";

/** Roughly four lines in the directory card and five in the featured one —
 *  enough to say what someone does, short enough that the full profile is
 *  still worth opening. */
const SUMMARY_CHARS = { grid: 190, featured: 240 } as const;

export default function TeamCard({
  member,
  locale,
  onQuickLook,
  variant = "grid",
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  onQuickLook: (member: PublicTeamMember, trigger: HTMLElement) => void;
  /** "featured" is a slightly larger portrait and a longer summary. It is not
   *  a different card — alignment across the two sections has to hold. */
  variant?: "grid" | "featured";
}) {
  const t = useTranslations("about.team");
  const name = memberNames(member, locale);
  const role = memberPosition(member, locale);
  const area = memberArea(member, locale);
  const summary = memberSummary(member, locale, SUMMARY_CHARS[variant]);

  // A member with no slug has no profile page, so the card renders without the
  // action rather than offering a link that goes nowhere.
  const href = member.slug ? `/about/team/${member.slug}` : null;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Leave every modified click to the browser: ⌘/Ctrl (new tab), Shift (new
    // window), Alt (download), and any non-primary button.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onQuickLook(member, event.currentTarget);
  };

  return (
    <article className={`team-card ${variant === "featured" ? "team-card--lead" : ""}`}>
      <div className="team-card__head">
        <TeamPortrait
          member={member}
          sizes={AVATAR_SIZES}
          className={variant === "featured" ? "team-avatar--lead" : ""}
        />

        <div className="team-card__identity">
          <h3 className="team-card__name about-wrap">
            <span lang={name.primaryLang}>{name.primary}</span>
            {name.secondary && (
              <span lang={name.secondaryLang} className="team-card__alt about-wrap">
                {name.secondary}
              </span>
            )}
          </h3>

          {role && (
            <p lang={role.lang} className="team-card__role about-wrap">
              <span className="sr-only">{t("profile.position")}: </span>
              <span>{role.text}</span>
            </p>
          )}

          {/* One row for the two small labels. They are separate elements —
              a gold "Key contact" word and a muted service area — but they
              must not collide when a member has both. */}
          {(member.is_featured || area) && (
            <p className="team-card__tags">
              {member.is_featured && (
                <span className="team-card__flag">
                  <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />
                  <span className="about-wrap">{t("directory.keyContact")}</span>
                </span>
              )}
              {area && (
                <span lang={area.lang} className="team-card__area about-wrap">
                  <span className="sr-only">{t("profile.department")}: </span>
                  <span>{area.text}</span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {summary && (
        <p lang={summary.lang} className="team-card__bio about-copy about-wrap line-clamp-5">
          {summary.text}
        </p>
      )}

      {href && (
        <p className="team-card__foot">
          <Link href={href} onClick={handleClick} aria-haspopup="dialog" className="team-card__link">
            <span>{t("directory.viewProfile")}</span>
            {/* "View full profile" repeated twelve times down a grid is
                meaningless out of context, so the accessible name says whose —
                and still CONTAINS the visible label (WCAG 2.5.3). */}
            <span className="sr-only"> — {t("directory.profileOf", { name: name.primary })}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        </p>
      )}
    </article>
  );
}
