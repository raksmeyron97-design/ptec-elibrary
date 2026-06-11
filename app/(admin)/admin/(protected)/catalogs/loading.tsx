import AdminTableSkeleton from '@/components/ui/skeletons/AdminTableSkeleton'

export default function AdminCatalogsLoading() {
  return (
    <div className="w-full p-6">
      <AdminTableSkeleton rows={10} columns={[40, 200, 140, 100, 90, 80]} />
    </div>
  )
}
