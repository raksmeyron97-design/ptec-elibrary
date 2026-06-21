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
      type="button" 
      onClick={toggle}
      className={`text-sm hover:text-white transition-colors flex items-center gap-2 ${className || ''}`}
    >
      {locale === 'en' ? '🇰🇭 ខ្មែរ' : '🇬🇧 English'}
    </button>
  );
}
