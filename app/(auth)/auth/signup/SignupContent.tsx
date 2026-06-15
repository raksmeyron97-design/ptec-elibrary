/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/(auth)/auth/signup/SignupContent.tsx
"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from 'next-intl';
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

// ── Friendly error messages ───────────────────────────────────────────────────
function friendlyError(msg: string): string {
  if (/user already registered/i.test(msg))
    return "An account with this email already exists. Try signing in instead.";
  if (/password should be at least/i.test(msg))
    return "Password must be at least 8 characters.";
  if (/invalid email/i.test(msg))
    return "Please enter a valid email address.";
  if (/too many requests|rate limit/i.test(msg))
    return "Too many attempts. Please wait and try again.";
  if (/network/i.test(msg))
    return "Network error. Please check your connection.";
  return msg;
}

// ── PTEC content data ────────────────────────────────────────────────────────
const MISSIONS = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
      </svg>
    ),
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21a48.25 48.25 0 0 1-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
];

const CORE_VALUES = [
  { letter: "R", word: "Respect" },
  { letter: "I", word: "Integrity" },
  { letter: "I", word: "Innovation" },
  { letter: "C", word: "Commitment" },
  { letter: "E", word: "Efficiency" },
];

const PROGRAMS = [
  "BEd Primary (12+4)",
  "BEd Lower Sec. (12+4)",
  "BEd Lower Sec. (BA+1)",
  "MEd / Ph.D",
];

// ── Props ────────────────────────────────────────────────────────────────────
type Props = {
  stats: {
    books: string;
    downloads: string;
    views: string;
    users: string;
  };
};

export default function SignupContent({ stats }: Props) {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [fullName, setFullName]         = useState("");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [loading, setLoading]           = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);
  const [submitted, setSubmitted]       = useState(false);

  const supabase = createClient();
  const isDev = process.env.NODE_ENV === 'development';

  const nameEmpty      = submitted && fullName.trim().length < 2;
  const emailInvalid   = submitted && email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailEmpty     = submitted && email === "";
  const passwordInvalid= submitted && password.length > 0 && password.length < 8;
  const passwordEmpty  = submitted && password === "";
  const passwordMismatch = submitted && confirmPassword !== password;

  const nameErrMsg     = nameEmpty ? t('errNameRequired') : null;
  const emailErrMsg    = emailEmpty ? t('errEmailRequired')
    : emailInvalid     ? t('errEmailInvalid')
    : null;
  const passwordErrMsg = passwordEmpty ? t('errPasswordRequired') 
    : passwordInvalid  ? t('errPasswordLength') 
    : null;
  const confirmErrMsg  = passwordMismatch ? t('errPasswordMismatch') : null;

  function friendlyErrorLocal(msg: string): string {
    if (/user already registered/i.test(msg)) return t('errUserExists');
    if (/password should be at least/i.test(msg)) return t('errPasswordLength');
    if (/invalid email/i.test(msg)) return t('errEmailInvalid');
    if (/too many requests|rate limit/i.test(msg)) return t('errTooManyRequests');
    if (/network/i.test(msg)) return t('errNetwork');
    return t('errDefault');
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (nameErrMsg || emailErrMsg || passwordErrMsg || confirmErrMsg || !email || !password || !fullName || password !== confirmPassword) return;
    if (!captchaToken) { setError("Please complete the verification below."); return; }

    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(friendlyErrorLocal(error.message));
      setLoading(false);
      turnstileRef.current?.reset();
      setCaptchaToken(undefined);
      return;
    }
    
    setSuccess(true);
    setLoading(false);
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(friendlyErrorLocal(error.message)); setGoogleLoading(false); }
  }

  return (
    <div className="flex min-h-screen font-sans">
      {/* ══════════════════════════════════════════════════════
          LEFT PANEL — PTEC identity + real stats
      ══════════════════════════════════════════════════════ */}
      <div className="relative hidden w-[45%] flex-col overflow-hidden lg:flex">
        {/* 1. Campus background photo */}
        <Image
          src="/ptec-library.jpg"
          alt=""
          aria-hidden="true"
          fill
          className="object-cover object-center"
          priority
        />

        {/* 2. Layered dark overlays for legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/88 via-blue-950/80 to-blue-950/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(30,58,138,0.4),transparent)]" />

        {/* 3. Subtle dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(70% 60% at 30% 40%, #000, transparent 80%)",
          }}
        />

        {/* ── Scroll container ── */}
        <div className="relative z-10 flex flex-1 flex-col justify-between px-11 py-10 overflow-y-auto">
          {/* TOP: Logo */}
          <Link href="/" className="flex items-center gap-3.5 group w-fit">
            <div className="flex h-13 w-13 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20 transition group-hover:bg-white/20 p-2">
              <Image src="/logo_footer.png" alt="PTEC" width={36} height={36} className="object-contain" />
            </div>
            <div>
              <span className="block text-lg font-bold text-white tracking-wide drop-shadow">
                PTEC <span className="text-brand">e-Library</span>
              </span>
              <span className="text-[10px] text-white/50 tracking-[0.2em] uppercase">
                {t('digitalLearningHub')}
              </span>
            </div>
          </Link>

          {/* MIDDLE: Institution info */}
          <div className="my-8 space-y-7">
            {/* Accredited CPD badge */}
            <div className="flex items-center gap-2 w-fit rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 backdrop-blur-sm">
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-amber-300 shrink-0">
                <path d="M8 1l1.796 3.641L14 5.528l-3 2.924.708 4.129L8 10.5l-3.708 2.081L5 8.452 2 5.528l4.204-.887L8 1z" fill="currentColor"/>
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                {t('accredited')}
              </span>
            </div>

            {/* Vision */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45 mb-2">
                {t('ourVision')}
              </p>
              <p className="text-[15px] font-medium leading-relaxed text-white/90 drop-shadow">
                {t('visionText1')}{" "}
                <span className="text-amber-300 font-semibold">{t('visionText2')}</span>.
              </p>
            </div>

            {/* 3 Missions */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45 mb-3">
                {t('ourMissions')}
              </p>
              <ul className="space-y-2.5">
                {MISSIONS.map((m, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70">
                      {m.icon}
                    </span>
                    <span className="text-[13px] leading-snug text-white/80">{t(`mission${i + 1}` as any)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* RIICE Core Values */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45 mb-3">
                {t('coreValues')}
              </p>
              <div className="flex flex-wrap gap-2">
                {CORE_VALUES.map(({ letter, word }) => (
                  <div
                    key={word}
                    className="group flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/8 px-2.5 py-1.5 backdrop-blur-sm transition hover:border-amber-300/40 hover:bg-amber-300/10"
                  >
                    <span className="text-sm font-bold text-amber-300 leading-none">{letter}</span>
                    <span className="text-[11px] text-white/70 group-hover:text-white/90 transition">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Programs */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45 mb-3">
                {t('programs')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PROGRAMS.map((p) => (
                  <span
                    key={p}
                    className="rounded-md border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] text-white/75"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats — 4 columns, server-fetched */}
            <div className="grid grid-cols-4 gap-3 border-t border-white/10 pt-6">
              {[
                { num: stats.books,     label: t('statResources') },
                { num: stats.views,     label: t('statViews')     },
                { num: stats.downloads, label: t('statDownloads') },
                { num: stats.users,     label: t('statEducators') },
              ].map(({ num, label }) => (
                <div key={label}>
                  <div className="text-xl font-bold text-white drop-shadow leading-none">
                    {num}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BOTTOM: Copyright + PTEC link */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-white/35">
              {t('copyright', { year: new Date().getFullYear() })}
            </p>
            <a
              href="https://www.ptec.edu.kh"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition"
            >
              ptec.edu.kh
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-2.5 w-2.5">
                <path d="M2 10L10 2M10 2H5M10 2v5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          RIGHT PANEL — Signup form
      ══════════════════════════════════════════════════════ */}
      <div className="flex flex-1 flex-col items-center justify-center bg-paper px-6 py-12 sm:px-12">
        {/* Mobile brand header */}
        <div className="mb-8 flex flex-col items-center gap-1.5 lg:hidden">
          <Link href="/">
            <Image
              src="/logo_top.png"
              alt="PTEC e-Library"
              width={120}
              height={40}
              className="h-9 w-auto object-contain"
            />
          </Link>
          <p className="text-xs text-text-muted tracking-wide">PTEC e-Library · {t('digitalLearningHub')}</p>
        </div>

        <div className="w-full max-w-[420px]">
          {success ? (
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h1 className="mb-3 text-3xl font-bold text-text-heading">{t('checkEmailTitle')}</h1>
              <p className="mb-6 text-text-muted leading-relaxed">
                {t('checkEmailSent')}<span className="font-semibold text-text-body">{email}</span>{t('checkEmailClick')}
              </p>
              <p className="text-sm text-text-muted">
                {t('checkEmailSpam')}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-text-heading">{t('signupTitle')}</h1>
                <p className="mt-2 text-text-muted">{t('signupSubtitle')}</p>
              </div>

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading || googleLoading}
                className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-divider bg-bg-surface px-5 py-3.5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper hover:shadow-md disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-safe:active:scale-[0.99]"
              >
                {googleLoading ? <SpinnerIcon /> : <GoogleIcon />}
                {googleLoading ? t('redirecting') : t('continueGoogle')}
              </button>

              {/* Divider */}
              <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-divider" />
                <span className="text-xs font-medium text-text-muted">{t('orSignUpEmail')}</span>
                <div className="h-px flex-1 bg-divider" />
              </div>

              {/* Form */}
              <form onSubmit={handleSignup} noValidate className="space-y-4">
                {/* Full name */}
                <div>
                  <label htmlFor="signup-fullname" className="mb-1.5 block text-sm font-semibold text-text-body">
                    {t('fullNameLabel')}
                  </label>
                  <input
                    id="signup-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder={t('fullNamePlaceholder')}
                    aria-invalid={nameErrMsg ? true : undefined}
                    aria-describedby={nameErrMsg ? "signup-fullname-error" : undefined}
                    className={`h-12 w-full rounded-xl border bg-bg-surface px-4 text-sm text-text-heading placeholder-text-muted outline-none transition focus:ring-2 ${
                      nameErrMsg
                        ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                        : "border-divider focus:border-brand focus:ring-brand/15"
                    }`}
                  />
                  {nameErrMsg && (
                    <p id="signup-fullname-error" role="alert" className="mt-1.5 text-xs text-red-500">{nameErrMsg}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="signup-email" className="mb-1.5 block text-sm font-semibold text-text-body">
                    {t('emailLabel')}
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder={t('emailPlaceholder')}
                    aria-invalid={emailErrMsg ? true : undefined}
                    aria-describedby={emailErrMsg ? "signup-email-error" : undefined}
                    className={`h-12 w-full rounded-xl border bg-bg-surface px-4 text-sm text-text-heading placeholder-text-muted outline-none transition focus:ring-2 ${
                      emailErrMsg
                        ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                        : "border-divider focus:border-brand focus:ring-brand/15"
                    }`}
                  />
                  {emailErrMsg && (
                    <p id="signup-email-error" role="alert" className="mt-1.5 text-xs text-red-500">{emailErrMsg}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="signup-password" className="mb-1.5 block text-sm font-semibold text-text-body">{t('passwordLabel')}</label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      aria-invalid={passwordErrMsg ? true : undefined}
                      aria-describedby={passwordErrMsg ? "signup-password-error" : undefined}
                      className={`h-12 w-full rounded-xl border bg-bg-surface px-4 pr-12 text-sm text-text-heading placeholder-text-muted outline-none transition focus:ring-2 ${
                        passwordErrMsg
                          ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                          : "border-divider focus:border-brand focus:ring-brand/15"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded text-text-muted hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {passwordErrMsg && (
                    <p id="signup-password-error" role="alert" className="mt-1.5 text-xs text-red-500">{passwordErrMsg}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="signup-confirm-password" className="mb-1.5 block text-sm font-semibold text-text-body">{t('confirmPasswordLabel')}</label>
                  <div className="relative">
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPw ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      aria-invalid={confirmErrMsg ? true : undefined}
                      aria-describedby={confirmErrMsg ? "signup-confirm-password-error" : undefined}
                      className={`h-12 w-full rounded-xl border bg-bg-surface px-4 pr-12 text-sm text-text-heading placeholder-text-muted outline-none transition focus:ring-2 ${
                        confirmErrMsg
                          ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                          : "border-divider focus:border-brand focus:ring-brand/15"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded text-text-muted hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      aria-label={showConfirmPw ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {confirmErrMsg && (
                    <p id="signup-confirm-password-error" role="alert" className="mt-1.5 text-xs text-red-500">{confirmErrMsg}</p>
                  )}
                </div>

                <Turnstile
                  ref={turnstileRef}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onSuccess={setCaptchaToken}
                  onExpire={() => setCaptchaToken(undefined)}
                  onError={() => setCaptchaToken(undefined)}
                />

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || googleLoading || !captchaToken}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-brand-contrast shadow-sm transition hover:bg-brand-hover hover:shadow-md disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-safe:active:scale-[0.99]"
                >
                  {loading ? (<><SpinnerIcon /> {t('creatingAccount')}</>) : t('createAccount')}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-text-muted">
                {t('alreadyHaveAccount')}{" "}
                <Link href="/auth/login" className="font-semibold text-brand hover:underline">
                  {t('signIn')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  );
}
