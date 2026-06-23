'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher({ className }: { className?: string }) {
  const [locale, setLocale] = useState<'en' | 'km'>('en');

  useEffect(() => {
    const cookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('ptec_locale='));
    const value = cookie?.split('=')[1];
    if (value === 'km') setLocale('km');
  }, []);

  const switchTo = (next: 'en' | 'km') => {
    if (next === locale) return;
    document.cookie = `ptec_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    window.location.reload();
  };

  const enLabel = locale === 'km' ? 'អង់គ្លេស' : 'EN';

  return (
    <div className={`flex items-center gap-2 text-sm ${className || ''}`}>
      <Globe className="w-4 h-4 shrink-0" />
      <button
        type="button"
        onClick={() => switchTo('en')}
        className={`transition-colors hover:text-white ${locale === 'en' ? 'underline font-semibold text-white' : ''}`}
      >
        {enLabel}
      </button>
      <span className="opacity-40 select-none">|</span>
      <button
        type="button"
        onClick={() => switchTo('km')}
        className={`transition-colors hover:text-white ${locale === 'km' ? 'underline font-semibold text-white' : ''}`}
      >
        KH
      </button>
    </div>
  );
}
