import { getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import type { PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";

export default async function AuthorAffiliationPanel({
  orderedAffiliations,
  correspondingAuthors,
}: {
  orderedAffiliations: { marker: number; affiliation: PublicationAffiliation }[];
  correspondingAuthors: PublicationAuthorship[];
}) {
  if (orderedAffiliations.length === 0 && correspondingAuthors.length === 0) return null;
  const t = await getTranslations("publicationDetail");

  return (
    <details className="group mt-3 rounded-xl border border-divider bg-paper/50 open:bg-paper/80">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-[12.5px] font-semibold text-text-muted transition-colors hover:text-brand">
        {t("affiliationsSummary")}
      </summary>
      <div className="space-y-2 border-t border-divider px-4 py-3">
        {orderedAffiliations.map(({ marker, affiliation }) => (
          <p key={affiliation.id} className="flex gap-2 text-[13px] leading-6 text-text-body">
            <sup className="mt-1.5 shrink-0 font-bold text-text-muted">{marker}</sup>
            <span>
              {affiliation.name}
              {affiliation.name_km && <span className="ml-1.5 text-text-muted">({affiliation.name_km})</span>}
              {[affiliation.city, affiliation.country].filter(Boolean).length > 0 && (
                <span className="text-text-muted">
                  {" — "}
                  {[affiliation.city, affiliation.country].filter(Boolean).join(", ")}
                </span>
              )}
            </span>
          </p>
        ))}
        {correspondingAuthors.map((a) => (
          <p key={a.author.id} className="flex items-center gap-2 text-[13px] text-text-body">
            <sup className="font-bold text-brand">*</sup>
            <span className="font-medium">{a.author.full_name}</span>
            {a.author.email && (
              <a
                href={`mailto:${a.author.email}`}
                className="inline-flex items-center gap-1 text-brand hover:underline"
              >
                <Mail className="h-3.5 w-3.5" /> {a.author.email}
              </a>
            )}
            {a.author.orcid && (
              <a
                href={`https://orcid.org/${a.author.orcid.replace(/^https?:\/\/orcid\.org\//, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-text-muted hover:text-brand"
              >
                ORCID: {a.author.orcid.replace(/^https?:\/\/orcid\.org\//, "")}
              </a>
            )}
          </p>
        ))}
      </div>
    </details>
  );
}
