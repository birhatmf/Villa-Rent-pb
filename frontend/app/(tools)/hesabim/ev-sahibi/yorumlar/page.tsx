'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listHostReviews, respondToReview, type ReviewItem } from '@/lib/reviewApi';

export default function HostReviewsPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try { setItems((await listHostReviews()).items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Yorumlar yüklenemedi.'); }
  }
  useEffect(() => { void load(); }, []);

  return (
    <main className="h-full overflow-y-auto px-6 py-8 lg:px-10">
      <p className="eyebrow text-gold">Ev sahibi paneli</p>
      <h1 className="mt-3 font-display text-3xl font-light text-ink">Misafir yorumları</h1>
      <p className="mt-2 text-sm text-muted">Yayınlanan yorumları görün ve her yoruma bir kez yanıt verin.</p>
      {error && <p role="alert" className="mt-6 text-sm text-red-700">{error}</p>}
      <div className="mt-8 max-w-4xl space-y-5">
        {items?.map((review) => <HostReview key={review.id} review={review} onSaved={load} />)}
        {items?.length === 0 && <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Henüz yayınlanmış yorum yok.</p>}
        {items === null && !error && <p className="text-sm text-muted">Yükleniyor…</p>}
      </div>
    </main>
  );
}

function HostReview({ review, onSaved }: { review: ReviewItem; onSaved: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await respondToReview(review.id, body); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Yanıt gönderilemedi.'); }
    finally { setBusy(false); }
  }
  return (
    <article className="rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap justify-between gap-3"><Link href={`/villalar/${review.villa.slug}`} className="text-base text-ink hover:underline">{review.villa.title}</Link><span className="text-gold">{'★'.repeat(review.rating)}</span></div>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{review.body}</p>
      <p className="mt-3 text-xs text-muted">{review.guestName} · doğrulanmış konaklama</p>
      {review.response ? <div className="mt-5 border-l-2 border-gold/50 pl-4 text-sm text-muted"><strong className="text-ink">Yanıtınız:</strong> {review.response.body}</div> : (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input value={body} onChange={(e) => setBody(e.target.value)} minLength={2} maxLength={1000} required placeholder="Misafire yanıt yazın…" className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm outline-none focus:border-gold" />
          <button disabled={busy} className="rounded-full bg-ink px-5 py-2.5 text-sm text-canvas disabled:opacity-50">{busy ? 'Gönderiliyor…' : 'Yanıtla'}</button>
          {error && <p role="alert" className="text-xs text-red-700 sm:basis-full">{error}</p>}
        </form>
      )}
    </article>
  );
}
