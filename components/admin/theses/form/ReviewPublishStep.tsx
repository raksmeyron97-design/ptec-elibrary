"use client";

import { Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import ThesisMetadataBadge from "@/components/admin/theses/ThesisMetadataBadge";
import ThesisSeoSettings from "./ThesisSeoSettings";
import ThesisCitationPreview from "./ThesisCitationPreview";
import { thesisPublishWarnings } from "@/lib/admin/thesis-validation";
import type { ThesisStatus } from "@/lib/admin/theses-shared";
import type { MetadataQualityInput } from "@/lib/admin/thesis-metadata-quality";

const fieldClass =
  "h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60";

const STATUS_OPTIONS: { value: ThesisStatus; label: string; help: string }[] = [
  { value: "draft", label: "Draft", help: "Not visible to the public" },
  { value: "published", label: "Publish now", help: "Goes live immediately on save" },
  { value: "scheduled", label: "Schedule", help: "Goes live automatically at a future date/time" },
];

export default function ReviewPublishStep({
  thesis,
  siteUrl,
  slug,
  status, onStatusChange,
  scheduledAt, onScheduledAtChange,
  scheduledAtError,
  seoTitle, onSeoTitleChange,
  seoDescription, onSeoDescriptionChange,
  ogImage, onOgImageChange,
  onPreview,
  disabled,
}: {
  thesis: Omit<MetadataQualityInput, "program" | "cohort" | "academicYear"> & {
    program: string; cohort: string; academicYear: string; doi: string;
  };
  siteUrl: string;
  slug: string;
  status: ThesisStatus;
  onStatusChange: (v: ThesisStatus) => void;
  scheduledAt: string;
  onScheduledAtChange: (v: string) => void;
  scheduledAtError?: string | null;
  seoTitle: string; onSeoTitleChange: (v: string) => void;
  seoDescription: string; onSeoDescriptionChange: (v: string) => void;
  ogImage: string; onOgImageChange: (v: string) => void;
  onPreview: () => void;
  disabled?: boolean;
}) {
  const warnings = thesisPublishWarnings({
    title: thesis.title ?? "", slug: thesis.slug ?? "", program: thesis.program, cohort: thesis.cohort,
    academicYear: thesis.academicYear, authorNames: thesis.authorNames, advisorName: thesis.advisorName,
    fileUrl: thesis.fileUrl, coverUrl: thesis.coverUrl, abstract: thesis.abstract, keywords: thesis.keywords ?? [],
    references: thesis.references, license: thesis.license,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-5">
        <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              {thesis.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thesis.coverUrl} alt="" className="h-24 w-16 shrink-0 rounded object-cover shadow-sm" />
              ) : (
                <div className="h-24 w-16 shrink-0 rounded border border-dashed border-divider bg-paper" />
              )}
              <div>
                <h3 className="text-base font-bold leading-snug text-text-heading">{thesis.title || "Untitled thesis"}</h3>
                <p className="mt-1 text-sm text-text-muted">{thesis.authorNames || "No author listed"}</p>
                <p className="text-xs text-text-muted">
                  {thesis.program || "No program"} · {thesis.cohort ? `Cohort ${thesis.cohort}` : "No cohort"} · {thesis.academicYear || "No year"}
                </p>
                <p className="mt-1 font-mono text-xs text-brand">{siteUrl}/theses/{slug || "…"}</p>
              </div>
            </div>
            <ThesisMetadataBadge thesis={thesis} />
          </div>

          <button
            type="button"
            onClick={onPreview}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body hover:bg-paper"
          >
            <Eye className="h-3.5 w-3.5" /> Open public preview
          </button>
        </div>

        {warnings.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> {warnings.length} recommendation{warnings.length !== 1 ? "s" : ""} before publishing
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {warnings.map((w) => <li key={w.key}>• {w.label}</li>)}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Metadata looks complete.
          </div>
        )}

        <ThesisCitationPreview
          title={thesis.title ?? ""}
          authorNames={thesis.authorNames ?? ""}
          cohort={thesis.cohort}
          academicYear={thesis.academicYear}
          publishedAt=""
          doi={thesis.doi}
          program={thesis.program}
        />
      </div>

      <div className="space-y-5">
        <div className="space-y-4 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
          <div>
            <span className="mb-2 block text-sm font-semibold text-text-body">Publish settings</span>
            <div className="space-y-2" role="radiogroup" aria-label="Publish status">
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                    status === opt.value ? "border-brand bg-brand/5" : "border-divider hover:bg-paper"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={opt.value}
                    checked={status === opt.value}
                    onChange={() => onStatusChange(opt.value)}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 border-divider text-brand focus:ring-focus-ring/30"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-text-heading">{opt.label}</span>
                    <span className="block text-xs text-text-muted">{opt.help}</span>
                  </span>
                </label>
              ))}
            </div>

            {status === "scheduled" && (
              <div className="mt-2.5">
                <label htmlFor="thesis-scheduledAt" className="mb-1.5 block text-xs font-semibold text-text-body">
                  Publish date &amp; time <span className="text-red-500">*</span>
                </label>
                <input
                  id="thesis-scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => onScheduledAtChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                  disabled={disabled}
                  required={status === "scheduled"}
                  aria-invalid={!!scheduledAtError}
                  className={fieldClass}
                />
                {scheduledAtError && <p className="mt-1 text-xs text-red-600">{scheduledAtError}</p>}
              </div>
            )}
          </div>
        </div>

        <ThesisSeoSettings
          seoTitle={seoTitle}
          seoDescription={seoDescription}
          ogImage={ogImage}
          onSeoTitleChange={onSeoTitleChange}
          onSeoDescriptionChange={onSeoDescriptionChange}
          onOgImageChange={onOgImageChange}
          fallbackTitle={thesis.title ?? ""}
          fallbackDescription={(thesis.abstract ?? "").slice(0, 160)}
          fallbackImage={thesis.coverUrl}
          siteUrl={siteUrl}
          slug={slug}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
