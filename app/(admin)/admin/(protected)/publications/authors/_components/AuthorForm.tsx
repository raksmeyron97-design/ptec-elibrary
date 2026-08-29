"use client";

import { useRef, useState } from "react";
import { AlertCircle, Loader2, Trash2, Upload, UserRound } from "lucide-react";

import { upsertPublicationAuthor } from "@/app/actions/publications";
import type { AdminAuthorRow } from "@/lib/authors/admin";
import { safeExternalUrl } from "@/lib/authors/links";
import { isValidOrcid } from "@/lib/seo/identifiers";
import { slugify } from "@/lib/book-utils";
import {
  Field,
  FormSection,
  Switch,
  focusFirstInvalid,
} from "@/components/admin/kit/form";
import TagInput from "@/components/ui/core/TagInput";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Create/edit an author's academic profile.
 *
 * SHAPE: a sectioned dialog form, four sections deep — Identity, Academic
 * profile, External profiles, Publishing. Sectioned rather than one flat list
 * because the fields fall into genuinely different questions (who they are,
 * what they do, where else they exist, whether the profile is visible), and a
 * flat nineteen-field column reads as a data-entry chore instead of a record.
 *
 * VALIDATION: on submit, not on keystroke — a URL is invalid for most of the
 * time it is being typed, and flagging that is nagging, not helping. Every
 * rule here is also enforced in upsertPublicationAuthor(); this copy exists so
 * the librarian is told before the round trip, not so the server can trust it.
 *
 * Marked required, never optional: only the name is required, and the section
 * descriptions say so once rather than "(optional)" appearing eighteen times.
 */

type FormState = {
  full_name: string;
  full_name_km: string;
  slug: string;
  photo_url: string;
  position_title: string;
  affiliation_name: string;
  bio: string;
  bio_km: string;
  research_interests: string[];
  orcid: string;
  email: string;
  website_url: string;
  google_scholar_url: string;
  research_gate_url: string;
  is_published: boolean;
};

const EMPTY: FormState = {
  full_name: "",
  full_name_km: "",
  slug: "",
  photo_url: "",
  position_title: "",
  affiliation_name: "",
  bio: "",
  bio_km: "",
  research_interests: [],
  orcid: "",
  email: "",
  website_url: "",
  google_scholar_url: "",
  research_gate_url: "",
  is_published: true,
};

function fromRow(row: AdminAuthorRow): FormState {
  return {
    full_name: row.full_name,
    full_name_km: row.full_name_km ?? "",
    slug: row.slug ?? "",
    photo_url: row.photo_url ?? "",
    position_title: row.position_title ?? "",
    affiliation_name: row.affiliation_name ?? "",
    bio: row.bio ?? "",
    bio_km: row.bio_km ?? "",
    research_interests: row.research_interests ?? [],
    orcid: row.orcid ?? "",
    email: row.email ?? "",
    website_url: row.website_url ?? "",
    google_scholar_url: row.google_scholar_url ?? "",
    research_gate_url: row.research_gate_url ?? "",
    is_published: row.is_published,
  };
}

async function uploadPhoto(file: File, slug: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const payload = new FormData();
  payload.set("file", file);
  // "publications/" rather than "team/": app/actions/upload.ts maps the folder
  // to the permission it checks, and an author record is governed by
  // publications:write. Uploading a portrait under "team/" would have demanded
  // books:write instead — a permission a publications editor need not hold.
  payload.set("key", `publications/authors/${slug || "author"}-${Date.now()}.${ext}`);
  const res = await fetch("/api/admin/upload", { method: "POST", body: payload });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

export default function AuthorForm({
  author,
  onSaved,
  onCancel,
}: {
  /** null = create. */
  author: AdminAuthorRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!author;
  const [form, setForm] = useState<FormState>(author ? fromRow(author) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<Partial<Record<keyof FormState, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear this field's error as soon as it is touched: an error that
    // outlives its cause is noise the next time the form is read.
    setIssues((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  // The slug follows the name until an admin edits it by hand. On an existing
  // record it never auto-changes — the slug is a published URL, and renaming
  // it silently on an unrelated edit would break inbound links.
  //
  // DERIVED, not synced. An effect that wrote the slug back into state on every
  // keystroke made the name field cost two renders and gave the same value two
  // owners. While untouched, the slug simply IS slugify(name); the moment an
  // admin edits the field, `slugTouched` flips and their value takes over.
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const effectiveSlug = slugTouched ? form.slug : slugify(form.full_name) || "";

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.full_name.trim()) next.full_name = "An author needs a name.";
    if (form.orcid.trim() && !isValidOrcid(form.orcid)) {
      next.orcid = "Must look like 0000-0002-1825-0097.";
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Not a valid email address.";
    }
    for (const key of ["website_url", "google_scholar_url", "research_gate_url"] as const) {
      if (form[key].trim() && !safeExternalUrl(form[key])) {
        next[key] = "Enter the full address, starting with https://";
      }
    }
    if (!slugify(effectiveSlug || form.full_name)) {
      next.slug = "This name produces no usable address — set one by hand.";
    }
    setIssues(next);
    if (Object.keys(next).length > 0) {
      focusFirstInvalid(formRef.current);
      return false;
    }
    return true;
  };

  const handlePhoto = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("A profile photo must be an image (JPG, PNG, WebP or AVIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is over 5 MB. Please use a smaller one.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhoto(file, effectiveSlug || slugify(form.full_name));
      set("photo_url", url);
    } catch (err) {
      // An upload failure must never clear the photo already on the record.
      setError(err instanceof Error ? err.message : "The photo could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !validate()) return;
    setError("");
    setSaving(true);
    const { error: err } = await upsertPublicationAuthor({
      ...(author ? { id: author.id } : {}),
      full_name: form.full_name,
      full_name_km: form.full_name_km,
      slug: effectiveSlug,
      photo_url: form.photo_url,
      position_title: form.position_title,
      affiliation_name: form.affiliation_name,
      bio: form.bio,
      bio_km: form.bio_km,
      research_interests: form.research_interests,
      orcid: form.orcid,
      email: form.email,
      website_url: form.website_url,
      google_scholar_url: form.google_scholar_url,
      research_gate_url: form.research_gate_url,
      is_published: form.is_published,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onSaved();
  };

  const profileUrl = `${SITE_URL}/authors/${effectiveSlug || "…"}`;

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-6" noValidate>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <FormSection
        title="Identity"
        description="Only the name is required. Everything else can be filled in later."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="af-full_name" error={issues.full_name}>
            {(p) => (
              <input
                {...p}
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. Sok Dara"
              />
            )}
          </Field>
          <Field
            label="Full name (Khmer)"
            htmlFor="af-full_name_km"
            hint="Leave blank if the author has no Khmer name."
          >
            {(p) => (
              <input
                {...p}
                lang="km"
                value={form.full_name_km}
                onChange={(e) => set("full_name_km", e.target.value)}
                placeholder="សុខ តារា"
              />
            )}
          </Field>
        </div>

        <Field
          label="Profile address"
          htmlFor="af-slug"
          error={issues.slug}
          hint={<span className="break-all">{profileUrl}</span>}
        >
          {(p) => (
            <input
              {...p}
              className={`${p.className} font-mono text-xs`}
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              placeholder="sok-dara"
            />
          )}
        </Field>

        {/* Photo. The preview is the control's own state, so a failed upload
            leaves the previous photo exactly where it was. */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-text-body">Profile photo</p>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-divider bg-paper">
              {form.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-7 w-7 text-text-muted" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                id="af-photo"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePhoto(file);
                }}
              />
              <label
                htmlFor="af-photo"
                className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition-colors hover:border-brand hover:text-brand"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                {uploading ? "Uploading…" : form.photo_url ? "Replace photo" : "Upload photo"}
              </label>
              {form.photo_url && (
                <button
                  type="button"
                  onClick={() => set("photo_url", "")}
                  className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-muted transition-colors hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            JPG, PNG, WebP or AVIF, up to 5 MB. Without one, the profile shows the author&apos;s
            initials.
          </p>
        </div>
      </FormSection>

      <FormSection
        title="Academic profile"
        description="Shown on the author's public page and beside their name on each article."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Position" htmlFor="af-position_title">
            {(p) => (
              <input
                {...p}
                value={form.position_title}
                onChange={(e) => set("position_title", e.target.value)}
                placeholder="e.g. Lecturer in Chemistry"
              />
            )}
          </Field>
          <Field label="Institution" htmlFor="af-affiliation_name">
            {(p) => (
              <input
                {...p}
                value={form.affiliation_name}
                onChange={(e) => set("affiliation_name", e.target.value)}
                placeholder="e.g. Royal University of Phnom Penh"
              />
            )}
          </Field>
        </div>

        <Field label="Biography" htmlFor="af-bio">
          {(p) => (
            <textarea
              {...p}
              rows={4}
              className={`${p.className} h-auto py-3 leading-relaxed`}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="A short academic biography. Blank lines start new paragraphs."
            />
          )}
        </Field>

        <Field label="Biography (Khmer)" htmlFor="af-bio_km">
          {(p) => (
            <textarea
              {...p}
              rows={3}
              lang="km"
              className={`${p.className} h-auto py-3 leading-relaxed`}
              value={form.bio_km}
              onChange={(e) => set("bio_km", e.target.value)}
              placeholder="ប្រវត្តិរូបសង្ខេបជាភាសាខ្មែរ"
            />
          )}
        </Field>

        <Field
          label="Research interests"
          htmlFor="af-research_interests"
          hint="Up to 12. Each becomes a link into the library's search."
        >
          {/* Uncontrolled by design — TagInput seeds from defaultTags and
              reports upward. `key` on the author id remounts it when the form
              switches records, which is what makes the editor show the right
              interests instead of the previous author's. */}
          <TagInput
            key={author?.id ?? "new"}
            name="research_interests"
            defaultTags={form.research_interests}
            max={12}
            label="Research interests"
            onChange={(next) => set("research_interests", next.slice(0, 12))}
            placeholder="Add an interest and press Enter"
          />
        </Field>
      </FormSection>

      <FormSection
        title="External profiles"
        description="Only well-formed addresses are published — a malformed one is refused here rather than becoming a dead link on the public page."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ORCID iD" htmlFor="af-orcid" error={issues.orcid}>
            {(p) => (
              <input
                {...p}
                className={`${p.className} font-mono text-xs`}
                value={form.orcid}
                onChange={(e) => set("orcid", e.target.value)}
                placeholder="0000-0002-1825-0097"
              />
            )}
          </Field>
          <Field
            label="Email"
            htmlFor="af-email"
            error={issues.email}
            hint="Kept for library records. Never published on the public profile."
          >
            {(p) => (
              <input
                {...p}
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            )}
          </Field>
          <Field label="Personal website" htmlFor="af-website_url" error={issues.website_url}>
            {(p) => (
              <input
                {...p}
                value={form.website_url}
                onChange={(e) => set("website_url", e.target.value)}
                placeholder="https://example.edu/~sokdara"
              />
            )}
          </Field>
          <Field
            label="Google Scholar"
            htmlFor="af-google_scholar_url"
            error={issues.google_scholar_url}
          >
            {(p) => (
              <input
                {...p}
                value={form.google_scholar_url}
                onChange={(e) => set("google_scholar_url", e.target.value)}
                placeholder="https://scholar.google.com/citations?user=…"
              />
            )}
          </Field>
          <Field
            label="ResearchGate"
            htmlFor="af-research_gate_url"
            error={issues.research_gate_url}
          >
            {(p) => (
              <input
                {...p}
                value={form.research_gate_url}
                onChange={(e) => set("research_gate_url", e.target.value)}
                placeholder="https://www.researchgate.net/profile/…"
              />
            )}
          </Field>
        </div>
      </FormSection>

      <FormSection title="Publishing">
        <Switch
          checked={form.is_published}
          onChange={(next) => set("is_published", next)}
          label="Public profile"
          description="Controls the author's own page — never their credit on an article."
          onDescription={
            <>
              Readers can open <span className="font-semibold">/authors/{effectiveSlug || "…"}</span> and
              see this profile.
            </>
          }
          offDescription={
            <>
              The profile page shows only the name and the list of works. The biography, photo and
              external links are withheld. This author still appears in every byline they earned —
              an authorship is a fact of the record, not a profile setting.
            </>
          }
        />
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="focus-field inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-divider px-4 text-sm font-medium text-text-body transition-colors hover:bg-paper"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isEdit ? "Save changes" : "Create author"}
        </button>
      </div>
    </form>
  );
}
