import Image from "next/image";
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
 */
export default async function AuthorBiosSection({
  authorships,
  affiliations,
}: {
  authorships: PublicationAuthorship[];
  affiliations: PublicationAffiliation[];
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
              {bio && <p className="mt-3 max-w-[72ch] text-[14.5px] leading-7 text-text-body">{bio}</p>}
              {bioKm && (
                <p lang="km" className="mt-2 max-w-[72ch] font-khmer-serif text-[14px] leading-8 text-text-muted">
                  {bioKm}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
