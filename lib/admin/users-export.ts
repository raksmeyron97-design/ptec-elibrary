// Column definitions for the admin Users export. Pure module (unit-tested) —
// the API route (app/api/admin/users/export) pairs this with lib/export/csv
// or lib/export/xlsx.
//
// Deliberately exports only fields the Users page itself shows: identity,
// role, account status, and activity. Never auth secrets, tokens, ban
// metadata, or avatar URLs.

import { defineSheet, type ExportSheet } from "@/lib/export/core";
import { ROLE_META } from "@/lib/types/roles";
import { STATUS_META, type UserRow } from "@/lib/admin/users-shared";

function dateOnly(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function usersExportSheet(rows: UserRow[]): ExportSheet {
  return defineSheet<UserRow>({
    name: "Users",
    rows,
    columns: [
      { key: "id", header: "User ID", value: (u) => u.id, kind: "text", width: 38 },
      { key: "fullName", header: "Full Name", value: (u) => u.fullName, width: 28 },
      { key: "email", header: "Email", value: (u) => u.email, width: 32 },
      // "text" keeps +855 / leading zeros intact in both CSV and XLSX.
      { key: "phone", header: "Phone", value: (u) => u.phone, kind: "text", width: 16 },
      { key: "role", header: "Role", value: (u) => ROLE_META[u.role]?.label ?? u.role },
      { key: "status", header: "Account Status", value: (u) => STATUS_META[u.status]?.label ?? u.status },
      { key: "emailConfirmed", header: "Email Verified", value: (u) => (u.emailConfirmed ? "yes" : "no") },
      { key: "createdAt", header: "Joined Date", value: (u) => dateOnly(u.createdAt), kind: "date", width: 12 },
      { key: "lastLoginAt", header: "Last Login", value: (u) => dateOnly(u.lastLoginAt), kind: "date", width: 12 },
    ],
  });
}
