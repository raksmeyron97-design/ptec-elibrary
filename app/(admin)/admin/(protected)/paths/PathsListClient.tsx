"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Layers, Pencil, Trash2, ExternalLink } from "lucide-react";
import { deletePath } from "@/app/actions/learning-paths";
import type { LearningPathSummary } from "@/app/actions/learning-paths";

export default function PathsListClient({ paths: initial }: { paths: LearningPathSummary[] }) {
  const [paths, setPaths] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    const res = await deletePath(id);
    setBusyId(null);
    if ("error" in res) { alert(res.error); return; }
    setPaths((prev) => prev.filter((p) => p.id !== id));
  }

  if (paths.length === 0) {
    return (
      <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
        <GraduationCap className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
        <p className="text-[14px] font-semibold text-text-muted">No learning paths yet</p>
        <p className="mt-1 text-[12.5px] text-text-muted">Create the first one to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {paths.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${p.is_published ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                {p.is_published ? "Published" : "Draft"}
              </span>
              {p.audience && <span className="text-[11px] font-semibold text-text-muted">{p.audience}</span>}
            </div>
            <h3 className="mt-1.5 truncate text-[15px] font-bold text-text-heading">{p.title}</h3>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-text-muted">
              <Layers className="h-3.5 w-3.5" /> {p.stepCount} {p.stepCount === 1 ? "step" : "steps"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {p.is_published && (
              <Link
                href={`/paths/${p.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View
              </Link>
            )}
            <Link
              href={`/admin/paths/edit/${p.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(p.id, p.title)}
              disabled={busyId === p.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
