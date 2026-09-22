"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Archive,
  Check,
  CheckCircle2,
  Eye,
  ExternalLink,
  Fingerprint,
  Info,
  Pencil,
  ScanSearch,
  ShieldCheck,
  SplitSquareHorizontal,
  ThumbsDown,
} from "lucide-react";
import { dismissDuplicateGroup, retireDuplicateBook } from "@/app/actions/duplicates";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import EbookCover from "@/components/admin/ebooks/EbookCover";
import DismissGroupDialog from "./DismissGroupDialog";
import { isStrongSignal, type DuplicateCompareField, type DuplicateComparison } from "@/lib/admin/duplicate-review";
import type { DuplicateConfidence, DuplicateSignal } from "@/lib/admin/duplicates";

export type UIBook = {
  id: string;
  slug: string;
  title: string;
  isbn: string | null;
  year: number | null;
  author: string | null;
  pages: number | null;
  fileSizeKb: number | null;
  coverUrl: string | null;
  hasHash: boolean;
  /** Pre-formatted on the server — a client-side date format would differ
   *  from the server render and break hydration. */
  createdLabel: string | null;
};

export type UIGroup = {
  key: string;
  /** Stable identity of this exact membership (0153), used to remember a
   *  dismissal. Computed on the server; the client only relays it. */
  fingerprint: string;
  confidence: DuplicateConfidence;
  /** Which comparable fields agree, differ, or could not be compared. Decided
   *  on the server from the full rows. */
  comparison: DuplicateComparison;
  /** Already ordered for reading by `orderSignals()`. */
  signals: DuplicateSignal[];
  books: UIBook[];
};

/**
 * Confidence is a ladder of evidence strength, not a severity scale — nothing
 * on this page is an error, so none of the three tiers is painted as one.
 * Strongest reads as the most present (brand), then amber, then quiet grey.
 * Colour is never the only channel: each tier also carries its own icon and
 * its spelled-out label.
 */
const CONFIDENCE_UI: Record<
  DuplicateConfidence,
  { chip: string; header: string; rail: string; Icon: typeof Fingerprint }
> = {
  high: {
    chip: "border-surface-brand-line bg-surface-brand-soft text-brand",
    header: "bg-surface-brand-soft/60",
    rail: "bg-brand",
    Icon: Fingerprint,
  },
  medium: {
    chip: "border-warning-line bg-warning-soft text-warning-text",
    header: "bg-warning-soft/60",
    rail: "bg-warning",
    Icon: ScanSearch,
  },
  low: {
    chip: "border-divider bg-paper text-text-muted",
    header: "bg-paper",
    rail: "bg-divider",
    Icon: Eye,
  },
};

/** Reads the detector's own signal list back to the reviewer as evidence.
 *  Identity signals (ISBN, PDF fingerprint) get the affirmative tick; the
 *  corroborating ones stay quiet, because on their own they also describe two
 *  legitimately different editions. */
function Evidence({ group }: { group: UIGroup }) {
  const t = useTranslations("adminDuplicates");

  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-text-muted">
        {t("evidence.title")}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {group.signals.map((signal) => {
          const strong = isStrongSignal(signal);
          return (
            <li key={signal}>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${
                  strong
                    ? "border-success-line bg-success-soft text-success-text"
                    : "border-divider bg-bg-surface text-text-body"
                }`}
              >
                {strong ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Check className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                )}
                {t(`signals.${signal}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * What the records actually say, side by side.
 *
 * The detector reports why these rows were GROUPED; this reports how they
 * compare once grouped, including the fields that disagree. That asymmetry was
 * the gap: a reviewer saw "same title, same author, same year" and nothing at
 * all about the 196-page PDF sitting beside the 1,016-page one.
 *
 * It renders a reading of the rows, never a verdict — measured on production,
 * the page-count spread inside genuine duplicates and inside distinct volumes
 * filed under one truncated title overlaps almost exactly, so any threshold
 * built on this would be tuned on noise. Deciding stays the reviewer's job;
 * seeing is what they were missing.
 *
 * `unknown` is shown rather than dropped, because "no record carries an ISBN"
 * and "the ISBNs match" are opposite statements and the quiet version of this
 * strip would render them identically.
 */
const COMPARISON_CHIP: Record<"differ" | "agree" | "unknown", string> = {
  differ: "border-warning-line bg-warning-soft text-warning-text",
  agree: "border-success-line bg-success-soft text-success-text",
  unknown: "border-divider bg-paper text-text-muted",
};

function Comparison({ comparison }: { comparison: DuplicateComparison }) {
  const t = useTranslations("adminDuplicates");

  const rows: { kind: "differ" | "agree" | "unknown"; fields: DuplicateCompareField[] }[] = [
    { kind: "differ", fields: comparison.differ },
    { kind: "agree", fields: comparison.agree },
    { kind: "unknown", fields: comparison.unknown },
  ];
  if (rows.every((row) => row.fields.length === 0)) return null;

  return (
    <div className="mt-2.5 min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-text-muted">
        {t("comparison.title")}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {rows.map(({ kind, fields }) =>
          fields.map((field) => (
            <li key={`${kind}-${field}`}>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${COMPARISON_CHIP[kind]}`}
              >
                {kind === "differ" && (
                  <SplitSquareHorizontal className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {t(`comparison.${kind}`, { field: t(`fields.${field}`) })}
              </span>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

/**
 * One record inside a group: the keep/duplicate choice, the facts, and the
 * per-record actions.
 *
 * Split out of DuplicateGroupCard because the card had grown past the point
 * where the group-level decisions and the row-level ones read apart. Behaviour
 * and markup are unchanged — the card still owns every piece of state this
 * reads, and passes it down.
 */
function RecordRow({
  book,
  groupKey,
  isCanonical,
  isSuggested,
  differingFields,
  pending,
  retiringId,
  onSelectCanonical,
  onRetire,
}: {
  book: UIBook;
  groupKey: string;
  isCanonical: boolean;
  isSuggested: boolean;
  differingFields: ReadonlySet<DuplicateCompareField>;
  pending: boolean;
  retiringId: string | null;
  onSelectCanonical: (id: string) => void;
  onRetire: (book: UIBook) => void;
}) {
  const t = useTranslations("adminDuplicates");

    // Each fact carries the field it belongs to, so a value that
  // disagrees across the group can be drawn as the thing to look at.
  // Joining them into one string first — which is what this did — is
  // what made the 196-page record indistinguishable from the
  // 1,016-page one sitting directly above it.
  const meta: { field: DuplicateCompareField | null; text: string }[] = [
    { field: "author" as const, text: book.author ?? "" },
    { field: "year" as const, text: book.year ? String(book.year) : "" },
    {
      field: "isbn" as const,
      text: book.isbn ? t("meta.isbn", { value: book.isbn }) : t("meta.noIsbn"),
    },
    { field: "pages" as const, text: book.pages ? t("meta.pages", { count: book.pages }) : "" },
    {
      field: "fileSize" as const,
      text: book.fileSizeKb ? t("meta.size", { size: book.fileSizeKb }) : "",
    },
  ].filter((entry) => entry.text.length > 0);

  return (
    <li
      key={book.id}
      className={`relative flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5 transition-colors ${
        isCanonical ? "bg-success-soft" : "hover:bg-paper/60"
      }`}
    >
      {isCanonical && (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-success" aria-hidden="true" />
      )}

      {/* The whole record is the selection target; the actions sit
          OUTSIDE the label so no interactive element nests inside
          another. */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input
          type="radio"
          name={`canonical-${groupKey}`}
          value={book.id}
          checked={isCanonical}
          onChange={() => onSelectCanonical(book.id)}
          aria-label={t("canonical.keepThis", { title: book.title })}
          className="focus-field mt-1 h-4 w-4 shrink-0 accent-success"
        />
        <EbookCover coverUrl={book.coverUrl} title={book.title} className="h-14 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              dir="auto"
              className={`min-w-0 break-words text-[14px] leading-5 ${
                isCanonical ? "font-bold text-text-heading" : "font-semibold text-text-body"
              }`}
            >
              {book.title}
            </p>
            {isCanonical ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-success-line bg-bg-surface px-1.5 py-0.5 text-[11px] font-bold text-success-text">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {t("canonical.badge")}
              </span>
            ) : (
              <span className="rounded-md border border-divider bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">
                {t("canonical.duplicate")}
              </span>
            )}
          </div>

          <p dir="auto" className="mt-1 break-words text-[12px] leading-4 text-text-body">
            {meta.map((entry, index) => (
              <span key={entry.field ?? index}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {entry.field && differingFields.has(entry.field) ? (
                  // Never colour alone: the value is also bolded and
                  // announced, so the disagreement survives greyscale
                  // and a screen reader.
                  <span className="rounded bg-warning-soft px-1 font-bold text-warning-text">
                    {entry.text}
                    <span className="sr-only"> ({t("comparison.differsSr")})</span>
                  </span>
                ) : (
                  entry.text
                )}
              </span>
            ))}
          </p>
          <p className="mt-1 break-all text-[11px] leading-4 text-text-muted">
            /{book.slug}
            {book.createdLabel ? ` · ${t("meta.added", { date: book.createdLabel })}` : ""}
            {` · ${book.hasHash ? t("meta.hashed") : t("meta.noHash")}`}
          </p>

          {isSuggested && (
            <p className="mt-1.5 text-[11px] font-medium text-text-muted">
              {t("canonical.suggested")}
            </p>
          )}
        </div>
      </label>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
        <Link
          href={`/books/${book.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-field inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-brand transition hover:bg-surface-brand-soft"
        >
          {t("view")}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
        <Link
          href={`/admin/edit/${book.id}`}
          className="focus-field inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-text-muted transition hover:text-text-heading"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          {t("edit")}
        </Link>
        {!isCanonical && (
          <button
            type="button"
            onClick={() => onRetire(book)}
            className="focus-field inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-danger-line hover:bg-danger-soft hover:text-danger-text disabled:opacity-50"
          >
            <Archive className="h-3 w-3" aria-hidden="true" />
            {/* Only the record actually being retired says so — the
                fieldset disables the rest, which is signal enough. */}
            {pending && retiringId === book.id ? t("retireDialog.busy") : t("retire")}
          </button>
        )}
      </div>
    </li>
  );
}

export default function DuplicateGroupCard({ group }: { group: UIGroup }) {
  const t = useTranslations("adminDuplicates");
  const toast = useToast();
  const router = useRouter();

  // The detector sorts each group oldest-record-first, so the head is the
  // default suggestion. It is a DEFAULT, not a decision: nothing happens until
  // an administrator confirms a retire against whatever is selected here.
  const suggestedId = group.books[0]?.id ?? "";
  const [canonicalId, setCanonicalId] = useState(suggestedId);
  const [retireTarget, setRetireTarget] = useState<UIBook | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissNote, setDismissNote] = useState("");
  const [pending, startTransition] = useTransition();

  // A field the reviewer can see disagreeing is the reason they would dismiss,
  // so the two are drawn together rather than in separate parts of the card.
  const differingFields = new Set<DuplicateCompareField>(group.comparison.differ);

  const canonical = useMemo(
    () => group.books.find((book) => book.id === canonicalId) ?? group.books[0],
    [group.books, canonicalId],
  );

  const ui = CONFIDENCE_UI[group.confidence];

  const retire = (retiredId: string) => {
    startTransition(async () => {
      const result = await retireDuplicateBook({ retiredId, canonicalId });
      if (result.success) {
        toast.success(t("toasts.retired", { from: result.redirectFrom, to: result.redirectTo }));
        // Re-runs detection against the catalog as it now stands, so a group
        // that has just been resolved leaves the queue.
        router.refresh();
      } else {
        // The action returns curated, actionable messages (unpublished
        // canonical, record already gone, rate limit) — surface them as-is.
        toast.error(result.error || t("toasts.failed"));
      }
      setRetireTarget(null);
    });
  };

  const dismiss = () => {
    startTransition(async () => {
      const result = await dismissDuplicateGroup({
        bookIds: group.books.map((book) => book.id),
        note: dismissNote.trim() || undefined,
      });
      if (result.success) {
        toast.success(t("dismissDialog.done"));
        setDismissOpen(false);
        setDismissNote("");
        router.refresh();
      } else {
        toast.error(result.error || t("toasts.failed"));
      }
    });
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className={`relative border-b border-divider px-4 py-3 ${ui.header}`}>
        <span className={`absolute inset-y-0 left-0 w-[3px] ${ui.rail}`} aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-bold ${ui.chip}`}
            >
              <ui.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(`confidence.${group.confidence}`)}
            </span>
            <span className="text-[12.5px] font-medium tabular-nums text-text-muted">
              {t("records", { count: group.books.length })}
            </span>
          </div>
          <Evidence group={group} />
        </div>

        <Comparison comparison={group.comparison} />

        {group.confidence === "low" && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-divider bg-bg-surface px-2.5 py-2 text-[11.5px] leading-4 text-text-body">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{t("evidence.manualReview")}</strong>{" "}
              {t("evidence.manualReviewHint")}
            </span>
          </p>
        )}
      </div>

      <fieldset disabled={pending} className="min-w-0">
        <legend className="w-full border-b border-divider px-4 py-2 text-[11px] font-semibold text-text-muted">
          {t("canonical.legend")}
          <span className="ml-1.5 font-normal">{t("canonical.hint")}</span>
        </legend>

        {/* Labelled so the record list is addressable on its own — the
            evidence chips above are a list too. */}
        <ul aria-label={t("canonical.legend")} className="divide-y divide-divider">
          {group.books.map((book) => (
            <RecordRow
              key={book.id}
              book={book}
              groupKey={group.key}
              isCanonical={book.id === canonicalId}
              isSuggested={book.id === suggestedId}
              differingFields={differingFields}
              pending={pending}
              retiringId={retireTarget?.id ?? null}
              onSelectCanonical={setCanonicalId}
              onRetire={setRetireTarget}
            />
          ))}
        </ul>
      </fieldset>

      {/* The other verdict, and the reason this queue can now reach zero.
          It sits AFTER the records rather than in the header: it is the
          conclusion you draw having read them, and putting it beside the
          confidence chip would offer it before there was anything to judge. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider bg-paper px-4 py-2.5">
        <p className="text-[11.5px] leading-4 text-text-muted">{t("dismissDialog.prompt")}</p>
        <button
          type="button"
          onClick={() => setDismissOpen(true)}
          disabled={pending}
          className="focus-field inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:bg-bg-surface hover:text-text-heading disabled:opacity-50"
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
          {t("dismissDialog.action")}
        </button>
      </div>

      <DismissGroupDialog
        open={dismissOpen}
        recordCount={group.books.length}
        note={dismissNote}
        onNoteChange={setDismissNote}
        busy={pending}
        onCancel={() => setDismissOpen(false)}
        onConfirm={dismiss}
      />

      <ConfirmDialog
        open={retireTarget !== null}
        // Archive + redirect, not deletion — the softer "brand" tone keeps the
        // dialog from reading as a delete confirmation for an action that
        // removes nothing.
        tone="brand"
        title={t("retireDialog.title")}
        description={
          retireTarget && canonical ? (
            <>
              <span className="block">{t("retireDialog.lead", { title: retireTarget.title })}</span>
              <span className="mt-3 block rounded-lg border border-divider bg-paper p-3 text-[12px] leading-5">
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                  {t("retireDialog.from")}
                </span>
                <span dir="auto" className="block break-all font-semibold text-text-heading">
                  /books/{retireTarget.slug}
                </span>
                <span className="mt-2 block text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                  {t("retireDialog.to")}
                </span>
                <span dir="auto" className="block break-all font-semibold text-success-text">
                  /books/{canonical.slug}
                </span>
              </span>
              <span className="mt-3 block space-y-1.5 text-[12px] leading-4">
                {[
                  t("retireDialog.effectArchive"),
                  t("retireDialog.effectRedirect"),
                  t("retireDialog.effectPreserve"),
                  t("retireDialog.effectAudit"),
                ].map((line) => (
                  <span key={line} className="flex items-start gap-1.5 text-text-body">
                    <Check className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                    <span>{line}</span>
                  </span>
                ))}
              </span>
            </>
          ) : undefined
        }
        confirmLabel={t("retireDialog.confirm")}
        busyLabel={t("retireDialog.busy")}
        busy={pending}
        onCancel={() => setRetireTarget(null)}
        onConfirm={() => retireTarget && retire(retireTarget.id)}
      />
    </article>
  );
}
