'use client';

import Link from '@/components/site/LocaleLink';
import { useRouter } from '@/i18n/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCurrency } from '@/components/site/CurrencyProvider';
import { ApiError } from '@/lib/http';
import { listMyBookings, type GuestBooking, type OwnBookingScope } from '@/lib/reservationApi';

export default function TripsPage() {
  const { formatPrice } = useCurrency();
  const locale = useLocale();
  const t = useTranslations('Account');
  const router = useRouter();
  const [scope, setScope] = useState<OwnBookingScope>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: GuestBooking[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filters: { value: OwnBookingScope; label: string }[] = [
    { value: 'all', label: t('filterAll') },
    { value: 'action-required', label: t('filterAction') },
    { value: 'upcoming', label: t('filterUpcoming') },
    { value: 'past', label: t('filterPast') },
    { value: 'cancelled', label: t('filterCancelled') },
  ];
  const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(
    locale === 'tr' ? 'tr-TR' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
  );
  const stateOf = (booking: GuestBooking) => {
    if (booking.status === 'REQUESTED') return { label: t('statusRequested'), cls: 'bg-gold/20 text-ink' };
    if (booking.status === 'DECLINED') return { label: t('statusDeclined'), cls: 'bg-red-50 text-red-700' };
    if (booking.status === 'WITHDRAWN') return { label: t('statusWithdrawn'), cls: 'bg-sand text-muted' };
    if (booking.status === 'CONFIRMED') return { label: t('statusConfirmed'), cls: 'bg-olive/15 text-olive' };
    if (booking.status === 'CANCELLED') return { label: t('statusCancelled'), cls: 'bg-sand text-muted' };
    if (booking.status === 'EXPIRED') return { label: t('statusExpired'), cls: 'bg-sand text-muted' };
    if (booking.paymentStatus === 'DECLARED') return { label: t('statusChecking'), cls: 'bg-gold/20 text-ink' };
    return { label: t('statusDeposit'), cls: 'bg-gold/20 text-ink' };
  };

  const load = useCallback(() => {
    setResult(null);
    setError(null);
    listMyBookings({ scope, page, pageSize: 12 })
      .then(setResult)
      .catch((cause) => {
        if (cause instanceof ApiError && cause.status === 401) {
          router.replace('/giris?next=/hesabim/seyahatlerim');
          return;
        }
        setError(cause instanceof Error ? cause.message : t('tripsError'));
      });
  }, [page, router, scope, t]);

  useEffect(() => { load(); }, [load]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-36 lg:px-10">
      <p className="eyebrow text-gold">{t('title')}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(2.2rem,4vw,3.2rem)] font-light tracking-[-0.02em] text-ink">{t('tripsTitle')}</h1>
          <p className="mt-2 text-[0.92rem] text-muted">{t('tripsIntro')}</p>
        </div>
        <Link href="/hesabim" className="text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">{t('backAccount')}</Link>
      </div>

      <div className="mt-10 flex flex-wrap gap-2 border-b border-line pb-5">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => { setScope(filter.value); setPage(1); }}
            className={`rounded-full px-4 py-2 text-[0.82rem] transition-colors ${
              scope === filter.value ? 'bg-ink text-canvas' : 'border border-line text-ink-soft hover:border-ink'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-8 text-[0.9rem] text-red-700">{error}</p>
      ) : !result ? (
        <p className="mt-8 text-[0.9rem] text-muted">{t('loading')}</p>
      ) : result.items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-[0.92rem] text-muted">{t('emptyFilter')}</p>
          <Link href="/villalar" className="mt-4 inline-block text-[0.88rem] text-ink underline underline-offset-4 hover:text-gold">{t('exploreVillas')}</Link>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-line border-y border-line">
          {result.items.map((booking) => {
            const state = stateOf(booking);
            return (
              <Link
                key={booking.id}
                href={`/hesabim/seyahatlerim/${booking.id}`}
                className="flex flex-wrap items-center justify-between gap-5 py-5 transition-colors hover:bg-sand/25 sm:px-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[1rem] text-ink">{booking.villa.title}</p>
                  <p className="mt-1 text-[0.82rem] text-muted">
                    {dateLabel(booking.checkIn)} – {dateLabel(booking.checkOut)} · {t('guestCount', { adults: booking.adults, children: booking.children, infants: booking.infants })} · {formatPrice(booking.totalAmount, booking.currency)}
                  </p>
                  <p className="mt-1 text-[0.75rem] uppercase tracking-[0.12em] text-muted">
                    {booking.payment?.reference ?? `MV-${booking.id.slice(-6).toUpperCase()}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[0.76rem] ${state.cls}`}>{state.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {result && pages > 1 && (
        <div className="mt-8 flex items-center justify-between text-[0.84rem]">
          <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="text-ink disabled:opacity-35">← {t('previous')}</button>
          <span className="text-muted">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage((value) => value + 1)} className="text-ink disabled:opacity-35">{t('next')} →</button>
        </div>
      )}
    </main>
  );
}
