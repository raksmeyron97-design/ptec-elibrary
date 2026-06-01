"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, createContext, useContext, ReactNode } from "react";

interface NavContextType {
  isPending: boolean;
  navigate: (href: string) => void;
}

const NavContext = createContext<NavContextType>({
  isPending: false,
  navigate: () => {},
});

export function ClientNavWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  return (
    <NavContext.Provider value={{ isPending, navigate }}>
      <div
        className={
          isPending
            ? "opacity-60 transition-opacity duration-200 pointer-events-none"
            : "transition-opacity duration-200"
        }
      >
        {children}
      </div>
    </NavContext.Provider>
  );
}

export function useClientNav() {
  return useContext(NavContext);
}

interface FilterLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export function FilterLink({ href, className, children, ...props }: FilterLinkProps) {
  const { navigate } = useClientNav();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(href);
    if (props.onClick) {
      props.onClick(e);
    }
  };

  return (
    <a href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

export function FilterSelect({
  value,
  options,
  defaultLabel,
  paramKey,
}: {
  value: string;
  options: string[];
  defaultLabel: string;
  paramKey: string;
}) {
  const { navigate } = useClientNav();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const p = new URLSearchParams(searchParams.toString());
    
    if (val) {
      p.set(paramKey, val);
    } else {
      p.delete(paramKey);
    }
    
    // Always reset to page 1 when changing filters
    p.delete("page");
    
    const qs = p.toString();
    navigate(`/books${qs ? `?${qs}` : ""}`);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className="appearance-none cursor-pointer bg-paper text-text-muted border border-divider rounded-full px-3 py-[5px] text-[11px] font-medium transition-all sm:text-[12px] hover:border-brand/30 hover:bg-brand/5 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
    >
      <option value="">{defaultLabel}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

export function SortSelect({
  value,
  options,
  defaultLabel,
  paramKey,
}: {
  value: string;
  options: { value: string; label: string }[];
  defaultLabel: string;
  paramKey: string;
}) {
  const { navigate } = useClientNav();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const p = new URLSearchParams(searchParams.toString());
    
    if (val) {
      p.set(paramKey, val);
    } else {
      p.delete(paramKey);
    }
    
    p.delete("page");
    
    const qs = p.toString();
    navigate(`/books${qs ? `?${qs}` : ""}`);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className="appearance-none cursor-pointer bg-paper text-text-muted border border-divider rounded-full px-3 py-[5px] text-[11px] font-medium transition-all sm:text-[12px] hover:border-brand/30 hover:bg-brand/5 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
    >
      <option value="">{defaultLabel}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
