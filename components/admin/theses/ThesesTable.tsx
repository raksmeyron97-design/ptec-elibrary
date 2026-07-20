"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Eye, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import ThesisActionsMenu from "@/components/admin/theses/ThesisActionsMenu";
import ThesisMetadataBadge from "@/components/admin/theses/ThesisMetadataBadge";
import ThesisFileStatusBadge from "@/components/admin/theses/ThesisFileStatusBadge";
import { STATUS_BADGE_STYLES, STATUS_LABELS, effectiveThesisDownloadPolicy, type ThesisListRow, type ThesisProgramOption } from "@/lib/admin/theses-shared";
import { thesisHref } from "@/lib/theses";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** At-a-glance effective download policy + Top-10 rank (server enforces). */
function DownloadPolicyBadge({ thesis }: { thesis: ThesisListRow }) {
  const t = useTranslations("adminTheses.downloadPolicy");
  const eff = effectiveThesisDownloadPolicy(thesis);
  const allowed = eff.policy === "allowed";
  const sourceLabel =
    eff.source === "allow" ? t("adminAllow") : eff.source === "block" ? t("adminBlock") : t("automatic");
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        title={`${allowed ? t("allowed") : t("blocked")} · ${sourceLabel}`}
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          allowed
            ? "bg-emerald-100 text-emerald-700"
            : "bg-red-100 text-red-700"
        }`}
      >
        {allowed ? t("allowed") : t("blocked")}
      </span>
      {eff.isTopTen && thesis.rank != null && (
        <span className="text-[10px] font-semibold text-amber-700">{t("topTen", { rank: thesis.rank })}</span>
      )}
      {eff.source !== "automatic" && (
        <span className="text-[9px] uppercase tracking-wide text-text-muted">{sourceLabel}</span>
      )}
    </div>
  );
}

function programLabel(programs: ThesisProgramOption[], code: string | null): string {
  if (!code) return "—";
  return programs.find((p) => p.code === code)?.label ?? code;
}

type RowActions = {
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
};

export default function ThesesTable({
  rows,
  programs,
  selectedIds,
  allSelected,
  busyId,
  expandedId,
  onToggleSelect,
  onToggleSelectAll,
  onToggleExpand,
  ...actions
}: RowActions & {
  rows: ThesisListRow[];
  programs: ThesisProgramOption[];
  selectedIds: Set<string>;
  allSelected: boolean;
  busyId: string | null;
  expandedId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleExpand: (id: string) => void;
}) {
  const t = useTranslations("adminTheses.table");
  const tStatus = useTranslations("adminTheses.status");
  return (
    <div className="hidden rounded-xl border border-divider bg-bg-surface shadow-sm md:block">
      <div className="">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted [&>th:first-child]:rounded-tl-xl [&>th:last-child]:rounded-tr-xl">
              <th scope="col" className="w-10 px-4 py-3">
                <label className="sr-only" htmlFor="select-all-theses">{t("selectAll")}</label>
                <input
                  id="select-all-theses"
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30"
                />
              </th>
              <th scope="col" className="w-6 px-2 py-3" />
              <th scope="col" className="w-14 px-2 py-3 text-center">{t("cover")}</th>
              <th scope="col" className="px-4 py-3">{t("titleCol")}</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">{t("programCol")}</th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("metadata")}</th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("files")}</th>
              <th scope="col" className="hidden px-4 py-3 text-right lg:table-cell">{t("statsCol")}</th>
              <th scope="col" className="px-4 py-3 text-center">{t("statusCol")}</th>
              <th scope="col" className="hidden px-4 py-3 text-center md:table-cell">{t("download")}</th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("updated")}</th>
              <th scope="col" className="px-4 py-3 text-right">{t("actionsCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {rows.map((thesis) => {
              const isSelected = selectedIds.has(thesis.id);
              const isBusy = busyId === thesis.id;
              const isExpanded = expandedId === thesis.id;
              const hasPdf = Boolean(thesis.fileUrl);
              const hasCover = Boolean(thesis.coverUrl);

              return (
                <Fragment key={thesis.id}>
                  <tr
                    className={`transition-colors hover:bg-paper/80 ${isBusy ? "opacity-50" : ""} ${isSelected ? "bg-brand/5" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`select-thesis-${thesis.id}`}>{t("selectOne", { title: thesis.title })}</label>
                      <input
                        id={`select-thesis-${thesis.id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(thesis.id)}
                        className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30"
                      />
                    </td>
                    <td className="px-1 py-3">
                      <button
                        type="button"
                        onClick={() => onToggleExpand(thesis.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? t("collapseDetails", { title: thesis.title }) : t("expandDetails", { title: thesis.title })}
                        className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-paper hover:text-text-heading"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-2 py-3 text-center">
                      {thesis.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thesis.coverUrl}
                          alt=""
                          loading="lazy"
                          className="mx-auto h-14 w-10 rounded object-cover shadow-sm"
                        />
                      ) : (
                        <div className="mx-auto flex h-14 w-10 items-center justify-center rounded border border-divider bg-paper text-[10px] text-text-muted" aria-hidden="true">
                          —
                        </div>
                      )}
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onToggleExpand(thesis.id)}
                        title={thesis.title}
                        className="text-left font-semibold leading-[1.6] text-text-heading hover:text-brand line-clamp-2"
                      >
                        {thesis.title}
                      </button>
                      <p className="mt-0.5 truncate text-xs text-text-muted">{thesis.authorNames || t("noAuthor")}</p>
                      <p className="truncate text-xs text-text-muted">{thesis.advisorName ? t("advisor", { name: thesis.advisorName }) : t("noAdvisor")}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-text-body lg:table-cell">
                      <p className="font-medium text-text-heading">{programLabel(programs, thesis.program)}</p>
                      <p className="text-xs text-text-muted">
                        {thesis.cohort ? t("cohort", { cohort: thesis.cohort }) : t("noCohort")} · {thesis.academicYear || t("noYear")}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <ThesisMetadataBadge thesis={thesis} />
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <ThesisFileStatusBadge hasPdf={hasPdf} hasCover={hasCover} />
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                      <div className="flex flex-col items-end gap-0.5 text-xs text-text-muted">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {thesis.viewCount.toLocaleString()}</span>
                        <span className="inline-flex items-center gap-1"><Download className="h-3 w-3" /> {thesis.downloadCount.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE_STYLES[thesis.status]}`}>
                        {STATUS_LABELS[thesis.status] ? tStatus(thesis.status) : thesis.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-center md:table-cell">
                      <DownloadPolicyBadge thesis={thesis} />
                    </td>
                    <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted xl:table-cell">{formatDate(thesis.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <ThesisActionsMenu
                        thesis={thesis}
                        busy={isBusy}
                        onPublish={() => actions.onPublish(thesis.id)}
                        onUnpublish={() => actions.onUnpublish(thesis.id)}
                        onArchive={() => actions.onArchive(thesis.id)}
                        onUnarchive={() => actions.onUnarchive(thesis.id)}
                        onDuplicate={() => actions.onDuplicate(thesis.id)}
                        onDelete={() => actions.onDeleteRequest(thesis.id, thesis.title)}
                      />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-paper/60">
                      <td colSpan={12} className="px-6 py-4">
                        <ThesisRowDetails thesis={thesis} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ThesisRowDetails({ thesis }: { thesis: ThesisListRow }) {
  const t = useTranslations("adminTheses.details");
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-2">
        <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("abstractPreview")}</p>
        <p className="mt-1 leading-[1.75] text-text-body line-clamp-4">{thesis.abstract || t("noAbstract")}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("keywords")}</p>
        {thesis.keywords.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {thesis.keywords.map((k) => (
              <span key={k} className="rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 text-xs text-text-body">{k}</span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-text-muted">{t("noKeywords")}</p>
        )}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("references")}</p>
        <p className="mt-1 text-text-body">
          {thesis.references ? t("referenceCount", { count: thesis.references.split(/\r?\n+/).filter(Boolean).length }) : t("noneYet")}
        </p>
        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-text-muted">{t("publicUrl")}</p>
        {thesis.status === "published" ? (
          <Link href={thesisHref(thesis)} target="_blank" className="mt-1 inline-flex items-center gap-1 text-brand hover:underline">
            {thesisHref(thesis)} <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <p className="mt-1 text-text-muted">{t("notPublished")}</p>
        )}
      </div>
    </div>
  );
}
