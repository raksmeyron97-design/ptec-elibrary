"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { pushRecentSearch, readRecent, RECENT_KEY } from "./SearchSuggestions";

type Props = {
  trending?: string[];
  prompts?: string[];
  askLabel: string;
  hint: string;
};

// Cyan sparkle icon (shared for ask bar eyebrow + ContinueReading)
export function SparkleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" opacity={0.85} />
      <path d="M19 14l.9 2.7 2.7.9-2.7.9-.9 2.7-.9-2.7-2.7-.9 2.7-.9L19 14z" opacity={0.55} />
    </svg>
  );
}

const PLACEHOLDER_INTERVAL = 3600; // ms — total cycle (250 out + swap + 250 in + rest)

export default function AskLibraryHero({ trending = [], prompts = [], askLabel, hint }: Props) {
  const router = useRouter();
  const t = useTranslations("home");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);

  // Load recent searches on mount — deferred to avoid synchronous setState-in-effect
  useEffect(() => {
    const items = readRecent().slice(0, 3);
    const id = setTimeout(() => setRecent(items), 0);
    return () => clearTimeout(id);
  }, []);

  // Rotating placeholder — skip under reduced motion or < 2 prompts
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

  // `/` keyboard shortcut — focus the ask bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      pushRecentSearch(clean);
      router.push(`/books?q=${encodeURIComponent(clean)}`);
    },
    [router]
  );

  const clearRecent = () => {
    try { localStorage.removeItem(RECENT_KEY); } catch {}
    setRecent([]);
  };

  const trendingLabel = locale === "en"
    ? "uppercase tracking-[0.16em]"
    : "tracking-normal";

  return (
    <div className="w-full max-w-xl">
      {/* Command bar */}
      <div className="relative">
        {/* Glow bed */}
        <div
          className="pointer-events-none absolute -inset-1.5 rounded-[20px] bg-gradient-to-r from-gold-500/50 via-blue-500/30 to-cyan-400/50 blur-xl transition-opacity duration-300"
          style={{ opacity: focused ? 0.9 : 0.45 }}
          aria-hidden
        />

        {/* Gradient ring */}
        <div className="relative rounded-2xl bg-gradient-to-r from-gold-400 via-blue-400/40 to-cyan-300 p-[2px]">
          {/* Inner bar */}
          <div className="flex items-center gap-2 rounded-[14px] bg-[#121C3A] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            {/* Cyan sparkle */}
            <span className="shrink-0 text-cyan-300">
              <SparkleIcon className="h-4 w-4" />
            </span>

            {/* Input with rotating ghost placeholder */}
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="search"
                aria-label={askLabel}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(value); }}
                className="h-14 w-full bg-transparent text-[15px] text-white outline-none placeholder:text-transparent [&::-webkit-search-cancel-button]:appearance-none"
              />
              {/* Ghost placeholder — shown only when input is empty */}
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

            {/* / kbd hint — desktop only */}
            <kbd className="hidden shrink-0 select-none items-center gap-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11px] font-mono text-blue-300/60 lg:flex">
              /
            </kbd>

            {/* Ask button */}
            <button
              type="button"
              onClick={() => submit(value)}
              className="ml-1 h-10 shrink-0 rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-5 text-[14px] font-bold text-blue-950 transition-all hover:brightness-110 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
              style={{ boxShadow: "0 2px 0 rgba(0,0,0,0.25), 0 0 28px -6px rgba(245,158,11,0.8)" }}
            >
              {askLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Hint line */}
      <p className="mt-2 text-[12px] text-blue-300/70">{hint}</p>

      {/* Chips */}
      <div className="mt-4 space-y-3">
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
                className="inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] text-blue-50 backdrop-blur-sm transition-colors hover:border-cyan-400/50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <svg className="h-3 w-3 shrink-0 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 8v4l3 3M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" /><path d="M3 4v4h4" />
                </svg>
                <span className="truncate">{term}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={clearRecent}
              className="text-[11px] font-semibold text-blue-300/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
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
                className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[13px] font-medium text-gold-100 backdrop-blur-sm transition-colors hover:border-gold-500/60 hover:bg-gold-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
              >
                <svg className="h-3 w-3 shrink-0 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m3 17 6-6 4 4 8-8" /><path d="M21 7h-6m6 0v6" />
                </svg>
                {term}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
