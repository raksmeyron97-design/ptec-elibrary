"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function MfaVerifyPage() {
  const supabase = createClient();
  const router = useRouter();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const checkFactors = useCallback(async () => {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();

    const verifiedFactor = factorsData?.totp?.find(
      (f) => f.status === "verified",
    );

    if (!verifiedFactor) {
      // No enrolled factors — redirect to enrollment
      router.replace("/admin/mfa/enroll");
      return;
    }

    // Check if already AAL2
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aalData?.currentLevel === "aal2") {
      // Already verified — go to admin
      router.replace("/admin");
      return;
    }

    setFactorId(verifiedFactor.id);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    checkFactors();
  }, [checkFactors]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;

    setError(null);
    setVerifying(true);

    const trimmedCode = code.trim().replace(/\s/g, "");
    if (trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setError("Please enter a 6-digit code.");
      setVerifying(false);
      return;
    }

    // Challenge → Verify
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError || !challengeData) {
      setError(challengeError?.message ?? "Failed to create MFA challenge");
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: trimmedCode,
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setCode("");
      setVerifying(false);
      return;
    }

    // Success — redirect to admin
    router.push("/admin");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-app">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-xl bg-bg-surface border border-divider">
          {/* Header */}
          <div className="flex flex-col items-center justify-center bg-brand p-8 text-white">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-bg-surface p-1.5 shadow-sm">
              <Image
                src="/logo_footer.png"
                alt="PTEC Logo"
                width={56}
                height={56}
                className="object-contain"
              />
            </div>
            <h2 className="text-2xl font-bold leading-tight">
              Two-Factor Verification
            </h2>
            <p className="mt-2 text-sm text-white/80">
              Enter the code from your authenticator app
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleVerify} className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-text-body">
                  Authentication Code
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  pattern="\d{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="h-14 rounded-lg border border-divider bg-paper px-4 text-center text-2xl font-mono tracking-[0.4em] outline-none focus:border-accent focus:bg-bg-surface focus:ring-2 focus:ring-accent/20 transition-all"
                />
              </label>

              <button
                type="submit"
                disabled={verifying || code.length !== 6}
                className="mt-2 h-12 rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifying ? "Verifying…" : "Verify"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-text-muted">
              Open your authenticator app (Google Authenticator, Authy, etc.)
              and enter the current 6-digit code for PTEC Admin.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
