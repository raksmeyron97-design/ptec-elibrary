import { getPublicationForAdmin } from "@/app/actions/publications";
import PublicationForm from "../../_components/PublicationForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

export default async function EditPublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: publication, error } = await getPublicationForAdmin(id);

  if (error || !publication) {
    notFound();
  }

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
          <h1 className="text-2xl font-bold text-text-heading">Edit Publication</h1>
          <p className="text-text-muted text-sm mt-1">Update details for this article</p>
        </div>
      </div>

      <PublicationForm initial={publication} />
    </div>
  );
}
