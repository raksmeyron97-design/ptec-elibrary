import AdminTableSkeleton from '@/components/ui/skeletons/AdminTableSkeleton'

export default function AdminUsersLoading() {
  return (
    <div className="w-full p-6">
      <AdminTableSkeleton rows={10} columns={[40, 180, 160, 100, 80, 70]} />
    </div>
  )
}
