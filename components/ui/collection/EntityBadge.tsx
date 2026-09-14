import React from "react";

export type EntityKind = "author" | "person" | "organization" | "institution" | null | undefined;

export interface EntityBadgeProps {
  kind: EntityKind;
  labels?: {
    author?: string;
    person?: string;
    organization?: string;
    institution?: string;
  };
  className?: string;
}

/**
 * Academic entity badge differentiating individual authors from organizations/institutions.
 * Avoids false claims: only renders when entity type is trustworthy.
 */
export default function EntityBadge({
  kind,
  labels,
  className = "",
}: EntityBadgeProps) {
  if (!kind) return null;

  const isOrg = kind === "organization" || kind === "institution";
  const defaultLabel = isOrg
    ? (labels?.organization ?? labels?.institution ?? "Organization")
    : (labels?.author ?? labels?.person ?? "Author");

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
        isOrg
          ? "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:text-amber-300"
          : "border border-brand/20 bg-brand/5 text-brand"
      } ${className}`}
    >
      {defaultLabel}
    </span>
  );
}
