import React from "react";

export interface CollectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Editorial header for library collection hubs and major entity indexes.
 * Academic, calm, content-first presentation with subtle institutional accents.
 */
export default function CollectionHeader({
  eyebrow,
  title,
  description,
  stats,
  actions,
  children,
  className = "",
}: CollectionHeaderProps) {
  return (
    <header className={`mb-8 sm:mb-10 ${className}`}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-brand">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-text-heading sm:text-3xl lg:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-text-muted sm:text-[15px]">
          {description}
        </p>
      )}
      {stats && <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">{stats}</div>}
      {actions && <div className="mt-6">{actions}</div>}
      {children}
    </header>
  );
}
