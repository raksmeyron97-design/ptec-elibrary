"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createResearchReport } from "@/app/actions/research";
import { UploadCloud, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import ProgramCohortFields, { type CascadeValues } from "../_components/ProgramCohortFields";
import AbstractInput from "../_components/AbstractInput";
import ReferencesInput from "../_components/ReferencesInput";
import { getProgram, getSubjectsForFaculty } from "@/lib/research/programs";
import TagInput from "@/components/ui/core/TagInput";

export default function CreateReportForm() {
  const router = useRouter();
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

    if (!pdfFile) {
      setError("Please upload the PDF report.");
      return;
    }

    if (!coverFile) {
      setError("Please upload a cover image.");
      return;
    }

    // Validate cascade fields
    if (!programFields.program) {
      setError("Please select a program.");
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

      // Upload PDF via server-side proxy (avoids CORS issues with R2)
      const pdfPath = `reports/pdfs/${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
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
      const coverPath = `reports/covers/${Date.now()}-${coverFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
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

      const result = await createResearchReport(dbData);

      if (!result.success) {
        throw new Error(result.error);
      }

      router.push("/admin/research-reports");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to upload report. Please try again.");
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Title</label>
            <input
              name="title"
              required
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
              placeholder="e.g. The impact of digital learning..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">DOI / Official ID (Optional)</label>
            <input
              name="doi"
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
              placeholder="e.g. 10.1234/abc or https://doi.org/..."
            />
          </div>

          {/* Program → Faculty → Cohort → Academic Year cascade */}
          <ProgramCohortFields onChange={setProgramFields} />

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Author Name(s)</label>
            <input
              name="author_names"
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
              placeholder="e.g. Sok San, Chan Dara"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Advisor Name</label>
            <input
              name="advisor_name"
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
              placeholder="e.g. Dr. Chea Vutha"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Publication Date (Optional)</label>
            <input
              type="date"
              name="published_at"
              className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
            />
          </div>
        </div>

        <div className="space-y-4">
          <AbstractInput />

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">
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

          <ReferencesInput />

          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">PDF Report</label>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-divider bg-paper rounded-lg cursor-pointer hover:border-brand transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <FileText className="w-8 h-8 text-brand mb-2" />
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-brand">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-text-muted/70 mt-1">{pdfFile ? pdfFile.name : "PDF files only"}</p>
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
            <label className="block text-sm font-semibold text-text-body mb-1.5">Cover Image (Magazine Style)</label>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-divider bg-paper rounded-lg cursor-pointer hover:border-brand transition-colors relative overflow-hidden">
              {coverPreview && (
                <img src={coverPreview} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover opacity-20" />
              )}
              <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                <ImageIcon className="w-8 h-8 text-brand mb-2" />
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-brand">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-text-muted/70 mt-1">{coverFile ? coverFile.name : "PNG, JPG, WEBP"}</p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverChange}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-divider flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
          ) : (
            <><UploadCloud className="w-5 h-5" /> Save as Draft</>
          )}
        </button>
      </div>
    </form>
  );
}
