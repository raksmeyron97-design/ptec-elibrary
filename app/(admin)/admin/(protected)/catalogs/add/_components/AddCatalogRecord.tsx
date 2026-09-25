"use client";
// Add a physical book: look it up by ISBN (the default path), or catalogue it
// by hand. Either way the record is created by the same AddBookWizard and its
// unchanged server action — Add by ISBN only decides the starting values.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import AddBookWizard from "./AddBookWizard";
import AddByIsbnPanel from "./AddByIsbnPanel";
import { candidateToPrefill, type CatalogPrefill } from "@/lib/isbn/prefill";
import type { IsbnCandidate, IsbnProvider } from "@/lib/isbn/types";
import type { IsbnLookupResponse } from "../../isbn-actions";

type Chosen = { key: string; prefill: CatalogPrefill; provider: IsbnProvider | null };

const EMPTY: CatalogPrefill = {
  title: "", author: "", isbn: "", publisher: "", year: "", language: "km", keywords: [], description: "", coverImportUrl: null,
};

export default function AddCatalogRecord({ categories }: { categories: string[] }) {
  const t = useTranslations("adminCatalog.isbn");
  const [view, setView] = useState<"isbn" | "form">("isbn");
  // Kept across the switch, so "Back to ISBN results" returns to the same list.
  const [input, setInput] = useState("");
  const [result, setResult] = useState<IsbnLookupResponse | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);

  if (view === "isbn") {
    return (
      <AddByIsbnPanel
        input={input}
        onInput={setInput}
        result={result}
        onResult={setResult}
        onUse={(c: IsbnCandidate) => {
          setChosen({ key: `${c.provider}:${c.providerRecordId}`, prefill: candidateToPrefill(c), provider: c.provider });
          setView("form");
        }}
        onManual={(isbn) => {
          setChosen(isbn ? { key: `manual:${isbn}`, prefill: { ...EMPTY, isbn }, provider: null } : null);
          setView("form");
        }}
      />
    );
  }

  return (
    <AddBookWizard
      // A new key remounts the form, so a different candidate's values apply.
      key={chosen?.key ?? "blank"}
      categories={categories}
      initial={chosen?.prefill}
      headerActions={
        <button type="button" className={BTN_SECONDARY} onClick={() => setView("isbn")}>
          {result ? t("backToResults") : t("lookupByIsbn")}
        </button>
      }
      notice={
        chosen?.provider ? (
          <p className="flex items-start gap-2 rounded-xl border border-info-line bg-info-soft px-3 py-2 text-xs leading-relaxed text-info-text">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t("prefilledFrom", { provider: t(`provider.${chosen.provider}`), isbn: chosen.prefill.isbn })}</span>
          </p>
        ) : undefined
      }
    />
  );
}
