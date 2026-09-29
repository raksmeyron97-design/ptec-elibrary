import { useTranslations } from "next-intl";
import type { Fact } from "@/lib/theses/record";
import { LABEL } from "./styles";

/**
 * At a glance: the catalogue facts the title page does not already state —
 * dates, language, department, licence, identifier. Scanned, not read.
 *
 * The facts are chosen in lib/theses/record.ts, which places every fact on
 * the page exactly once; a fact the record does not hold is not passed, so
 * the grid never prints an empty row or a "Not specified".
 */
export default function FactsGrid({ facts }: { facts: Fact[] }) {
  const t = useTranslations("thesisDetail");
  if (facts.length === 0) return null;

  return (
    <section aria-labelledby="thesis-facts-heading" className="rounded-2xl border border-border bg-bg-surface px-4 py-2 sm:px-6 sm:py-4">
      <h2 id="thesis-facts-heading" className={`${LABEL} border-b border-divider pb-2 pt-2 sm:pt-0`}>
        {t("factsHeading")}
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-x-6">
        {facts.map((f) => (
          <div key={f.id} className="min-w-0 py-2.5">
            <dt className={`${LABEL} mb-0.5`}>{f.label}</dt>
            <dd className={`text-[15px] font-semibold leading-[22px] text-text-heading [overflow-wrap:anywhere] ${f.mono ? "font-mono text-[13.5px] font-medium" : ""}`}>
              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel={f.id === "licence" ? "license noopener noreferrer" : "noopener noreferrer"}
                  className="rounded-sm text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  {f.value}
                </a>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
