import React from 'react';
import Image from 'next/image';

interface SealProps {
  size?: number;
  className?: string;
  watermark?: boolean;
  variant?: 'default' | 'footer';
}

export function Seal({ size = 64, className = '', watermark = false, variant = 'default' }: SealProps) {
  const opacity = watermark ? 'opacity-5' : 'opacity-100';
  const logoSrc = variant === 'footer' ? '/logo_footer.webp' : '/logo.webp';
  return (
    <div className={`relative flex-shrink-0 ${opacity} ${className}`} style={{ width: size, height: size }}>
      <Image
        src={logoSrc}
        alt="PTEC Seal"
        fill
        className="object-contain"
        sizes={`${size}px`}
      />
    </div>
  );
}
