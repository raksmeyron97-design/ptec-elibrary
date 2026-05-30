"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function AdminLoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes("Invalid login")) {
        setError("Email or password is incorrect. Please try again.");
      } else if (error.message.includes("Email not confirmed")) {
        setError("Please check your email and confirm your account first.");
      } else {
        setError(error.message);
      }
      setLoading(false);
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6]">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-xl bg-white border border-gray-100">
          
          <div className="flex flex-col items-center justify-center bg-[#1E3A8A] p-8 text-white">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
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
                <span className="text-sm font-semibold text-slate-700">Admin Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ptec.edu.kh"
                  className="h-12 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#DDB022] focus:bg-white focus:ring-2 focus:ring-[#DDB022]/20 transition-all"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#DDB022] focus:bg-white focus:ring-2 focus:ring-[#DDB022]/20 transition-all"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 h-12 rounded-lg bg-[#1E3A8A] font-semibold text-white transition hover:bg-[#152a66] disabled:cursor-not-allowed disabled:opacity-60"
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
