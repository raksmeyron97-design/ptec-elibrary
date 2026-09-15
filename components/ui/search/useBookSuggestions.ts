import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { pushRecentSearch } from "@/lib/recent-searches";
import { suggestionDetailHref } from "@/lib/search/suggestion-href";

type UseBookSuggestionsProps = {
  initialQuery?: string;
  onClose?: () => void; // For Command Palette to close itself
  /** Where a free-text query (not a specific suggestion pick) navigates to. Defaults to /books. */
  basePath?: string;
};

export function useBookSuggestions({ initialQuery = "", onClose, basePath = "/books" }: UseBookSuggestionsProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/books/suggestions?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as Suggestion[];
      setSuggestions(data);
      setActiveIdx(-1);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  function navigate(q: string) {
    pushRecentSearch(q);
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    params.delete("page");
    setOpen(false);
    if (onClose) onClose();
    router.push(`${basePath}?${params.toString()}`);
  }

  function pickSuggestion(s: Suggestion) {
    // A suggestion that names a page opens it — lib/search/suggestion-href.ts
    // is the one mapping, shared with the phone search overlay. An author or
    // a subject names no page, so it becomes a search for its label.
    const href = suggestionDetailHref(s);
    if (href) {
      pushRecentSearch(s.label);
      setOpen(false);
      if (onClose) onClose();
      router.push(href);
    } else {
      setQuery(s.label);
      navigate(s.label);
    }
  }

  const grouped = suggestions.reduce<Record<string, Suggestion[]>>((acc, s) => {
    (acc[s.type] ??= []).push(s);
    return acc;
  }, {});

  const groupOrder: Suggestion["type"][] = ["book", "research", "publication", "catalog", "learning_path", "post", "author", "category"];

  return {
    query,
    setQuery,
    suggestions,
    setSuggestions,
    loading,
    open,
    setOpen,
    activeIdx,
    setActiveIdx,
    grouped,
    groupOrder,
    navigate,
    pickSuggestion,
  };
}
