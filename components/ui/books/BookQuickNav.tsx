"use client";

import { useTranslations } from 'next-intl';

export default function BookQuickNav({
  hasPdf,
  hasReviews,
  hasCopies,
}: {
  hasPdf: boolean;
  hasReviews: boolean;
  hasCopies?: boolean;
}) {
  const t = useTranslations('bookDetail');

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <a href="#details" className="qlink">
        {t('details')}
      </a>
      {hasPdf && (
        <a href="#reader" className="qlink">
          {t('read')}
        </a>
      )}
      {hasCopies && (
        <a href="#copies" className="qlink">
          {t('physicalCopies')}
        </a>
      )}
      {hasReviews && (
        <a href="#reviews" className="qlink">
          {t('reviews')}
        </a>
      )}
    </div>
  );
}
