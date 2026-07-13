import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";
import { orcidUrl } from "@/lib/seo/identifiers";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * "About the Authors" cards: photo/initials, name, corresponding badge,
 * affiliations, ORCID + email links, and biography when available.
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
    <div className="grid gap-4 md:grid-cols-2">
      {authorships.map(({ author, is_corresponding, affiliation_ids }) => {
        const authorAffiliations = affiliation_ids
          .map((id) => affiliationById.get(id))
          .filter((a): a is PublicationAffiliation => !!a);
        const bio = author.bio?.trim() || null;

        return (
          <article
            key={author.id}
            className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
          >
            <div className="flex items-start gap-4">
              {author.photo_url ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-divider">
                  <Image src={author.photo_url} alt={author.full_name} fill sizes="56px" className="object-cover" />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[16px] font-bold text-brand">
                  {initials(author.full_name)}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold leading-snug text-text-heading">
                  {author.full_name}
                  {is_corresponding && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-brand">
                      {t("correspondingAuthor")}
                    </span>
                  )}
                </h3>
                {author.full_name_km && (
                  <p className="font-khmer-serif text-[13px] text-text-muted">{author.full_name_km}</p>
                )}
                {authorAffiliations.length > 0 && (
                  <p className="mt-1 text-[12.5px] leading-5 text-text-muted">
                    {authorAffiliations
                      .map((a) => [a.name, a.city, a.country].filter(Boolean).join(", "))
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {orcidUrl(author.orcid) && (
                    <a
                      href={orcidUrl(author.orcid)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-muted transition-colors hover:text-brand"
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
                      public-corresponding-author consent; the corresponding-author
                      badge above signals who to reach via the library contact route. */}
                </div>
              </div>
            </div>
            {bio && <p className="mt-4 text-[13.5px] leading-6 text-text-body">{bio}</p>}
            {author.bio_km?.trim() && (
              <p className="mt-2 font-khmer-serif text-[13px] leading-6 text-text-muted">{author.bio_km}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
