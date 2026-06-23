'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { setLocaleCookie } from '@/app/actions/locale';

interface Props {
  locale: 'en' | 'km';
  className?: string;
}

export default function LanguageSwitcher({ locale, className }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const switchTo = (next: 'en' | 'km') => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleCookie(next);
      router.refresh();
    });
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
