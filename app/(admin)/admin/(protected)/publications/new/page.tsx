import PublicationForm from "../_components/PublicationForm";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

export default async function NewPublicationPage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/publications"
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-text-heading"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-heading">New Publication</h1>
          <p className="text-text-muted text-sm mt-1">Add a journal article to the library</p>
        </div>
        <Link
          href="/admin/publications/authors"
          className="inline-flex items-center gap-2 rounded-lg border border-divider bg-paper px-4 py-2 text-sm font-medium text-text-heading hover:bg-black/5 transition-colors shadow-sm"
        >
          <Users className="w-4 h-4" />
          Manage Authors
        </Link>
      </div>

      <PublicationForm />
    </div>
  );
}
