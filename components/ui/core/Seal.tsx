import React from 'react';
import Image from 'next/image';

interface SealProps {
  size?: number;
  className?: string;
  watermark?: boolean;
}

export function Seal({ size = 64, className = '', watermark = false }: SealProps) {
  const opacity = watermark ? 'opacity-5' : 'opacity-100';
  return (
    <div className={`relative flex-shrink-0 ${opacity} ${className}`} style={{ width: size, height: size }}>
      <Image
        src="/logo_footer.png"
        alt="PTEC Seal"
        fill
        className="object-contain"
        sizes={`${size}px`}
      />
    </div>
  );
}
