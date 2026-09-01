import Link from "next/link";
import { StatusBadge, type StatusTone } from "@/components/admin/kit";
import type { Severity } from "@/lib/security/model";
import type { IncidentStatus } from "@/lib/security/incident-policy";
import type { PostureLevel, ServiceStatus } from "@/lib/admin/security-console";

/**
 * Shared presentation for the security console.
 *
 * Two rules run through all of it:
 *
 *  1. COLOUR IS NEVER THE ONLY CHANNEL. Every severity, status and service
 *     state carries a word. A responder reading this on a phone in sunlight,
 *     or with a colour vision deficiency, gets the same information — the same
 *     discipline the admin dashboard's metric palette follows.
 *  2. NO DECORATION. Every element here answers an operational question. There
 *     are no gradients, no animation and no charts that a table would say
 *     better; an incident console that looks exciting is one nobody trusts.
 *
 * Colours come from the semantic status tokens (`--ptec-{success,warning,
 * danger,info}-*` via StatusBadge), never from hand-written triplets —
 * `lib/status-tokens.test.ts` enforces that repo-wide.
 */

// ── Severity ────────────────────────────────────────────────────────────────

const SEVERITY_TONE: Record<Severity, StatusTone> = {
  1: "danger",
  2: "warning",
  3: "info",
  4: "neutral",
};

const SEVERITY_WORD: Record<Severity, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Info",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <StatusBadge tone={SEVERITY_TONE[severity]}>
      SEV {severity} · {SEVERITY_WORD[severity]}
    </StatusBadge>
  );
}

// ── Incident status ─────────────────────────────────────────────────────────

const STATUS_TONE: Record<IncidentStatus, StatusTone> = {
  detected: "info",
  open: "danger",
  acknowledged: "warning",
  investigating: "warning",
  mitigating: "warning",
  recovered: "success",
  closed: "neutral",
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{status.toUpperCase()}</StatusBadge>;
}

// ── Risk ────────────────────────────────────────────────────────────────────

/**
 * Risk as a number plus its band, always together. The number alone invites
 * false precision ("why 71 and not 68?"); the band alone loses the ordering an
 * operator triages by.
 */
export function RiskMeter({ score }: { score: number }) {
  const band = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const tone: StatusTone =
    score >= 80 ? "danger" : score >= 60 ? "warning" : score >= 30 ? "info" : "neutral";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="font-mono text-sm tabular-nums text-text-heading">{score}</span>
      <span className="text-xs text-text-muted">/100</span>
      <StatusBadge tone={tone}>{band}</StatusBadge>
    </span>
  );
}

// ── Posture ─────────────────────────────────────────────────────────────────

const POSTURE: Record<PostureLevel, { label: string; tone: StatusTone; mark: string }> = {
  protected: { label: "PROTECTED", tone: "success", mark: "●" },
  attention: { label: "ATTENTION", tone: "warning", mark: "▲" },
  incident: { label: "INCIDENT ACTIVE", tone: "danger", mark: "■" },
};

/**
 * The headline. It always carries its reason, because a status light that
 * cannot say why it is green is decoration — and "no events recorded" reads as
 * good news when it far more often means collection has stopped.
 */
export function PostureBanner({ level, reason }: { level: PostureLevel; reason: string }) {
  const { label, tone, mark } = POSTURE[level];
  return (
    <section
      aria-label="Overall security posture"
      className="mb-6 rounded-xl border border-divider bg-bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="text-lg leading-none text-text-muted">
          {mark}
        </span>
        <StatusBadge tone={tone} className="text-xs">
          {label}
        </StatusBadge>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-text-muted">{reason}</p>
    </section>
  );
}

// ── KPI tiles ───────────────────────────────────────────────────────────────

export function Kpi({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: StatusTone;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        {tone && typeof value === "number" && value > 0 && <StatusBadge tone={tone}>!</StatusBadge>}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-text-heading">{value}</div>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </>
  );
  const className =
    "block rounded-xl border border-divider bg-bg-surface p-4 focus-field" +
    (href ? " transition-colors hover:border-brand/40" : "");
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// ── Service status ──────────────────────────────────────────────────────────

const SERVICE_TONE: Record<ServiceStatus["state"], StatusTone> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
  unknown: "neutral",
  not_configured: "neutral",
};

const SERVICE_WORD: Record<ServiceStatus["state"], string> = {
  ok: "OK",
  degraded: "DEGRADED",
  down: "DOWN",
  // Not "OK". A signal we do not have is not a signal that is fine —
  // rendering it green would be exactly the security theatre §42 forbids.
  unknown: "UNKNOWN",
  not_configured: "NOT CONFIGURED",
};

export function ServiceList({ services }: { services: ServiceStatus[] }) {
  return (
    <ul className="divide-y divide-divider">
      {services.map((s) => (
        <li key={s.name} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-heading">{s.name}</p>
            <p className="text-xs text-text-muted">{s.detail}</p>
          </div>
          <StatusBadge tone={SERVICE_TONE[s.state]}>{SERVICE_WORD[s.state]}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

// ── Timing ──────────────────────────────────────────────────────────────────

/** Cambodia is UTC+7 year-round; responders read local time. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ── Layout atoms ────────────────────────────────────────────────────────────

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-divider bg-bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-heading">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A horizontal bar chart made of table rows. Chosen over an SVG chart because
 * the question ("which threat is most common?") is answered by ordering and a
 * count, and a table gives that to a screen reader for free.
 */
export function BreakdownBars({
  rows,
}: {
  rows: { label: string; count: number; href?: string }[];
}) {
  if (!rows.length) return <p className="text-sm text-text-muted">No events in this window.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Security events by type</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" className="w-2/5 py-1.5 pr-3 text-left font-normal text-text-body">
              {r.href ? (
                <Link href={r.href} className="focus-field hover:underline">
                  {r.label}
                </Link>
              ) : (
                r.label
              )}
            </th>
            <td className="py-1.5">
              <div className="h-2 w-full rounded-full bg-paper" aria-hidden>
                <div
                  className="h-2 rounded-full bg-brand/60"
                  style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
                />
              </div>
            </td>
            <td className="w-14 py-1.5 pl-3 text-right font-mono tabular-nums text-text-heading">
              {r.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
