'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ReservationSteps from '@/components/site/ReservationSteps';
import BookingServiceRequests from '@/components/site/BookingServiceRequests';
import { formatPrice } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { declarePayment, getBooking, getContactSettings, releaseHold, type GuestBooking } from '@/lib/reservationApi';

const dayLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Bekletme bitişine kalan süre; süre dolduğunda boş döner. */
function remaining(deadline: string | null, tick: number) {
  if (!deadline) return '';
  const ms = new Date(deadline).getTime() - tick;
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return hours > 0 ? `${hours} sa ${minutes} dk` : `${minutes} dk ${String(seconds).padStart(2, '0')} sn`;
}

export default function ReservationPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    getBooking(id)
      .then(setBooking)
      .catch((cause) => {
        if (cause instanceof ApiError && cause.status === 401) {
          router.replace(`/giris?next=${encodeURIComponent(`/hesabim/seyahatlerim/${id}`)}`);
          return;
        }
        setLoadError(cause instanceof Error ? cause.message : 'Rezervasyon bulunamadı.');
      });
  }, [id, router]);

  async function reload() { setBooking(await getBooking(id)); }

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
      setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.');
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
  if (!booking) return <Centered>Yükleniyor…</Centered>;

  const payment = booking.payment;
  const countdown = remaining(booking.holdExpiresAt, tick);
  const expired = booking.status === 'EXPIRED' || (booking.status === 'HOLD' && !countdown);
  const awaitingPayment = booking.status === 'HOLD' && booking.paymentStatus === 'PENDING' && !expired;
  const declared = booking.status === 'HOLD' && booking.paymentStatus === 'DECLARED' && !expired;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-28 pt-36 lg:px-10">
      <ReservationSteps current={3} />

      <p className="eyebrow mt-8 text-gold">Rezervasyon {payment?.reference ?? booking.id.slice(-6).toUpperCase()}</p>
      <h1 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.8rem)] font-light leading-tight tracking-[-0.02em] text-ink">
        {booking.status === 'CONFIRMED'
          ? 'Rezervasyonunuz onaylandı'
          : declared
            ? 'Ödemeniz kontrol ediliyor'
            : booking.status === 'REQUESTED'
              ? 'Rezervasyon talebiniz alındı'
              : booking.status === 'DECLINED'
                ? 'Rezervasyon talebiniz reddedildi'
                : booking.status === 'WITHDRAWN'
                  ? 'Rezervasyon talebini geri çektiniz'
            : booking.status === 'CANCELLED'
              ? 'Rezervasyon iptal edildi'
              : expired
                ? 'Bekletme süresi doldu'
                : 'Kapora ödemesi'}
      </h1>
      <p className="mt-3 text-[0.95rem] text-muted">
        <Link href={`/villalar/${booking.villa.slug}`} className="text-ink underline underline-offset-4">
          {booking.villa.title}
        </Link>
        {' · '}
        {dayLabel(booking.checkIn)} – {dayLabel(booking.checkOut)}
      </p>

      <dl className="mt-10 divide-y divide-line border-y border-line">
        <Row label="Misafir" value={`${booking.adults} yetişkin${booking.children ? `, ${booking.children} çocuk` : ''}${booking.infants ? `, ${booking.infants} bebek` : ''}`} />
        <Row label="Konaklama" value={formatPrice(booking.accommodationAmount, booking.currency)} />
        {booking.cleaningFeeAmount > 0 && (
          <Row label="Temizlik ücreti" value={formatPrice(booking.cleaningFeeAmount, booking.currency)} />
        )}
        <Row label="Toplam" value={formatPrice(booking.totalAmount, booking.currency)} />
        {booking.prepaymentAmount > 0 && (
          <Row label="Kapora" value={formatPrice(booking.prepaymentAmount, booking.currency)} />
        )}
        <Row
          label="Girişte ödenecek"
          value={formatPrice(booking.totalAmount - booking.prepaymentAmount, booking.currency)}
        />
        <Row label="Hasar depozitosu" value={`${formatPrice(booking.depositAmount, booking.currency)} (girişte)`} />
      </dl>

      <BookingServiceRequests booking={booking} onReload={reload} />

      {awaitingPayment && payment && (
        <section className="mt-12">
          {countdown && (
            <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-[0.88rem] text-ink">
              Tarihler size ayrıldı. Havale bildirimini <strong>{countdown}</strong> içinde yapın.
            </p>
          )}

          {payment.iban ? (
            <>
              <h2 className="mt-8 border-b border-line pb-3 font-display text-xl font-light text-ink">Havale bilgileri</h2>
              <dl className="mt-5 space-y-4 text-[0.92rem]">
                <Detail label="Tutar" value={formatPrice(payment.amount, payment.currency)} />
                <Detail label="Alıcı" value={payment.accountHolder || '—'} />
                {payment.bankName && <Detail label="Banka" value={payment.bankName} />}
                <div>
                  <dt className="eyebrow text-muted">IBAN</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[0.98rem] tracking-wide text-ink">{payment.iban}</span>
                    <button
                      type="button"
                      onClick={() => copyIban(payment.iban)}
                      className="rounded-full border border-line px-3 py-1 text-[0.76rem] text-muted hover:border-ink hover:text-ink"
                    >
                      {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                  </dd>
                </div>
                <Detail label="Açıklama" value={payment.reference} />
              </dl>
              <p className="mt-5 text-[0.85rem] leading-relaxed text-muted">
                Havale açıklamasına <strong className="text-ink">{payment.reference}</strong> yazın — ödemeniz bu kodla
                eşleştirilir. Bildirimden sonra tarihleriniz {payment.deadlineHours} saat daha size ayrılır ve dekont
                kontrol edilir. Sonucu bu sayfadan takip edebilirsiniz.
              </p>
              {payment.note && (
                <p className="mt-4 rounded-lg bg-sand/60 p-4 text-[0.85rem] leading-relaxed text-ink-soft">{payment.note}</p>
              )}
            </>
          ) : (
            <p className="mt-8 rounded-xl border border-red-200 bg-red-50/60 p-4 text-[0.88rem] text-red-800">
              Havale bilgileri henüz tanımlanmamış. Lütfen bizimle iletişime geçin; tarihleriniz ayrılmış durumda.
            </p>
          )}

          {error && <p role="alert" className="mt-6 border-l-2 border-red-400 pl-3 text-[0.88rem] text-red-700">{error}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <button
              type="button"
              disabled={busy || !payment.iban}
              onClick={() => run(() => declarePayment(booking.id))}
              className="rounded-full bg-ink px-8 py-3.5 text-[0.92rem] text-canvas transition-colors hover:bg-olive disabled:opacity-40"
            >
              {busy ? 'Gönderiliyor…' : 'Havaleyi gönderdim'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => releaseHold(booking.id))}
              className="text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink disabled:opacity-40"
            >
              Vazgeç, tarihleri bırak
            </button>
          </div>

          <ContactSupport booking={booking} />
        </section>
      )}

      {declared && (
        <section className="mt-12">
          <p className="rounded-xl border border-olive/40 bg-olive/10 p-5 text-[0.92rem] leading-relaxed text-ink">
            Havale bildiriminiz alındı. Dekont kontrol edildikten sonra rezervasyonunuz onaylanacak
            {countdown ? ` (tarihleriniz ${countdown} boyunca ayrılmış durumda)` : ''}. Sonucu bu sayfadan takip edebilirsiniz.
          </p>
          <ContactSupport booking={booking} />
        </section>
      )}

      {booking.status === 'CONFIRMED' && (
        <div className="mt-12 rounded-xl border border-olive/40 bg-olive/10 p-5 text-[0.92rem] leading-relaxed text-ink">
          <p>Ödemeniz doğrulandı ve tarihleriniz kesinleşti. Giriş bilgileri için destek ekibi sizinle iletişime geçecek.</p>
          <Link href="/hesabim/yorumlarim" className="mt-3 inline-block text-[0.85rem] underline underline-offset-4">
            Konaklama bittiyse yorumunuzu yazın
          </Link>
        </div>
      )}

      {(booking.status === 'CANCELLED' || booking.status === 'DECLINED' || booking.status === 'WITHDRAWN' || expired) && (
        <div className="mt-12 rounded-xl border border-line bg-sand/40 p-5 text-[0.92rem] leading-relaxed text-muted">
          {booking.status === 'CANCELLED' || booking.status === 'DECLINED' || booking.status === 'WITHDRAWN'
            ? booking.cancellationNote || 'Bu rezervasyon iptal edildi.'
            : 'Ödeme bildirimi yapılmadığı için tarihler serbest bırakıldı.'}
          <Link href={`/villalar/${booking.villa.slug}`} className="mt-3 block text-ink underline underline-offset-4">
            Villaya dön ve yeniden deneyin
          </Link>
        </div>
      )}

      <Link href="/hesabim/seyahatlerim" className="mt-12 inline-block text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">
        Tüm seyahatlerim
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
  const [settings, setSettings] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    getContactSettings()
      .then(setSettings)
      .catch(() => setSettings({}));
  }, []);

  if (!settings) return null;

  const reference = booking.payment?.reference ?? booking.id.slice(-6).toUpperCase();
  const message = `Merhaba, ${reference} numaralı rezervasyonum (${booking.villa.title}) hakkında yardım almak istiyorum.`;
  const whatsappPhone = (settings.whatsapp?.phone as string | undefined)?.replace(/\D/g, '');
  const contactPhone = settings.contact?.phone as string | undefined;
  const contactEmail = settings.contact?.email as string | undefined;

  const whatsappHref = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : null;
  const telHref = !whatsappHref && contactPhone ? `tel:${contactPhone.replace(/\s+/g, '')}` : null;
  const mailHref = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(`Rezervasyon ${reference}`)}&body=${encodeURIComponent(message)}`
    : null;

  if (!whatsappHref && !telHref && !mailHref) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-6">
      <span className="text-[0.82rem] text-muted">Ödemeyle ilgili bir sorunuz mu var?</span>
      {(whatsappHref || telHref) && (
        <a
          href={whatsappHref ?? telHref!}
          target={whatsappHref ? '_blank' : undefined}
          rel={whatsappHref ? 'noopener noreferrer' : undefined}
          className="rounded-full border border-ink/25 px-5 py-2 text-[0.82rem] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-canvas"
        >
          Bizimle iletişime geç
        </a>
      )}
      {mailHref && (
        <a href={mailHref} className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-ink">
          E‑posta gönder
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
