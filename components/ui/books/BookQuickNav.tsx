"use client";

import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';

export default function BookQuickNav({
  hasPdf,
  hasReviews,
}: {
  hasPdf: boolean;
  hasReviews: boolean;
}) {
  const t = useTranslations('bookDetail');
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`sticky top-0 z-40 -mx-6 mb-6 flex items-center gap-6 overflow-x-auto border-b bg-bg-body/95 px-6 py-3 backdrop-blur-md transition-all lg:hidden ${
        isSticky ? "border-divider shadow-sm" : "border-transparent"
      }`}
    >
      {hasPdf && (
        <a
          href="#reader"
          className="whitespace-nowrap text-sm font-bold text-text-muted transition-colors hover:text-brand"
        >
          {t('read')}
        </a>
      )}
      <a
        href="#details"
        className="whitespace-nowrap text-sm font-bold text-text-muted transition-colors hover:text-brand"
      >
        {t('details')}
      </a>
      {hasReviews && (
        <a
          href="#reviews"
          className="whitespace-nowrap text-sm font-bold text-text-muted transition-colors hover:text-brand"
        >
          {t('reviews')}
        </a>
      )}
    </div>
  );
}
