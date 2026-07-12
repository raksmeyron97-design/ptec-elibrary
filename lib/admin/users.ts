import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { ALL_ROLES, type AppRole } from "@/lib/types/roles";
import {
  type UserRow,
  type UsersSummary,
  type AccountStatus,
  type UserSort,
  type JoinedRange,
} from "@/lib/admin/users-shared";

/**
 * Server-only data layer for the admin Users page.
 *
 * Merges profiles (role, name, avatar, created_at, status, phone) with
 * auth.users metadata (last_sign_in_at, email_confirmed_at, banned_until) via
 * the service-role admin API. No membership/borrowing — the library is free
 * and unlimited.
 *
 * SCALE NOTE: filtering/sort/pagination run in memory over the candidate set
 * (bounded by CANDIDATE_CAP). Correct and fast for a university library
 * (hundreds–low thousands). Past that, push filters into a Postgres view/RPC.
 */

const CANDIDATE_CAP = 2000;
type SB = ReturnType<typeof createServiceClient>;

// ── auth.users metadata ──────────────────────────────────────────────────────
type AuthMeta = {
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  bannedUntil: string | null;
};

async function loadAuthMeta(sb: SB): Promise<Map<string, AuthMeta>> {
  const map = new Map<string, AuthMeta>();
  try {
    const perPage = 1000;
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        map.set(u.id, {
          lastSignInAt: u.last_sign_in_at ?? null,
          emailConfirmed: Boolean(u.email_confirmed_at),
          bannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
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

/** Try selecting the status/phone columns; fall back to the base set. */
async function fetchProfiles(sb: SB): Promise<{ rows: Record<string, unknown>[]; hasStatusCol: boolean }> {
  const rich = await sb
    .from("profiles")
    .select("id, full_name, email, role, created_at, avatar_url, is_super_admin, status, phone")
    .limit(CANDIDATE_CAP);
  if (!rich.error) return { rows: (rich.data ?? []) as Record<string, unknown>[], hasStatusCol: true };

  const base = await sb
    .from("profiles")
    .select("id, full_name, email, role, created_at, avatar_url, is_super_admin")
    .limit(CANDIDATE_CAP);
  return { rows: (base.data ?? []) as Record<string, unknown>[], hasStatusCol: false };
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
  const { rows: profileRows, hasStatusCol } = await fetchProfiles(sb);
  const hasAnyAtAll = profileRows.length > 0;

  const authMeta = await loadAuthMeta(sb);

  let rows: UserRow[] = profileRows.map((r) => {
    const id = r.id as string;
    const meta = authMeta.get(id);
    const status = deriveStatus(hasStatusCol ? (r.status as string | null) : null, meta);
    return {
      id,
      fullName: (r.full_name as string | null) ?? null,
      email: (r.email as string) ?? "",
      phone: (r.phone as string | null) ?? null,
      avatarUrl: (r.avatar_url as string | null) ?? null,
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
  if (params.role && ALL_ROLES.includes(params.role as AppRole)) {
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

  return { rows: paged, total, hasAnyAtAll };
}

// ── summary / KPI cards ──────────────────────────────────────────────────────
export async function getUsersSummary(): Promise<UsersSummary> {
  const sb = createServiceClient();

  const { data: profileRows } = await sb
    .from("profiles")
    .select("role, created_at")
    .limit(CANDIDATE_CAP);

  const byRole = { reader: 0, staff: 0, librarian: 0, admin: 0, super_admin: 0 } as Record<AppRole, number>;
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  let newThisMonth = 0;
  let newLastMonth = 0;

  for (const r of profileRows ?? []) {
    const role = ((r as { role: string }).role ?? "reader") as AppRole;
    if (role in byRole) byRole[role]++;
    const created = new Date((r as { created_at: string }).created_at).getTime();
    if (created >= startThisMonth) newThisMonth++;
    else if (created >= startLastMonth) newLastMonth++;
  }

  return { total: (profileRows ?? []).length, byRole, newThisMonth, newLastMonth };
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
