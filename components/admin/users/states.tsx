import { Users, SearchX } from "lucide-react";

function Shell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-paper text-text-muted" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-bold text-text-heading">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-text-muted">{body}</p>
    </div>
  );
}

export function UsersEmptyState() {
  return <Shell icon={<Users className="h-6 w-6" />} title="No users yet" body="Once people sign up or you invite them, they'll appear here for you to manage." />;
}

export function UsersNoResultsState() {
  return <Shell icon={<SearchX className="h-6 w-6" />} title="No users match your filters" body="Try a different search term, or reset the filters to see everyone." />;
}
