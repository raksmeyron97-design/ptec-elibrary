import PathBuilderForm from "../_components/PathBuilderForm";

export default function CreatePathPage() {
  return (
    <div className="mx-auto max-w-[900px] p-6 md:p-10">
      <h1 className="mb-6 text-[22px] font-bold text-text-heading">New Learning Path</h1>
      <PathBuilderForm initial={null} pathId={null} />
    </div>
  );
}
