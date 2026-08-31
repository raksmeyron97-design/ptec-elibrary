import { getTranslations, getLocale } from "next-intl/server";
import { UserPlus, Users, Repeat, Fingerprint, PieChart } from "lucide-react";
import { getAudienceData } from "@/lib/admin/intelligence";
import type { DashboardFilters } from "@/lib/admin/dashboard-shared";
import KpiCard from "../KpiCard";
import FreshnessLine from "../FreshnessLine";

function ShareBar({
  label,
  parts,
  note,
}: {
  label: string;
  parts: { name: string; value: number; className: string }[];
  note?: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5">
      <p className="text-xs font-semibold text-text-body">{label}</p>
      {total === 0 ? (
        <p className="mt-1 text-xs text-text-muted">{note ?? "—"}</p>
      ) : (
        <>
          <div
            className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-bg-surface"
            role="img"
            aria-label={`${label}: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}
          >
            {parts.map((p) =>
              p.value > 0 ? (
                <div key={p.name} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
              ) : null,
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {parts.map((p) => (
              <span key={p.name} className="flex items-center gap-1 text-xs text-text-muted">
                <span className={`h-2 w-2 rounded-full ${p.className}`} aria-hidden="true" />
                {p.name} · <span className="tabular-nums">{p.value.toLocaleString()}</span>
              </span>
            ))}
          </div>
          {note && <p className="mt-1.5 text-xs text-text-muted">{note}</p>}
        </>
      )}
    </div>
  );
}

export default async function AudienceView({ filters }: { filters: DashboardFilters }) {
  const t = await getTranslations("adminDashboard.audience");
  const tRange = await getTranslations("adminDashboard.rangeLabel");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");
  const data = await getAudienceData(filters);
  const rangeLabel = filters.range === "custom" ? data.rangeLabel : tRange(filters.range);

  const localeTracked = data.localeSplit.en + data.localeSplit.km;
  const totalViews = data.signedInViews + data.anonymousViews;
  const smallData = totalViews < 30;

  // Outer wrapper matches OverviewView's space-y-8 "zone" rhythm — the
  // dashboard-modernization audit's density item: this tab used to sit at
  // one flat space-y-5 level while Overview alone separated its zones with
  // extra air. Nested grids/cards below keep their own space-y-5/gap-5 —
  // that rhythm is WITHIN a zone, not between them, and stays unchanged.
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        <KpiCard
          accent="visitors"
          title={t("newRegistrations")}
          value={nf.format(data.registrations.total)}
          definition={t("newRegistrationsDef")}
          trend={data.registrations.trend}
          compareLabel={
            data.registrations.trend?.previous !== undefined
              ? t("previously", { value: nf.format(data.registrations.trend.previous) })
              : null
          }
          spark={data.registrations.series}
          href="/admin/users"
          drillLabel={t("manageUsers")}
          icon={UserPlus}
        />
        <KpiCard
          accent="views"
          title={t("activeUsers")}
          value={nf.format(data.activeUsers.current)}
          definition={t("activeUsersDef")}
          trend={null}
          badge={filters.compare ? t("previously", { value: nf.format(data.activeUsers.previous) }) : null}
          icon={Users}
        />
        <KpiCard
          accent="reader"
          title={t("returningUsers")}
          value={nf.format(data.returningUsers)}
          definition={t("returningUsersDef")}
          trend={null}
          icon={Repeat}
        />
        <KpiCard
          accent="gold"
          title={t("identifiedVisitors")}
          value={nf.format(data.visitorCoverage.identified)}
          definition={t("identifiedVisitorsDef")}
          trend={null}
          badge={
            data.visitorCoverage.untracked > 0
              ? t("untrackedNote", { count: nf.format(data.visitorCoverage.untracked) })
              : null
          }
          icon={Fingerprint}
        />
      </div>

      <section aria-labelledby="audience-shares-heading" className="dash-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--visitors dash-ico--md" aria-hidden="true">
              <PieChart className="h-[18px] w-[18px]" />
            </span>
            <h3 id="audience-shares-heading" className="text-sm font-bold text-text-heading">
              {t("sharesTitle")}
            </h3>
          </div>
          <span className="text-xs text-text-muted">
            {t("registeredTotal", { count: nf.format(data.totalUsers) })} · {t("periodNote", { range: rangeLabel })}
          </span>
        </div>
        {smallData && (
          <p className="dash-status--info mt-2 rounded-lg bg-[var(--dash-status-bg)] px-3 py-2 text-xs text-[var(--dash-status-fg)]">
            {t("smallDataNote", { count: nf.format(totalViews) })}
          </p>
        )}
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <ShareBar
            label={t("signedInVsAnon")}
            parts={[
              { name: t("signedIn"), value: data.signedInViews, className: "bg-brand" },
              { name: t("anonymous"), value: data.anonymousViews, className: "bg-[var(--ptec-series-visitors)]" },
            ]}
          />
          <ShareBar
            label={t("localeSplit")}
            parts={[
              { name: t("english"), value: data.localeSplit.en, className: "bg-brand" },
              { name: t("khmer"), value: data.localeSplit.km, className: "bg-[var(--ptec-series-downloads)]" },
            ]}
            note={localeTracked === 0 ? t("localeCollecting") : undefined}
          />
        </div>
        <p className="mt-3 text-xs leading-4 text-text-muted">{t("privacyNote")}</p>
      </section>

      <FreshnessLine generatedAt={data.generatedAt} note={t("internalExcluded")} />
    </div>
  );
}
