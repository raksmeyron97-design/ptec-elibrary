import Link from "next/link";
import { Users } from "lucide-react";
import PublicationForm from "../_components/PublicationForm";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function NewPublicationPage() {
  await requireRouteAccess("publications.create");

  /*
    Breadcrumb, heading, tabs, context sidebar and action bar all come from
    FormShell inside PublicationForm — the sidebar previews the form's own live
    state, so it cannot be assembled here. The route stays a data loader.
  */
  return (
    <PublicationForm
      pageTitle="New publication"
      pageDescription="Add a journal article to the library."
      headerActions={
        <Link href="/admin/publications/authors" className={BTN_SECONDARY}>
          <Users className="h-4 w-4" aria-hidden="true" />
          Manage authors
        </Link>
      }
    />
  );
}
