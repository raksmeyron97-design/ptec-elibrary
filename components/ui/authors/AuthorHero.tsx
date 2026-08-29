import AuthorPhoto from "@/components/ui/authors/AuthorPhoto";
import AuthorProfileLinks from "@/components/ui/authors/AuthorProfileLinks";
import AuthorStatsStrip from "@/components/ui/authors/AuthorStatsStrip";
import { authorLinks, type AuthorLinkKind } from "@/lib/authors/links";
import type { AuthorProfile, AuthorStats } from "@/lib/authors/types";

/**
 * The author masthead.
 *
 * Sized to be read, not to impress: the portrait is 96px on a phone and 128px
 * on a laptop, and the whole header stays inside the first viewport on a
 * 375px screen so the works list — the reason anyone is here — is one scroll
 * away rather than three.
 *
 * Everything below the name is conditional. An author the library knows only
 * as a name on a byline gets a name, and nothing renders in place of the
 * position, affiliation, links or statistics they do not have. That is the
 * "three author states" requirement resolved by omission rather than by three
 * separate layouts: there is one header, and it is exactly as tall as the
 * facts it has.
 */
export default function AuthorHero({
  author,
  stats,
  labels,
}: {
  author: AuthorProfile;
  stats: AuthorStats;
  labels: {
    eyebrow: string;
    stats: { works: string; span: string; types: string };
    links: Record<AuthorLinkKind, string>;
  };
}) {
  const links = authorLinks({
    orcid: author.orcid,
    websiteUrl: author.websiteUrl,
    googleScholarUrl: author.googleScholarUrl,
    researchGateUrl: author.researchGateUrl,
  });

  return (
    <header className="mb-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        <AuthorPhoto
          url={author.photoUrl}
          name={author.name}
          size={128}
          className="h-24 w-24 sm:h-32 sm:w-32"
        />

        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-brand">
            {labels.eyebrow}
          </p>

          <h1 className="mt-1.5 text-[clamp(24px,4.5vw,36px)] font-bold leading-[1.2] tracking-tight text-text-heading">
            {author.name}
          </h1>

          {/* The Khmer form of the name, when the record carries one that is
              not simply a copy of the Latin one. lang="km" so a screen reader
              switches voice and the Khmer font stack applies. */}
          {author.nameKm && author.nameKm !== author.name && (
            <p lang="km" className="mt-1 font-khmer-serif text-[17px] leading-[1.9] text-text-muted">
              {author.nameKm}
            </p>
          )}

          {(author.positionTitle || author.affiliation) && (
            <p className="mt-2.5 text-[15px] leading-6 text-text-body">
              {author.positionTitle && (
                <span className="font-semibold">{author.positionTitle}</span>
              )}
              {author.positionTitle && author.affiliation && (
                <span aria-hidden="true" className="mx-1.5 text-divider">
                  ·
                </span>
              )}
              {author.affiliation && <span className="text-text-muted">{author.affiliation}</span>}
            </p>
          )}

          <AuthorProfileLinks links={links} accessibleNames={labels.links} className="mt-4" />
        </div>
      </div>

      <AuthorStatsStrip stats={stats} labels={labels.stats} />
    </header>
  );
}
