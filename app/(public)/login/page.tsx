"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Email + Password login ────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Make error messages friendlier
      if (error.message.includes("Invalid login")) {
        setError("Email or password is incorrect. Please try again.");
      } else if (error.message.includes("Email not confirmed")) {
        setError("Please check your email and confirm your account first.");
      } else {
        setError(error.message);
      }
      setLoading(false);
    } else {
      router.push("/books");
      router.refresh();
    }
  }

  // ── Google OAuth login ────────────────────────────────────────
  async function handleGoogle() {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // Browser will redirect automatically on success
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center bg-paper px-4 py-12">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl shadow-lg md:grid-cols-2">

          {/* Left panel — branding */}
          <div className="flex flex-col justify-center bg-blue-950 p-10 text-white">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold leading-tight">Library account access</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Sign in to save resources, request borrowing, view due dates, and
              receive new-material alerts from the PTEC library team.
            </p>
            <div className="mt-8 rounded-xl bg-bg-surface/5 p-4 text-xs text-text-muted">
              Need access?{" "}
              <a href="/contact" className="text-cyan-400 underline underline-offset-2">
                Contact the library desk
              </a>{" "}
              through the contact page.
            </div>
          </div>

          {/* Right panel — form */}
          <div className="flex flex-col justify-center bg-bg-surface p-10">
            <h1 className="mb-6 text-2xl font-bold text-text-heading">Sign in</h1>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-text-body">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ptec.edu.kh"
                  className="h-12 rounded-lg border border-divider bg-paper px-4 text-sm outline-none focus:border-brand focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/15"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-text-body">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 rounded-lg border border-divider bg-paper px-4 text-sm outline-none focus:border-brand focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/15"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 h-12 rounded-lg bg-blue-950 font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Continue"}
              </button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-paper" />
              <span className="text-xs text-text-muted">or</span>
              <div className="h-px flex-1 bg-paper" />
            </div>

            {/* Google button */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="flex h-12 items-center justify-center gap-3 rounded-lg border border-divider bg-bg-surface font-semibold text-text-body transition hover:bg-paper disabled:opacity-60"
            >
              {/* Google icon SVG */}
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
              </svg>
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}