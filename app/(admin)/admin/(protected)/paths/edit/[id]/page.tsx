import { notFound } from "next/navigation";
import { adminGetPathDetail } from "@/app/actions/learning-paths";
import PathBuilderForm from "../../_components/PathBuilderForm";

export default async function EditPathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = await adminGetPathDetail(id);
  if (!path) notFound();

  return (
    <div className="mx-auto max-w-[900px] p-6 md:p-10">
      <h1 className="mb-6 text-[22px] font-bold text-text-heading">Edit Learning Path</h1>
      <PathBuilderForm initial={path} pathId={id} />
    </div>
  );
}
