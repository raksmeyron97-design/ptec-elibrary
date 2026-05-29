"use client";

import { useState } from "react";
import { updateBook } from "@/app/(admin)/admin/(protected)/actions";
import { departments } from "@/lib/book-utils";
import Icon from "@/components/ui/Icon";

type Initial = {
  id: string;
  title: string;
  author: string;
  category: string;
  department: string;
  language: string;
  isbn: string;
  year: number;
  pages: number;
  summary: string;
};

const TEXT_FIELDS = [
  { name: "title",    label: "Title",    placeholder: "Book title",            required: true  },
  { name: "author",   label: "Author",   placeholder: "Author or institution", required: true  },
  { name: "category", label: "Category", placeholder: "Research, Journal...",   required: true  },
  { name: "language", label: "Language", placeholder: "",                      required: true  },
  { name: "isbn",     label: "ISBN",     placeholder: "Optional",              required: false },
] as const;

export default function EditForm({ initial }: { initial: Initial }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    try {
      // updateBook redirects on success
      await updateBook(initial.id, formData);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8"
    >
      <p className="md:col-span-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Editing metadata only. The PDF and cover image are not changed here.
      </p>

      {TEXT_FIELDS.map((f) => (
        <label key={f.name}>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">
            {f.label} {f.required && <span className="text-red-500">*</span>}
          </span>
          <input
            name={f.name}
            required={f.required}
            defaultValue={initial[f.name as keyof Initial] as string}
            placeholder={f.placeholder}
            disabled={saving}
            className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
          />
        </label>
      ))}

      {/* Department */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Department <span className="text-red-500">*</span>
        </span>
        <select
          name="department"
          required
          defaultValue={initial.department}
          disabled={saving}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        >
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>

      {/* Year */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Year</span>
        <input
          name="year"
          type="number"
          min="1900"
          max="2099"
          defaultValue={initial.year}
          disabled={saving}
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
          defaultValue={initial.pages}
          disabled={saving}
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
          defaultValue={initial.summary}
          disabled={saving}
          className="w-full resize-none rounded-lg border border-slate-200 p-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {error && (
        <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="md:col-span-2 flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0a1629] px-6 font-semibold text-white transition hover:bg-[#007c91] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="pdf" className="text-lg" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
