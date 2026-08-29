import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookCopy, Copy, Upload, type LucideIcon } from "lucide-react";
import {
  EBOOKS_BASE_PATH,
  EBOOKS_DUPLICATES_PATH,
  EBOOKS_UPLOAD_PATH,
} from "@/lib/admin/ebooks-url";

export type BooksWorkspace = "manage" | "upload" | "duplicates";

/**
 * The one element that makes Collection, Upload and Duplicate review read as a
 * single product rather than three pages that happen to be about books.
 *
 * It sits in the same position on all three, so moving between them never
 * requires going back out to the sidebar — which matters because the sidebar
 * collapses to a hamburger below `lg`, and the duplicates page previously
 * offered only a lone "← Manage E-books" link while upload offered nothing at
 * all.
 *
 * Rendered as a list of links, not tabs: each destination is a real page with
 * its own URL, so `role="tablist"` would promise a panel swap that does not
 * happen. The current page carries `aria-current="page"` and a weight change,
 * so the state does not depend on colour.
 */
export default async function BooksWorkspaceNav({
  current,
  /** Shown on the Duplicates entry when the queue has work in it. */
  duplicateCount,
}: {
  current: BooksWorkspace;
  duplicateCount?: number;
}) {
  const t = await getTranslations("adminEbooks.workspace");

  const items: { key: BooksWorkspace; href: string; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "manage", href: EBOOKS_BASE_PATH, label: t("manage"), icon: BookCopy },
    { key: "upload", href: EBOOKS_UPLOAD_PATH, label: t("upload"), icon: Upload },
    {
      key: "duplicates",
      href: EBOOKS_DUPLICATES_PATH,
      label: t("duplicates"),
      icon: Copy,
      count: duplicateCount,
    },
  ];

  return (
    <nav aria-label={t("label")}>
      <ul className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1">
        {items.map((item) => {
          const active = item.key === current;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`focus-field inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors duration-150 ${
                  active
                    ? "border-surface-brand-line bg-surface-brand-soft font-semibold text-brand"
                    : "border-transparent font-medium text-text-muted hover:bg-paper hover:text-text-body"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span className="rounded-full bg-warning-soft px-1.5 text-xs font-semibold tabular-nums text-warning-text">
                    {item.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
