import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, StatusBadge } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import { listSecurityEvents, type EventFilters } from "@/lib/admin/security-console";
import type { SecurityEventType, Severity } from "@/lib/security/model";
import { formatWhen, RiskMeter, SeverityBadge } from "../_components/security-ui";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security events - PTEC Library",
  robots: { index: false, follow: false },
};

const BASE_PATH = "/admin/security/events";
const PAGE_SIZE = 50;

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

/** Pagination takes single-valued params; a repeated ?x=1&x=2 keeps the first. */
function flatten(sp: SP): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(sp)) out[key] = one(sp, key);
  return out;
}

/**
 * The raw event explorer — for investigation, not for browsing.
 *
 * The filter that matters most is `requestId`: middleware mints one per
 * request (reusing Cloudflare's cf-ray when present) and sets it on both the
 * request and the response, so pasting a request id here joins an application
 * event to the Cloudflare log line and the browser's own network entry for the
 * same request. That is the single most useful thing on this page during an
 * investigation, which is why it gets its own input rather than living inside
 * a generic search box.
 *
 * No free-text search over `detail`: those strings are already scrubbed and
 * truncated, and a substring search over them invites the habit of putting
 * searchable content into a field the log contract says must not carry any.
 */
export default async function SecurityEventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireRouteAccess("security.events");

  const sp = await searchParams;

  const severityRaw = Number(one(sp, "severity"));
  const filters: EventFilters = {
    type: (one(sp, "type") as SecurityEventType) || "all",
    severity: severityRaw >= 1 && severityRaw <= 4 ? (severityRaw as Severity) : "all",
    service: one(sp, "service") ?? "all",
    result: one(sp, "result") ?? "all",
    requestId: (one(sp, "requestId") ?? "").slice(0, 100),
    incidentId: one(sp, "incidentId"),
    from: one(sp, "from") ?? null,
    to: one(sp, "to") ?? null,
    page: Math.max(0, Number.parseInt(one(sp, "page") ?? "1", 10) - 1 || 0),
    pageSize: PAGE_SIZE,
  };

  const result = await listSecurityEvents(filters);

  if (!result.available) {
    return (
      <div className="p-6">
        <PageHeader title="Security events" />
        <div className="rounded-xl border border-divider bg-bg-surface p-6">
          <p className="text-sm text-text-heading">The security_events table is not present.</p>
          <p className="mt-1 text-xs text-text-muted">Migration 0127 has not been applied.</p>
        </div>
      </div>
    );
  }

  const build = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      type: filters.type === "all" ? undefined : String(filters.type),
      severity: filters.severity === "all" ? undefined : String(filters.severity),
      service: filters.service === "all" ? undefined : filters.service,
      result: filters.result === "all" ? undefined : filters.result,
      requestId: filters.requestId || undefined,
      incidentId: filters.incidentId,
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
        title="Security events"
        description={`${result.total.toLocaleString()} events match these filters. This is the raw stream — one row per recorded event.`}
      />

      {/* ── Request-id lookup: the investigation entry point ─────────────── */}
      <form method="get" action={BASE_PATH} className="mb-4 rounded-xl border border-divider bg-bg-surface p-4">
        <label htmlFor="requestId" className="block text-xs font-medium text-text-heading">
          Trace a request id
        </label>
        <p className="mb-2 text-xs text-text-muted">
          Every response carries <code className="font-mono">x-request-id</code> (Cloudflare&apos;s
          cf-ray where present). Paste one to see every security event from that request.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="requestId"
            name="requestId"
            defaultValue={filters.requestId}
            placeholder="8f2c1a9e-…"
            className="focus-field w-full max-w-md rounded-lg border border-divider bg-bg-app px-3 py-1.5 font-mono text-sm text-text-body"
          />
          <button
            type="submit"
            className="focus-field rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
          >
            Trace
          </button>
          {filters.requestId && (
            <Link
              href={build({ requestId: undefined, page: undefined })}
              className="focus-field rounded-lg border border-divider px-3 py-1.5 text-sm text-text-body"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* ── Facets ───────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Facet label="Severity">
          <Chip href={build({ severity: undefined, page: undefined })} active={filters.severity === "all"}>All</Chip>
          {([1, 2, 3, 4] as Severity[]).map((s) => (
            <Chip key={s} href={build({ severity: String(s), page: undefined })} active={filters.severity === s}>
              Sev {s}
            </Chip>
          ))}
        </Facet>

        <Facet label="Result">
          <Chip href={build({ result: undefined, page: undefined })} active={filters.result === "all"}>All</Chip>
          {["blocked", "failed", "success", "allowed"].map((r) => (
            <Chip key={r} href={build({ result: r, page: undefined })} active={filters.result === r}>
              {r}
            </Chip>
          ))}
        </Facet>

        {result.services.length > 0 && (
          <Facet label="Service">
            <Chip href={build({ service: undefined, page: undefined })} active={filters.service === "all"}>All</Chip>
            {result.services.map((s) => (
              <Chip key={s} href={build({ service: s, page: undefined })} active={filters.service === s}>
                {s}
              </Chip>
            ))}
          </Facet>
        )}

        {result.types.length > 0 && (
          <Facet label="Type">
            <Chip href={build({ type: undefined, page: undefined })} active={filters.type === "all"}>All</Chip>
            {result.types.map((t) => (
              <Chip key={t} href={build({ type: t, page: undefined })} active={filters.type === t}>
                {t}
              </Chip>
            ))}
          </Facet>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {result.events.length === 0 ? (
        <div className="rounded-xl border border-divider bg-bg-surface p-8 text-center">
          <p className="text-sm text-text-heading">No events match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
          <table className="w-full min-w-[68rem] text-sm">
            <caption className="sr-only">Security events</caption>
            <thead>
              <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-4 py-3 font-medium">Severity</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Where</th>
                <th scope="col" className="px-4 py-3 font-medium">Actor</th>
                <th scope="col" className="px-4 py-3 font-medium">Result</th>
                <th scope="col" className="px-4 py-3 font-medium">Risk</th>
                <th scope="col" className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {result.events.map((e) => (
                <tr key={e.id} className="align-top hover:bg-paper/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">
                    {formatWhen(e.occurredAt)}
                  </td>
                  <td className="px-4 py-2.5"><SeverityBadge severity={e.severity} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-body">{e.type}</td>
                  <td className="max-w-[18rem] truncate px-4 py-2.5 font-mono text-xs text-text-body" title={e.where}>
                    {e.where}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-muted">
                    {e.actorType}
                    {e.actorId && (
                      <span className="ml-1 font-mono">{e.actorId.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={e.result === "success" ? "danger" : "neutral"}>
                      {e.result}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-2.5"><RiskMeter score={e.riskScore} /></td>
                  <td className="max-w-[22rem] px-4 py-2.5 text-xs text-text-muted">
                    {e.detail ?? "—"}
                    {e.incidentId && (
                      <span className="ml-1">
                        ·{" "}
                        <Link
                          href={`${BASE_PATH}?incidentId=${e.incidentId}`}
                          className="focus-field text-brand hover:underline"
                        >
                          incident
                        </Link>
                      </span>
                    )}
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

      <p className="mt-4 text-xs text-text-muted">
        No email addresses, raw IP addresses or attack payloads appear here, because none are
        stored: client correlation uses a daily-rotating keyed hash, and only a signature class is
        recorded for a matched request.
      </p>
    </div>
  );
}

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-divider bg-bg-surface px-3 py-2">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1">{children}</div>
    </fieldset>
  );
}

function Chip({
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
      className={`focus-field rounded-md px-2 py-1 text-xs ${
        active ? "bg-brand text-white" : "text-text-body hover:bg-paper"
      }`}
    >
      {children}
    </Link>
  );
}
