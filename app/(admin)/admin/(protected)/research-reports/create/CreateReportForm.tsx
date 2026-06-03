"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPresignedUrl } from "@/app/actions/upload";
import { createResearchReport } from "@/app/actions/research";
import { UploadCloud, FileText, Image as ImageIcon, Loader2 } from "lucide-react";

export default function CreateReportForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

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

    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      
      // Upload PDF to R2
      const pdfPath = `reports/pdfs/${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { presignedUrl: pdfUrl, publicUrl: finalPdfUrl, error: pdfError } = await getPresignedUrl(pdfPath, pdfFile.type);
      if (pdfError || !pdfUrl || !finalPdfUrl) throw new Error(pdfError || "Failed to get PDF upload URL");
      
      await fetch(pdfUrl, {
        method: "PUT",
        body: pdfFile,
        headers: { "Content-Type": pdfFile.type },
      });

      // Upload Cover to R2
      const coverPath = `reports/covers/${Date.now()}-${coverFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { presignedUrl: coverUploadUrl, publicUrl: finalCoverUrl, error: coverError } = await getPresignedUrl(coverPath, coverFile.type);
      if (coverError || !coverUploadUrl || !finalCoverUrl) throw new Error(coverError || "Failed to get Cover upload URL");

      await fetch(coverUploadUrl, {
        method: "PUT",
        body: coverFile,
        headers: { "Content-Type": coverFile.type },
      });

      // Save to DB
      const dbData = {
        title: formData.get("title") as string,
        abstract: formData.get("abstract") as string,
        cohort: formData.get("cohort") as string,
        academic_year: formData.get("academic_year") as string,
        author_names: formData.get("author_names") as string,
        advisor_name: formData.get("advisor_name") as string,
        cover_url: finalCoverUrl,
        file_url: finalPdfUrl,
        file_size_kb: Math.round(pdfFile.size / 1024),
        is_published: false, // Default to draft
      };

      const result = await createResearchReport(dbData);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      router.push("/admin/research-reports");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to upload report. Please try again.");
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">Cohort</label>
              <input 
                name="cohort" 
                required 
                className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15" 
                placeholder="e.g. 3"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">Academic Year</label>
              <input 
                name="academic_year" 
                required 
                className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15" 
                placeholder="e.g. 2023-2024"
              />
            </div>
          </div>

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
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">Abstract (សេចក្តីសង្ខេប)</label>
            <textarea 
              name="abstract" 
              required 
              rows={6}
              className="w-full resize-none rounded-lg border border-divider p-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15" 
              placeholder="Brief summary of the research..."
            />
          </div>

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
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-divider bg-paper rounded-lg cursor-pointer hover:border-brand transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
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
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
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
