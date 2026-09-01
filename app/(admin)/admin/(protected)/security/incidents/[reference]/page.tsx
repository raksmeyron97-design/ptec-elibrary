import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader, StatusBadge } from "@/components/admin/kit";
import { getIncidentDetail } from "@/lib/admin/security-console";
import {
  formatDuration,
  formatWhen,
  IncidentStatusBadge,
  Panel,
  RiskMeter,
  SeverityBadge,
} from "../../_components/security-ui";
import IncidentActions from "./IncidentActions";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Incident - PTEC Library",
  robots: { index: false, follow: false },
};

/**
 * One incident, everything known about it.
 *
 * ── What is shown, and what is not ──────────────────────────────────────────
 * The evidence list shows internal identifiers — profile UUIDs, request ids,
 * route shapes, signature classes. It does NOT show email addresses, raw IP
 * addresses or matched attack payloads, because none of those are stored:
 * `ip_hash` is a daily-rotating keyed hash, and only a signature CLASS is ever
 * recorded. An admin who needs to know which account a UUID belongs to looks
 * it up in /admin/users, which is a deliberate, audited step.
 */
export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  await requireRouteAccess("security.incident");

  const { reference } = await params;
  const detail = await getIncidentDetail(decodeURIComponent(reference));
  if (!detail) notFound();

  const { incident, events, deliveries, audit, children } = detail;

  return (
    <div className="p-6">
      <PageHeader
        breadcrumb={
          <Link
            href="/admin/security/incidents"
            className="focus-field text-xs text-text-muted hover:underline"
          >
            ← All incidents
          </Link>
        }
        title={incident.title}
        description={
          <span className="font-mono text-xs">{incident.reference}</span>
        }
        actions={
          <>
            <SeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
          </>
        }
      />

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Risk"><RiskMeter score={incident.riskScore} /></Fact>
        <Fact label="Events">{incident.eventCount.toLocaleString()}</Fact>
        <Fact label="Duration">
          {formatDuration(incident.durationMs)}
          {!incident.recoveredAt && " (ongoing)"}
        </Fact>
        <Fact label="Service">{incident.service}</Fact>
        <Fact label="Category">{incident.category}</Fact>
        <Fact label="First seen">{formatWhen(incident.firstSeen)}</Fact>
        <Fact label="Last seen">{formatWhen(incident.lastSeen)}</Fact>
        <Fact label="Alerts sent">{incident.alertCount}</Fact>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ── Why it fired ───────────────────────────────────────────── */}
          <Panel
            title="Detection reason"
            description="The evidence that crossed a threshold, with the numbers that crossed it."
          >
            <p className="text-sm text-text-body">
              {incident.detectionReason ?? "No detection reason recorded."}
            </p>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-text-muted">Fingerprint (dedupe key)</dt>
                <dd className="font-mono text-text-body">{incident.fingerprint}</dd>
              </div>
              {incident.runbook && (
                <div>
                  <dt className="text-text-muted">Runbook</dt>
                  <dd className="font-mono text-text-body">{incident.runbook}</dd>
                </div>
              )}
              {incident.parentReference && (
                <div>
                  <dt className="text-text-muted">Child of</dt>
                  <dd>
                    <Link
                      href={`/admin/security/incidents/${incident.parentReference}`}
                      className="focus-field font-mono text-brand hover:underline"
                    >
                      {incident.parentReference}
                    </Link>
                    {" — notifications for this incident were suppressed while the parent was open."}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>

          {/* ── Correlated events ──────────────────────────────────────── */}
          <Panel
            title="Correlated events"
            description={`${events.length} of ${incident.eventCount.toLocaleString()} events are attached as evidence (newest first, capped at 200).`}
            action={
              <Link
                href={`/admin/security/events?incidentId=${incident.id}`}
                className="focus-field text-xs text-brand hover:underline"
              >
                Open in explorer
              </Link>
            }
          >
            {events.length === 0 ? (
              <p className="text-sm text-text-muted">No individual events are attached.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <caption className="sr-only">Events correlated to this incident</caption>
                  <thead>
                    <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-text-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">When</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Where</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Result</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Request</th>
                      <th scope="col" className="py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {events.map((e) => (
                      <tr key={e.id} className="align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-text-muted">
                          {formatWhen(e.occurredAt)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-text-body">{e.type}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-text-body">{e.where}</td>
                        <td className="py-2 pr-3">
                          <StatusBadge tone={e.result === "success" ? "danger" : "neutral"}>
                            {e.result}
                          </StatusBadge>
                        </td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-text-muted">
                          {e.requestId ?? "—"}
                        </td>
                        <td className="py-2 text-xs text-text-muted">{e.detail ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* ── Child incidents ────────────────────────────────────────── */}
          {children.length > 0 && (
            <Panel
              title="Suppressed child incidents"
              description="Opened while this incident explained them, so they were recorded without a second notification."
            >
              <ul className="space-y-2 text-sm">
                {children.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/security/incidents/${c.reference}`}
                      className="focus-field text-text-heading hover:underline"
                    >
                      {c.title}
                    </Link>{" "}
                    <span className="font-mono text-xs text-text-muted">{c.reference}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <IncidentActions
            reference={incident.reference}
            status={incident.status}
            silencedUntil={incident.silencedUntil}
            silenced={incident.silenced}
          />

          <Panel
            title="Notification history"
            description="Every delivery attempt, including the ones that failed."
          >
            {deliveries.length === 0 ? (
              <p className="text-sm text-text-muted">
                No notification was attempted — this incident is below the Telegram threshold
                (Sev 3 and Sev 4 stay on the dashboard).
              </p>
            ) : (
              <ul className="divide-y divide-divider text-xs">
                {deliveries.map((d, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <p className="text-text-heading">
                        {d.kind} via {d.channel}
                      </p>
                      <p className="text-text-muted">
                        {formatWhen(d.createdAt)}
                        {d.errorClass && ` · ${d.errorClass}`}
                        {d.attempt > 1 && ` · attempt ${d.attempt}`}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        d.status === "sent" ? "success" : d.status === "failed" ? "danger" : "neutral"
                      }
                    >
                      {d.status}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Response history"
            description="From the admin audit log."
          >
            {audit.length === 0 ? (
              <p className="text-sm text-text-muted">Nobody has acted on this incident yet.</p>
            ) : (
              <ul className="divide-y divide-divider text-xs">
                {audit.map((a, i) => (
                  <li key={i} className="py-2">
                    <p className="font-mono text-text-heading">{a.action}</p>
                    <p className="text-text-muted">
                      {formatWhen(a.createdAt)} · admin {a.adminId.slice(0, 8)}…
                    </p>
                    {typeof a.metadata?.note === "string" && (
                      <p className="mt-1 text-text-body">{a.metadata.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {incident.recoveredAt && (
            <Panel title="Recovery">
              <p className="text-sm text-text-body">
                Recovered {formatWhen(incident.recoveredAt)}.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Recovery means no further events arrived within the quiet period. It is not a claim
                that the activity was blocked or remediated.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="mt-1 text-sm text-text-heading">{children}</div>
    </div>
  );
}
