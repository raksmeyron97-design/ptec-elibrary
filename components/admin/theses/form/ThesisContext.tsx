"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, FileText, Search, Users } from "lucide-react";
import { ContextPanel } from "@/components/admin/kit/form";
import type { ThesisStepKey } from "./thesis-steps";

export interface ThesisContextProps {
  step: ThesisStepKey;
  siteUrl: string;
  title: string;
  slug: string;
  abstract: string;
  keywords: string[];
  authorCount: number;
  referenceCount: number;
  hasPdf: boolean;
  hasCover: boolean;
  /** Human labels for the required things a publish is still waiting on. */
  missingForPublish: string[];
}

const TITLE_LIMIT = 60;
const DESC_LIMIT = 155;

/**
 * Context sidebar for the thesis form: one panel per step, answering the
 * question that step raises rather than restating the fields beside it.
 *
 * The Review step gets nothing — that tab is already mission control, and a
 * summary of the summary is noise.
 */
export default function ThesisContext(props: ThesisContextProps) {
  const { step } = props;
  if (step === "review") return null;
  if (step === "basic" || step === "abstract") return <SeoPreview {...props} />;
  if (step === "people") return <PeopleContext {...props} />;
  if (step === "files") return <FilesContext {...props} />;
  return <ReadinessContext {...props} />;
}

function SeoPreview({ siteUrl, title, slug, abstract }: ThesisContextProps) {
  const t = useTranslations("adminThesisForm.context");
  const shownTitle = title.trim() || t("untitled");
  const description = abstract.trim().replace(/\s+/g, " ");

  return (
    <ContextPanel title={t("seoTitle")} icon={Search} hint={t("seoHint")}>
      <div className="rounded-lg border border-divider bg-bg-surface p-3">
        <p className="truncate text-[11px] text-success-text">
          {siteUrl}/theses/{slug || "…"}
        </p>
        {/*
          Khmer titles are the norm here, so this preview runs at 15px/1.5 — the
          same floor the theses table uses. A 13px preview of a Khmer title is
          not a preview of anything a reader will see.
        */}
        <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-[1.5] text-info-text">
          {shownTitle}
        </p>
        <p className="mt-1 line-clamp-3 text-[12.5px] leading-[1.6] text-text-body">
          {description || t("noAbstract")}
        </p>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <Measure label={t("measureTitle")} length={shownTitle.length} limit={TITLE_LIMIT} cut={t("willCut")} />
        <Measure label={t("measureSnippet")} length={description.length} limit={DESC_LIMIT} cut={t("willCut")} />
      </dl>
    </ContextPanel>
  );
}

function Measure({
  label,
  length,
  limit,
  cut,
}: {
  label: string;
  length: number;
  limit: number;
  cut: string;
}) {
  const over = length > limit;
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`font-medium tabular-nums ${over ? "text-warning-text" : "text-text-body"}`}>
        {length}/{limit}
        {over ? ` — ${cut}` : ""}
      </dd>
    </div>
  );
}

function PeopleContext({ authorCount }: ThesisContextProps) {
  const t = useTranslations("adminThesisForm.context");
  return (
    <ContextPanel title={t("peopleTitle")} icon={Users} hint={t("peopleHint")}>
      <p className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${authorCount > 0 ? "text-text-heading" : "text-danger"}`}>
          {authorCount}
        </span>
        <span className="text-[13px] text-text-muted">{t("authorsListed", { count: authorCount })}</span>
      </p>
    </ContextPanel>
  );
}

function FilesContext({ hasPdf, hasCover }: ThesisContextProps) {
  const t = useTranslations("adminThesisForm.context");
  return (
    <ContextPanel title={t("filesTitle")} icon={FileText} hint={t("filesHint")}>
      <ul className="space-y-1.5 text-[13px]">
        <FileRow label={t("thesisPdf")} present={hasPdf} required requiredLabel={t("required")} presentLabel={t("present")} optionalLabel={t("optional")} />
        <FileRow label={t("coverImage")} present={hasCover} requiredLabel={t("required")} presentLabel={t("present")} optionalLabel={t("optional")} />
      </ul>
    </ContextPanel>
  );
}

function FileRow({
  label,
  present,
  required,
  requiredLabel,
  presentLabel,
  optionalLabel,
}: {
  label: string;
  present: boolean;
  required?: boolean;
  requiredLabel: string;
  presentLabel: string;
  optionalLabel: string;
}) {
  return (
    <li className="flex items-center gap-2">
      {present ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <AlertTriangle className={`h-4 w-4 shrink-0 ${required ? "text-danger" : "text-warning"}`} aria-hidden="true" />
      )}
      <span className="text-text-body">{label}</span>
      <span className="ml-auto text-xs text-text-muted">
        {present ? presentLabel : required ? requiredLabel : optionalLabel}
      </span>
    </li>
  );
}

function ReadinessContext({ keywords, referenceCount, missingForPublish }: ThesisContextProps) {
  const t = useTranslations("adminThesisForm.context");
  return (
    <ContextPanel title={t("readinessTitle")} icon={CheckCircle2} hint={t("readinessHint")}>
      <div className="grid grid-cols-2 gap-2">
        <Tile value={keywords.length} label={t("keywords")} />
        <Tile value={referenceCount} label={t("references")} />
      </div>
      {missingForPublish.length === 0 ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-success-text">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {t("nothingOutstanding")}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5 border-t border-divider pt-3">
          {missingForPublish.map((label) => (
            <li key={label} className="flex items-start gap-1.5 text-xs leading-[1.55] text-text-body">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}
    </ContextPanel>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-divider bg-bg-surface px-2 py-2 text-center">
      <p className="text-lg font-bold tabular-nums leading-none text-text-heading">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}
