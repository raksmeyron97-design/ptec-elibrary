"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  IdCard,
  Info,
  Link as LinkIcon,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  UserCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { uploadToZima } from "@/app/actions/upload";
import { createTeamMember, updateTeamMember } from "../actions";
import type { TeamMemberRow, TeamSection, ProfileOption } from "../actions";
import MemberCard, { PALETTES } from "@/components/team/MemberCard";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import type { PublicTeamMember } from "@/lib/team/public";
import StoragePicker from "@/components/admin/storage/StoragePicker";
import type { StorageFile } from "@/lib/types/storage";
import StickyFormFooter from "./StickyFormFooter";
import { FormShell, FormTabs, type FormTab, type FormTabState } from "@/components/admin/kit/form";
import useAutoSave from "./useAutoSave";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SHORT_BIO_MAX = 300;
const BIO_RECOMMENDED = 600;

type Phase = "idle" | "uploading" | "saving";

type TabKey =
  | "identity"
  | "role"
  | "profile"
  | "bio"
  | "contact"
  | "account"
  | "publishing";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "identity", label: "Identity", icon: Camera },
  { key: "role", label: "Role & Section", icon: Briefcase },
  { key: "profile", label: "Public Profile", icon: IdCard },
  { key: "bio", label: "Biography", icon: FileText },
  { key: "contact", label: "Contact & Privacy", icon: ShieldCheck },
  { key: "account", label: "Account Link", icon: LinkIcon },
  { key: "publishing", label: "Publishing", icon: Settings2 },
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
  "h-12 w-full rounded-lg border border-divider px-4 text-sm outline-none transition disabled:bg-paper disabled:opacity-60";
const textareaCls =
  "w-full rounded-lg border border-divider p-3.5 text-sm outline-none transition disabled:bg-paper disabled:opacity-60";
const labelCls = "mb-1.5 block text-sm font-medium text-text-body";
const helpCls = "mt-1.5 text-xs text-text-muted";
const errorCls =
  "mt-1.5 flex items-center gap-1 text-xs font-semibold text-danger";

export default function TeamForm({
  initial,
  sections,
  profiles,
  pageTitle,
  pageDescription,
}: {
  initial?: TeamMemberRow;
  sections: TeamSection[];
  profiles: ProfileOption[];
  /*
    The form owns FormShell rather than the page, because the sticky aside is a
    live preview of this component's own state — a page-level `aside` prop
    could not see it without lifting every field into the route.
  */
  pageTitle: string;
  pageDescription: string;
}) {
  const isEdit = !!initial;
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("identity");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPreview, setShowPreview] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(
    () => new Set(["identity"]),
  );
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [submitAttempt, setSubmitAttempt] = useState(0);

  const [form, setForm] = useState<FormState>(() => initialState(initial));
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initialState(initial)),
  );

  const [photoPreview, setPhotoPreview] = useState<string | null>(
    initial?.photo_url ?? null,
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(initial?.photo_url ?? "");

  // User link
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const busy = phase !== "idle";
  const isDirty = JSON.stringify(form) !== savedSnapshot || photoFile !== null;

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setFieldErrors((prev) =>
        prev[key] ? { ...prev, [key]: undefined } : prev,
      );
    },
    [],
  );

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Auto-save draft every 30s on the edit flow (not new, to avoid orphan records).
  const autoSave = useAutoSave({
    isDirty,
    isEdit,
    busy,
    saveFn: async () => {
      await save(form.is_published);
    },
    onSaved: () => {
      toast.info("Draft saved automatically");
      setLastSaved(new Date());
    },
    onError: (msg) => toast.error(`Auto-save failed: ${msg}`),
  });

  const linkedProfile = useMemo(
    () => profiles.find((p) => p.id === form.user_id) ?? null,
    [profiles, form.user_id],
  );

  const filteredProfiles = useMemo(() => {
    if (!userSearch.trim()) return profiles.slice(0, 8);
    const q = userSearch.toLowerCase();
    return profiles
      .filter(
        (p) =>
          p.email.toLowerCase().includes(q) ||
          (p.full_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [profiles, userSearch]);

  const selectedSection =
    sections.find((s) => s.id === form.section_id) ?? null;

  // ── Live preview model ─────────────────────────────────────────────
  const previewMember: PublicTeamMember = useMemo(
    () => ({
      id: initial?.id ?? "preview",
      slug: initial?.slug ?? null,
      // The live preview never renders a"Last updated"line — the row has not
      // been saved yet, so there is no real edit timestamp to show.
      updated_at: null,
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
      responsibilities_km: form.responsibilities_km
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      responsibilities_en: form.responsibilities_en
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      languages: form.languages
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      working_hours: form.working_hours || null,
      is_featured: form.is_featured,
      display_order: Number(form.display_order) || 0,
      section_id: form.section_id || null,
      section_name_km: selectedSection?.name_km ?? null,
      section_name_en: selectedSection?.name_en ?? null,
      phone: form.show_phone_publicly && form.phone ? form.phone : null,
      email:
        form.show_email_publicly && linkedProfile ? linkedProfile.email : null,
    }),
    [
      form,
      photoPreview,
      selectedSection,
      linkedProfile,
      initial?.id,
      initial?.slug,
    ],
  );

  // ── Tab completeness (green check when key fields are filled) ──────
  const tabComplete: Record<TabKey, boolean> = {
    identity: !!form.name_km && !!form.name_en,
    role: !!(form.position_km || form.position_en) && !!form.section_id,
    profile: !!(
      form.short_bio_km ||
      form.short_bio_en ||
      form.responsibilities_km ||
      form.responsibilities_en
    ),
    bio: !!(form.bio_km || form.bio_en),
    contact: true,
    account: !!form.user_id,
    publishing: true,
  };

  const tabErrors: Record<TabKey, number> = useMemo(() => {
    const counts = {
      identity: 0,
      role: 0,
      profile: 0,
      bio: 0,
      contact: 0,
      account: 0,
      publishing: 0,
    };
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (!message) continue;
      const tab = FIELD_TAB[field as keyof FormState];
      if (tab) counts[tab] += 1;
    }
    return counts;
  }, [fieldErrors]);

  /*
    Three sources collapse into one badge: an error count, a completeness flag,
    and whether the author has opened the tab yet. `visitedTabs` is what keeps
    a fresh form quiet — a section is not "incomplete" before it has been seen,
    it is simply unvisited, and marking all seven at once on arrival was the
    thing that made the old rail read as a list of failures.
  */
  function tabState(key: TabKey): FormTabState {
    if (tabErrors[key] > 0) return "error";
    if (tabComplete[key] && visitedTabs.has(key)) return "complete";
    if (!visitedTabs.has(key)) return "optional";
    return "todo";
  }

  function tabStateLabel(key: TabKey): string | undefined {
    const state = tabState(key);
    if (state === "error") {
      return `has ${tabErrors[key]} ${tabErrors[key] === 1 ? "problem" : "problems"}`;
    }
    if (state === "complete") return "complete";
    if (state === "todo") return "not filled in";
    return undefined;
  }

  // ── Photo ──────────────────────────────────────────────────────────
  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Photo must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `Photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`,
      );
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
   * photoFile stays null and finalPhotoUrl (= photoUrl) is used as-is. */
  function handlePhotoFromStorage(file: StorageFile) {
    if (!file.url) return;
    setError(null);
    setPhotoFile(null);
    setPhotoPreview(file.url);
    setPhotoUrl(file.url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Tab switching with visit tracking ────────────────────────────────
  const activeTabIndex = TABS.findIndex((t) => t.key === activeTab);

  const switchTab = useCallback(
    (key: TabKey) => {
      if (tabErrors[activeTab] > 0 && key !== activeTab) {
        const currentTabLabel =
          TABS.find((t) => t.key === activeTab)?.label ?? "current";
        toast.warning(
          `Please fix the errors in the ${currentTabLabel} section before publishing.`,
        );
      }

      setActiveTab(key);
      setVisitedTabs((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [activeTab, tabErrors, toast],
  );


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
      errors.position_en =
        "Add a position in at least one language before publishing.";
    }
    return errors;
  }

  /** Validate a single field on blur. */
  function validateField(field: keyof FormState) {
    let errorMsg: string | undefined;
    switch (field) {
      case "name_km":
        if (!form.name_km.trim()) errorMsg = "Khmer name is required.";
        break;
      case "name_en":
        if (!form.name_en.trim()) errorMsg = "Latin name is required.";
        break;
      case "display_order": {
        const order = Number(form.display_order);
        if (!Number.isFinite(order) || order < 0)
          errorMsg = "Display order must be 0 or a positive number.";
        break;
      }
    }
    setFieldErrors((prev) => {
      if (prev[field] === errorMsg) return prev;
      return { ...prev, [field]: errorMsg };
    });
  }

  function focusFirstError(errors: FieldErrors) {
    const first = Object.keys(errors)[0] as keyof FormState | undefined;
    if (!first) return;
    const tab = FIELD_TAB[first];
    if (tab) {
      switchTab(tab);
      // Flash the tab red briefly for attention
      const tabEl = document.getElementById(`tab-${tab}`);
      if (tabEl) {
        tabEl.classList.add("animate-pulse");
        setTimeout(() => tabEl.classList.remove("animate-pulse"), 1000);
      }
    }
    // Wait for the tab panel to become visible before focusing.
    setTimeout(() => {
      const el = document.getElementById(`field-${first}`);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function save(publish: boolean) {
    setError(null);
    setSuccess(null);

    const errors = validate(publish);
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields before saving.");
      setSubmitAttempt((c) => c + 1);
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
        if ("error" in res)
          throw new Error(`Photo upload failed: ${res.error}`);
        finalPhotoUrl = res.publicUrl;
      }

      setPhase("saving");

      const payload = new FormData();
      const textFields: (keyof FormState)[] = [
        "name_km",
        "name_en",
        "photo_alt",
        "position_km",
        "position_en",
        "section_id",
        "education",
        "years_experience",
        "short_bio_km",
        "short_bio_en",
        "bio_km",
        "bio_en",
        "responsibilities_km",
        "responsibilities_en",
        "languages",
        "working_hours",
        "phone",
        "user_id",
        "display_order",
      ];
      for (const f of textFields) payload.set(f, String(form[f]));
      payload.set("photo_url", finalPhotoUrl);
      payload.set("is_published", String(publish));
      payload.set("is_featured", String(form.is_featured));
      payload.set("show_phone_publicly", String(form.show_phone_publicly));
      payload.set("show_email_publicly", String(form.show_email_publicly));

      const result =
        isEdit && initial
          ? await updateTeamMember(initial.id, payload)
          : await createTeamMember(payload);

      if ("error" in result) throw new Error(result.error);

      const savedForm = { ...form, is_published: publish };
      setForm(savedForm);
      setSavedSnapshot(JSON.stringify(savedForm));
      setPhotoFile(null);
      setPhotoUrl(finalPhotoUrl);
      setPhase("idle");
      setLastSaved(new Date());

      if (isEdit) {
        setSuccess(
          publish
            ? "Saved and published."
            : "Saved as draft (hidden from the public page).",
        );
      } else {
        router.push(
          `/admin/team?created=${encodeURIComponent(form.name_en.trim())}`,
        );
      }
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  const [cancelConfirm, setCancelConfirm] = useState(false);

  function handleCancel(e?: React.MouseEvent) {
    if (isDirty) {
      e?.preventDefault();
      setCancelConfirm(true);
    } else {
      router.push("/admin/team");
    }
  }

  const shortBioCount = (value: string) => (
    <span
      className={`text-[11px] ${value.length > SHORT_BIO_MAX ? "font-semibold text-danger" : "text-text-muted"}`}
    >
      {value.length}/{SHORT_BIO_MAX}
    </span>
  );

  // Check if form has errors for the submit animation
  const hasErrors = Object.keys(fieldErrors).length > 0;

  return (
    <FormShell
      backHref="/admin/team"
      backLabel="Back to Library Team"
      title={pageTitle}
      description={pageDescription}
      aside={
        /*
          The live public-card preview. It was a third column the page laid out
          itself; it is FormShell's sticky aside now, so it drops its own
          positioning and its lg: show/hide — FormShell stacks it under the form
          below the split breakpoint, which is what the accordion was faking.
        */
        <aside aria-label="Live preview of the public staff card">
          {/*
            On the split layout the preview is simply there. Below it, stacking a
            full card under a seven-section form buries the save bar, so on small
            screens it collapses to a disclosure — the spec's bottom accordion.
          */}
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            aria-controls="team-preview-body"
            className="focus-field mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-divider bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-body lg:hidden"
          >
            Public card preview
            {showPreview ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <div id="team-preview-body" className={showPreview ? "" : "hidden lg:block"}>
              <div className="bg-bg-surface rounded-xl shadow-sm border border-divider overflow-hidden">
                {/* Header */}
                <div className="bg-plate text-white px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">Preview</span>
                    <div className="group relative">
                      <Info className="h-3.5 w-3.5 cursor-help text-text-muted/70 hover:text-white transition" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-52 -translate-x-1/2 rounded-lg bg-plate px-3 py-2 text-[11px] leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        This preview updates as you type. Drafts are hidden from the
                        public site.
                        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-plate" />
                      </div>
                    </div>
                  </div>
                  {!form.is_published && (
                    <span className="bg-warning-soft text-warning-text text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      Draft
                    </span>
                  )}
                  {form.is_published && (
                    <span className="bg-success-soft text-success-text text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      Published
                    </span>
                  )}
                </div>

                {/* Card Body Container with pulse */}
                <div
                  className={`p-5 transition-all duration-300 ${
                    focusedField === "name" ||
                    focusedField === "position" ||
                    focusedField === "photo"
                      ? "ring-2 ring-admin-accent-line ring-inset"
                      : ""
                  }`}
                >
                  <MemberCard member={previewMember} palette={PALETTES[0]} preview />

                  {!form.is_published && (
                    <button
                      disabled
                      className="mt-4 w-full bg-admin-accent text-white text-sm font-medium py-2 rounded-lg opacity-50 cursor-not-allowed"
                    >
                      Draft (Hidden)
                    </button>
                  )}
                </div>

                <div className="px-4 py-3 bg-paper text-[11px] text-text-muted border-t border-divider">
                  This is how the card appears on the public Library Team page.
                  Contact details show only when approved.
                </div>
              </div>
          </div>
        </aside>
      }
    >
      {/*
        Top tabs, replacing the left rail. The rail was 240px of a 900px card
        for seven labels, and below `lg` it collapsed into a row of anonymous
        dots with the section name printed underneath — so a phone user had to
        read a caption to learn where they were. The tab row says it directly.
      */}
      <FormTabs
        idPrefix="team"
        ariaLabel="Team member form sections"
        active={activeTab}
        onChange={switchTab}
        tabs={TABS.map<FormTab<TabKey>>((tab) => ({
          key: tab.key,
          label: tab.label,
          icon: tab.icon,
          state: tabState(tab.key),
          stateLabel: tabStateLabel(tab.key),
        }))}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(form.is_published);
        }}
        noValidate
        style={
          submitAttempt > 0 && hasErrors
            ? { animation: "none", transform: "translate3d(0, 0, 0)" }
            : {}
        }
        ref={(el) => {
          if (el && submitAttempt > 0 && hasErrors) {
            el.style.animation = "";
            void el.offsetWidth; // trigger reflow
            el.classList.add("animate-shake");
          }
        }}
        className="min-w-0"
      >
        {/* Status banners */}
        {(error || success || busy || (hasErrors && phase === "idle")) && (
          <div className="px-8 pt-8 pb-4">
            {hasErrors && phase === "idle" && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text mb-6"
              >
                <AlertCircle className="h-5 w-5 text-danger shrink-0" />
                Please fix the validation errors in the form before saving.
              </div>
            )}
            {error && !hasErrors && (
              <div
                role="alert"
                className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text mb-6"
              >
                {error}
              </div>
            )}
            {success && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg border border-success-line bg-success-soft px-4 py-3 text-sm text-success-text mb-6"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}
            {busy && (
              <div className="flex items-center gap-3 rounded-lg border border-admin-accent-line bg-admin-accent-soft px-4 py-3 text-sm text-admin-accent-text mb-6">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-admin-accent border-t-transparent" />

                {phase === "uploading"
                  ? "Uploading photo to Zima Storage…"
                  : "Saving…"}
              </div>
            )}
          </div>
        )}

        {/* ══ PANELS ═══════════════════════════════════════════════════ */}
        <div className="p-8">
          {/* IDENTITY */}
          <div
            id="panel-identity"
            role="tabpanel"
            aria-labelledby="tab-identity"
            hidden={activeTab !== "identity"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-6 pb-2 border-b border-divider">
              Identity & Photo
            </h3>
            {/* Compact photo upload row */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-divider bg-paper">
                {photoPreview ? (
                  <Image
                    src={photoPreview}
                    alt="Preview of the selected photo"
                    fill
                    className="object-cover"
                    unoptimized={true}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-paper">
                    <UserCircle className="h-8 w-8 text-text-muted/70" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoPick}
                  disabled={busy}
                />
                <div className="flex flex-col gap-1 items-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="inline-flex cursor-pointer items-center text-xs font-medium text-admin-accent transition hover:text-admin-accent-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Upload photo
                  </button>
                  <StoragePicker
                    folder="team"
                    acceptExtensions={IMAGE_EXTENSIONS}
                    onSelect={handlePhotoFromStorage}
                    triggerClassName="inline-flex items-center text-xs font-medium text-text-body transition hover:text-text-heading disabled:cursor-not-allowed disabled:opacity-50"
                    triggerLabel="Choose from Storage"
                  />
                </div>
                <p className="mt-1.5 text-xs text-text-muted/70">
                  JPEG, PNG, WebP. Max 5MB.
                </p>
              </div>
              {photoPreview && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="shrink-0 cursor-pointer text-xs font-medium text-danger transition hover:text-danger-text"
                  aria-label="Remove photo"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Name fields */}
            <div className="grid gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label htmlFor="field-name_km" className={labelCls}>
                  ឈ្មោះពេញ ខ្មែរ{" "}
                  <span className="font-normal text-text-muted">
                    (Full Name Khmer)
                  </span>
                  <span className="text-danger"> *</span>
                </label>
                <input
                  id="field-name_km"
                  value={form.name_km}
                  onChange={(e) => set("name_km", e.target.value)}
                  onBlur={() => validateField("name_km")}
                  onFocus={() => setFocusedField("name")}
                  required
                  disabled={busy}
                  aria-invalid={!!fieldErrors.name_km}
                  aria-describedby={
                    fieldErrors.name_km ? "err-name_km" : undefined
                  }
                  className={`${inputCls} font-kh ${fieldErrors.name_km ? "border-danger" : ""}`}
                />
                {fieldErrors.name_km && (
                  <p id="err-name_km" className={errorCls}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {fieldErrors.name_km}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-name_en" className={labelCls}>
                  Full Name Latin{" "}
                  <span className="font-normal text-text-muted">
                    (ឈ្មោះពេញ ឡាតាំង)
                  </span>
                  <span className="text-danger"> *</span>
                </label>
                <input
                  id="field-name_en"
                  value={form.name_en}
                  onChange={(e) => set("name_en", e.target.value)}
                  onBlur={() => validateField("name_en")}
                  onFocus={() => setFocusedField("name")}
                  required
                  disabled={busy}
                  aria-invalid={!!fieldErrors.name_en}
                  aria-describedby={
                    fieldErrors.name_en ? "err-name_en" : undefined
                  }
                  className={`${inputCls} ${fieldErrors.name_en ? "border-danger" : ""}`}
                />
                {fieldErrors.name_en && (
                  <p id="err-name_en" className={errorCls}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {fieldErrors.name_en}
                  </p>
                )}
              </div>
            </div>

            {/* Accessibility */}
            <div className="mt-8">
              <h4 className="text-sm font-semibold text-text-heading uppercase tracking-wide mb-3">
                Accessibility
              </h4>
              <label htmlFor="field-photo_alt" className={labelCls}>
                Photo description{" "}
                <span className="font-normal text-text-muted">
                  (alt text, for screen readers)
                </span>
              </label>
              <textarea
                id="field-photo_alt"
                value={form.photo_alt}
                onChange={(e) => set("photo_alt", e.target.value)}
                disabled={busy}
                placeholder='e.g."Photo of Sokha, Head Librarian at PTEC Library"'
                className={`${textareaCls} min-h-[80px] resize-y`}
              />
              <p className={helpCls}>
                Leave blank to auto-generate from the name and position.
              </p>
            </div>
          </div>

          {/* ROLE & SECTION */}
          <div
            id="panel-role"
            role="tabpanel"
            aria-labelledby="tab-role"
            hidden={activeTab !== "role"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-6 pb-2 border-b border-divider">
              Role & Section
            </h3>
            <div className="grid gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label htmlFor="field-position_km" className={labelCls}>
                  មុខតំណែង{" "}
                  <span className="font-normal text-text-muted">
                    (Position Khmer)
                  </span>
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
                  Position{" "}
                  <span className="font-normal text-text-muted">(English)</span>
                </label>
                <input
                  id="field-position_en"
                  value={form.position_en}
                  onChange={(e) => set("position_en", e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Head Librarian"
                  onFocus={() => setFocusedField("position")}
                  aria-invalid={!!fieldErrors.position_en}
                  aria-describedby={
                    fieldErrors.position_en ? "err-position_en" : undefined
                  }
                  className={`${inputCls} ${fieldErrors.position_en ? "border-danger" : ""}`}
                />
                {fieldErrors.position_en && (
                  <p id="err-position_en" className={errorCls}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {fieldErrors.position_en}
                  </p>
                )}
              </div>
            </div>
            <p className={helpCls}>
              Fill the position in at least one language — visitors see it on
              the staff card.
            </p>

            <div className="mt-6">
              <label htmlFor="field-section_id" className={labelCls}>
                ផ្នែក / Section
                <span className="ml-2 font-normal text-text-muted">
                  (which team this person belongs to)
                </span>
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
                Recommended — members without a section appear under “Other
                Members” on the public page.
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => set("is_featured", !form.is_featured)}
                disabled={busy}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition disabled:opacity-60 sm:w-auto sm:pr-6 ${
                  form.is_featured
                    ? "border-warning-line bg-warning-soft text-warning-text"
                    : "border-divider bg-paper text-text-body hover:bg-paper"
                }`}
                aria-pressed={form.is_featured}
              >
                <Star
                  className={`h-4 w-4 ${form.is_featured ? "fill-current text-warning" : ""}`}
                />
                <span className="text-sm font-semibold">
                  {form.is_featured
                    ? "Featured — shown first as a Key Contact"
                    : "Feature as Key Contact"}
                </span>
              </button>
              <p className={helpCls}>
                Featured members appear at the top of the public page under “Key
                Contacts”.
              </p>
            </div>
          </div>

          {/* PUBLIC PROFILE */}
          <div
            id="panel-profile"
            role="tabpanel"
            aria-labelledby="tab-profile"
            hidden={activeTab !== "profile"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-2 pb-2 border-b border-divider">
              Public Profile
            </h3>
            <p className="mb-6 text-xs text-text-muted">
              Short, scannable content shown on the public staff card and
              profile. Keep it brief — the full biography lives on the next tab.
            </p>

            <div className="grid gap-6 sm:grid-cols-2 mb-6">
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    htmlFor="field-short_bio_km"
                    className="text-sm font-medium text-text-body"
                  >
                    ការទទួលខុសត្រូវសង្ខេប{" "}
                    <span className="font-normal text-text-muted">
                      (Short summary Khmer)
                    </span>
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
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    htmlFor="field-short_bio_en"
                    className="text-sm font-medium text-text-body"
                  >
                    Short summary{" "}
                    <span className="font-normal text-text-muted">
                      (English, 1–2 sentences)
                    </span>
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

            <div className="grid gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label
                  htmlFor="field-responsibilities_km"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  ភារកិច្ចទទួលខុសត្រូវ{" "}
                  <span className="font-normal text-text-muted">
                    (Responsibilities Khmer)
                  </span>
                </label>
                <textarea
                  id="field-responsibilities_km"
                  rows={4}
                  value={form.responsibilities_km}
                  onChange={(e) => set("responsibilities_km", e.target.value)}
                  disabled={busy}
                  className={`${textareaCls} font-kh`}
                />
                <p className={helpCls}>
                  One responsibility per line — shown as a list on the profile.
                </p>
              </div>
              <div>
                <label
                  htmlFor="field-responsibilities_en"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  Responsibilities{" "}
                  <span className="font-normal text-text-muted">(English)</span>
                </label>
                <textarea
                  id="field-responsibilities_en"
                  rows={4}
                  value={form.responsibilities_en}
                  onChange={(e) => set("responsibilities_en", e.target.value)}
                  disabled={busy}
                  placeholder={
                    "Maintain digital library platform\nHelp users access digital resources"
                  }
                  className={textareaCls}
                />
                <p className={helpCls}>
                  One responsibility per line, up to 12 items.
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-3 mb-6">
              <div>
                <label
                  htmlFor="field-education"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  កម្រិតសិក្សា{" "}
                  <span className="font-normal text-text-muted">
                    (Education)
                  </span>
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
                <label
                  htmlFor="field-years_experience"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  បទពិសោធន៍{" "}
                  <span className="font-normal text-text-muted">
                    (Experience)
                  </span>
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
                <label
                  htmlFor="field-working_hours"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  ម៉ោងធ្វើការ{" "}
                  <span className="font-normal text-text-muted">
                    (Working hours)
                  </span>
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

            <div className="mb-6">
              <label
                htmlFor="field-languages"
                className="text-sm font-medium text-text-body mb-1.5 block"
              >
                ភាសា{" "}
                <span className="font-normal text-text-muted">
                  (Languages — one per line)
                </span>
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
          <div
            id="panel-bio"
            role="tabpanel"
            aria-labelledby="tab-bio"
            hidden={activeTab !== "bio"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-2 pb-2 border-b border-divider">
              Biography
            </h3>
            <p className="mb-6 text-xs text-text-muted">
              The full biography appears in the profile dialog, not on the card.
              Recommended: 1–3 short paragraphs.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    htmlFor="field-bio_km"
                    className="text-sm font-medium text-text-body"
                  >
                    ប្រវត្តិសង្ខេប{" "}
                    <span className="font-normal text-text-muted">(Khmer)</span>
                  </label>
                  <span
                    className={`text-[11px] ${form.bio_km.length > BIO_RECOMMENDED ? "text-warning-text" : "text-text-muted"}`}
                  >
                    {form.bio_km.length} chars
                  </span>
                </div>
                <textarea
                  id="field-bio_km"
                  rows={6}
                  value={form.bio_km}
                  onChange={(e) => set("bio_km", e.target.value)}
                  disabled={busy}
                  onFocus={() => setFocusedField("bio")}
                  className={`${textareaCls} font-kh`}
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    htmlFor="field-bio_en"
                    className="text-sm font-medium text-text-body"
                  >
                    Full Bio{" "}
                    <span className="font-normal text-text-muted">
                      (English)
                    </span>
                  </label>
                  <span
                    className={`text-[11px] ${form.bio_en.length > BIO_RECOMMENDED ? "text-warning-text" : "text-text-muted"}`}
                  >
                    {form.bio_en.length} chars
                  </span>
                </div>
                <textarea
                  id="field-bio_en"
                  rows={6}
                  value={form.bio_en}
                  onChange={(e) => set("bio_en", e.target.value)}
                  disabled={busy}
                  onFocus={() => setFocusedField("bio")}
                  placeholder="Professional background, expertise, and how this person helps library users…"
                  className={textareaCls}
                />
              </div>
            </div>
            {(form.bio_km.length > BIO_RECOMMENDED ||
              form.bio_en.length > BIO_RECOMMENDED) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-warning-text">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Long biographies are fine in the profile dialog, but consider
                adding a Short summary (Public Profile tab) so the card stays
                scannable.
              </p>
            )}
          </div>

          {/* CONTACT & PRIVACY */}
          <div
            id="panel-contact"
            role="tabpanel"
            aria-labelledby="tab-contact"
            hidden={activeTab !== "contact"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-2 pb-2 border-b border-divider">
              Contact & Privacy
            </h3>
            <p className="mb-6 text-xs text-text-muted">
              Contact details are <strong>private by default</strong>. Visitors
              are always shown the official library contact channels; personal
              details appear only if you enable them below.
            </p>

            <div className="grid gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label
                  htmlFor="field-phone"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  ទូរស័ព្ទ{" "}
                  <span className="font-normal text-text-muted">(Phone)</span>
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

            <div className="space-y-4">
              <PrivacyToggle
                enabled={form.show_phone_publicly}
                onToggle={() =>
                  set("show_phone_publicly", !form.show_phone_publicly)
                }
                disabled={busy || !form.phone}
                label="Show phone on the public page"
                enabledNote="Phone number is visible to everyone"
                disabledNote={
                  form.phone
                    ? "Phone stays internal (admin only)"
                    : "Add a phone number first"
                }
              />
              {form.show_phone_publicly && (
                <p className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Only enable public phone if this number is approved for
                    public display. Personal numbers should stay private —
                    visitors can always reach the library desk.
                  </span>
                </p>
              )}

              <PrivacyToggle
                enabled={form.show_email_publicly}
                onToggle={() =>
                  set("show_email_publicly", !form.show_email_publicly)
                }
                disabled={busy || !linkedProfile}
                label="Show linked account email on the public page"
                enabledNote={
                  linkedProfile
                    ? `${linkedProfile.email} is visible to everyone`
                    : "Link an account first (Account Link tab)"
                }
                disabledNote={
                  linkedProfile
                    ? "Email stays internal (admin only)"
                    : "Link an account first (Account Link tab)"
                }
              />
            </div>
          </div>

          {/* ACCOUNT LINK */}
          <div
            id="panel-account"
            role="tabpanel"
            aria-labelledby="tab-account"
            hidden={activeTab !== "account"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-2 pb-2 border-b border-divider">
              Account Link
            </h3>
            <p className="mb-6 text-xs text-text-muted">
              Optional — linking a system account lets this person edit their
              own team profile and provides their email address. Leave blank if
              this person has no account.
            </p>

            {linkedProfile ? (
              <div className="flex items-center justify-between rounded-xl border border-admin-accent-line bg-admin-accent-soft px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-admin-accent-text">
                    {linkedProfile.full_name ?? "(No name)"}
                  </p>
                  <p className="text-xs text-admin-accent-text/80">
                    {linkedProfile.email}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-admin-accent">
                    ✓ Linked — email{" "}
                    {form.show_email_publicly
                      ? "shown publicly"
                      : "kept internal"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    set("user_id", "");
                    setUserSearch("");
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-admin-accent-line bg-bg-surface px-3 py-2 text-xs font-semibold text-text-body transition hover:text-danger hover:border-danger-line hover:bg-danger-soft"
                >
                  <X className="h-4 w-4" />
                  Unlink
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted/70" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setShowUserDropdown(true);
                    }}
                    onFocus={() => setShowUserDropdown(true)}
                    onBlur={() =>
                      setTimeout(() => setShowUserDropdown(false), 150)
                    }
                    placeholder="Search by name or email…"
                    disabled={busy}
                    aria-label="Search user accounts to link"
                    className={`${inputCls} pl-10`}
                  />
                </div>
                {showUserDropdown &&
                  (filteredProfiles.length > 0 ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-lg">
                      {filteredProfiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => {
                            set("user_id", p.id);
                            setUserSearch("");
                            setShowUserDropdown(false);
                          }}
                          className="flex w-full cursor-pointer flex-col items-start border-b border-divider px-4 py-3 text-left transition last:border-0 hover:bg-paper"
                        >
                          <span className="text-sm font-medium text-text-heading">
                            {p.full_name ?? "(No name)"}
                          </span>
                          <span className="text-xs text-text-muted">
                            {p.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : userSearch.trim() ? (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-divider bg-bg-surface px-4 py-3 text-sm text-text-muted shadow-lg">
                      No account matches “{userSearch.trim()}”. The person may
                      not have signed up yet — you can still save the profile
                      without a linked account.
                    </div>
                  ) : null)}
              </div>
            )}
          </div>

          {/* PUBLISHING */}
          <div
            id="panel-publishing"
            role="tabpanel"
            aria-labelledby="tab-publishing"
            hidden={activeTab !== "publishing"}
          >
            <h3 className="text-lg font-semibold text-text-heading mb-6 pb-2 border-b border-divider">
              Publishing
            </h3>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="field-display_order"
                  className="text-sm font-medium text-text-body mb-1.5 block"
                >
                  Display Order
                  <span className="ml-2 font-normal text-text-muted">
                    (lower = first)
                  </span>
                </label>
                <input
                  id="field-display_order"
                  type="number"
                  min="0"
                  value={form.display_order}
                  onChange={(e) => set("display_order", e.target.value)}
                  onBlur={() => validateField("display_order")}
                  disabled={busy}
                  aria-invalid={!!fieldErrors.display_order}
                  aria-describedby={
                    fieldErrors.display_order ? "err-display_order" : undefined
                  }
                  className={`${inputCls} ${fieldErrors.display_order ? "border-danger" : ""}`}
                />
                {fieldErrors.display_order && (
                  <p id="err-display_order" className={errorCls}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {fieldErrors.display_order}
                  </p>
                )}
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => set("is_published", !form.is_published)}
                  disabled={busy}
                  role="switch"
                  aria-checked={form.is_published}
                  className={`flex h-12 w-full cursor-pointer items-center gap-3 rounded-lg border px-4 transition disabled:opacity-60 ${
                    form.is_published
                      ? "border-success-line bg-success-soft text-success-text"
                      : "border-divider bg-paper text-text-body"
                  }`}
                >
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.is_published ? "bg-success" : "bg-divider"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg-surface shadow transition-transform ${form.is_published ? "translate-x-4" : "translate-x-0.5"}`}
                    />
                  </span>
                  <span className="text-sm font-semibold">
                    {form.is_published ? "Published" : "Draft (hidden)"}
                  </span>
                </button>
              </div>
            </div>

            {isEdit && initial && (
              <dl className="mt-8 grid gap-4 rounded-xl border border-divider bg-paper px-5 py-4 text-xs text-text-body sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-text-heading mb-1">
                    Created
                  </dt>
                  <dd>{new Date(initial.created_at).toLocaleString()}</dd>
                </div>
                {initial.updated_at && (
                  <div>
                    <dt className="font-semibold text-text-body">
                      Last updated
                    </dt>
                    <dd>{new Date(initial.updated_at).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>

        {/* Sticky footer — always visible, independent of active tab */}
        <StickyFormFooter
          activeTabIndex={activeTabIndex}
          totalTabs={TABS.length}
          onPrev={() => {
            if (activeTabIndex > 0) switchTab(TABS[activeTabIndex - 1].key);
          }}
          onNext={() => {
            if (activeTabIndex < TABS.length - 1)
              switchTab(TABS[activeTabIndex + 1].key);
          }}
          onSaveDraft={() => void save(false)}
          onSavePublish={() => void save(true)}
          onCancel={handleCancel}
          isDirty={isDirty}
          busy={busy}
          phase={phase}
          isPublished={form.is_published}
          lastSaved={lastSaved}
        />
        <ConfirmDialog
          open={cancelConfirm}
          title="Discard unsaved changes? "
          description="Your edits to this team member have not been saved and will be lost."
          confirmLabel="Discard changes"
          onCancel={() => setCancelConfirm(false)}
          onConfirm={() => {
            setCancelConfirm(false);
            router.push("/admin/team");
          }}
        />
      </form>
    </FormShell>
  );
}

function PrivacyToggle({
  enabled,
  onToggle,
  disabled,
  label,
  enabledNote,
  disabledNote,
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
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-divider"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg-surface shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </span>
      <span>
        <span
          className={`block text-sm font-semibold ${enabled ? "text-emerald-800" : "text-text-body"}`}
        >
          {label}
        </span>
        <span
          className={`block text-xs ${enabled ? "text-emerald-700" : "text-text-muted"}`}
        >
          {enabled ? enabledNote : disabledNote}
        </span>
      </span>
    </button>
  );
}
