import { notFound } from "next/navigation";
import { getPublicationForAdmin } from "@/app/actions/publications";
import PublicationForm from "../../_components/PublicationForm";
import { FormShell } from "@/components/admin/kit/form";

export default async function EditPublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: publication, error } = await getPublicationForAdmin(id);

  if (error) {
    return <div>Error loading publication: {error}</div>;
  }
  if (!publication) {
    notFound();
  }

  return (
    <FormShell
      backHref="/admin/publications"
      backLabel="Back to publications"
      /* The article being edited is named in the heading. "Edit Publication"
         above a list of near-identical titles told the editor nothing about
         which record they had opened. */
      title={publication.title?.trim() || publication.title_km?.trim() || "Untitled publication"}
      description="Update details for this article."
    >
      <PublicationForm initial={publication} />
    </FormShell>
  );
}
