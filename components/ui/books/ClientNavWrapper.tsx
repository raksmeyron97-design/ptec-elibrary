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

/**
 * Rows-per-page selector. Generic over the current route — preserves every
 * existing search param, sets `param` to the chosen size, and resets to page 1.
 */
export function RowsPerPageSelect({
  value,
  options,
  param = "size",
  basePath,
  id,
}: {
  value: number;
  options: number[];
  param?: string;
  basePath: string;
  id?: string;
}) {
  const { navigate } = useClientNav();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set(param, e.target.value);
    // Changing page size shifts the offsets — always return to the first page.
    p.delete("page");
    const qs = p.toString();
    navigate(`${basePath}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="whitespace-nowrap text-[13.5px] text-text-muted">
        Rows per page
      </label>
      <select
        id={id}
        value={value}
        onChange={handleChange}
        aria-label="Rows per page"
        className="h-9 cursor-pointer appearance-none rounded-[10px] border border-divider bg-bg-surface bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pl-3 pr-8 text-[13.5px] font-medium tabular-nums text-text-body transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
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
