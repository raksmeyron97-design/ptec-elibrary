"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Undo2, Info } from "lucide-react";
import TagInput from "@/components/ui/core/TagInput";

const KHMER_RE = /[ក-៿]/;

function cleanAbstractText(value: string): string {
  let cleaned = value;
  // De-hyphenate English words broken across lines
  cleaned = cleaned.replace(/([a-zA-Z])-\r?\n\s*([a-zA-Z])/g, "$1$2");
  // Collapse mid-paragraph hard line breaks into spaces, keep paragraph breaks
  const paragraphs = cleaned.split(/\r?\n(?:\s*\r?\n)+/);
  cleaned = paragraphs
    .map((p) => p.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim())
    .join("\n\n");
  // Strip trailing standalone page artifacts: " 12" or " i" or " ii" or " xiv"
  cleaned = cleaned.replace(/\s+(?:[0-9]+|[ivxlcdm]+)\s*$/i, "");
  return cleaned.trim();
}

export default function AbstractKeywordsStep({
  abstract, onAbstractChange,
  keywords, onKeywordsChange,
  disabled,
}: {
  abstract: string; onAbstractChange: (v: string) => void;
  keywords: string[]; onKeywordsChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [history, setHistory] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [abstract]);

  function cleanText() {
    setHistory((h) => [...h, abstract]);
    onAbstractChange(cleanAbstractText(abstract));
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    onAbstractChange(prev);
  }

  const words = abstract.trim() ? abstract.trim().split(/\s+/).length : 0;
  const chars = abstract.length;
  const readingTimeMin = Math.max(1, Math.round(words / 200));
  const isKhmer = KHMER_RE.test(abstract);
  const lengthHint = words === 0 ? null : words < 150 ? "Shorter than the recommended 150–300 words." : words > 300 ? "Longer than the recommended 150–300 words." : "Within the recommended length.";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-text-body">Abstract (សេចក្តីសង្ខេប)</label>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button type="button" onClick={undo} disabled={disabled} className="text-xs flex items-center gap-1 text-text-muted hover:text-brand transition-colors">
                <Undo2 className="w-3 h-3" /> Undo
              </button>
            )}
            <button
              type="button"
              onClick={cleanText}
              disabled={disabled}
              className="text-xs flex items-center gap-1 text-brand bg-brand/10 hover:bg-brand/20 px-2 py-1 rounded transition-colors"
            >
              <Sparkles className="w-3 h-3" /> Clean pasted text
            </button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={abstract}
          onChange={(e) => onAbstractChange(e.target.value)}
          disabled={disabled}
          rows={4}
          className="w-full resize-none rounded-lg border border-divider p-4 text-sm leading-[1.75] outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent overflow-hidden"
          placeholder="Brief summary of the objective, method, findings, and conclusion..."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
          <span>{words} words · {chars} characters · ~{readingTimeMin} min read{isKhmer ? " · Khmer detected" : ""}</span>
          {lengthHint && <span>{lengthHint}</span>}
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-paper/60 p-2.5 text-[11px] text-text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Recommended length: 150–300 words. Summarize the objective, methodology, findings, and conclusion.</p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-text-body">Keywords / Tags (ពាក្យគន្លឺះ)</label>
        <TagInput
          name="keywords"
          defaultTags={keywords}
          onChange={onKeywordsChange}
          placeholder="e.g. ការស្រាវជ្រាវ, education, STEM…"
          disabled={disabled}
          max={10}
        />
        <p className="mt-1 text-[11px] text-text-muted">ចុច Enter ឬ , ដើម្បីបន្ថែម tag — max 10, Khmer and English both allowed.</p>
      </div>
    </div>
  );
}
