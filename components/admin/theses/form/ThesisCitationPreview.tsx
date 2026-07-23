"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { buildCitation, type CiteFormat } from "@/lib/theses/citation";

const FORMAT_LABELS: Record<CiteFormat, string> = {
  apa: "APA",
  mla: "MLA",
  chicago: "Chicago",
  ieee: "IEEE",
  bibtex: "BibTeX",
  ris: "RIS",
};

export default function ThesisCitationPreview({
  title,
  authorNames,
  cohort,
  academicYear,
  publishedAt,
  doi,
  program,
  institution,
}: {
  title: string;
  authorNames: string;
  cohort: string;
  academicYear: string;
  publishedAt: string;
  doi: string;
  program: string;
  /** Published institution name — server-resolved, used by the citation preview. */
  institution: string;
}) {
  const t = useTranslations("adminThesisForm.citation");
  const [format, setFormat] = useState<CiteFormat>("apa");
  const [copied, setCopied] = useState(false);

  const citation = buildCitation(
    format,
    {
      title,
      author_names: authorNames,
      cohort,
      academic_year: academicYear,
      published_at: publishedAt || null,
      doi: doi || null,
      department: program || null,
      abstract: "",
    },
    "preview",
    institution,
  );

  async function copy() {
    await navigator.clipboard?.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-text-heading">{t("heading")}</h3>
        <div className="w-32 [&_button]:h-8">
          <SearchableSelect
            name="citation-format"
            ariaLabel={t("format")}
            value={format}
            onChange={(v) => setFormat(v as CiteFormat)}
            options={Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </div>
      <div className="relative rounded-lg border border-divider bg-paper p-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-body">{citation}</pre>
        <button
          type="button"
          onClick={copy}
          aria-label={t("copy")}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-surface hover:text-brand"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {(!authorNames.trim() || !publishedAt) && (
        <p className="text-[11px] text-amber-600">{t("qualityHint")}</p>
      )}
    </div>
  );
}
