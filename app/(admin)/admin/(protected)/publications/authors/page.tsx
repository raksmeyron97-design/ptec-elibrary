import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listPublicationAuthors } from "@/app/actions/authors";
import { getPublicationAffiliations } from "@/app/actions/publications";
import { PageHeader } from "@/components/admin/kit";
import AuthorsClient from "./_components/AuthorsClient";
import AffiliationsPanel from "./_components/AffiliationsPanel";
import { requireRouteAccess } from "@/lib/admin/route-guard";

/**
 * Author and institution management.
 *
 * Both lists are fetched here, on the server, and handed down whole: they are a
 * few hundred rows between them, the client filters in memory, and the page is
 * dynamic anyway (every admin route is). listPublicationAuthors() also returns
 * the publication counts and duplicate flags, which is the part that needed a
 * server round trip.
 */
export default async function PublicationAuthorsPage() {
  await requireRouteAccess("publications.authors");

  const [{ data: authors, error }, { data: affiliations }] = await Promise.all([
    listPublicationAuthors(),
    getPublicationAffiliations(),
  ]);

  return (
    <div className="w-full space-y-8">
      <PageHeader
        breadcrumb={
          <Link
            href="/admin/publications"
            className="focus-field inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-text-muted transition-colors hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Publications
          </Link>
        }
        title="Authors & institutions"
        description="Author records are shared across every publication, and each one has a public academic profile at /authors/…"
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : (
        <AuthorsClient authors={authors} />
      )}

      <AffiliationsPanel affiliations={affiliations ?? []} />
    </div>
  );
}
