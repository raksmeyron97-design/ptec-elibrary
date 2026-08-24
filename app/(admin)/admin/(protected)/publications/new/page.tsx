import Link from "next/link";
import { Users } from "lucide-react";
import PublicationForm from "../_components/PublicationForm";
import { FormShell, BTN_SECONDARY } from "@/components/admin/kit/form";

export default async function NewPublicationPage() {
  return (
    <FormShell
      backHref="/admin/publications"
      backLabel="Back to publications"
      title="New publication"
      description="Add a journal article to the library."
      headerActions={
        <Link href="/admin/publications/authors" className={BTN_SECONDARY}>
          <Users className="h-4 w-4" aria-hidden="true" />
          Manage authors
        </Link>
      }
    >
      <PublicationForm />
    </FormShell>
  );
}
