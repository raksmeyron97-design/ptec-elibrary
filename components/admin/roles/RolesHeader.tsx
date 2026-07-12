"use client";

import Link from "next/link";
import { ShieldCheck, Pencil, Users, Clock, PenLine } from "lucide-react";

export default function RolesHeader({
  editMode,
  onEdit,
  lastUpdatedLabel,
  lastUpdatedBy,
}: {
  editMode: boolean;
  onEdit: () => void;
  lastUpdatedLabel: string | null;
  lastUpdatedBy: string | null;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3.5">
        <span className="hidden sm:grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-inset ring-brand/15">
          <ShieldCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-text-heading sm:text-2xl">
            Role Management
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
            Define what each role can see and do across the library. Assign these roles to
            individual people from the Users page.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {lastUpdatedLabel ? (
              <span>
                Permissions last updated{" "}
                <time className="font-medium text-text-body">{lastUpdatedLabel}</time>
                {lastUpdatedBy ? <> by <span className="font-medium text-text-body">{lastUpdatedBy}</span></> : null}
              </span>
            ) : (
              <span>Using the default permission matrix</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Link
          href="/admin/users"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Manage user roles</span>
          <span className="sm:hidden">Users</span>
        </Link>

        {editMode ? (
          <span className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gold-50 px-4 text-sm font-bold text-gold-700 ring-1 ring-inset ring-gold-300">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Editing
          </span>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Edit permissions
          </button>
        )}
      </div>
    </header>
  );
}
