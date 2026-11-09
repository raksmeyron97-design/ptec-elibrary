import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan } from "@/lib/db/paged-scan";
import {
  preferStored,
  providerAvatarUrl,
  providerFullName,
} from "@/lib/auth/oauth-avatar";
import { ALL_ROLES, type AppRole } from "@/lib/types/roles";
import {
  type UserRow,
  type UsersSummary,
  type AccountStatus,
  type UserSort,
  type JoinedRange,
  rolesForFilter,
} from "@/lib/admin/users-shared";

/**
 * Server-only data layer for the admin Users page.
 *
 * Merges profiles (role, name, avatar, created_at, status, phone) with
 * auth.users metadata (last_sign_in_at, email_confirmed_at, banned_until,
 * and the identity provider's photo/name) via the service-role admin API. No
 * membership/borrowing — the library is free and unlimited.
 *
 * The provider photo is carried because `listUsers()` already returns
 * `user_metadata` on every row — it costs nothing here, and without it every
 * Google reader drew initials while their photo sat one field away. The
 * precedence rule is `lib/auth/oauth-avatar.ts`'s, not this file's.
 *
 * SCALE NOTE: filtering/sort/pagination run in memory over the candidate set
 * (bounded by USERS_SCAN_CAP). Correct and fast for a university library
 * (hundreds–low thousands). Past that, push filters into a Postgres view/RPC.
 *
 * The candidate set is read with `pagedScan()`, never one `.limit()`: PostgREST
 * clips every response at db-max-rows (1000) whatever the request asks for, so
 * the old `.limit(2000)` silently returned 1000 profiles in heap order. The
 * moment the library passed 1,000 accounts the page read "Total users 1000",
 * and because the read had no ORDER BY the accounts it dropped were mostly the
 * NEWEST — readers who had just registered were in the notifications bell and
 * nowhere in the list. The KPI cards are exact `count` requests, which are not
 * clipped.
 */

/** Ceiling on the in-memory candidate set (and on one export). */
export const USERS_SCAN_CAP = 20_000;
type SB = ReturnType<typeof createServiceClient>;

// ── auth.users metadata ──────────────────────────────────────────────────────
type AuthMeta = {
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  bannedUntil: string | null;
  avatarUrl: string | null;
  fullName: string | null;
};

async function loadAuthMeta(sb: SB): Promise<Map<string, AuthMeta>> {
  const map = new Map<string, AuthMeta>();
  try {
    const perPage = 1000;
    for (let page = 1; page <= Math.ceil(USERS_SCAN_CAP / perPage); page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        const metadata = u.user_metadata as Record<string, unknown> | undefined;
        map.set(u.id, {
          lastSignInAt: u.last_sign_in_at ?? null,
          emailConfirmed: Boolean(u.email_confirmed_at),
          bannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
          avatarUrl: providerAvatarUrl(metadata),
          fullName: providerFullName(metadata),
        });
      }
      if (data.users.length < perPage) break;
    }
  } catch {
    /* Admin API unavailable — degrade to profile-only metadata. */
  }
  return map;
}

function isBanned(bannedUntil: string | null): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/** Effective status: explicit profile override → auth ban → unconfirmed → active. */
function deriveStatus(explicit: string | null | undefined, meta: AuthMeta | undefined): AccountStatus {
  if (explicit === "blocked") return "blocked";
  if (isBanned(meta?.bannedUntil ?? null)) return "disabled";
  if (explicit === "disabled") return "disabled";
  if (explicit === "pending") return "pending";
  if (meta && !meta.emailConfirmed) return "pending";
  return "active";
}

const RICH_COLUMNS = "id, full_name, email, role, created_at, avatar_url, is_super_admin, status, phone";
const BASE_COLUMNS = "id, full_name, email, role, created_at, avatar_url, is_super_admin";

/** Every profile, paged past the 1000-row cap. Try the status/phone columns first; fall back to the base set. */
async function fetchProfiles(
  sb: SB,
): Promise<{ rows: Record<string, unknown>[]; hasStatusCol: boolean; truncated: boolean }> {
  const scan = (columns: string) =>
    pagedScan<Record<string, unknown>>(
      // `id` is unique, so pages neither overlap nor skip a row.
      (from, to) => sb.from("profiles").select(columns).order("id").range(from, to),
      USERS_SCAN_CAP,
    );

  const rich = await scan(RICH_COLUMNS);
  if (!rich.error) return { rows: rich.data, hasStatusCol: true, truncated: rich.truncated };

  const base = await scan(BASE_COLUMNS);
  if (base.error) {
    // "We could not read the directory" must not render as "nobody is registered".
    throw new Error(`Could not read profiles: ${base.error.message ?? base.error.code ?? "unknown error"}`);
  }
  return { rows: base.data, hasStatusCol: false, truncated: base.truncated };
}

// ── main list query ──────────────────────────────────────────────────────────
export type GetUsersParams = {
  q?: string;
  role?: string;
  status?: string;
  joined?: JoinedRange;
  sort?: UserSort;
  page: number;
  pageSize: number;
};

export type GetUsersResult = {
  rows: UserRow[];
  total: number;
  hasAnyAtAll: boolean;
  /** The directory holds more than USERS_SCAN_CAP accounts — `total` is a floor, not a count. */
  truncated: boolean;
};

function joinedCutoff(range: JoinedRange | undefined): number | null {
  const now = Date.now();
  switch (range) {
    case "7d": return now - 7 * 86_400_000;
    case "30d": return now - 30 * 86_400_000;
    case "90d": return now - 90 * 86_400_000;
    case "year": return now - 365 * 86_400_000;
    default: return null;
  }
}

export async function getUsers(params: GetUsersParams): Promise<GetUsersResult> {
  const sb = createServiceClient();
  const { rows: profileRows, hasStatusCol, truncated } = await fetchProfiles(sb);
  const hasAnyAtAll = profileRows.length > 0;
  if (truncated) {
    console.error(`[admin/users] profile scan hit USERS_SCAN_CAP (${USERS_SCAN_CAP}); the list is incomplete`);
  }

  const authMeta = await loadAuthMeta(sb);

  let rows: UserRow[] = profileRows.map((r) => {
    const id = r.id as string;
    const meta = authMeta.get(id);
    const status = deriveStatus(hasStatusCol ? (r.status as string | null) : null, meta);
    return {
      id,
      fullName: preferStored(r.full_name as string | null, meta?.fullName),
      email: (r.email as string) ?? "",
      phone: (r.phone as string | null) ?? null,
      avatarUrl: preferStored(r.avatar_url as string | null, meta?.avatarUrl),
      role: (r.role as AppRole) ?? "reader",
      isSuperAdmin: Boolean(r.is_super_admin),
      status,
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      lastLoginAt: meta?.lastSignInAt ?? null,
      emailConfirmed: meta?.emailConfirmed ?? true,
    };
  });

  // ── in-memory filtering (correct counts + pagination for every filter) ──
  const q = params.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (u) =>
        (u.fullName ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q),
    );
  }
  // A group value (`admins`) selects a tier; anything else must be one real
  // role. An unrecognised value filters nothing rather than emptying the list.
  const roleGroup = rolesForFilter(params.role);
  if (roleGroup) {
    rows = rows.filter((u) => roleGroup.includes(u.role));
  } else if (params.role && ALL_ROLES.includes(params.role as AppRole)) {
    rows = rows.filter((u) => u.role === params.role);
  }
  if (params.status) {
    rows = rows.filter((u) => u.status === params.status);
  }
  const cutoff = joinedCutoff(params.joined);
  if (cutoff !== null) {
    rows = rows.filter((u) => new Date(u.createdAt).getTime() >= cutoff);
  }

  // ── sort ──
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const nameOf = (u: UserRow) => u.fullName ?? u.email;
  switch (params.sort) {
    case "oldest": rows.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); break;
    case "name_asc": rows.sort((a, b) => collator.compare(nameOf(a), nameOf(b))); break;
    case "name_desc": rows.sort((a, b) => collator.compare(nameOf(b), nameOf(a))); break;
    case "recent_login":
      rows.sort((a, b) => (+new Date(b.lastLoginAt ?? 0)) - (+new Date(a.lastLoginAt ?? 0)));
      break;
    case "newest":
    default:
      rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  const total = rows.length;
  const from = (params.page - 1) * params.pageSize;
  const paged = rows.slice(from, from + params.pageSize);

  return { rows: paged, total, hasAnyAtAll, truncated };
}

// ── summary / KPI cards ──────────────────────────────────────────────────────
export async function getUsersSummary(): Promise<UsersSummary> {
  const sb = createServiceClient();

  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  /* Exact counts, never a row scan: a `head: true` count is not subject to
     PostgREST's 1000-row cap, so these numbers stay true at any size. A failed
     count throws rather than rendering a zero that reads as a fact. */
  const base = () => sb.from("profiles").select("id", { count: "exact", head: true });
  const count = async (
    narrow: (q: ReturnType<typeof base>) => ReturnType<typeof base> = (q) => q,
  ): Promise<number> => {
    const { count: n, error } = await narrow(base());
    if (error) throw new Error(`Could not count profiles: ${error.message}`);
    return n ?? 0;
  };

  const [total, newThisMonth, newLastMonth, ...roleCounts] = await Promise.all([
    count(),
    count((q) => q.gte("created_at", startThisMonth)),
    count((q) => q.gte("created_at", startLastMonth).lt("created_at", startThisMonth)),
    ...ALL_ROLES.map((role) =>
      role === "reader"
        // The old scan counted a NULL role as a reader; keep that.
        ? count((q) => q.or("role.eq.reader,role.is.null"))
        : count((q) => q.eq("role", role)),
    ),
  ]);

  const byRole = { reader: 0, staff: 0, librarian: 0, admin: 0, super_admin: 0 } as Record<AppRole, number>;
  ALL_ROLES.forEach((role, i) => { byRole[role] = roleCounts[i]; });

  return { total, byRole, newThisMonth, newLastMonth };
}

// ── detail drawer ────────────────────────────────────────────────────────────
export type ActivityItem = { kind: "download" | "review"; at: string; label: string };

export type UserDetail = {
  downloadCount: number;
  reviewCount: number;
  recentActivity: ActivityItem[];
};

export async function getUserDetail(userId: string): Promise<UserDetail> {
  const sb = createServiceClient();

  const [dlCount, rvCount, recentDl, recentRv] = await Promise.all([
    sb.from("download_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("download_logs")
      .select("downloaded_at, content_type, content_id")
      .eq("user_id", userId)
      .order("downloaded_at", { ascending: false })
      .limit(5),
    sb.from("reviews")
      .select("created_at, rating, book_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Resolve book titles for downloads/reviews in one shot.
  const bookIds = new Set<string>();
  for (const r of (recentDl.data ?? []) as { content_type: string; content_id: string }[]) {
    if (r.content_type === "book" && r.content_id) bookIds.add(r.content_id);
  }
  for (const r of (recentRv.data ?? []) as { book_id: string }[]) {
    if (r.book_id) bookIds.add(r.book_id);
  }
  const titleById = new Map<string, string>();
  if (bookIds.size) {
    const { data } = await sb.from("books").select("id, title").in("id", Array.from(bookIds));
    for (const b of (data ?? []) as { id: string; title: string }[]) titleById.set(b.id, b.title);
  }

  const recentActivity: ActivityItem[] = [];
  for (const r of (recentDl.data ?? []) as { downloaded_at: string; content_type: string; content_id: string }[]) {
    recentActivity.push({
      kind: "download",
      at: r.downloaded_at,
      label: `Downloaded ${titleById.get(r.content_id) ?? r.content_type ?? "an item"}`,
    });
  }
  for (const r of (recentRv.data ?? []) as { created_at: string; rating: number; book_id: string }[]) {
    recentActivity.push({
      kind: "review",
      at: r.created_at,
      label: `Reviewed ${titleById.get(r.book_id) ?? "a book"} (${r.rating}★)`,
    });
  }
  recentActivity.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return {
    downloadCount: dlCount.count ?? 0,
    reviewCount: rvCount.count ?? 0,
    recentActivity: recentActivity.slice(0, 8),
  };
}
