"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      className={`relative flex items-center gap-2 text-[15px] font-medium py-6 transition-colors ${
        isActive ? "text-[#007c91]" : "text-slate-600 hover:text-[#0a1629]"
      }`}
    >
      {icon && (
        <span className={`text-[18px] ${isActive ? "text-[#007c91]" : "text-slate-400"}`}>
          {icon}
        </span>
      )}
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[#007c91] rounded-t-md" />
      )}
    </Link>
  );
}