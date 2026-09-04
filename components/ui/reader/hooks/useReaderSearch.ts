"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { findPageMatches, itemStrings, type MatchSpan } from "@/lib/reader/search-matches";

/** One row in the results list: a page with ≥1 match. */
export type PageHit = { page: number; count: number; snippet: string; firstMatch: number };
/** A page's matches, each tagged with its global (document-wide) index. */
export type IndexedPageMatch = { spans: MatchSpan[]; idx: number };

/** Stop here to keep low-end phones responsive. */
export const MAX_MATCHES = 500;
/** Typing pauses this long before a search starts. */
export const SEARCH_DEBOUNCE_MS = 350;
/** Shorter queries match almost every page and are not worth the scan. */
export const MIN_QUERY_LENGTH = 2;

type SearchablePdf = {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
};

/**
 * In-document search. Sequential page text extraction (the text of every
 * page is cached for the life of the document), a sequence token that cancels
 * a superseded search, a yield to the event loop every 10 pages, and a cap on
 * total matches. Results are flushed per yield — not per hit — because every
 * flush re-renders the mounted text layers.
 */
export function useReaderSearch({
  pdfRef,
  docKey,
  navigate,
  currentPageRef,
}: {
  pdfRef: RefObject<SearchablePdf | null>;
  docKey: number;
  navigate: (page: number) => void;
  currentPageRef: RefObject<number>;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PageHit[]>([]);
  const [matchPages, setMatchPages] = useState<number[]>([]);
  const [matchesByPage, setMatchesByPage] = useState<Map<number, IndexedPageMatch[]>>(() => new Map());
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [searching, setSearching] = useState(false);
  const seqRef = useRef(0);
  const cacheRef = useRef<Map<number, string[]>>(new Map());
  const debounceRef = useRef<number | undefined>(undefined);

  // A new document invalidates the text cache and any running search.
  useEffect(() => {
    cacheRef.current = new Map();
    seqRef.current += 1;
  }, [docKey]);

  const clear = useCallback(() => {
    seqRef.current += 1;
    window.clearTimeout(debounceRef.current);
    setInput("");
    setQuery("");
    setHits([]);
    setMatchPages([]);
    setMatchesByPage(new Map());
    setCurrentMatch(-1);
    setSearching(false);
  }, []);

  const run = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      const seq = ++seqRef.current;
      window.clearTimeout(debounceRef.current);
      setQuery(q);
      setHits([]);
      setMatchPages([]);
      setMatchesByPage(new Map());
      setCurrentMatch(-1);
      const pdf = pdfRef.current;
      if (!pdf || !q) {
        setSearching(false);
        return;
      }
      setSearching(true);
      const found: PageHit[] = [];
      const flat: number[] = [];
      const byPage = new Map<number, IndexedPageMatch[]>();
      let globalIdx = 0;
      let jumped = false;
      let dirty = false;
      const flush = () => {
        if (!dirty) return;
        dirty = false;
        setHits([...found]);
        setMatchPages([...flat]);
        setMatchesByPage(new Map(byPage));
      };
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          if (seqRef.current !== seq || !pdfRef.current) return;
          let items = cacheRef.current.get(i);
          if (!items) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            items = itemStrings(tc.items as Array<{ str?: unknown }>);
            cacheRef.current.set(i, items);
          }
          if (seqRef.current !== seq) return;
          const pageMatches = findPageMatches(items, q);
          if (pageMatches.length) {
            const firstIdx = globalIdx;
            byPage.set(i, pageMatches.map((m) => ({ spans: m.spans, idx: globalIdx++ })));
            for (let k = 0; k < pageMatches.length; k++) flat.push(i);
            found.push({ page: i, count: pageMatches.length, snippet: pageMatches[0].snippet, firstMatch: firstIdx });
            dirty = true;
            if (!jumped) {
              jumped = true;
              flush();
              setCurrentMatch(firstIdx);
              if (i !== currentPageRef.current) navigate(i);
            }
            if (globalIdx >= MAX_MATCHES) break;
          }
          if (i % 10 === 0) {
            flush();
            await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
          }
        }
      } catch {
        /* a page that fails to extract is simply skipped */
      }
      if (seqRef.current === seq) {
        flush();
        setSearching(false);
      }
    },
    [pdfRef, navigate, currentPageRef],
  );

  /** Typing: debounce, then search once the query is long enough. */
  const onInputChange = useCallback(
    (value: string) => {
      setInput(value);
      window.clearTimeout(debounceRef.current);
      const q = value.trim();
      if (q.length < MIN_QUERY_LENGTH) {
        if (!q) clear();
        return;
      }
      debounceRef.current = window.setTimeout(() => void run(value), SEARCH_DEBOUNCE_MS);
    },
    [run, clear],
  );

  const goToMatch = useCallback(
    (idx: number) => {
      const total = matchPages.length;
      if (!total) return;
      const wrapped = ((idx % total) + total) % total;
      setCurrentMatch(wrapped);
      const page = matchPages[wrapped];
      if (page !== currentPageRef.current) navigate(page);
    },
    [matchPages, navigate, currentPageRef],
  );

  /** Enter: same query again → cycle; otherwise search now. */
  const submit = useCallback(
    (backwards = false) => {
      const q = input.trim();
      if (q && q === query && matchPages.length) {
        goToMatch(currentMatch + (backwards ? -1 : 1));
      } else {
        void run(input);
      }
    },
    [input, query, matchPages.length, goToMatch, currentMatch, run],
  );

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  return {
    input,
    onInputChange,
    query,
    hits,
    matchPages,
    matchesByPage,
    currentMatch,
    searching,
    goToMatch,
    submit,
    clear,
  };
}
