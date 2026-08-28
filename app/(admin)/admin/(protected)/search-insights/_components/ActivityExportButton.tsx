"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { exportSearchActivity, type ExportSearchActivityInput } from "@/app/actions/search-insights";

/**
 * Server-generated CSV of the detailed search log, scoped to the same
 * filters currently on screen. Mirrors the export pattern in
 * `logs/_components/SecurityLogsClient.tsx`: the server builds the CSV
 * (`buildCsv()`, formula-injection-safe + UTF-8 BOM for Khmer), the browser
 * only turns the string into a downloadable Blob.
 */
export default function ActivityExportButton({ filters }: { filters: ExportSearchActivityInput }) {
  const t = useTranslations("adminSearchInsights.activity");
  const [state, setState] = useState<"idle" | "busy" | "done" | "empty" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const run = () => {
    setState("busy");
    startTransition(async () => {
      try {
        const result = await exportSearchActivity(filters);
        if (!result.ok) {
          setState(result.error === "empty" ? "empty" : "error");
          return;
        }
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        setState("done");
        setTimeout(() => setState("idle"), 2500);
      } catch {
        setState("error");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state === "busy" || pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-2.5 py-1.5 text-[11.5px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {state === "busy" || pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {state === "busy" || pending ? t("exporting") : t("exportCsv")}
      </button>
      <span role="status" aria-live="polite" className="text-[11px]">
        {state === "done" && <span className="text-success-text">{t("exportDone")}</span>}
        {state === "empty" && <span className="text-warning-text">{t("exportEmpty")}</span>}
        {state === "error" && <span className="text-danger-text">{t("exportError")}</span>}
      </span>
    </div>
  );
}
