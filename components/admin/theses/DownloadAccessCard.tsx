"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, Lock, ShieldCheck, ShieldAlert, Trophy, Loader2, Check } from "lucide-react";
import { setThesisDownloadOverride } from "@/app/actions/theses";

type Override = "inherit" | "allow" | "block";

/**
 * Admin "Download Access" panel on the thesis edit page. Shows the current rank,
 * automatic policy, admin override and the resulting effective download status,
 * and lets an authorized admin change the tri-state override. The authoritative
 * decision is always the server permission engine; the "effective status"
 * preview here mirrors its rule for immediate feedback.
 */
export default function DownloadAccessCard({
  thesisId,
  isPublished,
  downloadCount,
  rank,
  currentOverride,
  reason: initialReason,
  updatedAt,
  updatedByName,
}: {
  thesisId: string;
  isPublished: boolean;
  downloadCount: number;
  rank: number | null;
  currentOverride: Override;
  reason: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}) {
  const [override, setOverride] = useState<Override>(currentOverride);
  const [reason, setReason] = useState(initialReason ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTopTen = rank != null && rank >= 1 && rank <= 10;
  const dirty = override !== currentOverride || (reason ?? "") !== (initialReason ?? "");

  // Live preview mirror of resolveDownloadPolicy (authoritative check is server-side).
  const effective = useMemo(() => {
    if (!isPublished) return { policy: "blocked" as const, label: "Blocked — thesis is not published." };
    if (override === "allow")
      return { policy: "allowed" as const, label: "Allowed — manually allowed by an administrator." };
    if (override === "block")
      return { policy: "blocked" as const, label: "Blocked — manually blocked by an administrator." };
    if (isTopTen)
      return { policy: "blocked" as const, label: `Blocked — rank #${rank} is protected by the automatic Top 10 policy.` };
    return { policy: "allowed" as const, label: "Allowed — reader may download after completing their Download Access Profile." };
  }, [isPublished, override, isTopTen, rank]);

  const onSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setThesisDownloadOverride(thesisId, override, reason);
      if (res?.success) setSaved(true);
      else setError(res?.error ?? "Failed to save download settings.");
    });
  };

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Current rank",
      value: rank != null ? `#${rank}` : "Unranked (not in Top downloads)",
    },
    {
      label: "Top 10 status",
      value: isTopTen ? (
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <Trophy className="h-3.5 w-3.5" /> Protected · Rank #{rank}
        </span>
      ) : (
        "Not protected"
      ),
    },
    { label: "Successful downloads", value: downloadCount.toLocaleString() },
    {
      label: "Automatic policy",
      value: isTopTen ? "Blocked (Top 10)" : "Allowed (#11 or lower)",
    },
    {
      label: "Admin override",
      value: currentOverride === "inherit" ? "None (automatic)" : currentOverride === "allow" ? "Allow" : "Block",
    },
  ];

  const options: { value: Override; label: string; hint: string; icon: React.ReactNode }[] = [
    { value: "inherit", label: "Use automatic policy", hint: "Follow the Top 10 ranking rule.", icon: <Download className="h-4 w-4" /> },
    { value: "allow", label: "Allow download", hint: "Explicitly permit (overrides Top 10).", icon: <ShieldCheck className="h-4 w-4" /> },
    { value: "block", label: "Block download", hint: "Explicitly prohibit for all readers.", icon: <Lock className="h-4 w-4" /> },
  ];

  return (
    <section className="rounded-2xl border border-divider bg-bg-surface shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-divider">
        <h2 className="text-base font-bold text-text-heading flex items-center gap-2">
          <Download className="h-4 w-4 text-brand" />
          Download Access
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Automatic policy blocks Top 10 theses and allows theses ranked #11 or lower after the reader
          completes their Download Access Profile. An override wins over the automatic policy.
        </p>
      </div>

      <div className="px-6 py-5 grid gap-4 sm:grid-cols-2">
        <dl className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-text-muted">{r.label}</dt>
              <dd className="font-semibold text-text-heading text-right">{r.value}</dd>
            </div>
          ))}
        </dl>

        {/* Effective status summary */}
        <div
          className={`rounded-xl border p-4 self-start ${
            effective.policy === "allowed"
              ? "border-emerald-300 bg-emerald-50"
              : "border-red-300 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            {effective.policy === "allowed" ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-600" />
            )}
            <span className={effective.policy === "allowed" ? "text-emerald-700" : "text-red-700"}>
              Effective status: {effective.policy === "allowed" ? "Allowed" : "Blocked"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-text-body">{effective.label}</p>
        </div>
      </div>

      {/* Permission control */}
      <fieldset className="px-6 pb-5">
        <legend className="text-sm font-semibold text-text-heading mb-2">Permission</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((opt) => {
            const active = override === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition ${
                  active ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-divider hover:border-brand/40"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-text-heading">
                  <input
                    type="radio"
                    name="download_override"
                    value={opt.value}
                    checked={active}
                    onChange={() => setOverride(opt.value)}
                    className="h-4 w-4 text-brand focus:ring-brand"
                  />
                  {opt.icon}
                  {opt.label}
                </span>
                <span className="pl-6 text-xs text-text-muted">{opt.hint}</span>
              </label>
            );
          })}
        </div>

        {override !== "inherit" && (
          <div className="mt-3">
            <label htmlFor="dl_override_reason" className="block text-xs font-medium text-text-muted mb-1">
              Reason (internal, optional)
            </label>
            <input
              id="dl_override_reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Author requested open access"
              className="w-full h-10 px-3 rounded-lg bg-bg-surface border border-divider text-sm text-text-body focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
        )}
      </fieldset>

      <div className="px-6 py-4 border-t border-divider bg-paper flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-text-muted">
          {updatedAt
            ? `Last changed ${new Date(updatedAt).toLocaleDateString()}${updatedByName ? ` by ${updatedByName}` : ""}.`
            : "No manual override has been set."}
        </p>
        <div className="flex items-center gap-3">
          {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
          {saved && !dirty && (
            <span className="text-sm text-emerald-700 inline-flex items-center gap-1">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !dirty}
            className="h-10 px-5 rounded-lg bg-brand text-white font-semibold text-sm hover:bg-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save download settings
          </button>
        </div>
      </div>
    </section>
  );
}
