"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
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
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {item.quality.items.map((c) => (
        <div key={c.key} className="flex items-start gap-2 text-[12px]">
          {c.status === "ok" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : c.status === "weak" ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
          <span className={c.status === "ok" ? "text-text-muted" : "font-medium text-text-body"}>
            {c.label}
            {c.required && c.status === "missing" && (
              <span className="ml-1 text-[10px] font-bold uppercase text-red-600">required</span>
            )}
            {c.hint && <span className="block text-[11px] font-normal text-text-muted">{c.hint}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function VersionHistory({ item, canRestore }: { item: ReviewItem; canRestore: boolean }) {
  const [versions, setVersions] = useState<ContentVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const table = item.type === "book" ? "books" : "research_reports";

  function load() {
    startTransition(async () => {
      try {
        setVersions(await getContentVersions(table, item.id));
      } catch {
        setError("Could not load history");
      }
    });
  }

  function restore(versionId: number) {
    if (!window.confirm("Restore this previous version? The current values are snapshotted first, so this can be undone.")) return;
    startTransition(async () => {
      const res = await restoreContentVersion(versionId);
      if ("error" in res) setError(res.error);
      else load();
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
        <History className="h-3.5 w-3.5" /> {pending ? "Loading…" : "Load change history"}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      {versions.length === 0 ? (
        <p className="text-[12px] text-text-muted">
          No recorded changes yet (history starts once migration 0086 is applied).
        </p>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12px]">
            <Clock className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-text-muted">{new Date(v.changedAt).toLocaleString()}</span>
            <span className="font-medium text-text-body">{v.changedBy?.name ?? "System"}</span>
            {v.statusFrom && v.statusTo && v.statusFrom !== v.statusTo && (
              <span className="text-text-muted">
                {v.statusFrom} → {v.statusTo}
              </span>
            )}
            {canRestore && (
              <button
                type="button"
                onClick={() => restore(v.id)}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-divider px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:border-brand/40 hover:text-brand disabled:opacity-60"
              >
                <RotateCcw className="h-3 w-3" /> Restore
              </button>
            )}
          </div>
        ))
      )}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const TypeIcon = item.type === "book" ? BookOpen : GraduationCap;
  const meta = STATUS_META[item.status];
  const missing = item.quality.missingRequired;
  const isOwn = item.createdBy?.id === viewerId;

  async function move(to: CanonicalStatus, opts?: { note?: string }) {
    setBusy(true);
    setError(null);
    const res = await transitionContent(item.type, item.id, to, opts);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setNoteOpen(false);
    setNote("");
    onChanged(item.id, item.type, to === "published" || to === "archived" ? "removed" : to);
  }

  async function assign(reviewerId: string) {
    setBusy(true);
    setError(null);
    const res = await assignReviewer(item.type, item.id, reviewerId || null);
    setBusy(false);
    if ("error" in res) setError(res.error);
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
            <TypeIcon className="h-5 w-5 text-text-muted/50" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${meta.badgeClass}`}>
              {meta.label}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${GRADE_STYLES[item.quality.grade]}`}>
              Quality {item.quality.grade} · {item.quality.score}%
            </span>
            {item.verifiedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
              <TypeIcon className="h-3.5 w-3.5" />
              {item.type === "book" ? "E-Book" : "Thesis"}
            </span>
            <span className="text-[11px] text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>

          <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-text-heading">{item.title}</h3>
          <p className="text-[13px] text-text-muted">
            by {item.author}
            {item.createdBy && <> · added by {item.createdBy.name}{isOwn && " (you)"}</>}
          </p>

          {missing.length > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Missing: {missing.join(", ")}
            </p>
          )}
          {item.reviewNote && (
            <p className="mt-1 rounded-lg bg-orange-50 px-2.5 py-1.5 text-[12px] text-orange-800">
              <span className="font-semibold">Reviewer note:</span> {item.reviewNote}
            </p>
          )}
          {error && <p className="mt-1 text-[12px] font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-col lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={item.editUrl} className={ghost}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
            {item.previewUrl && (
              <a href={item.previewUrl} target="_blank" rel="noreferrer" className={ghost}>
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </a>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} className={ghost}>
              <ClipboardCheck className="h-3.5 w-3.5" /> {expanded ? "Hide details" : "Details"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(item.status === "needs_review" || item.status === "imported") && (
              <button type="button" onClick={() => move("in_review")} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
                Start review
              </button>
            )}
            {(item.status === "needs_review" || item.status === "in_review") && (
              <>
                <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
                  <Check className="h-3.5 w-3.5" /> Approve &amp; publish
                </button>
                <button type="button" onClick={() => move("verified")} disabled={busy} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>
                  <CheckCheck className="h-3.5 w-3.5" /> Verify only
                </button>
                <button type="button" onClick={() => setNoteOpen((v) => !v)} disabled={busy} className={`${btn} bg-orange-500 text-white hover:bg-orange-600`}>
                  <Undo2 className="h-3.5 w-3.5" /> Request changes
                </button>
              </>
            )}
            {item.status === "changes_requested" && (
              <>
                <button type="button" onClick={() => move("needs_review")} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
                  Resubmit for review
                </button>
                <button type="button" onClick={() => move("archived")} disabled={busy} className={ghost}>
                  Archive
                </button>
              </>
            )}
            {item.status === "verified" && (
              <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
                <Check className="h-3.5 w-3.5" /> Publish now
              </button>
            )}
            {item.status === "scheduled" && (
              <>
                <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
                  Publish now
                </button>
                <button type="button" onClick={() => move("verified")} disabled={busy} className={ghost}>
                  Cancel schedule
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {noteOpen && (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
          <label className="text-[12px] font-semibold text-orange-900">
            What needs to change? <span className="font-normal">(recorded and shown to the editor)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[13px] text-text-body focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="e.g. Author name doesn't match the title page; publication year missing"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => move("changes_requested", { note })}
              disabled={busy || note.trim().length === 0}
              className={`${btn} bg-orange-600 text-white hover:bg-orange-700`}
            >
              Send back with note
            </button>
            <button type="button" onClick={() => setNoteOpen(false)} className={ghost}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 grid gap-4 border-t border-divider pt-3 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">Metadata checklist</h4>
            <QualityChecklist item={item} />
          </div>
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-text-muted">
                <Quote className="h-3.5 w-3.5" /> Citation preview
              </h4>
              <p className="rounded-lg bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-text-body">
                {item.citationPreview}
              </p>
              {!item.verifiedAt && (
                <p className="mt-1 text-[11px] text-text-muted">
                  Shown with an “unverified” notice on public pages and excluded from repository feeds until verified.
                </p>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">Assigned reviewer</h4>
              <select
                defaultValue={item.assignedReviewer?.id ?? ""}
                onChange={(e) => assign(e.target.value)}
                disabled={busy}
                className="w-full max-w-xs rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-body"
              >
                <option value="">Unassigned</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">Change history</h4>
              <VersionHistory item={item} canRestore={canRestore} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewQueueClient({ items: initial, reviewers, viewerId, canRestore }: Props) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<CanonicalStatus | "all">("all");

  const filters = useMemo(() => {
    const present = new Map<CanonicalStatus, number>();
    for (const item of items) present.set(item.status, (present.get(item.status) ?? 0) + 1);
    return [
      { label: "All", value: "all" as const, count: items.length },
      ...[...present.entries()].map(([status, count]) => ({
        label: STATUS_META[status].label,
        value: status,
        count,
      })),
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
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
              filter === f.value
                ? "bg-brand text-white shadow-sm"
                : "border border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-[11px] opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-[14px] font-semibold text-text-muted">Nothing waiting for review</p>
          <p className="mt-1 text-[12.5px] text-text-muted">
            Uploads submitted for review will appear here.
          </p>
        </div>
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
