"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateResearchReport } from "@/app/actions/research";
import {
  UploadCloud,
  Loader2,
  FileText,
  GraduationCap,
  Users,
  AlignLeft,
  BookOpen,
  Paperclip,
  AlertCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import ProgramCohortFields, { type CascadeValues } from "../../_components/ProgramCohortFields";
import AbstractInput from "../../_components/AbstractInput";
import ReferencesInput from "../../_components/ReferencesInput";
import PdfDropzone from "../../_components/PdfDropzone";
import CoverDropzone from "../../_components/CoverDropzone";
import { getProgram, getSubjectsForFaculty } from "@/lib/research/programs";
import TagInput from "@/components/ui/core/TagInput";
import { slugify, makeUid } from "@/lib/book-utils";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent";

type TabKey = "basic" | "classification" | "people" | "abstract" | "references" | "files";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "basic",          label: "Basic Info",     icon: FileText },
  { key: "classification", label: "Classification", icon: GraduationCap },
  { key: "people",         label: "Authors",        icon: Users },
  { key: "abstract",       label: "Abstract",       icon: AlignLeft },
  { key: "references",     label: "References",     icon: BookOpen },
  { key: "files",          label: "Files",          icon: Paperclip },
];

export default function EditReportForm({ report }: { report: any }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);

  // Initialize cascade from the stored report — legacy rows may have program=null
  const [programFields, setProgramFields] = useState<CascadeValues>({
    program: report.program ?? "",
    faculty: report.faculty ?? "",
    subject: report.subject ?? "",
    cohort: report.cohort ?? "",
    academicYear: report.academic_year ?? "",
  });

  const handleCoverChange = (file: File | null) => {
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
      setCoverRemoved(false);
    } else {
      setCoverFile(null);
      setCoverPreview(null);
    }
  };

  const handleCoverRemove = () => {
    setCoverRemoved(true);
    setCoverFile(null);
    setCoverPreview(null);
  };

  // ── Tab keyboard nav (left/right arrows while a tab is focused) ─────
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + dir + TABS.length) % TABS.length];
    setActiveTab(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }

  const fail = (msg: string, tab: TabKey) => {
    setError(msg);
    setActiveTab(tab);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // Validate cascade fields — require program before saving (even for legacy rows)
    if (!programFields.program) return fail("Please select a program before saving.", "classification");
    const programConfig = getProgram(programFields.program);
    if (programConfig?.hasFaculty && !programFields.faculty) {
      return fail("Please select a faculty/major.", "classification");
    }
    if (getSubjectsForFaculty(programFields.program, programFields.faculty).length > 0 && !programFields.subject) {
      return fail("Please select a subject.", "classification");
    }
    if (!programFields.cohort) return fail("Please select a cohort.", "classification");
    if (!programFields.academicYear) return fail("Please select an academic year.", "classification");

    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);

      let finalPdfUrl = report.file_url;
      let finalCoverUrl: string | null = coverRemoved ? null : report.cover_url;
      let fileSizeKb = report.file_size_kb;

      // Upload new PDF via server-side proxy if selected (avoids CORS issues with R2)
      if (pdfFile) {
        const uid = makeUid();
        const titleSlug = slugify((formData.get("title") as string) || "report");
        const pdfPath = `reports/${titleSlug}-${uid}/report.pdf`;
        const pdfPayload = new FormData();
        pdfPayload.set("file", pdfFile);
        pdfPayload.set("key", pdfPath);
        pdfPayload.set("target", "private");
        const pdfRes = await fetch("/api/admin/upload", { method: "POST", body: pdfPayload });
        if (!pdfRes.ok) {
          const data = await pdfRes.json().catch(() => ({}));
          throw new Error(data.error ?? `PDF upload failed (${pdfRes.status})`);
        }
        const { url: uploadedPdfUrl } = await pdfRes.json();
        finalPdfUrl = uploadedPdfUrl;
        fileSizeKb = Math.round(pdfFile.size / 1024);
      }

      // Upload new Cover via server-side proxy if selected (overrides remove)
      if (coverFile) {
        const coverUid = makeUid();
        const coverTitleSlug = slugify((formData.get("title") as string) || "report");
        const coverExt = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const coverPath = `reports/${coverTitleSlug}-${coverUid}/cover.${coverExt}`;
        const coverPayload = new FormData();
        coverPayload.set("file", coverFile);
        coverPayload.set("key", coverPath);
        coverPayload.set("target", "public");
        const coverRes = await fetch("/api/admin/upload", { method: "POST", body: coverPayload });
        if (!coverRes.ok) {
          const data = await coverRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Cover upload failed (${coverRes.status})`);
        }
        const { url: uploadedCoverUrl } = await coverRes.json();
        finalCoverUrl = uploadedCoverUrl;
      }

      const keywords = (formData.get("keywords") as string ?? "")
        .split(",").map(k => k.trim()).filter(Boolean).slice(0, 20);

      // Save to DB — cascade fields come from state (not FormData) to ensure reliability
      const dbData = {
        title: formData.get("title") as string,
        abstract: formData.get("abstract") as string,
        program: programFields.program || null,
        faculty: programFields.faculty || null,
        subject: programFields.subject || null,
        cohort: programFields.cohort,
        academic_year: programFields.academicYear,
        author_names: formData.get("author_names") as string,
        advisor_name: formData.get("advisor_name") as string,
        cover_url: finalCoverUrl,
        file_url: finalPdfUrl,
        file_size_kb: fileSizeKb,
        is_published: formData.get("is_published") === "true",
        keywords,
        doi: (formData.get("doi") as string)?.trim() || null,
        references: (formData.get("references") as string) || null,
        published_at: (formData.get("published_at") as string) || null,
      };

      const result = await updateResearchReport(report.id, dbData);

      if (!result.success) {
        throw new Error(result.error);
      }

      router.push("/admin/research-reports");
      router.refresh();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to update report. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
      {error && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      {/* Warn when editing a legacy report that has no program set */}
      {!report.program && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p>This report was created before the program field was added. Please select a Program before saving.</p>
        </div>
      )}

      {/* ══ TAB BAR ═══════════════════════════════════════════════════ */}
      <div
        role="tablist"
        aria-label="Research report form sections"
        className="flex gap-1 overflow-x-auto border-b border-divider px-3 pt-3"
      >
        {TABS.map((t, i) => {
          const isActive = activeTab === t.key;
          const needsAttention = t.key === "classification" && !report.program;
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
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition cursor-pointer ${
                isActive
                  ? "border-brand bg-brand/5 text-brand"
                  : "border-transparent text-text-muted hover:bg-paper hover:text-text-body"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {needsAttention && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>

      {/* ══ PANELS — all stay mounted so field values survive tab switches ═══ */}
      <div className="p-6">
        <div id="panel-basic" role="tabpanel" aria-labelledby="tab-basic" hidden={activeTab !== "basic"} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Title</label>
            <input
              name="title"
              defaultValue={report.title}
              required
              className={INPUT_CLASS}
              placeholder="e.g. The impact of digital learning..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">DOI / Official ID (Optional)</label>
            <input
              name="doi"
              defaultValue={report.doi ?? ""}
              className={INPUT_CLASS}
              placeholder="e.g. 10.1234/abc or https://doi.org/..."
            />
          </div>
        </div>

        <div id="panel-classification" role="tabpanel" aria-labelledby="tab-classification" hidden={activeTab !== "classification"}>
          {/* ProgramCohortFields handles legacy values (stored values not in config)
              by appending them as selectable options so data is never silently lost. */}
          <ProgramCohortFields
            defaultValues={{
              program: report.program,
              faculty: report.faculty,
              subject: report.subject,
              cohort: report.cohort,
              academicYear: report.academic_year,
            }}
            onChange={setProgramFields}
          />
        </div>

        <div id="panel-people" role="tabpanel" aria-labelledby="tab-people" hidden={activeTab !== "people"}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">Author Name(s)</label>
              <input
                name="author_names"
                defaultValue={report.author_names}
                className={INPUT_CLASS}
                placeholder="e.g. Sok San, Chan Dara"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">Advisor Name</label>
              <input
                name="advisor_name"
                defaultValue={report.advisor_name}
                className={INPUT_CLASS}
                placeholder="e.g. Dr. Chea Vutha"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">Publication Date (Optional)</label>
              <input
                type="date"
                name="published_at"
                defaultValue={report.published_at ? report.published_at.substring(0, 10) : ""}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">Status</label>
              <select
                name="is_published"
                defaultValue={report.is_published ? "true" : "false"}
                className={`${INPUT_CLASS} bg-bg-surface`}
              >
                <option value="true">Published</option>
                <option value="false">Draft</option>
              </select>
            </div>
          </div>
        </div>

        <div id="panel-abstract" role="tabpanel" aria-labelledby="tab-abstract" hidden={activeTab !== "abstract"} className="space-y-4">
          <AbstractInput defaultValue={report.abstract} />

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">
              Keywords / Tags (ពាក្យគន្លឺះ)
            </label>
            <TagInput
              name="keywords"
              defaultTags={report.keywords ?? []}
              placeholder="e.g. ការស្រាវជ្រាវ, education, STEM…"
              disabled={loading}
            />
            <p className="mt-1 text-[11px] text-text-muted">
              ចុច Enter ឬ , ដើម្បីបន្ថែម tag
            </p>
          </div>
        </div>

        <div id="panel-references" role="tabpanel" aria-labelledby="tab-references" hidden={activeTab !== "references"}>
          <ReferencesInput defaultValue={report.references ?? ""} />
        </div>

        <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden={activeTab !== "files"} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">PDF Report</label>
            <PdfDropzone
              file={pdfFile}
              onChange={setPdfFile}
              existingLabel={report.file_url ? "Current PDF attached" : "PDF files only"}
              actionLabel="Click to upload"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Cover Image</label>
            <CoverDropzone
              file={coverFile}
              previewUrl={coverPreview}
              existingUrl={report.cover_url}
              removed={coverRemoved}
              onChange={handleCoverChange}
              onRemove={handleCoverRemove}
            />
          </div>
        </div>
      </div>

      {/* Footer — always visible, independent of active tab */}
      <div className="flex justify-end gap-3 border-t border-divider bg-paper/40 px-6 py-4">
        <button
          type="button"
          onClick={() => router.push("/admin/research-reports")}
          className="inline-flex items-center gap-2 bg-paper text-text-body border border-divider px-6 py-2.5 rounded-lg font-medium hover:bg-bg-surface transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn-brand-gradient inline-flex items-center gap-2 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
          ) : (
            <><UploadCloud className="w-5 h-5" /> Save Changes</>
          )}
        </button>
      </div>
    </form>
  );
}
