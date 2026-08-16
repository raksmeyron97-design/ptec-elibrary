"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, BookOpen, Check, CheckCheck, ClipboardCheck, Clock,
  ExternalLink, GraduationCap, History, Pencil, Quote, RotateCcw,
  ShieldCheck, Undo2, X,
} from "lucide-react";
import {
  assignReviewer,
  transitionContent,
  type ReviewItem,
  type ReviewPerson,
} from "@/app/actions/review";
import {
  getContentVersions,
  restoreContentVersion,
  type ContentVersion,
} from "@/app/actions/content-versions";
import { STATUS_META, type CanonicalStatus } from "@/lib/content-status";
import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";

const GRADE_STYLES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-lime-100 text-lime-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-red-100 text-red-800",
};

type Props = {
  items: ReviewItem[];
  reviewers: ReviewPerson[];
  viewerId: string;
  canRestore: boolean;
};

function QualityChecklist({ item }: { item: ReviewItem }) {
  const t = useTranslations("adminReview.details");
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {item.quality.items.map((c) => (
        <div key={c.key} className="flex items-start gap-2 text-[12px]">
          {c.status === "ok" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          ) : c.status === "weak" ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
          )}
          <span className={c.status === "ok" ? "text-text-muted" : "font-medium text-text-body"}>
            {c.label}
            {c.required && c.status === "missing" && (
              <span className="ml-1 text-[10px] font-bold uppercase text-danger">{t("required")}</span>
            )}
            {c.hint && <span className="block text-[11px] font-normal text-text-muted">{c.hint}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function VersionHistory({ item, canRestore }: { item: ReviewItem; canRestore: boolean }) {
  const t = useTranslations("adminReview.versions");
  const tToasts = useTranslations("adminReview.toasts");
  const toast = useToast();
  const [versions, setVersions] = useState<ContentVersion[] | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const table = item.type === "book" ? "books" : "research_reports";

  function load() {
    startTransition(async () => {
      try {
        setVersions(await getContentVersions(table, item.id));
      } catch {
        toast.error(t("loadFailed"));
      }
    });
  }

  function restore(versionId: number) {
    startTransition(async () => {
      const res = await restoreContentVersion(versionId);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(tToasts("restored"));
        load();
      }
      setRestoreTarget(null);
    });
  }

  if (versions === null) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline disabled:opacity-60"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" /> {pending ? t("loading") : t("load")}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {versions.length === 0 ? (
        <p className="text-[12px] text-text-muted">{t("none")}</p>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12px]">
            <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            <span className="text-text-muted">{new Date(v.changedAt).toLocaleString()}</span>
            <span className="font-medium text-text-body">{v.changedBy?.name ?? t("system")}</span>
            {v.statusFrom && v.statusTo && v.statusFrom !== v.statusTo && (
              <span className="text-text-muted">
                {v.statusFrom} → {v.statusTo}
              </span>
            )}
            {canRestore && (
              <button
                type="button"
                onClick={() => setRestoreTarget(v.id)}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-divider px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:border-brand/40 hover:text-brand disabled:opacity-60"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> {t("restore")}
              </button>
            )}
          </div>
        ))
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        title={t("restoreTitle")}
        description={t("restoreDescription")}
        tone="brand"
        confirmLabel={t("restoreConfirm")}
        busyLabel={t("restoreBusy")}
        busy={pending}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => restoreTarget !== null && restore(restoreTarget)}
      />
    </div>
  );
}

function ItemCard({
  item,
  reviewers,
  viewerId,
  canRestore,
  onChanged,
}: {
  item: ReviewItem;
  reviewers: ReviewPerson[];
  viewerId: string;
  canRestore: boolean;
  onChanged: (id: string, type: string, status: CanonicalStatus | "removed") => void;
}) {
  const t = useTranslations("adminReview");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const TypeIcon = item.type === "book" ? BookOpen : GraduationCap;
  const meta = STATUS_META[item.status];
  const missing = item.quality.missingRequired;
  const isOwn = item.createdBy?.id === viewerId;

  async function move(to: CanonicalStatus, opts?: { note?: string }) {
    setBusy(true);
    const res = await transitionContent(item.type, item.id, to, opts);
    setBusy(false);
    if ("error" in res) {
      toast.error(res.error || t("toasts.failed"));
      return;
    }
    setNoteOpen(false);
    setNote("");
    toast.success(t("toasts.updated"));
    onChanged(item.id, item.type, to === "published" || to === "archived" ? "removed" : to);
  }

  async function assign(reviewerId: string) {
    setBusy(true);
    const res = await assignReviewer(item.type, item.id, reviewerId || null);
    setBusy(false);
    if ("error" in res) toast.error(res.error || t("toasts.failed"));
    else toast.success(t("toasts.reviewerUpdated"));
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60";
  const ghost = `${btn} border border-divider text-text-muted hover:border-brand/40 hover:text-brand`;

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" className="h-16 w-12 shrink-0 rounded-lg border border-divider object-cover" />
        ) : (
          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-divider bg-paper">
            <TypeIcon className="h-5 w-5 text-text-muted/50" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${meta.badgeClass}`}>
              {t(`status.${item.status}`)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${GRADE_STYLES[item.quality.grade]}`}>
              {t("quality", { grade: item.quality.grade, score: item.quality.score })}
            </span>
            {item.verifiedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {t("verifiedBadge")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.type === "book" ? t("typeBook") : t("typeThesis")}
            </span>
            <span className="text-[11px] text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>

          <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-text-heading">{item.title}</h3>
          <p className="text-[13px] text-text-muted">
            {t("by", { author: item.author })}
            {item.createdBy && <> · {t("addedBy", { name: item.createdBy.name })}{isOwn && ` ${t("you")}`}</>}
          </p>

          {missing.length > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-danger">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {t("missing", { fields: missing.join(", ") })}
            </p>
          )}
          {item.reviewNote && (
            <p className="mt-1 rounded-lg bg-orange-50 px-2.5 py-1.5 text-[12px] text-orange-800">
              <span className="font-semibold">{t("reviewerNote")}</span> {item.reviewNote}
            </p>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-col lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={item.editUrl} className={ghost}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.edit")}
            </Link>
            {item.previewUrl && (
              <a href={item.previewUrl} target="_blank" rel="noreferrer" className={ghost}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.preview")}
              </a>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={ghost}>
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              {expanded ? t("actions.hideDetails") : t("actions.details")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(item.status === "needs_review" || item.status === "imported") && (
              <button type="button" onClick={() => move("in_review")} disabled={busy} className={`${btn} bg-info text-white hover:bg-info/90`}>
                {t("actions.startReview")}
              </button>
            )}
            {(item.status === "needs_review" || item.status === "in_review") && (
              <>
                <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-success text-white hover:bg-success/90`}>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.approvePublish")}
                </button>
                <button type="button" onClick={() => move("verified")} disabled={busy} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.verifyOnly")}
                </button>
                <button type="button" onClick={() => setNoteOpen((v) => !v)} disabled={busy} className={`${btn} bg-orange-500 text-white hover:bg-orange-600`}>
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.requestChanges")}
                </button>
              </>
            )}
            {item.status === "changes_requested" && (
              <>
                <button type="button" onClick={() => move("needs_review")} disabled={busy} className={`${btn} bg-info text-white hover:bg-info/90`}>
                  {t("actions.resubmit")}
                </button>
                <button type="button" onClick={() => move("archived")} disabled={busy} className={ghost}>
                  {t("actions.archive")}
                </button>
              </>
            )}
            {item.status === "verified" && (
              <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-success text-white hover:bg-success/90`}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.publishNow")}
              </button>
            )}
            {item.status === "scheduled" && (
              <>
                <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-success text-white hover:bg-success/90`}>
                  {t("actions.publishNow")}
                </button>
                <button type="button" onClick={() => move("verified")} disabled={busy} className={ghost}>
                  {t("actions.cancelSchedule")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {noteOpen && (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
          <label htmlFor={`review-note-${item.type}-${item.id}`} className="text-[12px] font-semibold text-orange-900">
            {t("noteBox.label")} <span className="font-normal">{t("noteBox.recorded")}</span>
          </label>
          <textarea
            id={`review-note-${item.type}-${item.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[13px] text-text-body focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder={t("noteBox.placeholder")}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => move("changes_requested", { note })}
              disabled={busy || note.trim().length === 0}
              className={`${btn} bg-orange-600 text-white hover:bg-orange-700`}
            >
              {t("noteBox.send")}
            </button>
            <button type="button" onClick={() => setNoteOpen(false)} className={ghost}>
              {t("noteBox.cancel")}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 grid gap-4 border-t border-divider pt-3 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">{t("details.checklist")}</h4>
            <QualityChecklist item={item} />
          </div>
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-text-muted">
                <Quote className="h-3.5 w-3.5" aria-hidden="true" /> {t("details.citation")}
              </h4>
              <p className="rounded-lg bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-text-body">
                {item.citationPreview}
              </p>
              {!item.verifiedAt && (
                <p className="mt-1 text-[11px] text-text-muted">{t("details.unverifiedNote")}</p>
              )}
            </div>
            <div>
              <label
                htmlFor={`reviewer-${item.type}-${item.id}`}
                className="mb-2 block text-[12px] font-bold uppercase tracking-wide text-text-muted"
              >
                {t("details.reviewer")}
              </label>
              <select
                id={`reviewer-${item.type}-${item.id}`}
                defaultValue={item.assignedReviewer?.id ?? ""}
                onChange={(e) => assign(e.target.value)}
                disabled={busy}
                className="w-full max-w-xs rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-body"
              >
                <option value="">{t("details.unassigned")}</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">{t("details.history")}</h4>
              <VersionHistory item={item} canRestore={canRestore} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewQueueClient({ items: initial, reviewers, viewerId, canRestore }: Props) {
  const t = useTranslations("adminReview");
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<CanonicalStatus | "all">("all");

  const filters = useMemo(() => {
    const present = new Map<CanonicalStatus, number>();
    for (const item of items) present.set(item.status, (present.get(item.status) ?? 0) + 1);
    return [
      { value: "all" as const, count: items.length },
      ...[...present.entries()].map(([status, count]) => ({ value: status, count })),
    ];
  }, [items]);

  function handleChanged(id: string, type: string, status: CanonicalStatus | "removed") {
    setItems((prev) =>
      status === "removed"
        ? prev.filter((i) => !(i.id === id && i.type === type))
        : prev.map((i) => (i.id === id && i.type === type ? { ...i, status } : i)),
    );
  }

  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              filter === f.value
                ? "bg-brand text-white shadow-sm"
                : "border border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
            }`}
          >
            {f.value === "all" ? t("filters.all") : t(`status.${f.value}`)}
            <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">({f.count})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" />}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <ItemCard
              key={`${item.type}-${item.id}`}
              item={item}
              reviewers={reviewers}
              viewerId={viewerId}
              canRestore={canRestore}
              onChanged={handleChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
