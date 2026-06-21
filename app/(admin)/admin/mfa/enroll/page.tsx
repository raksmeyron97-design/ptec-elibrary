"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";

type EnrollState =
  | { step: "loading" }
  | { step: "enrolling"; qrCode: string; secret: string; factorId: string }
  | { step: "verifying"; factorId: string }
  | { step: "success" }
  | { step: "error"; message: string };

export default function MfaEnrollPage() {
  const supabase = createClient();
  const router = useRouter();

  const [state, setState] = useState<EnrollState>({ step: "loading" });
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const startEnrollment = useCallback(async () => {
    setState({ step: "loading" });

    // 1. Clean up any leftover unverified factors
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    if (factorsData?.totp) {
      for (const factor of factorsData.totp) {
        if (factor.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
    }

    // Check if user already has verified TOTP factors
    const { data: refreshedFactors } = await supabase.auth.mfa.listFactors();
    if (refreshedFactors?.totp?.some((f) => f.status === "verified")) {
      // Already enrolled — redirect to verify instead
      router.replace("/admin/mfa/verify");
      return;
    }

    // 2. Enroll a new TOTP factor
    const { data: enrollData, error: enrollError } =
      await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "PTEC Admin TOTP",
      });

    if (enrollError || !enrollData) {
      setState({
        step: "error",
        message: enrollError?.message ?? "Failed to start MFA enrollment",
      });
      return;
    }

    setState({
      step: "enrolling",
      qrCode: enrollData.totp.qr_code,
      secret: enrollData.totp.secret,
      factorId: enrollData.id,
    });
  }, [supabase, router]);

  useEffect(() => {
    startEnrollment();
  }, [startEnrollment]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (state.step !== "enrolling") return;

    setVerifyError(null);
    setVerifying(true);

    const code = verifyCode.trim().replace(/\s/g, "");
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setVerifyError("Please enter a 6-digit code.");
      setVerifying(false);
      return;
    }

    // Challenge → Verify flow
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: state.factorId });

    if (challengeError || !challengeData) {
      setVerifyError(
        challengeError?.message ?? "Failed to create MFA challenge",
      );
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: state.factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      setVerifyError("Invalid code. Please try again.");
      setVerifying(false);
      return;
    }

    setState({ step: "success" });
    // Small delay so user sees success, then redirect
    setTimeout(() => {
      router.push("/admin");
      router.refresh();
    }, 1000);
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
              Set Up Two-Factor Authentication
            </h2>
            <p className="mt-2 text-sm text-white/80">
              Scan the QR code with your authenticator app
            </p>
          </div>

          <div className="p-8">
            {/* Loading */}
            {state.step === "loading" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
                <p className="text-sm text-text-muted">
                  Preparing MFA enrollment…
                </p>
              </div>
            )}

            {/* Error */}
            {state.step === "error" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {state.message}
                </div>
                <button type="button">
                  Try Again
                </button>
              </div>
            )}

            {/* Enrollment — show QR code + verify form */}
            {state.step === "enrolling" && (
              <div className="flex flex-col gap-6">
                {/* QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-xl border border-divider bg-white p-4">
                    {/* The QR code from Supabase is a data URI SVG */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={state.qrCode}
                      alt="TOTP QR Code"
                      width={200}
                      height={200}
                      className="h-[200px] w-[200px]"
                    />
                  </div>
                  <p className="text-xs text-text-muted text-center">
                    Use{" "}
                    <strong>Google Authenticator</strong>,{" "}
                    <strong>Authy</strong>, or any TOTP app
                  </p>
                </div>

                {/* Manual secret */}
                <details className="rounded-lg border border-divider bg-paper p-3">
                  <summary className="cursor-pointer text-sm font-medium text-text-body">
                    Can&apos;t scan? Enter code manually
                  </summary>
                  <div className="mt-3">
                    <code className="block break-all rounded-md bg-bg-app px-3 py-2 text-xs font-mono text-text-body select-all">
                      {state.secret}
                    </code>
                  </div>
                </details>

                {/* Verify form */}
                <form onSubmit={handleVerify} className="flex flex-col gap-4">
                  {verifyError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {verifyError}
                    </div>
                  )}

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-text-body">
                      Verification Code
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="\d{6}"
                      required
                      value={verifyCode}
                      onChange={(e) =>
                        setVerifyCode(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000"
                      className="h-12 rounded-lg border border-divider bg-paper px-4 text-center text-lg font-mono tracking-[0.3em] outline-none focus:border-accent focus:bg-bg-surface focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={verifying || verifyCode.length !== 6}
                    className="h-12 rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifying ? "Verifying…" : "Verify & Activate"}
                  </button>
                </form>
              </div>
            )}

            {/* Success */}
            {state.step === "success" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-text-body">
                  MFA Enabled Successfully
                </p>
                <p className="text-sm text-text-muted">
                  Redirecting to admin panel…
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
