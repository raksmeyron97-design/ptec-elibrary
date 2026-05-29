import React from 'react';

interface SectionTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export function SectionTitle({ children, as: Component = 'h2', className = '', ...props }: SectionTitleProps) {
  const baseStyles = 'font-serif text-text-heading relative pb-3 mb-6';
  const sizes = {
    h1: 'text-3xl md:text-4xl',
    h2: 'text-2xl md:text-3xl',
    h3: 'text-xl md:text-2xl',
    h4: 'text-lg md:text-xl',
  };

  return (
    <Component className={`${baseStyles} ${sizes[Component]} ${className}`} {...props}>
      {children}
      <span className="absolute bottom-0 left-0 w-12 h-[3px] bg-accent rounded-full" />
    </Component>
  );
}
