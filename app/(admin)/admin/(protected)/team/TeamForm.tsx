"use client";

import { useState, useRef, useTransition, useMemo } from "react";
import Image from "next/image";
import { UserCircle, Upload, X, Search, Link as LinkIcon } from "lucide-react";
import { uploadToZima } from "@/app/actions/upload";
import { createTeamMember, updateTeamMember } from "./actions";
import type { TeamMemberRow, TeamSection, ProfileOption } from "./actions";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

type Phase = "idle" | "uploading" | "saving";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase]           = useState<Phase>("idle");
  const [error, setError]           = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.photo_url ?? null);
  const [photoFile, setPhotoFile]   = useState<File | null>(null);
  const [photoUrl, setPhotoUrl]     = useState<string>(initial?.photo_url ?? "");
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? true);

  // User link
  const [userId, setUserId]         = useState<string>(initial?.user_id ?? "");
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const [, startTransition] = useTransition();
  const busy = phase !== "idle";

  // Linked profile
  const linkedProfile = useMemo(
    () => profiles.find((p) => p.id === userId) ?? null,
    [profiles, userId]
  );

  // Filtered profile results
  const filteredProfiles = useMemo(() => {
    if (!userSearch.trim()) return profiles.slice(0, 8);
    const q = userSearch.toLowerCase();
    return profiles
      .filter(
        (p) =>
          p.email.toLowerCase().includes(q) ||
          (p.full_name ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [profiles, userSearch]);

  // ── Photo ──────────────────────────────────────────────────────────
  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { setError("Photo must be JPEG, PNG, or WebP"); return; }
    if (file.size > MAX_FILE_SIZE) { setError("Photo must be under 5 MB"); return; }
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

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const raw = new FormData(e.currentTarget);
    const nameKm = (raw.get("name_km") as string)?.trim();
    const nameEn = (raw.get("name_en") as string)?.trim();
    if (!nameKm) { setError("Khmer name is required"); return; }
    if (!nameEn) { setError("Latin name is required"); return; }

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
      const fields = [
        "name_km", "name_en", "position_km", "position_en",
        "education", "years_experience", "phone", "bio_km", "bio_en",
        "section_id", "display_order",
      ];
      for (const f of fields) payload.set(f, (raw.get(f) as string) ?? "");
      payload.set("user_id",     userId);
      payload.set("photo_url",   finalPhotoUrl);
      payload.set("is_published", String(isPublished));

      startTransition(async () => {
        if (isEdit && initial) {
          await updateTeamMember(initial.id, payload);
        } else {
          await createTeamMember(payload);
        }
      });
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-divider bg-bg-surface shadow-sm">

      {/* Header */}
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-base font-bold text-text-heading">
          {isEdit ? "Edit team member" : "Add new team member"}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Fields marked <span className="text-red-500">*</span> are required.
          Photo is stored in Zima Storage. Email is linked from the staff&apos;s account.
        </p>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-2">

        {/* ══ PHOTO ═══════════════════════════════════════════════════ */}
        <div className="md:col-span-2">
          <span className="mb-2 block text-sm font-semibold text-text-body">
            Profile Photo
            <span className="ml-2 font-normal text-text-muted">
              (optional · square · JPEG / PNG / WebP · max 5 MB · stored in Zima Storage)
            </span>
          </span>
          <div className="flex items-start gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-divider bg-paper">
              {photoPreview ? (
                <Image src={photoPreview} alt="Preview" fill className="object-cover" unoptimized={true} />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <UserCircle className="h-10 w-10 text-text-muted/40" />
                </div>
              )}
              {photoPreview && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute right-0 top-0 rounded-full bg-red-500 p-0.5 text-white shadow cursor-pointer"
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border-2 border-dashed border-divider bg-paper px-5 py-3.5 text-sm font-semibold text-text-body transition hover:border-brand hover:bg-cyan-50/40 hover:text-brand disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <Upload className="h-4 w-4" />
                {photoPreview ? "Replace photo" : "Choose photo"}
              </button>
              <p className="mt-1.5 text-xs text-text-muted">
                Square crop recommended (400×400 px or larger).
              </p>
            </div>
          </div>
        </div>

        {/* ══ LINK TO USER ACCOUNT (email source) ═════════════════════ */}
        <div className="md:col-span-2">
          <div className="rounded-xl border border-divider bg-paper p-4">
            <div className="flex items-center gap-2 mb-3">
              <LinkIcon className="h-4 w-4 text-brand shrink-0" />
              <span className="text-sm font-semibold text-text-heading">
                Link to Staff Account
              </span>
              <span className="text-xs text-text-muted font-normal">
                — email will be pulled automatically from the linked account
              </span>
            </div>

            {linkedProfile ? (
              /* Linked profile display */
              <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-text-heading">
                    {linkedProfile.full_name ?? "(No name)"}
                  </p>
                  <p className="text-xs text-text-muted">{linkedProfile.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setUserId(""); setUserSearch(""); }}
                  className="rounded-full p-1 text-text-muted hover:text-red-500 transition cursor-pointer"
                  aria-label="Unlink account"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* Search box */
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                    onFocus={() => setShowUserDropdown(true)}
                    onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)}
                    placeholder="Search by name or email…"
                    disabled={busy}
                    className="h-10 w-full rounded-lg border border-divider bg-bg-surface pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60"
                  />
                </div>
                {showUserDropdown && filteredProfiles.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-divider bg-bg-surface shadow-lg overflow-hidden">
                    {filteredProfiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => {
                          setUserId(p.id);
                          setUserSearch("");
                          setShowUserDropdown(false);
                        }}
                        className="flex w-full flex-col items-start px-4 py-2.5 text-left text-sm transition hover:bg-paper cursor-pointer border-b border-divider last:border-0"
                      >
                        <span className="font-medium text-text-heading">{p.full_name ?? "(No name)"}</span>
                        <span className="text-xs text-text-muted">{p.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!linkedProfile && (
                  <p className="mt-1.5 text-xs text-text-muted">
                    Optional — leave blank if the staff member has no system account.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ NAMES ═══════════════════════════════════════════════════ */}
        <div>
          <label htmlFor="name_km" className="mb-1.5 block text-sm font-semibold text-text-body">
            ឈ្មោះពេញ ខ្មែរ <span className="text-text-muted font-normal">(Full Name Khmer)</span>
            <span className="text-red-500"> *</span>
          </label>
          <input
            id="name_km" name="name_km" required
            defaultValue={initial?.name_km ?? ""}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm font-kh outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="name_en" className="mb-1.5 block text-sm font-semibold text-text-body">
            Full Name Latin <span className="text-text-muted font-normal">(ឈ្មោះពេញ ឡាតាំង)</span>
            <span className="text-red-500"> *</span>
          </label>
          <input
            id="name_en" name="name_en" required
            defaultValue={initial?.name_en ?? ""}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        {/* ══ POSITION ════════════════════════════════════════════════ */}
        <div>
          <label htmlFor="position_km" className="mb-1.5 block text-sm font-semibold text-text-body">
            មុខតំណែង <span className="text-text-muted font-normal">(Position Khmer)</span>
          </label>
          <input
            id="position_km" name="position_km"
            defaultValue={initial?.position_km ?? ""}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm font-kh outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="position_en" className="mb-1.5 block text-sm font-semibold text-text-body">
            Position <span className="text-text-muted font-normal">(English)</span>
          </label>
          <input
            id="position_en" name="position_en"
            defaultValue={initial?.position_en ?? ""}
            disabled={busy}
            placeholder="e.g. Head Librarian"
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        {/* ══ SECTION ═════════════════════════════════════════════════ */}
        <div className="md:col-span-2">
          <label htmlFor="section_id" className="mb-1.5 block text-sm font-semibold text-text-body">
            ផ្នែក / Section
            <span className="ml-2 font-normal text-text-muted">(which team this person belongs to)</span>
          </label>
          <select
            id="section_id" name="section_id"
            defaultValue={initial?.section_id ?? ""}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60"
          >
            <option value="">— No section —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_km} · {s.name_en}
              </option>
            ))}
          </select>
        </div>

        {/* ══ EDUCATION + EXPERIENCE ══════════════════════════════════ */}
        <div>
          <label htmlFor="education" className="mb-1.5 block text-sm font-semibold text-text-body">
            កម្រិតវប្បធម៌ <span className="text-text-muted font-normal">(Education)</span>
          </label>
          <input
            id="education" name="education"
            defaultValue={initial?.education ?? ""}
            disabled={busy}
            placeholder="e.g. Master's in Library Science"
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="years_experience" className="mb-1.5 block text-sm font-semibold text-text-body">
            បទពិសោធន៍ <span className="text-text-muted font-normal">(Years of Experience)</span>
          </label>
          <input
            id="years_experience" name="years_experience"
            defaultValue={initial?.years_experience ?? ""}
            disabled={busy}
            placeholder="e.g. 8 years"
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        {/* ══ PHONE ═══════════════════════════════════════════════════ */}
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold text-text-body">
            ទូរស័ព្ទ <span className="text-text-muted font-normal">(Phone)</span>
          </label>
          <input
            id="phone" name="phone" type="tel"
            defaultValue={initial?.phone ?? ""}
            disabled={busy}
            placeholder="0XX XXX XXX"
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        {/* ══ BIO ═════════════════════════════════════════════════════ */}
        <div>
          <label htmlFor="bio_km" className="mb-1.5 block text-sm font-semibold text-text-body">
            ប្រវត្តិសង្ខេប <span className="text-text-muted font-normal">(Short Bio — Khmer)</span>
          </label>
          <textarea
            id="bio_km" name="bio_km" rows={3}
            defaultValue={initial?.bio_km ?? ""}
            disabled={busy}
            className="w-full resize-none rounded-lg border border-divider p-3.5 text-sm font-kh outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="bio_en" className="mb-1.5 block text-sm font-semibold text-text-body">
            Short Bio <span className="text-text-muted font-normal">(English — 2–3 sentences)</span>
          </label>
          <textarea
            id="bio_en" name="bio_en" rows={3}
            defaultValue={initial?.bio_en ?? ""}
            disabled={busy}
            placeholder="Brief professional background…"
            className="w-full resize-none rounded-lg border border-divider p-3.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        {/* ══ ORDER + PUBLISHED ═══════════════════════════════════════ */}
        <div>
          <label htmlFor="display_order" className="mb-1.5 block text-sm font-semibold text-text-body">
            Display Order
            <span className="ml-2 font-normal text-text-muted">(lower = first)</span>
          </label>
          <input
            id="display_order" name="display_order" type="number" min="0"
            defaultValue={initial?.display_order ?? 0}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:opacity-60"
          />
        </div>

        <div className="flex items-end pb-0.5">
          <button
            type="button"
            onClick={() => setIsPublished((v) => !v)}
            disabled={busy}
            className={`flex h-11 w-full items-center gap-3 rounded-lg border px-4 transition cursor-pointer disabled:opacity-60 ${
              isPublished
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-divider bg-paper text-text-muted"
            }`}
          >
            <div className={`relative h-5 w-9 rounded-full transition-colors ${isPublished ? "bg-emerald-500" : "bg-gray-300"}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isPublished ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm font-semibold">
              {isPublished ? "Published" : "Draft (hidden)"}
            </span>
          </button>
        </div>

        {/* ══ ERROR / PROGRESS ════════════════════════════════════════ */}
        {error && (
          <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {busy && (
          <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
            {phase === "uploading" ? "Uploading photo to Zima Storage…" : "Saving…"}
          </div>
        )}

        {/* Hidden user_id */}
        <input type="hidden" name="user_id" value={userId} />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-divider px-6 py-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-950 px-6 text-sm font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{phase === "uploading" ? "Uploading…" : "Saving…"}</>
          ) : isEdit ? "Save changes" : "Add member"}
        </button>
        <a
          href="/admin/team"
          className="inline-flex h-11 items-center rounded-lg border border-divider px-5 text-sm font-semibold text-text-body transition hover:bg-paper cursor-pointer"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
