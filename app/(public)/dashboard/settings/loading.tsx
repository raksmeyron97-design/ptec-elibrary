export default function SettingsLoading() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-pulse">
      <div className="mb-6 sm:mb-8 space-y-2">
        <div className="h-8 w-48 bg-paper rounded-lg"></div>
        <div className="h-4 w-64 bg-paper rounded-lg"></div>
      </div>
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 h-[360px]"></div>
        <div className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 h-[320px]"></div>
      </div>
    </div>
  );
}
