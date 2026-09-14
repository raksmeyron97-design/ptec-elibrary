import React from "react";
import { Link } from "@/i18n/navigation";
import { SearchX, FolderOpen } from "lucide-react";

export interface CollectionEmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  variant?: "no-results" | "empty";
  className?: string;
}

/**
 * Calm, helpful empty or no-results state for collections and search listings.
 */
export default function CollectionEmptyState({
  title,
  description,
  action,
  variant = "empty",
  className = "",
}: CollectionEmptyStateProps) {
  const Icon = variant === "no-results" ? SearchX : FolderOpen;

  return (
    <div
      role="status"
      className={`rounded-2xl border border-divider bg-bg-surface p-8 text-center sm:p-12 ${className}`}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper text-text-muted">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-[16px] font-bold text-text-heading sm:text-[17px]">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-text-muted sm:text-[14px]">
        {description}
      </p>
      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link
              href={action.href}
              className="focus-field inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl border border-divider bg-bg-app px-4 py-2 text-[13px] font-semibold text-brand transition-colors hover:border-brand/40"
            >
              {action.label}
            </Link>
          ) : action.onClick ? (
            <button
              type="button"
              onClick={action.onClick}
              className="focus-field inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl border border-divider bg-bg-app px-4 py-2 text-[13px] font-semibold text-brand transition-colors hover:border-brand/40"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
