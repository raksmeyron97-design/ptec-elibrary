"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

export default function AdminLoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!captchaToken) {
      setError("Please complete the CAPTCHA verification.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });

    if (error) {
      if (error.message.includes("Invalid login")) {
        setError("Email or password is incorrect. Please try again.");
      } else if (error.message.includes("Email not confirmed")) {
        setError("Please check your email and confirm your account first.");
      } else {
        setError(error.message);
      }
      turnstileRef.current?.reset();
      setCaptchaToken(undefined);
      setLoading(false);
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-xl bg-bg-surface border border-divider">
          
          <div className="flex flex-col items-center justify-center bg-brand p-8 text-white">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-bg-surface p-1.5 shadow-sm">
              <Image src="/logo_footer.png" alt="PTEC Logo" width={56} height={56} className="object-contain" />
            </div>
            <h2 className="text-2xl font-bold leading-tight">Admin Sign In</h2>
            <p className="mt-2 text-sm text-white/80">
              Library administrative access
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-text-body">Admin Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ptec.edu.kh"
                  className="h-12 rounded-lg border border-divider bg-paper px-4 text-sm outline-none focus:border-accent focus:bg-bg-surface focus:ring-2 focus:ring-accent/20 transition-all"
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
                  className="h-12 rounded-lg border border-divider bg-paper px-4 text-sm outline-none focus:border-accent focus:bg-bg-surface focus:ring-2 focus:ring-accent/20 transition-all"
                />
              </label>

              <Turnstile
                ref={turnstileRef}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken(undefined)}
                onError={() => setCaptchaToken(undefined)}
              />

              <button
                type="submit"
                disabled={loading || !captchaToken}
                className="mt-2 h-12 rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Continue"}
              </button>
            </form>
          </div>

        </div>
      </main>
    </div>
  );
}
