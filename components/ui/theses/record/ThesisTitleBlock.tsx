import Image from "next/image";
import { Award } from "lucide-react";
import { useTranslations } from "next-intl";
import { TOP_N_PROTECTED } from "@/lib/theses/access";
import type { ThesisRecord } from "@/lib/theses/record";
import { scriptOf } from "@/lib/theses/script";
import { LABEL } from "./styles";

/**
 * The record's title page: what a printed thesis puts on its first leaf, in
 * the order it prints it — the degree, the title in both languages, who wrote
 * it and under whom, and the institution that granted it.
 *
 * One parchment surface, and the page's one <h1>. It replaces a hero whose
 * largest element was a cover slot most theses leave empty ("No cover"). On a
 * phone it runs full bleed, so the first screen is the record itself rather
 * than a card inside a card.
 *
 * Every value is placed here and nowhere else on the page — the facts grid
 * below carries only what this block does not say (lib/theses/record.ts).
 */
export default function ThesisTitleBlock({ record }: { record: ThesisRecord }) {
  const t = useTranslations("thesisDetail");
  const { title, titleKm, institution } = record;
  const place = [institution.faculty, institution.cohort, institution.academicYear].filter(Boolean).join(" · ");

  return (
    <header className="-mx-4 border-b border-border bg-parchment px-4 pb-5 pt-6 sm:mx-0 sm:rounded-2xl sm:border sm:px-8 sm:pb-7 sm:pt-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className={LABEL}>
          {record.typeLabel}
          {record.degree ? ` · ${record.degree}` : ""}
        </p>
        {record.rank != null && (
          <span
            title={t("rankTitle", { rank: record.rank })}
            className="inline-flex h-[26px] items-center gap-1 rounded-full bg-plate px-2.5 text-[12px] font-semibold text-blue-50"
          >
            <Award className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span className="sr-only">{t("rankSr", { rank: record.rank })} </span>
            <span aria-hidden="true">{t("rankBadge", { count: TOP_N_PROTECTED, rank: record.rank })}</span>
          </span>
        )}
      </div>
      <hr className="mt-4 h-0.5 w-12 border-0 bg-accent-line" />

      {/* The measure is in `ch`, not px: a Khmer character is far wider than
          a Latin one, so a px cap would give the two scripts different line
          lengths. `lang` is the title's own script, never the UI locale. */}
      <h1
        lang={title.lang}
        className={
          title.lang === "km"
            ? "mt-4 max-w-[24ch] text-balance font-kh text-[clamp(26px,3vw,36px)] font-bold leading-[1.5] text-text-heading"
            : "mt-4 max-w-[24ch] text-balance font-record text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.2] tracking-[-0.01em] text-text-heading"
        }
      >
        {title.text}
      </h1>

      {/* The parallel title, as a title page prints it: directly under the
          first, quieter. A paragraph, not a second heading. */}
      {titleKm && (
        <p lang="km" className="mt-2 max-w-[40ch] text-balance font-kh text-[clamp(18px,1.9vw,22px)] leading-[1.55] text-text-body">
          {titleKm}
        </p>
      )}

      {/* The lead repeats the abstract's first sentence, a scroll below. On a
          phone it would push the access panel's button off the first screen,
          so it is shown from `sm` up. */}
      {record.lead && (
        <p className="mt-4 hidden max-w-[68ch] text-[17px] leading-[1.7] text-text-body sm:block">{record.lead}</p>
      )}

      {(record.authors.length > 0 || record.advisor || record.coAdvisor) && (
        <div className="mt-4 grid gap-1 text-[15px] leading-6 text-text-body sm:mt-5">
          {record.authors.length > 0 && (
            <p>
              <span className="text-text-muted">{t("byline")} </span>
              <Name text={record.authors.join(", ")} />
            </p>
          )}
          {(record.advisor || record.coAdvisor) && (
            <p>
              {record.advisor && (
                <>
                  <span className="text-text-muted">{t("metaAdvisor")} </span>
                  <Name text={record.advisor} />
                </>
              )}
              {record.advisor && record.coAdvisor && <span className="text-text-muted"> · </span>}
              {record.coAdvisor && (
                <>
                  <span className="text-text-muted">{t("metaCoAdvisor")} </span>
                  <Name text={record.coAdvisor} />
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* The granting institution. The seal's alt is empty: the name beside
          it is the text. */}
      <div className="mt-5 flex items-center gap-3 border-t border-border pt-3 text-[13.5px] leading-5 text-text-muted sm:mt-6 sm:pt-4">
        <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
        <p className="min-w-0">
          <span className="font-semibold text-text-heading">{institution.name}</span>
          {place && <span className="block sm:inline"><span className="hidden sm:inline"> · </span>{place}</span>}
        </p>
      </div>
    </header>
  );
}

/** A person's name, spoken and set in its own script. Khmer names are
 *  family-name first and are never re-ordered here. */
function Name({ text }: { text: string }) {
  const lang = scriptOf(text);
  return (
    <span lang={lang} className={`font-semibold text-text-heading ${lang === "km" ? "font-kh" : ""}`}>
      {text}
    </span>
  );
}
