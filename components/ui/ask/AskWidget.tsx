"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";

// ── Types ────────────────────────────────────────────────────────────────────
interface Book {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
}

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

// ── Bouncing dots loading indicator ─────────────────────────────────────────
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3" aria-label="Thinking…" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-blue-300/60"
          style={{
            animation: "ask-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Book card row ────────────────────────────────────────────────────────────
function BookCard({ book, onNavigate }: { book: Book; onNavigate: () => void }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
    >
      <div className="relative h-[60px] w-[40px] shrink-0 overflow-hidden rounded-md bg-blue-900">
        {book.coverUrl ? (
          <Image src={book.coverUrl} alt={book.title} fill sizes="40px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-800 to-blue-950">
            <SparkleIcon className="h-4 w-4 text-gold-400/60" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-1 text-[13px] font-semibold text-white">{book.title}</p>
        <p className="line-clamp-1 text-[11px] text-blue-300/70">{book.author}</p>
      </div>
      <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-300/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
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
        @media (prefers-reduced-motion: reduce) {
          [style*="ask-bounce"] { animation: none !important; opacity: 0.6; }
        }
      `}</style>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl bg-[#0B1226] ring-1 ring-white/10 shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-5 sm:w-[380px] sm:max-h-[600px] sm:rounded-2xl"
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
            <span className="text-gold-400">
              <SparkleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={headingId} className="text-[14px] font-bold text-white">{t("title")}</h2>
              <p className="text-[11px] text-blue-300/70">{t("subtitle")}</p>
            </div>
            {/* Remaining quota badge — hidden for admins (remaining === null) */}
            {isLoggedIn && remaining !== null && !quotaExhausted && (
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-blue-300/60">
                {t("remaining", { count: remaining })}
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close library assistant"
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
                <SparkleIcon className="h-8 w-8" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white">{t("title")}</p>
                <p className="mt-1 text-[13px] text-blue-300/70">{t("loginRequired")}</p>
              </div>
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-5 text-[13px] font-semibold text-blue-950 transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
              >
                {t("loginButton")}
              </Link>
            </div>
          ) : (
            <>
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" aria-live="polite" aria-label="Conversation">
                {messages.length === 0 ? (
                  <div className="flex flex-col gap-3 py-2">
                    <p className="text-center text-[12px] text-blue-300/60">{t("subtitle")}</p>
                    <div className="flex flex-col gap-2">
                      {starters.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          disabled={inputDisabled}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-left text-[13px] text-blue-100 transition-colors hover:border-gold-400/40 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 disabled:pointer-events-none disabled:opacity-40"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                          m.role === "user"
                            ? "rounded-br-md bg-brand text-white"
                            : m.errorKind === "quota"
                            ? "rounded-bl-md bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/20"
                            : m.errorKind === "global_limit"
                            ? "rounded-bl-md bg-slate-800/80 text-blue-300 ring-1 ring-white/10"
                            : m.isError
                            ? "rounded-bl-md bg-red-950/50 text-red-300 ring-1 ring-red-500/20"
                            : "rounded-bl-md bg-white/[0.06] text-blue-50"
                        }`}
                      >
                        {m.text}
                      </div>
                      {m.role === "assistant" && m.books && m.books.length > 0 && (
                        <div className="w-full max-w-[92%] space-y-1.5">
                          {m.books.map((book) => (
                            <BookCard key={book.slug} book={book} onNavigate={() => setOpen(false)} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {loading && (
                  <div className="flex items-start">
                    <div className="rounded-2xl rounded-bl-md bg-white/[0.06]">
                      <ThinkingDots />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input row */}
              <div className="shrink-0 border-t border-white/[0.08] px-3 py-3">
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
                <div className={`flex items-center gap-2 rounded-xl border px-3 pr-1.5 py-1 transition-colors ${inputDisabled ? "border-white/5 bg-white/[0.02]" : "border-white/10 bg-white/[0.04]"}`}>
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
      <button
        ref={fabRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close library assistant" : t("open")}
        aria-expanded={open}
        className={`
          fixed z-40
          bottom-[calc(68px+env(safe-area-inset-bottom)+12px)] right-5
          sm:bottom-5 sm:right-5
          h-14 w-14 rounded-full
          bg-gradient-to-br from-gold-400 to-gold-500
          text-blue-950
          shadow-lg
          transition-all duration-200
          hover:brightness-110 hover:shadow-[0_0_24px_-4px_rgba(103,232,249,0.6)]
          active:scale-95
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400
          flex items-center justify-center
        `}
        style={{ boxShadow: open ? "0 0 24px -4px rgba(103,232,249,0.6), 0 4px 20px rgba(0,0,0,0.3)" : undefined }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <SparkleIcon className="h-6 w-6" />
        )}
      </button>
    </>
  );
}
