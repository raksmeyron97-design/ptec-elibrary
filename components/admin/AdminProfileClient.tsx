"use client";

import { useRef, useState, useTransition } from "react";
import { updateProfile, updatePassword } from "@/app/actions/profile";
import {
  Camera,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  User,
  Shield,
  KeyRound,
} from "lucide-react";

type Props = {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
};

type Tab = "profile" | "security";

const MAX_AVATAR = 5 * 1024 * 1024;

const scorePassword = (pw: string) => {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
};

const STRENGTH = [
  { label: "Weak",   bar: "bg-red-500",     text: "text-red-600"    },
  { label: "Weak",   bar: "bg-red-500",     text: "text-red-600"    },
  { label: "Fair",   bar: "bg-amber-500",   text: "text-amber-600"  },
  { label: "Good",   bar: "bg-blue-500",    text: "text-blue-600"   },
  { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600"},
];

export default function AdminProfileClient({ user }: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  const [profilePending, startProfile] = useTransition();
  const [passwordPending, startPassword] = useTransition();

  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(user.avatar_url);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);

  const score = scorePassword(password);
  const strength = STRENGTH[score];
  const reqs = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Z]/.test(password), label: "One uppercase letter" },
    { ok: /[0-9]/.test(password), label: "One number" },
    { ok: /[^A-Za-z0-9]/.test(password), label: "One symbol" },
  ];
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmitPw = password.length >= 8 && passwordsMatch;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR) {
      setAvatarError("Image must be under 5 MB.");
      return;
    }
    setAvatarError(null);
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
    setPreviewFailed(false);
  };

  const resetAvatar = () => {
    setAvatarFile(null);
    setAvatarError(null);
    setPreviewFailed(false);
    setPreview(user.avatar_url);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileMsg(null);
    const fd = new FormData(e.currentTarget);
    startProfile(async () => {
      const res = await updateProfile(fd);
      if (res?.error) {
        setProfileMsg({ ok: false, text: res.error });
      } else {
        setProfileMsg({ ok: true, text: "Profile updated successfully." });
        setAvatarFile(null);
      }
    });
  };

  const onPasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordMsg(null);
    const form = e.currentTarget;
    startPassword(async () => {
      const res = await updatePassword(new FormData(form));
      if (res?.error) {
        setPasswordMsg({ ok: false, text: res.error });
      } else {
        setPasswordMsg({ ok: true, text: "Password updated successfully." });
        form.reset();
        setPassword("");
        setConfirm("");
      }
    });
  };

  const tabs: { id: Tab; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: "profile",  label: "Profile",  sub: "Name & avatar", icon: <User   style={{ width: "16px", height: "16px" }} /> },
    { id: "security", label: "Security", sub: "Password",       icon: <Shield style={{ width: "16px", height: "16px" }} /> },
  ];

  const input =
    "w-full h-11 px-3.5 rounded-xl bg-bg-surface border border-divider text-text-body placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition text-sm";

  return (
    <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-6">

      {/* Side nav */}
      <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 md:sticky md:top-6 md:self-start">
        {tabs.map(({ id, label, sub, icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                "group flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                active
                  ? "bg-white border border-divider shadow-sm text-text-heading"
                  : "text-slate-500 hover:text-text-heading hover:bg-white/60",
              ].join(" ")}
            >
              <span
                className={[
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all",
                  active ? "text-white" : "text-slate-400 group-hover:text-slate-600",
                ].join(" ")}
                style={active ? { background: "linear-gradient(135deg,#4f46e5,#DDB022)" } : { background: "#F1F5F9" }}
              >
                {icon}
              </span>
              <span>
                <span className="block text-sm font-semibold leading-tight">{label}</span>
                <span className="block text-xs text-slate-400 leading-tight">{sub}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div className="min-w-0">

        {/* ── Profile tab ── */}
        <section className={tab === "profile" ? "block" : "hidden"}>
          <div className="bg-white border border-divider rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <h2 className="text-base font-bold text-text-heading">Profile Information</h2>
              <p className="text-sm text-slate-500 mt-0.5">Update your name and profile picture.</p>
            </div>
            <div className="border-t border-divider" />

            <form id="admin-profile-form" onSubmit={onProfileSubmit} className="px-6 py-6 space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-5">
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 ring-2 ring-divider shrink-0 group cursor-pointer"
                  onClick={() => fileRef.current?.click()}>
                  {preview && !previewFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt="Profile"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={() => setPreviewFailed(true)}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white text-2xl font-bold"
                      style={{ background: "linear-gradient(135deg,#4f46e5,#DDB022)" }}
                    >
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-text-body">Profile picture</p>
                  <p className="text-xs text-slate-400 mt-0.5">JPG, PNG or WebP · max 5 MB</p>
                  <input ref={fileRef} type="file" name="avatar" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="h-8 px-3 rounded-lg border border-divider text-xs font-semibold text-text-body hover:border-indigo-400 hover:text-indigo-600 transition cursor-pointer"
                    >
                      Change photo
                    </button>
                    {avatarFile && (
                      <button type="button" onClick={resetAvatar}
                        className="h-8 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 transition cursor-pointer">
                        Reset
                      </button>
                    )}
                  </div>
                  {avatarFile && <p className="text-[11px] text-slate-400 mt-1.5">{avatarFile.name}</p>}
                  {avatarError && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />{avatarError}
                    </p>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="ap-email" className="block text-sm font-semibold text-text-body mb-1.5">Email address</label>
                  <div className="relative">
                    <input id="ap-email" type="email" value={user.email} disabled
                      className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-slate-50 border border-divider text-slate-400 text-sm cursor-not-allowed focus:outline-none" />
                    <Lock className="w-4 h-4 text-slate-300 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Email cannot be changed here.</p>
                </div>

                <div>
                  <label htmlFor="ap-name" className="block text-sm font-semibold text-text-body mb-1.5">Full name</label>
                  <input
                    id="ap-name"
                    type="text"
                    name="full_name"
                    defaultValue={user.full_name ?? ""}
                    placeholder="Your full name"
                    className={input}
                  />
                </div>
              </div>
            </form>

            <div className="border-t border-divider bg-slate-50 px-6 py-4 flex items-center justify-between gap-3">
              <InlineMsg msg={profileMsg} />
              <button
                type="submit"
                form="admin-profile-form"
                disabled={profilePending}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 cursor-pointer shrink-0"
                style={{ background: "linear-gradient(135deg,#4f46e5,#6366f1)" }}
              >
                {profilePending && <Loader2 className="w-4 h-4 animate-spin" />}
                {profilePending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Security tab ── */}
        <section className={tab === "security" ? "block" : "hidden"}>
          <div className="bg-white border border-divider rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <h2 className="text-base font-bold text-text-heading">Change Password</h2>
              <p className="text-sm text-slate-500 mt-0.5">Choose a strong password to keep your account safe.</p>
            </div>
            <div className="border-t border-divider" />

            <form id="admin-pw-form" onSubmit={onPasswordSubmit} className="px-6 py-6 space-y-5">
              {/* New password */}
              <div>
                <label htmlFor="ap-pw" className="block text-sm font-semibold text-text-body mb-1.5">New password</label>
                <div className="relative">
                  <input
                    id="ap-pw"
                    type={showPw ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-bg-surface border border-divider text-text-body placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition text-sm"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {password.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Password strength</span>
                      <span className={`text-xs font-semibold ${strength.text}`}>{strength.label}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {[0,1,2,3].map(i => (
                        <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? strength.bar : "bg-slate-200"}`} />
                      ))}
                    </div>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      {reqs.map(r => (
                        <li key={r.label} className="flex items-center gap-1.5 text-xs">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${r.ok ? "bg-emerald-500 text-white" : "bg-slate-200"}`}>
                            <Check className="w-2.5 h-2.5" />
                          </span>
                          <span className={r.ok ? "text-text-body" : "text-slate-400"}>{r.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="ap-cf" className="block text-sm font-semibold text-text-body mb-1.5">Confirm new password</label>
                <div className="relative">
                  <input
                    id="ap-cf"
                    type={showCf ? "text" : "password"}
                    name="confirmPassword"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    aria-invalid={confirm.length > 0 && !passwordsMatch}
                    className={`w-full h-11 pl-3.5 pr-11 rounded-xl bg-bg-surface border text-text-body placeholder:text-slate-400 focus:ring-2 focus:outline-none transition text-sm ${
                      confirm.length > 0 && !passwordsMatch
                        ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                        : "border-divider focus:border-indigo-500 focus:ring-indigo-200"
                    }`}
                  />
                  <button type="button" onClick={() => setShowCf(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer">
                    {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm.length > 0 && (
                  <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-600" : "text-red-500"}`}>
                    {passwordsMatch
                      ? <><Check className="w-3.5 h-3.5" /> Passwords match</>
                      : <><AlertCircle className="w-3.5 h-3.5" /> Passwords don&apos;t match</>}
                  </p>
                )}
              </div>

              {/* MFA hint */}
              <div className="flex items-start gap-2.5 rounded-xl p-3.5 bg-indigo-50 border border-indigo-100">
                <KeyRound className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700 leading-relaxed">
                  Two-factor authentication is enforced for all admin accounts. Password changes take effect on your next login.
                </p>
              </div>
            </form>

            <div className="border-t border-divider bg-slate-50 px-6 py-4 flex items-center justify-between gap-3">
              <InlineMsg msg={passwordMsg} />
              <button
                type="submit"
                form="admin-pw-form"
                disabled={passwordPending || !canSubmitPw}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 cursor-pointer shrink-0"
                style={{ background: "linear-gradient(135deg,#4f46e5,#6366f1)" }}
              >
                {passwordPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {passwordPending ? "Updating…" : "Update password"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InlineMsg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return <span className="hidden sm:block" />;
  return (
    <p className={`text-sm font-medium flex items-center gap-2 ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${msg.ok ? "bg-emerald-100" : "bg-red-100"}`}>
        {msg.ok ? <Check className="w-3 h-3 text-emerald-700" /> : <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
      </span>
      {msg.text}
    </p>
  );
}
