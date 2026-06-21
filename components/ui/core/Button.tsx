import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-md';
  
  const variants = {
    primary: 'bg-brand text-brand-contrast hover:bg-brand-hover shadow-sm',
    secondary: 'bg-bg-surface text-brand border border-brand hover:bg-brand/5',
    ghost: 'text-brand hover:bg-brand/5',
    gold: 'bg-accent text-text-heading hover:bg-gold-400 shadow-sm font-semibold',
  };
  
  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-base px-4 py-2',
    lg: 'text-lg px-6 py-3',
  };

  return (
    <button type="button">
      {children}
    </button>
  );
}
