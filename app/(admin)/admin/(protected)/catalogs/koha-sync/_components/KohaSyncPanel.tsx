"use client";
// The Koha sync controls. Buttons exist only for viewers the registry allows
// (useCan); the server re-checks every action. While a run is going, the page
// refreshes itself so its outcome appears without a reload.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, StatusBadge, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/admin/kit/form";
import { applyKohaSync, previewKohaSync, type KohaSyncActionResult } from "../actions";

export interface PanelState {
  configured: boolean;
  running: boolean;
  initialized: boolean;
  /** The last run is a successful full preview from the last 24 h: its counts are what an apply would do. */
  previewReady: boolean;
  counts: Record<string, number>;
}

const COUNT_LABELS: [string, string][] = [
  ["createRecords", "records to create"],
  ["linkRecords", "existing records to link"],
  ["updateRecords", "records to update"],
  ["unlistRecords", "records to unlist (deleted in Koha)"],
  ["createCopies", "copies to create"],
  ["linkCopies", "existing copies to link"],
  ["updateCopies", "copies to update"],
  ["retireCopies", "copies to withdraw (deleted in Koha)"],
];

export default function KohaSyncPanel({ state }: { state: PanelState }) {
  const router = useRouter();
  const toast = useToast();
  const canPreview = useCan("catalog.koha-sync.preview");
  const canApply = useCan("catalog.koha-sync.apply");
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!state.running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [state.running, router]);

  function run(action: () => Promise<KohaSyncActionResult>) {
    startTransition(async () => {
      const r = await action();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
      setConfirm(false);
      router.refresh();
    });
  }

  if (!canPreview && !canApply) return null;
  const busy = pending || state.running || !state.configured;
  const planned = COUNT_LABELS.filter(([k]) => (state.counts[k] ?? 0) > 0);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state.running && <StatusBadge tone="info">A sync is running…</StatusBadge>}
      {canPreview && (
        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => run(previewKohaSync)}>
          Preview full sync
        </button>
      )}
      {canApply && state.initialized && (
        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => run(() => applyKohaSync("incremental"))}>
          Sync recent changes now
        </button>
      )}
      {canApply && (
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy || !state.previewReady}
          title={state.previewReady ? undefined : "Run a full preview first; applying uses what it found."}
          onClick={() => setConfirm(true)}
        >
          {state.initialized ? "Apply full sync" : "Build the Physical Library from Koha"}
        </button>
      )}

      <ConfirmDialog
        open={confirm}
        tone="brand"
        title={state.initialized ? "Apply the full sync?" : "Build the Physical Library from Koha?"}
        description={
          <div className="space-y-2">
            <p>The e-Library&rsquo;s catalogue will follow Koha. From the preview:</p>
            <ul className="list-disc pl-5">
              {planned.length ? planned.map(([k, label]) => (
                <li key={k}><span className="font-semibold tabular-nums">{(state.counts[k] ?? 0).toLocaleString()}</span> {label}</li>
              )) : <li>nothing to change</li>}
            </ul>
            <p>Nothing is deleted: a copy Koha no longer has is marked withdrawn, a record is unlisted. Nothing is written to Koha.</p>
          </div>
        }
        confirmLabel={state.initialized ? "Apply" : "Build it"}
        busyLabel="Starting…"
        busy={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => run(() => applyKohaSync("full"))}
      />
    </div>
  );
}
