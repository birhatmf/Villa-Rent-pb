'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPrice } from '@/lib/api';
import { bookingApi, hostBookingApi, type Booking, type BookingApiClient, type BookingListParams, type BookingListResult } from '@/lib/bookingApi';
import { createVillaApi } from '@/lib/villaApi';

const INPUT = 'rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.82rem] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-olive-soft focus-visible:ring-2 focus-visible:ring-olive/15';
const STATUS_LABEL: Record<Booking['status'], string> = {
  REQUESTED: 'Talep bekliyor',
  HOLD: 'Onay bekliyor',
  CONFIRMED: 'Onaylandı',
  EXPIRED: 'Süresi doldu',
  CANCELLED: 'İptal edildi',
  DECLINED: 'Talep reddedildi',
  WITHDRAWN: 'Geri çekildi',
};
const STATUS_STYLE: Record<Booking['status'], string> = {
  REQUESTED: 'border-gold/25 bg-gold/10 text-gold',
  HOLD: 'border-gold/25 bg-gold/10 text-gold',
  CONFIRMED: 'border-olive/20 bg-olive/10 text-olive',
  EXPIRED: 'border-line bg-sand/60 text-muted',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
  DECLINED: 'border-red-200 bg-red-50 text-red-700',
  WITHDRAWN: 'border-line bg-sand/60 text-muted',
};
const PAYMENT_LABEL: Record<Booking['paymentStatus'], string> = {
  NONE: 'Ödeme gerekmiyor',
  PENDING: 'Kapora bekleniyor',
  DECLARED: 'Havale bildirildi',
  PAID: 'Ödeme doğrulandı',
};
const STATUS_FILTERS = [
  ['', 'Tüm rezervasyonlar'],
  ['REQUESTED', 'Yeni talepler'],
  ['HOLD', 'Onay bekleyen'],
  ['CONFIRMED', 'Onaylanan'],
  ['CANCELLED', 'İptal edilen'],
  ['EXPIRED', 'Süresi dolan'],
  ['DECLINED', 'Reddedilen'],
  ['WITHDRAWN', 'Geri çekilen'],
] as const;

type Filters = Pick<BookingListParams, 'q' | 'status' | 'paymentStatus' | 'channel' | 'villaId' | 'from' | 'to'>;
const EMPTY_FILTERS: Filters = { q: '', status: '', paymentStatus: '', channel: '', villaId: '', from: '', to: '' };

export default function ReservationsList({ scope = 'admin' }: { scope?: 'admin' | 'host' }) {
  const api: BookingApiClient = scope === 'admin' ? bookingApi : hostBookingApi;
  const villaApi = useMemo(() => createVillaApi(scope), [scope]);
  const detailBase = scope === 'admin' ? '/admin/rezervasyonlar' : '/hesabim/ev-sahibi/rezervasyonlar';
  const calendarHref = scope === 'admin' ? '/admin/takvim' : '/hesabim/ev-sahibi/takvim';
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BookingListResult | null>(null);
  const [villas, setVillas] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('status');
    if (requested && requested in STATUS_LABEL) setFilters((current) => ({ ...current, status: requested }));
  }, []);

  useEffect(() => {
    villaApi.list({ pageSize: 100 })
      .then((result) => setVillas(result.items.map(({ id, title }) => ({ id, title }))))
      .catch(() => {});
  }, [villaApi]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.list({ ...filters, page, pageSize: 20 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Rezervasyonlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [api, filters, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), filters.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters.q, load]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-7">
        <div>
          <p className="eyebrow text-gold">Operasyon</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <h1 className="font-display text-2xl font-light tracking-[-0.02em] text-ink">{scope === 'admin' ? 'Rezervasyonlar' : 'Gelen rezervasyonlar'}</h1>
            {data && <span className="text-[0.82rem] text-muted">{data.total} kayıt</span>}
          </div>
        </div>
        <Link href={calendarHref} className="rounded-full border border-ink/20 px-4 py-2 text-[0.8rem] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-canvas">
          Takvim görünümü
        </Link>
      </header>

      <div className="shrink-0 border-b border-line bg-sand/20 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(([value, label]) => (
            <button key={value} onClick={() => set('status', value)} className={`rounded-full px-3.5 py-1.5 text-[0.76rem] transition-colors ${filters.status === value ? 'bg-ink text-canvas' : 'border border-line bg-surface text-muted hover:border-ink hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(130px,1fr))_auto]">
          <input aria-label="Rezervasyonlarda ara" value={filters.q} onChange={(event) => set('q', event.target.value)} placeholder="Ad, e-posta, telefon, villa veya rezervasyon no" className={INPUT} />
          <select aria-label="Villa filtresi" value={filters.villaId} onChange={(event) => set('villaId', event.target.value)} className={INPUT}>
            <option value="">Tüm villalar</option>
            {villas.map((villa) => <option key={villa.id} value={villa.id}>{villa.title}</option>)}
          </select>
          <select aria-label="Ödeme durumu filtresi" value={filters.paymentStatus} onChange={(event) => set('paymentStatus', event.target.value)} className={INPUT}>
            <option value="">Tüm ödemeler</option>
            <option value="DECLARED">Havale bildirildi</option>
            <option value="PENDING">Kapora bekleniyor</option>
            <option value="PAID">Ödeme doğrulandı</option>
            <option value="NONE">Ödeme gerekmiyor</option>
          </select>
          <select aria-label="Rezervasyon kanalı filtresi" value={filters.channel} onChange={(event) => set('channel', event.target.value)} className={INPUT}>
            <option value="">Tüm kanallar</option>
            <option value="WEBSITE">Web sitesi</option>
            <option value="ADMIN">Yönetim paneli</option>
          </select>
          <input aria-label="Konaklama başlangıcı" title="Bu tarihten sonra devam eden konaklamalar" type="date" value={filters.from} onChange={(event) => set('from', event.target.value)} className={INPUT} />
          <input aria-label="Konaklama bitişi" title="Bu tarihten önce başlayan konaklamalar" type="date" value={filters.to} onChange={(event) => set('to', event.target.value)} className={INPUT} />
          <button disabled={!filtered} onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }} className="rounded-lg px-3 py-2 text-[0.78rem] text-muted hover:bg-sand hover:text-ink disabled:opacity-30">
            Temizle
          </button>
        </div>
      </div>

      {error && <p role="alert" className="shrink-0 border-b border-red-200 bg-red-50 px-7 py-2.5 text-[0.8rem] text-red-700">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="hidden min-w-[980px] lg:block">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-canvas/95 backdrop-blur">
              <tr className="border-b border-line">
                {['Rezervasyon', 'Misafir', 'Villa / konaklama', 'Tutar', 'Ödeme', 'Durum', ''].map((label) => (
                  <th key={label} className="eyebrow px-5 py-3 font-medium text-muted first:pl-7 last:pr-7">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((booking) => <ReservationRow key={booking.id} booking={booking} detailBase={detailBase} />)}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-line lg:hidden">
          {data?.items.map((booking) => <ReservationCard key={booking.id} booking={booking} detailBase={detailBase} />)}
        </div>

        {!loading && data?.items.length === 0 && (
          <div className="px-6 py-20 text-center">
            <p className="font-display text-xl font-light text-ink">Rezervasyon bulunamadı</p>
            <p className="mt-2 text-[0.82rem] text-muted">Filtreleri değiştirerek tekrar deneyin.</p>
          </div>
        )}
        {loading && !data && <p className="px-6 py-20 text-center text-[0.85rem] text-muted">Rezervasyonlar yükleniyor…</p>}
      </div>

      {data && (
        <footer className="flex shrink-0 items-center justify-between border-t border-line bg-surface px-5 py-3 text-[0.8rem] text-muted sm:px-7">
          <span>Sayfa {data.page} / {totalPages}</span>
          <div className="flex gap-2">
            <PageButton disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>← Önceki</PageButton>
            <PageButton disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Sonraki →</PageButton>
          </div>
        </footer>
      )}
    </div>
  );
}

function ReservationRow({ booking, detailBase }: { booking: Booking; detailBase: string }) {
  return (
    <tr className={`border-b border-line/70 transition-colors hover:bg-sand/35 ${booking.paymentStatus === 'DECLARED' && booking.status === 'HOLD' ? 'bg-gold/[0.045]' : ''}`}>
      <td className="py-4 pl-7 pr-5">
        <Link href={`${detailBase}/${booking.id}`} className="font-medium text-ink hover:text-gold">{reference(booking.id)}</Link>
        <p className="mt-1 text-[0.72rem] text-muted">{booking.channel === 'WEBSITE' ? 'Web sitesi' : 'Yönetim paneli'} · {shortDateTime(booking.createdAt)}</p>
      </td>
      <td className="px-5 py-4">
        <p className="max-w-48 truncate text-[0.84rem] text-ink">{booking.customerName || 'İsimsiz misafir'}</p>
        <p className="mt-1 max-w-48 truncate text-[0.72rem] text-muted">{booking.customerEmail || booking.customerPhone || 'İletişim bilgisi yok'}</p>
      </td>
      <td className="px-5 py-4">
        <p className="max-w-52 truncate text-[0.84rem] text-ink">{booking.villa.title}</p>
        <p className="mt-1 text-[0.72rem] text-muted">{shortDate(booking.checkIn)} → {shortDate(booking.checkOut)} · {nights(booking)} gece</p>
      </td>
      <td className="px-5 py-4 text-[0.84rem] text-ink">{formatPrice(booking.totalAmount, booking.currency)}</td>
      <td className="px-5 py-4"><PaymentBadge booking={booking} /></td>
      <td className="px-5 py-4"><StatusBadge status={booking.status} /></td>
      <td className="py-4 pl-5 pr-7 text-right"><Link href={`${detailBase}/${booking.id}`} aria-label="Rezervasyon detayını aç" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink">→</Link></td>
    </tr>
  );
}

function ReservationCard({ booking, detailBase }: { booking: Booking; detailBase: string }) {
  return (
    <Link href={`${detailBase}/${booking.id}`} className="block bg-surface px-5 py-5 hover:bg-sand/30">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[0.75rem] font-medium tracking-[0.08em] text-gold">{reference(booking.id)}</p><p className="mt-1 text-[0.95rem] text-ink">{booking.customerName || 'İsimsiz misafir'}</p></div>
        <StatusBadge status={booking.status} />
      </div>
      <p className="mt-4 text-[0.84rem] text-ink">{booking.villa.title}</p>
      <p className="mt-1 text-[0.76rem] text-muted">{shortDate(booking.checkIn)} → {shortDate(booking.checkOut)} · {nights(booking)} gece</p>
      <div className="mt-4 flex items-center justify-between gap-3"><PaymentBadge booking={booking} /><span className="text-[0.86rem] text-ink">{formatPrice(booking.totalAmount, booking.currency)}</span></div>
    </Link>
  );
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.68rem] ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function PaymentBadge({ booking }: { booking: Booking }) {
  const urgent = booking.status === 'HOLD' && booking.paymentStatus === 'DECLARED';
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.68rem] ${urgent ? 'bg-gold/20 font-medium text-ink' : booking.paymentStatus === 'PAID' ? 'bg-olive/10 text-olive' : 'bg-sand text-muted'}`}>{PAYMENT_LABEL[booking.paymentStatus]}</span>;
}

function PageButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button disabled={disabled} onClick={onClick} className="rounded-lg border border-line px-3 py-1.5 hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-35">{children}</button>;
}

const reference = (id: string) => `MV-${id.slice(-6).toUpperCase()}`;
const shortDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDateTime = (value: string) => new Date(value).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const nights = (booking: Pick<Booking, 'checkIn' | 'checkOut'>) => Math.round((new Date(`${booking.checkOut}T00:00:00Z`).getTime() - new Date(`${booking.checkIn}T00:00:00Z`).getTime()) / 86_400_000);
