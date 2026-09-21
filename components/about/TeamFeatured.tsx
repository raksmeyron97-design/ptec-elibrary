"use client";

// components/about/TeamFeatured.tsx
//
// "Meet the Library Team" — the editorial opening of the page. A few of the
// people, introduced, above the searchable roster.
//
// ── What this section may and may not claim ──
//
// Membership is `is_featured` and nothing else — never a position string.
// "Head of Department" is a job title the library wrote, not a flag it set,
// and reading rank out of prose is how a redesign starts inventing a
// hierarchy. `splitFeatured()` in lib/team/directory.ts states the rules.
//
// The heading is deliberately "Meet the Library Team" and not "Leadership":
// introducing people makes no claim about rank, which is the only claim
// `is_featured` is entitled to make. It is also why one featured member is a
// legitimate section here where it would not have been under the old heading.
//
// Nothing is padded. Two featured members render two cards, never two plus a
// placeholder to fill the row, and nobody is removed from the directory below
// in order to appear here — the roster stays complete and searchable.
//
// This is presentational: the quick-look sheet, the ?member= deep link and
// focus restoration all live in TeamDirectory, so the two sections share one
// panel and cannot open two at once.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import type { PublicTeamMember } from "@/lib/team/public";
import type { AboutLocale } from "@/lib/about/format";
import TeamCard from "./TeamCard";

export default function TeamFeatured({
  members,
  locale,
  onQuickLook,
  lead,
}: {
  /** Already narrowed by splitFeatured(); an empty array renders nothing. */
  members: PublicTeamMember[];
  locale: AboutLocale;
  onQuickLook: (member: PublicTeamMember, trigger: HTMLElement) => void;
  /** The page's one-sentence introduction and its quiet figures. They ride in
   *  this header rather than in a section of their own above it: measured at
   *  390x844, a separate lead block put the first face at y=937 — below the
   *  fold on a phone — and this page's whole job is to show people quickly. */
  lead: ReactNode;
}) {
  const t = useTranslations("about.team");
  const headingId = "team-featured-heading";

  if (members.length === 0) return null;

  return (
    <section id="featured" aria-labelledby={headingId} className="scroll-mt-24">
      <div className="team-section-head mb-5">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="about-wrap text-xl font-semibold tracking-tight text-text-heading sm:text-2xl"
          >
            {t("featured.heading")}
          </h2>
          {lead}
        </div>
        {/* An in-page anchor, not a locale-aware Link: a fragment has no
            locale to resolve, and the full roster is the next section. */}
        <a href="#directory" className="team-section-link">
          <span>{t("featured.viewAll")}</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </a>
      </div>

      <ul className="team-grid">
        {members.map((member) => (
          <li key={member.id}>
            <TeamCard member={member} locale={locale} onQuickLook={onQuickLook} variant="featured" />
          </li>
        ))}
      </ul>
    </section>
  );
}
