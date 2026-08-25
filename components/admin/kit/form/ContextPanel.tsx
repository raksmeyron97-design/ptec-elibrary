import type { LucideIcon } from "lucide-react";

/**
 * A titled panel for the context sidebar.
 *
 * The same component renders in the 380px sidebar and inline below the fields,
 * so it carries no positioning of its own — `FormShell` owns where it sits. It
 * is deliberately quieter than a `FormSection`: this is reference material about
 * what the author has typed, not another thing to fill in, and a second panel
 * with the same weight as the form competes with it.
 */
export default function ContextPanel({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  /** One line under the title, for what the panel is showing. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-divider bg-paper/50">
      <div className="flex items-start gap-2 border-b border-divider px-4 py-3">
        {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-heading">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
