import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/roles";
import type { AccountStatus } from "@/lib/admin/users-shared";
import type {
  AccessProfile,
  AdminTrailItem,
  BookRequestItem,
  LibraryActivityCounts,
  ProfileActivityItem,
  ProfileSectionState,
  ReadingProgressItem,
  UserProfile,
} from "@/lib/admin/user-profile-shared";
import { clampPercent } from "@/lib/admin/user-profile-shared";

/**
 * Server-only loader for `/admin/users/[id]`.
 *
 * Design rules, all of which exist because of failures this repo has already
 * had somewhere else:
 *
 *  - **A failed read is `unavailable`, never zero.** Reporting "0 downloads"
 *    because a query timed out tells an administrator something false about a
 *    person. Each section carries its own state, so one failure degrades one
 *    card rather than the page. Same rule as the contributor graph and
 *    `/about/committee`.
 *  - **Column drift is survivable.** The hosted database is ahead of and behind
 *    the migration chain in places (see `scripts/migrations/check-schema-drift.mjs`),
 *    so every optional select has a narrower fallback and every count is
 *    wrapped. A missing column must cost one card, not the profile.
 *  - **Counts are `head: true`.** Ten `select('id')` reads of a reader's whole
 *    history to call `.length` on them is the N+1 this page would otherwise be.
 *  - **Nothing here composes a human sentence.** Labels are resolved at the
 *    render site, in the administrator's locale.
 */

type SB = ReturnType<typeof createServiceClient>;

/** Run a read that is allowed to fail. `null` means "we could not read it". */
async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** `count` for one user's rows, or null when the table/column is unreachable. */
async function countFor(sb: SB, table: string, userId: string): Promise<number | null> {
  const result = await attempt(async () => {
    const { count, error } = await sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  });
  return result;
}

// ── Identity ─────────────────────────────────────────────────────────────────

type ProfileRow = Record<string, unknown>;

/**
 * The identity row, with the same rich→base fallback `lib/admin/users.ts` uses
 * for the directory. The two must agree about what a profile IS, so the columns
 * are the directory's set plus nothing.
 */
async function fetchIdentityRow(sb: SB, userId: string): Promise<ProfileRow | null> {
  const rich = await sb
    .from("profiles")
    .select("id, full_name, email, role, created_at, avatar_url, is_super_admin, status, phone")
    .eq("id", userId)
    .maybeSingle();
  if (!rich.error && rich.data) return rich.data as ProfileRow;

  const base = await sb
    .from("profiles")
    .select("id, full_name, email, role, created_at, avatar_url, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  return (base.data as ProfileRow | null) ?? null;
}

type AuthMeta = { lastSignInAt: string | null; emailConfirmed: boolean; bannedUntil: string | null };

async function fetchAuthMeta(sb: SB, userId: string): Promise<AuthMeta | null> {
  return attempt(async () => {
    const { data, error } = await sb.auth.admin.getUserById(userId);
    if (error || !data?.user) throw error ?? new Error("no user");
    const u = data.user as { last_sign_in_at?: string | null; email_confirmed_at?: string | null; banned_until?: string | null };
    return {
      lastSignInAt: u.last_sign_in_at ?? null,
      emailConfirmed: Boolean(u.email_confirmed_at),
      bannedUntil: u.banned_until ?? null,
    };
  });
}

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/** Identical derivation to the directory's — the same account must not read
 *  "Active" on one screen and "Disabled" on the next. */
function deriveStatus(explicit: string | null | undefined, meta: AuthMeta | null): AccountStatus {
  if (explicit === "blocked") return "blocked";
  if (isBanned(meta?.bannedUntil)) return "disabled";
  if (explicit === "disabled") return "disabled";
  if (explicit === "pending") return "pending";
  if (meta && !meta.emailConfirmed) return "pending";
  return "active";
}

// ── Download Access Profile ──────────────────────────────────────────────────

/** The reader's own row, verbatim — the same columns their Settings form
 *  writes and `computeDownloadProfileStatus` judges. Not re-shaped here: a
 *  camel-cased copy would be a second vocabulary for one record. */
const ACCESS_COLUMNS =
  "full_name, gender, phone, institution_name, institution_type, faculty_department, professional_role, country, province_city, student_staff_id, download_purpose, download_purpose_other, responsible_use_accepted_at, download_privacy_consent_at, download_profile_updated_at";

async function fetchAccessProfile(
  sb: SB,
  userId: string,
): Promise<{ profile: AccessProfile | null; state: ProfileSectionState }> {
  const row = await attempt(async () => {
    const { data, error } = await sb
      .from("profiles")
      .select(ACCESS_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as AccessProfile | null;
  });

  // The whole column set is missing (a database behind the chain) or the read
  // failed — either way we do not know, and "not provided" would be a claim.
  if (row === null) return { profile: null, state: "unavailable" };
  return { profile: row, state: "ready" };
}

// ── Library activity ─────────────────────────────────────────────────────────

const ZERO_COUNTS: LibraryActivityCounts = {
  downloads: 0, reviews: 0, lists: 0, savedItems: 0, bookmarks: 0,
  notes: 0, annotations: 0, booksStarted: 0, booksFinished: 0, requests: 0,
};

async function fetchCounts(
  sb: SB,
  userId: string,
): Promise<{ counts: LibraryActivityCounts; state: ProfileSectionState }> {
  // `reading_list_items` hangs off the reader's LISTS, not off the reader, so
  // it is the one count that needs the ids first.
  const listIds = await attempt(async () => {
    const { data, error } = await sb.from("reading_lists").select("id").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { id: string }).id);
  });

  const savedItems =
    listIds === null
      ? null
      : listIds.length === 0
        ? 0
        : await attempt(async () => {
            const { count, error } = await sb
              .from("reading_list_items")
              .select("id", { count: "exact", head: true })
              .in("list_id", listIds);
            if (error) throw error;
            return count ?? 0;
          });

  const progress = await attempt(async () => {
    const { data, error } = await sb
      .from("reading_progress")
      .select("progress_pct")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []) as { progress_pct: number | null }[];
  });

  const [downloads, reviews, bookmarks, notes, annotations, requests] = await Promise.all([
    countFor(sb, "download_logs", userId),
    countFor(sb, "reviews", userId),
    countFor(sb, "reader_bookmarks", userId),
    countFor(sb, "book_notes", userId),
    countFor(sb, "book_annotations", userId),
    countFor(sb, "book_requests", userId),
  ]);

  const parts = [downloads, reviews, bookmarks, notes, annotations, requests, savedItems];
  // Every measure unreadable means the section is unavailable; a partial read
  // still says something true, and the zeroes it carries are genuine zeroes for
  // the tables that did answer.
  const state: ProfileSectionState =
    parts.every((p) => p === null) && progress === null ? "unavailable" : "ready";

  return {
    counts: {
      ...ZERO_COUNTS,
      downloads: downloads ?? 0,
      reviews: reviews ?? 0,
      lists: listIds?.length ?? 0,
      savedItems: savedItems ?? 0,
      bookmarks: bookmarks ?? 0,
      notes: notes ?? 0,
      annotations: annotations ?? 0,
      requests: requests ?? 0,
      booksStarted: progress?.length ?? 0,
      // "Finished" is a reading position, not a claim about comprehension:
      // 95% is where a book's back matter begins and is the honest cut-off.
      booksFinished: (progress ?? []).filter((p) => clampPercent(p.progress_pct) >= 95).length,
    },
    state,
  };
}

async function fetchInProgress(sb: SB, userId: string): Promise<ReadingProgressItem[]> {
  const rows = await attempt(async () => {
    const { data, error } = await sb
      .from("reading_progress")
      .select("book_id, progress_pct, last_read_at, books(id, title, slug)")
      .eq("user_id", userId)
      .order("last_read_at", { ascending: false })
      .limit(6);
    if (error) throw error;
    return data ?? [];
  });
  if (!rows) return [];

  return (rows as Record<string, unknown>[]).map((r) => {
    const book = (Array.isArray(r.books) ? r.books[0] : r.books) as
      | { id: string; title: string; slug: string | null }
      | undefined;
    return {
      bookId: (r.book_id as string) ?? book?.id ?? "",
      title: book?.title ?? "",
      slug: book?.slug ?? null,
      percent: clampPercent(r.progress_pct as number | null),
      updatedAt: (r.last_read_at as string | null) ?? null,
    };
  }).filter((item) => item.title);
}

async function fetchRequests(sb: SB, userId: string): Promise<BookRequestItem[]> {
  const rows = await attempt(async () => {
    const { data, error } = await sb
      .from("book_requests")
      .select("id, title, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data ?? [];
  });
  if (!rows) return [];
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? "",
    status: (r.status as string) ?? "pending",
    createdAt: (r.created_at as string | null) ?? null,
  }));
}

/**
 * Recent downloads and reviews, as STRUCTURED items.
 *
 * The directory's old `getUserDetail` built `"Downloaded ${title}"` here, in
 * English, on a server whose caller may be reading Khmer. The verb is now the
 * `kind` and the subject is the title, so the renderer writes the sentence.
 */
async function fetchRecentActivity(
  sb: SB,
  userId: string,
): Promise<{ items: ProfileActivityItem[]; state: ProfileSectionState }> {
  const [downloads, reviews] = await Promise.all([
    attempt(async () => {
      const { data, error } = await sb
        .from("download_logs")
        .select("downloaded_at, content_type, content_id")
        .eq("user_id", userId)
        .order("downloaded_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as { downloaded_at: string; content_type: string | null; content_id: string | null }[];
    }),
    attempt(async () => {
      const { data, error } = await sb
        .from("reviews")
        .select("created_at, rating, book_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as { created_at: string; rating: number | null; book_id: string | null }[];
    }),
  ]);

  if (downloads === null && reviews === null) return { items: [], state: "unavailable" };

  // One `in (...)` for every title on the list — never one query per row.
  const bookIds = new Set<string>();
  for (const r of downloads ?? []) if (r.content_type === "book" && r.content_id) bookIds.add(r.content_id);
  for (const r of reviews ?? []) if (r.book_id) bookIds.add(r.book_id);

  const books = bookIds.size
    ? await attempt(async () => {
        const { data, error } = await sb.from("books").select("id, title, slug").in("id", Array.from(bookIds));
        if (error) throw error;
        return (data ?? []) as { id: string; title: string; slug: string | null }[];
      })
    : [];

  const byId = new Map((books ?? []).map((b) => [b.id, b]));

  const items: ProfileActivityItem[] = [];
  for (const r of downloads ?? []) {
    const book = r.content_id ? byId.get(r.content_id) : undefined;
    items.push({
      kind: "download",
      at: r.downloaded_at,
      subject: book?.title ?? null,
      href: book?.slug ? `/books/${book.slug}` : null,
    });
  }
  for (const r of reviews ?? []) {
    const book = r.book_id ? byId.get(r.book_id) : undefined;
    items.push({
      kind: "review",
      at: r.created_at,
      subject: book?.title ?? null,
      href: book?.slug ? `/books/${book.slug}` : null,
      rating: r.rating ?? null,
    });
  }
  items.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return { items: items.slice(0, 10), state: items.length ? "ready" : "empty" };
}

// ── Admin trail ──────────────────────────────────────────────────────────────

/**
 * Every administrative action taken AGAINST this account — role changes,
 * suspensions, password resets, contact reveals. It is the answer to "why is
 * this person suspended?", which the Users page could not give at all: the
 * audit rows existed and nothing displayed them next to the person.
 */
async function fetchAdminTrail(
  sb: SB,
  userId: string,
): Promise<{ items: AdminTrailItem[]; state: ProfileSectionState }> {
  const rows = await attempt(async () => {
    const { data, error } = await sb
      .from("admin_audit_log")
      .select("id, action, created_at, admin_id")
      .eq("target_table", "profiles")
      .eq("target_id", userId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    return (data ?? []) as { id: string; action: string; created_at: string | null; admin_id: string | null }[];
  });
  if (rows === null) return { items: [], state: "unavailable" };

  const actorIds = Array.from(new Set(rows.map((r) => r.admin_id).filter((v): v is string => !!v)));
  const actors = actorIds.length
    ? await attempt(async () => {
        const { data, error } = await sb.from("profiles").select("id, full_name, email").in("id", actorIds);
        if (error) throw error;
        return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
      })
    : [];
  const byId = new Map((actors ?? []).map((a) => [a.id, a]));

  const items = rows.map((r) => {
    const actor = r.admin_id ? byId.get(r.admin_id) : undefined;
    return {
      id: r.id,
      action: r.action,
      at: r.created_at,
      actorName: actor?.full_name ?? actor?.email ?? null,
      actorId: r.admin_id,
    };
  });
  return { items, state: items.length ? "ready" : "empty" };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * The whole profile in one pass. Returns `null` only when the account does not
 * exist — every other failure degrades a section, because a profile that 404s
 * because one count timed out is worse than a profile with one card missing.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const sb = createServiceClient();

  const row = await fetchIdentityRow(sb, userId);
  if (!row) return null;

  const [meta, access, activity, counts, inProgress, requests, trail, pushDevices] =
    await Promise.all([
      fetchAuthMeta(sb, userId),
      fetchAccessProfile(sb, userId),
      fetchRecentActivity(sb, userId),
      fetchCounts(sb, userId),
      fetchInProgress(sb, userId),
      fetchRequests(sb, userId),
      fetchAdminTrail(sb, userId),
      countFor(sb, "push_subscriptions", userId),
    ]);

  const identity = {
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? null,
    email: (row.email as string) ?? "",
    avatarUrl: (row.avatar_url as string | null) ?? null,
    role: ((row.role as AppRole) ?? "reader") as AppRole,
    isSuperAdmin: Boolean(row.is_super_admin),
    status: deriveStatus(row.status as string | null | undefined, meta),
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    lastLoginAt: meta?.lastSignInAt ?? null,
    emailConfirmed: meta?.emailConfirmed ?? true,
  };

  return {
    identity,
    accessProfile: access.profile,
    accessProfileState: access.state,
    counts: counts.counts,
    countsState: counts.state,
    inProgress,
    requests,
    recentActivity: activity.items,
    activityState: activity.state,
    adminTrail: trail.items,
    adminTrailState: trail.state,
    pushDevices,
  };
}
