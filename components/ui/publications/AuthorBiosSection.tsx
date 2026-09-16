import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { slugify } from "@/lib/book-utils";
import type { PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";
import { orcidUrl } from "@/lib/seo/identifiers";
import { secondaryValue } from "@/lib/publications/integrity";

/**
 * Two-letter monogram. Empty segments are filtered before taking first
 * characters: a name with a leading/double space previously yielded an empty
 * string, so that one author's avatar rendered blank while everyone else's
 * showed initials. Falls back to "?" so the treatment is never inconsistent.
 */
function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return letters || "?";
}

/**
 * "About the authors": photo/initials, name, corresponding mark, position,
 * affiliations, ORCID, and biography when available — as a list.
 *
 * A biography recorded in both languages is disclosed, not duplicated: see the
 * comment at the biography itself.
 */
export default async function AuthorBiosSection({
  authorships,
  affiliations,
  locale,
}: {
  authorships: PublicationAuthorship[];
  affiliations: PublicationAffiliation[];
  /** Decides which language of a bilingual biography leads. */
  locale: string;
}) {
  const t = await getTranslations("publicationDetail");
  const affiliationById = new Map(affiliations.map((a) => [a.id, a]));

  return (
    // A list, not a grid of cards. Equal-height cards stretched a two-line
    // entry to the height of its neighbour's long biography (700 px of empty
    // card on the live article); a list lets each author take the room their
    // entry needs.
    <ul className="divide-y divide-divider">
      {authorships.map(({ author, is_corresponding, affiliation_ids }) => {
        const authorAffiliations = affiliation_ids
          .map((id) => affiliationById.get(id))
          .filter((a): a is PublicationAffiliation => !!a);
        const bio = author.bio?.trim() || null;
        const bioKm = author.bio_km?.trim() || null;
        // Preference, not coercion — the same rule the abstract follows: the
        // reader's language leads where it exists, and a one-language bio is
        // shown whichever language that is, never withheld.
        const khmerLeads = locale === "km" && !!bioKm;
        const leadBio = khmerLeads ? bioKm : bio ?? bioKm;
        const leadBioLang: "en" | "km" = khmerLeads || (!bio && !!bioKm) ? "km" : "en";
        const altBio = bio && bioKm ? (khmerLeads ? bio : bioKm) : null;
        const altBioLang: "en" | "km" = khmerLeads ? "en" : "km";
        const translatedName = secondaryValue(author.full_name, author.full_name_km);

        return (
          <li key={author.id} className="flex gap-4 py-5 first:pt-1">
            {author.photo_url ? (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-divider bg-paper">
                {/* The name is right beside it, so the photo adds nothing a
                    screen reader needs: decorative. */}
                <Image src={author.photo_url} alt="" fill sizes="48px" className="object-cover" />
              </div>
            ) : (
              <div
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper text-[15px] font-bold text-text-muted"
              >
                {initials(author.full_name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {/* The name is the way into the author's profile — the same
                  destination the byline points at, resolved the same way
                  (stored slug from 0125, name-derived fallback). The
                  corresponding mark is a sibling of the heading, not inside
                  it, so the heading's name is the person's name alone. */}
              <h3 className="text-[16px] font-bold leading-snug text-text-heading">
                <Link
                  href={`/authors/${author.slug || slugify(author.full_name)}`}
                  className="rounded-sm underline-offset-4 transition-colors hover:text-brand hover:underline"
                >
                  {author.full_name}
                </Link>
              </h3>
              {translatedName && (
                <p lang="km" className="font-khmer-serif text-[14px] leading-7 text-text-muted">
                  {translatedName}
                </p>
              )}
              {is_corresponding && (
                <p className="mt-0.5 text-[12.5px] font-semibold text-brand">
                  <span aria-hidden="true">* </span>
                  {t("correspondingAuthor")}
                </p>
              )}
              {/* The author's own academic position (0125), when recorded.
                  Distinct from the per-publication affiliation below: a
                  position belongs to the person, an affiliation belongs to
                  their authorship of THIS article, and they can differ when
                  someone has since moved institution. */}
              {author.position_title?.trim() && (
                <p className="mt-1 text-[13.5px] font-semibold leading-5 text-text-body">{author.position_title}</p>
              )}
              {/* A missing affiliation is left blank, not announced, and a
                  value is never substituted from a neighbouring field. */}
              {authorAffiliations.length > 0 ? (
                <p className="mt-1 text-[13.5px] leading-6 text-text-muted">
                  {authorAffiliations
                    .map((a) => [a.name, a.city, a.country].filter(Boolean).join(", "))
                    .join(" · ")}
                </p>
              ) : (
                author.affiliation_name?.trim() && (
                  <p className="mt-1 text-[13.5px] leading-6 text-text-muted">{author.affiliation_name}</p>
                )
              )}
              {orcidUrl(author.orcid) && (
                <a
                  href={orcidUrl(author.orcid)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-text-muted transition-colors hover:text-brand"
                >
                  {/* Decorative ORCID brand mark; the visible "ORCID" text is the label */}
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-[#A6CE39] text-[9px] font-bold italic text-black"
                  >
                    iD
                  </span>
                  ORCID
                </a>
              )}
              {/* A personal email is NOT published without a recorded
                  public-corresponding-author consent. */}
              {/* Biographies are supporting information, so a bilingual one is
                  disclosed rather than printed twice: four authors with a bio
                  in both languages used to add eight paragraphs below an
                  article, half of them in a language the reader did not ask
                  for. The reader's language leads and the other sits behind a
                  <details> — plain HTML, so it needs no JavaScript, stays in
                  the DOM for a crawler and a printer, and is keyboard-operable
                  by default. The abstract gets a switch instead, because that
                  one IS the content. */}
              {leadBio && (
                <p
                  lang={leadBioLang}
                  className={
                    leadBioLang === "km"
                      ? "mt-3 max-w-[72ch] font-khmer-serif text-[14px] leading-8 text-text-body"
                      : "mt-3 max-w-[72ch] text-[14.5px] leading-7 text-text-body"
                  }
                >
                  {leadBio}
                </p>
              )}
              {altBio && (
                <details className="group mt-2 max-w-[72ch]">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg text-[13px] font-semibold text-text-muted transition-colors hover:text-brand [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                    {altBioLang === "km" ? t("bioShowKhmer") : t("bioShowEnglish")}
                  </summary>
                  <p
                    lang={altBioLang}
                    className={
                      altBioLang === "km"
                        ? "mt-2 font-khmer-serif text-[14px] leading-8 text-text-muted"
                        : "mt-2 text-[14.5px] leading-7 text-text-muted"
                    }
                  >
                    {altBio}
                  </p>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
