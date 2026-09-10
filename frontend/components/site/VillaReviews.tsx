'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { PublicReviewPage } from '@/lib/api';

export default function VillaReviews({ reviews }: { reviews: PublicReviewPage }) {
  const locale = useLocale();
  const t = useTranslations('Reviews');
  const dateLabel = (value: string) => new Date(value).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric' });
  if (!reviews.total) return null;
  return (
    <section className="mt-16 border-t border-line pt-12" id="yorumlar">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-gold">{t('eyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-light text-ink">{t('title')}</h2>
        </div>
        <p className="text-[0.85rem] text-muted">{t('count', { count: reviews.total })}</p>
      </div>
      <div className="mt-7 max-w-sm space-y-1.5" aria-label={t('distribution')}>
        {reviews.distribution.map((row) => (
          <div key={row.rating} className="flex items-center gap-3 text-xs text-muted">
            <span className="w-6">{row.rating}★</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-deep">
              <span className="block h-full rounded-full bg-gold" style={{ width: `${reviews.total ? (row.count / reviews.total) * 100 : 0}%` }} />
            </span>
            <span className="w-6 text-right">{row.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {reviews.items.map((review, index) => (
          <article key={`${review.createdAt}-${index}`} className="rounded-xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between gap-4">
              <span className="tracking-[0.12em] text-gold" aria-label={t('ratingAria', { rating: review.rating })}>
                {'★'.repeat(review.rating)}<span className="text-line">{'★'.repeat(5 - review.rating)}</span>
              </span>
              <span className="text-[0.75rem] text-muted">{dateLabel(review.createdAt)}</span>
            </div>
            <p className="mt-4 whitespace-pre-line text-[0.92rem] leading-relaxed text-ink-soft">{review.body}</p>
            <p className="mt-5 text-[0.78rem] text-muted">{review.guestName} · ✓ {t('verified')}</p>
            {review.response && (
              <div className="mt-5 border-l-2 border-gold/50 pl-4">
                <p className="text-[0.75rem] font-medium text-ink">{t('hostResponse')}</p>
                <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{review.response.body}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
