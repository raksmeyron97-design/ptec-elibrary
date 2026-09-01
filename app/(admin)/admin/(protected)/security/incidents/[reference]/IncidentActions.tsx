"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgeIncident,
  investigateIncident,
  mitigateIncident,
  resolveIncident,
  silenceIncident,
  SILENCE_OPTIONS,
  unsilenceIncident,
} from "../../actions";
import type { IncidentStatus } from "@/lib/security/incident-policy";

/**
 * Incident response controls.
 *
 * Every button maps to one server action that re-checks `requireAdmin()`
 * (which enforces MFA), validates the transition against the state machine,
 * and writes an audit row. Nothing here is trusted: the client decides what to
 * OFFER, the server decides what is ALLOWED.
 *
 * Resolving asks for a note. It is optional, but the prompt is deliberate —
 * an incident closed with no word about why is an incident that teaches
 * nothing at the next review.
 */
export default function IncidentActions({
  reference,
  status,
  silencedUntil,
  silenced,
}: {
  reference: string;
  status: IncidentStatus;
  silencedUntil: string | null;
  /**
   * Resolved on the SERVER, not here. Comparing `silencedUntil` to
   * `Date.now()` during render is an impure read whose result changes between
   * renders; the page is force-dynamic and already renders per request, so the
   * server is both the correct and the stable place to decide this.
   */
  silenced: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [showResolve, setShowResolve] = useState(false);

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) setError(result.error ?? "Action failed");
      else router.refresh();
    });
  }

  const settled = status === "recovered" || status === "closed";

  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-text-heading">Response</h2>
      <p className="mb-3 text-xs text-text-muted">
        Actions are recorded in the admin audit log and appear in the history below.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "open" || status === "detected" ? (
          <ActionButton onClick={() => run(() => acknowledgeIncident(reference))} disabled={pending}>
            Acknowledge
          </ActionButton>
        ) : null}

        {(status === "acknowledged" || status === "open") && (
          <ActionButton onClick={() => run(() => investigateIncident(reference))} disabled={pending}>
            Start investigating
          </ActionButton>
        )}

        {(status === "investigating" || status === "acknowledged" || status === "open") && (
          <ActionButton onClick={() => run(() => mitigateIncident(reference))} disabled={pending}>
            Mitigating
          </ActionButton>
        )}

        {status !== "closed" && (
          <ActionButton onClick={() => setShowResolve((v) => !v)} disabled={pending} primary>
            Close incident
          </ActionButton>
        )}
      </div>

      {showResolve && status !== "closed" && (
        <div className="mt-3 rounded-lg border border-divider p-3">
          <label htmlFor="resolution" className="block text-xs font-medium text-text-heading">
            What happened, and what was done? (optional, 500 characters)
          </label>
          <textarea
            id="resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            maxLength={500}
            rows={3}
            className="focus-field mt-1 w-full rounded-lg border border-divider bg-bg-app p-2 text-sm text-text-body"
            placeholder="e.g. Confirmed with the account holder — they were locked out and reset their own password."
          />
          <div className="mt-2 flex gap-2">
            <ActionButton
              onClick={() => run(() => resolveIncident(reference, resolution))}
              disabled={pending}
              primary
            >
              Confirm close
            </ActionButton>
            <ActionButton onClick={() => setShowResolve(false)} disabled={pending}>
              Cancel
            </ActionButton>
          </div>
        </div>
      )}

      {/* Silencing is separate from the lifecycle: it stops notifications
          while somebody works the problem, and changes nothing about
          detection or recording. */}
      {!settled && (
        <div className="mt-4 border-t border-divider pt-3">
          <p className="text-xs font-medium text-text-heading">Notifications</p>
          {silenced ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs text-text-muted">
                Silenced until{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Phnom_Penh",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(silencedUntil!))}
                . Detection and recording continue.
              </p>
              <ActionButton onClick={() => run(() => unsilenceIncident(reference))} disabled={pending}>
                Un-silence
              </ActionButton>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs text-text-muted">Pause alerts for:</p>
              {SILENCE_OPTIONS.map((opt) => (
                <ActionButton
                  key={opt.minutes}
                  onClick={() => run(() => silenceIncident(reference, opt.minutes))}
                  disabled={pending}
                >
                  {opt.label}
                </ActionButton>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`focus-field rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        primary
          ? "bg-brand text-white hover:bg-brand/90"
          : "border border-divider text-text-body hover:border-brand/40"
      }`}
    >
      {children}
    </button>
  );
}
