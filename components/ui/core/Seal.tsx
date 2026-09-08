import React from 'react';
import Image from 'next/image';

interface SealProps {
  size?: number;
  className?: string;
  watermark?: boolean;
  variant?: 'default' | 'footer';
  /**
   * Set on the ONE seal that is above the fold (the header brand mark).
   * Without it next/image emits loading="lazy", which defers the request
   * until after layout — on an element that sits at the very top of every
   * page, so it delays first paint for no benefit. The footer, drawer and
   * 404 seals stay lazy: they are genuinely below the fold.
   */
  priority?: boolean;
}

export function Seal({ size = 64, className = '', watermark = false, variant = 'default', priority = false }: SealProps) {
  const opacity = watermark ? 'opacity-5' : 'opacity-100';
  const logoSrc = variant === 'footer' ? '/logo_footer.webp' : '/logo.webp';
  return (
    <div className={`relative flex-shrink-0 ${opacity} ${className}`} style={{ width: size, height: size }}>
      <Image
        src={logoSrc}
        alt="PTEC Seal"
        fill
        priority={priority}
        className="object-contain"
        sizes={`${size}px`}
      />
    </div>
  );
}
