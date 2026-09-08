'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/api';
import { hostBookingApi, type Booking } from '@/lib/bookingApi';

const STATUS_LABEL: Record<Booking['status'], string> = {
  HOLD: 'Bekletme',
  CONFIRMED: 'Onaylı',
  EXPIRED: 'Süresi doldu',
  CANCELLED: 'İptal edildi',
};
const STATUS_CLS: Record<Booking['status'], string> = {
  HOLD: 'bg-gold/20 text-ink',
  CONFIRMED: 'bg-olive/15 text-olive',
  EXPIRED: 'bg-sand text-muted',
  CANCELLED: 'bg-sand text-muted',
};
const PAYMENT_LABEL: Record<Booking['paymentStatus'], string> = {
  NONE: '',
  PENDING: 'Kapora bekleniyor',
  DECLARED: 'Dekont bekleniyor',
  PAID: 'Ödeme alındı',
};

const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const STATUS_FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'HOLD', label: 'Bekleyen' },
  { value: 'CONFIRMED', label: 'Onaylı' },
  { value: 'CANCELLED', label: 'İptal edilen' },
  { value: 'EXPIRED', label: 'Süresi dolan' },
] as const;

export default function HostReservationsPage() {
  const [status, setStatus] = useState<string>('');
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    hostBookingApi
      .list({ status: status || undefined })
      .then((result) => setItems([...result.items].sort((a, b) => a.checkIn.localeCompare(b.checkIn))))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Rezervasyonlar yüklenemedi.'));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
        <h1 className="font-display text-lg font-light text-ink">
          Gelen rezervasyonlar
          {items && <span className="ml-2.5 text-[0.85rem] text-muted">{items.length}</span>}
        </h1>
        <div className="flex items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-3.5 py-1.5 text-[0.8rem] transition-colors ${
                status === f.value ? 'bg-ink text-canvas' : 'text-ink-soft hover:bg-sand'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <p className="mb-5 max-w-2xl text-[0.82rem] leading-relaxed text-muted">
          Misafirin adı, e‑postası ve telefonu yalnızca rezervasyon <strong className="text-ink">onaylandıktan</strong> sonra
          görünür — kapora ödenmeden iletişim bilgisi paylaşılmaz.
        </p>

        {error && <p role="alert" className="mb-4 text-[0.85rem] text-red-700">{error}</p>}

        {!items ? (
          <p className="text-[0.9rem] text-muted">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="text-[0.9rem] text-muted">Bu filtreye uyan rezervasyon yok.</p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {items.map((booking) => (
              <Link href={`/hesabim/ev-sahibi/rezervasyonlar/${booking.id}`} key={booking.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-sand/35">
                <div className="min-w-0">
                  <p className="truncate text-[0.92rem] text-ink">
                    {booking.villa.title}
                    {booking.customerName ? ` · ${booking.customerName}` : ''}
                  </p>
                  <p className="mt-0.5 text-[0.78rem] text-muted">
                    {dateLabel(booking.checkIn)} – {dateLabel(booking.checkOut)} · {booking.adults} yetişkin
                    {booking.children ? `, ${booking.children} çocuk` : ''}
                    {booking.infants ? `, ${booking.infants} bebek` : ''} · {formatPrice(booking.totalAmount, booking.currency)}
                  </p>
                  {(booking.customerEmail || booking.customerPhone) && (
                    <p className="mt-0.5 text-[0.78rem] text-muted">{booking.customerEmail}{booking.customerEmail && booking.customerPhone ? ' · ' : ''}{booking.customerPhone}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {PAYMENT_LABEL[booking.paymentStatus] && (
                    <span className="rounded-full bg-sand px-2.5 py-1 text-[0.7rem] text-muted">
                      {PAYMENT_LABEL[booking.paymentStatus]}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${STATUS_CLS[booking.status]}`}>
                    {STATUS_LABEL[booking.status]}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
