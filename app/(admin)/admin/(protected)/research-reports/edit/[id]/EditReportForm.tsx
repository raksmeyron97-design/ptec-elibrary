"use client"
/* eslint-disable @next/next/no-img-element */

 
;
/* eslint-disable @typescript-eslint/no-explicit-any */


import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateResearchReport } from "@/app/actions/research";
import { UploadCloud, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import ProgramCohortFields, { type CascadeValues } from "../../_components/ProgramCohortFields";
import AbstractInput from "../../_components/AbstractInput";
import ReferencesInput from "../../_components/ReferencesInput";
import { getProgram, getSubjectsForFaculty } from "@/lib/research/programs";
import { slugify, makeUid } from "@/lib/book-utils";

export default function EditReportForm({ report }: { report: any }) {
  const router = useRouter();
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

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const url = URL.createObjectURL(file);
      setCoverPreview(url);
    } else {
      setCoverFile(null);
      setCoverPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // Validate cascade fields — require program before saving (even for legacy rows)
    if (!programFields.program) {
      setError("Please select a program before saving.");
      return;
    }
    const programConfig = getProgram(programFields.program);
    if (programConfig?.hasFaculty && !programFields.faculty) {
      setError("Please select a faculty/major.");
      return;
    }
    if (getSubjectsForFaculty(programFields.program, programFields.faculty).length > 0 && !programFields.subject) {
      setError("Please select a subject.");
      return;
    }
    if (!programFields.cohort) {
      setError("Please select a cohort.");
      return;
    }
    if (!programFields.academicYear) {
      setError("Please select an academic year.");
      return;
    }

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
    <form onSubmit={handleSubmit} className="bg-bg-surface p-6 rounded-xl border border-divider space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Warn when editing a legacy report that has no program set */}
      {!report.program && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This report was created before the program field was added. Please select a Program before saving.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Title</label>
            <input
              name="title"
              defaultValue={report.title}
              required
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
              placeholder="e.g. The impact of digital learning..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">DOI / Official ID (Optional)</label>
            <input
              name="doi"
              defaultValue={report.doi ?? ""}
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
              placeholder="e.g. 10.1234/abc or https://doi.org/..."
            />
          </div>

          {/* Program → Faculty → Cohort → Academic Year cascade
              ProgramCohortFields handles legacy values (stored values not in config)
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

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Author Name(s)</label>
            <input
              name="author_names"
              defaultValue={report.author_names}
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
              placeholder="e.g. Sok San, Chan Dara"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Advisor Name</label>
            <input
              name="advisor_name"
              defaultValue={report.advisor_name}
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
              placeholder="e.g. Dr. Chea Vutha"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Publication Date (Optional)</label>
            <input
              type="date"
              name="published_at"
              defaultValue={report.published_at ? report.published_at.substring(0, 10) : ""}
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Status</label>
            <select
              name="is_published"
              defaultValue={report.is_published ? "true" : "false"}
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-bg-surface"
            >
              <option value="true">Published</option>
              <option value="false">Draft</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <AbstractInput defaultValue={report.abstract} />

          <ReferencesInput defaultValue={report.references ?? ""} />

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">PDF Report</label>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-divider bg-paper rounded-lg cursor-pointer hover:border-brand transition-colors relative overflow-hidden">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <FileText className="w-8 h-8 text-brand mb-2" />
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-brand">Click to replace</span> or drag and drop
                </p>
                <p className="text-xs text-text-muted/70 mt-1">
                  {pdfFile ? pdfFile.name : (report.file_url ? "Current PDF attached" : "PDF files only")}
                </p>
              </div>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-text-body">Cover Image</label>
              {(report.cover_url || coverPreview) && !coverRemoved && (
                <button
                  type="button"
                  onClick={() => { setCoverRemoved(true); setCoverFile(null); setCoverPreview(null); }}
                  className="text-xs text-red-500 hover:text-red-600 transition-colors"
                >
                  Remove cover
                </button>
              )}
            </div>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-divider bg-paper rounded-lg cursor-pointer hover:border-brand transition-colors relative overflow-hidden">
              {!coverPreview && !coverRemoved && report.cover_url && (
                <img src={report.cover_url} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover opacity-20" />
              )}
              {coverPreview && (
                <img src={coverPreview} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover opacity-20" />
              )}
              <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                <ImageIcon className="w-8 h-8 text-brand mb-2" />
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-brand">Click to {coverRemoved ? "add" : "replace"}</span> or drag and drop
                </p>
                <p className="text-xs text-text-muted/70 mt-1">
                  {coverFile ? coverFile.name : coverRemoved ? "No cover (will be removed)" : (report.cover_url ? "Current cover attached" : "PNG, JPG, WEBP")}
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { handleCoverChange(e); setCoverRemoved(false); }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-divider flex justify-end gap-3">
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
          className="inline-flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
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
