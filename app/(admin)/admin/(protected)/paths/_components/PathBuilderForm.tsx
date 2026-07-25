"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, ArrowUp, ArrowDown, AlertCircle, Copy, ChevronDown, ChevronUp,
  Check, X, CircleCheck, CircleAlert, Loader2, ListChecks, BookOpen, Layers, Settings2, Rocket,
} from "lucide-react";
import { savePath } from "@/app/actions/learning-paths";
import type {
  LearningPathDetail, PathModuleInput, PathStepInput, StepResourceType, LearningPathStatus,
  PathDifficulty, PathLanguage, BilingualEntry,
} from "@/app/actions/learning-paths";
import { slugify } from "@/lib/books";
import { INPUT_CLASS, LABEL_CLASS } from "../../theses/_components/form-styles";
import StepResourcePicker from "./StepResourcePicker";

type EditableStep = PathStepInput & { _key: string; resourceUnavailable?: boolean };
type EditableModule = { _key: string; title: string; title_km: string | null; description: string | null; description_km: string | null; steps: EditableStep[] };

let keySeq = 0;
const nextKey = () => `k-${Date.now()}-${keySeq++}`;

function emptyStep(): EditableStep {
  return { _key: nextKey(), resource_type: "book", resource_id: null, resource_title: null, external_url: null, instruction: null, instruction_km: null, est_minutes: null, is_required: true };
}
function emptyModule(): EditableModule {
  return { _key: nextKey(), title: "", title_km: null, description: null, description_km: null, steps: [emptyStep()] };
}

const RESOURCE_TYPES: StepResourceType[] = ["book", "research", "catalog", "publication", "external"];
const DIFFICULTIES: PathDifficulty[] = ["beginner", "intermediate", "advanced"];
const LANGUAGES: PathLanguage[] = ["en", "km", "both"];
type Stage = "details" | "curriculum" | "publish";
const STAGES: Stage[] = ["details", "curriculum", "publish"];
const STAGE_ICON: Record<Stage, typeof BookOpen> = { details: Settings2, curriculum: Layers, publish: Rocket };

export default function PathBuilderForm({ initial, pathId: initialPathId }: { initial: LearningPathDetail | null; pathId: string | null }) {
  const t = useTranslations("adminPaths");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("details");

  // The row id survives an autosave that first creates the draft.
  const [pathId, setPathId] = useState<string | null>(initialPathId);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [titleKm, setTitleKm] = useState(initial?.title_km ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [descriptionKm, setDescriptionKm] = useState(initial?.description_km ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [difficulty, setDifficulty] = useState<PathDifficulty | "">(initial?.difficulty ?? "");
  const [language, setLanguage] = useState<PathLanguage | "">(initial?.language ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(initial?.estimated_minutes != null ? String(initial.estimated_minutes) : "");
  const [outcomes, setOutcomes] = useState<BilingualEntry[]>(initial?.outcomes ?? []);
  const [prerequisites, setPrerequisites] = useState<BilingualEntry[]>(initial?.prerequisites ?? []);
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [status, setStatus] = useState<LearningPathStatus>(initial?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at ? toLocalInput(initial.scheduled_at) : "");
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [seoTitle, setSeoTitle] = useState(initial?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seo_description ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(initial?.og_image_url ?? "");

  const [modules, setModules] = useState<EditableModule[]>(
    initial && initial.modules.length > 0
      ? initial.modules.map((m) => ({
          _key: m.id, title: m.title, title_km: m.title_km, description: m.description, description_km: m.description_km,
          steps: m.steps.map((s) => ({
            _key: s.id, resource_type: s.resource_type, resource_id: s.resource_id, resource_title: s.resource_title,
            external_url: s.external_url, instruction: s.instruction, instruction_km: s.instruction_km, est_minutes: s.est_minutes,
            is_required: s.is_required, resourceUnavailable: s.missing,
          })),
        }))
      : [emptyModule()],
  );

  const slug = initial?.slug ?? (title.trim() ? slugify(title) : "");

  // ── Build the server payload from current state ──
  const buildInput = useCallback(() => ({
    title, title_km: titleKm || null, description: description || null, description_km: descriptionKm || null,
    audience: audience || null, subject: subject || null, difficulty: (difficulty || null) as PathDifficulty | null,
    language: (language || null) as PathLanguage | null, cover_url: coverUrl || null,
    estimated_minutes: estimatedMinutes.trim() ? Number(estimatedMinutes) : null,
    outcomes, prerequisites, tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
    seo_title: seoTitle || null, seo_description: seoDescription || null, og_image_url: ogImageUrl || null,
    modules: modules.map((m): PathModuleInput => ({
      title: m.title, title_km: m.title_km, description: m.description, description_km: m.description_km,
      steps: m.steps.map((s): PathStepInput => ({
        resource_type: s.resource_type, resource_id: s.resource_id, resource_title: s.resource_title,
        external_url: s.external_url, instruction: s.instruction, instruction_km: s.instruction_km,
        est_minutes: s.est_minutes, is_required: s.is_required,
      })),
    })),
  }), [title, titleKm, description, descriptionKm, audience, subject, difficulty, language, coverUrl, estimatedMinutes, outcomes, prerequisites, tags, seoTitle, seoDescription, ogImageUrl, modules]);

  // ── Validation ──
  const validation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!title.trim()) errors.push(t("builder.validation.noTitle"));
    if (modules.length === 0) errors.push(t("builder.validation.noModules"));
    modules.forEach((m, i) => {
      if (!m.title.trim()) errors.push(t("builder.validation.moduleNoTitle", { index: i + 1 }));
      if (m.steps.length === 0) errors.push(t("builder.validation.moduleNoSteps", { title: m.title || `#${i + 1}` }));
      m.steps.forEach((s) => {
        if (s.resource_type === "external" && !s.external_url?.trim()) errors.push(t("builder.validation.stepNoUrl", { title: m.title || `#${i + 1}` }));
        if (s.resource_type !== "external" && !s.resource_id) errors.push(t("builder.validation.stepNoResource", { title: m.title || `#${i + 1}` }));
        if (s.resourceUnavailable) warnings.push(t("builder.validation.stepUnavailable", { title: s.resource_title || "—" }));
      });
    });
    if (!titleKm.trim()) warnings.push(t("builder.validation.noTitleKm"));
    if (!description.trim()) warnings.push(t("builder.validation.noDescription"));
    if (outcomes.length === 0) warnings.push(t("builder.validation.noOutcomes"));
    if (estimatedMinutes.trim() && (isNaN(Number(estimatedMinutes)) || Number(estimatedMinutes) < 0)) errors.push(t("builder.validation.badDuration"));
    return { errors, warnings };
  }, [title, titleKm, description, modules, outcomes, estimatedMinutes, t]);

  // ── Dirty tracking + unsaved-changes guard ──
  const snapshot = useMemo(() => JSON.stringify({ ...buildInput(), status, scheduledAt, featured }), [buildInput, status, scheduledAt, featured]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── Autosave (existing drafts only; never auto-mutates a live/published path) ──
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pathId || status !== "draft" || !dirty || validation.errors.length > 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      const res = await savePath(pathId, { ...buildInput(), status: "draft" });
      if ("error" in res) { setSaveState("error"); return; }
      setSavedSnapshot(snapshot);
      setSaveState("saved");
    }, 1500);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [snapshot, pathId, status, dirty, validation.errors.length, buildInput]);

  // ── Manual save / publish ──
  function persist(targetStatus: LearningPathStatus, navigate: boolean) {
    setError(null);
    if (!title.trim()) { setError(t("builder.validation.noTitle")); setStage("details"); return; }
    if (validation.errors.length > 0) {
      setError(validation.errors[0]);
      setStage(validation.errors[0].includes("module") || validation.errors[0].includes("step") ? "curriculum" : "details");
      return;
    }
    if (targetStatus === "scheduled" && !scheduledAt) { setError(t("builder.validation.noSchedule")); setStage("publish"); return; }

    startTransition(async () => {
      setSaveState("saving");
      const res = await savePath(pathId, {
        ...buildInput(),
        status: targetStatus,
        scheduled_at: targetStatus === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        featured,
      });
      if ("error" in res) { setError(res.error); setSaveState("error"); return; }
      setPathId(res.id);
      setStatus(targetStatus);
      setSavedSnapshot(JSON.stringify({ ...buildInput(), status: targetStatus, scheduledAt, featured }));
      setSaveState("saved");
      if (navigate) { router.push("/admin/paths"); router.refresh(); }
    });
  }

  // ── Cover upload ──
  async function handleUploadCover(file: File, setter: (url: string) => void) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("key", `paths/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`);
    fd.set("target", "public");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) setter(data.url); else setError(data.error ?? t("builder.coverUploadFailed"));
  }

  // ── Module / step mutators ──
  const patchModule = (mi: number, patch: Partial<EditableModule>) => setModules((p) => p.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  const addModule = () => setModules((p) => [...p, emptyModule()]);
  const removeModule = (mi: number) => setModules((p) => p.filter((_, i) => i !== mi));
  const duplicateModule = (mi: number) => setModules((p) => {
    const src = p[mi];
    const copy: EditableModule = { ...src, _key: nextKey(), title: `${src.title} (copy)`, steps: src.steps.map((s) => ({ ...s, _key: nextKey() })) };
    return [...p.slice(0, mi + 1), copy, ...p.slice(mi + 1)];
  });
  const moveModule = (mi: number, dir: -1 | 1) => setModules((p) => {
    const j = mi + dir; if (j < 0 || j >= p.length) return p;
    const c = [...p]; [c[mi], c[j]] = [c[j], c[mi]]; return c;
  });

  const patchStep = (mi: number, si: number, patch: Partial<EditableStep>) =>
    setModules((p) => p.map((m, i) => (i !== mi ? m : { ...m, steps: m.steps.map((s, j) => (j === si ? { ...s, ...patch } : s)) })));
  const addStep = (mi: number) => setModules((p) => p.map((m, i) => (i === mi ? { ...m, steps: [...m.steps, emptyStep()] } : m)));
  const removeStep = (mi: number, si: number) => setModules((p) => p.map((m, i) => (i === mi ? { ...m, steps: m.steps.filter((_, j) => j !== si) } : m)));
  const moveStep = (mi: number, si: number, dir: -1 | 1) => setModules((p) => p.map((m, i) => {
    if (i !== mi) return m;
    const j = si + dir; if (j < 0 || j >= m.steps.length) return m;
    const s = [...m.steps]; [s[si], s[j]] = [s[j], s[si]]; return { ...m, steps: s };
  }));

  return (
    <div className="space-y-5">
      {/* ── Stepper + save state ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex items-center gap-1.5" aria-label={t("builder.stagesLabel")}>
          {STAGES.map((s, i) => {
            const Icon = STAGE_ICON[s];
            const active = stage === s;
            const badge = s === "publish" ? validation.errors.length : 0;
            return (
              <button key={s} type="button" onClick={() => setStage(s)} aria-current={active ? "step" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${active ? "bg-brand text-white" : "text-text-muted hover:bg-paper"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${active ? "bg-white/20" : "bg-paper"}`}>{i + 1}</span>
                <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                {t(`builder.stages.${s}`)}
                {badge > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{badge}</span>}
              </button>
            );
          })}
        </nav>
        <SaveIndicator state={saveState} dirty={dirty} t={t} />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3.5" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* ══ Stage: Details ══ */}
      {stage === "details" && (
        <div className="space-y-5">
          <Section title={t("builder.stages.details")} icon={Settings2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("builder.fields.titleEn")} required>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} placeholder="Foundations of Pedagogy" />
              </Field>
              <Field label={t("builder.fields.titleKm")}>
                <input value={titleKm ?? ""} onChange={(e) => setTitleKm(e.target.value)} className={INPUT_CLASS} placeholder="មូលដ្ឋានគរុកោសល្យ" />
              </Field>
              <Field label={t("builder.fields.slug")}>
                <input value={slug} readOnly disabled className={`${INPUT_CLASS} opacity-70`} />
              </Field>
              <Field label={t("builder.fields.audience")}>
                <input value={audience ?? ""} onChange={(e) => setAudience(e.target.value)} className={INPUT_CLASS} placeholder="Year 1 Trainee" />
              </Field>
              <Field label={t("builder.fields.descEn")}>
                <textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT_CLASS} h-auto py-2.5`} />
              </Field>
              <Field label={t("builder.fields.descKm")}>
                <textarea value={descriptionKm ?? ""} onChange={(e) => setDescriptionKm(e.target.value)} rows={3} className={`${INPUT_CLASS} h-auto py-2.5`} />
              </Field>
              <Field label={t("builder.fields.subject")}>
                <input value={subject ?? ""} onChange={(e) => setSubject(e.target.value)} className={INPUT_CLASS} placeholder="Pedagogy" />
              </Field>
              <Field label={t("builder.fields.difficulty")}>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as PathDifficulty | "")} className={INPUT_CLASS}>
                  <option value="">{t("builder.fields.none")}</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{t(`difficultyOpt.${d}`)}</option>)}
                </select>
              </Field>
              <Field label={t("builder.fields.language")}>
                <select value={language} onChange={(e) => setLanguage(e.target.value as PathLanguage | "")} className={INPUT_CLASS}>
                  <option value="">{t("builder.fields.none")}</option>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{t(`language.${l}`)}</option>)}
                </select>
              </Field>
              <Field label={t("builder.fields.estMinutes")}>
                <input type="number" min={0} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} className={INPUT_CLASS} placeholder={t("builder.fields.estMinutesHint")} />
              </Field>
              <Field label={t("builder.fields.cover")}>
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCover(f, setCoverUrl); }}
                  className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand" />
                {coverUrl && <p className="mt-1 truncate text-[11px] text-text-muted">{coverUrl}</p>}
              </Field>
              <Field label={t("builder.fields.tags")}>
                <input value={tags} onChange={(e) => setTags(e.target.value)} className={INPUT_CLASS} placeholder={t("builder.fields.tagsHint")} />
              </Field>
            </div>
          </Section>

          <Section title={t("builder.outcomesTitle")} icon={ListChecks}>
            <BilingualListEditor items={outcomes} onChange={setOutcomes} addLabel={t("builder.addOutcome")} t={t} />
          </Section>
          <Section title={t("builder.prereqTitle")} icon={ListChecks}>
            <BilingualListEditor items={prerequisites} onChange={setPrerequisites} addLabel={t("builder.addPrereq")} t={t} />
          </Section>
        </div>
      )}

      {/* ══ Stage: Curriculum ══ */}
      {stage === "curriculum" && (
        <div className="space-y-4">
          {modules.map((m, mi) => (
            <ModuleEditor
              key={m._key}
              module={m} index={mi} total={modules.length} t={t}
              onPatch={(patch) => patchModule(mi, patch)}
              onRemove={() => removeModule(mi)}
              onDuplicate={() => duplicateModule(mi)}
              onMove={(dir) => moveModule(mi, dir)}
              onAddStep={() => addStep(mi)}
              onPatchStep={(si, patch) => patchStep(mi, si, patch)}
              onRemoveStep={(si) => removeStep(mi, si)}
              onMoveStep={(si, dir) => moveStep(mi, si, dir)}
            />
          ))}
          <button type="button" onClick={addModule}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-divider px-4 py-2.5 text-sm font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand">
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("builder.addModule")}
          </button>
        </div>
      )}

      {/* ══ Stage: Publish ══ */}
      {stage === "publish" && (
        <div className="space-y-5">
          <Section title={t("builder.publishTitle")} icon={Rocket}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("builder.fields.status")}>
                <select value={status} onChange={(e) => setStatus(e.target.value as LearningPathStatus)} className={INPUT_CLASS}>
                  {(["draft", "published", "scheduled", "archived"] as LearningPathStatus[]).map((s) => <option key={s} value={s}>{t(`tabs.${s}`)}</option>)}
                </select>
              </Field>
              {status === "scheduled" && (
                <Field label={t("builder.fields.scheduledAt")}>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={INPUT_CLASS} />
                </Field>
              )}
              <Field label={t("builder.fields.seoTitle")}>
                <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={INPUT_CLASS} />
              </Field>
              <Field label={t("builder.fields.seoDescription")}>
                <input value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} className={INPUT_CLASS} />
              </Field>
              <Field label={t("builder.fields.ogImage")}>
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCover(f, setOgImageUrl); }}
                  className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand" />
                {ogImageUrl && <p className="mt-1 truncate text-[11px] text-text-muted">{ogImageUrl}</p>}
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-text-body">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 accent-brand" />
              {t("builder.fields.featured")}
            </label>
          </Section>

          {/* Validation checklist */}
          <Section title={t("builder.checklistTitle")} icon={ListChecks}>
            {validation.errors.length === 0 && validation.warnings.length === 0 ? (
              <p className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-emerald-600">
                <CircleCheck className="h-4 w-4" aria-hidden="true" /> {t("builder.checklistOk")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {validation.errors.map((e, i) => (
                  <li key={`e${i}`} className="flex items-start gap-2 text-[13px] text-danger">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {e}
                  </li>
                ))}
                {validation.warnings.map((w, i) => (
                  <li key={`w${i}`} className="flex items-start gap-2 text-[13px] text-amber-600">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {w}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {/* ── Footer actions ── */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-divider pt-5">
        <button type="button" onClick={() => router.push("/admin/paths")} className="rounded-xl px-4 py-3 text-sm font-semibold text-text-muted hover:text-text-heading">
          {t("builder.cancel")}
        </button>
        <button type="button" onClick={() => persist("draft", true)} disabled={isPending}
          className="rounded-xl border border-divider px-5 py-3 text-sm font-semibold text-text-body transition hover:border-brand/40 hover:text-brand disabled:opacity-60">
          {t("builder.saveDraft")}
        </button>
        <button type="button" onClick={() => persist(status === "draft" ? "published" : status, true)} disabled={isPending || validation.errors.length > 0}
          className="btn-brand-gradient rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {isPending ? t("builder.saving") : status === "published" ? t("builder.saveChanges") : t("builder.publish")}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslations>;

function Section({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-text-heading">
        <Icon className="h-4 w-4 text-brand" aria-hidden="true" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}{required && <span className="text-danger"> *</span>}</label>
      {children}
    </div>
  );
}

function SaveIndicator({ state, dirty, t }: { state: "idle" | "saving" | "saved" | "error"; dirty: boolean; t: TFn }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("builder.saving")}</span>;
  if (state === "error") return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-danger"><CircleAlert className="h-3.5 w-3.5" /> {t("builder.saveError")}</span>;
  if (state === "saved" && !dirty) return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" /> {t("builder.saved")}</span>;
  if (dirty) return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted">{t("builder.unsaved")}</span>;
  return null;
}

function BilingualListEditor({ items, onChange, addLabel, t }: { items: BilingualEntry[]; onChange: (v: BilingualEntry[]) => void; addLabel: string; t: TFn }) {
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input value={it.en} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))} className={INPUT_CLASS} placeholder={t("builder.english")} />
          <input value={it.km} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, km: e.target.value } : x)))} className={INPUT_CLASS} placeholder={t("builder.khmer")} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t("builder.remove")} className="rounded-lg border border-divider px-3 text-text-muted hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { en: "", km: "" }])} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  );
}

function ModuleEditor({
  module: m, index: mi, total, t, onPatch, onRemove, onDuplicate, onMove, onAddStep, onPatchStep, onRemoveStep, onMoveStep,
}: {
  module: EditableModule; index: number; total: number; t: TFn;
  onPatch: (p: Partial<EditableModule>) => void; onRemove: () => void; onDuplicate: () => void; onMove: (dir: -1 | 1) => void;
  onAddStep: () => void; onPatchStep: (si: number, p: Partial<EditableStep>) => void; onRemoveStep: (si: number) => void; onMoveStep: (si: number, dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface">
      <div className="flex items-center gap-2 p-4">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-paper">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">{mi + 1}</span>
        <input value={m.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder={t("builder.moduleTitleEn")} className={`${INPUT_CLASS} flex-1`} />
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn onClick={() => onMove(-1)} disabled={mi === 0} label={t("builder.moveUp")}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={() => onMove(1)} disabled={mi === total - 1} label={t("builder.moveDown")}><ArrowDown className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={onDuplicate} label={t("builder.duplicate")}><Copy className="h-4 w-4" /></IconBtn>
          {confirmDelete ? (
            <span className="inline-flex items-center gap-1">
              <IconBtn onClick={onRemove} label={t("builder.confirmDelete")} danger><Check className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={() => setConfirmDelete(false)} label={t("builder.cancel")}><X className="h-4 w-4" /></IconBtn>
            </span>
          ) : (
            <IconBtn onClick={() => setConfirmDelete(true)} label={t("builder.deleteModule")} danger><Trash2 className="h-4 w-4" /></IconBtn>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-divider p-4">
          <div className="grid gap-2 md:grid-cols-2">
            <input value={m.title_km ?? ""} onChange={(e) => onPatch({ title_km: e.target.value })} placeholder={t("builder.moduleTitleKm")} className={INPUT_CLASS} />
            <input value={m.description ?? ""} onChange={(e) => onPatch({ description: e.target.value })} placeholder={t("builder.moduleDescEn")} className={INPUT_CLASS} />
            <input value={m.description_km ?? ""} onChange={(e) => onPatch({ description_km: e.target.value })} placeholder={t("builder.moduleDescKm")} className={INPUT_CLASS} />
          </div>

          <div className="space-y-3">
            {m.steps.map((s, si) => (
              <StepEditor key={s._key} step={s} index={si} total={m.steps.length} t={t}
                onPatch={(p) => onPatchStep(si, p)} onRemove={() => onRemoveStep(si)} onMove={(dir) => onMoveStep(si, dir)} />
            ))}
            <button type="button" onClick={onAddStep} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
              <Plus className="h-3.5 w-3.5" /> {t("builder.addStep")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepEditor({ step: s, index: si, total, t, onPatch, onRemove, onMove }: {
  step: EditableStep; index: number; total: number; t: TFn;
  onPatch: (p: Partial<EditableStep>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-xl border border-divider/60 bg-paper/40 p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={s.resource_type} onChange={(e) => onPatch({ resource_type: e.target.value as StepResourceType, resource_id: null, resource_title: null, external_url: null, resourceUnavailable: false })}
          className={`${INPUT_CLASS} h-9 w-auto shrink-0`} aria-label={t("builder.resourceType")}>
          {RESOURCE_TYPES.map((rt) => <option key={rt} value={rt}>{t(`builder.resourceTypeLabel.${rt}`)}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted">
          <input type="checkbox" checked={s.is_required ?? true} onChange={(e) => onPatch({ is_required: e.target.checked })} className="h-4 w-4 accent-brand" />
          {t("builder.required")}
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <IconBtn onClick={() => onMove(-1)} disabled={si === 0} label={t("builder.moveUp")}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={() => onMove(1)} disabled={si === total - 1} label={t("builder.moveDown")}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={onRemove} label={t("builder.removeStep")} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>

      {s.resource_type === "external" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <input value={s.resource_title ?? ""} onChange={(e) => onPatch({ resource_title: e.target.value })} className={INPUT_CLASS} placeholder={t("builder.linkTitle")} />
          <input value={s.external_url ?? ""} onChange={(e) => onPatch({ external_url: e.target.value })} className={INPUT_CLASS} placeholder="https://…" inputMode="url" />
        </div>
      ) : s.resource_id ? (
        <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${s.resourceUnavailable ? "border-amber-300 bg-amber-50" : "border-divider bg-bg-surface"}`}>
          <span className="flex items-center gap-2 truncate text-sm font-medium text-text-heading">
            {s.resourceUnavailable && <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />}
            {s.resource_title}
            {s.resourceUnavailable && <span className="text-[11px] font-normal text-amber-600">({t("builder.unavailable")})</span>}
          </span>
          <button type="button" onClick={() => onPatch({ resource_id: null, resource_title: null, resourceUnavailable: false })} className="ml-2 shrink-0 text-[11px] font-semibold text-text-muted hover:text-brand">
            {t("builder.change")}
          </button>
        </div>
      ) : (
        <StepResourcePicker type={s.resource_type} onPick={(hit) => onPatch({ resource_id: hit.id, resource_title: hit.title, resourceUnavailable: !hit.published })} />
      )}

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
        <input value={s.instruction ?? ""} onChange={(e) => onPatch({ instruction: e.target.value })} className={INPUT_CLASS} placeholder={t("builder.instructionEn")} />
        <input value={s.instruction_km ?? ""} onChange={(e) => onPatch({ instruction_km: e.target.value })} className={INPUT_CLASS} placeholder={t("builder.instructionKm")} />
        <input type="number" min={0} value={s.est_minutes ?? ""} onChange={(e) => onPatch({ est_minutes: e.target.value ? Number(e.target.value) : null })} className={INPUT_CLASS} placeholder={t("builder.minutes")} />
      </div>
    </div>
  );
}

function IconBtn({ onClick, disabled, label, danger, children }: { onClick: () => void; disabled?: boolean; label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className={`rounded-lg p-1.5 transition disabled:opacity-30 ${danger ? "text-text-muted hover:bg-danger/5 hover:text-danger" : "text-text-muted hover:bg-paper hover:text-brand"}`}>
      {children}
    </button>
  );
}

/** ISO → value for <input type="datetime-local"> (local time, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
