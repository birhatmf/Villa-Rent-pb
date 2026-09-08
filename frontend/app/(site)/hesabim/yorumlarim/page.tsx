'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  createReview,
  listEligibleReviews,
  listMyReviews,
  updateReview,
  type EligibleReview,
  type ReviewItem,
} from '@/lib/reviewApi';

export default function MyReviewsPage() {
  const [eligible, setEligible] = useState<EligibleReview[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [nextEligible, mine] = await Promise.all([listEligibleReviews(), listMyReviews()]);
      setEligible(nextEligible);
      setReviews(mine.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Yorumlar yüklenemedi.');
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 pb-28 pt-36 lg:px-10">
      <p className="eyebrow text-gold">Hesabım</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(2.2rem,4vw,3.2rem)] font-light text-ink">Yorumlarım</h1>
        <Link href="/hesabim" className="text-[0.85rem] text-muted underline underline-offset-4">Hesabıma dön</Link>
      </div>
      {error && <p role="alert" className="mt-8 border-l-2 border-red-400 pl-3 text-sm text-red-700">{error}</p>}

      <section className="mt-12">
        <h2 className="eyebrow text-muted">Yorum bekleyen konaklamalar</h2>
        {eligible.length ? (
          <div className="mt-5 space-y-5">
            {eligible.map((stay) => <ReviewEditor key={stay.bookingId} stay={stay} onSaved={load} />)}
          </div>
        ) : <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm text-muted">Şu anda yorum bekleyen bir konaklamanız yok.</p>}
      </section>

      <section className="mt-14">
        <h2 className="eyebrow text-muted">Geçmiş yorumlarım</h2>
        <div className="mt-5 space-y-5">
          {reviews.map((review) => <ReviewEditor key={review.id} review={review} onSaved={load} />)}
          {!reviews.length && <p className="text-sm text-muted">Henüz yorum yazmadınız.</p>}
        </div>
      </section>
    </main>
  );
}

function ReviewEditor({ stay, review, onSaved }: { stay?: EligibleReview; review?: ReviewItem; onSaved: () => Promise<void> }) {
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [body, setBody] = useState(review?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const villa = stay?.villa ?? review!.villa;
  const editable = !review || review.canEdit;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (review) await updateReview(review.id, { rating, body });
      else await createReview(stay!.bookingId, { rating, body });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Yorum kaydedilemedi.'); }
    finally { setBusy(false); }
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href={`/villalar/${villa.slug}`} className="text-base text-ink hover:underline">{villa.title}</Link>{stay && <p className="mt-1 text-xs text-muted">{stay.checkIn} – {stay.checkOut}</p>}</div>
        {review?.status === 'HIDDEN' && <span className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">Gizlendi</span>}
      </div>
      {editable ? (
        <form onSubmit={submit} className="mt-5">
          <fieldset className="flex gap-1" aria-label="Puan">
            {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} puan`} className={`text-2xl ${value <= rating ? 'text-gold' : 'text-line'}`}>★</button>)}
          </fieldset>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} minLength={10} maxLength={2000} required rows={4} className="mt-4 w-full rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none focus:border-gold" placeholder="Konaklamanızı diğer misafirler için anlatın…" />
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
          <button disabled={busy} className="mt-4 rounded-full bg-ink px-6 py-2.5 text-sm text-canvas disabled:opacity-50">{busy ? 'Kaydediliyor…' : review ? 'Yorumu güncelle' : 'Yorumu yayınla'}</button>
        </form>
      ) : <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{review.body}</p>}
      {review?.moderationReason && <p className="mt-4 text-xs text-red-700">Moderasyon notu: {review.moderationReason}</p>}
      {review?.response && <div className="mt-5 border-l-2 border-gold/50 pl-4 text-sm text-muted"><strong className="text-ink">Ev sahibinin yanıtı:</strong> {review.response.body}</div>}
      {review && !review.canEdit && <p className="mt-4 text-xs text-muted">24 saatlik düzenleme süresi sona erdi.</p>}
    </article>
  );
}
