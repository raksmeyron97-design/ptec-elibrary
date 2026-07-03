import { getThesisById } from "@/app/actions/theses";
import EditThesisForm from "./EditThesisForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

export default async function EditThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { data: report, error } = await getThesisById(resolvedParams.id);

  if (error || !report) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/theses"
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-text-heading"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-heading">Edit Thesis</h1>
          <p className="text-text-muted text-sm mt-1">Update details for this thesis</p>
        </div>
      </div>

      <EditThesisForm report={report} />
    </div>
  );
}
