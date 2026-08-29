"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CopyCheck,
  ExternalLink,
  EyeOff,
  Merge,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { deletePublicationAuthor } from "@/app/actions/publications";
import type { AdminAuthorRow } from "@/lib/authors/admin";
import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";
import AuthorForm from "./AuthorForm";
import MergeAuthorsDialog from "./MergeAuthorsDialog";

/**
 * The author management table.
 *
 * WHAT THIS REPLACES. The previous surface was a four-column list (name,
 * ORCID, email, actions) with an inline create form and a per-row "Delete?
 * Yes/No" confirmation. It could not answer the two questions a librarian
 * actually opens this page with — "is this person already in here?" and "which
 * of these profiles are still empty?" — and its delete silently stripped the
 * author from every byline they held.
 *
 * WHAT IT DOES NOW. Search by name/affiliation/ORCID, a filter for the two
 * states worth acting on (incomplete profiles, likely duplicates), publication
 * counts and completeness per row, merge as the safe way to remove a duplicate,
 * and a delete that refuses when credits would be lost.
 *
 * Filtering is client-side over an already-fetched list: the table is a few
 * hundred rows, it arrives with the page, and a server round trip per keystroke
 * would buy nothing.
 */

type Filter = "all" | "incomplete" | "duplicates" | "hidden";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "incomplete", label: "Incomplete" },
  { key: "duplicates", label: "Possible duplicates" },
  { key: "hidden", label: "Hidden" },
];

/** Below this, a profile is bare enough to be worth flagging. */
const INCOMPLETE_BELOW = 50;

function CompletenessBar({ value }: { value: number }) {
  const tone =
    value >= 75 ? "bg-success" : value >= INCOMPLETE_BELOW ? "bg-warning" : "bg-divider";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-paper"
        role="img"
        aria-label={`Profile ${value}% complete`}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-muted">{value}%</span>
    </div>
  );
}

export default function AuthorsClient({ authors }: { authors: AdminAuthorRow[] }) {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<AdminAuthorRow | null | undefined>(undefined);
  const [merging, setMerging] = useState<AdminAuthorRow | null>(null);
  const [deleting, setDeleting] = useState<AdminAuthorRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  // Send focus to the editor when it opens, so a keyboard user is not left at
  // the table with the form somewhere below them.
  useEffect(() => {
    if (editing !== undefined) editorRef.current?.focus();
  }, [editing]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return authors.filter((author) => {
      if (filter === "incomplete" && author.completeness >= INCOMPLETE_BELOW) return false;
      if (filter === "duplicates" && author.duplicateOf.length === 0) return false;
      if (filter === "hidden" && author.is_published) return false;
      if (!term) return true;
      return [
        author.full_name,
        author.full_name_km,
        author.affiliation_name,
        author.position_title,
        author.orcid,
        author.slug,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [authors, query, filter]);

  const counts = useMemo(
    () => ({
      all: authors.length,
      incomplete: authors.filter((a) => a.completeness < INCOMPLETE_BELOW).length,
      duplicates: authors.filter((a) => a.duplicateOf.length > 0).length,
      hidden: authors.filter((a) => !a.is_published).length,
    }),
    [authors],
  );

  const confirmDelete = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    const result = await deletePublicationAuthor(deleting.id);
    setBusy(false);
    if (!result.success) {
      // The server refuses a delete that would strip bylines and explains why.
      // Surfacing that verbatim is the point — it names the safe alternative.
      setError(result.error ?? "Delete failed.");
      setDeleting(null);
      return;
    }
    toast.success(`Deleted "${deleting.full_name}".`);
    setDeleting(null);
    router.refresh();
  };

  // ── The editor takes over the page while it is open ──────────────────────
  if (editing !== undefined) {
    return (
      <div ref={editorRef} tabIndex={-1} className="max-w-3xl outline-none">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-heading">
              {editing ? `Edit ${editing.full_name}` : "New author"}
            </h2>
            <p className="mt-0.5 text-sm text-text-muted">
              {editing
                ? `Credited on ${editing.publicationCount} publication${editing.publicationCount === 1 ? "" : "s"}.`
                : "Author records are shared — create one here and reuse it across every article."}
            </p>
          </div>
          {editing?.slug && (
            <Link
              href={`/authors/${editing.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-field inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-divider px-3 text-xs font-semibold text-text-muted transition-colors hover:border-brand hover:text-brand"
            >
              View profile
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        <AuthorForm
          author={editing}
          onSaved={() => {
            toast.success(editing ? "Author updated." : "Author created.");
            setEditing(undefined);
            router.refresh();
          }}
          onCancel={() => setEditing(undefined)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss"
            className="focus-field shrink-0 cursor-pointer rounded p-1"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="focus-shell relative flex w-full items-center rounded-lg border border-divider bg-bg-surface lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search authors"
            placeholder="Search name, institution or ORCID…"
            className="h-11 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-text-muted/70"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Filter authors">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(f.key)}
                className={`focus-field inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                  active
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-body"
                }`}
              >
                {f.label}
                <span className="tabular-nums opacity-70">{counts[f.key]}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setEditing(null)}
            className="focus-field ml-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New author
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<UserRound className="h-6 w-6" aria-hidden="true" />}
          title={authors.length === 0 ? "No authors yet" : "No authors match"}
          description={
            authors.length === 0
              ? "Author records are shared across publications. Create one here, or add one while editing an article."
              : "Try a different search term, or clear the filter."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-divider bg-bg-surface">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">
              Author records, with publication counts and profile completeness
            </caption>
            <thead className="border-b border-divider bg-paper text-text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Author
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Institution
                </th>
                <th scope="col" className="px-5 py-3 font-medium text-right">
                  Publications
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Profile
                </th>
                <th scope="col" className="px-5 py-3 font-medium text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {filtered.map((author) => (
                <tr key={author.id} className="transition-colors hover:bg-paper/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-divider bg-paper">
                        {author.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={author.photo_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <UserRound className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text-heading">{author.full_name}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                          {author.full_name_km && <span lang="km">{author.full_name_km}</span>}
                          {author.position_title && <span>{author.position_title}</span>}
                          {!author.is_published && (
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <EyeOff className="h-3 w-3" aria-hidden="true" />
                              Hidden
                            </span>
                          )}
                          {author.duplicateOf.length > 0 && (
                            <span className="inline-flex items-center gap-1 font-semibold text-warning-text">
                              <CopyCheck className="h-3 w-3" aria-hidden="true" />
                              {author.duplicateOf.length} possible duplicate
                              {author.duplicateOf.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-text-muted">
                    {author.affiliation_name || "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-body">
                    {author.publicationCount}
                  </td>
                  <td className="px-5 py-3">
                    <CompletenessBar value={author.completeness} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1 text-text-muted">
                      <button
                        type="button"
                        onClick={() => setEditing(author)}
                        title={`Edit ${author.full_name}`}
                        aria-label={`Edit ${author.full_name}`}
                        className="focus-field cursor-pointer rounded-lg p-2 transition-colors hover:text-brand"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setMerging(author)}
                        disabled={authors.length < 2}
                        title={`Merge ${author.full_name} into another author`}
                        aria-label={`Merge ${author.full_name} into another author`}
                        className="focus-field cursor-pointer rounded-lg p-2 transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Merge className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(author)}
                        title={`Delete ${author.full_name}`}
                        aria-label={`Delete ${author.full_name}`}
                        className="focus-field cursor-pointer rounded-lg p-2 transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {merging && (
        <MergeAuthorsDialog
          source={merging}
          candidates={authors}
          onCancel={() => setMerging(null)}
          onDone={(message) => {
            setMerging(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title={`Delete ${deleting?.full_name ?? "this author"}?`}
        description={
          deleting?.publicationCount
            ? `This author is credited on ${deleting.publicationCount} publication${deleting.publicationCount === 1 ? "" : "s"}. The delete will be refused — merge them into another record instead.`
            : "This author is not credited on any publication, so nothing else changes. This cannot be undone."
        }
        hint={
          deleting?.publicationCount
            ? "Merge moves their credits to another author first, so no byline is lost."
            : undefined
        }
        confirmLabel="Delete author"
        busyLabel="Deleting…"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
