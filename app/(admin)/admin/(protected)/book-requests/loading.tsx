import AdminTableSkeleton from "@/components/ui/skeletons/AdminTableSkeleton";

export default function Loading() {
  return (
    <div className="w-full">
      <AdminTableSkeleton rows={6} columns={[220, 200, 90, 80, 90]} />
    </div>
  );
}
