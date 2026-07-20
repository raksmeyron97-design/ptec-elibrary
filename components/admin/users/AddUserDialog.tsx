"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Mail, Users, CheckCircle2 } from "lucide-react";
import { ALL_ROLES, type AppRole } from "@/lib/types/roles";
import { inviteUser, bulkInviteUsers } from "@/app/(admin)/admin/(protected)/users/actions";

/**
 * Add-user / import dialog. "Invite" sends one Supabase invite email; "Import"
 * bulk-invites a pasted list. Both set the chosen role on the new profile.
 */
export default function AddUserDialog({
  mode: initialMode,
  canAssignAdmin,
  onClose,
}: {
  mode: "invite" | "import";
  canAssignAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("adminUsers.addDialog");
  const tRoles = useTranslations("adminUsers.roles");
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"invite" | "import">(initialMode);
  const [email, setEmail] = useState("");
  const [bulk, setBulk] = useState("");
  const [role, setRole] = useState<AppRole>("reader");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try {
      if (mode === "invite") {
        const r = await inviteUser(email, role);
        if (!r.success) { setError(r.error ?? t("inviteFailed")); return; }
        setDone(t("invitationSent", { email }));
        setEmail("");
      } else {
        const emails = bulk.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
        const r = await bulkInviteUsers(emails, role);
        if (!r.success) { setError(r.error ?? t("importFailed")); return; }
        setDone(t("invitedCount", { count: emails.length }) + (r.error ? ` (${r.error})` : ""));
        setBulk("");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inviteFailed"));
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: "invite" | "import", label: string, Icon: typeof Mail) => (
    <button
      type="button"
      onClick={() => { setMode(m); setError(null); setDone(null); }}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === m ? "bg-brand/10 text-brand" : "text-text-muted hover:bg-paper"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-user-heading">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-user-heading" className="text-lg font-bold text-text-heading">{t("title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 inline-flex gap-1 rounded-xl bg-paper p-1">
          {tab("invite", t("inviteOne"), Mail)}
          {tab("import", t("importList"), Users)}
        </div>

        {mode === "invite" ? (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("emailAddress")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@example.com"
              className="h-11 w-full rounded-xl border border-divider bg-bg-surface px-3.5 text-sm text-text-body outline-none focus:border-brand"
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("emailAddresses")}</span>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              required
              rows={5}
              placeholder={t("bulkPlaceholder")}
              className="w-full rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 text-sm text-text-body outline-none focus:border-brand"
            />
            <span className="mt-1 block text-[11px] text-text-muted">{t("bulkHint")}</span>
          </label>
        )}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("assignRole")}</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="h-11 w-full rounded-xl border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none focus:border-brand"
          >
            {ALL_ROLES.map((r) => {
              const disabled = (r === "admin" || r === "super_admin") && !canAssignAdmin;
              return <option key={r} value={r} disabled={disabled}>{tRoles(r)}{disabled ? ` (${t("superAdminOnly")})` : ""}</option>;
            })}
          </select>
        </label>

        {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
        {done && (
          <div role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {done}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-text-body hover:bg-paper">{t("close")}</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60">
            {busy ? t("sending") : mode === "invite" ? t("sendInvite") : t("sendInvites")}
          </button>
        </div>
      </form>
    </div>
  );
}
