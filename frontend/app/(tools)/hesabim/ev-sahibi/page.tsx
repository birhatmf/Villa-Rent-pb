'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/api';
import { hostBookingApi, type Booking } from '@/lib/bookingApi';
import { getHostOnboarding, type HostOnboardingInfo } from '@/lib/hostApplicationApi';

const OWNERSHIP_LABEL: Record<string, string> = { SOLE: 'Müstakil Tapu', SHARED: 'Hisseli Tapu', SITE: 'Site / Rezidans İçi' };

const dayLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const monthRange = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().slice(0, 10);
  return { start, end };
};

export default function HostDashboardPage() {
  const [pending, setPending] = useState<Booking[] | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[] | null>(null);
  const [monthlyNet, setMonthlyNet] = useState<number | null>(null);
  const [monthlyCurrency, setMonthlyCurrency] = useState('TRY');
  const [onboarding, setOnboarding] = useState<HostOnboardingInfo>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const { start, end } = monthRange();

    hostBookingApi.list({ status: 'HOLD', pageSize: 50 }).then((r) => setPending(r.items)).catch(() => setPending([]));
    hostBookingApi
      .list({ status: 'CONFIRMED', from: today, pageSize: 50 })
      .then((r) => setUpcoming([...r.items].sort((a, b) => a.checkIn.localeCompare(b.checkIn)).slice(0, 8)))
      .catch(() => setUpcoming([]));
    // ponytail: client-side toplam, host'un aylık rezervasyon sayısı 100'ü aşarsa server-side SUM'a geçilir.
    hostBookingApi
      .list({ status: 'CONFIRMED', from: start, to: end, pageSize: 100 })
      .then((r) => {
        setMonthlyNet(r.items.reduce((sum, b) => sum + (b.totalAmount - b.prepaymentAmount), 0));
        if (r.items[0]) setMonthlyCurrency(r.items[0].currency);
      })
      .catch(() => setMonthlyNet(0));
    getHostOnboarding().then(setOnboarding).catch(() => setOnboarding(null));
  }, []);

  const declared = pending?.filter((b) => b.paymentStatus === 'DECLARED').length ?? 0;
  const awaitingGuest = pending?.filter((b) => b.paymentStatus === 'PENDING').length ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
        <p className="eyebrow text-gold">Ev sahibi</p>
        <h1 className="mt-2 font-display text-3xl font-light tracking-[-0.02em] text-ink">Özet</h1>

        {error && <p className="mt-4 text-[0.85rem] text-red-700">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Onay bekleyen"
            value={pending === null ? '—' : String(pending.length)}
            hint={pending && pending.length ? `${declared} dekont bekliyor · ${awaitingGuest} misafir kaporası bekleniyor` : 'Bekleyen talep yok'}
          />
          <StatCard label="Yaklaşan giriş" value={upcoming === null ? '—' : String(upcoming.length)} hint="Önümüzdeki onaylı rezervasyonlar" />
          <StatCard
            label="Bu ay net kazanç"
            value={monthlyNet === null ? '—' : formatPrice(monthlyNet, monthlyCurrency)}
            hint="Kapora düşülmüş, misafirden girişte doğrudan tahsil edilen tutar"
          />
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-light text-ink">Yaklaşan girişler</h2>
            <Link href="/hesabim/ev-sahibi/rezervasyonlar" className="text-[0.8rem] text-muted underline underline-offset-4 hover:text-ink">
              Tümünü gör
            </Link>
          </div>
          {!upcoming?.length ? (
            <p className="mt-4 text-[0.88rem] text-muted">{upcoming === null ? 'Yükleniyor…' : 'Yaklaşan onaylı rezervasyon yok.'}</p>
          ) : (
            <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
              {upcoming.map((booking) => (
                <Link
                  key={booking.id}
                  href={`/hesabim/ev-sahibi/rezervasyonlar/${booking.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-sand/35"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.9rem] text-ink">{booking.villa.title}</p>
                    <p className="mt-0.5 text-[0.78rem] text-muted">{dayLabel(booking.checkIn)} – {dayLabel(booking.checkOut)}</p>
                  </div>
                  <span className="shrink-0 text-[0.84rem] text-ink">{formatPrice(booking.totalAmount - booking.prepaymentAmount, booking.currency)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {onboarding && (
          <section className="mt-10 rounded-xl border border-line bg-surface p-6">
            <h2 className="font-display text-lg font-light text-ink">Başvuru bilgileriniz</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-[0.86rem] sm:grid-cols-2">
              <Info label="IBAN" value={onboarding.iban} mono />
              <Info label="Mülkiyet tipi" value={OWNERSHIP_LABEL[onboarding.ownershipType] ?? onboarding.ownershipType} />
              <Info label="Bakanlık izin no" value={onboarding.permitNumber ?? '—'} />
              <Info label="Azami kapasite" value={onboarding.maxCapacity ? `${onboarding.maxCapacity} kişi` : '—'} />
              <Info label="Adres" value={onboarding.address} full />
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-light text-ink">{value}</p>
      <p className="mt-1.5 text-[0.76rem] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function Info({ label, value, full, mono }: { label: string; value: string; full?: boolean; mono?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-[0.76rem] text-muted">{label}</p>
      <p className={`mt-0.5 text-ink ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
