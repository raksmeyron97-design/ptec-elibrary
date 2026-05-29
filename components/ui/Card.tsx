import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
}

export function Card({ children, interactive = false, className = '', ...props }: CardProps) {
  const baseStyles = 'bg-bg-surface border border-divider rounded-lg shadow-sm overflow-hidden';
  const interactiveStyles = interactive ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-t-2 hover:border-t-accent hover:border-x-divider hover:border-b-divider' : '';
  
  return (
    <div className={`${baseStyles} ${interactiveStyles} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-6 py-4 border-b border-divider ${className}`} {...props}>{children}</div>;
}

export function CardContent({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-6 ${className}`} {...props}>{children}</div>;
}
