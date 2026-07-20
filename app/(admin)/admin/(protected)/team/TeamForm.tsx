"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  UserCircle, Upload, X, Search, Link as LinkIcon, Camera, Briefcase,
  FileText, Settings2, ShieldCheck, IdCard, Eye, EyeOff, AlertTriangle,
  CheckCircle2, Star, type LucideIcon,
} from "lucide-react";
import { uploadToZima } from "@/app/actions/upload";
import { createTeamMember, updateTeamMember } from "./actions";
import type { TeamMemberRow, TeamSection, ProfileOption } from "./actions";
import MemberCard, { PALETTES } from "@/components/team/MemberCard";
import { ConfirmDialog } from "@/components/admin/kit";
import type { PublicTeamMember } from "@/lib/team/public";
import StoragePicker from "@/components/admin/storage/StoragePicker";
import type { StorageFile } from "@/lib/types/storage";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SHORT_BIO_MAX = 300;
const BIO_RECOMMENDED = 600;

type Phase = "idle" | "uploading" | "saving";

type TabKey = "identity" | "role" | "profile" | "bio" | "contact" | "account" | "publishing";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "identity",   label: "Identity",          icon: Camera },
  { key: "role",       label: "Role & Section",    icon: Briefcase },
  { key: "profile",    label: "Public Profile",    icon: IdCard },
  { key: "bio",        label: "Biography",         icon: FileText },
  { key: "contact",    label: "Contact & Privacy", icon: ShieldCheck },
  { key: "account",    label: "Account Link",      icon: LinkIcon },
  { key: "publishing", label: "Publishing",        icon: Settings2 },
];

type FormState = {
  name_km: string;
  name_en: string;
  photo_alt: string;
  position_km: string;
  position_en: string;
  section_id: string;
  education: string;
  years_experience: string;
  short_bio_km: string;
  short_bio_en: string;
  bio_km: string;
  bio_en: string;
  responsibilities_km: string;
  responsibilities_en: string;
  languages: string;
  working_hours: string;
  phone: string;
  show_phone_publicly: boolean;
  show_email_publicly: boolean;
  user_id: string;
  display_order: string;
  is_featured: boolean;
  is_published: boolean;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

/** Which tab each validated field lives on, for error badges + focusing. */
const FIELD_TAB: Partial<Record<keyof FormState, TabKey>> = {
  name_km: "identity",
  name_en: "identity",
  position_en: "role",
  display_order: "publishing",
};

function initialState(initial?: TeamMemberRow): FormState {
  return {
    name_km: initial?.name_km ?? "",
    name_en: initial?.name_en ?? "",
    photo_alt: initial?.photo_alt ?? "",
    position_km: initial?.position_km ?? "",
    position_en: initial?.position_en ?? "",
    section_id: initial?.section_id ?? "",
    education: initial?.education ?? "",
    years_experience: initial?.years_experience ?? "",
    short_bio_km: initial?.short_bio_km ?? "",
    short_bio_en: initial?.short_bio_en ?? "",
    bio_km: initial?.bio_km ?? "",
    bio_en: initial?.bio_en ?? "",
    responsibilities_km: (initial?.responsibilities_km ?? []).join("\n"),
    responsibilities_en: (initial?.responsibilities_en ?? []).join("\n"),
    languages: (initial?.languages ?? []).join("\n"),
    working_hours: initial?.working_hours ?? "",
    phone: initial?.phone ?? "",
    show_phone_publicly: initial?.show_phone_publicly ?? false,
    show_email_publicly: initial?.show_email_publicly ?? true,
    user_id: initial?.user_id ?? "",
    display_order: String(initial?.display_order ?? 0),
    is_featured: initial?.is_featured ?? false,
    is_published: initial?.is_published ?? false,
  };
}

// ── Shared input styling ────────────────────────────────────────────
const inputCls =
  "h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60";
const textareaCls =
  "w-full resize-none rounded-lg border border-divider p-3.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60";
const labelCls = "mb-1.5 block text-sm font-semibold text-text-body";
const helpCls = "mt-1.5 text-xs text-text-muted";
const errorCls = "mt-1.5 text-xs font-semibold text-red-600";

export default function TeamForm({
  initial,
  sections,
  profiles,
}: {
  initial?: TeamMemberRow;
  sections: TeamSection[];
  profiles: ProfileOption[];
}) {
  const isEdit = !!initial;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("identity");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState<FormState>(() => initialState(initial));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialState(initial)));

  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.photo_url ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(initial?.photo_url ?? "");

  // User link
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const busy = phase !== "idle";
  const isDirty = JSON.stringify(form) !== savedSnapshot || photoFile !== null;

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const linkedProfile = useMemo(
    () => profiles.find((p) => p.id === form.user_id) ?? null,
    [profiles, form.user_id]
  );

  const filteredProfiles = useMemo(() => {
    if (!userSearch.trim()) return profiles.slice(0, 8);
    const q = userSearch.toLowerCase();
    return profiles
      .filter((p) => p.email.toLowerCase().includes(q) || (p.full_name ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [profiles, userSearch]);

  const selectedSection = sections.find((s) => s.id === form.section_id) ?? null;

  // ── Live preview model ─────────────────────────────────────────────
  const previewMember: PublicTeamMember = useMemo(() => ({
    id: initial?.id ?? "preview",
    name_km: form.name_km,
    name_en: form.name_en,
    position_km: form.position_km || null,
    position_en: form.position_en || null,
    education: form.education || null,
    years_experience: form.years_experience || null,
    photo_url: photoPreview,
    photo_alt: form.photo_alt || null,
    short_bio_km: form.short_bio_km || null,
    short_bio_en: form.short_bio_en || null,
    bio_km: form.bio_km || null,
    bio_en: form.bio_en || null,
    responsibilities_km: form.responsibilities_km.split("\n").map((s) => s.trim()).filter(Boolean),
    responsibilities_en: form.responsibilities_en.split("\n").map((s) => s.trim()).filter(Boolean),
    languages: form.languages.split("\n").map((s) => s.trim()).filter(Boolean),
    working_hours: form.working_hours || null,
    is_featured: form.is_featured,
    display_order: Number(form.display_order) || 0,
    section_id: form.section_id || null,
    section_name_km: selectedSection?.name_km ?? null,
    section_name_en: selectedSection?.name_en ?? null,
    phone: form.show_phone_publicly && form.phone ? form.phone : null,
    email: form.show_email_publicly && linkedProfile ? linkedProfile.email : null,
  }), [form, photoPreview, selectedSection, linkedProfile, initial?.id]);

  // ── Tab completeness (green check when key fields are filled) ──────
  const tabComplete: Record<TabKey, boolean> = {
    identity: !!form.name_km && !!form.name_en,
    role: !!(form.position_km || form.position_en) && !!form.section_id,
    profile: !!(form.short_bio_km || form.short_bio_en || form.responsibilities_km || form.responsibilities_en),
    bio: !!(form.bio_km || form.bio_en),
    contact: true,
    account: !!form.user_id,
    publishing: true,
  };

  const tabErrors: Record<TabKey, number> = useMemo(() => {
    const counts = { identity: 0, role: 0, profile: 0, bio: 0, contact: 0, account: 0, publishing: 0 };
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (!message) continue;
      const tab = FIELD_TAB[field as keyof FormState];
      if (tab) counts[tab] += 1;
    }
    return counts;
  }, [fieldErrors]);

  // ── Photo ──────────────────────────────────────────────────────────
  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Photo must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`Photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`);
      return;
    }
    setError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Reusing an already-stored file — no upload needed at save time, so
   *  photoFile stays null and finalPhotoUrl (= photoUrl) is used as-is. */
  function handlePhotoFromStorage(file: StorageFile) {
    if (!file.url) return;
    setError(null);
    setPhotoFile(null);
    setPhotoPreview(file.url);
    setPhotoUrl(file.url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Tab keyboard nav ────────────────────────────────────────────────
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + dir + TABS.length) % TABS.length];
    setActiveTab(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }

  // ── Validation ─────────────────────────────────────────────────────
  function validate(publishing: boolean): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.name_km.trim()) errors.name_km = "Khmer name is required.";
    if (!form.name_en.trim()) errors.name_en = "Latin name is required.";
    const order = Number(form.display_order);
    if (!Number.isFinite(order) || order < 0) {
      errors.display_order = "Display order must be 0 or a positive number.";
    }
    if (publishing && !form.position_km.trim() && !form.position_en.trim()) {
      errors.position_en = "Add a position in at least one language before publishing.";
    }
    return errors;
  }

  function focusFirstError(errors: FieldErrors) {
    const first = Object.keys(errors)[0] as keyof FormState | undefined;
    if (!first) return;
    const tab = FIELD_TAB[first];
    if (tab) setActiveTab(tab);
    // Wait for the tab panel to become visible before focusing.
    setTimeout(() => document.getElementById(`field-${first}`)?.focus(), 0);
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function save(publish: boolean) {
    setError(null);
    setSuccess(null);

    const errors = validate(publish);
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields before saving.");
      focusFirstError(errors);
      return;
    }
    setFieldErrors({});

    try {
      let finalPhotoUrl = photoUrl;

      if (photoFile) {
        setPhase("uploading");
        const fd = new FormData();
        fd.append("file", photoFile);
        const res = await uploadToZima(fd, "team");
        if ("error" in res) throw new Error(`Photo upload failed: ${res.error}`);
        finalPhotoUrl = res.publicUrl;
      }

      setPhase("saving");

      const payload = new FormData();
      const textFields: (keyof FormState)[] = [
        "name_km", "name_en", "photo_alt", "position_km", "position_en",
        "section_id", "education", "years_experience",
        "short_bio_km", "short_bio_en", "bio_km", "bio_en",
        "responsibilities_km", "responsibilities_en", "languages",
        "working_hours", "phone", "user_id", "display_order",
      ];
      for (const f of textFields) payload.set(f, String(form[f]));
      payload.set("photo_url", finalPhotoUrl);
      payload.set("is_published", String(publish));
      payload.set("is_featured", String(form.is_featured));
      payload.set("show_phone_publicly", String(form.show_phone_publicly));
      payload.set("show_email_publicly", String(form.show_email_publicly));

      const result = isEdit && initial
        ? await updateTeamMember(initial.id, payload)
        : await createTeamMember(payload);

      if ("error" in result) throw new Error(result.error);

      const savedForm = { ...form, is_published: publish };
      setForm(savedForm);
      setSavedSnapshot(JSON.stringify(savedForm));
      setPhotoFile(null);
      setPhotoUrl(finalPhotoUrl);
      setPhase("idle");

      if (isEdit) {
        setSuccess(publish ? "Saved and published." : "Saved as draft (hidden from the public page).");
      } else {
        router.push(`/admin/team?created=${encodeURIComponent(form.name_en.trim())}`);
      }
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  const [cancelConfirm, setCancelConfirm] = useState(false);

  function handleCancel(e: React.MouseEvent) {
    if (isDirty) {
      e.preventDefault();
      setCancelConfirm(true);
    }
  }

  const shortBioCount = (value: string) => (
    <span className={`text-[11px] ${value.length > SHORT_BIO_MAX ? "font-semibold text-red-600" : "text-text-muted"}`}>
      {value.length}/{SHORT_BIO_MAX}
    </span>
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
      <form
        onSubmit={(e) => { e.preventDefault(); void save(form.is_published); }}
        noValidate
        className="min-w-0 rounded-2xl border border-divider bg-bg-surface shadow-sm"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-divider px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-950 text-white">
            <UserCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-text-heading">
              {isEdit ? "Edit team member" : "Add new team member"}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Fields marked <span className="font-semibold text-red-500">*</span> are required.
              Photos are stored in Zima Storage. Email comes from the linked account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper xl:hidden"
            aria-expanded={showPreview}
          >
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? "Hide preview" : "Preview card"}
          </button>
        </div>

        {/* Status banners — visible regardless of active tab */}
        {error && (
          <div role="alert" className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}
        {busy && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
            {phase === "uploading" ? "Uploading photo to Zima Storage…" : "Saving…"}
          </div>
        )}

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Team member form sections"
          className="flex gap-1 overflow-x-auto border-b border-divider px-3 pt-3"
        >
          {TABS.map((t, i) => {
            const isActive = activeTab === t.key;
            const errCount = tabErrors[t.key];
            return (
              <button
                key={t.key}
                type="button"
                id={`tab-${t.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(t.key)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={`flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-transparent text-text-muted hover:bg-paper hover:text-text-body"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {errCount > 0 ? (
                  <span
                    className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                    aria-label={`${errCount} error${errCount === 1 ? "" : "s"} in this section`}
                  >
                    {errCount}
                  </span>
                ) : tabComplete[t.key] ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* ══ PANELS ═══════════════════════════════════════════════════ */}
        <div className="p-6">

          {/* IDENTITY */}
          <div id="panel-identity" role="tabpanel" aria-labelledby="tab-identity" hidden={activeTab !== "identity"}>
            <p className="mb-5 text-xs text-text-muted">
              Square photo recommended, 400×400px or larger — faces centered, neutral background.
              JPEG, PNG, or WebP · max 5 MB.
            </p>

            <div className="flex items-start gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-divider bg-paper">
                {photoPreview ? (
                  <Image src={photoPreview} alt="Preview of the selected photo" fill className="object-cover" unoptimized={true} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <UserCircle className="h-10 w-10 text-text-muted/40" />
                  </div>
                )}
                {photoPreview && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute right-0 top-0 cursor-pointer rounded-full bg-red-500 p-0.5 text-white shadow"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoPick}
                  disabled={busy}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-divider bg-paper px-5 py-3.5 text-sm font-semibold text-text-body transition hover:border-brand hover:bg-cyan-50/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {photoPreview ? "Replace photo" : "Choose photo"}
                  </button>
                  <StoragePicker
                    folder="team"
                    acceptExtensions={IMAGE_EXTENSIONS}
                    onSelect={handlePhotoFromStorage}
                    triggerClassName="flex items-center gap-2 rounded-lg border-2 border-dashed border-divider bg-paper px-5 py-3.5 text-sm font-semibold text-text-body transition hover:border-brand hover:bg-cyan-50/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <p className={helpCls}>Optional — a placeholder icon is shown until one is added.</p>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="field-photo_alt" className={labelCls}>
                Photo description <span className="font-normal text-text-muted">(alt text, for screen readers)</span>
              </label>
              <input
                id="field-photo_alt"
                value={form.photo_alt}
                onChange={(e) => set("photo_alt", e.target.value)}
                disabled={busy}
                placeholder='e.g. "Photo of Sokha, Head Librarian at PTEC Library"'
                className={inputCls}
              />
              <p className={helpCls}>Leave blank to auto-generate from the name and position.</p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="field-name_km" className={labelCls}>
                  ឈ្មោះពេញ ខ្មែរ <span className="font-normal text-text-muted">(Full Name Khmer)</span>
                  <span className="text-red-500"> *</span>
                </label>
                <input
                  id="field-name_km"
                  value={form.name_km}
                  onChange={(e) => set("name_km", e.target.value)}
                  required
                  disabled={busy}
                  aria-invalid={!!fieldErrors.name_km}
                  aria-describedby={fieldErrors.name_km ? "err-name_km" : undefined}
                  className={`${inputCls} font-kh ${fieldErrors.name_km ? "border-red-400" : ""}`}
                />
                {fieldErrors.name_km && <p id="err-name_km" className={errorCls}>{fieldErrors.name_km}</p>}
              </div>

              <div>
                <label htmlFor="field-name_en" className={labelCls}>
                  Full Name Latin <span className="font-normal text-text-muted">(ឈ្មោះពេញ ឡាតាំង)</span>
                  <span className="text-red-500"> *</span>
                </label>
                <input
                  id="field-name_en"
                  value={form.name_en}
                  onChange={(e) => set("name_en", e.target.value)}
                  required
                  disabled={busy}
                  aria-invalid={!!fieldErrors.name_en}
                  aria-describedby={fieldErrors.name_en ? "err-name_en" : undefined}
                  className={`${inputCls} ${fieldErrors.name_en ? "border-red-400" : ""}`}
                />
                {fieldErrors.name_en && <p id="err-name_en" className={errorCls}>{fieldErrors.name_en}</p>}
              </div>
            </div>
          </div>

          {/* ROLE & SECTION */}
          <div id="panel-role" role="tabpanel" aria-labelledby="tab-role" hidden={activeTab !== "role"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="field-position_km" className={labelCls}>
                  មុខតំណែង <span className="font-normal text-text-muted">(Position Khmer)</span>
                </label>
                <input
                  id="field-position_km"
                  value={form.position_km}
                  onChange={(e) => set("position_km", e.target.value)}
                  disabled={busy}
                  placeholder="ឧ. បណ្ណារក្សប្រធាន"
                  className={`${inputCls} font-kh`}
                />
              </div>

              <div>
                <label htmlFor="field-position_en" className={labelCls}>
                  Position <span className="font-normal text-text-muted">(English)</span>
                </label>
                <input
                  id="field-position_en"
                  value={form.position_en}
                  onChange={(e) => set("position_en", e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Head Librarian"
                  aria-invalid={!!fieldErrors.position_en}
                  aria-describedby={fieldErrors.position_en ? "err-position_en" : undefined}
                  className={`${inputCls} ${fieldErrors.position_en ? "border-red-400" : ""}`}
                />
                {fieldErrors.position_en && <p id="err-position_en" className={errorCls}>{fieldErrors.position_en}</p>}
              </div>
            </div>
            <p className={helpCls}>
              Fill the position in at least one language — visitors see it on the staff card.
            </p>

            <div className="mt-4">
              <label htmlFor="field-section_id" className={labelCls}>
                ផ្នែក / Section
                <span className="ml-2 font-normal text-text-muted">(which team this person belongs to)</span>
              </label>
              <select
                id="field-section_id"
                value={form.section_id}
                onChange={(e) => set("section_id", e.target.value)}
                disabled={busy}
                className={`${inputCls} bg-bg-surface`}
              >
                <option value="">— No section —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_km} · {s.name_en}
                  </option>
                ))}
              </select>
              <p className={helpCls}>
                Recommended — members without a section appear under “Other Members” on the public page.
              </p>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => set("is_featured", !form.is_featured)}
                disabled={busy}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition disabled:opacity-60 sm:w-auto sm:pr-6 ${
                  form.is_featured
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-divider bg-paper text-text-muted"
                }`}
                aria-pressed={form.is_featured}
              >
                <Star className={`h-4 w-4 ${form.is_featured ? "fill-current text-amber-500" : ""}`} />
                <span className="text-sm font-semibold">
                  {form.is_featured ? "Featured — shown first as a Key Contact" : "Feature as Key Contact"}
                </span>
              </button>
              <p className={helpCls}>
                Featured members appear at the top of the public page under “Key Contacts”.
              </p>
            </div>
          </div>

          {/* PUBLIC PROFILE */}
          <div id="panel-profile" role="tabpanel" aria-labelledby="tab-profile" hidden={activeTab !== "profile"}>
            <p className="mb-5 text-xs text-text-muted">
              Short, scannable content shown on the public staff card and profile. Keep it brief —
              the full biography lives on the next tab.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="field-short_bio_km" className={labelCls}>
                    ការទទួលខុសត្រូវសង្ខេប <span className="font-normal text-text-muted">(Short summary Khmer)</span>
                  </label>
                  {shortBioCount(form.short_bio_km)}
                </div>
                <textarea
                  id="field-short_bio_km"
                  rows={3}
                  maxLength={SHORT_BIO_MAX}
                  value={form.short_bio_km}
                  onChange={(e) => set("short_bio_km", e.target.value)}
                  disabled={busy}
                  className={`${textareaCls} font-kh`}
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="field-short_bio_en" className={labelCls}>
                    Short summary <span className="font-normal text-text-muted">(English, 1–2 sentences)</span>
                  </label>
                  {shortBioCount(form.short_bio_en)}
                </div>
                <textarea
                  id="field-short_bio_en"
                  rows={3}
                  maxLength={SHORT_BIO_MAX}
                  value={form.short_bio_en}
                  onChange={(e) => set("short_bio_en", e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Supports students with digital resources and research access."
                  className={textareaCls}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="field-responsibilities_km" className={labelCls}>
                  ភារកិច្ចទទួលខុសត្រូវ <span className="font-normal text-text-muted">(Responsibilities Khmer)</span>
                </label>
                <textarea
                  id="field-responsibilities_km"
                  rows={4}
                  value={form.responsibilities_km}
                  onChange={(e) => set("responsibilities_km", e.target.value)}
                  disabled={busy}
                  className={`${textareaCls} font-kh`}
                />
                <p className={helpCls}>One responsibility per line — shown as a list on the profile.</p>
              </div>
              <div>
                <label htmlFor="field-responsibilities_en" className={labelCls}>
                  Responsibilities <span className="font-normal text-text-muted">(English)</span>
                </label>
                <textarea
                  id="field-responsibilities_en"
                  rows={4}
                  value={form.responsibilities_en}
                  onChange={(e) => set("responsibilities_en", e.target.value)}
                  disabled={busy}
                  placeholder={"Maintain digital library platform\nHelp users access digital resources"}
                  className={textareaCls}
                />
                <p className={helpCls}>One responsibility per line, up to 12 items.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="field-education" className={labelCls}>
                  កម្រិតសិក្សា <span className="font-normal text-text-muted">(Education)</span>
                </label>
                <input
                  id="field-education"
                  value={form.education}
                  onChange={(e) => set("education", e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Master's in Library Science"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="field-years_experience" className={labelCls}>
                  បទពិសោធន៍ <span className="font-normal text-text-muted">(Experience)</span>
                </label>
                <input
                  id="field-years_experience"
                  value={form.years_experience}
                  onChange={(e) => set("years_experience", e.target.value)}
                  disabled={busy}
                  placeholder="e.g. 8 years"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="field-working_hours" className={labelCls}>
                  ម៉ោងធ្វើការ <span className="font-normal text-text-muted">(Working hours)</span>
                </label>
                <input
                  id="field-working_hours"
                  value={form.working_hours}
                  onChange={(e) => set("working_hours", e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Mon–Fri, 7:00–17:00"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="field-languages" className={labelCls}>
                ភាសា <span className="font-normal text-text-muted">(Languages — one per line)</span>
              </label>
              <textarea
                id="field-languages"
                rows={2}
                value={form.languages}
                onChange={(e) => set("languages", e.target.value)}
                disabled={busy}
                placeholder={"Khmer\nEnglish"}
                className={textareaCls}
              />
            </div>
          </div>

          {/* BIOGRAPHY */}
          <div id="panel-bio" role="tabpanel" aria-labelledby="tab-bio" hidden={activeTab !== "bio"}>
            <p className="mb-5 text-xs text-text-muted">
              The full biography appears in the profile dialog, not on the card. Recommended: 1–3
              short paragraphs.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="field-bio_km" className={labelCls}>
                    ប្រវត្តិសង្ខេប <span className="font-normal text-text-muted">(Khmer)</span>
                  </label>
                  <span className={`text-[11px] ${form.bio_km.length > BIO_RECOMMENDED ? "text-amber-600" : "text-text-muted"}`}>
                    {form.bio_km.length} chars
                  </span>
                </div>
                <textarea
                  id="field-bio_km"
                  rows={6}
                  value={form.bio_km}
                  onChange={(e) => set("bio_km", e.target.value)}
                  disabled={busy}
                  className={`${textareaCls} font-kh`}
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="field-bio_en" className={labelCls}>
                    Full Bio <span className="font-normal text-text-muted">(English)</span>
                  </label>
                  <span className={`text-[11px] ${form.bio_en.length > BIO_RECOMMENDED ? "text-amber-600" : "text-text-muted"}`}>
                    {form.bio_en.length} chars
                  </span>
                </div>
                <textarea
                  id="field-bio_en"
                  rows={6}
                  value={form.bio_en}
                  onChange={(e) => set("bio_en", e.target.value)}
                  disabled={busy}
                  placeholder="Professional background, expertise, and how this person helps library users…"
                  className={textareaCls}
                />
              </div>
            </div>
            {(form.bio_km.length > BIO_RECOMMENDED || form.bio_en.length > BIO_RECOMMENDED) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Long biographies are fine in the profile dialog, but consider adding a Short summary
                (Public Profile tab) so the card stays scannable.
              </p>
            )}
          </div>

          {/* CONTACT & PRIVACY */}
          <div id="panel-contact" role="tabpanel" aria-labelledby="tab-contact" hidden={activeTab !== "contact"}>
            <p className="mb-5 text-xs text-text-muted">
              Contact details are <strong>private by default</strong>. Visitors are always shown the
              official library contact channels; personal details appear only if you enable them below.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="field-phone" className={labelCls}>
                  ទូរស័ព្ទ <span className="font-normal text-text-muted">(Phone)</span>
                </label>
                <input
                  id="field-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  disabled={busy}
                  placeholder="0XX XXX XXX"
                  className={inputCls}
                />
                <p className={helpCls}>
                  Kept internal unless “Show phone publicly” is enabled below.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <PrivacyToggle
                enabled={form.show_phone_publicly}
                onToggle={() => set("show_phone_publicly", !form.show_phone_publicly)}
                disabled={busy || !form.phone}
                label="Show phone on the public page"
                enabledNote="Phone number is visible to everyone"
                disabledNote={form.phone ? "Phone stays internal (admin only)" : "Add a phone number first"}
              />
              {form.show_phone_publicly && (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Only enable public phone if this number is approved for public display. Personal
                  numbers should stay private — visitors can always reach the library desk.
                </p>
              )}

              <PrivacyToggle
                enabled={form.show_email_publicly}
                onToggle={() => set("show_email_publicly", !form.show_email_publicly)}
                disabled={busy || !linkedProfile}
                label="Show linked account email on the public page"
                enabledNote={linkedProfile ? `${linkedProfile.email} is visible to everyone` : "Link an account first (Account Link tab)"}
                disabledNote={linkedProfile ? "Email stays internal (admin only)" : "Link an account first (Account Link tab)"}
              />
            </div>
          </div>

          {/* ACCOUNT LINK */}
          <div id="panel-account" role="tabpanel" aria-labelledby="tab-account" hidden={activeTab !== "account"}>
            <p className="mb-5 text-xs text-text-muted">
              Optional — linking a system account lets this person edit their own team profile and
              provides their email address. Leave blank if this person has no account.
            </p>

            {linkedProfile ? (
              <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-text-heading">
                    {linkedProfile.full_name ?? "(No name)"}
                  </p>
                  <p className="text-xs text-text-muted">{linkedProfile.email}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    ✓ Linked — email {form.show_email_publicly ? "shown publicly" : "kept internal"} (change in Contact &amp; Privacy)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { set("user_id", ""); setUserSearch(""); }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-divider px-2.5 py-1.5 text-xs font-semibold text-text-muted transition hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                  Unlink
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                    onFocus={() => setShowUserDropdown(true)}
                    onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)}
                    placeholder="Search by name or email…"
                    disabled={busy}
                    aria-label="Search user accounts to link"
                    className="h-11 w-full rounded-lg border border-divider bg-bg-surface pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60"
                  />
                </div>
                {showUserDropdown && (
                  filteredProfiles.length > 0 ? (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-lg">
                      {filteredProfiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => {
                            set("user_id", p.id);
                            setUserSearch("");
                            setShowUserDropdown(false);
                          }}
                          className="flex w-full cursor-pointer flex-col items-start border-b border-divider px-4 py-2.5 text-left text-sm transition last:border-0 hover:bg-paper"
                        >
                          <span className="font-medium text-text-heading">{p.full_name ?? "(No name)"}</span>
                          <span className="text-xs text-text-muted">{p.email}</span>
                        </button>
                      ))}
                    </div>
                  ) : userSearch.trim() ? (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-divider bg-bg-surface px-4 py-3 text-sm text-text-muted shadow-lg">
                      No account matches “{userSearch.trim()}”. The person may not have signed up yet —
                      you can still save the profile without a linked account.
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>

          {/* PUBLISHING */}
          <div id="panel-publishing" role="tabpanel" aria-labelledby="tab-publishing" hidden={activeTab !== "publishing"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="field-display_order" className={labelCls}>
                  Display Order
                  <span className="ml-2 font-normal text-text-muted">(lower = first)</span>
                </label>
                <input
                  id="field-display_order"
                  type="number"
                  min="0"
                  value={form.display_order}
                  onChange={(e) => set("display_order", e.target.value)}
                  disabled={busy}
                  aria-invalid={!!fieldErrors.display_order}
                  aria-describedby={fieldErrors.display_order ? "err-display_order" : undefined}
                  className={`${inputCls} ${fieldErrors.display_order ? "border-red-400" : ""}`}
                />
                {fieldErrors.display_order && (
                  <p id="err-display_order" className={errorCls}>{fieldErrors.display_order}</p>
                )}
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => set("is_published", !form.is_published)}
                  disabled={busy}
                  role="switch"
                  aria-checked={form.is_published}
                  className={`flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg border px-4 transition disabled:opacity-60 ${
                    form.is_published
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-divider bg-paper text-text-muted"
                  }`}
                >
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.is_published ? "bg-emerald-500" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_published ? "translate-x-4" : "translate-x-0.5"}`} />
                  </span>
                  <span className="text-sm font-semibold">
                    {form.is_published ? "Published — visible on the public page" : "Draft — hidden from the public page"}
                  </span>
                </button>
              </div>
            </div>

            {isEdit && initial && (
              <dl className="mt-5 grid gap-2 rounded-lg border border-divider bg-paper px-4 py-3 text-xs text-text-muted sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-text-body">Created</dt>
                  <dd>{new Date(initial.created_at).toLocaleString()}</dd>
                </div>
                {initial.updated_at && (
                  <div>
                    <dt className="font-semibold text-text-body">Last updated</dt>
                    <dd>{new Date(initial.updated_at).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>

        {/* Footer — always visible, independent of active tab */}
        <div className="flex flex-wrap items-center gap-3 border-t border-divider bg-paper/40 px-6 py-4">
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={busy}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && !form.is_published ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={busy}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-6 text-sm font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {phase === "uploading" ? "Uploading…" : "Saving…"}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                {form.is_published ? "Save & keep published" : "Save & publish"}
              </>
            )}
          </button>
          <Link
            href="/admin/team"
            onClick={handleCancel}
            className="inline-flex h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold text-text-muted transition hover:text-text-body"
          >
            Cancel
          </Link>
          <ConfirmDialog
            open={cancelConfirm}
            title="Discard unsaved changes?"
            description="Your edits to this team member have not been saved and will be lost."
            confirmLabel="Discard changes"
            onCancel={() => setCancelConfirm(false)}
            onConfirm={() => {
              setCancelConfirm(false);
              router.push("/admin/team");
            }}
          />
          {isDirty && !busy && (
            <span className="ml-auto text-xs font-medium text-amber-600">Unsaved changes</span>
          )}
        </div>
      </form>

      {/* ── Live public-card preview ─────────────────────────────────── */}
      <aside
        className={`${showPreview ? "block" : "hidden"} xl:block xl:sticky xl:top-6`}
        aria-label="Live preview of the public staff card"
      >
        <div className="rounded-2xl border border-divider bg-paper p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
              Public card preview
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                form.is_published
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {form.is_published ? "Published" : "Draft"}
            </span>
          </div>
          <MemberCard member={previewMember} palette={PALETTES[0]} preview />
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            This is how the card appears on the public Library Team page. Contact details show only
            when approved in Contact &amp; Privacy.
            {!form.is_published && " Drafts are never shown publicly."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function PrivacyToggle({
  enabled, onToggle, disabled, label, enabledNote, disabledNote,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
  enabledNote: string;
  disabledNote: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={disabled}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        enabled ? "border-emerald-200 bg-emerald-50" : "border-divider bg-paper"
      }`}
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      <span>
        <span className={`block text-sm font-semibold ${enabled ? "text-emerald-800" : "text-text-body"}`}>
          {label}
        </span>
        <span className={`block text-xs ${enabled ? "text-emerald-700" : "text-text-muted"}`}>
          {enabled ? enabledNote : disabledNote}
        </span>
      </span>
    </button>
  );
}
