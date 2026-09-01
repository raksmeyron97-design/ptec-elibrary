import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import { listIncidents, type IncidentFilters } from "@/lib/admin/security-console";
import { INCIDENT_STATUSES, type IncidentStatus } from "@/lib/security/incident-policy";
import type { Severity } from "@/lib/security/model";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import {
  formatDuration,
  formatWhen,
  IncidentStatusBadge,
  RiskMeter,
  SeverityBadge,
} from "../_components/security-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security incidents - PTEC Library",
  robots: { index: false, follow: false },
};

const BASE_PATH = "/admin/security/incidents";
const PAGE_SIZE = 25;

type SP = Record<string, string | string[] | undefined>;

function one(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Pagination takes single-valued params; a repeated ?x=1&x=2 keeps the first. */
function flatten(sp: SP): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(sp)) out[key] = one(sp, key);
  return out;
}

/**
 * The incident list.
 *
 * URL-driven filters throughout — the same convention as the Data Quality
 * repair queue and the activity log — so a responder can paste a filtered view
 * into a chat and the person opening it sees exactly what they saw.
 *
 * Filtering and pagination happen in Postgres, not in the browser: the
 * incident table is indexed on (status, last_seen), (severity, last_seen) and
 * (category, last_seen) precisely for these queries.
 */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireRouteAccess("security.incidents");

  const sp = await searchParams;

  const statusParam = one(sp, "status") ?? "live";
  const status = (
    statusParam === "all" || statusParam === "live" || INCIDENT_STATUSES.includes(statusParam as IncidentStatus)
      ? statusParam
      : "live"
  ) as IncidentFilters["status"];

  const severityParam = Number(one(sp, "severity"));
  const severity: IncidentFilters["severity"] =
    severityParam >= 1 && severityParam <= 4 ? ((severityParam as Severity) satisfies Severity) : "all";

  const filters: IncidentFilters = {
    status,
    severity,
    category: one(sp, "category") ?? "all",
    search: (one(sp, "q") ?? "").slice(0, 80),
    from: one(sp, "from") ?? null,
    to: one(sp, "to") ?? null,
    page: Math.max(0, Number.parseInt(one(sp, "page") ?? "1", 10) - 1 || 0),
    pageSize: PAGE_SIZE,
  };

  const result = await listIncidents(filters);

  if (!result.available) {
    return (
      <div className="p-6">
        <PageHeader title="Security incidents" />
        <div className="rounded-xl border border-divider bg-bg-surface p-6">
          <p className="text-sm text-text-heading">Incident tables are not present.</p>
          <p className="mt-1 text-xs text-text-muted">
            Migration 0127 has not been applied to this database. Events are still written to the
            application log; nothing is being recorded durably.
          </p>
        </div>
      </div>
    );
  }

  const qs = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      status: statusParam,
      severity: severity === "all" ? undefined : String(severity),
      category: filters.category === "all" ? undefined : filters.category,
      q: filters.search || undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `${BASE_PATH}?${s}` : BASE_PATH;
  };

  return (
    <div className="p-6">
      <PageHeader
        breadcrumb={
          <Link href="/admin/security" className="focus-field text-xs text-text-muted hover:underline">
            ← Security console
          </Link>
        }
        title="Security incidents"
        description={`${result.total.toLocaleString()} incident${result.total === 1 ? "" : "s"} match these filters. Times are Phnom Penh.`}
      />

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterGroup label="Status">
          {[
            { value: "live", label: "Live" },
            { value: "all", label: "All" },
            ...INCIDENT_STATUSES.map((s) => ({ value: s, label: s })),
          ].map((opt) => (
            <FilterChip
              key={opt.value}
              href={qs({ status: opt.value, page: undefined })}
              active={statusParam === opt.value}
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Severity">
          <FilterChip href={qs({ severity: undefined, page: undefined })} active={severity === "all"}>
            All
          </FilterChip>
          {([1, 2, 3, 4] as Severity[]).map((s) => (
            <FilterChip
              key={s}
              href={qs({ severity: String(s), page: undefined })}
              active={severity === s}
            >
              Sev {s}
            </FilterChip>
          ))}
        </FilterGroup>

        {result.categories.length > 0 && (
          <FilterGroup label="Category">
            <FilterChip href={qs({ category: undefined, page: undefined })} active={filters.category === "all"}>
              All
            </FilterChip>
            {result.categories.map((c) => (
              <FilterChip key={c} href={qs({ category: c, page: undefined })} active={filters.category === c}>
                {c}
              </FilterChip>
            ))}
          </FilterGroup>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {result.incidents.length === 0 ? (
        <div className="rounded-xl border border-divider bg-bg-surface p-8 text-center">
          <p className="text-sm text-text-heading">No incidents match these filters.</p>
          <p className="mt-1 text-xs text-text-muted">
            With detection running, an empty live list is the state you want.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
          <table className="w-full min-w-[64rem] text-sm">
            <caption className="sr-only">Security incidents</caption>
            <thead>
              <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Incident</th>
                <th scope="col" className="px-4 py-3 font-medium">Severity</th>
                <th scope="col" className="px-4 py-3 font-medium">Category</th>
                <th scope="col" className="px-4 py-3 font-medium">Service</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Risk</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Events</th>
                <th scope="col" className="px-4 py-3 font-medium">Detected</th>
                <th scope="col" className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {result.incidents.map((incident) => (
                <tr key={incident.id} className="align-top hover:bg-paper/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`${BASE_PATH}/${incident.reference}`}
                      className="focus-field font-medium text-text-heading hover:underline"
                    >
                      {incident.title}
                    </Link>
                    <p className="font-mono text-xs text-text-muted">{incident.reference}</p>
                  </td>
                  <td className="px-4 py-3"><SeverityBadge severity={incident.severity} /></td>
                  <td className="px-4 py-3 text-text-body">{incident.category}</td>
                  <td className="px-4 py-3 text-text-body">{incident.service}</td>
                  <td className="px-4 py-3"><IncidentStatusBadge status={incident.status} /></td>
                  <td className="px-4 py-3"><RiskMeter score={incident.riskScore} /></td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-text-body">
                    {incident.eventCount.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                    {formatWhen(incident.firstSeen)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                    {formatDuration(incident.durationMs)}
                    {!incident.recoveredAt && <span className="ml-1 text-xs">(ongoing)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={filters.page + 1}
        totalPages={result.totalPages}
        totalItems={result.total}
        pageSize={PAGE_SIZE}
        searchParams={flatten(sp)}
        basePath={BASE_PATH}
      />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-divider bg-bg-surface px-3 py-2">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1">{children}</div>
    </fieldset>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`focus-field rounded-md px-2 py-1 text-xs capitalize ${
        active
          ? "bg-brand text-white"
          : "text-text-body hover:bg-paper"
      }`}
    >
      {children}
    </Link>
  );
}
