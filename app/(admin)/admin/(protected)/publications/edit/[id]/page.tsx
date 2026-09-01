import { notFound } from "next/navigation";
import { getPublicationForAdmin } from "@/app/actions/publications";
import PublicationForm from "../../_components/PublicationForm";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function EditPublicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRouteAccess("publications.edit");

  const { id } = await params;
  const { data: publication, error } = await getPublicationForAdmin(id);

  if (error) {
    return <div>Error loading publication: {error}</div>;
  }
  if (!publication) {
    notFound();
  }

  return (
    <PublicationForm
      initial={publication}
      /* Named, because "Edit Publication" over a list of near-identical titles
         told the editor nothing about which record they had opened. */
      pageTitle={publication.title?.trim() || publication.title_km?.trim() || "Untitled publication"}
      pageDescription="Update details for this article."
    />
  );
}
