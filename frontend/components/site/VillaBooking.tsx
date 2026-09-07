'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatPrice, type AvailabilityResult } from '@/lib/api';
import { Section } from './detailShared';

type Range = { startDate: string; endDate: string };
type PriceRule = { startDate: string; endDate: string; pricePerNight: number };

export type VillaBookingVilla = {
  slug: string;
  currency: string;
  pricePerNight: number;
  priceRange: { min: number; max: number };
  priceRules: PriceRule[];
  blockedDates: Range[];
  minNights: number;
  maxAdults: number;
  maxChildren: number;
  maxInfants: number;
  cleaningFee: number;
  cleaningFeeThresholdNights: number;
  depositAmount: number;
  bookingMode: 'INSTANT' | 'REQUEST';
};

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const DAY = 86_400_000;
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const REASON: Record<string, string> = {
  SALES_PAUSED: 'Bu villa şu anda rezervasyona kapalı.',
  DATES_UNAVAILABLE: 'Seçilen aralıkta dolu geceler var.',
  MIN_STAY: 'Seçilen tarihler minimum konaklama süresini karşılamıyor.',
  CHECKIN_DAY: 'Bu tarihte giriş yapılamıyor.',
  CAPACITY_EXCEEDED: 'Misafir sayısı villa kapasitesini aşıyor.',
  SYNC_UNHEALTHY: 'Dış takvim henüz güncel doğrulanamadı. Rezervasyon talebi bırakabilirsiniz.',
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const parse = (value: string) => new Date(`${value}T00:00:00.000Z`);
const addMonths = (date: Date, count: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
const dayLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Takvim hücresine sığması için kısaltılmış gösterim: 18.500 → "18,5B". */
const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

function overlaps(from: string, to: string, ranges: Range[]) {
  return ranges.some((range) => from < range.endDate.slice(0, 10) && to > range.startDate.slice(0, 10));
}

export default function VillaBooking({
  villa,
  children,
}: {
  villa: VillaBookingVilla;
  children: React.ReactNode;
}) {
  const now = new Date();
  const today = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const [month, setMonth] = useState(() => new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [guests, setGuests] = useState({ adults: Math.min(2, villa.maxAdults), children: 0, infants: 0 });
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Sezon kuralı yoksa baz fiyat. Aralık sonu hariçtir ([başlangıç, bitiş)). */
  const priceFor = useMemo(() => {
    const rules = villa.priceRules;
    return (date: string) =>
      rules.find((rule) => rule.startDate <= date && rule.endDate > date)?.pricePerNight ?? villa.pricePerNight;
  }, [villa.priceRules, villa.pricePerNight]);

  useEffect(() => {
    if (!from || !to) { setResult(null); return; }
    const controller = new AbortController();
    const params = new URLSearchParams({
      from,
      to,
      adults: String(guests.adults),
      children: String(guests.children),
      infants: String(guests.infants),
    });
    setChecking(true);
    setError(null);
    fetch(`${API}/villas/${encodeURIComponent(villa.slug)}/availability?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Müsaitlik kontrol edilemedi.');
        return response.json() as Promise<AvailabilityResult>;
      })
      .then(setResult)
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [from, to, guests, villa.slug]);

  function choose(date: string) {
    if (date < today) return;
    const blocked = overlaps(date, iso(new Date(parse(date).getTime() + DAY)), villa.blockedDates);
    if (!from || to || date <= from) {
      if (blocked) return;
      setFrom(date);
      setTo('');
      setResult(null);
      return;
    }
    if (overlaps(from, date, villa.blockedDates)) {
      if (!blocked) setFrom(date);
      setTo('');
      return;
    }
    setTo(date);
  }

  const quote = result?.quote ?? null;
  // Dış takvim doğrulanamadıysa kesin rezervasyon yok ama talep akışı açık kalır.
  const syncOnly = Boolean(result && !result.available && result.reasons.every((reason) => reason === 'SYNC_UNHEALTHY'));
  const bookable = Boolean(result?.available && result.bookingMode === 'INSTANT');
  const requestable = Boolean(result && (syncOnly || (result.available && result.bookingMode === 'REQUEST')));
  const reserveHref = `/rezervasyon/yeni?${new URLSearchParams({
    villa: villa.slug,
    from,
    to,
    adults: String(guests.adults),
    children: String(guests.children),
    infants: String(guests.infants),
  })}`;
  const requestHref = `/iletisim?villa=${encodeURIComponent(villa.slug)}&from=${from}&to=${to}`;

  return (
    <>
      <div className="grid gap-16 lg:grid-cols-[1fr_360px]">
        <div className="space-y-14">
          <Section title="Fiyat ve Müsaitlik">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.82rem] text-muted">
                Giriş ve çıkış gününü seçin. Rakamlar o gecenin fiyatıdır ({villa.currency}).
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Önceki ay" className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink">‹</button>
                <button type="button" onClick={() => setMonth(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)))} className="text-[0.76rem] text-muted hover:text-ink">Bugün</button>
                <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Sonraki ay" className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink">›</button>
              </div>
            </div>

            <div className="grid gap-10 sm:grid-cols-2">
              <Month month={month} ranges={villa.blockedDates} today={today} from={from} to={to} priceFor={priceFor} onChoose={choose} />
              <Month month={addMonths(month, 1)} ranges={villa.blockedDates} today={today} from={from} to={to} priceFor={priceFor} onChoose={choose} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.76rem] text-muted">
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sand-deep" /> Dolu</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-olive" /> Seçili geceler</span>
              <span>Çıkış günü başka bir misafirin giriş günü olabilir.</span>
            </div>
          </Section>

          {children}
        </div>

        <aside className="h-fit space-y-5 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-28">
          <div>
            <p className="eyebrow text-muted">{quote ? `${result?.nights} gece toplam` : 'Gecelik fiyat'}</p>
            <p className="mt-1.5 font-display text-[1.7rem] leading-tight text-ink">
              {quote
                ? formatPrice(quote.totalAmount, quote.currency)
                : villa.priceRange.min === villa.priceRange.max
                  ? formatPrice(villa.priceRange.min, villa.currency)
                  : `${formatPrice(villa.priceRange.min, villa.currency)} – ${formatPrice(villa.priceRange.max, villa.currency)}`}
            </p>
            <p className="text-[0.8rem] text-muted">
              {quote ? 'Seçilen tarihler için' : 'Sezona göre değişir'}
            </p>
          </div>

          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line">
            <DateCell label="Giriş" value={from} />
            <DateCell label="Çıkış" value={to} className="border-l border-line" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <GuestInput label="Yetişkin" value={guests.adults} max={villa.maxAdults} min={1} onChange={(adults) => setGuests({ ...guests, adults })} />
            <GuestInput label="Çocuk" value={guests.children} max={villa.maxChildren} onChange={(children) => setGuests({ ...guests, children })} />
            <GuestInput label="Bebek" value={guests.infants} max={villa.maxInfants} onChange={(infants) => setGuests({ ...guests, infants })} />
          </div>

          {quote && (
            <dl className="space-y-2 border-t border-line pt-4 text-[0.85rem]">
              <Line label={`${result?.nights} gece konaklama`} value={formatPrice(quote.accommodationAmount, quote.currency)} />
              {quote.cleaningFeeAmount > 0 && (
                <Line label="Temizlik ücreti" value={formatPrice(quote.cleaningFeeAmount, quote.currency)} />
              )}
              <Line label="Toplam" value={formatPrice(quote.totalAmount, quote.currency)} strong />
              {quote.prepaymentAmount > 0 && (
                <Line label="Şimdi ödenecek kapora" value={formatPrice(quote.prepaymentAmount, quote.currency)} />
              )}
            </dl>
          )}

          {checking && <p className="text-[0.8rem] text-muted">Tarihler kontrol ediliyor…</p>}
          {error && <p role="alert" className="text-[0.8rem] text-red-700">{error}</p>}
          {result && !checking && !result.available && (
            <p className={`text-[0.82rem] ${syncOnly ? 'text-muted' : 'text-red-700'}`}>
              {result.reasons.map((reason) => REASON[reason] ?? reason).join(' ')}
            </p>
          )}

          {bookable ? (
            <Link href={reserveHref} className="block rounded-full bg-ink py-3 text-center text-[0.9rem] text-canvas transition-colors hover:bg-olive">
              Rezervasyona devam et
            </Link>
          ) : requestable ? (
            <Link href={requestHref} className="block rounded-full border border-ink py-3 text-center text-[0.9rem] text-ink transition-colors hover:bg-ink hover:text-canvas">
              Rezervasyon talebi gönder
            </Link>
          ) : (
            <button type="button" disabled className="w-full cursor-not-allowed rounded-full bg-ink/25 py-3 text-[0.9rem] text-canvas">
              {from && !to ? 'Çıkış tarihini seçin' : 'Tarih seçin'}
            </button>
          )}

          <div className="border-t border-line pt-4 text-[0.82rem] leading-relaxed text-muted">
            <p>Minimum konaklama: {villa.minNights} gece</p>
            <p className="mt-1">Hasar depozitosu: {formatPrice(villa.depositAmount, villa.currency)} (girişte alınır)</p>
            <p className="mt-1">
              Temizlik ücreti ({formatPrice(villa.cleaningFee, villa.currency)}) yalnızca {villa.cleaningFeeThresholdNights} geceden kısa
              konaklamalarda uygulanır.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobilde fiyat ve buton tüm gezinme boyunca görünür kalır. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-line bg-surface/95 px-5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-sm lg:hidden">
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-ink">
            {quote
              ? formatPrice(quote.totalAmount, quote.currency)
              : villa.priceRange.min === villa.priceRange.max
                ? formatPrice(villa.priceRange.min, villa.currency)
                : `${formatPrice(villa.priceRange.min, villa.currency)}+`}
          </p>
          <p className="text-[0.76rem] text-muted">{quote ? `${result?.nights} gece toplam` : '/ gece'}</p>
        </div>
        {bookable ? (
          <Link href={reserveHref} className="shrink-0 rounded-full bg-ink px-6 py-3 text-[0.88rem] text-canvas">Devam et</Link>
        ) : requestable ? (
          <Link href={requestHref} className="shrink-0 rounded-full border border-ink px-6 py-3 text-[0.88rem] text-ink">Talep gönder</Link>
        ) : (
          <span className="shrink-0 rounded-full bg-ink/25 px-6 py-3 text-[0.88rem] text-canvas">Tarih seçin</span>
        )}
      </div>
    </>
  );
}

function Month({
  month,
  ranges,
  today,
  from,
  to,
  priceFor,
  onChoose,
}: {
  month: Date;
  ranges: Range[];
  today: string;
  from: string;
  to: string;
  priceFor: (date: string) => number;
  onChoose: (date: string) => void;
}) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const leading = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: count }, (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1))),
  ];
  return (
    <div>
      <p className="text-center font-display text-lg font-light capitalize text-ink">
        {first.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      </p>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => <span key={weekday} className="pb-1 text-[0.68rem] text-muted">{weekday}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />;
          const date = iso(day);
          const past = date < today;
          const blocked = overlaps(date, iso(new Date(day.getTime() + DAY)), ranges);
          const selectedNight = Boolean(from && (to ? date >= from && date < to : date === from));
          const endpoint = date === from || date === to;
          const canCheckout = Boolean(from && !to && date > from && !overlaps(from, date, ranges));
          const disabled = past || (blocked && !canCheckout);
          return (
            <button
              type="button"
              key={date}
              disabled={disabled}
              onClick={() => onChoose(date)}
              aria-label={`${date}${blocked ? ', dolu' : `, gecelik ${priceFor(date)}`}${endpoint ? ', seçili' : ''}`}
              className={`flex h-[3.4rem] flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[0.8rem] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed ${
                endpoint
                  ? 'bg-ink text-white ring-2 ring-ink'
                  : selectedNight
                    ? 'bg-olive text-white'
                    : blocked
                      ? 'bg-sand-deep text-muted/60 line-through'
                      : past
                        ? 'text-muted/25'
                        : 'text-ink hover:bg-sand'
              }`}
            >
              <span>{day.getUTCDate()}</span>
              {!past && !blocked && (
                <span className={`text-[0.6rem] ${endpoint || selectedNight ? 'text-white/75' : 'text-muted'}`}>
                  {compact.format(priceFor(date))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateCell({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`px-3.5 py-2.5 ${className}`}>
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-1 text-[0.86rem] text-ink">{value ? dayLabel(value) : '—'}</p>
    </div>
  );
}

function GuestInput({ label, value, max, min = 0, onChange }: { label: string; value: number; max: number; min?: number; onChange: (value: number) => void }) {
  return (
    <label className="text-[0.67rem] text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-2 text-[0.8rem] text-ink outline-none focus:border-olive"
      />
    </label>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-line pt-2 text-ink' : 'text-muted'}`}>
      <dt>{label}</dt>
      <dd className={strong ? 'font-display text-[1.05rem] text-ink' : 'text-ink'}>{value}</dd>
    </div>
  );
}
