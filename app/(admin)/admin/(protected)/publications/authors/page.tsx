import { createServiceClient } from "@/lib/supabase/server";
import AuthorsClient from "./AuthorsClient";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { PublicationAuthor, PublicationAffiliation } from "@/lib/publications";

export default async function PublicationAuthorsPage() {
  const supabase = createServiceClient();

  const [{ data: authors }, { data: affiliations }] = await Promise.all([
    supabase
      .from("publication_authors")
      .select("id, full_name, full_name_km, orcid, email")
      .order("full_name", { ascending: true }),
    supabase
      .from("publication_affiliations")
      .select("id, name, name_km, city, country")
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/publications"
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-text-heading"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-heading">Authors & Affiliations</h1>
          <p className="text-text-muted text-sm mt-1">Shared author records reused across publications</p>
        </div>
      </div>

      <AuthorsClient
        initialAuthors={(authors ?? []) as PublicationAuthor[]}
        initialAffiliations={(affiliations ?? []) as PublicationAffiliation[]}
      />
    </div>
  );
}
