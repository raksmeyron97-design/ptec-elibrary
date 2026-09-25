"use client";
// Record health for the catalogue editor's side panel: what the SAVED record
// is missing and what each gap costs a reader. The checks are
// assessCatalogRecordHealth()'s; this component only words them.

import { useTranslations } from "next-intl";
import { AlertCircle, Check, ClipboardCheck, Info } from "lucide-react";
import { ContextPanel } from "@/components/admin/kit/form";
import type { RecordHealthCheck } from "@/lib/catalogs/record-health";

const MESSAGE: Record<RecordHealthCheck["id"], { ok: string; bad: string }> = {
  "search-visibility": { ok: "visibilityOk", bad: "visibilityRecordOnly" },
  copies: { ok: "copiesOk", bad: "copiesBad" },
  "call-number": { ok: "callNumberOk", bad: "callNumberBad" },
  subject: { ok: "subjectOk", bad: "subjectBad" },
  isbn: { ok: "isbnOk", bad: "isbnBad" },
  publication: { ok: "publicationOk", bad: "publicationBad" },
  cover: { ok: "coverOk", bad: "coverBad" },
};

function messageKey(check: RecordHealthCheck): string {
  if (check.ok) return MESSAGE[check.id].ok;
  if (check.id === "search-visibility") {
    if (check.reason === "derived-description") return "visibilityDerived";
    if (check.reason === "unchecked-description") return "visibilityUnchecked";
  }
  return MESSAGE[check.id].bad;
}

export default function RecordHealthPanel({ checks }: { checks: RecordHealthCheck[] }) {
  const t = useTranslations("adminCatalog.edit.health");
  const gaps = checks.filter((c) => !c.ok && c.tier === "action").length;
  // Failing checks first, the ones readers feel before the nice-to-haves.
  const ordered = [...checks].sort(
    (a, b) => Number(a.ok) - Number(b.ok) || Number(a.tier === "info") - Number(b.tier === "info"),
  );

  return (
    <ContextPanel title={t("title")} icon={ClipboardCheck} hint={t("hint")}>
      <p className={`mb-3 text-[13px] font-medium ${gaps ? "text-warning-text" : "text-success-text"}`}>
        {gaps ? t("summaryAction", { count: gaps }) : t("summaryOk")}
      </p>
      <ul className="space-y-2 text-[13px]">
        {ordered.map((c) => {
          const Icon = c.ok ? Check : c.tier === "action" ? AlertCircle : Info;
          const tone = c.ok ? "text-success-text" : c.tier === "action" ? "text-warning-text" : "text-text-muted";
          return (
            <li key={c.id} className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden="true" />
              <span className={c.ok ? "text-text-muted" : "text-text-body"}>
                {/* The icon is decorative; the words carry the verdict. */}
                {!c.ok && <span className="sr-only">{c.tier === "action" ? t("tierAction") : t("tierInfo")}: </span>}
                {t(messageKey(c))}
              </span>
            </li>
          );
        })}
      </ul>
    </ContextPanel>
  );
}
