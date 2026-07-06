"use client";

import { useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { searchStepResources } from "@/app/actions/learning-paths";
import type { StepResourceType } from "@/app/actions/learning-paths";
import { INPUT_CLASS } from "../../theses/_components/form-styles";

type ResourceHit = { id: string; title: string; coverUrl: string | null };

export default function StepResourcePicker({
  type,
  onPick,
  disabled = false,
}: {
  type: Exclude<StepResourceType, "external">;
  onPick: (hit: ResourceHit) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResourceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const hits = await searchStepResources(type, q);
      setResults(hits);
      setSearching(false);
      setOpen(true);
    }, 250);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => runSearch(e.target.value)}
          onFocus={() => query && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={`Search ${type === "book" ? "books" : type === "research" ? "theses" : "the physical catalog"}…`}
          className={`${INPUT_CLASS} pl-9`}
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-divider bg-bg-surface shadow-lg">
          {searching ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-text-muted">No matches.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(r); setQuery(""); setResults([]); setOpen(false); }}
                className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-paper transition-colors cursor-pointer"
              >
                <span className="truncate font-medium text-text-heading">{r.title}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
