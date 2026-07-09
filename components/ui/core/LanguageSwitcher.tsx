'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Globe } from 'lucide-react';
import { setLocaleCookie } from '@/app/actions/locale';

interface Props {
  locale: 'en' | 'km';
  className?: string;
}

export default function LanguageSwitcher({ locale, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const switchTo = (next: 'en' | 'km') => {
    if (next === locale) return;
    const qs = searchParams.toString();
    startTransition(async () => {
      await setLocaleCookie(next);
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { locale: next, scroll: false });
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
