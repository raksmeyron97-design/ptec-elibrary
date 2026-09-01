// app/(auth)/auth/signup/SignupContent.tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { AlertCircle, Loader2 } from "lucide-react";
import { authRedirect } from "@/lib/auth/redirect-url";
import { classifyAuthError, type AuthErrorKey } from "@/lib/auth/friendly-error";
import { isPasswordValid, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import AuthBrandPanel from "./_components/AuthBrandPanel";
import GoogleAuthButton from "./_components/GoogleAuthButton";
import AuthDivider from "./_components/AuthDivider";
import TextField from "./_components/TextField";
import PasswordField from "./_components/PasswordField";
import PasswordRequirements from "./_components/PasswordRequirements";
import { isReservedAdminDomain } from "@/lib/auth/reserved-domains";
import TurnstileField from "./_components/TurnstileField";
import SignupSuccessState from "./_components/SignupSuccessState";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldName = "name" | "email" | "password" | "confirm";
type ErrorKey = AuthErrorKey | "captchaRequired";

export default function SignupContent() {
  const t = useTranslations("auth");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    email: false,
    password: false,
    confirm: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const touch = (field: FieldName) => setTouched((prev) => ({ ...prev, [field]: true }));

  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  // ── Validation ──────────────────────────────────────────────────────────
  // Step 8: neutral before interaction, validated on blur, cleared the
  // instant the field becomes valid again (these are derived on every
  // render, not snapshotted at submit time), and re-checked in full on
  // submit via the `submitted` flag.
  const nameShow = touched.name || submitted;
  const emailShow = touched.email || submitted;
  const passwordShow = touched.password || submitted;

  const nameError = nameShow && fullName.trim().length < 2 ? t("errNameRequired") : null;

  const emailError = !emailShow
    ? null
    : email === ""
      ? t("errEmailRequired")
      : !EMAIL_PATTERN.test(email)
        ? t("errEmailInvalid")
        : null;

  const passwordError = !passwordShow
    ? null
    : password === ""
      ? t("errPasswordRequired")
      : password.length < PASSWORD_MIN_LENGTH
        ? t("errPasswordLength")
        : !isPasswordValid(password)
          ? t("errPasswordWeak")
          : null;

  // Step 10: confirm-password feedback is live the moment both fields carry
  // text, independent of blur — a user should never discover a mismatch only
  // at submit. The empty case still waits for blur/submit like every other
  // required field.
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === password;
  const confirmError =
    confirmPassword === ""
      ? (touched.confirm || submitted ? t("errPasswordRequired") : null)
      : confirmPassword !== password
        ? t("errPasswordMismatch")
        : null;

  /* Only ever a courtesy: it shows the friendly message before the round trip.
     Enforcement is migration 0068's trigger, with app/actions/auth.ts as the
     app-layer copy — and none of the three touches Google sign-in, which is
     how a real @ptec.edu.kh mailbox holder gets in. */
  const emailReserved = isReservedAdminDomain(email);
  const formHasErrors = Boolean(
    nameError
      || emailError
      || passwordError
      || confirmError
      || !fullName.trim()
      || !email
      || !isPasswordValid(password)
      || password !== confirmPassword,
  );

  function friendlyMessage(key: ErrorKey): string {
    return key === "captchaRequired" ? t("errCaptchaRequired") : t(key);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (formHasErrors) return;
    if (emailReserved) { setErrorKey("errReservedDomain"); return; }
    // Step 11: the button itself stays enabled while the widget loads or is
    // unsolved — this is the understandable reason, not a silently disabled
    // CTA. Security is unaffected: signUp() still never fires without a token.
    if (!captchaToken) { setErrorKey("captchaRequired"); return; }

    setErrorKey(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: { full_name: fullName.trim() },
        emailRedirectTo: authRedirect("/auth/callback"),
      },
    });

    if (error) {
      setErrorKey(classifyAuthError(error.message));
      setLoading(false);
      turnstileRef.current?.reset();
      setCaptchaToken(undefined);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  async function handleGoogle() {
    setErrorKey(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirect("/auth/callback") },
    });
    if (error) {
      setErrorKey(classifyAuthError(error.message));
      setGoogleLoading(false);
    }
  }

  async function handleResend(): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authRedirect("/auth/callback") },
    });
    if (error) return { ok: false, error: t(classifyAuthError(error.message)) };
    return { ok: true };
  }

  return (
    <div className="flex min-h-screen font-sans">
      <AuthBrandPanel />

      {/* Right column. `lg:justify-center` only — on mobile the content
          flows from the top instead of being vertically centred, so it stays
          reachable above the on-screen keyboard instead of the page trying
          to keep a tall centred block in view (step 15). */}
      <div className="flex flex-1 flex-col items-center bg-paper px-6 py-10 sm:px-12 lg:justify-center">
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
          <p className="text-xs tracking-wide text-text-muted">PTEC e-Library · {t("digitalLearningHub")}</p>
        </div>

        <div className="w-full max-w-[420px]">
          {success ? (
            <SignupSuccessState email={email} onResend={handleResend} />
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-3xl font-bold text-text-heading">{t("signupTitle")}</h1>
                <p className="mt-2 text-text-muted">{t("signupSubtitle")}</p>
              </div>

              {errorKey && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mb-5 flex items-start gap-3 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {friendlyMessage(errorKey)}
                    {errorKey === "errUserExists" && (
                      <>
                        {" "}
                        <Link href="/auth/login" className="font-semibold underline underline-offset-2">
                          {t("signInInstead")}
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              )}

              <GoogleAuthButton
                onClick={handleGoogle}
                loading={googleLoading}
                disabled={loading || googleLoading}
                label={t("continueGoogle")}
                loadingLabel={t("redirecting")}
              />

              <div className="my-5">
                <AuthDivider label={t("orSignUpEmail")} />
              </div>

              <form onSubmit={handleSignup} noValidate className="space-y-4">
                <TextField
                  id="signup-fullname"
                  label={t("fullNameLabel")}
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => touch("name")}
                  autoComplete="name"
                  placeholder={t("fullNamePlaceholder")}
                  error={nameError}
                />

                <TextField
                  id="signup-email"
                  label={t("emailLabel")}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch("email")}
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  error={emailError}
                />

                <PasswordField
                  id="signup-password"
                  label={t("passwordLabel")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPwFocused(true)}
                  onBlur={() => { touch("password"); setPwFocused(false); }}
                  autoComplete="new-password"
                  error={passwordError}
                  show={showPw}
                  onToggleShow={() => setShowPw((v) => !v)}
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                  below={(pwFocused || password.length > 0) ? <PasswordRequirements password={password} /> : null}
                />

                <PasswordField
                  id="signup-confirm-password"
                  label={t("confirmPasswordLabel")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => touch("confirm")}
                  autoComplete="new-password"
                  error={confirmError}
                  show={showConfirmPw}
                  onToggleShow={() => setShowConfirmPw((v) => !v)}
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                  below={confirmMatches ? (
                    <p role="status" className="mt-1.5 flex items-center gap-1 text-xs text-success-text">
                      {t("passwordsMatch")}
                    </p>
                  ) : null}
                />

                <TurnstileField
                  ref={turnstileRef}
                  onSuccess={setCaptchaToken}
                  onExpire={() => setCaptchaToken(undefined)}
                  onError={() => setCaptchaToken(undefined)}
                />

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-brand-contrast shadow-sm transition hover:bg-brand-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-[0.99]"
                >
                  {loading ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("creatingAccount")}</>) : t("createAccount")}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-text-muted">
                {t("alreadyHaveAccount")}{" "}
                <Link href="/auth/login" className="font-semibold text-brand hover:underline">
                  {t("signIn")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
