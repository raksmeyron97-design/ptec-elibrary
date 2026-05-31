export default function Loading() {
  return (
    <div className="w-full h-full p-6 animate-pulse space-y-6">
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-4/6"></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
        ))}
      </div>
    </div>
  );
}
