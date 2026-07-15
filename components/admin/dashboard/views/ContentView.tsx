/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { TrendingDown, TrendingUp, Minus, ExternalLink, Pencil, Search, BarChart3, Building2 } from "lucide-react";
import {
  getContentIntelligence,
  CONTENT_PRESETS,
  PRIMARY_CONTENT_PRESETS,
  type ContentPreset,
} from "@/lib/admin/intelligence";
import { serializeDashboardFilters, type DashboardFilters } from "@/lib/admin/dashboard-shared";
import FreshnessLine from "../FreshnessLine";
import CollectionHealthCards from "../CollectionHealthCards";
import ContentPresetMenu from "../ContentPresetMenu";
import InfoTip from "../InfoTip";

function parsePreset(raw: string | undefined): ContentPreset {
  return (CONTENT_PRESETS as readonly string[]).includes(raw ?? "") ? (raw as ContentPreset) : "top";
}

function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 1;
}

export default async function ContentView({
  filters,
  presetParam,
  pageParam,
  qParam,
}: {
  filters: DashboardFilters;
  presetParam?: string;
  pageParam?: string;
  qParam?: string;
}) {
  const t = await getTranslations("adminDashboard.content");
  const tRange = await getTranslations("adminDashboard.rangeLabel");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");

  const preset = parsePreset(presetParam);
  const q = (qParam ?? "").trim().slice(0, 80);
  const data = await getContentIntelligence(filters, { page: parsePage(pageParam), preset, q });
  const rangeLabel = filters.range === "custom" ? data.rangeLabel : tRange(filters.range);

  const baseQs = serializeDashboardFilters(filters);
  const hrefFor = (p: ContentPreset, page = 1, keepQ = true) => {
    const sp = new URLSearchParams(baseQs);
    if (p !== "top") sp.set("preset", p);
    if (page > 1) sp.set("page", String(page));
    if (keepQ && q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const overflowPresets = CONTENT_PRESETS.filter((p) => !PRIMARY_CONTENT_PRESETS.includes(p));
  const maxViewsPer = Math.max(1, ...data.departments.map((x) => x.viewsPerResource ?? 0));

  const trendIcon = (delta: number) =>
    delta > 0 ? (
      <span className="inline-flex items-center gap-0.5 text-emerald-700">
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">+{nf.format(delta)}</span>
      </span>
    ) : delta < 0 ? (
      <span className="inline-flex items-center gap-0.5 text-rose-700">
        <TrendingDown className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">{nf.format(delta)}</span>
      </span>
    ) : (
      <span className="inline-flex items-center text-text-muted">
        <Minus className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{t("noChange")}</span>
      </span>
    );

  const TYPE_BADGE: Record<string, string> = {
    book: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    research_report: "bg-violet-50 text-violet-700 ring-violet-100",
    publication: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    post: "bg-amber-50 text-amber-800 ring-amber-100",
  };
  const typeBadge = (type: string) => (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${
        TYPE_BADGE[type] ?? "bg-slate-50 text-slate-600 ring-slate-100"
      }`}
    >
      {t(`types.${type}`)}
    </span>
  );

  // Zeros render as a muted dash so the non-zero numbers carry the table;
  // the sr-only "0" keeps the cell unambiguous for screen readers.
  const mutedZero = (
    <>
      <span aria-hidden="true" className="text-text-muted/60">—</span>
      <span className="sr-only">0</span>
    </>
  );

  const missingLabel = (missing: string[]) =>
    missing.length === 0
      ? t("metaComplete")
      : t("metaMissing", { fields: missing.map((m) => t(`missingFields.${m}`)).join(", ") });

  const pctChip = (pctVal: number, missing: string[]) => {
    const cls =
      pctVal >= 80 ? "bg-emerald-100 text-emerald-800" : pctVal >= 50 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700";
    return (
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${cls}`} title={missingLabel(missing)}>
        {pctVal}%
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Preset chips (3 primary) + overflow menu + search ── */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label={t("presetsLabel")} className="flex items-center gap-1 overflow-x-auto">
          {PRIMARY_CONTENT_PRESETS.map((p) => (
            <Link
              key={p}
              href={hrefFor(p)}
              aria-current={p === preset ? "page" : undefined}
              className={`inline-block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                p === preset
                  ? "bg-brand text-white shadow-sm"
                  : "text-text-muted hover:bg-paper hover:text-text-heading"
              }`}
            >
              {t(`presets.${p}`)}
            </Link>
          ))}
        </nav>
        <ContentPresetMenu
          current={preset}
          options={overflowPresets.map((p) => ({ value: p, label: t(`presets.${p}`), href: hrefFor(p) }))}
          label={t("moreViews")}
        />
        <form action="/admin" method="get" className="ms-auto flex items-center gap-1.5" role="search">
          {[...new URLSearchParams(baseQs).entries()].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {preset !== "top" && <input type="hidden" name="preset" value={preset} />}
          <div className="relative">
            <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={80}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-44 rounded-lg border border-divider bg-bg-surface ps-7 pe-2 text-[12px] text-text-body placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand sm:w-56"
            />
          </div>
        </form>
      </div>

      {/* ── Performance table ── */}
      <section aria-labelledby="content-table-heading" className="dash-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--views dash-ico--md" aria-hidden="true">
              <BarChart3 className="h-[18px] w-[18px]" />
            </span>
            <h3 id="content-table-heading" className="text-[14px] font-bold text-text-heading">
              {t("tableTitle")}
            </h3>
          </div>
          <span className="text-[11.5px] text-text-muted">
            {q
              ? t("tableCountFiltered", { count: nf.format(data.total), q })
              : t("tableCount", { count: nf.format(data.total), range: rangeLabel })}
          </span>
        </div>
        {data.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-text-muted">{t("emptyPreset")}</p>
        ) : (
          <div className="relative mt-2.5 max-h-[600px] overflow-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead className="dash-thead sticky top-0 z-10">
                <tr className="text-[11px] font-bold">
                  <th scope="col" className="px-4 py-2 text-start font-bold">{t("cols.title")}</th>
                  <th scope="col" className="px-2 py-2 text-start font-bold">{t("cols.type")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("cols.engagement")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("cols.downloads")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">
                    <span className="inline-flex items-center gap-0.5">
                      {t("cols.conversion")}
                      <InfoTip label={t("cols.conversion")} text={t("conversionFormula")} />
                    </span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("cols.trend")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">
                    <span className="inline-flex items-center gap-0.5">
                      {t("cols.metadata")}
                      <InfoTip label={t("cols.metadata")} text={t("metaFormula")} />
                    </span>
                  </th>
                  <th scope="col" className="px-2 py-2 pe-4 text-end font-bold">{t("cols.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`} className="dash-row border-b border-divider/60 last:border-b-0 focus-within:bg-paper/70">
                    <td className="max-w-[300px] px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        {row.coverUrl ? (
                          <img
                            src={row.coverUrl}
                            alt=""
                            width={30}
                            height={42}
                            loading="lazy"
                            className="h-[42px] w-[30px] shrink-0 rounded-md object-cover shadow-sm"
                          />
                        ) : (
                          <span aria-hidden="true" className="h-[42px] w-[30px] shrink-0 rounded-md bg-paper" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-text-heading" title={row.title}>
                            {row.title}
                          </p>
                          <p className="truncate text-[11px] text-text-muted">
                            {[row.department, row.language ? t(`langShort.${row.language}`) : null, row.published ? null : t("draft")]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{typeBadge(row.type)}</td>
                    <td className="px-2 py-2 text-end">
                      <span className="font-semibold tabular-nums text-text-heading">{nf.format(row.views)}</span>
                      <span className="block text-[10.5px] tabular-nums text-text-muted">
                        {t("engagementSub", { viewers: nf.format(row.uniqueViewers), opens: nf.format(row.readerOpens) })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums text-text-body">
                      {row.downloads === 0 ? mutedZero : nf.format(row.downloads)}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums text-text-body">
                      {row.conversionPct === null ? (
                        <span className="text-text-muted/60">—</span>
                      ) : row.conversionPct === 0 ? (
                        mutedZero
                      ) : (
                        `${row.conversionPct}%`
                      )}
                    </td>
                    <td className="px-2 py-2 text-end">{trendIcon(row.delta)}</td>
                    <td className="px-2 py-2 text-end">{pctChip(row.completeness, row.missing)}</td>
                    <td className="px-2 py-2 pe-4">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={row.editHref}
                          aria-label={t("edit", { title: row.title })}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-brand/10 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                        {row.publicHref && (
                          <a
                            href={row.publicHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("viewPublic", { title: row.title })}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-brand/10 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label={t("paginationLabel")} className="flex items-center justify-between gap-2 border-t border-divider/70 px-4 py-2.5">
            <span className="text-[11.5px] tabular-nums text-text-muted">
              {t("pageOf", { page: data.page, total: totalPages })}
            </span>
            <div className="flex gap-1.5">
              {data.page > 1 && (
                <Link href={hrefFor(preset, data.page - 1)} className="rounded-lg border border-divider px-2.5 py-1 text-[12px] font-semibold text-text-body hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {t("prevPage")}
                </Link>
              )}
              {data.page < totalPages && (
                <Link href={hrefFor(preset, data.page + 1)} className="rounded-lg border border-divider px-2.5 py-1 text-[12px] font-semibold text-text-body hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {t("nextPage")}
                </Link>
              )}
            </div>
          </nav>
        )}
      </section>

      {/* ── Department performance (normalised) ── */}
      <section aria-labelledby="dept-heading" className="dash-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 pt-3.5">
          <span className="dash-ico dash-ico--reader dash-ico--md" aria-hidden="true">
            <Building2 className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 id="dept-heading" className="text-[14px] font-bold text-text-heading">
              {t("deptTitle")}
            </h3>
            <p className="text-[11.5px] text-text-muted">{t("deptFormula")}</p>
          </div>
        </div>
        {data.departments.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-muted">{t("deptEmpty")}</p>
        ) : (
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-[12.5px]">
              <thead className="dash-thead">
                <tr className="text-[11px] font-bold">
                  <th scope="col" className="px-4 py-2 text-start font-bold">{t("deptCols.name")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("deptCols.resources")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("deptCols.views")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("deptCols.viewsPer")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("deptCols.downloadsPer")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("deptCols.conversion")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("deptCols.neverViewed")}</th>
                  <th scope="col" className="px-2 py-2 pe-4 text-end font-bold">{t("deptCols.completeMeta")}</th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((d) => {
                  const barPct = d.viewsPerResource ? Math.round((d.viewsPerResource / maxViewsPer) * 100) : 0;
                  return (
                  <tr key={d.name} className="dash-row border-b border-divider/60 last:border-b-0">
                    <th scope="row" className="max-w-[220px] truncate px-4 py-2 text-start font-semibold text-text-heading">
                      {d.name}
                    </th>
                    <td className="px-2 py-2 text-end tabular-nums">{nf.format(d.resources)}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{nf.format(d.views)}</td>
                    <td className="px-2 py-2 text-end tabular-nums font-semibold text-text-heading">
                      <span className="flex items-center justify-end gap-2">
                        <span aria-hidden="true" className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-paper sm:block">
                          <span className="block h-full rounded-full bg-brand/70" style={{ width: `${barPct}%` }} />
                        </span>
                        {d.viewsPerResource ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums">{d.downloadsPerResource ?? "—"}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{d.conversionPct === null ? "—" : `${d.conversionPct}%`}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{d.neverViewedPct === null ? "—" : `${d.neverViewedPct}%`}</td>
                    <td className="px-2 py-2 pe-4 text-end tabular-nums">
                      {d.completeMetaPct === null ? "—" : `${d.completeMetaPct}%`}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Collection health ── */}
      <CollectionHealthCards health={data.health} />

      <FreshnessLine generatedAt={data.generatedAt} />
    </div>
  );
}
