'use client';

import { useEffect, useState } from 'react';

export default function LanguageSwitcher({ className }: { className?: string }) {
  const [locale, setLocale] = useState<'en' | 'km'>('en');

  useEffect(() => {
    const cookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('ptec_locale='));
    const value = cookie?.split('=')[1];
    if (value === 'km') setLocale('km');
  }, []);

  const toggle = () => {
    const next = locale === 'en' ? 'km' : 'en';
    document.cookie = `ptec_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    window.location.reload();
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle language"
      className={className || "flex items-center gap-1.5 text-[12px] font-medium text-gold-200 hover:text-white transition-colors cursor-pointer"}
    >
      {locale === 'en' ? '🇰🇭 ខ្មែរ' : '🇬🇧 English'}
    </button>
  );
}
