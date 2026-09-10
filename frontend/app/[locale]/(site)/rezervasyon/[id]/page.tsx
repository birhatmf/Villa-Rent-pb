'use client';

import Link from '@/components/site/LocaleLink';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReservationSteps from '@/components/site/ReservationSteps';
import BookingServiceRequests from '@/components/site/BookingServiceRequests';
import { CurrencyNotice, useCurrency } from '@/components/site/CurrencyProvider';
import { ApiError } from '@/lib/http';
import {
  declareGuestPayment,
  declarePayment,
  getBooking,
  getContactSettings,
  getGuestBooking,
  releaseGuestHold,
  releaseHold,
  type GuestBooking,
} from '@/lib/reservationApi';

/** Bekletme bitişine kalan süre; süre dolduğunda boş döner. */
function remaining(deadline: string | null, tick: number, units: { hour: string; minute: string; second: string }) {
  if (!deadline) return '';
  const ms = new Date(deadline).getTime() - tick;
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return hours > 0
    ? `${hours} ${units.hour} ${minutes} ${units.minute}`
    : `${minutes} ${units.minute} ${String(seconds).padStart(2, '0')} ${units.second}`;
}

export default function ReservationPage() {
  const { formatPrice } = useCurrency();
  const locale = useLocale();
  const t = useTranslations('PaymentPage');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const dayLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(
    locale === 'tr' ? 'tr-TR' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  );

  useEffect(() => {
    getGuestBooking(id)
      .then((value) => { setAnonymous(true); setBooking(value); })
      .catch(async (guestError) => {
        try {
          const value = await getBooking(id);
          setAnonymous(false);
          setBooking(value);
        } catch (accountError) {
          if (accountError instanceof ApiError && accountError.status === 401) {
            router.replace(`/giris?next=${encodeURIComponent(`/hesabim/seyahatlerim/${id}`)}`);
            return;
          }
          setLoadError(accountError instanceof Error ? accountError.message : guestError instanceof Error ? guestError.message : t('notFound'));
        }
      });
  }, [id, router, t]);

  async function reload() { setBooking(await (anonymous ? getGuestBooking(id) : getBooking(id))); }

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function run(work: () => Promise<GuestBooking>) {
    setBusy(true);
    setError(null);
    try {
      setBooking(await work());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function copyIban(iban: string) {
    await navigator.clipboard.writeText(iban).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loadError) return <Centered>{loadError}</Centered>;
  if (!booking) return <Centered>{t('loading')}</Centered>;

  const payment = booking.payment;
  const countdown = remaining(booking.holdExpiresAt, tick, {
    hour: t('hourShort'), minute: t('minuteShort'), second: t('secondShort'),
  });
  const expired = booking.status === 'EXPIRED' || (booking.status === 'HOLD' && !countdown);
  const awaitingPayment = booking.status === 'HOLD' && booking.paymentStatus === 'PENDING' && !expired;
  const declared = booking.status === 'HOLD' && booking.paymentStatus === 'DECLARED' && !expired;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-28 pt-36 lg:px-10">
      <ReservationSteps current={3} />

      <p className="eyebrow mt-8 text-gold">{t('reservation', { reference: payment?.reference ?? booking.id.slice(-6).toUpperCase() })}</p>
      <h1 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.8rem)] font-light leading-tight tracking-[-0.02em] text-ink">
        {booking.status === 'CONFIRMED'
          ? t('confirmedTitle')
          : declared
            ? t('checkingTitle')
            : booking.status === 'REQUESTED'
              ? t('requestedTitle')
              : booking.status === 'DECLINED'
                ? t('declinedTitle')
                : booking.status === 'WITHDRAWN'
                  ? t('withdrawnTitle')
            : booking.status === 'CANCELLED'
              ? t('cancelledTitle')
              : expired
                ? t('expiredTitle')
                : t('paymentTitle')}
      </h1>
      <p className="mt-3 text-[0.95rem] text-muted">
        <Link href={`/villalar/${booking.villa.slug}`} className="text-ink underline underline-offset-4">
          {booking.villa.title}
        </Link>
        {' · '}
        {dayLabel(booking.checkIn)} – {dayLabel(booking.checkOut)}
      </p>

      <dl className="mt-10 divide-y divide-line border-y border-line">
        <Row label={t('guest')} value={t('guestCount', { adults: booking.adults, children: booking.children, infants: booking.infants })} />
        <Row label={t('accommodation')} value={formatPrice(booking.accommodationAmount, booking.currency)} />
        {booking.cleaningFeeAmount > 0 && (
          <Row label={t('cleaningFee')} value={formatPrice(booking.cleaningFeeAmount, booking.currency)} />
        )}
        <Row label={t('total')} value={formatPrice(booking.totalAmount, booking.currency)} />
        {booking.prepaymentAmount > 0 && (
          <Row label={t('deposit')} value={formatPrice(booking.prepaymentAmount, booking.currency)} />
        )}
        <Row
          label={t('dueAtCheckIn')}
          value={formatPrice(booking.totalAmount - booking.prepaymentAmount, booking.currency)}
        />
        <Row label={t('damageDeposit')} value={`${formatPrice(booking.depositAmount, booking.currency)} (${t('atCheckIn')})`} />
      </dl>
      <CurrencyNotice sourceCurrency={booking.currency} className="mt-3 text-xs leading-relaxed text-muted" />

      {!anonymous && <BookingServiceRequests booking={booking} onReload={reload} />}

      {awaitingPayment && payment && (
        <section className="mt-12">
          {countdown && (
            <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-[0.88rem] text-ink">
              {t('heldFor', { time: countdown })}
            </p>
          )}

          {payment.iban ? (
            <>
              <h2 className="mt-8 border-b border-line pb-3 font-display text-xl font-light text-ink">{t('bankDetails')}</h2>
              <dl className="mt-5 space-y-4 text-[0.92rem]">
                <Detail label={t('amount')} value={formatPrice(payment.amount, payment.currency)} />
                <Detail label={t('recipient')} value={payment.accountHolder || '—'} />
                {payment.bankName && <Detail label={t('bank')} value={payment.bankName} />}
                <div>
                  <dt className="eyebrow text-muted">IBAN</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[0.98rem] tracking-wide text-ink">{payment.iban}</span>
                    <button
                      type="button"
                      onClick={() => copyIban(payment.iban)}
                      className="rounded-full border border-line px-3 py-1 text-[0.76rem] text-muted hover:border-ink hover:text-ink"
                    >
                      {copied ? t('copied') : t('copy')}
                    </button>
                  </dd>
                </div>
                <Detail label={t('description')} value={payment.reference} />
              </dl>
              <p className="mt-5 text-[0.85rem] leading-relaxed text-muted">
                {t('transferHelp', { reference: payment.reference, hours: payment.deadlineHours })}
              </p>
              {payment.note && (
                <p className="mt-4 rounded-lg bg-sand/60 p-4 text-[0.85rem] leading-relaxed text-ink-soft">{payment.note}</p>
              )}
            </>
          ) : (
            <p className="mt-8 rounded-xl border border-red-200 bg-red-50/60 p-4 text-[0.88rem] text-red-800">
              {t('missingBank')}
            </p>
          )}

          {error && <p role="alert" className="mt-6 border-l-2 border-red-400 pl-3 text-[0.88rem] text-red-700">{error}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <button
              type="button"
              disabled={busy || !payment.iban}
              onClick={() => run(() => anonymous ? declareGuestPayment(booking.id) : declarePayment(booking.id))}
              className="rounded-full bg-ink px-8 py-3.5 text-[0.92rem] text-canvas transition-colors hover:bg-olive disabled:opacity-40"
            >
              {busy ? t('sending') : t('sentTransfer')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => anonymous ? releaseGuestHold(booking.id) : releaseHold(booking.id))}
              className="text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink disabled:opacity-40"
            >
              {t('release')}
            </button>
          </div>

          <ContactSupport booking={booking} />
        </section>
      )}

      {declared && (
        <section className="mt-12">
          <p className="rounded-xl border border-olive/40 bg-olive/10 p-5 text-[0.92rem] leading-relaxed text-ink">
            {t('declared', { countdown: countdown ? t('countdown', { time: countdown }) : '' })}
          </p>
          <ContactSupport booking={booking} />
        </section>
      )}

      {booking.status === 'CONFIRMED' && (
        <div className="mt-12 rounded-xl border border-olive/40 bg-olive/10 p-5 text-[0.92rem] leading-relaxed text-ink">
          <p>{t('confirmed')}</p>
          {!anonymous && (
            <Link href="/hesabim/yorumlarim" className="mt-3 inline-block text-[0.85rem] underline underline-offset-4">
              {t('writeReview')}
            </Link>
          )}
        </div>
      )}

      {(booking.status === 'CANCELLED' || booking.status === 'DECLINED' || booking.status === 'WITHDRAWN' || expired) && (
        <div className="mt-12 rounded-xl border border-line bg-sand/40 p-5 text-[0.92rem] leading-relaxed text-muted">
          {booking.status === 'CANCELLED' || booking.status === 'DECLINED' || booking.status === 'WITHDRAWN'
            ? booking.cancellationNote || t('cancelled')
            : t('released')}
          <Link href={`/villalar/${booking.villa.slug}`} className="mt-3 block text-ink underline underline-offset-4">
            {t('retry')}
          </Link>
        </div>
      )}

      <Link href={anonymous ? `/villalar/${booking.villa.slug}` : '/hesabim/seyahatlerim'} className="mt-12 inline-block text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">
        {anonymous ? t('villaReturn') : t('allTrips')}
      </Link>
    </div>
  );
}

/**
 * Ödeme ekranındaki "bizimle iletişime geç" butonu. Footer ayarlarındaki WhatsApp
 * numarası, telefon veya e‑posta — hangisi tanımlıysa onu kullanır; hiçbiri
 * tanımlı değilse hiçbir şey göstermez (WhatsAppButton ile aynı davranış).
 */
function ContactSupport({ booking }: { booking: GuestBooking }) {
  const t = useTranslations('PaymentPage');
  const [settings, setSettings] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    getContactSettings()
      .then(setSettings)
      .catch(() => setSettings({}));
  }, []);

  if (!settings) return null;

  const reference = booking.payment?.reference ?? booking.id.slice(-6).toUpperCase();
  const message = t('supportMessage', { reference, villa: booking.villa.title });
  const whatsappPhone = (settings.whatsapp?.phone as string | undefined)?.replace(/\D/g, '');
  const contactPhone = settings.contact?.phone as string | undefined;
  const contactEmail = settings.contact?.email as string | undefined;

  const whatsappHref = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : null;
  const telHref = !whatsappHref && contactPhone ? `tel:${contactPhone.replace(/\s+/g, '')}` : null;
  const mailHref = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(t('emailSubject', { reference }))}&body=${encodeURIComponent(message)}`
    : null;

  if (!whatsappHref && !telHref && !mailHref) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-6">
      <span className="text-[0.82rem] text-muted">{t('supportQuestion')}</span>
      {(whatsappHref || telHref) && (
        <a
          href={whatsappHref ?? telHref!}
          target={whatsappHref ? '_blank' : undefined}
          rel={whatsappHref ? 'noopener noreferrer' : undefined}
          className="rounded-full border border-ink/25 px-5 py-2 text-[0.82rem] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-canvas"
        >
          {t('contact')}
        </a>
      )}
      {mailHref && (
        <a href={mailHref} className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-ink">
          {t('sendEmail')}
        </a>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5">
      <dt className="text-[0.88rem] text-muted">{label}</dt>
      <dd className="text-[0.92rem] text-ink">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-6 pb-28 pt-40 text-center text-[0.95rem] text-muted">{children}</div>;
}
