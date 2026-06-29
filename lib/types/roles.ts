export type AppRole =
  | "reader"
  | "staff"
  | "librarian"
  | "admin"
  | "super_admin";

/** Permission level for a role × resource entry */
export type PermLevel = "none" | "read" | "write";

/** All roles that may access the admin panel */
export const ADMIN_PANEL_ROLES: AppRole[] = [
  "staff",
  "librarian",
  "admin",
  "super_admin",
];

/** Roles that can manage books, catalog, research reports, and uploads */
export const LIBRARIAN_ROLES: AppRole[] = [
  "librarian",
  "admin",
  "super_admin",
];

/** Roles that can manage posts and announcements */
export const STAFF_ROLES: AppRole[] = [
  "staff",
  "librarian",
  "admin",
  "super_admin",
];

/** Roles with full admin access (users, system) */
export const ADMIN_ROLES: AppRole[] = ["admin", "super_admin"];

/** Display metadata for each role */
export const ROLE_META: Record<
  AppRole,
  {
    label: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  reader: {
    label: "Reader",
    description: "Default public user — browse and read content only",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    borderColor: "border-slate-200",
  },
  staff: {
    label: "Staff",
    description: "Can manage posts and announcements",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  librarian: {
    label: "Librarian",
    description: "Can manage books, catalog, research reports, and uploads",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  admin: {
    label: "Admin",
    description: "Full library management including user roles",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  super_admin: {
    label: "Super Admin",
    description: "Full access — can assign any role including admin",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
};

/** Ordered list of all roles from least to most privileged */
export const ALL_ROLES: AppRole[] = [
  "reader",
  "staff",
  "librarian",
  "admin",
  "super_admin",
];
