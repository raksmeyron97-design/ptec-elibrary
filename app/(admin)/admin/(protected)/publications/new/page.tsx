import Link from "next/link";
import { Users } from "lucide-react";
import PublicationForm from "../_components/PublicationForm";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { journalNameOptions } from "@/app/actions/journals";

export default async function NewPublicationPage() {
  await requireRouteAccess("publications.create");
  const journalOptions = await journalNameOptions();

  /*
    Breadcrumb, heading, tabs, context sidebar and action bar all come from
    FormShell inside PublicationForm — the sidebar previews the form's own live
    state, so it cannot be assembled here. The route stays a data loader.
  */
  return (
    <PublicationForm
      pageTitle="New journal article"
      pageDescription="Add a journal article to the library."
      journalOptions={journalOptions}
      headerActions={
        <Link href="/admin/publications/authors" className={BTN_SECONDARY}>
          <Users className="h-4 w-4" aria-hidden="true" />
          Manage authors
        </Link>
      }
    />
  );
}
