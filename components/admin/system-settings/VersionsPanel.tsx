"use client";

// Publication history: every publish/rollback of every section, newest first,
// with what changed and a permission-gated rollback. Rollbacks never delete
// history — restoring creates a NEW version.

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import type {
  SettingSection,
  SettingsWorkspaceData,
} from "@/lib/system-settings/types";
import { sectionLabel } from "./OverviewPanel";

const ACTION_STYLE: Record<string, string> = {
  seed: "bg-slate-100 text-slate-600",
  publish: "bg-emerald-50 text-emerald-700",
  rollback: "bg-amber-50 text-amber-700",
};

export default function VersionsPanel({
  data,
  busy,
  onRollback,
}: {
  data: SettingsWorkspaceData;
  busy: boolean;
  onRollback: (section: SettingSection, version: number) => void;
}) {
  const [confirming, setConfirming] = useState<{ section: SettingSection; version: number } | null>(null);
  const [filter, setFilter] = useState<SettingSection | "all">("all");

  const versions = data.versions.filter((v) => filter === "all" || v.section === filter);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Phnom_Penh",
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text-heading">Version History</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every publication is kept forever. Restoring an older version publishes it as a new
            version — nothing is deleted.
          </p>
        </div>
        <div>
          <label htmlFor="versions-filter" className="mr-2 text-xs font-semibold text-slate-500">
            Section
          </label>
          <select
            id="versions-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as SettingSection | "all")}
            className="rounded-xl border border-divider bg-bg-surface px-3 py-1.5 text-sm"
          >
            <option value="all">All sections</option>
            {(Object.keys(data.sections) as SettingSection[]).map((s) => (
              <option key={s} value={s}>{sectionLabel(s)}</option>
            ))}
          </select>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <History className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">No publications yet</p>
          <p className="max-w-sm text-xs text-slate-500">
            {data.storageReady
              ? "Publish a section and its versions will appear here."
              : "Version history becomes available once migration 0098 is applied."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {versions.map((v) => {
            const current = data.sections[v.section].publishedVersion === v.version;
            const isConfirming =
              confirming?.section === v.section && confirming.version === v.version;
            return (
              <li key={v.id} className="rounded-2xl border border-divider bg-bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-text-heading">
                        {sectionLabel(v.section)} · v{v.version}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTION_STYLE[v.action] ?? ACTION_STYLE.publish}`}
                      >
                        {v.action === "rollback"
                          ? `Rollback${v.restoredFrom ? ` of v${v.restoredFrom}` : ""}`
                          : v.action === "seed"
                            ? "Initial values"
                            : "Published"}
                      </span>
                      {current && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          Live
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {fmt(v.publishedAt)}
                      {v.publishedBy && ` · ${data.actorNames[v.publishedBy] ?? "Unknown"}`}
                      {v.changedFields.length > 0 &&
                        ` · ${v.changedFields.length} field${v.changedFields.length === 1 ? "" : "s"} changed`}
                    </p>
                    {v.changedFields.length > 0 && (
                      <p className="mt-1 break-words font-mono text-[11px] text-slate-400">
                        {v.changedFields.slice(0, 8).join(", ")}
                        {v.changedFields.length > 8 && ` +${v.changedFields.length - 8} more`}
                      </p>
                    )}
                    {v.comment && (
                      <p className="mt-1.5 text-xs italic text-slate-600">“{v.comment}”</p>
                    )}
                  </div>

                  {data.canWrite && !current && (
                    <div className="shrink-0">
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600">
                            Publish v{v.version} as the live version?
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setConfirming(null);
                              onRollback(v.section, v.version);
                            }}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirming({ section: v.section, version: v.version })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Restore this version
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
