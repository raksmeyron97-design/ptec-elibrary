"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { getRemainingAiQuota } from "@/app/actions/ai-usage";

// ── Types ────────────────────────────────────────────────────────────────────
interface Book {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  url?: string;
  type?: "book" | "research" | "post";
}

// Per-type badge styling for result cards (label + Tailwind classes)
const TYPE_META: Record<NonNullable<Book["type"]>, { label: string; badge: string }> = {
  book: { label: "e-Book", badge: "bg-blue-400/15 text-blue-200/90 ring-blue-300/20" },
  research: { label: "Thesis", badge: "bg-gold-400/15 text-gold-300 ring-gold-400/25" },
  post: { label: "News", badge: "bg-emerald-400/15 text-emerald-300 ring-emerald-300/20" },
};

type MessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  books?: Book[];
  isError?: boolean;
  errorKind?: "quota" | "cooldown" | "global_limit" | "auth" | "general";
}

// ── Sparkle icon ──────────────────────────────────────────────────────────────
function SparkleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" opacity={0.9} />
      <path d="M19 14l.9 2.7 2.7.9-2.7.9-.9 2.7-.9-2.7-2.7-.9 2.7-.9L19 14z" opacity={0.55} />
    </svg>
  );
}

// ── Library Assistant icon ────────────────────────────────────────────────────
// Custom composite mark: open book (primary) + speech bubble with chat dots
// (secondary) + one small sparkle (AI accent). Lucide-compatible construction:
// outline strokes, round caps/joins, inherits color via currentColor.
// Legible from 20px up; the FAB renders it at 24–28px.
function LibraryAssistantIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Open book */}
      <path d="M5.7 26.8a1.2 1.2 0 0 1-1.2-1.2v-8.4a1.2 1.2 0 0 1 1.2-1.2h4.6c2.3 0 4.4 1 5.7 2.6 1.3-1.6 3.4-2.6 5.7-2.6h4.6a1.2 1.2 0 0 1 1.2 1.2v8.4a1.2 1.2 0 0 1-1.2 1.2h-5.5c-1.9 0-3.7.8-4.8 2.1-1.1-1.3-2.9-2.1-4.8-2.1z" />
      <path d="M16 18.6v10.3" />
      {/* Speech bubble, tail pointing at the book spine */}
      <path d="M12 2.5h8a3 3 0 0 1 3 3v1.5a3 3 0 0 1-3 3h-2.6L16 12.6 14.6 10H12a3 3 0 0 1-3-3V5.5a3 3 0 0 1 3-3z" />
      {/* Conversation dots (filled so they stay visible at small sizes) */}
      <circle cx="12.75" cy="6.25" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="16" cy="6.25" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19.25" cy="6.25" r="1.3" fill="currentColor" stroke="none" />
      {/* Single sparkle accent */}
      <path
        fill="currentColor"
        stroke="none"
        d="M27.4 1.7c.28 1.3 1.02 2.02 2.3 2.3-1.28.28-2.02 1.02-2.3 2.3-.28-1.28-1.02-2.02-2.3-2.3 1.28-.28 2.02-1.02 2.3-2.3z"
      />
    </svg>
  );
}

// ── AI avatar chip (assistant sender identity) ───────────────────────────────
function AiAvatar() {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-500 text-blue-950 shadow-sm shadow-black/30 ring-1 ring-white/20"
      aria-hidden="true"
    >
      <SparkleIcon className="h-4 w-4" />
    </div>
  );
}

// ── Bouncing dots loading indicator ─────────────────────────────────────────
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3" aria-label="Thinking…" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gradient-to-br from-gold-300 to-blue-300/70"
          style={{
            animation: "ask-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Book carousel card ───────────────────────────────────────────────────────
function BookCarouselCard({ book, onNavigate }: { book: Book; onNavigate: () => void }) {
  const href = book.url ?? `/books/${book.slug}`;
  const meta = book.type ? TYPE_META[book.type] : TYPE_META.book;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group relative flex w-32 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-2.5 transition-all duration-300 hover:border-gold-400/40 hover:bg-white/[0.09] hover:-translate-y-1 hover:shadow-lg hover:shadow-gold-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-blue-900 ring-1 ring-white/10 shadow-md shadow-black/30">
        {book.coverUrl ? (
          <Image src={book.coverUrl} alt={book.title} fill sizes="120px" className="object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-800 to-blue-950">
            <SparkleIcon className="h-6 w-6 text-gold-400/60" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
          <span className={`inline-block rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ring-1 backdrop-blur-md ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between pt-1">
        <div>
          <p className="line-clamp-2 text-[12px] font-semibold leading-tight text-white transition-colors group-hover:text-gold-300">{book.title}</p>
        </div>
        <p className="mt-1.5 line-clamp-1 text-[11px] text-blue-300/70">{book.author}</p>
      </div>
    </Link>
  );
}

// ── Basic markdown parser ───────────────────────────────────────────────────
function parseMarkdown(text: string) {
  if (!text) return null;
  const parts = text.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*|\n)/g);
  return parts.map((part, i) => {
    const key = `${part}-${i}`;
    if (part === "\n") return <br key={key} />;
    if (part.startsWith("[") && part.includes("](")) {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        return (
          <Link key={key} href={match[2]} className="text-gold-400 hover:underline">
            {match[1]}
          </Link>
        );
      }
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return <span key={key}>{part}</span>;
  });
}

// ── Main widget ──────────────────────────────────────────────────────────────
export default function AskWidget({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations("ask");
  const headingId = useId();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserMsg = useRef<string>("");
  const quotaFetched = useRef(false);

  const reduceMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [messages, loading, open, reduceMotion]);

  // Focus management
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 210);
      return () => clearTimeout(id);
    } else {
      fabRef.current?.focus();
    }
  }, [open, reduceMotion]);

  // Esc closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Fetch today's remaining quota on first open so the badge shows before
  // the first message (remaining stays null for admins — unlimited).
  useEffect(() => {
    if (!open || !isLoggedIn || quotaFetched.current) return;
    quotaFetched.current = true;
    getRemainingAiQuota().then(({ remaining: left, error }) => {
      if (error || left === null) return;
      setRemaining(left);
      if (left <= 0) setQuotaExhausted(true);
    });
  }, [open, isLoggedIn]);

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
  }, []);

  const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || cooldownActive || quotaExhausted || globalBusy) return;

      lastUserMsg.current = trimmed;
      setInput("");

      const userMsg: ChatMessage = { id: genId(), role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      // Build history for API — last MAX_TURNS (6) turns only
      const history = [...messages, userMsg]
        .slice(-6)
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }));

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });

        // Parse error kind from body when possible
        let errorKind: ChatMessage["errorKind"] = "general";
        if (!res.ok) {
          let body: { error?: string } = {};
          try { body = await res.json(); } catch { /* ignore */ }

          if (res.status === 401 || body.error === "auth") {
            errorKind = "auth";
          } else if (res.status === 429 && body.error === "quota") {
            setQuotaExhausted(true);
            setRemaining(0);
            setMessages((prev) => [
              ...prev,
              { id: genId(), role: "assistant", text: t("quotaReached"), isError: true, errorKind: "quota" },
            ]);
            return;
          } else if (res.status === 429 && body.error === "cooldown") {
            errorKind = "cooldown";
            // Activate client-side cooldown UI for 5s
            setCooldownActive(true);
            if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
            cooldownTimer.current = setTimeout(() => setCooldownActive(false), 5_000);
          } else if (body.error === "global_limit") {
            setGlobalBusy(true);
            setMessages((prev) => [
              ...prev,
              { id: genId(), role: "assistant", text: t("busy"), isError: true, errorKind: "global_limit" },
            ]);
            return;
          } else if (res.status === 503) {
            // Temporary server/DB error — show error but don't lock the widget
            setMessages((prev) => [
              ...prev,
              { id: genId(), role: "assistant", text: t("error"), isError: true, errorKind: "general" },
            ]);
            return;
          }

          const errorText =
            errorKind === "cooldown" ? t("slowDown") :
            errorKind === "auth"     ? t("loginRequired") :
            t("error");

          setMessages((prev) => [
            ...prev,
            { id: genId(), role: "assistant", text: errorText, isError: true, errorKind },
          ]);
          return;
        }

        const data: { answer: string; books: Book[]; remaining: number | null } = await res.json();

        // Track remaining quota (null = admin, unlimited)
        if (data.remaining !== null && data.remaining !== undefined) {
          setRemaining(data.remaining);
          if (data.remaining <= 0) setQuotaExhausted(true);
        }

        setMessages((prev) => [
          ...prev,
          { id: genId(), role: "assistant", text: data.answer, books: data.books?.slice(0, 5) },
        ]);

        // Activate client-side cooldown UX after a successful request too
        setCooldownActive(true);
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(() => setCooldownActive(false), 5_000);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: genId(), role: "assistant", text: t("error"), isError: true, errorKind: "general" },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, cooldownActive, quotaExhausted, globalBusy, messages, t]
  );

  const inputDisabled = loading || quotaExhausted || globalBusy;
  const sendDisabled  = inputDisabled || cooldownActive || !input.trim();

  const starters: [string, string, string] = [t("starter1"), t("starter2"), t("starter3")];

  return (
    <>
      <style>{`
        @keyframes ask-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes ask-icon-swap {
          from { opacity: 0; transform: rotate(-60deg) scale(0.5); }
          to   { opacity: 1; transform: rotate(0deg) scale(1); }
        }
        .ask-fab-icon { animation: ask-icon-swap 0.22s cubic-bezier(0.22,1,0.36,1); }
        @media (prefers-reduced-motion: reduce) {
          [style*="ask-bounce"] { animation: none !important; opacity: 0.6; }
          .ask-fab-icon { animation: none; }
        }
        .ask-scroll { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.35) transparent; }
        .ask-scroll::-webkit-scrollbar { width: 6px; }
        .ask-scroll::-webkit-scrollbar-track { background: transparent; }
        .ask-scroll::-webkit-scrollbar-thumb {
          background: rgba(148,163,184,0.28);
          border-radius: 9999px;
        }
        .ask-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
      `}</style>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl bg-[#0B1226] ring-1 ring-white/10 shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-5 sm:w-[380px] sm:max-h-[600px] sm:rounded-2xl"
          style={{
            maxHeight: "85dvh",
            boxShadow: "0 -2px 0 0 #E4BB30, inset 0 1px 0 rgba(34,211,238,0.15), 0 25px 50px -12px rgba(0,0,0,0.5)",
            animation: reduceMotion ? "none" : "ask-panel-in 0.2s cubic-bezier(0.22,1,0.36,1) both",
            transformOrigin: "bottom right",
          }}
        >
          <style>{`
            @keyframes ask-panel-in {
              from { opacity: 0; transform: scale(0.92) translateY(8px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-4 py-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-blue-950 shadow-sm shadow-black/30 ring-1 ring-white/20">
              <LibraryAssistantIcon className="h-5.5 w-5.5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B1226] bg-emerald-400" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={headingId} className="truncate text-[14px] font-bold text-white">{t("title")}</h2>
              <p className="flex items-center gap-1 text-[11px] text-blue-300/70">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                <span className="truncate">{t("subtitle")}</span>
              </p>
            </div>
            {/* Remaining quota badge — hidden for admins (remaining === null) */}
            {isLoggedIn && remaining !== null && !quotaExhausted && (
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-blue-300/70 ring-1 ring-white/10">
                {t("remaining", { count: remaining })}
              </span>
            )}
            <button type="button" onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-blue-300/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Login gate (not logged in) ───────────────────────────── */}
          {!isLoggedIn ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-400">
                <LibraryAssistantIcon className="h-8 w-8" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white">{t("title")}</p>
                <p className="mt-1 text-[13px] text-blue-300/70">{t("loginRequired")}</p>
              </div>
              <NextLink
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-5 text-[13px] font-semibold text-blue-950 transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
              >
                {t("loginButton")}
              </NextLink>
            </div>
          ) : (
            <>
              {/* Messages area */}
              <div className="ask-scroll flex-1 overflow-y-auto px-3 py-3 space-y-3" aria-live="polite" aria-label="Conversation">
                {messages.length === 0 ? (
                  <div className="flex flex-col gap-4 py-3">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400/20 to-gold-500/5 text-gold-400 ring-1 ring-gold-400/20">
                        <LibraryAssistantIcon className="h-6 w-6" />
                      </div>
                      <p className="text-[12px] text-blue-300/70 max-w-[240px] leading-relaxed">{t("subtitle")}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {starters.map((s) => (
                        <button key={s} type="button" onClick={() => sendMessage(s)}
                          disabled={inputDisabled}
                          className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-left text-[13px] text-blue-100 transition-all duration-200 hover:border-gold-400/40 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <SparkleIcon className="h-3.5 w-3.5 shrink-0 text-gold-400/60 transition-colors group-hover:text-gold-400" />
                          <span className="flex-1">{s}</span>
                          <svg className="h-3.5 w-3.5 shrink-0 text-blue-300/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gold-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-brand-contrast shadow-sm shadow-black/20">
                          {m.text}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex items-start gap-2">
                        <AiAvatar />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 items-start">
                          <div
                            className={`max-w-full rounded-2xl rounded-tl-md px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                              m.errorKind === "quota"
                                ? "bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/20"
                                : m.errorKind === "global_limit"
                                ? "bg-slate-800/80 text-blue-300 ring-1 ring-white/10"
                                : m.isError
                                ? "bg-red-950/50 text-red-300 ring-1 ring-red-500/20"
                                : "bg-white/[0.06] text-blue-50 ring-1 ring-white/[0.06]"
                            }`}
                          >
                            {parseMarkdown(m.text)}
                          </div>
                          {m.books && m.books.length > 0 && (
                            <div className="ask-scroll -mx-4 mt-1.5 flex w-[calc(100%+32px)] snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-1">
                              {m.books.map((book) => (
                                <BookCarouselCard key={`${book.type ?? "book"}-${book.slug}`} book={book} onNavigate={() => setOpen(false)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )
                )}

                {loading && (
                  <div className="flex items-start gap-2">
                    <AiAvatar />
                    <div className="rounded-2xl rounded-tl-md bg-white/[0.06] ring-1 ring-white/[0.06]">
                      <ThinkingDots />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input row */}
              <div className="shrink-0 border-t border-white/[0.08] px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:pb-3">
                {/* Quota exhausted banner */}
                {quotaExhausted && (
                  <p className="mb-2 rounded-lg bg-amber-950/40 px-3 py-2 text-center text-[11px] text-amber-300 ring-1 ring-amber-500/20">
                    {t("quotaReached")}
                  </p>
                )}
                {/* Cooldown inline notice */}
                {cooldownActive && !quotaExhausted && !loading && (
                  <p className="mb-2 text-center text-[11px] text-blue-300/50">
                    {t("slowDown")}
                  </p>
                )}
                <div className={`flex items-center gap-2 rounded-xl border px-3 pr-1.5 py-1 transition-all duration-200 focus-within:border-gold-400/50 focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-gold-400/15 ${inputDisabled ? "border-white/5 bg-white/[0.02]" : "border-white/10 bg-white/[0.04]"}`}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    maxLength={500}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                    placeholder={quotaExhausted ? t("quotaReached") : t("placeholder")}
                    aria-label={t("placeholder")}
                    disabled={inputDisabled}
                    className="h-9 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-blue-300/40 disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => sendMessage(input)}
                    disabled={sendDisabled}
                    aria-label={t("send")}
                    className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-b from-gold-400 to-gold-500 text-blue-950 transition-all hover:brightness-110 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 flex items-center justify-center"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] text-blue-300/40">{t("disclaimer")}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FAB ───────────────────────────────────────────────────── */}
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-label={open ? t("close") : t("open")}
        aria-expanded={open}
        className={`
          group fixed z-40
          ${open ? "hidden sm:flex" : "flex"}
          bottom-[calc(76px+env(safe-area-inset-bottom)+14px)] right-4
          lg:bottom-5 lg:right-5
          h-13 w-13 sm:h-14 sm:w-14 rounded-full
          bg-gradient-to-br from-gold-400 to-gold-500
          text-blue-950
          ring-1 ring-white/50
          shadow-[0_10px_28px_rgba(11,21,48,0.25),0_3px_8px_rgba(11,21,48,0.16)]
          transition-all duration-200
          hover:brightness-105 hover:shadow-[0_14px_32px_rgba(11,21,48,0.3),0_4px_10px_rgba(11,21,48,0.2)]
          motion-safe:hover:-translate-y-0.5
          active:scale-95 active:translate-y-0
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring
          items-center justify-center
        `}
      >
        {/* Hover/focus label — desktop pointer affordance; aria-label covers AT */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[calc(100%+12px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-blue-950/95 px-3 py-1.5 text-[12px] font-medium text-white opacity-0 shadow-lg shadow-black/25 ring-1 ring-white/15 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
        >
          {open ? t("close") : t("open")}
        </span>
        {open ? (
          <svg viewBox="0 0 24 24" className="ask-fab-icon h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <LibraryAssistantIcon className="ask-fab-icon h-6 w-6 sm:h-7 sm:w-7" />
        )}
      </button>
    </>
  );
}
