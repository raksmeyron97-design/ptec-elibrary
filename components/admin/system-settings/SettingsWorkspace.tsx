"use client";

// /admin/system-settings workspace shell: section navigation, the five
// settings forms, the draft → publish action bar, overview and version
// history. All mutations go through app/actions/system-settings.ts which
// re-checks authorization server-side — this UI is presentation only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Globe,
  History,
  LayoutDashboard,
  Phone,
  Search as SearchIcon,
  TriangleAlert,
} from "lucide-react";
import type {
  AnySectionDoc,
  FieldError,
  SectionDocMap,
  SettingSection,
  SettingsWorkspaceData,
} from "@/lib/system-settings/types";
import { SETTING_SECTIONS } from "@/lib/system-settings/types";
import { ConfirmDialog } from "@/components/admin/kit";
import { diffPaths, validateSectionDoc } from "@/lib/system-settings/schemas";
import {
  discardSettingsDraft,
  publishSettingsSection,
  rollbackSettingsSection,
  saveSettingsDraft,
} from "@/app/actions/system-settings";
import OverviewPanel, { sectionLabel } from "./OverviewPanel";
import VersionsPanel from "./VersionsPanel";
import {
  ContactForm,
  HoursForm,
  LinksForm,
  OrganizationForm,
  SeoForm,
} from "./SectionForms";

type View = SettingSection | "overview" | "versions";

const VIEW_ICONS: Record<View, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  organization: Building2,
  contact: Phone,
  hours: CalendarClock,
  links: Globe,
  seo: SearchIcon,
  versions: History,
};

function isView(v: string | null): v is View {
  return (
    v === "overview" ||
    v === "versions" ||
    (SETTING_SECTIONS as readonly string[]).includes(v ?? "")
  );
}

/** Deep-clone a section doc so form edits never mutate server props. */
function clone<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

function initialDocs(data: SettingsWorkspaceData): SectionDocMap {
  return Object.fromEntries(
    SETTING_SECTIONS.map((s) => [
      s,
      clone(data.sections[s].draft ?? data.sections[s].published),
    ]),
  ) as SectionDocMap;
}

export default function SettingsWorkspace({ data }: { data: SettingsWorkspaceData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view");

  const [view, setView] = useState<View>(isView(initialView) ? initialView : "overview");
  const [docs, setDocs] = useState<SectionDocMap>(() => initialDocs(data));
  const [errors, setErrors] = useState<Partial<Record<SettingSection, FieldError[]>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [publishConfirm, setPublishConfirm] = useState<SettingSection | null>(null);
  const [publishComment, setPublishComment] = useState("");

  const editable = data.canWrite && data.storageReady;

  const navigate = useCallback((next: View) => {
    setView(next);
    setNotice(null);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  /** Baseline = what is persisted server-side (draft if present, else published). */
  const isDirty = useCallback(
    (section: SettingSection): boolean => {
      const baseline = data.sections[section].draft ?? data.sections[section].published;
      return diffPaths(baseline, docs[section]).length > 0;
    },
    [data.sections, docs],
  );

  const anyDirty = useMemo(
    () => SETTING_SECTIONS.some((s) => isDirty(s)),
    [isDirty],
  );

  // Don't lose unsaved edits to an accidental tab close.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const setDoc = useCallback((section: SettingSection, doc: AnySectionDoc) => {
    setDocs((prev) => ({ ...prev, [section]: doc }));
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const runSave = useCallback(
    async (section: SettingSection): Promise<boolean> => {
      const local = validateSectionDoc(section, docs[section]);
      if (!local.ok) {
        setErrors((prev) => ({ ...prev, [section]: local.errors }));
        setNotice({ kind: "error", text: "Please fix the highlighted fields before saving." });
        return false;
      }
      const result = await saveSettingsDraft(section, local.value);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [section]: result.fieldErrors ?? [] }));
        setNotice({ kind: "error", text: result.error });
        return false;
      }
      // Persist the normalized document locally (phones formatted, trims applied).
      setDocs((prev) => ({ ...prev, [section]: local.value }));
      setErrors((prev) => ({ ...prev, [section]: [] }));
      return true;
    },
    [docs],
  );

  const handleSaveDraft = useCallback(
    async (section: SettingSection) => {
      setBusy(true);
      try {
        if (await runSave(section)) {
          setNotice({ kind: "success", text: "Draft saved. The public site is unchanged until you publish." });
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [router, runSave],
  );

  const [discardTarget, setDiscardTarget] = useState<SettingSection | null>(null);

  const handleDiscard = useCallback(
    async (section: SettingSection) => {
      setDiscardTarget(null);
      setBusy(true);
      try {
        const result = await discardSettingsDraft(section);
        if (result.ok) {
          setDocs((prev) => ({ ...prev, [section]: clone(data.sections[section].published) }));
          setErrors((prev) => ({ ...prev, [section]: [] }));
          setNotice({ kind: "success", text: "Draft discarded." });
          router.refresh();
        } else {
          setNotice({ kind: "error", text: result.error });
        }
      } finally {
        setBusy(false);
      }
    },
    [data.sections, router],
  );

  const handlePublish = useCallback(
    async (section: SettingSection) => {
      setBusy(true);
      try {
        // One-click flow: persist current edits as the draft, then publish it.
        if (!(await runSave(section))) return;
        const result = await publishSettingsSection(section, {
          expectedVersion: data.sections[section].publishedVersion,
          comment: publishComment,
        });
        if (result.ok) {
          // A cache-purge failure means the version IS live but visitors still
          // see the old values — never dress that up as a clean success.
          setNotice(
            result.cacheWarning
              ? { kind: "error", text: `Published version ${result.publishedVersion}. ${result.cacheWarning}` }
              : {
                  kind: "success",
                  text: `Published version ${result.publishedVersion}. Public pages update within moments.`,
                },
          );
          setPublishConfirm(null);
          setPublishComment("");
          router.refresh();
        } else {
          setErrors((prev) => ({ ...prev, [section]: result.fieldErrors ?? prev[section] ?? [] }));
          setNotice({ kind: "error", text: result.error });
          setPublishConfirm(null);
        }
      } finally {
        setBusy(false);
      }
    },
    [data.sections, publishComment, router, runSave],
  );

  const handleRollback = useCallback(
    async (section: SettingSection, version: number) => {
      setBusy(true);
      try {
        const result = await rollbackSettingsSection(section, version);
        if (result.ok) {
          setDocs((prev) => ({ ...prev, [section]: prev[section] }));
          setNotice(
            result.cacheWarning
              ? {
                  kind: "error",
                  text: `Restored ${sectionLabel(section)} v${version} as new version ${result.publishedVersion}. ${result.cacheWarning}`,
                }
              : {
                  kind: "success",
                  text: `Restored ${sectionLabel(section)} v${version} as new version ${result.publishedVersion}.`,
                },
          );
          router.refresh();
        } else {
          setNotice({ kind: "error", text: result.error });
        }
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const navItems: View[] = ["overview", ...SETTING_SECTIONS, "versions"];
  const isSection = view !== "overview" && view !== "versions";
  const section = isSection ? (view as SettingSection) : null;

  const changedVsPublished = section
    ? diffPaths(data.sections[section].published, docs[section])
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
          Admin <span aria-hidden="true">/</span>{" "}
          <span className="font-semibold text-slate-700">System Settings</span>
        </nav>
        <h1 className="mt-1 text-xl font-bold text-text-heading">System Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The single source of truth for global website information — organization names,
          contacts, opening hours, links and SEO defaults. Changes go live only when published.
        </p>
      </div>

      {/* Setup / permission banners */}
      {!data.storageReady && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Settings storage is not ready</p>
            <p className="mt-0.5">
              Apply <code className="font-mono text-[12px]">supabase/migrations/0098_system_settings.sql</code> to
              enable editing. Until then the site serves the built-in defaults shown below, read-only.
            </p>
          </div>
        </div>
      )}
      {data.storageReady && !data.canWrite && (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800" role="status">
          You have view-only access. Ask a super administrator for the
          “System Settings” write permission to make changes.
        </div>
      )}

      {/* Notice */}
      <div aria-live="polite">
        {notice && (
          <div
            className={`mb-5 flex items-center gap-2.5 rounded-2xl border p-3.5 text-sm ${
              notice.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {notice.text}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Settings navigation */}
        <nav aria-label="Settings sections" className="lg:w-56 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {navItems.map((item) => {
              const Icon = VIEW_ICONS[item];
              const active = view === item;
              const label =
                item === "overview" ? "Overview" : item === "versions" ? "Versions" : sectionLabel(item);
              const sectionState =
                item !== "overview" && item !== "versions" ? data.sections[item] : null;
              const dirty = sectionState ? isDirty(item as SettingSection) : false;
              const hasDraft = sectionState?.draft != null;
              return (
                <li key={item} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(item)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-brand/10 text-brand"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">{label}</span>
                    {(dirty || hasDraft) && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                        title={dirty ? "Unsaved changes" : "Draft pending publish"}
                      >
                        <span className="sr-only">
                          {dirty ? "Unsaved changes" : "Draft pending publish"}
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {view === "overview" && <OverviewPanel data={data} onNavigate={navigate} />}
          {view === "versions" && (
            <VersionsPanel data={data} busy={busy} onRollback={handleRollback} />
          )}

          {section && (
            <div className="pb-24">
              {section === "organization" && (
                <OrganizationForm
                  doc={docs.organization}
                  onChange={(d) => setDoc("organization", d)}
                  errors={errors.organization ?? []}
                  disabled={!editable || busy}
                />
              )}
              {section === "contact" && (
                <ContactForm
                  doc={docs.contact}
                  onChange={(d) => setDoc("contact", d)}
                  errors={errors.contact ?? []}
                  disabled={!editable || busy}
                />
              )}
              {section === "hours" && (
                <HoursForm
                  doc={docs.hours}
                  onChange={(d) => setDoc("hours", d)}
                  errors={errors.hours ?? []}
                  disabled={!editable || busy}
                />
              )}
              {section === "links" && (
                <LinksForm
                  doc={docs.links}
                  onChange={(d) => setDoc("links", d)}
                  errors={errors.links ?? []}
                  disabled={!editable || busy}
                />
              )}
              {section === "seo" && (
                <SeoForm
                  doc={docs.seo}
                  onChange={(d) => setDoc("seo", d)}
                  errors={errors.seo ?? []}
                  disabled={!editable || busy}
                />
              )}

              {/* Sticky action bar */}
              <div className="sticky bottom-0 z-10 -mx-1 mt-6 rounded-2xl border border-divider bg-bg-surface/95 p-3.5 shadow-lg backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 text-xs text-slate-500">
                    {isDirty(section) ? (
                      <span className="font-semibold text-amber-600">● Unsaved changes</span>
                    ) : data.sections[section].draft ? (
                      <span className="font-semibold text-amber-600">
                        Draft saved
                        {data.sections[section].draftSavedBy &&
                          ` by ${data.actorNames[data.sections[section].draftSavedBy!] ?? "Unknown"}`}{" "}
                        — not yet published
                      </span>
                    ) : (
                      <span>
                        In sync with published version {data.sections[section].publishedVersion || "—"}
                      </span>
                    )}
                    {changedVsPublished.length > 0 && (
                      <span className="ml-2">
                        · {changedVsPublished.length} field
                        {changedVsPublished.length === 1 ? "" : "s"} differ from live
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {(data.sections[section].draft || isDirty(section)) && (
                      <button
                        type="button"
                        disabled={!editable || busy}
                        onClick={() => setDiscardTarget(section)}
                        className="rounded-xl border border-divider px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Discard draft
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!editable || busy || !isDirty(section)}
                      onClick={() => handleSaveDraft(section)}
                      title={!isDirty(section) ? "No changes to save" : undefined}
                      className="rounded-xl border border-brand/30 bg-brand/5 px-3.5 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Save draft"}
                    </button>
                    <button
                      type="button"
                      disabled={!editable || busy || changedVsPublished.length === 0}
                      onClick={() => setPublishConfirm(section)}
                      title={
                        changedVsPublished.length === 0
                          ? "Nothing differs from the published version"
                          : undefined
                      }
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-contrast shadow-sm transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Publish
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publish confirmation dialog */}
      {publishConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-dialog-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="publish-dialog-title" className="text-base font-bold text-text-heading">
              Publish {sectionLabel(publishConfirm)}?
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              This updates the live website immediately for all visitors and records version{" "}
              {data.sections[publishConfirm].publishedVersion + 1} in the history.
            </p>
            {changedVsPublished.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Changing {changedVsPublished.length} field{changedVsPublished.length === 1 ? "" : "s"}
                </p>
                <p className="mt-1 break-words font-mono text-[11px] text-slate-600">
                  {changedVsPublished.join(", ")}
                </p>
              </div>
            )}
            <label htmlFor="publish-comment" className="mt-4 block text-[13px] font-semibold text-slate-700">
              Comment <span className="font-normal text-slate-400">(optional, shown in history)</span>
            </label>
            <input
              id="publish-comment"
              type="text"
              value={publishComment}
              maxLength={500}
              onChange={(e) => setPublishComment(e.target.value)}
              placeholder="e.g. Updated Saturday hours for the new term"
              className="mt-1 w-full rounded-xl border border-divider px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPublishConfirm(null)}
                className="rounded-xl border border-divider px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handlePublish(publishConfirm)}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-contrast hover:bg-brand/90 disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish now"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={discardTarget !== null}
        title="Discard this draft?"
        description="The draft will be discarded and the section returns to the published values."
        confirmLabel="Discard draft"
        busyLabel="Discarding…"
        busy={busy}
        onCancel={() => setDiscardTarget(null)}
        onConfirm={() => discardTarget && void handleDiscard(discardTarget)}
      />
    </div>
  );
}
