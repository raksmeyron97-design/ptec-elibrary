import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

// Single source of truth for button styling. Links that must look like
// buttons should use buttonClasses() so the two can never drift apart.
const baseStyles =
  'inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-all duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand-hover shadow-sm',
  secondary: 'bg-bg-surface text-text-body border border-divider hover:border-brand/40 hover:text-brand hover:bg-brand/5',
  ghost: 'text-brand hover:bg-brand/5',
  gold: 'bg-accent text-blue-950 hover:bg-gold-400 shadow-sm',
};

// Fixed heights keep touch targets ≥44px at md and up (WCAG 2.5.8 / mobile HIG).
const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 rounded-lg px-3.5 text-[13px]',
  md: 'h-11 rounded-xl px-5 text-sm',
  lg: 'h-12 rounded-xl px-6 text-[15px]',
};

/** Compose the shared button classes — for <Link>/<a> elements styled as buttons. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button type={props.type || 'button'} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </button>
  );
}
