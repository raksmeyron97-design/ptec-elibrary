'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setLocaleCookie } from '@/app/actions/locale';

interface Props {
  locale: 'en' | 'km';
  className?: string;
}

export default function LanguageSwitcher({ locale, className }: Props) {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const switchTo = (next: 'en' | 'km') => {
    if (next === locale) {
      setOpen(false);
      return;
    }
    // Read the query string here rather than with useSearchParams(): that hook
    // forces a client-side bailout, which would keep the navbar — and therefore
    // every public page — out of the prerender. By click time we are
    // unambiguously in the browser, so window.location is the same information
    // for free.
    const qs = window.location.search.replace(/^\?/, '');
    startTransition(async () => {
      await setLocaleCookie(next);
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { locale: next, scroll: false });
      setOpen(false);
    });
  };

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const currentLabel = locale === 'km' ? t('languageKhmer') : t('languageEnglish');
  const options = [
    { locale: 'en' as const, label: t('languageEnglish'), lang: 'en' },
    { locale: 'km' as const, label: t('languageKhmer'), lang: 'km' },
  ];

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex ${className || 'text-text-body'}`}
    >
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        aria-label={t('language')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-current/15 bg-transparent px-3 text-sm font-medium text-current transition-colors hover:bg-current/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
      >
        <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{currentLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={menuId}
        inert={!open}
        aria-hidden={!open}
        className={`absolute right-0 top-[calc(100%+8px)] z-[120] w-44 origin-top-right rounded-xl border border-divider bg-bg-surface p-1.5 text-text-body shadow-lg ring-1 ring-black/5 transition-[opacity,transform] duration-150 motion-reduce:transition-none ${
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0'
        }`}
      >
        <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t('language')}
        </div>
        {options.map((option) => {
          const active = option.locale === locale;
          return (
            <button
              key={option.locale}
              type="button"
              lang={option.lang}
              onClick={() => switchTo(option.locale)}
              aria-current={active ? 'true' : undefined}
              className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors ${
                active
                  ? 'bg-brand/10 font-semibold text-brand'
                  : 'text-text-body hover:bg-paper hover:text-brand'
              }`}
            >
              <Check
                className={`h-4 w-4 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden="true"
              />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
