"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, BookOpen, Check, CheckCheck, ClipboardCheck, Clock,
  ExternalLink, Eye, GraduationCap, History, Pencil, Quote, RotateCcw,
  ShieldAlert, ShieldCheck, Undo2, UserCheck, UserPlus, X,
} from "lucide-react";
import {
  assignReviewer,
  claimReviewItem,
  transitionContent,
  verifyReviewItem,
  type ReviewItem,
  type ReviewPerson,
} from "@/app/actions/review";
import {
  getContentVersions,
  restoreContentVersion,
  type ContentVersion,
} from "@/app/actions/content-versions";
import { STATUS_META, type CanonicalStatus } from "@/lib/content-status";
import {
  REVIEW_QUEUE_TABS,
  belongsToPendingView,
  claimedByAnother,
  queueTabParam,
  type QueueTab,
} from "@/lib/review/queues";
import {
  CHANGE_REASONS,
  hasChangeRationale,
  type ChangeReason,
} from "@/lib/review/change-reasons";
import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";

const GRADE_STYLES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-lime-100 text-lime-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-red-100 text-red-800",
};

type Props = {
  /** One page of the active queue — the server does the slicing. */
  items: ReviewItem[];
  tab: QueueTab;
  /** Canonical status, or "all". Meaningless on the unverified-live tab. */
  statusFilter: string;
  /** Counts over the whole tab, not the current page. */
  statusCounts: { value: CanonicalStatus | "all"; count: number }[];
  tabCounts: Record<QueueTab, number>;
  /** Current ?size=, carried across tab/filter links so it survives them. */
  size?: string;
  unverifiedLiveCapped: boolean;
  reviewers: ReviewPerson[];
  viewerId: string;
  canRestore: boolean;
  /**
   * Whether this viewer may mutate each of the two collections the queue
   * covers. Read-only viewers see the whole queue — the backlog, the metadata,
   * the validation state, the publish blockers — and none of the controls that
   * change it. The buttons are hidden rather than disabled: a row of greyed-out
   * "Approve / Request changes / Archive" is noise to someone who will never be
   * able to press them, and it says nothing a disabled control could explain.
   *
   * Hiding is a rendering decision, never the boundary — every one of these
   * actions re-checks the same permission on the server.
   */
  canWriteBooks: boolean;
  canWriteResearch: boolean;
  /** Assignment is its own policy (`*.review.assign`), so it is its own prop. */
  canAssignBooks: boolean;
  canAssignResearch: boolean;
};

/**
 * Queue links drop ?page= on purpose — switching tab or filter lands you on
 * page 1 of the new list, never on a page number that only made sense for the
 * previous one.
 */
function queueHref(opts: { tab: QueueTab; status?: string; size?: string }): string {
  const params = new URLSearchParams();
  const tabParam = queueTabParam(opts.tab);
  if (tabParam) params.set("tab", tabParam);
  if (opts.status && opts.status !== "all") params.set("status", opts.status);
  if (opts.size) params.set("size", opts.size);
  const qs = params.toString();
  return qs ? `/admin/review?${qs}` : "/admin/review";
}

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

/**
 * The document itself, one click away and inside the card.
 *
 * Mounted only when asked — the point of the reader budget work elsewhere in
 * this app is that nobody pays for bytes they have not requested, and a queue
 * of ten cards each streaming a PDF would be the opposite. It is the browser's
 * own viewer over the authenticated proxy route, not a second pdf.js instance:
 * the reviewer is checking that the file opens and matches the metadata, which
 * is exactly what a plain viewer answers.
 */
function FilePreview({ item }: { item: ReviewItem }) {
  const t = useTranslations("adminReview.details");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-field inline-flex items-center gap-1.5 rounded text-[12px] font-semibold text-brand hover:underline"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {t("openFile")}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-field inline-flex items-center gap-1.5 rounded text-[12px] font-semibold text-text-muted hover:text-brand"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> {t("closeFile")}
        </button>
        <a
          href={item.fileHref}
          target="_blank"
          rel="noreferrer"
          className="focus-field inline-flex items-center gap-1.5 rounded text-[12px] font-semibold text-brand hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> {t("openFileNewTab")}
        </a>
      </div>
      <iframe
        src={item.fileHref}
        title={t("filePreviewTitle", { title: item.title })}
        className="h-[420px] w-full rounded-lg border border-divider bg-paper"
      />
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
  variant,
  reviewers,
  viewerId,
  canRestore,
  canWriteBooks,
  canWriteResearch,
  canAssignBooks,
  canAssignResearch,
  onChanged,
}: {
  item: ReviewItem;
  variant: QueueTab;
  reviewers: ReviewPerson[];
  viewerId: string;
  canRestore: boolean;
  canWriteBooks: boolean;
  canWriteResearch: boolean;
  canAssignBooks: boolean;
  canAssignResearch: boolean;
  onChanged: (id: string, type: string, status: CanonicalStatus | "removed") => void;
}) {
  /** This row's collection decides, not the page's. */
  const canMutate = item.type === "book" ? canWriteBooks : canWriteResearch;
  const canAssign = item.type === "book" ? canAssignBooks : canAssignResearch;
  const t = useTranslations("adminReview");
  const tReason = useTranslations("adminReview.reasons");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reasons, setReasons] = useState<ChangeReason[]>([]);
  const TypeIcon = item.type === "book" ? BookOpen : GraduationCap;
  const meta = STATUS_META[item.status];
  const missing = item.quality.missingRequired;
  const isOwn = item.createdBy?.id === viewerId;
  const claimedBy = claimedByAnother(item, viewerId);

  const isLiveQueue = variant === "unverifiedLive";

  async function move(to: CanonicalStatus, opts?: { note?: string; reasons?: string[] }) {
    setBusy(true);
    const res = await transitionContent(item.type, item.id, to, opts);
    setBusy(false);
    if ("error" in res) {
      toast.error(res.error || t("toasts.failed"));
      return;
    }
    setNoteOpen(false);
    setNote("");
    setReasons([]);
    toast.success(t("toasts.updated"));
    // Queue 2 holds exactly "published AND unverified", so any transition at
    // all takes the record out of it. Everywhere else the tab's own membership
    // rule decides — the same selector that built this list.
    const next: ReviewItem = { ...item, status: to };
    const removed =
      isLiveQueue ||
      to === "published" ||
      to === "archived" ||
      !belongsToPendingView(variant, next, viewerId);
    onChanged(item.id, item.type, removed ? "removed" : to);
  }

  async function verifyInPlace() {
    setBusy(true);
    const res = await verifyReviewItem(item.type, item.id);
    setBusy(false);
    if ("error" in res) {
      toast.error(res.error || t("toasts.failed"));
      return;
    }
    toast.success(t("toasts.verified"));
    onChanged(item.id, item.type, "removed");
  }

  async function assign(reviewerId: string) {
    setBusy(true);
    const res = await assignReviewer(item.type, item.id, reviewerId || null);
    setBusy(false);
    if ("error" in res) toast.error(res.error || t("toasts.failed"));
    else toast.success(t("toasts.reviewerUpdated"));
  }

  async function takeOver() {
    setBusy(true);
    const res = await claimReviewItem(item.type, item.id);
    setBusy(false);
    if ("error" in res) toast.error(res.error || t("toasts.failed"));
    else toast.success(t("toasts.takenOver"));
  }

  function toggleReason(reason: ChangeReason) {
    setReasons((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]));
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
            {/* Ownership on the front of the card, not three clicks in: "who is
                reviewing this?" is one of the questions the queue exists to
                answer, and it was only visible inside Details. */}
            <span className="inline-flex items-center gap-1 rounded-full border border-divider px-2 py-0.5 text-[11px] font-semibold text-text-muted">
              <UserCheck className="h-3 w-3" aria-hidden="true" />
              {item.assignedReviewer
                ? item.assignedReviewer.id === viewerId
                  ? t("assignedToYou")
                  : t("assignedTo", { name: item.assignedReviewer.name })
                : t("details.unassigned")}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.type === "book" ? t("typeBook") : t("typeThesis")}
            </span>
            <span className="text-[11px] text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>

          {/* tabIndex -1 so the list can move focus here after a card leaves
              the queue; it is never in the tab order itself. */}
          <h3 tabIndex={-1} className="mt-1.5 text-[15px] font-bold leading-snug text-text-heading focus-field rounded">{item.title}</h3>
          <p className="text-[13px] text-text-muted">
            {t("by", { author: item.author })}
            {item.createdBy && <> · {t("addedBy", { name: item.createdBy.name })}{isOwn && ` ${t("you")}`}</>}
          </p>

          {/* Verification provenance: the stamp is worth what the name on it is
              worth, so the name travels with it. */}
          {item.verifiedAt && (
            <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-success-text">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {item.verifiedBy
                ? t("verifiedProvenance", {
                    name: item.verifiedBy.name,
                    date: new Date(item.verifiedAt).toLocaleDateString(),
                  })
                : t("verifiedProvenanceUnknown", {
                    date: new Date(item.verifiedAt).toLocaleDateString(),
                  })}
            </p>
          )}

          {/* Advisory, never a lock — see claimedByAnother(). */}
          {claimedBy && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-soft px-2.5 py-1.5 text-[12px] text-info-text">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("claimedBy", { name: claimedBy.name })}</span>
              {canAssign && (
                <button
                  type="button"
                  onClick={takeOver}
                  disabled={busy}
                  className="focus-field inline-flex items-center gap-1 rounded-md border border-info-line bg-bg-surface px-2 py-0.5 text-[11px] font-semibold text-info-text hover:bg-paper disabled:opacity-60"
                >
                  <UserPlus className="h-3 w-3" aria-hidden="true" /> {t("actions.takeOver")}
                </button>
              )}
            </p>
          )}

          {missing.length > 0 && (
            <p
              id={isLiveQueue ? `verify-blocked-${item.type}-${item.id}` : undefined}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-danger"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              {isLiveQueue
                ? t("verifyBlocked", { fields: missing.join(", ") })
                : t("missing", { fields: missing.join(", ") })}
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
            {/* The edit form is a `write` route; offering it to a read-only
                reviewer only routes them to a 403. */}
            {canMutate && (
              <Link href={item.editUrl} className={ghost}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.edit")}
              </Link>
            )}
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

          {/* Every control below mutates. One gate, so a read-only viewer sees a
              queue card that is purely informational rather than a row of dead
              buttons. */}
          {canMutate && (
          <div className="flex flex-wrap items-center gap-2">
            {isLiveQueue && (
              <>
                <button
                  type="button"
                  onClick={verifyInPlace}
                  disabled={busy || missing.length > 0}
                  aria-describedby={missing.length > 0 ? `verify-blocked-${item.type}-${item.id}` : undefined}
                  className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.verifyMetadata")}
                </button>
                <button
                  type="button"
                  onClick={() => setNoteOpen((v) => !v)}
                  disabled={busy}
                  className={`${btn} bg-orange-500 text-white hover:bg-orange-600`}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.unpublishRequestChanges")}
                </button>
              </>
            )}
            {!isLiveQueue && (item.status === "needs_review" || item.status === "imported") && (
              <button type="button" onClick={() => move("in_review")} disabled={busy} className={`${btn} bg-info text-white hover:bg-info/90`}>
                {t("actions.startReview")}
              </button>
            )}
            {!isLiveQueue && (item.status === "needs_review" || item.status === "in_review") && (
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
            {!isLiveQueue && item.status === "changes_requested" && (
              <>
                <button type="button" onClick={() => move("needs_review")} disabled={busy} className={`${btn} bg-info text-white hover:bg-info/90`}>
                  {t("actions.resubmit")}
                </button>
                <button type="button" onClick={() => move("archived")} disabled={busy} className={ghost}>
                  {t("actions.archive")}
                </button>
              </>
            )}
            {!isLiveQueue && item.status === "verified" && (
              <button type="button" onClick={() => move("published")} disabled={busy} className={`${btn} bg-success text-white hover:bg-success/90`}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.publishNow")}
              </button>
            )}
            {!isLiveQueue && item.status === "scheduled" && (
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
          )}
        </div>
      </div>

      {noteOpen && (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
          {/* Structured reasons + the sentence. The categories make "what do we
              send records back for?" answerable across a term; the sentence is
              what the editor actually acts on. Either alone is enough to send
              it back — requiring both makes "Other" unusable. */}
          <fieldset>
            <legend className="text-[12px] font-semibold text-orange-900">{t("noteBox.reasonsLabel")}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CHANGE_REASONS.map((reason) => {
                const checked = reasons.includes(reason);
                return (
                  <label
                    key={reason}
                    className={`focus-shell inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
                      checked
                        ? "border-orange-400 bg-orange-100 text-orange-900"
                        : "border-orange-200 bg-white text-orange-800 hover:border-orange-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleReason(reason)}
                      className="h-3.5 w-3.5 rounded-sm border-orange-300 accent-[var(--ptec-brand)]"
                    />
                    {tReason(reason)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label htmlFor={`review-note-${item.type}-${item.id}`} className="mt-3 block text-[12px] font-semibold text-orange-900">
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
              onClick={() => move(isLiveQueue ? "draft" : "changes_requested", { note, reasons })}
              disabled={busy || !hasChangeRationale(reasons, note)}
              className={`${btn} bg-orange-600 text-white hover:bg-orange-700`}
            >
              {isLiveQueue ? t("noteBox.sendUnpublish") : t("noteBox.send")}
            </button>
            <button type="button" onClick={() => setNoteOpen(false)} className={ghost}>
              {t("noteBox.cancel")}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 grid gap-4 border-t border-divider pt-3 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">{t("details.checklist")}</h4>
              <QualityChecklist item={item} />
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">{t("details.file")}</h4>
              <FilePreview item={item} />
            </div>
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
            {canAssign && (
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
            )}
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">{t("details.history")}</h4>
              <VersionHistory item={item} canRestore={canRestore && canMutate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewQueueClient({
  items: initialItems,
  tab,
  statusFilter,
  statusCounts,
  tabCounts,
  size,
  unverifiedLiveCapped,
  reviewers,
  viewerId,
  canRestore,
  canWriteBooks,
  canWriteResearch,
  canAssignBooks,
  canAssignResearch,
}: Props) {
  const t = useTranslations("adminReview");
  // Optimistic state over this page's slice only: the server remounts this
  // component on every navigation, so a removed card never reappears and a
  // stale slice never outlives its URL.
  const [items, setItems] = useState(initialItems);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * After a card leaves the queue, move to the next one.
   *
   * Deliberately NOT an auto-advance that acts on its own: the record is
   * removed, focus lands on the next card's heading and the count is
   * announced, so a reviewer working a backlog keeps their place without the
   * page deciding anything for them. An action that scrolled and then
   * pre-selected the next record is how a stray Enter verifies the wrong book.
   */
  function handleChanged(id: string, type: string, status: CanonicalStatus | "removed") {
    if (status !== "removed") {
      setItems((prev) => prev.map((i) => (i.id === id && i.type === type ? { ...i, status } : i)));
      return;
    }

    // Computed from the current list rather than inside the updater: a state
    // updater has to be pure, and this one schedules focus and an announcement.
    const index = items.findIndex((i) => i.id === id && i.type === type);
    const next = items.filter((i) => !(i.id === id && i.type === type));
    const following = next[Math.min(index, next.length - 1)];

    setItems(next);
    setAnnouncement(
      next.length === 0 ? t("announce.queueClear") : t("announce.remaining", { count: next.length }),
    );
    if (following) {
      // After paint: the node does not exist until the list re-renders.
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector<HTMLElement>(`[data-review-card="${following.type}-${following.id}"] h3`)
          ?.focus();
      });
    }
  }

  const tabs: { value: QueueTab; attention: boolean }[] = REVIEW_QUEUE_TABS.map((value) => ({
    value,
    // A dot means "somebody is waiting on you", so it is drawn for the two
    // queues that mean exactly that and not for the backlog as a whole.
    attention:
      (value === "mine" || value === "unassigned" || value === "unverifiedLive") &&
      tabCounts[value] > 0,
  }));

  return (
    <div>
      {/* Queue switch. Five views over two fetches: four readings of the
          submitted backlog — everything, mine, unclaimed, sent back — plus the
          separate job of checking something readers can already cite. */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-divider" aria-label={t("tabs.label")}>
        {tabs.map((tabDef) => {
          const active = tab === tabDef.value;
          return (
            <Link
              key={tabDef.value}
              href={queueHref({ tab: tabDef.value, size })}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active
                  ? "border-brand text-brand"
                  : "border-transparent text-text-muted hover:text-text-body"
              }`}
            >
              {tabDef.attention && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning-line" aria-hidden="true" />
              )}
              {t(`tabs.${tabDef.value}`)}
              <span className="tabular-nums text-[11px] opacity-70">({tabCounts[tabDef.value]})</span>
            </Link>
          );
        })}
      </div>

      {tab === "unverifiedLive" ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-warning-text">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t("unverifiedLiveHint")}
            {unverifiedLiveCapped && ` ${t("unverifiedLiveCapped")}`}
          </span>
        </p>
      ) : (
        <div className="mb-5 flex flex-wrap gap-2">
          {statusCounts.map((f) => {
            const active = statusFilter === f.value;
            return (
              <Link
                key={f.value}
                href={queueHref({ tab, status: f.value, size })}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "border border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
                }`}
              >
                {f.value === "all" ? t("filters.all") : t(`status.${f.value}`)}
                <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">({f.count})</span>
              </Link>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={
            tab === "unverifiedLive" ? <ShieldCheck className="h-6 w-6" /> : <ClipboardCheck className="h-6 w-6" />
          }
          title={t(`empty.${tab}.title`)}
          description={t(`empty.${tab}.description`)}
        />
      ) : (
        <div ref={listRef} className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={`${item.type}-${item.id}`} data-review-card={`${item.type}-${item.id}`}>
              <ItemCard
                item={item}
                variant={tab}
                reviewers={reviewers}
                viewerId={viewerId}
                canRestore={canRestore}
                canWriteBooks={canWriteBooks}
                canWriteResearch={canWriteResearch}
                canAssignBooks={canAssignBooks}
                canAssignResearch={canAssignResearch}
                onChanged={handleChanged}
              />
            </div>
          ))}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
