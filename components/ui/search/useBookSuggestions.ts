import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { pushRecentSearch } from "@/components/ui/home/SearchSuggestions";

type UseBookSuggestionsProps = {
  initialQuery?: string;
  onClose?: () => void; // For Command Palette to close itself
};

export function useBookSuggestions({ initialQuery = "", onClose }: UseBookSuggestionsProps = {}) {
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
    router.push(`/books?${params.toString()}`);
  }

  function pickSuggestion(s: Suggestion) {
    if (s.type === "book") {
      pushRecentSearch(s.label);
      setOpen(false);
      if (onClose) onClose();
      router.push(`/books/${s.slug}`);
    } else {
      setQuery(s.label);
      navigate(s.label);
    }
  }

  const grouped = suggestions.reduce<Record<string, Suggestion[]>>((acc, s) => {
    (acc[s.type] ??= []).push(s);
    return acc;
  }, {});

  const groupOrder: Suggestion["type"][] = ["book", "author", "category"];

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
