import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getCollectionStats } from "@/lib/collection-stats";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";

/**
 * The Overview's "what the library holds / what is waiting on it" reads — the
 * parts of the page that do NOT follow the date range.
 *
 * Three independent answers, and each one fails on its own: a missing column
 * or a timeout empties that panel (reported as `null`, which the panel renders
 * as "unavailable") and never takes the others down. `null` is deliberately
 * not an empty list — "no reader has asked for anything" and "we could not
 * ask the database" are opposite statements about a library.
 */

export type CollectionCounts = {
  books: number;
  theses: number;
  publications: number;
  printTitles: number;
  /** Physical copies not withdrawn. Null when the count itself failed — the
   *  tile then says so instead of reading as an empty shelf. */
  printCopies: number | null;
  learningPaths: number;
};

export type ReaderRequestKind = "acquisition" | "deposit";
export type ReaderRequestStatus = "pending" | "approved" | "rejected" | "added";

export type ReaderRequestRow = {
  id: string;
  title: string;
  author: string | null;
  kind: ReaderRequestKind;
  status: ReaderRequestStatus;
  createdAt: string;
};

export type ScheduledItem = {
  id: string;
  type: "book" | "research_report" | "post";
  title: string;
  /** ISO timestamp the item goes live. */
  at: string;
  editHref: string;
};

export type CollectionPulse = {
  collection: CollectionCounts | null;
  /** Null when the viewer may not open the requests queue, or the read failed. */
  requests: { pending: number; latest: ReaderRequestRow[] } | null;
  scheduled: ScheduledItem[] | null;
};

const REQUESTS_SHOWN = 5;
const SCHEDULED_SHOWN = 4;

const REQUEST_STATUSES = new Set<ReaderRequestStatus>(["pending", "approved", "rejected", "added"]);

type ServiceClient = ReturnType<typeof createServiceClient>;

async function readCollection(supabase: ServiceClient): Promise<CollectionCounts | null> {
  const [stats, copies] = await Promise.all([
    // THE public counting rule (migration 0103). The tiles must agree with
    // the numbers readers see on the homepage, so they never count on their
    // own — lib/resource-stats-consistency.test.ts holds everyone to that.
    getCollectionStats().catch(() => null),
    supabase
      .from("catalog_copies")
      .select("id", { count: "exact", head: true })
      .or("status.is.null,status.neq.withdrawn"),
  ]);
  if (!stats) return null;
  return {
    books: stats.books,
    theses: stats.theses,
    publications: stats.publications,
    printTitles: stats.physicalCatalogs,
    printCopies: copies.error ? null : (copies.count ?? null),
    learningPaths: stats.learningPaths,
  };
}

async function readRequests(supabase: ServiceClient): Promise<CollectionPulse["requests"]> {
  const pendingQuery = supabase
    .from("book_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const latestQuery = (withKind: boolean) =>
    supabase
      .from("book_requests")
      .select(withKind ? "id, title, author, kind, status, created_at" : "id, title, author, status, created_at")
      .order("created_at", { ascending: false })
      .limit(REQUESTS_SHOWN);

  const [pending, first] = await Promise.all([pendingQuery, latestQuery(true)]);
  // 42703 = undefined column: a database without 0119 has no `kind`. Every
  // row there is an acquisition, which is what the retry reports.
  const latest = first.error?.code === "42703" ? await latestQuery(false) : first;
  if (pending.error || latest.error) return null;

  type Row = {
    id: string;
    title: string | null;
    author: string | null;
    kind?: string | null;
    status: string | null;
    created_at: string;
  };
  return {
    pending: pending.count ?? 0,
    latest: ((latest.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      title: r.title ?? "",
      author: r.author?.trim() || null,
      kind: r.kind === "deposit" ? "deposit" : "acquisition",
      status: REQUEST_STATUSES.has(r.status as ReaderRequestStatus) ? (r.status as ReaderRequestStatus) : "pending",
      createdAt: r.created_at,
    })),
  };
}

const SCHEDULED_SOURCES = [
  { type: "book", table: "books", edit: (id: string) => `/admin/edit/${id}` },
  { type: "research_report", table: "research_reports", edit: (id: string) => `/admin/theses/edit/${id}` },
  { type: "post", table: "posts", edit: (id: string) => `/admin/posts?edit=${id}` },
] as const;

async function readScheduled(
  supabase: ServiceClient,
  allowed: Record<ScheduledItem["type"], boolean>,
  now: Date,
): Promise<ScheduledItem[] | null> {
  const sources = SCHEDULED_SOURCES.filter((s) => allowed[s.type]);
  if (sources.length === 0) return null;
  const results = await Promise.all(
    sources.map((s) =>
      supabase
        .from(s.table)
        .select("id, title, scheduled_at")
        .eq("status", "scheduled")
        .gte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(SCHEDULED_SHOWN),
    ),
  );
  if (results.some((r) => r.error)) return null;

  type Row = { id: string; title: string | null; scheduled_at: string | null };
  return results
    .flatMap((r, i) =>
      ((r.data ?? []) as unknown as Row[])
        .filter((row) => !!row.scheduled_at)
        .map((row) => ({
          id: row.id,
          type: sources[i].type,
          title: row.title ?? "",
          at: row.scheduled_at as string,
          editHref: sources[i].edit(row.id),
        })),
    )
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(0, SCHEDULED_SHOWN);
}

/**
 * @param access which parts the viewer may see — decided by the caller from
 *   the route registry, so a panel never lists records its viewer could not
 *   open. A part the viewer may not see is not read at all.
 */
export async function getCollectionPulse(access: {
  requests: boolean;
  scheduled: Record<ScheduledItem["type"], boolean>;
}): Promise<CollectionPulse> {
  const supabase = createServiceClient();
  const now = new Date();
  const [collection, requests, scheduled] = await Promise.all([
    readCollection(supabase).catch(() => null),
    access.requests ? readRequests(supabase).catch(() => null) : Promise.resolve(null),
    readScheduled(supabase, access.scheduled, now).catch(() => null),
  ]);
  return { collection, requests, scheduled };
}

/** Where each collection tile leads — the admin list for that shelf. */
export const COLLECTION_TILE_HREF = {
  books: EBOOKS_BASE_PATH,
  theses: "/admin/theses",
  publications: "/admin/journals",
  printTitles: "/admin/catalogs",
  printCopies: "/admin/catalogs",
  learningPaths: "/admin/paths",
} as const satisfies Record<keyof CollectionCounts, string>;
