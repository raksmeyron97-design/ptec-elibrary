"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveBookRecord, addCategory } from "@/app/admin/actions";
import { departments as defaultDepartments, slugify } from "@/lib/book-utils";
import Icon from "@/components/ui/Icon";

const LANGUAGES = ["Khmer", "English"] as const;

const TEXT_FIELDS = [
  { name: "title",    label: "Title",    placeholder: "Book title",            required: true  },
  { name: "author",   label: "Author",   placeholder: "Author or institution", required: true  },
  { name: "isbn",     label: "ISBN",     placeholder: "Optional",              required: false },
] as const;

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

export default function UploadForm() {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase]       = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState<string | null>(null);

  // Cover preview
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Dynamic departments
  const [deptList, setDeptList] = useState<string[]>(defaultDepartments);
  const [showNewDept, setShowNewDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const newDeptInputRef = useRef<HTMLInputElement>(null);

  // Dynamic categories
  const [catList, setCatList] = useState<string[]>([]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const newCatInputRef = useRef<HTMLInputElement>(null);

  // Fetch departments (from books.department) & categories on mount
  useEffect(() => {
    (async () => {
      const [deptRes, catRes] = await Promise.all([
        // departments is a text column on books — get distinct values
        supabase.from("books").select("department").not("department", "is", null),
        supabase.from("categories").select("name").order("name", { ascending: true }),
      ]);

      if (deptRes.data && deptRes.data.length > 0) {
        const unique = [...new Set(
          deptRes.data
            .map((b: { department: string | null }) => b.department)
            .filter(Boolean) as string[]
        )].sort();
        if (unique.length > 0) setDeptList(unique);
      }

      if (catRes.data && catRes.data.length > 0) {
        setCatList(catRes.data.map((c: { name: string }) => c.name));
      }
    })();
  }, []);

  // Focus new-dept / new-cat input when shown
  useEffect(() => {
    if (showNewDept) newDeptInputRef.current?.focus();
  }, [showNewDept]);
  useEffect(() => {
    if (showNewCat) newCatInputRef.current?.focus();
  }, [showNewCat]);

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCoverPreview(url);
    } else {
      setCoverPreview(null);
    }
  }

  async function handleAddDepartment() {
    const name = newDeptName.trim();
    if (!name) return;
    // Case-insensitive duplicate check
    if (deptList.some((d) => d.toLowerCase() === name.toLowerCase())) {
      setShowNewDept(false);
      setNewDeptName("");
      return;
    }
    // department is a plain text column on books — no separate table needed
    // Just add to local list; it gets saved with the book record
    setDeptList((prev) => [...prev, name].sort());
    setNewDeptName("");
    setShowNewDept(false);
  }

  async function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    // Case-insensitive duplicate check
    if (catList.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setShowNewCat(false);
      setNewCatName("");
      return;
    }
    try {
      // Use server action (bypasses RLS)
      const result = await addCategory(name);
      if (result && !catList.includes(result.name)) {
        setCatList((prev) => [...prev, result.name].sort());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
      return;
    }
    setNewCatName("");
    setShowNewCat(false);
  }

  const busy = phase !== "idle";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    // ── Read & validate the PDF (client-side) ──────────────────
    const pdf = formData.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) {
      setError("A PDF file is required");
      return;
    }
    if (pdf.type !== "application/pdf") {
      setError("Only PDF files can be uploaded");
      return;
    }

    const cover = formData.get("cover");
    const hasCover = cover instanceof File && cover.size > 0;
    if (hasCover) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
      if (!allowed.includes((cover as File).type)) {
        setError("Cover must be JPEG, PNG, WebP, or AVIF");
        return;
      }
      if ((cover as File).size > 5 * 1024 * 1024) {
        setError("Cover image must be under 5 MB");
        return;
      }
    }

    const title = (formData.get("title") as string)?.trim();
    if (!title) {
      setError("Title is required");
      return;
    }
    const slug = slugify(title);

    try {
      // ── 1. Upload PDF directly to Supabase Storage ───────────
      setPhase("uploading-pdf");
      setProgress(0);

      const pdfFileName = `${Date.now()}-${slug}.pdf`;
      const pdfPath = `pdfs/${pdfFileName}`;

      const { error: pdfErr } = await supabase.storage
        .from("book-files")
        .upload(pdfPath, pdf, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (pdfErr) throw new Error(`PDF upload failed: ${pdfErr.message}`);

      const { data: pdfUrlData } = supabase.storage
        .from("book-files")
        .getPublicUrl(pdfPath);

      // ── 2. Upload cover (optional) ───────────────────────────
      let coverUrl: string | null = null;
      if (hasCover) {
        setPhase("uploading-cover");
        const coverFile = cover as File;
        const ext = coverFile.name.split(".").pop() ?? "jpg";
        const coverPath = `covers/${Date.now()}-${slug}.${ext}`;

        const { error: coverErr } = await supabase.storage
          .from("book-files")
          .upload(coverPath, coverFile, {
            contentType: coverFile.type,
            upsert: false,
          });

        if (coverErr) {
          // Non-fatal — fall back to color cover
          console.warn("Cover upload failed:", coverErr.message);
        } else {
          const { data: coverUrlData } = supabase.storage
            .from("book-files")
            .getPublicUrl(coverPath);
          coverUrl = coverUrlData.publicUrl;
        }
      }

      // ── 3. Save the record via Server Action (metadata only) ──
      setPhase("saving");
      const payload = new FormData();
      payload.set("title",      title);
      payload.set("author",     formData.get("author") as string);
      payload.set("department", formData.get("department") as string);
      payload.set("category",   formData.get("category") as string);
      payload.set("language",   formData.get("language") as string);
      payload.set("summary",    formData.get("summary") as string);
      payload.set("isbn",       (formData.get("isbn") as string) ?? "");
      payload.set("year",       (formData.get("year") as string) ?? "");
      payload.set("pages",      (formData.get("pages") as string) ?? "");
      payload.set("fileUrl",    pdfUrlData.publicUrl);
      payload.set("fileSizeKb", String(Math.round(pdf.size / 1024)));
      payload.set("coverUrl",   coverUrl ?? "");

      // saveBookRecord redirects on success, so nothing runs after it
      await saveBookRecord(payload);
    } catch (err) {
      setPhase("idle");
      setProgress(0);
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    "idle":            "Upload and publish",
    "uploading-pdf":   "Uploading PDF…",
    "uploading-cover": "Uploading cover…",
    "saving":          "Saving…",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8"
    >
      <h2 className="text-lg font-bold text-slate-800 md:col-span-2">
        Add new book
      </h2>

      {/* PDF file */}
      <label className="md:col-span-2">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          PDF file <span className="text-red-500">*</span>
        </span>
        <input
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          disabled={busy}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 transition hover:border-[#007c91] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#007c91] file:px-4 file:py-2 file:font-semibold file:text-white disabled:opacity-50"
        />
      </label>

      {/* Cover image */}
      <label className="md:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-slate-700">
          Cover image{" "}
          <span className="font-normal text-slate-400">(optional — JPEG, PNG, WebP · max 5 MB)</span>
        </span>
        <input
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={busy}
          onChange={handleCoverChange}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 transition hover:border-[#007c91] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:font-semibold file:text-slate-700 disabled:opacity-50"
        />
        {coverPreview ? (
          <div className="mt-3 flex items-start gap-3">
            <div className="relative h-[140px] w-[100px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm">
              <img
                src={coverPreview}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => setCoverPreview(null)}
              className="mt-1 text-xs font-semibold text-red-500 hover:text-red-700 transition"
            >
              Remove preview
            </button>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">
            If left empty, a colored placeholder is used automatically.
          </p>
        )}
      </label>

      {/* Text fields */}
      {TEXT_FIELDS.map((f) => (
        <label key={f.name}>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">
            {f.label}{" "}
            {f.required && <span className="text-red-500">*</span>}
          </span>
          <input
            name={f.name}
            required={f.required}
            placeholder={f.placeholder}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:bg-slate-50 disabled:opacity-60"
          />
        </label>
      ))}

      {/* Category */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Category <span className="text-red-500">*</span>
        </span>
        <select
          name="category"
          required
          defaultValue={catList[0] ?? ""}
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        >
          {catList.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {!showNewCat ? (
          <button
            type="button"
            onClick={() => setShowNewCat(true)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#007c91] hover:text-[#005f6b] transition"
          >
            <span className="text-base leading-none">+</span> Add new category
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={newCatInputRef}
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }}
              placeholder="New category name"
              className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="h-9 rounded-lg bg-[#007c91] px-3 text-xs font-semibold text-white transition hover:bg-[#005f6b]"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowNewCat(false); setNewCatName(""); }}
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}
      </label>

      {/* Language */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Language <span className="text-red-500">*</span>
        </span>
        <select
          name="language"
          required
          defaultValue="Khmer"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </label>

      {/* Department */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Department <span className="text-red-500">*</span>
        </span>
        <select
          name="department"
          required
          defaultValue={deptList[0] ?? ""}
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        >
          {deptList.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {!showNewDept ? (
          <button
            type="button"
            onClick={() => setShowNewDept(true)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#007c91] hover:text-[#005f6b] transition"
          >
            <span className="text-base leading-none">+</span> Add new department
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={newDeptInputRef}
              type="text"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDepartment(); } }}
              placeholder="New department name"
              className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15"
            />
            <button
              type="button"
              onClick={handleAddDepartment}
              className="h-9 rounded-lg bg-[#007c91] px-3 text-xs font-semibold text-white transition hover:bg-[#005f6b]"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowNewDept(false); setNewDeptName(""); }}
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}
      </label>

      {/* Year */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Year</span>
        <input
          name="year"
          type="number"
          min="1900"
          max="2099"
          defaultValue={new Date().getFullYear()}
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {/* Pages */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Pages</span>
        <input
          name="pages"
          type="number"
          min="1"
          defaultValue="1"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {/* Summary */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Summary <span className="text-red-500">*</span>
        </span>
        <textarea
          name="summary"
          required
          rows={4}
          disabled={busy}
          placeholder="Short description for readers..."
          className="w-full resize-none rounded-lg border border-slate-200 p-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:bg-slate-50 disabled:opacity-60"
        />
      </label>

      {/* Error message */}
      {error && (
        <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Progress / status while busy */}
      {busy && (
        <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          {phaseLabel[phase]}
        </div>
      )}

      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0a1629] px-6 font-semibold text-white transition hover:bg-[#007c91] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="pdf" className="text-lg" />
          {phaseLabel[phase]}
        </button>
      </div>
    </form>
  );
}