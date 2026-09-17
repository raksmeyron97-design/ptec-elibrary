import Link from "next/link";
import { Users, UsersRound } from "lucide-react";

/**
 * The two surfaces of Team Management: the people, and the committee they sit
 * on. One tab strip, rendered by both pages, so the workspace reads as one
 * thing rather than as two admin sections that happen to share a URL prefix.
 *
 * It is NOT a permission gate — both destinations open at `users: read`, and
 * the route guard on each page is the boundary. A tab that hid itself here
 * would only hide a page the server is willing to serve.
 */
export default function TeamWorkspaceTabs({ current }: { current: "members" | "committee" }) {
  const tabs = [
    { key: "members", href: "/admin/team", label: "Team members", icon: Users },
    { key: "committee", href: "/admin/team/committee", label: "Committee", icon: UsersRound },
  ] as const;

  return (
    <nav aria-label="Team management sections" className="border-b border-divider">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map(({ key, href, label, icon: Icon }) => {
          const active = key === current;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition ${
                  active
                    ? "border-blue-950 text-blue-950"
                    : "border-transparent text-text-muted hover:border-divider hover:text-text-body"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
