export default function AuthSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-body px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-divider bg-bg-surface p-8 shadow-md space-y-5">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 pb-2">
          <div className="skeleton h-14 w-14 rounded-2xl" />
          <div className="skeleton h-6 w-40 rounded-lg" />
          <div className="skeleton h-4 w-56 rounded" />
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-11 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-11 w-full rounded-xl" />
          </div>
        </div>

        {/* Button */}
        <div className="skeleton h-11 w-full rounded-xl" />

        {/* Footer link */}
        <div className="skeleton h-4 w-48 mx-auto rounded" />
      </div>
    </div>
  )
}
