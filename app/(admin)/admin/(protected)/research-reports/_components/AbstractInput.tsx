"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Undo2 } from "lucide-react";

export default function AbstractInput({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [history, setHistory] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cleanText = () => {
    setHistory([...history, value]);

    let cleaned = value;

    // 1. De-hyphenate English words broken across lines
    cleaned = cleaned.replace(/([a-zA-Z])-\r?\n\s*([a-zA-Z])/g, "$1$2");

    // 2. Collapse mid-paragraph hard line breaks into spaces
    const paragraphs = cleaned.split(/\r?\n(?:\s*\r?\n)+/);
    cleaned = paragraphs
      .map(p => p.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim())
      .join("\n\n");

    // 3. Strip trailing standalone page artifacts: " 12" or " i" or " ii" or " xiv"
    cleaned = cleaned.replace(/\s+(?:[0-9]+|[ivxlcdm]+)\s*$/i, "");

    setValue(cleaned.trim());
  };

  const undo = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(history.slice(0, -1));
      setValue(prev);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  // Recalculate height once the textarea actually becomes visible — it mounts inside a
  // tab panel that starts hidden, so the mount-time scrollHeight read above is 0 until
  // the tab is opened. A ResizeObserver catches that hidden→visible transition, which a
  // [value] dependency alone would miss.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const chars = value.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-text-body">Abstract (សេចក្តីសង្ខេប)</label>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={undo}
              className="text-xs flex items-center gap-1 text-text-muted hover:text-brand transition-colors"
              title="Undo clean"
            >
              <Undo2 className="w-3 h-3" /> Undo
            </button>
          )}
          <button
            type="button"
            onClick={cleanText}
            className="text-xs flex items-center gap-1 text-brand bg-brand/10 hover:bg-brand/20 px-2 py-1 rounded transition-colors"
            title="Clean pasted text"
          >
            <Sparkles className="w-3 h-3" /> Clean pasted text
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        name="abstract"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        className="w-full resize-none rounded-lg border border-divider p-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent overflow-hidden"
        placeholder="Brief summary of the research..."
      />
      <div className="flex justify-between items-center text-[11px] text-text-muted">
        <span>{words} words</span>
        <span>{chars} characters</span>
      </div>
    </div>
  );
}
