'use client';

import { useState } from 'react';
import { formatPrice, type AvailabilityResult } from '@/lib/api';
import {
  previewBookingChange,
  requestBookingCancellation,
  requestBookingChange,
  withdrawBookingRequest,
  withdrawServiceRequest,
  type BookingServiceRequest,
  type GuestBooking,
} from '@/lib/reservationApi';

const INPUT = 'w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-gold';
const REQUEST_STATUS: Record<BookingServiceRequest['status'], string> = { PENDING: 'Değerlendiriliyor', APPROVED: 'Onaylandı', REJECTED: 'Reddedildi', WITHDRAWN: 'Geri çekildi' };
const REFUND_STATUS: Record<BookingServiceRequest['refundStatus'], string> = { NONE: 'İade yok', PENDING: 'Manuel iade bekleniyor', COMPLETED: 'İade tamamlandı', REJECTED: 'İade yapılmayacak' };

export default function BookingServiceRequests({ booking, onReload }: { booking: GuestBooking; onReload: () => Promise<void> }) {
  const [mode, setMode] = useState<'change' | 'cancel' | null>(null);
  const [change, setChange] = useState({ from: booking.checkIn, to: booking.checkOut, adults: booking.adults, children: booking.children, infants: booking.infants, customerNote: '' });
  const [cancelReason, setCancelReason] = useState('');
  const [preview, setPreview] = useState<AvailabilityResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requests = booking.serviceRequests ?? [];
  const policy = cancellationPolicy(booking.priceSnapshot);
  const pendingChange = requests.some((request) => request.type === 'CHANGE' && request.status === 'PENDING');
  const pendingCancellation = requests.some((request) => request.type === 'CANCELLATION' && request.status === 'PENDING');

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); setMode(null); setPreview(null); await onReload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.'); }
    finally { setBusy(false); }
  }

  async function previewChange() {
    setBusy(true); setError(''); setPreview(null);
    try {
      const result = await previewBookingChange(booking.id, change);
      if (!result.available) throw new Error('Seçilen yeni tarihler veya misafir sayısı uygun değil.');
      setPreview(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Önizleme alınamadı.'); }
    finally { setBusy(false); }
  }

  if (booking.status === 'REQUESTED') {
    return (
      <section className="mt-10 rounded-xl border border-gold/35 bg-gold/10 p-5">
        <h2 className="font-display text-xl font-light text-ink">Talebiniz değerlendiriliyor</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Talep stok kapatmaz. Kabul anında tarihler yeniden kontrol edilir ve ödeme için 10 dakikalık bekletme açılır.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} onClick={() => run(() => withdrawBookingRequest(booking.id))} className="mt-4 text-sm text-ink underline underline-offset-4 disabled:opacity-40">Talebi geri çek</button>
      </section>
    );
  }

  return (
    <section className="mt-10">
      {booking.status === 'CONFIRMED' && (
        <div className="flex flex-wrap gap-3">
          {!pendingChange && <button onClick={() => setMode(mode === 'change' ? null : 'change')} className="rounded-full border border-ink/20 px-5 py-2.5 text-sm text-ink">Değişiklik talebi</button>}
          {!pendingCancellation && <button onClick={() => setMode(mode === 'cancel' ? null : 'cancel')} className="rounded-full border border-red-200 px-5 py-2.5 text-sm text-red-700">İptal talebi</button>}
        </div>
      )}

      {mode === 'change' && (
        <div className="mt-5 rounded-xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-light text-ink">Konaklama değişikliği</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input aria-label="Yeni giriş" type="date" value={change.from} onChange={(e) => { setChange({ ...change, from: e.target.value }); setPreview(null); }} className={INPUT} />
            <input aria-label="Yeni çıkış" type="date" value={change.to} onChange={(e) => { setChange({ ...change, to: e.target.value }); setPreview(null); }} className={INPUT} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(['adults', 'children', 'infants'] as const).map((key) => <input key={key} aria-label={key} type="number" min={key === 'adults' ? 1 : 0} value={change[key]} onChange={(e) => { setChange({ ...change, [key]: Number(e.target.value) }); setPreview(null); }} className={INPUT} />)}
          </div>
          <textarea value={change.customerNote} onChange={(e) => setChange({ ...change, customerNote: e.target.value })} maxLength={500} rows={2} placeholder="Talep notu (isteğe bağlı)" className={`${INPUT} mt-3`} />
          {preview && <p className="mt-4 rounded-lg bg-sand/50 p-3 text-sm text-ink">Yeni fiyat önizlemesi: <strong>{formatPrice(preview.quote.totalAmount, preview.quote.currency)}</strong>. Onay anında fiyat ve müsaitlik tekrar hesaplanır.</p>}
          <button disabled={busy} onClick={preview ? () => run(() => requestBookingChange(booking.id, change)) : previewChange} className="mt-4 rounded-full bg-ink px-6 py-2.5 text-sm text-canvas disabled:opacity-40">{busy ? 'Kontrol ediliyor…' : preview ? 'Talebi gönder' : 'Fiyatı ve müsaitliği kontrol et'}</button>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="mt-5 rounded-xl border border-red-200 bg-surface p-5">
          <h2 className="font-display text-xl font-light text-ink">İptal talebi</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{policy.text} İncelenecek kapora tutarı en fazla {formatPrice(booking.prepaymentAmount, booking.currency)}; otomatik iade yapılmaz.</p>
          <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} minLength={2} maxLength={300} required rows={3} placeholder="İptal gerekçesi" className={`${INPUT} mt-4`} />
          <button disabled={busy || cancelReason.trim().length < 2} onClick={() => run(() => requestBookingCancellation(booking.id, cancelReason))} className="mt-4 rounded-full border border-red-300 px-6 py-2.5 text-sm text-red-700 disabled:opacity-40">Talebi gönder</button>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {requests.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="eyebrow text-muted">Taleplerim</h2>
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-line bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-3"><strong className="text-ink">{request.type === 'CHANGE' ? 'Değişiklik' : 'İptal'} talebi</strong><span className="text-xs text-muted">{REQUEST_STATUS[request.status]}</span></div>
              {request.payload && <p className="mt-2 text-muted">{request.payload.from} – {request.payload.to} · {request.payload.adults} yetişkin{request.payload.preview ? ` · Önizleme ${formatPrice(request.payload.preview.totalAmount, request.payload.preview.currency)}` : ''}</p>}
              {request.customerNote && <p className="mt-2 text-ink-soft">{request.customerNote}</p>}
              {request.resolutionNote && <p className="mt-2 text-muted">Karar notu: {request.resolutionNote}</p>}
              {request.type === 'CANCELLATION' && request.refundStatus !== 'NONE' && <p className="mt-2 text-muted">{REFUND_STATUS[request.refundStatus]} · {formatPrice(request.refundAmount, booking.currency)}{request.refundNote ? ` · ${request.refundNote}` : ''}</p>}
              {request.status === 'PENDING' && request.requestedBy === booking.guestId && <button disabled={busy} onClick={() => run(() => withdrawServiceRequest(request.id))} className="mt-3 text-xs text-ink underline underline-offset-4 disabled:opacity-40">Talebi geri çek</button>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function cancellationPolicy(snapshot: unknown) {
  if (snapshot && typeof snapshot === 'object' && 'cancellationPolicy' in snapshot) {
    const policy = snapshot.cancellationPolicy;
    if (policy && typeof policy === 'object' && 'text' in policy && typeof policy.text === 'string') return { text: policy.text };
  }
  return { text: 'İptal ve kapora iadesi yönetim incelemesine tabidir.' };
}
