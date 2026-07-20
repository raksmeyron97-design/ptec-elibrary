"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import {
  PERMISSION_GROUPS,
  diffMatrix,
  isLockedRole,
  type PermMatrix,
} from "@/lib/admin/roles-shared";
import { saveRolePermissions } from "@/app/(admin)/admin/(protected)/roles/actions";
import RolesHeader from "./RolesHeader";
import RoleOverview from "./RoleOverview";
import PermissionToolbar from "./PermissionToolbar";
import PermissionMatrix from "./PermissionMatrix";
import PermissionAccordion from "./PermissionAccordion";
import EditActionBar, { type SaveState } from "./EditActionBar";
import ChangeReviewDialog from "./ChangeReviewDialog";

const ALL_GROUP_IDS = PERMISSION_GROUPS.map((g) => g.id);

export default function RolesWorkspace({
  allRoles,
  roleCounts,
  totalUsers,
  initialMatrix,
  lastUpdatedLabel,
  lastUpdatedBy,
}: {
  allRoles: AppRole[];
  roleCounts: Record<AppRole, number>;
  totalUsers: number;
  initialMatrix: PermMatrix;
  lastUpdatedLabel: string | null;
  lastUpdatedBy: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("adminRoles.workspace");
  const [, startTransition] = useTransition();

  const [editMode, setEditMode] = useState(false);
  const [baseline, setBaseline] = useState<PermMatrix>(initialMatrix);
  const [draft, setDraft] = useState<PermMatrix>(initialMatrix);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [updatedLabel, setUpdatedLabel] = useState(lastUpdatedLabel);

  // Filters / focus
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [diffOnly, setDiffOnly] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [mobileRole, setMobileRole] = useState<AppRole>("librarian");

  const changes = useMemo(() => diffMatrix(baseline, draft, allRoles), [baseline, draft, allRoles]);
  const changeCount = changes.length;

  const allExpanded = ALL_GROUP_IDS.every((id) => openGroups[id] !== false);
  const hasActiveFilters =
    query.trim() !== "" || category !== "all" || roleFilter !== "all" || diffOnly || !allExpanded;

  function handleChange(role: AppRole, resource: string, level: PermLevel) {
    if (isLockedRole(role)) return;
    setDraft((prev) => ({ ...prev, [role]: { ...prev[role], [resource]: level } }));
    if (saveState !== "idle" && saveState !== "saving") {
      setSaveState("idle");
      setSaveMessage(null);
    }
  }

  function enterEdit() {
    setEditMode(true);
    setSaveState("idle");
    setSaveMessage(null);
  }

  function cancelEdit() {
    setDraft(baseline);
    setEditMode(false);
    setSaveState("idle");
    setSaveMessage(null);
    setReviewOpen(false);
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
    setRoleFilter("all");
    setDiffOnly(false);
    setOpenGroups({});
  }

  function performSave() {
    if (changeCount === 0) return;
    setSaveState("saving");
    setSaveMessage(null);
    const payload = changes.map((c) => ({ role: c.role, resource: c.resource, from: c.from, to: c.to }));

    startTransition(async () => {
      try {
        const result = await saveRolePermissions(payload);
        if (result.status === "ok") {
          setBaseline(draft);
          setSaveState("success");
          setSaveMessage(t("savedChanges", { count: payload.length }));
          setUpdatedLabel(t("justNow"));
          setReviewOpen(false);
          startTransition(() => router.refresh());
        } else if (result.status === "conflict") {
          setSaveState("conflict");
          setSaveMessage(t("conflict", { count: result.conflicts.length }));
          setReviewOpen(false);
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

  const selectedRole = roleFilter === "all" ? null : roleFilter;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-4">
      <RolesHeader
        editMode={editMode}
        onEdit={enterEdit}
        lastUpdatedLabel={updatedLabel}
        lastUpdatedBy={lastUpdatedBy}
      />

      <RoleOverview
        allRoles={allRoles}
        roleCounts={roleCounts}
        totalUsers={totalUsers}
        matrix={draft}
        selectedRole={selectedRole}
        onSelectRole={(r) => {
          setRoleFilter(r ?? "all");
          if (r) setMobileRole(r);
        }}
      />

      <section aria-label={t("matrixAria")} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t("permissions")}</h2>
          <span className="hidden text-xs text-text-muted sm:block">
            {editMode ? t("hintEdit") : t("hintView")}
          </span>
        </div>

        <PermissionToolbar
          query={query}
          onQuery={setQuery}
          category={category}
          onCategory={setCategory}
          roleFilter={roleFilter}
          onRoleFilter={(v) => { setRoleFilter(v); if (v !== "all") setMobileRole(v); }}
          allRoles={allRoles}
          diffOnly={diffOnly}
          onDiffOnly={setDiffOnly}
          allExpanded={allExpanded}
          onToggleExpand={toggleExpandAll}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Desktop / tablet: grouped matrix */}
        <div className="hidden md:block">
          <PermissionMatrix
            allRoles={allRoles}
            draft={draft}
            baseline={baseline}
            editMode={editMode}
            onChange={handleChange}
            query={query}
            category={category}
            roleFilter={roleFilter}
            diffOnly={diffOnly}
            openGroups={openGroups}
            onToggleGroup={toggleGroup}
          />
        </div>

        {/* Mobile: role selector + category accordions */}
        <div className="md:hidden">
          <PermissionAccordion
            allRoles={allRoles}
            role={mobileRole}
            onRole={setMobileRole}
            draft={draft}
            baseline={baseline}
            editMode={editMode}
            onChange={handleChange}
            query={query}
            category={category}
            diffOnly={diffOnly}
            openGroups={openGroups}
            onToggleGroup={toggleGroup}
          />
        </div>
      </section>

      {editMode && (
        <EditActionBar
          changeCount={changeCount}
          saveState={saveState}
          message={saveMessage}
          onSave={performSave}
          onCancel={cancelEdit}
          onReview={() => setReviewOpen(true)}
        />
      )}

      <ChangeReviewDialog
        open={reviewOpen}
        changes={changes}
        saving={saveState === "saving"}
        onClose={() => setReviewOpen(false)}
        onConfirm={performSave}
      />
    </div>
  );
}
