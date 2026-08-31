"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck, Users } from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import {
  PERMISSION_GROUPS,
  changesByRole,
  countRoleChanges,
  diffMatrix,
  groupResourceKeys,
  isLockedRole,
  previewBulk,
  rowDiffersAcrossRoles,
  setLevels,
  toConflictItems,
  visibleGroups,
  ALL_RESOURCE_KEYS,
  type BulkIntent,
  type ConflictChoice,
  type ConflictItem,
  type PermChange,
  type PermMatrix,
} from "@/lib/admin/roles-shared";
import { saveRolePermissions } from "@/app/(admin)/admin/(protected)/roles/actions";
import { ConfirmDialog, PageHeader } from "@/components/admin/kit";
import RolesStats from "./RolesStats";
import RoleRail, { type RailSelection } from "./RoleRail";
import RolePane from "./RolePane";
import ComparePane from "./ComparePane";
import PermissionToolbar from "./PermissionToolbar";
import { PermPill } from "./PermControl";
import EditActionBar, { type SaveState } from "./EditActionBar";
import ChangeReviewDialog from "./ChangeReviewDialog";
import { useResourceText } from "./useResourceText";
import ConflictDialog, { conflictKey } from "./ConflictDialog";
import { useUnsavedGuard } from "./useUnsavedGuard";

const ALL_GROUP_IDS = PERMISSION_GROUPS.map((g) => g.id);

/** What the confirmation dialog is currently asking about. */
type Pending =
  | { kind: "discard" }
  | { kind: "leave"; href: string }
  | { kind: "bulk"; role: AppRole; intent: BulkIntent; next: PermMatrix; count: number }
  | null;

/**
 * Role Management, as a workspace rather than one editable grid.
 *
 * The rail on the left chooses what the right side is: every role side by side
 * (read-only, for answering "who can do what?"), or one role's access (the only
 * place permissions change). Edits accumulate in a draft across roles, and the
 * single write happens after the review sheet — see EditActionBar and
 * ChangeReviewDialog for why that path is not optional.
 */
export default function RolesWorkspace({
  allRoles,
  roleCounts,
  totalUsers,
  initialMatrix,
  defaultMatrix,
  lastUpdatedLabel,
  lastUpdatedBy,
}: {
  allRoles: AppRole[];
  roleCounts: Record<AppRole, number>;
  totalUsers: number;
  initialMatrix: PermMatrix;
  /** The shipped baseline (`DEFAULT_PERMISSIONS`), for "reset this role". */
  defaultMatrix: Record<AppRole, Record<string, PermLevel>>;
  lastUpdatedLabel: string | null;
  lastUpdatedBy: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("adminRoles.workspace");
  const tHeader = useTranslations("adminRoles.header");
  const tMatrix = useTranslations("adminRoles.matrix");
  const tBulk = useTranslations("adminRoles.bulk");
  const tRoles = useTranslations("adminUsers.roles");
  const [, startTransition] = useTransition();

  // Role-first: the page opens on a role, never on the comparison grid. The
  // landing role is the first non-locked one in catalogue order — deterministic
  // regardless of who happens to hold what, and the least privileged, so the
  // view you arrive in is the one where a stray click matters least.
  const firstEditableRole = allRoles.find((role) => !isLockedRole(role)) ?? allRoles[0];
  const [selection, setSelection] = useState<RailSelection>(firstEditableRole);
  // Where "Back to role view" returns to.
  const [lastRole, setLastRole] = useState<AppRole>(firstEditableRole);
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<PermMatrix>(initialMatrix);
  const [draft, setDraft] = useState<PermMatrix>(initialMatrix);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [updatedLabel, setUpdatedLabel] = useState(lastUpdatedLabel);

  const [conflicts, setConflicts] = useState<ConflictItem[] | null>(null);
  const [conflictChoices, setConflictChoices] = useState<Record<string, ConflictChoice>>({});
  const [pending, setPending] = useState<Pending>(null);
  /** Transient line for outcomes with no dialog of their own. */
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [diffOnly, setDiffOnly] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const changes = useMemo(() => diffMatrix(baseline, draft, allRoles), [baseline, draft, allRoles]);
  const changeCount = changes.length;
  const perRole = useMemo(
    () => changesByRole(changes, allRoles).map((b) => ({ role: b.role, count: b.changes.length })),
    [changes, allRoles],
  );
  const pendingByRole = useMemo(
    () => Object.fromEntries(perRole.map(({ role, count }) => [role, count])),
    [perRole],
  );

  const allExpanded = ALL_GROUP_IDS.every((id) => openGroups[id] !== false);
  const hasActiveFilters = query.trim() !== "" || category !== "all" || diffOnly || !allExpanded;
  const activeFilterCount =
    (category !== "all" ? 1 : 0) + (diffOnly ? 1 : 0) + (!allExpanded ? 1 : 0);

  // The toolbar's result line has to describe what the panes actually render,
  // so it runs the same filter they do rather than counting the catalogue.
  const res = useResourceText();
  const visibleKeys = useMemo(
    () => visibleGroups(category, query, res.search).flatMap((g) => g.resources.map((r) => r.key)),
    [category, query, res],
  );
  const differingCount = useMemo(
    () => visibleKeys.filter((key) => rowDiffersAcrossRoles(draft, allRoles, key)).length,
    [visibleKeys, draft, allRoles],
  );

  // ── Draft edits ──────────────────────────────────────────────────────────
  function clearTransientStatus() {
    if (saveState !== "idle" && saveState !== "saving") {
      setSaveState("idle");
      setSaveMessage(null);
    }
  }

  function handleChange(role: AppRole, resource: string, level: PermLevel) {
    if (isLockedRole(role)) return;
    setDraft((prev) => ({ ...prev, [role]: { ...prev[role], [resource]: level } }));
    clearTransientStatus();
  }

  function handleSetGroup(role: AppRole, groupId: string, level: PermLevel) {
    setDraft((prev) => setLevels(prev, role, groupResourceKeys(groupId), level));
    clearTransientStatus();
  }

  /**
   * A bulk action is previewed, counted, and confirmed before it touches the
   * draft. Applying straight away was the tempting shape and the wrong one:
   * "copy Admin onto Staff" is one click that can move every resource at once,
   * and an editor who mis-picks the source has no way to tell from the result
   * which rows were already like that.
   */
  function requestBulk(role: AppRole, intent: BulkIntent) {
    const next = previewBulk(draft, role, intent, defaultMatrix);
    const count = countRoleChanges(draft, next, role);
    if (count === 0) {
      setSaveState("idle");
      setSaveMessage(null);
      setNotice(t("bulkNoChange"));
      return;
    }
    setNotice(null);
    setPending({ kind: "bulk", role, intent, next, count });
  }

  // ── Mode ─────────────────────────────────────────────────────────────────
  function enterEdit() {
    setEditing(true);
    setSaveState("idle");
    setSaveMessage(null);
  }

  function leaveEdit() {
    setDraft(baseline);
    setEditing(false);
    setSaveState("idle");
    setSaveMessage(null);
    setReviewOpen(false);
    setConflicts(null);
  }

  function requestDiscard() {
    if (changeCount === 0) {
      setEditing(false);
      return;
    }
    setPending({ kind: "discard" });
  }

  const interceptNavigation = useCallback((href: string) => {
    setPending({ kind: "leave", href });
  }, []);

  useUnsavedGuard(changeCount > 0, interceptNavigation);

  function resolvePending(confirmed: boolean) {
    const current = pending;
    setPending(null);
    if (!confirmed || !current) return;

    if (current.kind === "bulk") {
      setDraft(current.next);
      clearTransientStatus();
      return;
    }
    if (current.kind === "discard") {
      leaveEdit();
      return;
    }
    setDraft(baseline);
    setEditing(false);
    router.push(current.href);
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }));
  }

  function toggleExpandAll() {
    setOpenGroups(allExpanded ? Object.fromEntries(ALL_GROUP_IDS.map((id) => [id, false])) : {});
  }

  function resetFilters() {
    setQuery("");
    setCategory("all");
    setDiffOnly(false);
    setOpenGroups({});
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  /**
   * `base` and `next` are passed in rather than read from state because the
   * conflict path rewrites both immediately before re-submitting, and a state
   * update is not visible to the call that scheduled it.
   */
  function performSave(base: PermMatrix, next: PermMatrix) {
    const payload: PermChange[] = diffMatrix(base, next, allRoles);

    if (payload.length === 0) {
      // Every conflicted cell was resolved in the other editor's favour.
      setBaseline(next);
      setDraft(next);
      setConflicts(null);
      setReviewOpen(false);
      setSaveState("success");
      setSaveMessage(t("nothingLeftToSave"));
      startTransition(() => router.refresh());
      return;
    }

    setSaveState("saving");
    setSaveMessage(null);

    startTransition(async () => {
      try {
        const result = await saveRolePermissions(payload);
        if (result.status === "ok") {
          setBaseline(next);
          setDraft(next);
          setConflicts(null);
          setReviewOpen(false);
          setSaveState("success");
          setSaveMessage(t("savedChanges", { count: payload.length }));
          setUpdatedLabel(t("justNow"));
          startTransition(() => router.refresh());
        } else if (result.status === "conflict") {
          const items = toConflictItems(result.conflicts, base);
          setBaseline(base);
          setDraft(next);
          setConflicts(items);
          // Default to the other editor's value: the safe assumption is that
          // the person who saved most recently knew something this session did
          // not, and "keep mine" is one click away per row.
          setConflictChoices(Object.fromEntries(items.map((i) => [conflictKey(i), "theirs"])));
          setReviewOpen(false);
          setSaveState("conflict");
          setSaveMessage(t("conflict", { count: result.conflicts.length }));
        } else {
          setSaveState("error");
          setSaveMessage(result.message || t("saveFailed"));
        }
      } catch (err) {
        setSaveState("error");
        setSaveMessage(err instanceof Error ? err.message : t("saveFailed"));
      }
    });
  }

  /**
   * Fold the conflict answers back into the matrices: every conflicted cell's
   * baseline becomes the value the database actually holds — which is what
   * makes the retry's optimistic-concurrency check pass — and a "take theirs"
   * cell moves the draft there too, dropping that change entirely.
   */
  function saveAfterConflicts() {
    if (!conflicts) return;
    let nextBaseline = baseline;
    let nextDraft = draft;
    for (const item of conflicts) {
      const choice = conflictChoices[conflictKey(item)] ?? "theirs";
      nextBaseline = setLevels(nextBaseline, item.role, [item.resource], item.theirs);
      if (choice === "theirs") {
        nextDraft = setLevels(nextDraft, item.role, [item.resource], item.theirs);
      }
    }
    setBaseline(nextBaseline);
    setDraft(nextDraft);
    performSave(nextBaseline, nextDraft);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const activeRole = selection === "compare" ? null : selection;

  /** Human name for a bulk action, for the confirmation's title. */
  function bulkLabel(intent: BulkIntent): string {
    if (intent.kind === "copy") return tBulk("copyFromRole", { role: tRoles(intent.source) });
    return intent.kind === "defaults" ? tBulk("resetDefaults") : tBulk("clearAll");
  }

  const confirmCopy =
    pending?.kind === "bulk"
      ? {
          title: bulkLabel(pending.intent),
          description: t("bulkBody", {
            count: pending.count,
            total: ALL_RESOURCE_KEYS.length,
            role: tRoles(pending.role),
          }),
          hint: t("bulkHint"),
          confirmLabel: t("bulkConfirm"),
        }
      : pending?.kind === "leave"
        ? {
            title: t("leaveTitle"),
            description: t("leaveBody", { count: changeCount }),
            hint: t("discardHint"),
            confirmLabel: t("leaveConfirm"),
          }
        : {
            title: t("discardTitle"),
            description: t("discardBody", { count: changeCount }),
            hint: t("discardHint"),
            confirmLabel: t("discardConfirm"),
          };

  return (
    <div className="w-full pb-2">
      <PageHeader
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-xs text-text-muted">
            {tHeader("breadcrumbRoot")} <span aria-hidden="true">/</span>{" "}
            <span className="font-semibold text-text-body">{tHeader("breadcrumbCurrent")}</span>
          </nav>
        }
        title={tHeader("title")}
        description={tHeader("description")}
        actions={
          <Link
            href="/admin/users"
            className="focus-field inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{tHeader("manageUserRoles")}</span>
            <span className="sm:hidden">{tHeader("usersShort")}</span>
          </Link>
        }
      />

      <RolesStats
        roleCount={allRoles.length}
        permissionCount={ALL_RESOURCE_KEYS.length}
        totalUsers={totalUsers}
        lastUpdatedLabel={updatedLabel}
        lastUpdatedBy={lastUpdatedBy}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <RoleRail
          allRoles={allRoles}
          roleCounts={roleCounts}
          totalUsers={totalUsers}
          matrix={draft}
          selection={selection}
          pendingByRole={pendingByRole}
          onSelect={(next) => {
            setSelection(next);
            if (next !== "compare") setLastRole(next);
            setNotice(null);
          }}
        />

        <section aria-label={t("matrixAria")} className="min-w-0">
          <div className="mb-3">
            <PermissionToolbar
              query={query}
              onQuery={setQuery}
              category={category}
              onCategory={setCategory}
              showDiffToggle={selection === "compare"}
              diffOnly={diffOnly}
              onDiffOnly={setDiffOnly}
              allExpanded={allExpanded}
              onToggleExpand={toggleExpandAll}
              onReset={resetFilters}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={activeFilterCount}
              matchCount={visibleKeys.length}
              totalCount={ALL_RESOURCE_KEYS.length}
              differingCount={differingCount}
            />
          </div>

          {notice && (
            <p
              className="mb-3 rounded-lg border border-info-line bg-info-soft px-3 py-2 text-xs text-info-text"
              role="status"
            >
              {notice}
            </p>
          )}

          {activeRole ? (
            <RolePane
              role={activeRole}
              allRoles={allRoles}
              userCount={roleCounts[activeRole] ?? 0}
              draft={draft}
              baseline={baseline}
              editMode={editing}
              onEdit={enterEdit}
              onChange={handleChange}
              onSetGroup={handleSetGroup}
              onBulkIntent={(intent) => requestBulk(activeRole, intent)}
              query={query}
              onClearSearch={() => setQuery("")}
              category={category}
              openGroups={openGroups}
              onToggleGroup={toggleGroup}
            />
          ) : (
            <ComparePane
              allRoles={allRoles}
              roleCounts={roleCounts}
              draft={draft}
              onPickRole={(role) => {
                setSelection(role);
                setLastRole(role);
              }}
              onBack={() => setSelection(lastRole)}
              backLabel={tRoles(lastRole)}
              query={query}
              onClearSearch={() => setQuery("")}
              category={category}
              highlightDiffs={diffOnly}
              openGroups={openGroups}
              onToggleGroup={toggleGroup}
            />
          )}

          {/* Legend — beside the levels it explains, not at the foot of the page. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 px-1">
            <span className="inline-flex items-center gap-2 text-xs text-text-body">
              <PermPill level="write" /> {tMatrix("legendWrite")}
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-text-body">
              <PermPill level="read" /> {tMatrix("legendRead")}
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-text-body">
              <PermPill level="none" /> {tMatrix("legendNone")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted sm:ml-auto">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {tMatrix("legendLocked")}
            </span>
          </div>
        </section>
      </div>

      {editing && (
        <EditActionBar
          changeCount={changeCount}
          perRole={perRole}
          roleLabel={(role) => tRoles(role)}
          saveState={saveState}
          message={saveMessage}
          onReview={() => setReviewOpen(true)}
          onDiscard={requestDiscard}
        />
      )}

      <ChangeReviewDialog
        open={reviewOpen}
        changes={changes}
        allRoles={allRoles}
        saving={saveState === "saving"}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => performSave(baseline, draft)}
      />

      <ConflictDialog
        open={conflicts !== null}
        items={conflicts ?? []}
        choices={conflictChoices}
        saving={saveState === "saving"}
        onChoose={(key, choice) => setConflictChoices((prev) => ({ ...prev, [key]: choice }))}
        onChooseAll={(choice) =>
          setConflictChoices(
            Object.fromEntries((conflicts ?? []).map((i) => [conflictKey(i), choice])),
          )
        }
        onClose={() => setConflicts(null)}
        onSaveAgain={saveAfterConflicts}
      />

      <ConfirmDialog
        open={pending !== null}
        // A bulk action is consequential but reversible (it only moves the
        // draft), so it asks in the neutral brand tone. Discarding work and
        // navigating away from it are the destructive ones.
        tone={pending?.kind === "bulk" ? "brand" : "danger"}
        title={confirmCopy.title}
        description={confirmCopy.description}
        hint={confirmCopy.hint}
        confirmLabel={confirmCopy.confirmLabel}
        cancelLabel={pending?.kind === "bulk" ? t("bulkCancel") : t("keepEditing")}
        onCancel={() => resolvePending(false)}
        onConfirm={() => resolvePending(true)}
      />
    </div>
  );
}
