import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import {
  getDetectionCoverage,
  getSecurityOverview,
  type SecurityOverview,
} from "@/lib/admin/security-console";
import {
  BreakdownBars,
  formatDuration,
  formatWhen,
  IncidentStatusBadge,
  Kpi,
  Panel,
  PostureBanner,
  RiskMeter,
  ServiceList,
  SeverityBadge,
} from "./_components/security-ui";

// Live operational data about attacks in progress: never prerender, never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security - PTEC Library",
  robots: { index: false, follow: false },
};

const WINDOW_HOURS = 24;

/**
 * /admin/security — the incident console.
 *
 * Ordered by what a responder needs first: posture, then what is open, then
 * the numbers, then the timeline, then what the monitoring itself is doing.
 * Investigation lives one click away in the incident list and event explorer;
 * this page is for deciding whether anything needs doing right now.
 *
 * It runs NO detection. Detection happens out of band in
 * /api/cron/security-scan, so opening this page can never send an alert.
 */
export default async function SecurityConsolePage() {
  await requireRouteAccess("security.console");

  let overview: SecurityOverview | null = null;
  let loadError: string | null = null;
  try {
    overview = await getSecurityOverview(WINDOW_HOURS);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  if (!overview) {
    return (
      <div className="p-6">
        <PageHeader title="Security" description="Incident console" />
        <div className="rounded-xl border border-divider bg-bg-surface p-6">
          <p className="text-sm text-text-heading">The security console could not load.</p>
          <p className="mt-1 text-xs text-text-muted">{loadError}</p>
        </div>
      </div>
    );
  }

  const coverage = getDetectionCoverage();
  const peak = Math.max(...overview.timeline.map((t) => t.total), 1);

  return (
    <div className="p-6">
      <PageHeader
        title="Security"
        description={`Detection, incidents and response. Figures cover the last ${WINDOW_HOURS} hours, in Phnom Penh time.`}
        actions={
          <>
            <Link
              href="/admin/security/incidents"
              className="focus-field rounded-lg border border-divider px-3 py-1.5 text-sm text-text-body hover:border-brand/40"
            >
              All incidents
            </Link>
            <Link
              href="/admin/security/events"
              className="focus-field rounded-lg border border-divider px-3 py-1.5 text-sm text-text-body hover:border-brand/40"
            >
              Event explorer
            </Link>
          </>
        }
      />

      <PostureBanner level={overview.posture} reason={overview.postureReason} />

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Active incidents"
          value={overview.activeIncidents}
          hint="Open, acknowledged, investigating or mitigating"
          href="/admin/security/incidents?status=live"
          tone="warning"
        />
        <Kpi
          label="Critical incidents"
          value={overview.criticalIncidents}
          hint="Sev 1 — act immediately, any hour"
          href="/admin/security/incidents?status=live&severity=1"
          tone="danger"
        />
        <Kpi
          label="Events recorded"
          value={overview.eventsToday.toLocaleString()}
          hint={`${overview.blockedToday.toLocaleString()} refused by an existing control`}
          href="/admin/security/events"
        />
        <Kpi
          label="High-risk events"
          value={overview.highRiskEventsToday.toLocaleString()}
          hint="Risk score 60 or above"
          href="/admin/security/events"
        />
        <Kpi
          label="Authentication"
          value={overview.authEventsToday.toLocaleString()}
          hint="Sign-in, MFA and admin-surface events"
        />
        <Kpi
          label="Rate limiting"
          value={overview.rateLimitEventsToday.toLocaleString()}
          hint="Requests refused by a rate limit"
        />
        <Kpi
          label="Uploads"
          value={overview.uploadEventsToday.toLocaleString()}
          hint="Rejections and malware-scan outcomes"
        />
        <Kpi
          label="Alerts delivered"
          value={overview.monitoring.deliveries.sent}
          hint={`${overview.monitoring.deliveries.failed} failed · ${overview.monitoring.deliveries.skipped} skipped`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Last incident ─────────────────────────────────────────────── */}
        <Panel
          title="Most recent incident"
          description="The newest incident by activity, whatever its state."
        >
          {overview.lastIncident ? (
            <Link
              href={`/admin/security/incidents/${overview.lastIncident.reference}`}
              className="focus-field block rounded-lg border border-divider p-3 hover:border-brand/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={overview.lastIncident.severity} />
                <IncidentStatusBadge status={overview.lastIncident.status} />
                <span className="font-mono text-xs text-text-muted">
                  {overview.lastIncident.reference}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-text-heading">
                {overview.lastIncident.title}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {overview.lastIncident.eventCount.toLocaleString()} events ·{" "}
                {formatDuration(overview.lastIncident.durationMs)} · last seen{" "}
                {formatWhen(overview.lastIncident.lastSeen)}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-text-muted">
              No incidents have ever been recorded. With collection running, that means no
              detector has crossed its threshold.
            </p>
          )}
        </Panel>

        {/* ── Threat breakdown ──────────────────────────────────────────── */}
        <Panel
          title="Events by type"
          description={`What was recorded in the last ${WINDOW_HOURS} hours. Counts, not verdicts.`}
        >
          <BreakdownBars
            rows={overview.threatBreakdown.map((t) => ({
              label: t.label,
              count: t.count,
              href: `/admin/security/events?type=${encodeURIComponent(t.type)}`,
            }))}
          />
        </Panel>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <Panel
          title="Timeline"
          description="Hourly event volume. An empty hour is shown, not collapsed — a gap in activity is information."
        >
          <ol className="flex h-24 items-end gap-[3px]" aria-label="Hourly security event volume">
            {overview.timeline.map((bucket) => {
              const height = bucket.total === 0 ? 2 : Math.max(4, (bucket.total / peak) * 96);
              const critical = bucket.bySeverity[1] + bucket.bySeverity[2];
              return (
                <li
                  key={bucket.start}
                  className="group relative flex-1"
                  title={`${formatWhen(bucket.start)} — ${bucket.total} events (${critical} at Sev 1–2)`}
                >
                  <div
                    className={`w-full rounded-sm ${critical > 0 ? "bg-danger/60" : "bg-brand/40"}`}
                    style={{ height: `${height}px` }}
                  />
                  <span className="sr-only">
                    {formatWhen(bucket.start)}: {bucket.total} events, {critical} at severity 1 or 2
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-text-muted">
            Bars turn red in an hour that contained a Sev 1 or Sev 2 event.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── Monitoring health ─────────────────────────────────────────── */}
        <Panel
          title="Monitoring health"
          description="Whether the monitoring itself is working. A signal we do not have is reported as unknown, never as OK."
        >
          <ServiceList services={overview.monitoring.services} />
        </Panel>

        {/* ── Coverage ──────────────────────────────────────────────────── */}
        <Panel
          title="Detection coverage"
          description="Derived from the detector registry, so it cannot claim a detector that does not exist."
        >
          <ul className="divide-y divide-divider text-sm">
            {coverage.detectors.map((d) => (
              <li key={d.detector} className="py-2">
                <p className="font-medium text-text-heading">{d.describes}</p>
                <p className="font-mono text-xs text-text-muted">{d.detector}</p>
              </li>
            ))}
          </ul>
          {coverage.unsourced.length > 0 && (
            <div className="mt-4 rounded-lg border border-divider bg-paper p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Not detected
              </p>
              <ul className="mt-1 space-y-1 text-xs text-text-muted">
                {coverage.unsourced.map((u) => (
                  <li key={u.type}>
                    <span className="font-mono">{u.type}</span> — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* Kept last: useful when triaging "why did/didn't this fire?", and
          nobody needs it before they need the incidents above. */}
      <div className="mt-4">
        <Panel
          title="Why an incident fires"
          description="Live thresholds. Every one is an environment variable; the policy they implement is docs/ALERT-CATALOG.md."
        >
          <RiskLegend />
        </Panel>
      </div>
    </div>
  );
}

function RiskLegend() {
  return (
    <div className="space-y-3 text-sm text-text-muted">
      <p>
        An <strong className="text-text-heading">event</strong> is one thing that happened; it is
        always recorded and never alerts on its own. A{" "}
        <strong className="text-text-heading">finding</strong> means a threshold was crossed. An{" "}
        <strong className="text-text-heading">incident</strong> is what you are told about — 100
        failed logins are 100 events, one finding, one incident, one message.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <RiskMeter score={20} />
        <RiskMeter score={45} />
        <RiskMeter score={70} />
        <RiskMeter score={92} />
      </div>
      <p>
        Risk is a sum of named weights — event type, volume (log-scaled), how privileged the
        surface was, and whether the attempt succeeded. Every incident carries the sentence that
        explains its own score. Only Sev 1 and Sev 2 are sent to Telegram; Sev 3 and Sev 4 live
        here.
      </p>
    </div>
  );
}
