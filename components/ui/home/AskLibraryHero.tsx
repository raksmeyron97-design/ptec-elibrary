"use client"
 
;
/* eslint-disable @next/next/no-img-element */


import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { pushRecentSearch, readRecent, RECENT_KEY } from "./SearchSuggestions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AIBook = {
  title: string;
  author: string;
  slug: string;
  coverUrl?: string | null;
  category?: string;
  url?: string;
};

/** Phase drives all rendering decisions — single source of truth. */
type SearchPhase = "idle" | "thinking" | "streaming" | "done" | "error";

type Props = {
  trending?: string[];
  prompts?: string[];
  askLabel: string;
  hint: string;
};

// ─── SparkleIcon (shared with other components) ───────────────────────────────

export function SparkleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" opacity={0.85} />
      <path d="M19 14l.9 2.7 2.7.9-2.7.9-.9 2.7-.9-2.7-2.7-.9 2.7-.9L19 14z" opacity={0.55} />
    </svg>
  );
}

// ─── Scanning Laser (Gold + Cyan brand sweep) ─────────────────────────────────

function ScanningLaser() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
      {/* Primary cyan sweep */}
      <motion.div
        className="absolute inset-y-0 w-[45%]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.18) 35%, rgba(34,211,238,0.45) 50%, rgba(34,211,238,0.18) 65%, transparent 100%)",
        }}
        animate={{ x: ["-60%", "290%"] }}
        transition={{ duration: 1.7, repeat: Infinity, ease: "linear" }}
      />
      {/* Secondary gold shimmer — offset timing */}
      <motion.div
        className="absolute inset-y-0 w-[25%]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.22) 50%, transparent 100%)",
        }}
        animate={{ x: ["-40%", "520%"] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: 0.7 }}
      />
    </div>
  );
}

// ─── Thinking Dots ────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label="Thinking…">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-cyan-400"
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.75, 1.25, 0.75] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

// ─── Blinking cursor ──────────────────────────────────────────────────────────

function StreamCursor() {
  return (
    <motion.span
      aria-hidden
      className="ml-px inline-block h-[15px] w-[2px] translate-y-[1px] rounded-full bg-cyan-400 align-text-top"
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.65, repeat: Infinity, ease: "linear" }}
    />
  );
}

// ─── AI Book mini-card ────────────────────────────────────────────────────────

function AIBookCard({ book, onClick, index }: { book: AIBook; onClick: () => void; index: number }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      whileHover={{ y: -2 }}
      className="group flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm transition-colors hover:border-cyan-400/30 hover:bg-white/[0.09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
    >
      {/* Thumbnail */}
      <div className="relative h-[52px] w-9 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-gold-500/25 to-cyan-500/15">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-4 w-4 text-blue-300/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-snug text-white/90 group-hover:text-white">
          {book.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-blue-300/65">{book.author}</p>
        {book.category && (
          <span className="mt-1.5 inline-block rounded-full bg-cyan-500/15 px-2 py-px text-[10px] font-medium text-cyan-300">
            {book.category}
          </span>
        )}
      </div>

      {/* Arrow */}
      <svg
        className="mt-1 h-3.5 w-3.5 shrink-0 text-blue-300/30 transition-colors group-hover:text-cyan-400"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </motion.button>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLACEHOLDER_INTERVAL = 3600;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AskLibraryHero({ trending = [], prompts = [], askLabel, hint }: Props) {
  const router = useRouter();
  const t = useTranslations("home");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reducedMotion = useReducedMotion();

  // Input state
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);

  // AI search state
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [streamedText, setStreamedText] = useState("");
  const [aiBooks, setAiBooks] = useState<AIBook[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastQuery, setLastQuery] = useState("");

  const isExpanded = phase !== "idle";

  // Load recent searches
  useEffect(() => {
    const items = readRecent().slice(0, 3);
    const id = setTimeout(() => setRecent(items), 0);
    return () => clearTimeout(id);
  }, []);

  // Rotating placeholder
  useEffect(() => {
    const mq = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq || mq.matches || prompts.length < 2) return;
    const id = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setPromptIdx((i) => (i + 1) % prompts.length);
        setPromptVisible(true);
      }, 250);
    }, PLACEHOLDER_INTERVAL);
    return () => clearInterval(id);
  }, [prompts.length]);

  // Keyboard shortcuts: `/` to focus, `Escape` to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && isExpanded) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isExpanded]);

  // ── /api/search hook ───────────────────────────────────────────────────────
  // Drop-in: replace with your pgvector / OpenAI / Gemini backend.
  // The endpoint should return either:
  //   - application/json:          { answer: string, books: AIBook[] }
  //   - text/event-stream (SSE):   data: { text?: string, books?: AIBook[] }\n\n
  const runAISearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase("thinking");
    setStreamedText("");
    setAiBooks([]);
    setErrorMsg("");
    setLastQuery(query);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
        headers: { Accept: "text/event-stream, application/json" },
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // ── Streaming (SSE) path ──
        setPhase("streaming");
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;
            try {
              const chunk = JSON.parse(raw) as { text?: string; books?: AIBook[] };
              if (chunk.text) setStreamedText((s) => s + chunk.text);
              if (chunk.books) setAiBooks(chunk.books);
            } catch {
              setStreamedText((s) => s + raw);
            }
          }
        }
        setPhase("done");
      } else {
        // ── JSON path ──
        setPhase("streaming");
        const data = (await res.json()) as { answer?: string; books?: AIBook[] };
        setStreamedText(data.answer ?? "");
        setAiBooks(data.books ?? []);
        setPhase("done");
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg((err as Error).message ?? "Search failed. Please try again.");
      setPhase("error");
    }
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const submit = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      pushRecentSearch(clean);
      runAISearch(clean);
    },
    [runAISearch]
  );

  const browseAll = useCallback(
    (query: string) => {
      closePanel();
      router.push(`/books?q=${encodeURIComponent(query)}`);
    },
    [router]
  );

  function closePanel() {
    abortRef.current?.abort();
    setPhase("idle");
    setStreamedText("");
    setAiBooks([]);
  }

  const clearRecent = () => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* noop */ }
    setRecent([]);
  };

  const trendingLabel = locale === "en" ? "uppercase tracking-[0.16em]" : "tracking-normal";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-xl">

      {/* ── Command bar ───────────────────────────────────────────────────── */}
      <div className="relative z-[9999]">

        {/* Ambient glow bed */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-6 rounded-[22px] bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.15)_0%,transparent_70%)]"
          animate={{ opacity: focused || isExpanded ? 1 : 0.45 }}
          transition={{ duration: 0.35 }}
        />

        {/* Gradient ring */}
        <div className="relative rounded-2xl bg-gradient-to-r from-gold-400 via-blue-400/40 to-cyan-300 p-[2px]">

          {/* Inner bar */}
          <div className="relative flex items-center gap-2 rounded-[14px] bg-[#121C3A] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">

            {/* Gold + Cyan laser scan — thinking only, respect prefers-reduced-motion */}
            {!reducedMotion && phase === "thinking" && <ScanningLaser />}

            {/* Sparkle — spins while thinking */}
            <span className="relative z-10 shrink-0 text-cyan-300">
              {phase === "thinking" ? (
                <motion.span
                  className="block"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                >
                  <SparkleIcon className="h-4 w-4" />
                </motion.span>
              ) : (
                <SparkleIcon className="h-4 w-4" />
              )}
            </span>

            {/* Input + ghost placeholder */}
            <div className="relative z-10 flex-1">
              <input
                ref={inputRef}
                type="search"
                aria-label={askLabel}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit(value);
                  if (e.key === "Escape") closePanel();
                }}
                className="h-14 w-full bg-transparent text-[15px] text-white outline-none placeholder:text-transparent [&::-webkit-search-cancel-button]:appearance-none"
              />
              {!value && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center text-[15px] text-blue-300/50 transition-opacity duration-[250ms]"
                  style={{ opacity: promptVisible ? 1 : 0 }}
                >
                  {prompts[promptIdx] ?? ""}
                </span>
              )}
            </div>

            {/* Thinking dots — inline right of input */}
            <AnimatePresence>
              {phase === "thinking" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative z-10 shrink-0"
                >
                  <ThinkingDots />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Close panel button */}
            <AnimatePresence>
              {isExpanded && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                  onClick={closePanel}
                  aria-label="Close AI panel"
                  className="relative z-10 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/5 text-blue-300/60 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>

            {/* / kbd hint — hidden when panel open */}
            {!isExpanded && (
              <kbd className="relative z-10 hidden shrink-0 select-none items-center rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11px] font-mono text-blue-300/60 lg:flex">
                /
              </kbd>
            )}

            {/* Ask button */}
            <button
              type="button"
              onClick={() => submit(value)}
              disabled={phase === "thinking" || phase === "streaming"}
              aria-busy={phase === "thinking" || phase === "streaming"}
              className="relative z-10 ml-1 h-10 shrink-0 cursor-pointer rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-5 text-[14px] font-bold text-blue-950 transition-all hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
              style={{ boxShadow: "0 2px 0 rgba(0,0,0,0.25), 0 0 28px -6px rgba(245,158,11,0.75)" }}
            >
              {askLabel}
            </button>
          </div>
        </div>

        {/* ── AI Expanded Panel ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              role="region"
              aria-label="AI search results"
              aria-live="polite"
              initial={{ opacity: 0, y: -6, scaleY: 0.97 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -6, scaleY: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: "top" }}
              className="absolute left-0 right-0 z-[9999] mt-1.5 overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_32px_80px_-8px_rgba(0,0,0,0.85),0_0_0_1px_rgba(34,211,238,0.08)]"
            >
              {/* Glass backdrop */}
              <div
                className="relative"
                style={{
                  background:
                    "linear-gradient(180deg, rgb(11,19,44) 0%, rgb(8,14,34) 100%)",
                  backdropFilter: "blur(24px) saturate(160%)",
                }}
              >
                {/* Top accent gradient rule */}
                <div className="h-[2px] bg-gradient-to-r from-gold-400/70 via-cyan-400/90 to-blue-500/30" />

                {/* Subtle inner glow at top */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-30"
                  style={{
                    background:
                      "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(34,211,238,0.25), transparent)",
                  }}
                />

                {/* Scrollable content */}
                <div className="relative max-h-[68vh] space-y-4 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                  {/* ── Thinking ── */}
                  {phase === "thinking" && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <ThinkingDots />
                      <span className="text-[13px] text-blue-300/60">
                        Searching across the library…
                      </span>
                    </motion.div>
                  )}

                  {/* ── AI answer text ── */}
                  {(phase === "streaming" || phase === "done") && streamedText && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      {/* Section header */}
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-300">
                          <SparkleIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-300/80">
                          AI Summary
                        </span>
                        {phase === "streaming" && (
                          <span className="ml-auto">
                            <ThinkingDots />
                          </span>
                        )}
                      </div>

                      {/* Answer bubble */}
                      <div className="rounded-xl border border-cyan-400/[0.12] bg-cyan-950/[0.22] px-4 py-3.5">
                        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-blue-50/90">
                          {streamedText}
                          {phase === "streaming" && <StreamCursor />}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Book results grid ── */}
                  {aiBooks.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 }}
                      className="space-y-2.5"
                    >
                      {/* Section header */}
                      <div className="flex items-center gap-2">
                        <svg className="h-3.5 w-3.5 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-gold-400/85">
                          Recommended Books
                        </span>
                        <span className="ml-auto text-[11px] tabular-nums text-blue-300/35">
                          {aiBooks.length} found
                        </span>
                      </div>

                      {/* 2-col grid on sm+ */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {aiBooks.map((book, i) => (
                          <AIBookCard
                            key={book.slug ?? i}
                            book={book}
                            index={i}
                            onClick={() => router.push(book.url ?? `/books/${book.slug}`)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Error ── */}
                  {phase === "error" && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-950/25 px-4 py-3"
                    >
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                      </svg>
                      <p className="flex-1 text-[13px] text-red-300">
                        {errorMsg || "Something went wrong. Please try again."}
                      </p>
                      <button
                        type="button"
                        onClick={() => runAISearch(lastQuery)}
                        className="shrink-0 cursor-pointer text-[12px] font-semibold text-red-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                      >
                        Retry
                      </button>
                    </motion.div>
                  )}

                  {/* ── Done: footer actions ── */}
                  {phase === "done" && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="flex items-center justify-between border-t border-white/[0.06] pt-2.5"
                    >
                      <span className="text-[11px] text-blue-300/35">
                        Powered by PTEC AI · {lastQuery}
                      </span>
                      <button
                        type="button"
                        onClick={() => browseAll(lastQuery)}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-blue-300/60 transition-colors hover:text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                      >
                        Browse all results
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    </motion.div>
                  )}

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Hint line ── */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 text-[12px] text-blue-300/70"
          >
            {hint}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Chips (hidden while panel open) ── */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-4 space-y-3"
          >
            {/* Recent searches */}
            {recent.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">
                  {t("recent")}
                </span>
                {recent.map((term) => (
                  <button
                    key={`r-${term}`}
                    type="button"
                    onClick={() => submit(term)}
                    className="inline-flex max-w-[240px] cursor-pointer items-center gap-1.5 truncate rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] text-blue-50 backdrop-blur-sm transition-colors hover:border-cyan-400/50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    <svg className="h-3 w-3 shrink-0 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 8v4l3 3M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
                      <path d="M3 4v4h4" />
                    </svg>
                    <span className="truncate">{term}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearRecent}
                  className="cursor-pointer text-[11px] font-semibold text-blue-300/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                >
                  {t("clear")}
                </button>
              </div>
            )}

            {/* Trending chips */}
            {trending.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className={`text-[11px] font-bold text-gold-400 ${trendingLabel}`}>
                  {t("trending")}
                </span>
                {trending.slice(0, 5).map((term) => (
                  <button
                    key={`t-${term}`}
                    type="button"
                    onClick={() => submit(term)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[13px] font-medium text-gold-100 backdrop-blur-sm transition-colors hover:border-gold-500/60 hover:bg-gold-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
                  >
                    <svg className="h-3 w-3 shrink-0 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m3 17 6-6 4 4 8-8" />
                      <path d="M21 7h-6m6 0v6" />
                    </svg>
                    {term}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
