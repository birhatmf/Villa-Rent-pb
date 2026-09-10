'use client';

import Link from '@/components/site/LocaleLink';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReservationSteps from '@/components/site/ReservationSteps';
import { type AvailabilityResult, type VillaPublicDetail } from '@/lib/api';
import { CurrencyNotice, useCurrency } from '@/components/site/CurrencyProvider';
import { me, type AccountUser } from '@/lib/authApi';
import {
  checkAvailability,
  createBookingRequest,
  createGuestBookingRequest,
  createGuestHold,
  createHold,
  getPublicVilla,
} from '@/lib/reservationApi';

export default function NewReservationPage() {
  const t = useTranslations('Checkout');
  return (
    <Suspense fallback={<Centered>{t('loading')}</Centered>}>
      <NewReservationForm />
    </Suspense>
  );
}

function NewReservationForm() {
  const { formatPrice } = useCurrency();
  const locale = useLocale();
  const t = useTranslations('Checkout');
  const bookingT = useTranslations('Booking');
  const router = useRouter();
  const params = useSearchParams();

  const slug = params.get('villa') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const stay = {
    from,
    to,
    adults: Number(params.get('adults') ?? 2),
    children: Number(params.get('children') ?? 0),
    infants: Number(params.get('infants') ?? 0),
  };

  const [user, setUser] = useState<AccountUser | null>(null);
  const [ready, setReady] = useState(false);
  const [villa, setVilla] = useState<VillaPublicDetail | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [contact, setContact] = useState({ customerName: '', customerEmail: '', customerPhone: '' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dayLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(
    locale === 'tr' ? 'tr-TR' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
  const reason: Record<string, string> = {
    SALES_PAUSED: bookingT('reasonSalesPaused'),
    DATES_UNAVAILABLE: bookingT('reasonDatesUnavailable'),
    MIN_STAY: bookingT('reasonMinStay'),
    CHECKIN_DAY: bookingT('reasonCheckinDay'),
    CAPACITY_EXCEEDED: bookingT('reasonCapacity'),
    SYNC_UNHEALTHY: bookingT('reasonSync'),
  };

  useEffect(() => {
    if (!slug || !from || !to) {
      setLoadError(t('missing'));
      return;
    }
    let cancelled = false;
    Promise.all([getPublicVilla(slug), checkAvailability(slug, stay), me().catch(() => null)])
      .then(([loadedVilla, loadedAvailability, account]) => {
        if (cancelled) return;
        setVilla(loadedVilla);
        setAvailability(loadedAvailability);
        setUser(account);
        if (account?.role === 'GUEST') {
          setContact({
            customerName: account.name,
            customerEmail: account.email,
            customerPhone: account.phone ?? '',
          });
        }
        setReady(true);
      })
      .catch((cause) => {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : t('prepareError'));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, from, to, stay.adults, stay.children, stay.infants, t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!villa) return;
    setBusy(true);
    setError(null);
    try {
      const syncOnly = Boolean(availability && !availability.available && availability.reasons.length > 0 && availability.reasons.every((reason) => reason === 'SYNC_UNHEALTHY'));
      const requestable = Boolean(syncOnly || (availability?.available && availability.bookingMode === 'REQUEST'));
      const member = user?.role === 'GUEST';
      const create = member
        ? requestable ? createBookingRequest : createHold
        : requestable ? createGuestBookingRequest : createGuestHold;
      const booking = await create({
        villaId: villa.id,
        ...stay,
        customerName: contact.customerName.trim() || undefined,
        customerEmail: contact.customerEmail.trim() || undefined,
        customerPhone: contact.customerPhone.trim() || undefined,
      });
      router.replace(member ? `/hesabim/seyahatlerim/${booking.id}` : `/rezervasyon/${booking.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('createError'));
      setBusy(false);
    }
  }

  if (loadError) return <Centered>{loadError}</Centered>;
  if (!ready || !villa || !availability) return <Centered>{t('loading')}</Centered>;

  const quote = availability.quote;
  const syncOnly = !availability.available && availability.reasons.length > 0 && availability.reasons.every((reason) => reason === 'SYNC_UNHEALTHY');
  const requestable = syncOnly || (availability.available && availability.bookingMode === 'REQUEST');
  const blocked = !availability.available && !syncOnly;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-28 pt-36 lg:px-10">
      <ReservationSteps current={2} />

      <h1 className="mt-8 font-display text-[clamp(1.9rem,3.6vw,2.8rem)] font-light leading-tight tracking-[-0.02em] text-ink">
        {t('title')}
      </h1>
      <p className="mt-3 text-[0.95rem] text-muted">
        <Link href={`/villalar/${villa.slug}`} className="text-ink underline underline-offset-4">{villa.title}</Link>
        {' · '}{villa.region.name}
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_340px]">
        <form onSubmit={submit} className="space-y-8">
          {user?.role === 'GUEST' ? (
            <p className="rounded-xl border border-olive/25 bg-olive/5 px-4 py-3 text-[0.84rem] text-ink-soft">
              {t('savedAccount')}
            </p>
          ) : (
            <div className="rounded-xl border border-line bg-sand/35 px-4 py-4 text-[0.84rem] leading-relaxed text-muted">
              <p>{t('guestContinue')}</p>
              <p className="mt-2">
                {t('accountStart')} <Link href={`/giris?next=${encodeURIComponent(`/rezervasyon/yeni?${params.toString()}`)}`} className="text-ink underline underline-offset-4">{t('signIn')}</Link>
                {` ${t('or')} `}
                <Link href={`/kayit?next=${encodeURIComponent(`/rezervasyon/yeni?${params.toString()}`)}`} className="text-ink underline underline-offset-4">{t('register')}</Link>.
              </p>
            </div>
          )}

          <section>
            <h2 className="border-b border-line pb-3 font-display text-xl font-light text-ink">{t('stay')}</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 text-[0.9rem]">
              <Field label={t('checkIn')} value={dayLabel(quote.nights[0]?.date ?? from)} />
              <Field label={t('checkOut')} value={dayLabel(to)} />
              <Field label={t('nights')} value={String(availability.nights)} />
              <Field
                label={t('guests')}
                value={t('guestCount', { adults: stay.adults, children: stay.children, infants: stay.infants })}
              />
            </dl>
            <Link href={`/villalar/${villa.slug}`} className="mt-4 inline-block text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">
              {t('changeDates')}
            </Link>
          </section>

          <section>
            <h2 className="border-b border-line pb-3 font-display text-xl font-light text-ink">{t('contact')}</h2>
            <p className="mt-3 text-[0.85rem] text-muted">
              {t('contactIntro')} {user?.role === 'GUEST' ? t('memberHint') : t('guestHint')}
            </p>
            <div className="mt-5 space-y-5">
              <Input label={t('fullName')} value={contact.customerName} required minLength={2}
                onChange={(customerName) => setContact({ ...contact, customerName })} />
              <Input label={t('email')} type="email" value={contact.customerEmail} required
                onChange={(customerEmail) => setContact({ ...contact, customerEmail })} />
              <Input label={t('phone')} value={contact.customerPhone} required minLength={5}
                onChange={(customerPhone) => setContact({ ...contact, customerPhone })} />
            </div>
          </section>

          {(blocked || requestable) && (
            <p role={blocked ? 'alert' : 'status'} className={`border-l-2 pl-3 text-[0.88rem] ${blocked ? 'border-red-400 text-red-700' : 'border-gold text-muted'}`}>
              {requestable
                ? t('requestOnly')
                : availability.reasons.map((code) => reason[code] ?? code).join(' ')}
            </p>
          )}
          {error && <p role="alert" className="border-l-2 border-red-400 pl-3 text-[0.88rem] text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || blocked}
            className="w-full rounded-full bg-ink py-3.5 text-[0.92rem] text-canvas transition-colors hover:bg-olive disabled:opacity-40 sm:w-auto sm:px-10"
          >
            {busy ? (requestable ? t('sendingRequest') : t('holdingDates')) : requestable ? t('sendRequest') : t('goPayment')}
          </button>
          <p className="text-[0.8rem] text-muted">
            {requestable
              ? t('requestInfo')
              : t('holdInfo')}
          </p>
        </form>

        <aside className="h-fit space-y-3 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-28">
          <p className="eyebrow text-muted">{t('summary')}</p>
          <dl className="space-y-2 text-[0.88rem]">
            <Line label={t('stayPrice', { count: availability.nights })} value={formatPrice(quote.accommodationAmount, quote.currency)} />
            {quote.cleaningFeeAmount > 0 && (
              <Line label={t('cleaningFee')} value={formatPrice(quote.cleaningFeeAmount, quote.currency)} />
            )}
            <Line label={t('total')} value={formatPrice(quote.totalAmount, quote.currency)} strong />
            <Line label={t('depositNow')} value={formatPrice(quote.prepaymentAmount, quote.currency)} />
            <Line
              label={t('remaining')}
              value={formatPrice(quote.totalAmount - quote.prepaymentAmount, quote.currency)}
            />
          </dl>
          <CurrencyNotice sourceCurrency={quote.currency} className="text-xs leading-relaxed text-muted" />
          <p className="border-t border-line pt-3 text-[0.8rem] leading-relaxed text-muted">
            {t('damageDeposit', { amount: formatPrice(quote.depositAmount, quote.currency) })}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-muted">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full border-b border-ink/25 bg-transparent pb-2 text-[0.98rem] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-line pt-2' : 'text-muted'}`}>
      <dt>{label}</dt>
      <dd className={strong ? 'font-display text-[1.05rem] text-ink' : 'text-ink'}>{value}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-6 pb-28 pt-40 text-center text-[0.95rem] text-muted">{children}</div>;
}
