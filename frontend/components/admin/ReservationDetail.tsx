'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/api';
import { bookingApi, hostBookingApi, type Booking, type BookingDetail, type CalendarAudit } from '@/lib/bookingApi';
import { ApiError } from '@/lib/http';

const INPUT = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.86rem] text-ink outline-none focus:border-olive-soft focus-visible:ring-2 focus-visible:ring-olive/15';
const STATUS_LABEL: Record<Booking['status'], string> = { HOLD: 'Onay bekliyor', CONFIRMED: 'Onaylandı', EXPIRED: 'Süresi doldu', CANCELLED: 'İptal edildi' };
const STATUS_STYLE: Record<Booking['status'], string> = {
  HOLD: 'border-gold/30 bg-gold/10 text-gold',
  CONFIRMED: 'border-olive/25 bg-olive/10 text-olive',
  EXPIRED: 'border-line bg-sand text-muted',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
};
const PAYMENT_LABEL: Record<Booking['paymentStatus'], string> = { NONE: 'Ödeme gerekmiyor', PENDING: 'Kapora bekleniyor', DECLARED: 'Havale bildirildi', PAID: 'Ödeme doğrulandı' };
const AUDIT_LABEL: Record<string, string> = {
  HOLD_CREATED: 'Rezervasyon bekletmesi oluşturuldu',
  HOLD_RELEASED: 'Misafir bekletmeyi bıraktı',
  HOLD_EXPIRED: 'Bekletme süresi doldu',
  BOOKING_CREATED: 'Rezervasyon yönetim panelinden oluşturuldu',
  BOOKING_CONFIRMED: 'Rezervasyon onaylandı',
  BOOKING_CHANGED: 'Konaklama bilgileri değiştirildi',
  BOOKING_CANCELLED: 'Rezervasyon iptal edildi',
  PAYMENT_DECLARED: 'Misafir havale yaptığını bildirdi',
};

export default function ReservationDetail({ id, scope = 'admin' }: { id: string; scope?: 'admin' | 'host' }) {
  const api = scope === 'admin' ? bookingApi : hostBookingApi;
  const backHref = scope === 'admin' ? '/admin/rezervasyonlar' : '/hesabim/ev-sahibi/rezervasyonlar';
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ from: '', to: '', adults: 2, children: 0, infants: 0 });
  const [cancelNote, setCancelNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get(id);
      setBooking(result);
      setForm({ from: result.checkIn, to: result.checkOut, adults: result.adults, children: result.children, infants: result.infants });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Rezervasyon yüklenemedi.');
    }
  }, [api, id]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<Booking>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setEdit(false);
      setCancelNote('');
      setMessage(success);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await load();
        setError(`${cause.message} Güncel rezervasyon yeniden yüklendi.`);
      } else {
        setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!booking && !error) return <Centered>Rezervasyon yükleniyor…</Centered>;
  if (!booking) return <Centered>{error}</Centered>;

  const editable = booking.status === 'HOLD' || booking.status === 'CONFIRMED';
  const villaHref = scope === 'admin' ? `/admin/villalar/${booking.villaId}` : `/hesabim/villalarim/${booking.villaId}`;
  const nights = stayNights(booking.checkIn, booking.checkOut);
  const nightlyPrices = priceNights(booking.priceSnapshot);

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={backHref} className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink" aria-label="Rezervasyonlara dön">←</Link>
            <div>
              <p className="eyebrow text-gold">{reference(booking.id)}</p>
              <h1 className="mt-1 font-display text-2xl font-light tracking-[-0.02em] text-ink">Rezervasyon detayı</h1>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-[0.74rem] ${STATUS_STYLE[booking.status]}`}>{STATUS_LABEL[booking.status]}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
        {(error || message) && <p role={error ? 'alert' : 'status'} className={`mb-6 rounded-xl border px-4 py-3 text-[0.84rem] ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-olive/20 bg-olive/10 text-olive'}`}>{error ?? message}</p>}

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-7">
            <section className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="border-b border-line bg-sand/25 px-5 py-4 sm:px-6">
                <p className="eyebrow text-muted">Konaklama</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <Link href={villaHref} className="font-display text-2xl font-light text-ink hover:text-gold">{booking.villa.title}</Link>
                    <p className="mt-1 text-[0.78rem] text-muted">{booking.channel === 'WEBSITE' ? 'Web sitesinden geldi' : 'Yönetim panelinden oluşturuldu'}</p>
                  </div>
                  {editable && <button onClick={() => setEdit((value) => !value)} className="rounded-full border border-line px-4 py-2 text-[0.78rem] text-ink hover:border-ink">{edit ? 'Düzenlemeyi kapat' : 'Konaklamayı düzenle'}</button>}
                </div>
              </div>

              {edit ? (
                <div className="p-5 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Giriş"><input type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} className={INPUT} /></Field>
                    <Field label="Çıkış"><input type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} className={INPUT} /></Field>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <NumberField label="Yetişkin" value={form.adults} min={1} onChange={(adults) => setForm({ ...form, adults })} />
                    <NumberField label="Çocuk" value={form.children} onChange={(children) => setForm({ ...form, children })} />
                    <NumberField label="Bebek" value={form.infants} onChange={(infants) => setForm({ ...form, infants })} />
                  </div>
                  <p className="mt-4 text-[0.76rem] leading-relaxed text-muted">Tarih değişince müsaitlik yeniden kontrol edilir ve fiyat güncel kurallarla tekrar hesaplanır.</p>
                  <button disabled={busy || !form.from || !form.to} onClick={() => run(() => api.change(booking.id, { ...form, version: booking.version }), 'Konaklama bilgileri güncellendi.')} className="mt-5 rounded-full bg-ink px-6 py-2.5 text-[0.82rem] text-canvas hover:bg-olive disabled:opacity-40">{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
                </div>
              ) : (
                <dl className="grid gap-px bg-line sm:grid-cols-4">
                  <Stat label="Giriş" value={fullDate(booking.checkIn)} />
                  <Stat label="Çıkış" value={fullDate(booking.checkOut)} />
                  <Stat label="Süre" value={`${nights} gece`} />
                  <Stat label="Misafir" value={guestLabel(booking)} />
                </dl>
              )}
            </section>

            <div className="grid gap-7 md:grid-cols-2">
              <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                <p className="eyebrow text-muted">Misafir</p>
                <h2 className="mt-3 font-display text-xl font-light text-ink">{booking.customerName || 'İsimsiz misafir'}</h2>
                <dl className="mt-5 space-y-4">
                  <Detail label="E-posta" value={booking.customerEmail} href={booking.customerEmail ? `mailto:${booking.customerEmail}` : undefined} />
                  <Detail label="Telefon" value={booking.customerPhone} href={booking.customerPhone ? `tel:${booking.customerPhone.replace(/\s+/g, '')}` : undefined} />
                  <Detail label="Üyelik" value={booking.guestId ? 'Kayıtlı üye' : 'Üyeliksiz / yönetim kaydı'} />
                </dl>
              </section>

              <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                <p className="eyebrow text-muted">İşlem zamanları</p>
                <dl className="mt-5 space-y-4">
                  <Detail label="Oluşturuldu" value={dateTime(booking.createdAt)} />
                  <Detail label="Havale bildirimi" value={dateTime(booking.paymentDeclaredAt)} />
                  <Detail label="Bekletme sonu" value={dateTime(booking.holdExpiresAt)} />
                  <Detail label="Onaylandı" value={dateTime(booking.confirmedAt)} />
                  <Detail label="İptal edildi" value={dateTime(booking.cancelledAt)} />
                </dl>
              </section>
            </div>

            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="eyebrow text-muted">Ücret dökümü</p><h2 className="mt-2 font-display text-xl font-light text-ink">{formatPrice(booking.totalAmount, booking.currency)}</h2></div>
                <span className="rounded-full bg-sand px-3 py-1.5 text-[0.72rem] text-muted">{PAYMENT_LABEL[booking.paymentStatus]}</span>
              </div>
              <dl className="mt-6 divide-y divide-line border-y border-line">
                <MoneyRow label={`${nights} gece konaklama`} value={booking.accommodationAmount} currency={booking.currency} />
                <MoneyRow label="Temizlik ücreti" value={booking.cleaningFeeAmount} currency={booking.currency} />
                <MoneyRow label="Toplam" value={booking.totalAmount} currency={booking.currency} strong />
                <MoneyRow label="Kapora" value={booking.prepaymentAmount} currency={booking.currency} />
                <MoneyRow label="Kalan tutar" value={booking.totalAmount - booking.prepaymentAmount} currency={booking.currency} />
                <MoneyRow label="Hasar depozitosu (ayrı)" value={booking.depositAmount} currency={booking.currency} />
              </dl>
              {nightlyPrices.length > 0 && (
                <details className="mt-5">
                  <summary className="cursor-pointer text-[0.8rem] text-muted hover:text-ink">Gecelik fiyatları göster</summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {nightlyPrices.map((night) => <div key={night.date} className="flex justify-between rounded-lg bg-sand/40 px-3 py-2 text-[0.76rem]"><span className="text-muted">{fullDate(night.date)}</span><span className="text-ink">{formatPrice(night.amount, booking.currency)}</span></div>)}
                  </div>
                </details>
              )}
            </section>

            <AuditTimeline audits={booking.audits} />
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:h-fit">
            <ApprovalCard booking={booking} busy={busy} onConfirm={() => {
              const warning = booking.paymentStatus === 'PENDING'
                ? 'Misafir henüz havale bildirimi yapmadı. Ödemeyi başka şekilde doğruladıysanız devam edin. Rezervasyon onaylansın mı?'
                : 'Havale tutarını banka hesabından doğruladınız mı? Rezervasyon kesinleştirilecek.';
              if (window.confirm(warning)) void run(() => api.confirm(booking.id, booking.version), 'Rezervasyon onaylandı.');
            }} />

            {editable && (
              <section className="rounded-2xl border border-red-200 bg-surface p-5">
                <p className="eyebrow text-red-700">İptal</p>
                <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">İptal tarihleri serbest bırakır ve gerekçeyi işlem geçmişine kaydeder.</p>
                <textarea rows={3} value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} placeholder="İptal gerekçesi" className={`${INPUT} mt-4 resize-none`} />
                <button disabled={busy || cancelNote.trim().length < 2} onClick={() => {
                  if (window.confirm('Rezervasyon iptal edilsin ve tarihler serbest bırakılsın mı?')) void run(() => api.cancel(booking.id, booking.version, cancelNote), 'Rezervasyon iptal edildi.');
                }} className="mt-3 w-full rounded-full border border-red-300 px-4 py-2.5 text-[0.8rem] text-red-700 hover:bg-red-50 disabled:opacity-40">Rezervasyonu iptal et</button>
              </section>
            )}

            {booking.cancellationNote && <section className="rounded-2xl border border-line bg-sand/35 p-5"><p className="eyebrow text-muted">İptal gerekçesi</p><p className="mt-3 text-[0.82rem] leading-relaxed text-ink">{booking.cancellationNote}</p></section>}

            <Link href={scope === 'admin' ? `/admin/takvim?villaId=${encodeURIComponent(booking.villaId)}&date=${booking.checkIn}` : villaHref} className="block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink">
              <p className="eyebrow text-muted">{scope === 'admin' ? 'Takvim bağlamı' : 'Villa yönetimi'}</p>
              <p className="mt-2 text-[0.84rem] text-ink">{scope === 'admin' ? 'Villanın takvimini aç' : 'Villayı yönet'} <span className="float-right">→</span></p>
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ApprovalCard({ booking, busy, onConfirm }: { booking: Booking; busy: boolean; onConfirm: () => void }) {
  if (booking.status !== 'HOLD') {
    return <section className={`rounded-2xl border p-5 ${booking.status === 'CONFIRMED' ? 'border-olive/25 bg-olive/[0.06]' : 'border-line bg-surface'}`}><p className="eyebrow text-muted">Onay durumu</p><p className="mt-3 font-display text-xl font-light text-ink">{STATUS_LABEL[booking.status]}</p>{booking.status === 'CONFIRMED' && <p className="mt-2 text-[0.8rem] text-muted">Stok kesinleşti ve tarihler satışa kapatıldı.</p>}</section>;
  }
  const declared = booking.paymentStatus === 'DECLARED';
  return (
    <section className={`rounded-2xl border p-5 ${declared ? 'border-gold/40 bg-gold/[0.08]' : 'border-line bg-surface'}`}>
      <p className={`eyebrow ${declared ? 'text-gold' : 'text-muted'}`}>Onay mekanizması</p>
      <h2 className="mt-3 font-display text-xl font-light text-ink">{declared ? 'Havale kontrolü bekliyor' : 'Kapora bildirimi bekleniyor'}</h2>
      <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">{declared ? `${formatPrice(booking.prepaymentAmount, booking.currency)} tutarındaki havaleyi banka hesabından doğrulayın. Onay verdiğinizde ödeme alınmış ve rezervasyon kesinleşmiş sayılır.` : 'Misafir henüz havale yaptığını bildirmedi. Ödeme başka bir kanaldan doğrulanmadıysa bekleyin.'}</p>
      <div className="mt-4 rounded-xl bg-surface/80 px-4 py-3"><p className="eyebrow text-muted">Havale açıklaması</p><p className="mt-1 font-mono text-[0.9rem] tracking-wide text-ink">{reference(booking.id)}</p></div>
      <button disabled={busy} onClick={onConfirm} className={`mt-5 w-full rounded-full px-5 py-3 text-[0.82rem] text-white disabled:opacity-40 ${declared ? 'bg-olive hover:bg-olive/90' : 'bg-ink hover:bg-olive'}`}>{busy ? 'İşleniyor…' : declared ? 'Havaleyi doğrula ve onayla' : 'Ödeme olmadan onayla'}</button>
    </section>
  );
}

function AuditTimeline({ audits }: { audits: CalendarAudit[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="eyebrow text-muted">İşlem geçmişi</p>
      <div className="mt-6">
        {audits.map((audit, index) => (
          <div key={audit.id} className="grid grid-cols-[12px_1fr] gap-4">
            <div className="flex flex-col items-center"><span className="mt-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-gold ring-1 ring-gold/40" />{index < audits.length - 1 && <span className="h-full w-px bg-line" />}</div>
            <div className="pb-6">
              <p className="text-[0.84rem] text-ink">{AUDIT_LABEL[audit.action] ?? audit.action}</p>
              <p className="mt-1 text-[0.74rem] text-muted">{audit.actor?.name ?? 'Sistem'} · {dateTime(audit.createdAt)}</p>
              {audit.reason && <p className="mt-2 rounded-lg bg-sand/45 px-3 py-2 text-[0.76rem] leading-relaxed text-muted">{audit.reason}</p>}
            </div>
          </div>
        ))}
        {!audits.length && <p className="text-[0.82rem] text-muted">İşlem kaydı bulunamadı.</p>}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-surface px-5 py-5"><dt className="eyebrow text-muted">{label}</dt><dd className="mt-2 text-[0.9rem] text-ink">{value}</dd></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="eyebrow text-muted">{label}</span><span className="mt-1.5 block">{children}</span></label>; }
function NumberField({ label, value, min = 0, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} className={INPUT} /></Field>; }
function Detail({ label, value, href }: { label: string; value: string | null; href?: string }) { return <div><dt className="eyebrow text-muted">{label}</dt><dd className="mt-1 text-[0.86rem] text-ink">{href && value ? <a href={href} className="underline decoration-line underline-offset-4 hover:decoration-ink">{value}</a> : value || '—'}</dd></div>; }
function MoneyRow({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) { return <div className={`flex items-center justify-between gap-5 py-3 text-[0.84rem] ${strong ? 'font-medium text-ink' : 'text-muted'}`}><dt>{label}</dt><dd className="text-ink">{formatPrice(value, currency)}</dd></div>; }
function Centered({ children }: { children: React.ReactNode }) { return <div className="flex h-full items-center justify-center bg-canvas px-6 text-[0.88rem] text-muted">{children}</div>; }

const reference = (id: string) => `MV-${id.slice(-6).toUpperCase()}`;
const fullDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const stayNights = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
const guestLabel = (booking: Pick<Booking, 'adults' | 'children' | 'infants'>) => `${booking.adults} yetişkin${booking.children ? `, ${booking.children} çocuk` : ''}${booking.infants ? `, ${booking.infants} bebek` : ''}`;
function priceNights(snapshot: unknown): { date: string; amount: number }[] {
  if (!snapshot || typeof snapshot !== 'object' || !('nights' in snapshot) || !Array.isArray(snapshot.nights)) return [];
  return snapshot.nights.filter((item): item is { date: string; amount: number } => Boolean(item && typeof item === 'object' && 'date' in item && typeof item.date === 'string' && 'amount' in item && typeof item.amount === 'number'));
}
