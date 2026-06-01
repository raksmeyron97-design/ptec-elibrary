"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── Friendly Supabase error messages ─────────────────────────────────────────
const URL_ERROR_MAP: Record<string, string> = {
  admin_signup_blocked:
    "This email domain is reserved for administrators. Please contact the admin team.",
  auth_failed: "Authentication failed. Please try again.",
};

function friendlyError(msg: string): string {
  if (/invalid login credentials|invalid credentials/i.test(msg))
    return "Incorrect email or password. Please try again.";
  if (/email not confirmed/i.test(msg))
    return "Please check your email and confirm your account before signing in.";
  if (/too many requests|rate limit/i.test(msg))
    return "Too many attempts. Please wait a moment and try again.";
  if (/network/i.test(msg))
    return "Network error. Please check your connection and try again.";
  return msg;
}

// ── Main content (needs useSearchParams, so wrapped in Suspense below) ────────
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (URL_ERROR_MAP[urlError] ?? "An error occurred. Please try again.") : null,
  );
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const supabase = createClient();

  // Inline field errors
  const emailInvalid =
    (emailTouched || submitted) && email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailEmpty = submitted && email === "";
  const passwordEmpty = submitted && password === "";

  const emailErrMsg = emailEmpty
    ? "Email address is required."
    : emailInvalid
      ? "Please enter a valid email address."
      : null;
  const passwordErrMsg = passwordEmpty ? "Password is required." : null;

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (emailErrMsg || passwordErrMsg || !email || !password) return;

    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(friendlyError(error.message));
      setLoading(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?callbackUrl=${encodeURIComponent(callbackUrl)}`,
      },
    });

    if (error) {
      setError(friendlyError(error.message));
      setGoogleLoading(false);
    }
    // On success, browser redirects automatically
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen font-sans">
      {/* ── Left panel — dark brand side ── */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-blue-950 p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg-surface/[0.03]" />

        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-4 group w-fit">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg-surface/10 backdrop-blur-md border border-white/10 transition group-hover:bg-bg-surface/20">
            <Image src="/logo_footer.png" alt="PTEC" width={40} height={40} className="object-contain" />
          </div>
          <div>
            <span className="block text-xl font-bold text-white tracking-wide">
              PTEC <span className="text-brand">e-Library</span>
            </span>
            <span className="text-xs text-text-muted tracking-widest uppercase">Digital Learning Hub</span>
          </div>
        </Link>

        {/* Center quote */}
        <div className="relative space-y-6">
          <svg
            className="mb-6 h-16 w-16 text-brand/60"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <rect x="8" y="44" width="48" height="8" rx="2" />
            <rect x="12" y="32" width="40" height="10" rx="2" />
            <rect x="16" y="20" width="32" height="10" rx="2" />
            <rect x="20" y="10" width="24" height="8" rx="2" />
          </svg>
          <blockquote className="text-2xl font-light leading-relaxed text-white/90">
            "Lead students to good ways of life with{" "}
            <span className="font-semibold text-brand">no discrimination</span>."
          </blockquote>
          <p className="text-sm text-text-muted">— PTEC Mission Statement</p>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
            {[
              ["500+", "Books"],
              ["12K+", "Students"],
              ["8", "Departments"],
            ].map(([num, label]) => (
              <div key={label}>
                <div className="text-2xl font-bold text-white">{num}</div>
                <div className="text-xs text-text-muted mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-text-muted">
          © {new Date().getFullYear()} Phnom Penh Teacher Education College
        </div>
      </div>

      {/* ── Right panel — form ── */}
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
          <p className="text-xs text-text-muted tracking-wide">
            PTEC e-Library · Digital Learning Hub
          </p>
        </div>

        <div className="w-full max-w-[420px]">
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text-heading">Welcome back</h1>
            <p className="mt-2 text-text-muted">Sign in to access the PTEC digital library.</p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4m0 4h.01" />
              </svg>
              {error}
            </div>
          )}

          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-divider bg-bg-surface px-5 py-3.5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper hover:shadow-md disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-safe:active:scale-[0.99]"
          >
            {googleLoading ? <SpinnerIcon /> : <GoogleIcon />}
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-divider" />
            <span className="text-xs font-medium text-text-muted">or sign in with email</span>
            <div className="h-px flex-1 bg-divider" />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-sm font-semibold text-text-body"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={emailErrMsg ? true : undefined}
                aria-describedby={emailErrMsg ? "login-email-error" : undefined}
                className={`h-12 w-full rounded-xl border bg-bg-surface px-4 text-sm text-text-heading placeholder-text-muted outline-none transition focus:ring-2 ${
                  emailErrMsg
                    ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                    : "border-divider focus:border-brand focus:ring-brand/15"
                }`}
              />
              {emailErrMsg && (
                <p id="login-email-error" role="alert" className="mt-1.5 text-xs text-red-500">
                  {emailErrMsg}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="login-password" className="text-sm font-semibold text-text-body">
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={passwordErrMsg ? true : undefined}
                  aria-describedby={passwordErrMsg ? "login-password-error" : undefined}
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
                <p id="login-password-error" role="alert" className="mt-1.5 text-xs text-red-500">
                  {passwordErrMsg}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-950 text-sm font-semibold text-white shadow-sm transition hover:bg-brand hover:shadow-md disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-safe:active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <SpinnerIcon />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Sign-up link */}
          <p className="mt-6 text-center text-sm text-text-muted">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="font-semibold text-brand hover:underline">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper text-text-muted font-sans">
          <SpinnerIcon />
          <span className="ml-2">កំពុងផ្ទុក...</span>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
