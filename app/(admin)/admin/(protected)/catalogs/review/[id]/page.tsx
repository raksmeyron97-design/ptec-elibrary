// app/admin/catalogs/review/[id]/page.tsx
// One record in a language review queue (docs/CATALOG-REVIEW.md): the record
// editor, with the queue's position, previous/next and the review state.
// Everything about the queue comes from the URL, so a refresh, a bookmark or
// back/forward lands on the same record in the same queue with the same filters.

import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { catalogReviewEnabled } from "@/lib/catalogs/review-flag";
import { loadProfileNames, loadReviewIndex, loadReviewRow, reviewFingerprint } from "@/lib/catalogs/review-server";
import {
  changedSinceVerified,
  claimState,
  matchesReviewQuery,
  parseReviewQuery,
  queuePosition,
  reviewQueueOf,
  reviewRecordHref,
  sortQueue,
  statusOf,
} from "@/lib/catalogs/review";
import { kohaItemTypeFor } from "@/lib/koha/item-types";
import { loadCatalogEditorData } from "../../edit/[id]/load-record";
import ReviewWorkspace from "./_components/ReviewWorkspace";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CatalogReviewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!catalogReviewEnabled()) notFound();
  const { userId } = await requireRouteAccess("catalog.review.record");

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = parseReviewQuery((await searchParams) ?? {});

  const supabase = createServiceClient();
  // Three independent reads, in parallel. The queue is read only when the URL
  // names one; without it the page redirects first (below) and reads it then.
  const [editor, rowResult, index] = await Promise.all([
    loadCatalogEditorData(supabase, id),
    loadReviewRow(supabase, id),
    query.language ? loadReviewIndex(supabase, query.language) : Promise.resolve(null),
  ]);
  if (!editor) notFound();
  const { book } = editor;

  // No queue in the URL: put the record in its own language's queue, and say
  // so in the address — so the next refresh means the same thing.
  const recordQueue = reviewQueueOf(book.language);
  if (!query.language && recordQueue) redirect(reviewRecordHref(id, { ...query, language: recordQueue }));

  const now = new Date();
  const row = rowResult.ok ? rowResult.row : null;

  // Previous / next stay inside the URL's queue — never the record's new one if
  // a librarian has just changed its language.
  let position: { position: number | null; total: number } | null = null;
  let prevHref: string | null = null;
  let nextHref: string | null = null;
  if (index?.ok) {
    const sorted = sortQueue(index.items, query.sort);
    const at = queuePosition(sorted, { id, callNumber: book.ddc }, (item) => matchesReviewQuery(item, query, userId, now));
    position = { position: at.position, total: at.total };
    prevHref = at.prevId ? reviewRecordHref(at.prevId, query) : null;
    nextHref = at.nextId ? reviewRecordHref(at.nextId, query) : null;
  }

  const names = await loadProfileNames(supabase, [row?.assignedTo, row?.reviewedBy]);

  return (
    <ReviewWorkspace
      key={id}
      editor={editor}
      query={query}
      recordQueue={recordQueue}
      position={position}
      prevHref={prevHref}
      nextHref={nextHref}
      kohaBiblioId={book.koha_biblio_id ?? null}
      itemType={kohaItemTypeFor(book.language)}
      stateUnavailable={!rowResult.ok || (index !== null && !index.ok)}
      initial={{
        status: statusOf(row),
        version: row?.version ?? 0,
        claim: claimState(row, userId, now),
        holderName: row?.assignedTo ? names.get(row.assignedTo) ?? null : null,
        claimedAt: row?.claimedAt ?? null,
        reviewerName: row?.reviewedBy ? names.get(row.reviewedBy) ?? null : null,
        reviewedAt: row?.reviewedAt ?? null,
        blockedReason: row?.blockedReason ?? null,
        blockedNote: row?.blockedNote ?? null,
        changedSinceVerified: changedSinceVerified(row, reviewFingerprint(book)),
      }}
    />
  );
}
