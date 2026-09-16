"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ExternalLink, Sparkles, Star } from "lucide-react";

import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import FeaturedShelfRow from "./FeaturedShelfRow";
import {
  reorderFeaturedBooks,
  unfeatureBook,
  type FeaturedBookRow,
  type FeaturedErrorCode,
} from "@/app/actions/featured-books";
import { PUBLIC_FEATURED_RENDER_LIMIT, moveItem, sameOrder } from "@/lib/books/featured";
import { ebooksFilterUrl } from "@/lib/admin/ebooks-url";

/**
 * The Featured shelf, as a work surface.
 *
 * Three decisions worth stating.
 *
 * **Reordering is a draft until it is saved.** Every other list in this panel
 * commits on interaction, but this one publishes a public ordering, and a
 * mis-drop that instantly reshuffles what readers see is not recoverable by
 * pressing the thing again. So the moves are local, the bar appears the moment
 * the order differs from the server's, and nothing reaches /books until
 * "Save order".
 *
 * **Drag is the shortcut, not the mechanism.** Move up / Move down are real
 * buttons that do the identical `moveItem()` call the drop handler does, so a
 * keyboard user is not working a degraded copy of the feature. Focus follows
 * the moved row and a live region says where it landed — without that, a
 * keyboard reorder is silent and the user has to count.
 *
 * **A read-only viewer gets the shelf and none of the machinery.** `useCan`
 * asks the same registry the Server Action enforces; the drag handle, the move
 * buttons, the `draggable` attribute and the unfeature control are all absent
 * together, because leaving the row draggable while hiding the arrows is a
 * control that only looks gone.
 */
export default function FeaturedBooksClient({ rows }: { rows: FeaturedBookRow[] }) {
  const t = useTranslations("adminEbooks.featured");
  const toast = useToast();
  const router = useRouter();
  const canCurate = useCan("books.feature");

  const serverOrder = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const [order, setOrder] = useState<string[]>(serverOrder);
  const [saving, startSaving] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [unfeatureTarget, setUnfeatureTarget] = useState<FeaturedBookRow | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const focusAfterMove = useRef<string | null>(null);

  // The server is the source of truth for the shelf. A refresh (our own after
  // a save, or somebody else's change arriving on a navigation) replaces the
  // draft rather than being merged into it — merging is how a stale local
  // order silently outlives the list it was made against.
  //
  // Adjusted during render rather than in an effect (React's documented
  // "resetting state when a prop changes" shape): an effect would paint the
  // stale order for one frame first, which on a shelf that has just been
  // saved reads as the save not having taken.
  const [lastServerOrder, setLastServerOrder] = useState(serverOrder);
  if (!sameOrder(lastServerOrder, serverOrder)) {
    setLastServerOrder(serverOrder);
    setOrder(serverOrder);
  }

  // Focus has to follow the row, or a keyboard user presses "Move up" and the
  // button under their finger now belongs to a different book.
  useEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    document.getElementById(`feature-move-up-${id}`)?.focus();
  }, [order]);

  const dirty = !sameOrder(order, serverOrder);

  function describeError(code: FeaturedErrorCode, detail?: string): string {
    // `stale_order` is the one a librarian must actually understand: somebody
    // else changed the shelf, so their draft is about to move a book they
    // never looked at.
    const known = ["stale_order", "forbidden", "rate_limited", "not_featured", "migration_missing"];
    return known.includes(code) ? t(`errors.${code}`) : (detail ?? t("errors.failed"));
  }

  function move(id: string, delta: -1 | 1) {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    focusAfterMove.current = id;
    setOrder((prev) => moveItem(prev, from, to));
    setAnnouncement(
      t("announce.moved", {
        title: byId.get(id)?.title ?? "",
        position: to + 1,
        total: order.length,
      }),
    );
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = order.indexOf(dragId);
    const to = order.indexOf(targetId);
    setOrder((prev) => moveItem(prev, from, to));
    setAnnouncement(
      t("announce.moved", {
        title: byId.get(dragId)?.title ?? "",
        position: to + 1,
        total: order.length,
      }),
    );
    setDragId(null);
  }

  function saveOrder() {
    startSaving(async () => {
      const res = await reorderFeaturedBooks(order);
      if (!res.success) {
        toast.error(describeError(res.code, res.detail));
        // A stale draft must not survive the refusal: pull the real shelf back
        // so the next attempt is made against what is actually there.
        if (res.code === "stale_order") router.refresh();
        return;
      }
      toast.success(t("toasts.orderSaved"));
      router.refresh();
    });
  }

  function confirmUnfeature() {
    if (!unfeatureTarget) return;
    const target = unfeatureTarget;
    setBusyId(target.id);
    startSaving(async () => {
      const res = await unfeatureBook(target.id);
      setBusyId(null);
      setUnfeatureTarget(null);
      if (!res.success) {
        toast.error(describeError(res.code, res.detail));
        return;
      }
      toast.success(t("toasts.removed", { title: target.title }));
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title={t("empty.title")}
        description={t("empty.description")}
        action={
          canCurate ? (
            <Link
              href={ebooksFilterUrl({ status: "published", verification: "verified" })}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <Star className="h-4 w-4" aria-hidden="true" />
              {t("empty.action")}
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Where these books actually appear. A curation tool that does not say
          what it merchandises makes the librarian guess. */}
      <p className="flex items-start gap-2 rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-text-body">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <span>
          {t("placement", { count: rows.length })}{" "}
          <Link href="/books" target="_blank" className="font-semibold text-brand hover:underline">
            {t("viewPublic")}
            <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
          </Link>
        </span>
      </p>

      {/* Stated, never silent. There is no cap on how many books may be
          featured, but /books renders a bounded number of them — a librarian
          who curates past it must be told, not left wondering why position 31
          never appears. */}
      {rows.length > PUBLIC_FEATURED_RENDER_LIMIT && (
        <p className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("overRenderLimit", { shown: PUBLIC_FEATURED_RENDER_LIMIT, total: rows.length })}</span>
        </p>
      )}

      <ol className="space-y-2">
        {order.map((id, index) => {
          const book = byId.get(id);
          if (!book) return null;
          return (
            <FeaturedShelfRow
              key={book.id}
              book={book}
              index={index}
              total={order.length}
              canCurate={canCurate}
              saving={saving}
              isBusy={busyId === book.id}
              isDragging={dragId === book.id}
              onMove={move}
              onDragStart={setDragId}
              onDragEnd={() => setDragId(null)}
              onDrop={dropOn}
              onRemove={setUnfeatureTarget}
            />
          );
        })}
      </ol>

      {/* Announced, never only shown: a reorder done from the keyboard has no
          visual anchor for a screen-reader user. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {canCurate && dirty && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-brand-line bg-surface-brand-soft px-4 py-3 shadow-lg">
          <p className="text-[13px] font-medium text-text-body">{t("unsaved")}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOrder(serverOrder)}
              disabled={saving}
              className="focus-field inline-flex h-9 items-center rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition-colors hover:bg-paper disabled:opacity-50"
            >
              {t("discard")}
            </button>
            <button
              type="button"
              onClick={saveOrder}
              disabled={saving}
              className="focus-field inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? t("saving") : t("saveOrder")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={unfeatureTarget !== null}
        title={t("removeDialog.title")}
        description={t("removeDialog.description", { title: unfeatureTarget?.title ?? "" })}
        hint={t("removeDialog.hint")}
        tone="brand"
        confirmLabel={t("removeDialog.confirm")}
        busyLabel={t("removeDialog.busy")}
        busy={saving}
        onCancel={() => setUnfeatureTarget(null)}
        onConfirm={confirmUnfeature}
      />
    </div>
  );
}
