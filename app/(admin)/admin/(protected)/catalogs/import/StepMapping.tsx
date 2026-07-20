"use client";
// Step 2 — map CSV columns to catalog fields.
//
// Auto-mapping already ran when the source was parsed (exact names, known
// aliases, conservative fuzzy matches). This step shows every source column
// with sample values so low-confidence matches get human eyes before any
// validation happens. Two columns can never target the same destination —
// the reducer unmaps the previous holder.

import type { Dispatch } from "react";
import { useTranslations } from "next-intl";
import {
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  missingRequiredFields,
  type BookImportField,
} from "@/lib/catalog-import";
import type { WizardAction, WizardState } from "./wizard-state";

export default function StepMapping({ state, dispatch }: { state: WizardState; dispatch: Dispatch<WizardAction> }) {
  const t = useTranslations("adminCatalog.import.mapping");
  const tf = useTranslations("adminCatalog.import.fields");
  const FIELD_LABEL = (f: BookImportField) => tf(f);
  const missing = missingRequiredFields(state.mappings);
  const mappedCount = state.mappings.filter((m) => m.destination !== "ignore").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          {t.rich("mappedOf", { b: (c) => <span className="font-semibold text-text-heading">{c}</span>, mapped: mappedCount, total: state.mappings.length })}
          {state.parsed && <> · {t("dataRows", { count: state.parsed.rows.length })}</>}
        </p>
        {missing.length > 0 ? (
          <p className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-600" role="status">
            {t("mapRequired", { fields: missing.map((f) => FIELD_LABEL(f)).join(", ") })}
          </p>
        ) : (
          <p className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" role="status">
            {t("allMapped")}
          </p>
        )}
      </div>

      {state.validationError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-bold">{t("validationFailed")}</p>
          <p className="mt-0.5">{state.validationError}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-divider bg-bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-divider bg-paper/60">
              {[t("col.csvColumn"), t("col.sampleValues"), t("col.mapsTo"), t("col.status")].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/60">
            {state.mappings.map((m) => {
              const isRequired = m.destination !== "ignore" && (REQUIRED_FIELDS as string[]).includes(m.destination);
              const status =
                m.destination === "ignore"
                  ? { label: t("statusLabel.ignored"), cls: "bg-paper border-divider text-text-muted" }
                  : m.manuallyChanged
                    ? { label: t("statusLabel.manual"), cls: "bg-sky-50 border-sky-200 text-sky-700" }
                    : m.confidence >= 0.9
                      ? { label: t("statusLabel.matched"), cls: "bg-emerald-50 border-emerald-200 text-emerald-700" }
                      : { label: t("statusLabel.checkMatch"), cls: "bg-amber-50 border-amber-200 text-amber-700" };
              return (
                <tr key={m.sourceIndex} className={m.destination === "ignore" ? "opacity-60" : ""}>
                  <td className="max-w-[180px] px-4 py-2.5">
                    <p className="truncate font-mono text-xs font-semibold text-text-heading">{m.sourceHeader}</p>
                  </td>
                  <td className="max-w-[220px] px-4 py-2.5">
                    <p className="truncate text-xs text-text-muted">
                      {m.sampleValues.filter(Boolean).slice(0, 2).join(" · ") || <span className="italic">{t("empty")}</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={m.destination}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_MAPPING",
                          sourceIndex: m.sourceIndex,
                          destination: e.target.value as BookImportField | "ignore",
                        })
                      }
                      aria-label={t("destinationAria", { column: m.sourceHeader })}
                      className="h-9 rounded-lg border border-divider bg-paper px-2.5 text-xs font-semibold text-text-body outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
                    >
                      <option value="ignore">{t("ignoreColumn")}</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABEL(f)}{(REQUIRED_FIELDS as string[]).includes(f) ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${status.cls}`}>
                      {status.label}
                      {isRequired && <span className="ml-1 font-normal">{t("requiredSuffix")}</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted">
        {t("footnote")}
      </p>
    </div>
  );
}
