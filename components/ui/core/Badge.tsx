import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ children, variant = 'neutral', className = '', ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  
  const variants = {
    neutral: 'bg-paper text-text-muted border border-divider',
    brand: 'bg-brand/5 text-brand border border-blue-200',
    success: 'bg-green-50 text-success border border-green-200',
    warning: 'bg-gold-50 text-warning border border-gold-200',
    danger: 'bg-red-50 text-danger border border-red-200',
    info: 'bg-brand/5 text-info border border-blue-200',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
