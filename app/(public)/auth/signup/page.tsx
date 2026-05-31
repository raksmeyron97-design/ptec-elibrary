"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // After successful signUp, verify the domain is not reserved for admin
    const { verifySignup } = await import("@/app/actions/auth");
    const verification = await verifySignup();
    if (!verification.success) {
      setError(verification.error || "Signup rejected.");
      setLoading(false);
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
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  // ── Success state ─────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="w-full max-w-md rounded-2xl border border-divider bg-bg-surface p-10 shadow-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-8 w-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              <path d="m16 19 2 2 4-4"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-heading">Check your email</h2>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-text-body">{email}</span>.
            Click the link to activate your account.
          </p>
          <Link
            href="/auth/login"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-blue-950 px-6 text-sm font-semibold text-white transition hover:bg-brand"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen font-sans">

      {/* ── Left dark panel ── */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-blue-950 p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg-surface/10 border border-white/10">
            <Image src="/logo_footer.png" alt="PTEC" width={40} height={40} className="object-contain" />
          </div>
          <div>
            <span className="block text-xl font-bold text-white tracking-wide">PTEC <span className="text-brand">e-Library</span></span>
            <span className="text-xs text-text-muted tracking-widest uppercase">Digital Learning Hub</span>
          </div>
        </div>

        {/* Center content */}
        <div className="relative space-y-5">
          <div className="space-y-3">
            {[
              ["📚", "Access 500+ educational resources"],
              ["🔖", "Save and track your reading progress"],
              ["🎓", "Exclusive pedagogy & research papers"],
              ["📱", "Read on any device, anytime"],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-4 rounded-xl border border-white/10 bg-bg-surface/5 px-4 py-3.5 backdrop-blur-sm">
                <span className="text-xl">{icon}</span>
                <span className="text-sm font-medium text-text-muted">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-text-muted">
          © {new Date().getFullYear()} Phnom Penh Teacher Education College
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-paper px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Image src="/logo_top.png" alt="PTEC" width={120} height={40} className="h-9 w-auto object-contain" />
        </div>

        <div className="w-full max-w-[420px]">

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text-heading">Create account</h1>
            <p className="mt-2 text-text-muted">Join the PTEC digital library today.</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
              {error}
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-divider bg-bg-surface px-5 py-3.5 text-sm font-semibold text-text-body shadow-sm transition hover:border-divider hover:bg-paper hover:shadow-md disabled:opacity-60"
          >
            {googleLoading ? <SpinnerIcon /> : <GoogleIcon />}
            {googleLoading ? "Redirecting…" : "Sign up with Google"}
          </button>

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-paper" />
            <span className="text-xs font-medium text-text-muted">or sign up with email</span>
            <div className="h-px flex-1 bg-paper" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-body">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Sokha Chan"
                className="h-12 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm text-text-heading placeholder-text-muted outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-body">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm text-text-heading placeholder-text-muted outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-body">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  className="h-12 w-full rounded-xl border border-divider bg-bg-surface px-4 pr-12 text-sm text-text-heading placeholder-text-muted outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-body">
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {/* Strength indicator */}
              {password && (
                <div className="mt-2 flex gap-1">
                  {[8, 12, 16].map((threshold, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        password.length >= threshold
                          ? i === 0 ? "bg-red-400" : i === 1 ? "bg-amber-400" : "bg-emerald-400"
                          : "bg-paper"
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-[11px] text-text-muted">
                    {password.length < 8 ? "Too short" : password.length < 12 ? "Weak" : password.length < 16 ? "Good" : "Strong"}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-body">Confirm password</label>
              <input
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Re-enter password"
                className={`h-12 w-full rounded-xl border bg-bg-surface px-4 text-sm text-text-heading placeholder-text-muted outline-none transition focus:ring-2 ${
                  confirm && confirm !== password
                    ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                    : confirm && confirm === password
                    ? "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200/40"
                    : "border-divider focus:border-brand focus:ring-focus-ring/15"
                }`}
              />
              {confirm && confirm !== password && (
                <p className="mt-1.5 text-xs text-red-500">Passwords don&apos;t match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-950 text-sm font-semibold text-white shadow-sm transition hover:bg-brand hover:shadow-md disabled:opacity-60"
            >
              {loading ? <><SpinnerIcon /> Creating account…</> : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75"/>
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  );
}