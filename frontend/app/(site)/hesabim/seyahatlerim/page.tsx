'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { listMyBookings, type GuestBooking, type OwnBookingScope } from '@/lib/reservationApi';

const FILTERS: { value: OwnBookingScope; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'action-required', label: 'İşlem gereken' },
  { value: 'upcoming', label: 'Yaklaşan' },
  { value: 'past', label: 'Geçmiş' },
  { value: 'cancelled', label: 'İptal / süresi dolan' },
];

const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

function stateOf(booking: GuestBooking) {
  if (booking.status === 'CONFIRMED') return { label: 'Onaylandı', cls: 'bg-olive/15 text-olive' };
  if (booking.status === 'CANCELLED') return { label: 'İptal edildi', cls: 'bg-sand text-muted' };
  if (booking.status === 'EXPIRED') return { label: 'Süresi doldu', cls: 'bg-sand text-muted' };
  if (booking.paymentStatus === 'DECLARED') return { label: 'Ödeme kontrol ediliyor', cls: 'bg-gold/20 text-ink' };
  return { label: 'Kapora bekleniyor', cls: 'bg-gold/20 text-ink' };
}

export default function TripsPage() {
  const router = useRouter();
  const [scope, setScope] = useState<OwnBookingScope>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: GuestBooking[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError(cause instanceof Error ? cause.message : 'Seyahatler yüklenemedi.');
      });
  }, [page, router, scope]);

  useEffect(() => { load(); }, [load]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-36 lg:px-10">
      <p className="eyebrow text-gold">Hesabım</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(2.2rem,4vw,3.2rem)] font-light tracking-[-0.02em] text-ink">Seyahatlerim</h1>
          <p className="mt-2 text-[0.92rem] text-muted">Ödeme bekleyen, yaklaşan ve tamamlanan konaklamalarınız.</p>
        </div>
        <Link href="/hesabim" className="text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">Hesabıma dön</Link>
      </div>

      <div className="mt-10 flex flex-wrap gap-2 border-b border-line pb-5">
        {FILTERS.map((filter) => (
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
        <p className="mt-8 text-[0.9rem] text-muted">Yükleniyor…</p>
      ) : result.items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-[0.92rem] text-muted">Bu filtrede gösterilecek seyahatiniz yok.</p>
          <Link href="/villalar" className="mt-4 inline-block text-[0.88rem] text-ink underline underline-offset-4 hover:text-gold">Villaları keşfedin</Link>
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
                    {dateLabel(booking.checkIn)} – {dateLabel(booking.checkOut)} · {booking.adults} yetişkin
                    {booking.children ? `, ${booking.children} çocuk` : ''} · {formatPrice(booking.totalAmount, booking.currency)}
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
          <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="text-ink disabled:opacity-35">← Önceki</button>
          <span className="text-muted">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage((value) => value + 1)} className="text-ink disabled:opacity-35">Sonraki →</button>
        </div>
      )}
    </main>
  );
}
