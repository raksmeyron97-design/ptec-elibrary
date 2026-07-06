"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, AlertCircle, GraduationCap } from "lucide-react";
import { savePath } from "@/app/actions/learning-paths";
import type { LearningPathDetail, PathModuleInput, PathStepInput, StepResourceType } from "@/app/actions/learning-paths";
import { INPUT_CLASS, LABEL_CLASS } from "../../theses/_components/form-styles";
import StepResourcePicker from "./StepResourcePicker";

// Client-local ids for React keys — never sent to the server (savePath does a
// full delete-and-reinsert of modules/steps, so no round-trip id is needed).
type EditableStep = PathStepInput & { _key: string };
type EditableModule = Omit<PathModuleInput, "steps"> & { _key: string; steps: EditableStep[] };

let keySeq = 0;
function nextKey() { return `new-${Date.now()}-${keySeq++}`; }

function emptyStep(): EditableStep {
  return {
    _key: nextKey(),
    resource_type: "book",
    resource_id: null,
    resource_title: null,
    external_url: null,
    instruction: null,
    instruction_km: null,
    est_minutes: null,
  };
}

function emptyModule(): EditableModule {
  return { _key: nextKey(), title: "", title_km: null, steps: [emptyStep()] };
}

const RESOURCE_TYPE_LABEL: Record<StepResourceType, string> = {
  book: "E-Book",
  research: "Thesis",
  catalog: "Physical Copy",
  external: "External Link",
};

export default function PathBuilderForm({ initial, pathId }: { initial: LearningPathDetail | null; pathId: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [titleKm, setTitleKm] = useState(initial?.title_km ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [descriptionKm, setDescriptionKm] = useState(initial?.description_km ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? false);

  const [modules, setModules] = useState<EditableModule[]>(
    initial && initial.modules.length > 0
      ? initial.modules.map((m) => ({
          _key: m.id,
          title: m.title,
          title_km: m.title_km,
          steps: m.steps.map((s) => ({
            _key: s.id,
            resource_type: s.resource_type,
            resource_id: s.resource_id,
            resource_title: s.resource_title,
            external_url: s.external_url,
            instruction: s.instruction,
            instruction_km: s.instruction_km,
            est_minutes: s.est_minutes,
          })),
        }))
      : [emptyModule()],
  );

  function patchModule(mi: number, patch: Partial<EditableModule>) {
    setModules((prev) => prev.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  }
  function addModule() {
    setModules((prev) => [...prev, emptyModule()]);
  }
  function removeModule(mi: number) {
    setModules((prev) => prev.filter((_, i) => i !== mi));
  }
  function moveModule(mi: number, dir: -1 | 1) {
    setModules((prev) => {
      const next = mi + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[mi], copy[next]] = [copy[next], copy[mi]];
      return copy;
    });
  }

  function patchStep(mi: number, si: number, patch: Partial<EditableStep>) {
    setModules((prev) =>
      prev.map((m, i) => (i !== mi ? m : { ...m, steps: m.steps.map((s, j) => (j === si ? { ...s, ...patch } : s)) })),
    );
  }
  function addStep(mi: number) {
    setModules((prev) => prev.map((m, i) => (i === mi ? { ...m, steps: [...m.steps, emptyStep()] } : m)));
  }
  function removeStep(mi: number, si: number) {
    setModules((prev) => prev.map((m, i) => (i === mi ? { ...m, steps: m.steps.filter((_, j) => j !== si) } : m)));
  }
  function moveStep(mi: number, si: number, dir: -1 | 1) {
    setModules((prev) =>
      prev.map((m, i) => {
        if (i !== mi) return m;
        const next = si + dir;
        if (next < 0 || next >= m.steps.length) return m;
        const steps = [...m.steps];
        [steps[si], steps[next]] = [steps[next], steps[si]];
        return { ...m, steps };
      }),
    );
  }

  async function handleUploadCover(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("key", `paths/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`);
    fd.set("target", "public");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) setCoverUrl(data.url);
    else setError(data.error ?? "Cover upload failed");
  }

  function handleSave() {
    setError(null);

    if (!title.trim()) { setError("Title is required."); return; }
    for (const m of modules) {
      if (!m.title.trim()) { setError("Every module needs a title."); return; }
      for (const s of m.steps) {
        if (s.resource_type === "external" && !s.external_url?.trim()) {
          setError(`Add a URL for every external-link step in "${m.title}".`);
          return;
        }
        if (s.resource_type !== "external" && !s.resource_id) {
          setError(`Pick a resource for every step in "${m.title}".`);
          return;
        }
      }
    }

    startTransition(async () => {
      const payload = {
        title, title_km: titleKm || null,
        description: description || null, description_km: descriptionKm || null,
        audience: audience || null, cover_url: coverUrl || null,
        is_published: isPublished,
        modules: modules.map((m): PathModuleInput => ({
          title: m.title, title_km: m.title_km,
          steps: m.steps.map((s): PathStepInput => ({
            resource_type: s.resource_type, resource_id: s.resource_id, resource_title: s.resource_title,
            external_url: s.external_url, instruction: s.instruction, instruction_km: s.instruction_km,
            est_minutes: s.est_minutes,
          })),
        })),
      };
      const res = await savePath(pathId, payload);
      if ("error" in res) { setError(res.error); return; }
      router.push("/admin/paths");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Path fields ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-6 space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text-heading">
          <GraduationCap className="h-4 w-4 text-brand" /> Path details
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Title (English) *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} placeholder="Foundations of Pedagogy" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Title (Khmer)</label>
            <input value={titleKm ?? ""} onChange={(e) => setTitleKm(e.target.value)} className={INPUT_CLASS} placeholder="មូលដ្ឋានគរុកោសល្យ" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Description (English)</label>
            <textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT_CLASS} h-auto py-2.5`} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Description (Khmer)</label>
            <textarea value={descriptionKm ?? ""} onChange={(e) => setDescriptionKm(e.target.value)} rows={3} className={`${INPUT_CLASS} h-auto py-2.5`} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Audience</label>
            <input value={audience ?? ""} onChange={(e) => setAudience(e.target.value)} className={INPUT_CLASS} placeholder="Year 1 Trainee" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Cover image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCover(f); }}
              className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand"
            />
            {coverUrl && <p className="mt-1 truncate text-[11px] text-text-muted">{coverUrl}</p>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-body cursor-pointer">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4 accent-brand" />
          Published (visible on the public site)
        </label>
      </div>

      {/* ── Modules ── */}
      {modules.map((m, mi) => (
        <div key={m._key} className="rounded-2xl border border-divider bg-bg-surface p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">{mi + 1}</span>
            <div className="min-w-0 flex-1 grid gap-3 md:grid-cols-2">
              <input
                value={m.title}
                onChange={(e) => patchModule(mi, { title: e.target.value })}
                className={INPUT_CLASS}
                placeholder="Module title (English)"
              />
              <input
                value={m.title_km ?? ""}
                onChange={(e) => patchModule(mi, { title_km: e.target.value })}
                className={INPUT_CLASS}
                placeholder="Module title (Khmer)"
              />
            </div>
            <div className="flex shrink-0 gap-1 pt-1">
              <button type="button" onClick={() => moveModule(mi, -1)} disabled={mi === 0} className="rounded p-1 text-text-muted hover:text-brand disabled:opacity-30 cursor-pointer" aria-label="Move module up">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => moveModule(mi, 1)} disabled={mi === modules.length - 1} className="rounded p-1 text-text-muted hover:text-brand disabled:opacity-30 cursor-pointer" aria-label="Move module down">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => removeModule(mi)} className="rounded p-1 text-text-muted hover:text-red-500 cursor-pointer" aria-label="Remove module">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 pl-9">
            {m.steps.map((s, si) => (
              <div key={s._key} className="rounded-xl border border-divider/60 bg-paper/40 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <select
                    value={s.resource_type}
                    onChange={(e) => patchStep(mi, si, { resource_type: e.target.value as StepResourceType, resource_id: null, resource_title: null, external_url: null })}
                    className={`${INPUT_CLASS} h-9 w-auto shrink-0`}
                  >
                    {(Object.keys(RESOURCE_TYPE_LABEL) as StepResourceType[]).map((t) => (
                      <option key={t} value={t}>{RESOURCE_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => moveStep(mi, si, -1)} disabled={si === 0} className="rounded p-1 text-text-muted hover:text-brand disabled:opacity-30 cursor-pointer" aria-label="Move step up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveStep(mi, si, 1)} disabled={si === m.steps.length - 1} className="rounded p-1 text-text-muted hover:text-brand disabled:opacity-30 cursor-pointer" aria-label="Move step down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeStep(mi, si)} className="rounded p-1 text-text-muted hover:text-red-500 cursor-pointer" aria-label="Remove step">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {s.resource_type === "external" ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={s.resource_title ?? ""}
                      onChange={(e) => patchStep(mi, si, { resource_title: e.target.value })}
                      className={INPUT_CLASS}
                      placeholder="Link title"
                    />
                    <input
                      value={s.external_url ?? ""}
                      onChange={(e) => patchStep(mi, si, { external_url: e.target.value })}
                      className={INPUT_CLASS}
                      placeholder="https://…"
                    />
                  </div>
                ) : s.resource_id ? (
                  <div className="flex items-center justify-between rounded-lg border border-divider bg-bg-surface px-3 py-2">
                    <span className="truncate text-sm font-medium text-text-heading">{s.resource_title}</span>
                    <button
                      type="button"
                      onClick={() => patchStep(mi, si, { resource_id: null, resource_title: null })}
                      className="ml-2 shrink-0 text-[11px] font-semibold text-text-muted hover:text-brand cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <StepResourcePicker
                    type={s.resource_type}
                    onPick={(hit) => patchStep(mi, si, { resource_id: hit.id, resource_title: hit.title })}
                  />
                )}

                <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
                  <input
                    value={s.instruction ?? ""}
                    onChange={(e) => patchStep(mi, si, { instruction: e.target.value })}
                    className={INPUT_CLASS}
                    placeholder="Instruction (English), optional"
                  />
                  <input
                    value={s.instruction_km ?? ""}
                    onChange={(e) => patchStep(mi, si, { instruction_km: e.target.value })}
                    className={INPUT_CLASS}
                    placeholder="Instruction (Khmer), optional"
                  />
                  <input
                    type="number"
                    min={0}
                    value={s.est_minutes ?? ""}
                    onChange={(e) => patchStep(mi, si, { est_minutes: e.target.value ? Number(e.target.value) : null })}
                    className={INPUT_CLASS}
                    placeholder="Minutes"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addStep(mi)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add step
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addModule}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-divider px-4 py-2.5 text-sm font-semibold text-text-muted hover:border-brand/40 hover:text-brand cursor-pointer"
      >
        <Plus className="h-4 w-4" /> Add module
      </button>

      <div className="flex justify-end gap-3 border-t border-divider pt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="btn-brand-gradient rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : pathId ? "Save changes" : "Create path"}
        </button>
      </div>
    </div>
  );
}
