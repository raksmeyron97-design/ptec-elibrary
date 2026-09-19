// components/about/CommitteeRoster.tsx
//
// The public presentation of the Library Committee: one panel per tier, in
// hierarchy order, each headed by a solid navy band naming the group and
// holding its members as small portrait cards.
//
// The layout is deliberately plain and institutional — the pattern a reader
// already knows from the college's own directories: a band names the group, a
// white panel holds the people, a card is a portrait, a name, a role and a
// link. Structure is carried by the ORDER of the panels and by which one the
// leadership occupies (first, its cards centred and a little larger), not by
// decoration. Nothing here animates.
//
// A SERVER component with no interactive island: the page is a roster, so
// there is nothing to hydrate and nothing a reader has to click before they
// can read it.
//
// Two compositions, chosen by the SECTION rather than by the page:
//
//   leadership — the panel's cards are centred and wider; the standing gold
//                rule on the band marks the tier.
//   grid       — the standard roster grid, two to five across by viewport.
//
// Nothing here knows the words "Head" or "Deputy Head". Which group is the
// leadership group, what it is called in either language and who is in it are
// editorial decisions stored in `committee_sections` — the page only asks each
// group which of the two shapes it wants. That is what makes the public
// hierarchy re-orderable without a deployment, and it is also why the tier
// treatment keys on `group.layout` and never on the text of a role: a rule
// that recognised "Chair" would recognise nothing at all on /km.
//
// Every field is optional except the name, and each one is simply absent when
// the library has not supplied it: no "N/A", no placeholder portrait of a
// stranger, no invented qualification.

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Landmark, Users } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { AboutLocale } from "@/lib/about/format";
import {
  committeeInitials,
  committeeName,
  committeePhotoAlt,
  committeeResponsibility,
  committeeRole,
  groupDescription,
  groupHeading,
  profilePath,
  type CommitteeGroup,
  type PublicCommitteeMember,
} from "@/lib/committee/public";

export default async function CommitteeRoster({
  groups,
  locale,
}: {
  groups: CommitteeGroup[];
  locale: AboutLocale;
}) {
  const t = await getTranslations("about.committee");

  const labels: CardLabels = {
    role: t("member.roleLabel"),
    position: t("member.positionLabel"),
    responsibility: t("member.responsibilityLabel"),
    education: t("member.educationLabel"),
    viewProfile: t("member.viewProfile"),
    viewProfileOf: (name: string) => t("member.viewProfileOf", { name }),
    noPhoto: t("member.noPhoto"),
  };

  return (
    /* An ORDERED list: the order of the panels is the hierarchy. */
    <ol className="roster-panels">
      {groups.map((group, index) => {
        const heading = groupHeading(group, locale);
        const description = groupDescription(group, locale);
        const headingId = `committee-group-${group.sectionId ?? "unsectioned"}`;
        const leadership = group.layout === "leadership";
        const BandIcon = leadership ? Landmark : Users;

        return (
          <li key={group.sectionId ?? "unsectioned"}>
            <section
              aria-labelledby={headingId}
              className={`roster-panel scroll-mt-24 ${leadership ? "roster-panel--leadership" : ""}`}
            >
              {/* The band: the group's name on solid navy, white text. Literal
                  navy on purpose — it stays navy in both themes, like the hero
                  and the footer it echoes. The count sits at the far end as a
                  quiet figure outside the heading, so a screen reader hears
                  the group's name and not "Lecturers 5 members". */}
              <header className="roster-band">
                <BandIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <h3
                  id={headingId}
                  lang={heading?.lang}
                  className="roster-band__title about-wrap"
                >
                  {heading?.text ?? t("roster.unsectioned")}
                </h3>
                <span className="roster-band__count">
                  {t("roster.count", { count: group.members.length })}
                </span>
              </header>

              <div className="roster-panel__body">
                {description && (
                  <p
                    lang={description.lang}
                    className="about-copy about-measure mb-4 text-sm text-text-body"
                  >
                    {description.text}
                  </p>
                )}
                <ul
                  className={
                    leadership ? "roster-grid roster-grid--centered" : "roster-grid roster-grid--five"
                  }
                >
                  {group.members.map((member, memberIndex) => (
                    <li key={member.id} className={leadership ? "roster-grid__lead" : ""}>
                      <MemberCard
                        member={member}
                        locale={locale}
                        labels={labels}
                        leadership={leadership}
                        /* The first portrait above the fold is the page's
                           LCP candidate; the rest stay lazy. */
                        priority={index === 0 && memberIndex === 0}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </li>
        );
      })}
    </ol>
  );
}

type CardLabels = {
  role: string;
  position: string;
  responsibility: string;
  education: string;
  viewProfile: string;
  viewProfileOf: (name: string) => string;
  noPhoto: string;
};

/**
 * One member: portrait, name in both scripts, committee role, qualification,
 * and the profile link. The link is stretched over the card — it is the only
 * interactive element on it — and its accessible name carries the person and
 * CONTAINS the visible label, so a screen-reader link list is not fourteen
 * identical "View staff profile" entries and a voice-control user can say
 * what they see.
 */
function MemberCard({
  member,
  locale,
  labels,
  leadership,
  priority,
}: {
  member: PublicCommitteeMember;
  locale: AboutLocale;
  labels: CardLabels;
  leadership: boolean;
  priority: boolean;
}) {
  const name = committeeName(member, locale);
  const role = committeeRole(member, locale);
  const responsibility = committeeResponsibility(member, locale);
  const href = profilePath(member);
  const displayName = name?.primary.text ?? (member.name_en || member.name_km);
  // Never `name.charAt(0)`: every name on this board opens with an honorific,
  // so that drew "M" for each Mr/Mrs/Ms and "D" for each Dr.
  const initials = committeeInitials(member);

  return (
    <article className="roster-card">
      {/* A fixed 4:5 frame, reserved before the bytes arrive so nothing shifts
          when the photo decodes; a restrained monogram when the library has no
          portrait — never a stock silhouette, which reads as a real person the
          reader cannot identify. object-top: a portrait cropped from the
          centre cuts foreheads. */}
      <div className="roster-card__photo">
        {member.photo_url ? (
          <Image
            src={member.photo_url}
            alt={committeePhotoAlt(member)}
            fill
            priority={priority}
            sizes={
              leadership
                ? "(min-width: 640px) 14rem, 45vw"
                : "(min-width: 1024px) 13rem, (min-width: 640px) 30vw, 45vw"
            }
            className="object-cover object-top"
          />
        ) : (
          <div className="roster-monogram">
            <span aria-hidden="true" className="roster-monogram__mark">
              {initials}
            </span>
            <span className="sr-only">{labels.noPhoto}</span>
          </div>
        )}
      </div>

      {/* Bilingual names are STACKED, never joined on one line: the two
          scripts have different shapes and a single line reads as neither. */}
      <h4 className="roster-card__name about-wrap">
        {name && (
          <>
            <span lang={name.primary.lang} className="block">
              {name.primary.text}
            </span>
            {name.secondary && (
              <span lang={name.secondary.lang} className="roster-card__alt about-wrap block">
                {name.secondary.text}
              </span>
            )}
          </>
        )}
      </h4>

      {role && (
        <p lang={role.lang} className="roster-card__role about-wrap">
          {/* The label says WHICH claim it is — "Chair" and "Cataloguing
              Officer" are different facts, and the card says which one it is
              showing. */}
          <span className="sr-only">
            {role.source === "committee" ? labels.role : labels.position}:{" "}
          </span>
          <span>{role.text}</span>
        </p>
      )}

      {member.education && (
        <p className="roster-card__line about-wrap">
          <span className="sr-only">{labels.education}: </span>
          {member.education}
        </p>
      )}

      {leadership && responsibility && (
        <p lang={responsibility.lang} className="roster-card__line about-copy about-wrap">
          <span className="sr-only">{labels.responsibility}: </span>
          {responsibility.text}
        </p>
      )}

      {href && (
        <Link
          href={href}
          aria-label={labels.viewProfileOf(displayName)}
          className="roster-card__link roster-card__link--stretch"
        >
          {labels.viewProfile}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
