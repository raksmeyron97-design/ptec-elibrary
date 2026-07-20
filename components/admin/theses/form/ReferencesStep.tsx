"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Sparkles, ChevronUp, ChevronDown, Link2 } from "lucide-react";

const URL_OR_DOI_RE = /(https?:\/\/|doi\.org|10\.\d{4,9}\/)/i;

export default function ReferencesStep({
  references,
  onReferencesChange,
  disabled,
}: {
  references: string[];
  onReferencesChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("adminThesisForm.references");
  const [pasteBlob, setPasteBlob] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);

  function addRef() {
    onReferencesChange([...references, ""]);
  }
  function removeRef(i: number) {
    onReferencesChange(references.filter((_, idx) => idx !== i));
  }
  function updateRef(i: number, val: string) {
    const next = [...references];
    next[i] = val;
    onReferencesChange(next);
  }
  function moveRef(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= references.length) return;
    const next = [...references];
    [next[i], next[j]] = [next[j], next[i]];
    onReferencesChange(next);
  }

  function handleSmartSplit() {
    if (!pasteBlob.trim()) return;
    // Smart-split heuristic using lookahead to split right before an author/org citation starts
    const regex = /(?=(?:[A-Z][\p{L}'’.\-]*,?\s+(?:[A-Z]\.|[A-Za-z]+)[\sA-Za-z.,'’&]*\(\d{4}\))|(?:[A-Z0-9]+|[A-Z][a-z]+)\.?\s*\(\d{4}\))/gu;
    let splitParts = pasteBlob.split(regex);
    if (splitParts.length <= 1 && pasteBlob.includes("\n")) {
      splitParts = pasteBlob.split(/\r?\n+/);
    }
    const newRefs = splitParts
      .map((p) => p.replace(/^\s*(?:\[\d+\]|\d+\.|•)\s*/, "").trim())
      .filter((p) => p.length > 0);
    onReferencesChange([...references, ...newRefs]);
    setPasteBlob("");
    setShowPasteArea(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-text-body">{t("label")}</label>
        <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">
          {t("count", { count: references.length })}
        </span>
      </div>

      {references.length === 0 && !showPasteArea && (
        <p className="rounded-lg border border-dashed border-divider bg-paper/40 px-3 py-4 text-center text-xs text-text-muted">
          {t("empty")}
        </p>
      )}

      <div className="space-y-2">
        {references.map((ref, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <div className="mt-1.5 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" disabled={disabled || i === 0} onClick={() => moveRef(i, -1)} aria-label={t("moveUp")} className="text-text-muted/50 hover:text-brand disabled:opacity-20">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" disabled={disabled || i === references.length - 1} onClick={() => moveRef(i, 1)} aria-label={t("moveDown")} className="text-text-muted/50 hover:text-brand disabled:opacity-20">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1">
              <textarea
                value={ref}
                onChange={(e) => updateRef(i, e.target.value)}
                disabled={disabled}
                rows={2}
                className="w-full resize-none rounded-lg border border-divider p-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
                placeholder={t("refPlaceholder")}
              />
              {URL_OR_DOI_RE.test(ref) && (
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600">
                  <Link2 className="h-3 w-3" /> {t("linkDetected")}
                </span>
              )}
            </div>
            <button type="button" onClick={() => removeRef(i)} disabled={disabled} aria-label={t("remove")} className="mt-2 text-text-muted/50 hover:text-red-500 transition-colors disabled:opacity-40">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {showPasteArea ? (
        <div className="p-3 bg-paper border border-divider rounded-lg space-y-2">
          <textarea
            value={pasteBlob}
            onChange={(e) => setPasteBlob(e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder={t("pastePlaceholder")}
            className="w-full resize-none rounded border border-divider p-2 text-sm outline-none bg-transparent"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setPasteBlob(""); setShowPasteArea(false); }} className="text-xs px-3 py-1.5 text-text-muted hover:bg-divider rounded transition">
              {t("cancel")}
            </button>
            <button type="button" onClick={handleSmartSplit} className="text-xs px-3 py-1.5 bg-brand text-white rounded flex items-center gap-1 hover:bg-brand/90 transition">
              <Sparkles className="w-3 h-3" /> {t("smartSplit")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={addRef} disabled={disabled} className="text-xs flex items-center gap-1 text-text-muted hover:text-brand border border-divider hover:border-brand px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            <Plus className="w-3 h-3" /> {t("addRow")}
          </button>
          <button type="button" onClick={() => setShowPasteArea(true)} disabled={disabled} className="text-xs flex items-center gap-1 text-brand bg-brand/10 hover:bg-brand/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            <Sparkles className="w-3 h-3" /> {t("pasteBlob")}
          </button>
        </div>
      )}
      <p className="text-[11px] text-text-muted mt-1">{t("oneLine")}</p>
    </div>
  );
}
