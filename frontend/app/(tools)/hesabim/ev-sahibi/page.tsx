'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/api';
import { hostBookingApi, hostCalendarApi, type Booking, type CalendarAudit } from '@/lib/bookingApi';
import { getHostOnboarding, type HostOnboardingInfo } from '@/lib/hostApplicationApi';
import { createVillaApi, type VillaListItem } from '@/lib/villaApi';
import { VILLA_STATUS_CLS, VILLA_STATUS_LABEL } from '@/lib/villaSchema';

const OWNERSHIP_LABEL: Record<string, string> = { SOLE: 'Müstakil tapu', SHARED: 'Hisseli tapu', SITE: 'Site / rezidans içi' };
const AUDIT_LABEL: Record<string, string> = {
  REQUEST_CREATED: 'Yeni rezervasyon talebi geldi',
  REQUEST_ACCEPTED: 'Rezervasyon talebi kabul edildi',
  REQUEST_DECLINED: 'Rezervasyon talebi reddedildi',
  BOOKING_CONFIRMED: 'Rezervasyon onaylandı',
  BOOKING_CHANGED: 'Konaklama bilgileri değişti',
  BOOKING_CANCELLED: 'Rezervasyon iptal edildi',
  CHANGE_REQUESTED: 'Değişiklik talebi geldi',
  CANCELLATION_REQUESTED: 'İptal talebi açıldı',
  BLOCK_CREATED: 'Takvimde tarih kapatıldı',
  BLOCK_RELEASED: 'Takvimde tarih açıldı',
  VILLA_STATUS_CHANGED: 'Villa yayın durumu değişti',
  PRICE_RULE_CREATED: 'Sezon fiyatı eklendi',
  ICAL_SYNC_COMPLETED: 'Dış takvim eşitlendi',
};

type DashboardData = {
  requests: Booking[];
  holds: Booking[];
  upcoming: Booking[];
  monthly: Booking[];
  villas: VillaListItem[];
  audits: CalendarAudit[];
  onboarding: HostOnboardingInfo;
};

const dateLabel = (value: string, withYear = false) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });

const todayIso = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());

const monthRange = (today: string) => {
  const [year, month] = today.split('-').map(Number);
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
  };
};

export default function HostDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = todayIso();
    const { start, end } = monthRange(today);
    const villaApi = createVillaApi('host');

    Promise.all([
      hostBookingApi.list({ status: 'REQUESTED', pageSize: 100 }),
      hostBookingApi.list({ status: 'HOLD', pageSize: 100 }),
      hostBookingApi.list({ status: 'CONFIRMED', from: today, pageSize: 100 }),
      hostBookingApi.list({ status: 'CONFIRMED', from: start, to: end, pageSize: 100 }),
      villaApi.list({ pageSize: 100 }),
      hostCalendarApi.audit(),
      getHostOnboarding(),
    ])
      .then(([requests, holds, upcoming, monthly, villas, audits, onboarding]) => setData({
        requests: requests.items,
        holds: holds.items,
        upcoming: [...upcoming.items].sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
        monthly: monthly.items,
        villas: villas.items,
        audits,
        onboarding,
      }))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Panel bilgileri yüklenemedi.');
        setData({ requests: [], holds: [], upcoming: [], monthly: [], villas: [], audits: [], onboarding: null });
      });
  }, []);

  const today = todayIso();
  const staying = data?.upcoming.filter((booking) => booking.checkIn <= today && booking.checkOut > today) ?? [];
  const futureArrivals = data?.upcoming.filter((booking) => booking.checkIn >= today) ?? [];
  const arrivals = futureArrivals.slice(0, 6);
  const declared = data?.holds.filter((booking) => booking.paymentStatus === 'DECLARED') ?? [];
  const published = data?.villas.filter((villa) => villa.status === 'PUBLISHED').length ?? 0;
  const monthlyNet = data?.monthly.reduce((sum, booking) => sum + booking.totalAmount - booking.prepaymentAmount, 0) ?? 0;
  const currency = data?.monthly[0]?.currency ?? 'TRY';

  return (
    <main className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-[1180px] px-6 py-8 lg:px-10 lg:py-10">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow text-gold">Ev sahibi paneli</p>
            <h1 className="mt-2 font-display text-3xl font-light tracking-[-0.025em] text-ink sm:text-4xl">Bugünün operasyonu</h1>
            <p className="mt-2 text-[0.86rem] text-muted">
              {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/hesabim/ev-sahibi/takvim" className="rounded-full border border-line bg-surface px-4 py-2 text-[0.82rem] text-ink transition-colors hover:border-ink/40">Takvimi aç</Link>
            <Link href="/hesabim/villalarim/yeni" className="rounded-full bg-ink px-4 py-2 text-[0.82rem] text-canvas transition-colors hover:bg-olive">+ Yeni villa</Link>
          </div>
        </header>

        {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[0.85rem] text-red-700">{error}</p>}

        <section className="mt-8 grid overflow-hidden rounded-2xl bg-ink text-canvas shadow-[0_18px_60px_rgba(27,26,23,0.12)] sm:grid-cols-3">
          <OperationPulse label="Karar bekleyen talep" value={data ? data.requests.length : null} href="/hesabim/ev-sahibi/rezervasyonlar?status=REQUESTED" urgent={Boolean(data?.requests.length)} />
          <OperationPulse label="Havale bildirilen" value={data ? declared.length : null} hint="Yönetim dekontu kontrol edecek" />
          <OperationPulse label="Şu an konaklayan" value={data ? staying.length : null} hint={staying[0]?.villa.title ?? 'Bugün aktif konaklama yok'} />
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Toplam villa" value={data ? String(data.villas.length) : '—'} detail={`${published} yayında`} href="/hesabim/villalarim" />
          <Metric label="Yaklaşan giriş" value={data ? String(futureArrivals.length) : '—'} detail="Onaylı gelecek konaklamalar" href="/hesabim/ev-sahibi/rezervasyonlar?status=CONFIRMED" />
          <Metric label="Ödeme bekleyen" value={data ? String(data.holds.length) : '—'} detail={`${declared.length} havale bildirildi`} href="/hesabim/ev-sahibi/rezervasyonlar?status=HOLD" />
          <Metric label="Bu ay net" value={data ? formatPrice(monthlyNet, currency) : '—'} detail="Platform kaporası düşülmüş" />
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
          <section className="rounded-2xl border border-line bg-surface">
            <SectionHead title="Yaklaşan girişler" action="Tüm rezervasyonlar" href="/hesabim/ev-sahibi/rezervasyonlar" />
            {!data ? <Loading /> : arrivals.length === 0 ? <Empty text="Yaklaşan onaylı giriş bulunmuyor." /> : (
              <div className="divide-y divide-line">
                {arrivals.map((booking) => (
                  <Link key={booking.id} href={`/hesabim/ev-sahibi/rezervasyonlar/${booking.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-sand/35 sm:grid-cols-[86px_minmax(0,1fr)_auto] sm:items-center lg:px-6">
                    <div>
                      <p className="font-display text-xl font-light text-ink">{dateLabel(booking.checkIn)}</p>
                      <p className="mt-0.5 text-[0.7rem] text-muted">{nights(booking)} gece</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[0.9rem] font-medium text-ink">{booking.villa.title}</p>
                      <p className="mt-1 truncate text-[0.76rem] text-muted">{booking.customerName ?? 'Misafir bilgisi ödeme sonrası açılır'} · {booking.adults + booking.children} misafir</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[0.86rem] text-ink">{formatPrice(booking.totalAmount - booking.prepaymentAmount, booking.currency)}</p>
                      <p className="mt-1 text-[0.7rem] text-muted">Girişte kalan tutar</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface">
            <SectionHead title="Portföy durumu" action="Villaları yönet" href="/hesabim/villalarim" />
            {!data ? <Loading /> : data.villas.length === 0 ? <Empty text="Henüz bağlı villa yok." /> : (
              <div className="divide-y divide-line">
                {data.villas.slice(0, 5).map((villa) => (
                  <Link key={villa.id} href={`/hesabim/villalarim/${villa.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-sand/35">
                    <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded-md bg-sand">
                      {villa.images[0] && <Image src={villa.images[0].url} alt="" fill sizes="56px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] text-ink">{villa.title}</p>
                      <p className="mt-0.5 text-[0.7rem] text-muted">{villa.region.name} · {villa._count.images} görsel</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] ${VILLA_STATUS_CLS[villa.status]}`}>{VILLA_STATUS_LABEL[villa.status]}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
          <section className="rounded-2xl border border-line bg-surface">
            <SectionHead title="Son hareketler" action="Takvim geçmişi" href="/hesabim/ev-sahibi/takvim" />
            {!data ? <Loading /> : data.audits.length === 0 ? <Empty text="Henüz operasyon hareketi yok." /> : (
              <div className="divide-y divide-line px-5 lg:px-6">
                {data.audits.slice(0, 6).map((audit) => (
                  <div key={audit.id} className="flex items-start gap-3 py-3.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.82rem] text-ink">{AUDIT_LABEL[audit.action] ?? audit.action}</p>
                      <p className="mt-0.5 truncate text-[0.72rem] text-muted">{audit.villa.title}{audit.actor?.name ? ` · ${audit.actor.name}` : ''}</p>
                    </div>
                    <time className="shrink-0 text-[0.7rem] text-muted">{new Date(audit.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</time>
                  </div>
                ))}
              </div>
            )}
          </section>

          <OnboardingCard onboarding={data?.onboarding} loading={!data} />
        </div>
      </div>
    </main>
  );
}

function OperationPulse({ label, value, hint, href, urgent }: { label: string; value: number | null; hint?: string; href?: string; urgent?: boolean }) {
  const content = <><p className="text-[0.7rem] uppercase tracking-[0.17em] text-canvas/55">{label}</p><div className="mt-3 flex items-end justify-between gap-3"><p className="font-display text-4xl font-light leading-none">{value ?? '—'}</p><p className={`max-w-40 text-right text-[0.72rem] leading-snug ${urgent ? 'text-[#e4bd78]' : 'text-canvas/55'}`}>{urgent ? 'İnceleme gerekiyor →' : hint}</p></div></>;
  const cls = 'border-b border-white/10 px-6 py-6 last:border-0 sm:border-b-0 sm:border-r';
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-white/[0.06]`}>{content}</Link> : <div className={cls}>{content}</div>;
}

function Metric({ label, value, detail, href }: { label: string; value: string; detail: string; href?: string }) {
  const content = <><p className="eyebrow text-muted">{label}</p><p className="mt-3 font-display text-2xl font-light text-ink">{value}</p><p className="mt-1.5 text-[0.72rem] text-muted">{detail}</p></>;
  const cls = 'rounded-xl border border-line bg-surface p-5 transition-colors';
  return href ? <Link href={href} className={`${cls} hover:border-ink/25`}>{content}</Link> : <div className={cls}>{content}</div>;
}

function SectionHead({ title, action, href }: { title: string; action: string; href: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-6"><h2 className="font-display text-lg font-light text-ink">{title}</h2><Link href={href} className="text-[0.75rem] text-muted transition-colors hover:text-ink">{action} →</Link></div>;
}

function OnboardingCard({ onboarding, loading }: { onboarding: HostOnboardingInfo | undefined; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-sand/45 p-5 lg:p-6">
      <p className="eyebrow text-gold">İşletme kaydı</p>
      <h2 className="mt-3 font-display text-xl font-light text-ink">Başvuru bilgileriniz</h2>
      {loading ? <p className="mt-5 text-sm text-muted">Yükleniyor…</p> : !onboarding ? <p className="mt-5 text-sm text-muted">Hesaba bağlı başvuru kaydı bulunmuyor.</p> : (
        <dl className="mt-5 grid gap-4 text-[0.8rem] sm:grid-cols-2">
          <Info label="IBAN" value={onboarding.iban} full />
          <Info label="Mülkiyet" value={OWNERSHIP_LABEL[onboarding.ownershipType] ?? onboarding.ownershipType} />
          <Info label="İzin numarası" value={onboarding.permitNumber ?? '—'} />
          <Info label="Azami kapasite" value={onboarding.maxCapacity ? `${onboarding.maxCapacity} kişi` : '—'} />
          <Info label="Kayıtlı adres" value={onboarding.address} full />
        </dl>
      )}
    </section>
  );
}

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={full ? 'sm:col-span-2' : ''}><dt className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">{label}</dt><dd className="mt-1 break-words text-ink">{value}</dd></div>;
}

function Loading() { return <p className="px-5 py-10 text-sm text-muted">Yükleniyor…</p>; }
function Empty({ text }: { text: string }) { return <p className="px-5 py-10 text-center text-sm text-muted">{text}</p>; }
function nights(booking: Booking) { return Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86_400_000); }
