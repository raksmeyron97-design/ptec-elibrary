"use client";

import { useState } from "react";
import { Plus, Trash2, Sparkles, GripVertical } from "lucide-react";

export default function ReferencesInput({ defaultValue = "" }: { defaultValue?: string }) {
  const [refs, setRefs] = useState<string[]>(
    defaultValue.split(/\r?\n+/).filter((r) => r.trim() !== "")
  );
  const [pasteBlob, setPasteBlob] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);

  const addRef = () => setRefs([...refs, ""]);
  
  const removeRef = (index: number) => {
    const newRefs = [...refs];
    newRefs.splice(index, 1);
    setRefs(newRefs);
  };

  const updateRef = (index: number, val: string) => {
    const newRefs = [...refs];
    newRefs[index] = val;
    setRefs(newRefs);
  };

  const handleSmartSplit = () => {
    if (!pasteBlob.trim()) return;

    // Smart-split heuristic using lookahead to split right before an author/org citation starts
    const regex = /(?=(?:[A-Z][\p{L}'’.\-]*,?\s+(?:[A-Z]\.|[A-Za-z]+)[\sA-Za-z.,'’&]*\(\d{4}\))|(?:[A-Z0-9]+|[A-Z][a-z]+)\.?\s*\(\d{4}\))/gu;

    let splitParts = pasteBlob.split(regex);
    
    // Fallback if regex split failed to find markers but there are newlines
    if (splitParts.length <= 1 && pasteBlob.includes("\n")) {
      splitParts = pasteBlob.split(/\r?\n+/);
    }
    
    const newRefs = splitParts
      .map(p => p.replace(/^\s*(?:\[\d+\]|\d+\.|\•)\s*/, "").trim())
      .filter(p => p.length > 0);

    setRefs([...refs, ...newRefs]);
    setPasteBlob("");
    setShowPasteArea(false);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="references" value={refs.join("\n")} />

      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-text-body">References / Bibliography (Optional)</label>
        <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">
          {refs.length} reference{refs.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {refs.map((ref, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <button type="button" className="mt-2 text-text-muted/50 cursor-grab hover:text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-4 h-4" />
            </button>
            <textarea
              value={ref}
              onChange={(e) => updateRef(i, e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-divider p-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
              placeholder="e.g. Doe, J. (2020). Book title..."
            />
            <button
              type="button"
              onClick={() => removeRef(i)}
              aria-label="Remove reference"
              className="mt-2 text-text-muted/50 hover:text-red-500 transition-colors"
            >
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
            rows={4}
            placeholder="Paste your giant block of references here..."
            className="w-full resize-none rounded border border-divider p-2 text-sm outline-none bg-transparent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setPasteBlob(""); setShowPasteArea(false); }}
              className="text-xs px-3 py-1.5 text-text-muted hover:bg-divider rounded transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSmartSplit}
              className="text-xs px-3 py-1.5 bg-brand text-white rounded flex items-center gap-1 hover:bg-brand/90 transition"
            >
              <Sparkles className="w-3 h-3" /> Smart Split & Add
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={addRef}
            className="text-xs flex items-center gap-1 text-text-muted hover:text-brand border border-divider hover:border-brand px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" /> Add empty row
          </button>
          <button
            type="button"
            onClick={() => setShowPasteArea(true)}
            className="text-xs flex items-center gap-1 text-brand bg-brand/10 hover:bg-brand/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Sparkles className="w-3 h-3" /> Paste a blob
          </button>
        </div>
      )}
      <p className="text-[11px] text-text-muted mt-1">មួយ reference ក្នុងមួយបន្ទាត់</p>
    </div>
  );
}
