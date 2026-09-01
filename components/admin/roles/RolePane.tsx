"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Lock, Pencil, SearchX, Users } from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import {
  LEVEL_ORDER,
  accessSummary,
  groupLevel,
  groupResourceKeys,
  isLockedRole,
  levelAt,
  visibleGroups,
  type BulkIntent,
  type PermMatrix,
} from "@/lib/admin/roles-shared";
import { isElevatedResource } from "@/lib/admin/access-policy";
import { useAdminViewerIsSuperAdmin } from "@/components/admin/access/AdminCapabilities";
import { GROUP_ICON, LEVEL_ICON, ROLE_ICON } from "./icons";
import LevelLegend from "./LevelLegend";
import ResourceAccessNote from "./ResourceAccessNote";
import { PermPill, PermSegmented, SELECTED_LEVEL_STYLE, WasLevel } from "./PermControl";
import RoleActionsMenu from "./RoleActionsMenu";
import { useResourceText } from "./useResourceText";

/**
 * One role, every feature — the surface where permissions are actually changed.
 *
 * The page used to edit a 5 × 13 grid all at once: pressing "Edit permissions"
 * turned 52 cells live simultaneously, in a horizontally scrolling table where
 * a row's role column was often off-screen from its feature name. Scoping the
 * editor to one role reduces every decision to a single control on a full-width
 * row, and it makes the question the admin is really answering — "what should
 * Librarians be able to do?" — the thing the screen is about.
 *
 * Edits still accumulate across roles: switching roles in the rail keeps the
 * draft and the edit mode, and the sticky bar saves the lot in one call.
 */
export default function RolePane({
  role,
  allRoles,
  userCount,
  draft,
  baseline,
  editMode,
  onEdit,
  onChange,
  onSetGroup,
  onBulkIntent,
  query,
  onClearSearch,
  category,
  openGroups,
  onToggleGroup,
}: {
  role: AppRole;
  allRoles: AppRole[];
  userCount: number;
  draft: PermMatrix;
  baseline: PermMatrix;
  editMode: boolean;
  onEdit: () => void;
  onChange: (role: AppRole, resource: string, level: PermLevel) => void;
  onSetGroup: (role: AppRole, groupId: string, level: PermLevel) => void;
  onBulkIntent: (intent: BulkIntent) => void;
  query: string;
  onClearSearch: () => void;
  category: string;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
}) {
  const t = useTranslations("adminRoles.pane");
  const tMatrix = useTranslations("adminRoles.matrix");
  const tLevels = useTranslations("adminRoles.levels");
  const tGroups = useTranslations("adminRoles.groups");
  const tGroupDesc = useTranslations("adminRoles.groupDescriptions");
  const tOverview = useTranslations("adminRoles.overview");
  const tBulk = useTranslations("adminRoles.bulk");
  const tRoles = useTranslations("adminUsers.roles");
  const tRoleDesc = useTranslations("adminUsers.roleDescriptions");
  const res = useResourceText();
  /* Only a super admin may move the `roles` row (delegation is not transitive
     — ROLES_DELEGATION_RULES). A delegated administrator editing this page sees
     that row as a read-only pill with the reason beside it, rather than a
     control whose every setting the server would refuse. */
  const viewerIsSuperAdmin = useAdminViewerIsSuperAdmin();

  const meta = ROLE_META[role];
  const Icon = ROLE_ICON[role];
  const locked = isLockedRole(role);
  const editable = editMode && !locked;
  const groups = visibleGroups(category, query, res.search);
  const { write, read, none } = accessSummary(draft, role);

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      {/* ── Identity header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-divider px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${meta.bgColor} ${meta.color} ${meta.borderColor}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-lg font-semibold text-text-heading">{tRoles(role)}</h2>
              <span className="text-xs text-text-muted">
                {tOverview("userCount", { count: userCount })}
              </span>
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-md border border-divider bg-paper px-2 py-0.5 text-[11px] font-medium text-text-muted">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {tMatrix("alwaysFull")}
                </span>
              )}
            </div>
            <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-text-muted">
              {tRoleDesc(role)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="font-medium text-success-text">
                {tOverview("fullCount", { count: locked ? write + read + none : write })}
              </span>
              <span className="font-medium text-info-text">
                {tOverview("readCount", { count: locked ? 0 : read })}
              </span>
              <span>{t("noneCount", { count: locked ? 0 : none })}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Reaching the people who hold this role is the other half of the
              job, and it used to mean navigating to Users and re-filtering by
              hand. The link carries the role through. */}
          <Link
            href={`/admin/users?role=${role}`}
            className="focus-field inline-flex h-9 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            {t("viewUsers")}
          </Link>

          {!locked &&
            (editMode ? (
              <RoleActionsMenu role={role} allRoles={allRoles} onIntent={onBulkIntent} />
            ) : (
              <button
                type="button"
                onClick={onEdit}
                className="focus-field inline-flex h-9 items-center gap-2 rounded-lg bg-admin-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-admin-accent-hover"
              >
                <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                {t("editAccess")}
              </button>
            ))}
        </div>
      </div>

      {/* The locked role explains itself. A disabled control with no reason
          reads as a fault; this states the rule, in the neutral tone of a
          policy note rather than the red of an error. */}
      {locked && (
        <p className="flex items-start gap-2.5 border-b border-divider bg-paper/70 px-4 py-3 text-xs leading-relaxed text-text-muted sm:px-5">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold text-text-body">{t("protectedTitle")}</span>{" "}
            {t("protectedBody")}
          </span>
        </p>
      )}

      {/* What the three levels mean, before the list of things to set them on.
          Placed inside the pane rather than in a help panel because the
          question "does Read let them in at all?" is asked at the moment of
          setting a level, not before opening the page. */}
      <div className="border-b border-divider px-4 py-4 sm:px-5">
        <LevelLegend />
      </div>

      {/* ── Feature groups ──────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <SearchX className="h-10 w-10 text-text-muted opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-text-heading">{tMatrix("noMatchesTitle")}</p>
          <p className="mt-1 text-xs text-text-muted">{tMatrix("noMatchesBody")}</p>
          {query && (
            <button
              type="button"
              onClick={onClearSearch}
              className="focus-field mt-4 rounded text-xs font-semibold text-admin-accent-text hover:underline"
            >
              {tMatrix("clearSearch")}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-divider">
          {groups.map((group) => {
            const GroupIcon = GROUP_ICON[group.iconKey];
            const open = openGroups[group.id] !== false; // default open
            const keys = groupResourceKeys(group.id);
            const current = groupLevel(draft, role, keys);

            return (
              <section key={group.id} aria-label={tGroups(group.id)}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-paper/70 px-4 py-2.5 sm:px-5">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    aria-expanded={open}
                    className="focus-field -ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded px-1 py-0.5 text-left"
                  >
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    />
                    <GroupIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-body">
                      {tGroups(group.id)}
                    </span>
                    <span className="hidden truncate text-xs text-text-muted lg:inline">
                      — {tGroupDesc(group.id)}
                    </span>
                  </button>

                  {/* Bulk set for the whole group — the fastest correct way to
                      express "this role owns Content" without thirteen clicks. */}
                  {editable && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="hidden text-[11px] font-medium text-text-muted sm:inline">
                        {tBulk("setAll")}
                      </span>
                      <div className="inline-flex items-center gap-0.5 rounded-lg border border-divider bg-bg-surface p-0.5">
                        {LEVEL_ORDER.map((level) => {
                          const LevelIcon = LEVEL_ICON[level];
                          const active = current === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => onSetGroup(role, group.id, level)}
                              aria-pressed={active}
                              title={tBulk("setGroupTo", {
                                group: tGroups(group.id),
                                level: tLevels(level),
                              })}
                              className={`focus-field inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition sm:h-6 sm:px-1.5 ${
                                active
                                  ? SELECTED_LEVEL_STYLE[level]
                                  : "text-text-muted hover:bg-paper hover:text-text-body"
                              }`}
                            >
                              <LevelIcon className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
                              <span className="sr-only sm:not-sr-only">
                                {tLevels(`${level}Short`)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!editable && (
                    <span className="shrink-0 rounded-md border border-divider bg-bg-surface px-2 py-0.5 text-xs tabular-nums text-text-muted">
                      {group.resources.length}
                    </span>
                  )}
                </div>

                {open && (
                  <ul>
                    {group.resources.map((resource) => {
                      /* `roles` is editable — role management is delegable —
                         but granting it hands over every other permission on
                         this page, so the row is flagged and only a super admin
                         may move it. The refusal is the server's
                         (ROLES_DELEGATION_RULES); this decides whether the
                         editor is shown a control or the reason they have none. */
                      const elevated = isElevatedResource(resource.key);
                      const level = locked ? "write" : levelAt(draft, role, resource.key);
                      const was = levelAt(baseline, role, resource.key);
                      const rowEditable = editable && !locked && (!elevated || viewerIsSuperAdmin);
                      const dirty = rowEditable && level !== was;
                      const description = res.description(resource.key);

                      return (
                        <li
                          key={resource.key}
                          className={`group/row flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t border-divider/60 px-4 py-3 transition-colors hover:bg-paper/40 sm:flex-nowrap sm:px-5 ${
                            dirty ? "bg-gold-50/60" : ""
                          }`}
                        >
                          <div className={`min-w-0 ${editable ? "w-full sm:flex-1" : "flex-1"}`}>
                            <div className="text-sm font-medium text-text-heading">
                              {res.label(resource.key)}
                            </div>
                            {description && (
                              <div className="mt-0.5 text-xs leading-snug text-text-muted">
                                {description}
                              </div>
                            )}
                            {/* Feature · description · what the current level
                                grants — the three things the brief asks every
                                row to show, in that order. */}
                            <ResourceAccessNote
                              resource={resource.key}
                              level={level}
                              elevated={elevated}
                              delegatable={viewerIsSuperAdmin}
                            />
                          </div>

                          {/* Below `sm` the segmented control takes its own
                              line: three labelled segments and a feature
                              description cannot share 414px without one of them
                              being clipped. The read-only badge is narrow enough
                              to stay inline, so view mode keeps one row. */}
                          <div
                            className={`flex shrink-0 items-center justify-end gap-2.5 ${
                              editable ? "w-full sm:w-auto" : ""
                            }`}
                          >
                            {dirty && <WasLevel level={was} />}
                            {rowEditable ? (
                              <PermSegmented
                                value={level}
                                dirty={dirty}
                                onChange={(next) => onChange(role, resource.key, next)}
                                ariaLabel={tMatrix("permFor", {
                                  feature: res.label(resource.key),
                                  role: tRoles(role),
                                })}
                              />
                            ) : (
                              <PermPill level={level} locked={locked || (elevated && editable)} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
