"use client";
// The review workspace: the ordinary record editor, with the queue around it
// (docs/CATALOG-REVIEW.md). This component owns the review STATE of one record
// — who holds it, whether it is verified or blocked — and the move to the next
// record. The record's fields are the editor's, saved by the editor.
//
// Nothing here moves on before the server said yes: a refused claim, a stale
// version or a failed verification keeps the librarian on this record with the
// reason in front of them.

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Circle, ClipboardList, Lock, MinusCircle, RotateCcw, ShieldCheck, TriangleAlert, Unlock } from "lucide-react";
import type { ReviewTask, ReviewTaskId } from "@/lib/catalogs/review-tasks";
import type { ProvenanceView } from "@/lib/catalogs/provenance";
import EditBookWizard from "../../../edit/[id]/_components/EditBookWizard";
import type { CatalogEditorData } from "../../../edit/[id]/load-record";
import { Badge, ConfirmDialog, type BadgeTone } from "@/components/admin/kit";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import {
  BLOCK_NOTE_MAX,
  BLOCK_REASONS,
  reviewListHref,
  type BlockReason,
  type ClaimState,
  type ReviewQuery,
  type ReviewQueue,
  type ReviewStatus,
} from "@/lib/catalogs/review";
import {
  blockCatalogReview,
  claimCatalogReview,
  releaseCatalogReview,
  reopenCatalogReview,
  takeOverCatalogReview,
  unblockCatalogReview,
  unwaiveCatalogTask,
  waiveCatalogTask,
  verifyCatalogReview,
  type ReviewActionResult,
} from "../../actions";

export type ReviewSnapshot = {
  status: ReviewStatus;
  version: number;
  claim: ClaimState;
  holderName: string | null;
  claimedAt: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  blockedReason: BlockReason | null;
  blockedNote: string | null;
  waivedTasks: string[];
  changedSinceVerified: boolean;
};

// Set just before moving to the next record, read by the record that arrives:
// focus goes to its "Record N of M" heading, so a keyboard or screen reader
// user lands on where they are rather than on <body>. A callback ref, not an
// effect: FormShell renders the context panel inline first and moves it to the
// sidebar in a layout effect on wide screens, which REPLACES the heading node —
// so the flag stays up briefly and whichever node is attached last takes focus.
let focusOnArrival = false;
let arrivalTimer: ReturnType<typeof setTimeout> | null = null;

const UNHELD = { claim: "none" as const, holderName: null, claimedAt: null };

const STATUS_TONE: Record<ReviewStatus, BadgeTone> = {
  needs_review: "warning",
  in_review: "info",
  verified: "success",
  blocked: "danger",
};

export default function ReviewWorkspace({
  editor,
  query,
  recordQueue,
  position,
  prevHref,
  nextHref,
  initial,
  kohaBiblioId,
  itemType,
  stateUnavailable,
  tasks: initialTasks,
  duplicates,
  provenance,
}: {
  editor: CatalogEditorData;
  query: ReviewQuery;
  /** The queue the record's own language puts it in (may differ from the URL's after an edit). */
  recordQueue: ReviewQueue | null;
  position: { position: number | null; total: number } | null;
  prevHref: string | null;
  nextHref: string | null;
  initial: ReviewSnapshot;
  kohaBiblioId: number | null;
  /** BK / BKEN, decided on the server by lib/koha/item-types.ts. */
  itemType: string;
  /** The review table could not be read: the record can still be edited, not reviewed. */
  stateUnavailable: boolean;
  /** The record's tasks as last saved (lib/catalogs/review-tasks.ts). */
  tasks: ReviewTask[];
  /** Other records sharing this one's ISBN, or its title and author. */
  duplicates: { id: string; title: string; author: string | null; isbn: string | null }[];
  /** Where each value came from (lib/catalogs/provenance.ts); null when it could not be read. */
  provenance: (ProvenanceView & { byName: string | null })[] | null;
}) {
  const t = useTranslations("adminCatalog.review");
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [stale, setStale] = useState(false);
  const [state, setState] = useState(initial);
  // The server's answer moves on when the page is refreshed (Reload after a
  // stale press, or a re-render after a save). Adopt it when ITS version
  // changes — during render, not in an effect, and without remounting, so
  // unsaved edits in the editor survive. Local answers to this page's own
  // presses arrive through setState and are not overwritten by an older prop.
  const [seenVersion, setSeenVersion] = useState(initial.version);
  if (initial.version !== seenVersion) {
    setSeenVersion(initial.version);
    setState(initial);
    setStale(false);
    setMessage(null);
  }
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState<BlockReason>("book_not_found");
  const [blockNote, setBlockNote] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (!el || !focusOnArrival) return;
    el.focus();
    arrivalTimer ??= setTimeout(() => {
      focusOnArrival = false;
      arrivalTimer = null;
    }, 1000);
  }, []);

  const listHref = reviewListHref(query);
  const queueLabel = query.language ? t(`queue.${query.language}`) : t("queue.none");
  const positionText = position?.position
    ? t("positionOf", { position: position.position, total: position.total })
    : position
      ? t("notInList", { total: position.total })
      : t("noQueue");

  function describe(result: Extract<ReviewActionResult, { ok: false }>): string {
    if (result.error === "stale") setStale(true);
    if (result.error === "open_tasks") {
      return t("error.open_tasks", { tasks: (result.tasks ?? []).map((id) => t(`task.${id}`)).join(", ") });
    }
    if (result.error === "held_by_other") {
      return t("error.held_by_other", { name: state.holderName ?? t("someoneElse") });
    }
    return t(`error.${result.error}`);
  }

  /** Run one transition; update local state from the server's answer only. */
  async function run(
    call: () => Promise<ReviewActionResult>,
    onOk: (r: Extract<ReviewActionResult, { ok: true }>) => Partial<ReviewSnapshot>,
    okText?: string,
  ): Promise<string | null> {
    let result: ReviewActionResult;
    try {
      result = await call();
    } catch {
      result = { ok: false, error: "failed" };
    }
    if (!result.ok) {
      const text = describe(result);
      setMessage({ tone: "error", text });
      return text;
    }
    const ok = result;
    setState((s) => ({ ...s, ...onOk(ok), status: ok.status, version: ok.version }));
    setMessage(okText ? { tone: "ok", text: okText } : null);
    return null;
  }

  const mine = { claim: "mine" as const, holderName: t("you"), claimedAt: new Date().toISOString() };

  function take() {
    startTransition(async () => {
      await run(
        () => (state.claim === "other" || state.claim === "stale"
          ? takeOverCatalogReview(editor.book.id, state.version)
          : claimCatalogReview(editor.book.id, state.version)),
        () => mine,
        t("claimed"),
      );
    });
  }

  function release() {
    startTransition(async () => {
      await run(() => releaseCatalogReview(editor.book.id, state.version), () => UNHELD, t("released"));
    });
  }

  function block() {
    startTransition(async () => {
      const refused = await run(
        () => blockCatalogReview(editor.book.id, state.version, blockReason, blockNote),
        () => ({ ...UNHELD, blockedReason: blockReason, blockedNote: blockNote.trim() || null }),
        t("blocked"),
      );
      if (!refused) setBlockOpen(false);
    });
  }

  function unblock() {
    startTransition(async () => {
      await run(() => unblockCatalogReview(editor.book.id, state.version), () => ({ blockedReason: null, blockedNote: null }), t("unblocked"));
    });
  }

  function reopen() {
    startTransition(async () => {
      await run(() => reopenCatalogReview(editor.book.id, state.version), () => ({ changedSinceVerified: false }), t("reopened"));
    });
  }

  function goNext() {
    focusOnArrival = true;
    router.push(nextHref ?? `${listHref}${listHref.includes("?") ? "&" : "?"}done=1`);
  }

  /** The editor calls this after a successful save (or at once when nothing changed). */
  async function after(intent: "next" | "verify", versionAfterSave?: number): Promise<string | null> {
    // The save may have written provenance to the review row; its version is the one to press with.
    const version = versionAfterSave ?? state.version;
    if (intent === "verify") {
      const refused = await run(() => verifyCatalogReview(editor.book.id, version), () => UNHELD);
      if (refused) return refused;
    } else if (state.claim === "mine") {
      // Moving on without verifying hands the record back to the queue.
      const refused = await run(() => releaseCatalogReview(editor.book.id, version), () => UNHELD);
      if (refused) return refused;
    }
    goNext();
    return null;
  }

  const holdNotice = state.claim === "other" ? t("heldNotice", { name: state.holderName ?? t("someoneElse") }) : null;
  const canVerify = !stateUnavailable && state.status !== "verified" && state.status !== "blocked";

  // Waivers change only a waivable task between open and waived; done stays done.
  const tasks = initialTasks.map((task) =>
    task.state === "done" || !task.waivable
      ? task
      : { ...task, state: state.waivedTasks.includes(task.id) ? ("waived" as const) : ("open" as const) },
  );
  const open = tasks.filter((x) => x.state === "open");

  function setWaiver(task: ReviewTaskId, waive: boolean) {
    startTransition(async () => {
      await run(
        () => (waive ? waiveCatalogTask : unwaiveCatalogTask)(editor.book.id, state.version, task),
        (r) => ({ waivedTasks: r.waivedTasks ?? state.waivedTasks }),
        waive ? t("waived", { task: t(`task.${task}`) }) : t("unwaived", { task: t(`task.${task}`) }),
      );
    });
  }
  const disabled = pending || stateUnavailable;

  const panel = (
    <section aria-labelledby="review-record-heading" className="rounded-xl border border-divider bg-paper/50">
      <div className="flex items-start gap-2 border-b border-divider px-4 py-3">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-muted">{queueLabel}</p>
          <h2 id="review-record-heading" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-text-heading focus:outline-none">
            {positionText}
          </h2>
        </div>
      </div>

      <div className="space-y-3 p-4 text-[13px]">
        {stateUnavailable && (
          <p role="alert" className="text-danger-text">{t("stateUnavailable")}</p>
        )}
        {recordQueue && query.language && recordQueue !== query.language && (
          <p className="flex items-start gap-1.5 text-warning-text">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("languageMoved", { queue: t(`queue.${recordQueue}`) })}
          </p>
        )}

        <dl className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">{t("statusLabel")}</dt>
            <dd><Badge tone={STATUS_TONE[state.status]}>{t(`status.${state.status}`)}</Badge></dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">{t("kohaLabel")}</dt>
            <dd className="text-right font-medium text-text-body">
              {kohaBiblioId !== null ? t("kohaLinked", { id: kohaBiblioId }) : t("kohaNotLinked")}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">{t("itemTypeLabel")}</dt>
            <dd className="text-right font-medium text-text-body">
              {itemType} · {t(itemType === "BK" ? "itemType.BK" : "itemType.BKEN")}
            </dd>
          </div>
        </dl>

        {/* Who holds the record. Never colour alone: every state is words. */}
        {state.status === "in_review" && state.claim !== "none" && (
          <p className="text-text-body">
            {state.claim === "mine"
              ? t("heldByYou")
              : state.claim === "stale"
                ? t("heldStale", { name: state.holderName ?? t("someoneElse") })
                : t("heldBy", { name: state.holderName ?? t("someoneElse") })}
          </p>
        )}
        {state.status === "verified" && (
          <p className="text-text-body">
            {t("verifiedBy", {
              name: state.reviewerName ?? t("someoneElse"),
              // The ISO date: the same on the server and in the browser, so no hydration drift.
              date: state.reviewedAt ? state.reviewedAt.slice(0, 10) : "—",
            })}
          </p>
        )}
        {state.changedSinceVerified && state.status === "verified" && (
          <p className="flex items-start gap-1.5 font-medium text-warning-text">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("changedSinceVerified")}
          </p>
        )}
        {state.status === "blocked" && (
          <p className="text-text-body">
            {t("blockedBecause", { reason: t(`blockReason.${state.blockedReason ?? "other"}`) })}
            {state.blockedNote && <span className="mt-1 block text-text-muted">{state.blockedNote}</span>}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {(state.status === "needs_review" || state.status === "in_review") && state.claim !== "mine" && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => (state.claim === "other" ? setConfirmTakeover(true) : take())}
              className={BTN_SECONDARY}
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              {state.claim === "other" || state.claim === "stale" ? t("takeOver") : t("take")}
            </button>
          )}
          {state.claim === "mine" && state.status === "in_review" && (
            <button type="button" disabled={disabled} onClick={release} className={BTN_SECONDARY}>
              <Unlock className="h-4 w-4" aria-hidden="true" />
              {t("release")}
            </button>
          )}
          {state.status === "verified" && (
            <button type="button" disabled={disabled} onClick={reopen} className={BTN_SECONDARY}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("reopen")}
            </button>
          )}
          {state.status === "blocked" && (
            <button type="button" disabled={disabled} onClick={unblock} className={BTN_SECONDARY}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("unblock")}
            </button>
          )}
          {(state.status === "needs_review" || state.status === "in_review") && state.claim !== "other" && !blockOpen && (
            <button type="button" disabled={disabled} onClick={() => setBlockOpen(true)} className={BTN_SECONDARY}>
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {t("block")}
            </button>
          )}
        </div>

        {blockOpen && (
          <div id="review-block-form" className="space-y-2 rounded-lg border border-divider bg-bg-surface p-3">
            <label className="block text-xs font-semibold text-text-body" htmlFor="review-block-reason">{t("blockReasonLabel")}</label>
            <select
              id="review-block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value as BlockReason)}
              className="focus-field h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm"
            >
              {BLOCK_REASONS.map((r) => (
                <option key={r} value={r}>{t(`blockReason.${r}`)}</option>
              ))}
            </select>
            <label className="block text-xs font-semibold text-text-body" htmlFor="review-block-note">
              {blockReason === "other" ? t("blockNoteRequired") : t("blockNote")}
            </label>
            <textarea
              id="review-block-note"
              value={blockNote}
              maxLength={BLOCK_NOTE_MAX}
              onChange={(e) => setBlockNote(e.target.value)}
              rows={2}
              className="focus-field w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={disabled} onClick={block} className={BTN_SECONDARY}>{t("blockConfirm")}</button>
              <button type="button" disabled={pending} onClick={() => setBlockOpen(false)} className={BTN_SECONDARY}>{t("cancel")}</button>
            </div>
          </div>
        )}

        {/* Tasks — "Needs 3 tasks", never a percentage. As last SAVED: a fix
            typed into the form counts once it is saved. */}
        <div className="border-t border-divider pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            {open.length ? t("needsTasks", { count: open.length }) : t("noOpenTasks")}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {tasks.map((task) => {
              const Icon = task.state === "done" ? CheckCircle2 : task.state === "waived" ? MinusCircle : task.tier === "blocking" ? AlertCircle : Circle;
              const tone =
                task.state === "done" ? "text-success-text" : task.state === "waived" ? "text-text-muted" : task.tier === "blocking" ? "text-danger-text" : "text-warning-text";
              return (
                <li key={task.id} className="flex items-start gap-2">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span className={task.state === "open" ? "text-text-body" : "text-text-muted"}>
                      {t(`task.${task.id}`)}
                    </span>
                    {/* The state in words, so it never rests on the icon's colour. */}
                    <span className="ml-1.5 text-[11px] text-text-muted">
                      {task.state === "done"
                        ? t("taskDone")
                        : task.state === "waived"
                          ? t("taskWaived")
                          : task.tier === "blocking"
                            ? t("taskBlocking")
                            : t("taskOpen")}
                    </span>
                    {task.id === "duplicate" && task.state !== "done" && duplicates.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {duplicates.map((d) => (
                          <li key={d.id}>
                            <a href={`/admin/catalogs/review/${d.id}`} className="text-xs font-semibold text-admin-accent-text underline">
                              {d.title}
                            </a>
                            {d.author && <span className="text-xs text-text-muted"> · {d.author}</span>}
                            {d.isbn && <span className="font-mono text-[11px] text-text-muted"> · {d.isbn}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {task.waivable && task.state !== "done" && state.claim !== "other" && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setWaiver(task.id, task.state === "open")}
                      className="focus-field inline-flex min-h-10 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold text-admin-accent-text underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {task.state === "open" ? t(`waive.${task.id}`) : t("undoWaive")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Where the values came from — source, who accepted it, and whether it
            changed since. As SAVED: an unsaved fetch is not a source yet. */}
        <div className="border-t border-divider pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t("provenanceHeading")}</h3>
          {provenance === null ? (
            <p className="mt-2 text-xs text-text-muted">{t("provenanceUnavailable")}</p>
          ) : (
            <dl className="mt-2 space-y-1.5 text-xs">
              {provenance.map((v) => (
                <div key={v.field} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-text-muted">{t(`provenanceField.${v.field}`)}</dt>
                  <dd className="min-w-0 text-right text-text-body">
                    <span className="font-medium">{t(`provenanceSource.${v.source}`)}</span>
                    {v.host && <span className="text-text-muted"> · {v.host}</span>}
                    <span className={`ml-1.5 ${v.state === "changed" ? "font-semibold text-warning-text" : "text-text-muted"}`}>
                      ·{" "}
                      {v.state === "changed"
                        ? t("provenanceChanged", { source: t(`provenanceSource.${v.previousSource ?? "librarian"}`) })
                        : v.state === "accepted"
                          ? t("provenanceAccepted", { name: v.byName ?? t("someoneElse"), date: (v.at ?? "").slice(0, 10) })
                          : t(`provenanceState.${v.state}`)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Results of the panel's own buttons; the editor's save bar reports its own. */}
        <div role="status" aria-live="polite" className="min-h-[1em]">
          {message && (
            <p className={message.tone === "error" ? "text-danger-text" : "text-success-text"}>
              {message.text}
              {stale && (
                <button type="button" onClick={() => router.refresh()} className="ml-2 font-semibold underline">
                  {t("reload")}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <>
      <ConfirmDialog
        open={confirmTakeover}
        title={t("takeOverTitle")}
        description={t("takeOverBody", { name: state.holderName ?? t("someoneElse") })}
        confirmLabel={t("takeOver")}
        onCancel={() => setConfirmTakeover(false)}
        onConfirm={() => {
          setConfirmTakeover(false);
          take();
        }}
      />
      <EditBookWizard
        book={editor.book}
        coverSource={editor.coverSource}
        categories={editor.categories}
        initialCopies={editor.initialCopies}
        koha={editor.koha}
        review={{
          backHref: listHref,
          backLabel: t("backToQueue", { queue: queueLabel }),
          // Under the title, so the queue and place in it are at the top on a
          // phone too, where the panel itself sits below the fields.
          subtitle: `${queueLabel} · ${positionText}`,
          panel,
          prevHref,
          nextHref,
          holdNotice,
          canVerify,
          after,
          queue: query.language,
          onVersion: (version) => setState((s) => ({ ...s, version })),
        }}
      />
    </>
  );
}
