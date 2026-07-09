"use client";

import { Link, usePathname } from "@/i18n/navigation";

type NavLinkActiveProps = {
  href: string;
  label: string;
  icon?: React.ReactNode;
};

export default function NavLinkActive({ href, label, icon }: NavLinkActiveProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2 text-[15px] font-khmer-serif py-6 transition-colors whitespace-nowrap ${
        isActive ? "text-brand font-semibold" : "text-text-body font-medium hover:text-text-heading"
      }`}
    >
      {icon && (
        <span className={`text-[18px] ${isActive ? "text-brand" : "text-text-muted"}`}>
          {icon}
        </span>
      )}
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-0 w-full h-[3px] bg-accent rounded-t-md" />
      )}
    </Link>
  );
}