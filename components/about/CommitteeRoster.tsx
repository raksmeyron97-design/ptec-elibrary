// components/about/CommitteeRoster.tsx
//
// The public presentation of the Library Committee. A SERVER component with no
// interactive island: the page is a roster, so there is nothing to hydrate and
// nothing a reader has to click before they can read it.
//
// Two compositions, chosen by the SECTION rather than by the page:
//
//   leadership — few people, prominent, centred. Portraits larger, the role
//                stated on its own line under the name.
//   grid       — the standard roster, two or three to a row.
//
// Nothing here knows the words "Head" or "Deputy Head". Which group is the
// leadership group, what it is called in either language and who is in it are
// all editorial decisions stored in `committee_sections` — the page only asks
// each group which of the two shapes it wants. That is what makes the public
// hierarchy re-orderable without a deployment.
//
// Every field is optional except the name, and each one is simply absent when
// the library has not supplied it: no "N/A", no placeholder portrait of a
// stranger, no invented qualification.

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { AboutLocale } from "@/lib/about/format";
import {
  committeeName,
  committeeResponsibility,
  committeeRole,
  groupDescription,
  groupHeading,
  profilePath,
  type CommitteeGroup,
  type PublicCommitteeMember,
} from "@/lib/committee/public";
import { photoAltText } from "@/lib/team/public";

export default async function CommitteeRoster({
  groups,
  locale,
}: {
  groups: CommitteeGroup[];
  locale: AboutLocale;
}) {
  const t = await getTranslations("about.committee");

  return (
    <div className="space-y-14 sm:space-y-16">
      {groups.map((group, index) => {
        const heading = groupHeading(group, locale);
        const description = groupDescription(group, locale);
        const headingId = `committee-group-${group.sectionId ?? "unsectioned"}`;
        const leadership = group.layout === "leadership";

        return (
          <section key={group.sectionId ?? "unsectioned"} aria-labelledby={headingId} className="scroll-mt-24">
            <div className={leadership ? "text-center" : ""}>
              {/* h3, not h2: the roster sits inside the page's "Committee
                  members" section, whose heading is the h2. Size is a
                  presentation choice — a leadership group reads larger — and
                  it must not decide the outline a screen-reader user
                  navigates by. */}
              <h3
                id={headingId}
                lang={heading?.lang}
                className={`about-wrap font-semibold tracking-tight text-text-heading ${
                  leadership ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
                }`}
              >
                {heading?.text ?? t("roster.unsectioned")}
              </h3>
              {/* The navy-to-gold rule is the About section's one recurring
                  brand signature; centred under a leadership heading, flush
                  left everywhere else. */}
              <span
                aria-hidden="true"
                className={`mt-3 block h-0.5 w-16 rounded-full bg-gradient-to-r from-brand to-gold-500 ${
                  leadership ? "mx-auto" : ""
                }`}
              />
              {description && (
                <p
                  lang={description.lang}
                  className={`about-copy mt-4 text-sm text-text-body ${
                    leadership ? "mx-auto max-w-2xl" : "about-measure"
                  }`}
                >
                  {description.text}
                </p>
              )}
            </div>

            {/* Leadership is a FLEX row, not a grid: an office is often held by
                one or three people, and a two-column grid strands an odd card
                against the left edge of a centred composition. The grid stays
                for the roster, where a left-aligned column IS the right
                answer. */}
            <ul
              className={
                leadership
                  ? "mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-6"
                  : "mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              }
            >
              {group.members.map((member, memberIndex) => (
                <li
                  key={member.id}
                  className={
                    leadership
                      ? "w-full max-w-xs sm:w-[calc(50%-0.75rem)]"
                      : "h-full"
                  }
                >
                  <CommitteeMemberCard
                    member={member}
                    locale={locale}
                    variant={group.layout}
                    /* The first portrait above the fold is the page's LCP
                       candidate; the rest stay lazy. */
                    priority={index === 0 && memberIndex === 0}
                    labels={{
                      role: t("member.roleLabel"),
                      position: t("member.positionLabel"),
                      responsibility: t("member.responsibilityLabel"),
                      education: t("member.educationLabel"),
                      viewProfile: t("member.viewProfile"),
                      viewProfileOf: (name: string) => t("member.viewProfileOf", { name }),
                      noPhoto: t("member.noPhoto"),
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
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

function CommitteeMemberCard({
  member,
  locale,
  variant,
  priority,
  labels,
}: {
  member: PublicCommitteeMember;
  locale: AboutLocale;
  variant: CommitteeGroup["layout"];
  priority: boolean;
  labels: CardLabels;
}) {
  const name = committeeName(member, locale);
  const role = committeeRole(member, locale);
  const responsibility = committeeResponsibility(member, locale);
  const href = profilePath(member);
  const leadership = variant === "leadership";
  const displayName = name?.primary.text ?? (member.name_en || member.name_km);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <Portrait member={member} priority={priority} leadership={leadership} noPhotoLabel={labels.noPhoto} />

      <div className={`flex flex-1 flex-col p-5 ${leadership ? "text-center" : ""}`}>
        {/* Bilingual names are STACKED, never joined on one line: the two
            scripts have different shapes and a single line reads as neither. */}
        <h4 className="about-wrap text-base font-semibold text-text-heading sm:text-lg">
          {name && (
            <>
              <span lang={name.primary.lang} className="block">
                {name.primary.text}
              </span>
              {name.secondary && (
                <span
                  lang={name.secondary.lang}
                  className="about-wrap mt-1 block text-sm font-normal text-text-muted"
                >
                  {name.secondary.text}
                </span>
              )}
            </>
          )}
        </h4>

        {role && (
          <p className="mt-3">
            {/* The label is visible, not a tooltip: "Chair of the Library
                Committee" and "Cataloguing Officer" are different claims, and
                the card says which one it is showing. */}
            <span className="sr-only">
              {role.source === "committee" ? labels.role : labels.position}:{" "}
            </span>
            <span
              lang={role.lang}
              className={`about-wrap inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                role.source === "committee"
                  ? "border border-gold-500/40 bg-surface-brand-soft text-brand"
                  : "border border-divider bg-paper text-text-body"
              }`}
            >
              {role.text}
            </span>
          </p>
        )}

        {member.education && (
          <p className="about-wrap mt-3 text-sm text-text-muted">
            <span className="sr-only">{labels.education}: </span>
            {member.education}
          </p>
        )}

        {responsibility && (
          <p lang={responsibility.lang} className="about-copy mt-3 text-sm text-text-body">
            <span className="sr-only">{labels.responsibility}: </span>
            {responsibility.text}
          </p>
        )}

        {href && (
          <p className="mt-auto pt-5">
            <Link
              href={href}
              // The visible text repeats on every card, so the accessible name
              // carries the person — a list of identical "View staff profile"
              // links is a WCAG 2.4.4 failure in a screen-reader link list.
              aria-label={labels.viewProfileOf(displayName)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
            >
              {labels.viewProfile}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * A formal institutional portrait: a fixed 4:5 frame, the box reserved before
 * the bytes arrive so nothing shifts when the photo decodes, and a restrained
 * monogram when the library has no portrait — never a stock silhouette, which
 * reads as a real person the reader cannot identify.
 */
function Portrait({
  member,
  priority,
  leadership,
  noPhotoLabel,
}: {
  member: PublicCommitteeMember;
  priority: boolean;
  leadership: boolean;
  noPhotoLabel: string;
}) {
  const initial = (member.name_en || member.name_km || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-brand-soft">
      {member.photo_url ? (
        <Image
          src={member.photo_url}
          alt={photoAltText(member)}
          fill
          priority={priority}
          sizes={
            leadership
              ? "(min-width: 640px) 22rem, 100vw"
              : "(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw"
          }
          /* object-top: a portrait cropped from the centre cuts foreheads. */
          className="object-cover object-top"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-brand/5">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full border border-brand/20 bg-bg-surface text-2xl font-semibold text-brand"
          >
            {initial}
          </span>
          <span className="sr-only">{noPhotoLabel}</span>
        </div>
      )}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-gold-500/70" />
    </div>
  );
}
