"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { updateProfile, updatePassword, deleteAccount } from "@/app/actions/profile";
import Icon from "@/components/ui/core/Icon";

type SettingsClientProps = {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  t: Record<string, string>;
};

type Tab = "profile" | "security";

/* ---------- tiny inline icons (no dependency on your icon set) ---------- */
type IconProps = React.SVGProps<SVGSVGElement>;

const UserIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const ShieldIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
);

const LockIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const CheckIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const AlertIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const Spinner = (p: IconProps) => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" {...p}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z" />
  </svg>
);

/* ---------- helpers ---------- */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const scorePassword = (pw: string) => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0..4
};

export default function SettingsClient({ user, t }: SettingsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");

  const [profilePending, startProfileTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const score = scorePassword(password);
  const reqs = [
    { ok: password.length >= 8, label: t.reqLength || "At least 8 characters" },
    { ok: /[A-Z]/.test(password), label: t.reqUpper || "One uppercase letter" },
    { ok: /[0-9]/.test(password), label: t.reqNumber || "One number" },
    { ok: /[^A-Za-z0-9]/.test(password), label: t.reqSymbol || "One symbol" },
  ];
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmitPassword = password.length >= 8 && password === confirm;

  const strength =
    score <= 1
      ? { label: t.strengthWeak || "Weak", bar: "bg-red-500", text: "text-red-600" }
      : score === 2
      ? { label: t.strengthFair || "Fair", bar: "bg-amber-500", text: "text-amber-600" }
      : score === 3
      ? { label: t.strengthGood || "Good", bar: "bg-blue-500", text: "text-blue-600" }
      : { label: t.strengthStrong || "Strong", bar: "bg-emerald-500", text: "text-emerald-600" };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t.fileTooLarge || "That image is over 5MB. Choose a smaller file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setAvatarError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarFailed(false);
  };

  const resetAvatar = () => {
    setAvatarFile(null);
    setAvatarError(null);
    setAvatarFailed(false);
    setAvatarPreview(user.avatar_url);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileMsg(null);
    const formData = new FormData(e.currentTarget);
    startProfileTransition(async () => {
      const res = await updateProfile(formData);
      if (res?.error) {
        setProfileMsg({ type: "error", text: res.error });
      } else {
        setProfileMsg({ type: "success", text: t.profileUpdated || "Profile updated successfully." });
        setAvatarFile(null);
      }
    });
  };

  const onDeleteAccount = () => {
    setDeleteMsg(null);
    startDeleteTransition(async () => {
      const res = await deleteAccount(deleteConfirm.trim());
      if (res?.error) {
        setDeleteMsg(res.error);
        return;
      }
      // Account is gone and the session is cleared — leave the dashboard.
      router.push("/home");
      router.refresh();
    });
  };

  const onPasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordMsg(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startPasswordTransition(async () => {
      const res = await updatePassword(formData);
      if (res?.error) {
        setPasswordMsg({ type: "error", text: res.error });
      } else {
        setPasswordMsg({ type: "success", text: t.passwordUpdated || "Password updated successfully." });
        form.reset();
        setPassword("");
        setConfirm("");
        setShowPassword(false);
        setShowConfirm(false);
      }
    });
  };

  const navItems: { id: Tab; label: string; sub: string; icon: (p: IconProps) => React.ReactElement }[] = [
    { id: "profile", label: t.profileTab || "Profile", sub: t.profileTabSub || "Name & avatar", icon: UserIcon },
    { id: "security", label: t.securityTab || "Security", sub: t.securityTabSub || "Password", icon: ShieldIcon },
  ];

  const inputBase =
    "w-full h-11 px-3.5 rounded-xl bg-bg-surface border border-divider text-text-body placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none transition";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[208px_minmax(0,1fr)] gap-6 lg:gap-10">
      {/* Section navigation */}
      <nav
        aria-label="Settings sections"
        className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 md:sticky md:top-8 md:self-start"
      >
        {navItems.map(({ id, label, sub, icon: ItemIcon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
              className={[
                "group flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active
                  ? "bg-bg-surface text-text-heading ring-1 ring-divider shadow-sm"
                  : "text-text-muted hover:text-text-heading hover:bg-bg-surface",
              ].join(" ")}
            >
              <span
                className={[
                  "grid place-items-center h-8 w-8 rounded-lg transition shrink-0",
                  active ? "bg-brand text-brand-contrast" : "bg-paper text-text-muted group-hover:text-text-body",
                ].join(" ")}
              >
                <ItemIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{label}</span>
                <span className="block text-xs text-text-muted leading-tight">{sub}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div className="min-w-0">
        {/* ---------------- Profile ---------------- */}
        <section className={active(tab, "profile")}>
          <div className="bg-bg-surface border border-divider rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-5">
              <h2 className="text-lg font-bold text-text-heading">{t.profileSettings || "Profile"}</h2>
              <p className="text-sm text-text-muted mt-1">
                {t.profileDesc || "Update your personal details and how your account appears."}
              </p>
            </div>
            <div className="border-t border-divider" />

            <form id="profile-form" onSubmit={onProfileSubmit} className="px-6 sm:px-8 py-6 sm:py-8 space-y-7">
              {/* Avatar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full overflow-hidden bg-paper ring-2 ring-divider shrink-0 group">
                  {avatarPreview && !avatarFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreview}
                      alt={t.avatarAlt || "Profile picture"}
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-brand text-brand-contrast text-2xl font-bold">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    aria-label={t.changePhoto || "Change photo"}
                    className="absolute inset-0 flex items-center justify-center bg-slate-900/45 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity outline-none"
                  >
                    <Icon name="camera" className="text-white text-xl" />
                  </button>
                </div>

                <div className="text-sm">
                  <p className="font-semibold text-text-body">{t.avatarHelp1 || "Profile picture"}</p>
                  <p className="text-text-muted mt-0.5">{t.avatarHelp2 || "JPG or PNG, up to 5MB."}</p>

                  <input
                    ref={fileRef}
                    type="file"
                    name="avatar"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="h-9 px-3.5 rounded-lg bg-paper border border-divider text-text-body text-sm font-semibold hover:border-brand hover:text-brand transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {t.changePhoto || "Change photo"}
                    </button>
                    {avatarFile && (
                      <button
                        type="button"
                        onClick={resetAvatar}
                        className="h-9 px-3 rounded-lg text-text-muted text-sm font-medium hover:text-text-body transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {t.reset || "Reset"}
                      </button>
                    )}
                  </div>

                  {avatarFile && (
                    <p className="text-xs text-text-muted mt-2">
                      {avatarFile.name} · {formatSize(avatarFile.size)}
                    </p>
                  )}
                  {avatarError && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1.5">
                      <AlertIcon className="h-3.5 w-3.5 shrink-0" />
                      {avatarError}
                    </p>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-semibold text-text-body mb-1.5">
                    {t.email || "Email address"}
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={user.email}
                      disabled
                      className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-paper border border-divider text-text-muted cursor-not-allowed focus:outline-none"
                    />
                    <LockIcon className="h-4 w-4 text-text-muted absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">{t.emailLocked || "Your email can’t be changed here."}</p>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="full_name" className="block text-sm font-semibold text-text-body mb-1.5">
                    {t.fullName || "Full name"}
                  </label>
                  <input
                    id="full_name"
                    type="text"
                    name="full_name"
                    defaultValue={user.full_name || ""}
                    placeholder={t.fullNamePlaceholder || "Your full name"}
                    className={inputBase}
                  />
                </div>
              </div>
            </form>

            <div className="border-t border-divider bg-paper px-6 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <InlineMessage msg={profileMsg} />
              <button
                type="submit"
                form="profile-form"
                disabled={profilePending}
                className="h-11 px-6 rounded-xl bg-brand text-brand-contrast font-semibold hover:bg-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {profilePending && <Spinner />}
                {profilePending ? t.saving || "Saving…" : t.saveChanges || "Save changes"}
              </button>
            </div>
          </div>
        </section>

        {/* ---------------- Security ---------------- */}
        <section className={active(tab, "security")}>
          <div className="bg-bg-surface border border-divider rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-5">
              <h2 className="text-lg font-bold text-text-heading">{t.passwordSettings || "Security"}</h2>
              <p className="text-sm text-text-muted mt-1">
                {t.securityDesc || "Choose a strong password to keep your account safe."}
              </p>
            </div>
            <div className="border-t border-divider" />

            <form id="password-form" onSubmit={onPasswordSubmit} className="px-6 sm:px-8 py-6 sm:py-8 space-y-6">
              {/* New password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-text-body mb-1.5">
                  {t.newPassword || "New password"}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-bg-surface border border-divider text-text-body placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t.hidePassword || "Hide password" : t.showPassword || "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-lg text-text-muted hover:text-text-body hover:bg-paper transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength meter */}
                {password.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-text-muted">{t.passwordStrength || "Password strength"}</span>
                      <span className={`text-xs font-semibold ${strength.text}`}>{strength.label}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? strength.bar : "bg-divider"}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Requirements */}
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                  {reqs.map((r) => (
                    <li key={r.label} className="flex items-center gap-2 text-xs">
                      <span
                        className={[
                          "grid place-items-center h-4 w-4 rounded-full transition-colors shrink-0",
                          r.ok ? "bg-emerald-500 text-white" : "bg-divider text-transparent",
                        ].join(" ")}
                      >
                        <CheckIcon className="h-2.5 w-2.5" />
                      </span>
                      <span className={r.ok ? "text-text-body" : "text-text-muted"}>{r.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-text-body mb-1.5">
                  {t.confirmPassword || "Confirm new password"}
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    name="confirmPassword"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    aria-invalid={confirm.length > 0 && !passwordsMatch}
                    className={[
                      "w-full h-11 pl-3.5 pr-11 rounded-xl bg-bg-surface border text-text-body placeholder:text-text-muted focus:ring-2 focus:outline-none transition",
                      confirm.length > 0 && !passwordsMatch
                        ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                        : "border-divider focus:border-brand focus:ring-brand",
                    ].join(" ")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? t.hidePassword || "Hide password" : t.showPassword || "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-lg text-text-muted hover:text-text-body hover:bg-paper transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
                {confirm.length > 0 && (
                  <p
                    className={`text-xs mt-1.5 flex items-center gap-1.5 ${
                      passwordsMatch ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {passwordsMatch ? <CheckIcon className="h-3.5 w-3.5" /> : <AlertIcon className="h-3.5 w-3.5" />}
                    {passwordsMatch ? t.passwordsMatch || "Passwords match" : t.passwordsNoMatch || "Passwords don’t match"}
                  </p>
                )}
              </div>
            </form>

            <div className="border-t border-divider bg-paper px-6 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <InlineMessage msg={passwordMsg} />
              <button
                type="submit"
                form="password-form"
                disabled={passwordPending || !canSubmitPassword}
                className="h-11 px-6 rounded-xl bg-brand text-brand-contrast font-semibold hover:bg-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {passwordPending && <Spinner />}
                {passwordPending ? t.updating || "Updating…" : t.updatePassword || "Update password"}
              </button>
            </div>
          </div>

          {/* ---------------- Danger zone ---------------- */}
          <div className="mt-6 bg-bg-surface border border-red-300 dark:border-red-900 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 sm:px-8 pt-6 pb-5">
              <h2 className="text-lg font-bold text-red-600">{t.dangerTitle || "Delete account"}</h2>
              <p className="text-sm text-text-muted mt-1">
                {t.dangerDesc ||
                  "Permanently delete your account, saved books, reading lists, notes, reading progress, and reviews. This cannot be undone."}
              </p>
            </div>

            {!deleteOpen ? (
              <div className="border-t border-divider bg-paper px-6 sm:px-8 py-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="h-11 px-6 rounded-xl border border-red-300 dark:border-red-900 text-red-600 font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  {t.dangerOpen || "Delete my account…"}
                </button>
              </div>
            ) : (
              <div className="border-t border-divider px-6 sm:px-8 py-5 space-y-4">
                <label htmlFor="delete-confirm" className="block text-sm font-semibold text-text-body">
                  {t.dangerConfirmLabel || "Type DELETE to confirm"}
                </label>
                <input
                  id="delete-confirm"
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  className={inputBase}
                />
                {deleteMsg && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5" role="alert">
                    <AlertIcon className="h-4 w-4 shrink-0" />
                    {deleteMsg}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); setDeleteMsg(null); }}
                    className="h-11 px-5 rounded-xl text-text-muted font-medium hover:text-text-body transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {t.dangerCancel || "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteAccount}
                    disabled={deletePending || deleteConfirm.trim() !== "DELETE"}
                    className="h-11 px-6 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    {deletePending && <Spinner />}
                    {deletePending
                      ? t.dangerDeleting || "Deleting…"
                      : t.dangerConfirm || "Permanently delete account"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* show the active section, hide the other (keeps form state mounted) */
function active(tab: Tab, id: Tab) {
  return tab === id ? "block" : "hidden";
}

function InlineMessage({ msg }: { msg: { type: "success" | "error"; text: string } | null }) {
  if (!msg) return <span className="hidden sm:block" />;
  const success = msg.type === "success";
  return (
    <p
      role="status"
      className={[
        "text-sm font-medium flex items-center gap-2",
        success ? "text-emerald-700" : "text-red-600",
      ].join(" ")}
    >
      <span
        className={[
          "grid place-items-center h-5 w-5 rounded-full shrink-0",
          success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600",
        ].join(" ")}
      >
        {success ? <CheckIcon className="h-3 w-3" /> : <AlertIcon className="h-3.5 w-3.5" />}
      </span>
      {msg.text}
    </p>
  );
}