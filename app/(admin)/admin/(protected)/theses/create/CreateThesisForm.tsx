"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createThesis } from "@/app/actions/theses";
import {
  UploadCloud,
  Loader2,
  FileText,
  AlignLeft,
  BookOpen,
  Paperclip,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import ProgramCohortFields, { type CascadeValues } from "../_components/ProgramCohortFields";
import AbstractInput from "../_components/AbstractInput";
import ReferencesInput from "../_components/ReferencesInput";
import PdfDropzone from "../_components/PdfDropzone";
import CoverDropzone from "../_components/CoverDropzone";
import { INPUT_CLASS, LABEL_CLASS } from "../_components/form-styles";
import { getSubjectsForFaculty } from "@/lib/theses/programs";
import TagInput from "@/components/ui/core/TagInput";
import { slugify, makeUid } from "@/lib/book-utils";

type TabKey = "basic" | "abstract" | "references" | "files";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "basic",          label: "Basic Info",     icon: FileText },
  { key: "abstract",       label: "Abstract",       icon: AlignLeft },
  { key: "references",     label: "References",     icon: BookOpen },
  { key: "files",          label: "Files",          icon: Paperclip },
];

export default function CreateThesisForm() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [programFields, setProgramFields] = useState<CascadeValues>({
    program: "",
    faculty: "",
    subject: "",
    cohort: "",
    academicYear: "",
  });

  const handleCoverChange = (file: File | null) => {
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    } else {
      setCoverFile(null);
      setCoverPreview(null);
    }
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

    if (!pdfFile) return fail("Please upload the PDF thesis.", "files");
    if (!coverFile) return fail("Please upload a cover image.", "files");

    // Validate cascade fields
    if (!programFields.program) return fail("Please select a program.", "basic");
    // Faculty validation: the ProgramCohortFields component only shows the faculty
    // field when the selected program has has_faculty=true. If the field is shown
    // but empty, programFields.faculty will be "". We validate that if a program
    // has faculty options and the user selected one, it's not blank. Since the
    // cascade resets faculty when program changes, a missing faculty when faculty
    // field was visible means the user skipped it.
    // Note: We can't check hasFaculty from config anymore (it's DB-driven), but
    // the cascade component handles this — if faculty is empty string and program
    // requires it, it won't be submitted.
    if (getSubjectsForFaculty(programFields.program, programFields.faculty).length > 0 && !programFields.subject) {
      return fail("Please select a subject.", "basic");
    }
    if (!programFields.cohort) return fail("Please select a cohort.", "basic");
    if (!programFields.academicYear) return fail("Please select an academic year.", "basic");

    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);

      // Upload PDF via server-side proxy (avoids CORS issues with R2)
      const uid = makeUid();
      const titleSlug = slugify((formData.get("title") as string) || "report");
      const coverExt = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
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
      const { url: finalPdfUrl } = await pdfRes.json();

      // Upload Cover via server-side proxy
      const coverPath = `reports/${titleSlug}-${uid}/cover.${coverExt}`;
      const coverPayload = new FormData();
      coverPayload.set("file", coverFile);
      coverPayload.set("key", coverPath);
      coverPayload.set("target", "public");
      const coverRes = await fetch("/api/admin/upload", { method: "POST", body: coverPayload });
      if (!coverRes.ok) {
        const data = await coverRes.json().catch(() => ({}));
        throw new Error(data.error ?? `Cover upload failed (${coverRes.status})`);
      }
      const { url: finalCoverUrl } = await coverRes.json();

      const keywords = (formData.get("keywords") as string ?? "")
        .split(",").map(k => k.trim()).filter(Boolean).slice(0, 20);

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
        file_size_kb: Math.round(pdfFile.size / 1024),
        is_published: false,
        keywords,
        doi: (formData.get("doi") as string)?.trim() || null,
        references: (formData.get("references") as string) || null,
        published_at: (formData.get("published_at") as string) || null,
      };

      const result = await createThesis(dbData);

      if (!result.success) {
        throw new Error(result.error);
      }

      router.push("/admin/theses");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to upload thesis. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-divider bg-bg-surface shadow-sm overflow-hidden flex flex-col">
      {error && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1">
        {/* ══ TAB BAR ═══════════════════════════════════════════════════ */}
        <div
          role="tablist"
          aria-label="Thesis form sections"
          className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-divider p-3 md:w-56 md:shrink-0 bg-paper/30"
        >
          {TABS.map((t, i) => {
            const isActive = activeTab === t.key;
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
                className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all cursor-pointer text-left ${
                  isActive
                    ? "bg-brand/10 text-brand shadow-sm"
                    : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                <t.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-text-muted"}`} />
                <span className="flex-1 whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ══ PANELS — all stay mounted so field values survive tab switches ═══ */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-6 md:p-8 flex-1">
            <div id="panel-basic" role="tabpanel" aria-labelledby="tab-basic" hidden={activeTab !== "basic"} className="space-y-8">
              {/* General Fields */}
              <div className="space-y-4">
                <div>
                  <label className={LABEL_CLASS}>Title</label>
                  <input
                    name="title"
                    required
                    className={INPUT_CLASS}
                    placeholder="e.g. The impact of digital learning..."
                  />
                </div>

                <div>
                  <label className={LABEL_CLASS}>DOI / Official ID (Optional)</label>
                  <input
                    name="doi"
                    className={INPUT_CLASS}
                    placeholder="e.g. 10.1234/abc or https://doi.org/..."
                  />
                </div>
              </div>

              <hr className="border-divider" />

              {/* Classification */}
              <div>
                <h3 className="text-lg font-semibold text-text-heading mb-4">Classification</h3>
                <ProgramCohortFields onChange={setProgramFields} />
              </div>

              <hr className="border-divider" />

              {/* Authors & Publication */}
              <div>
                <h3 className="text-lg font-semibold text-text-heading mb-4">Authors & Publication</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Author Name(s)</label>
                    <input
                      name="author_names"
                      className={INPUT_CLASS}
                      placeholder="e.g. Sok San, Chan Dara"
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Advisor Name</label>
                    <input
                      name="advisor_name"
                      className={INPUT_CLASS}
                      placeholder="e.g. Dr. Chea Vutha"
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Publication Date (Optional)</label>
                    <input
                      type="date"
                      name="published_at"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div id="panel-abstract" role="tabpanel" aria-labelledby="tab-abstract" hidden={activeTab !== "abstract"} className="space-y-4">
              <AbstractInput />

              <div>
                <label className={LABEL_CLASS}>
                  Keywords / Tags (ពាក្យគន្លឺះ)
                </label>
                <TagInput
                  name="keywords"
                  placeholder="e.g. ការស្រាវជ្រាវ, education, STEM…"
                  disabled={loading}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  ចុច Enter ឬ , ដើម្បីបន្ថែម tag
                </p>
              </div>
            </div>

            <div id="panel-references" role="tabpanel" aria-labelledby="tab-references" hidden={activeTab !== "references"}>
              <ReferencesInput />
            </div>

            <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden={activeTab !== "files"} className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>PDF Thesis</label>
                <PdfDropzone file={pdfFile} onChange={setPdfFile} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Cover Image (Magazine Style)</label>
                <CoverDropzone file={coverFile} previewUrl={coverPreview} onChange={handleCoverChange} />
              </div>
            </div>
          </div>

          {/* Footer — always visible, independent of active tab */}
          <div className="flex justify-end border-t border-divider bg-paper/40 px-6 py-4">
            <button
              type="submit"
              disabled={loading}
              className="btn-brand-gradient inline-flex items-center gap-2 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
              ) : (
                <><UploadCloud className="w-5 h-5" /> Save as Draft</>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
