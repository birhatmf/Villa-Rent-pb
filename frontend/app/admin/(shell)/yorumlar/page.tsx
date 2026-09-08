'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listAdminReviews, moderateReview, type ReviewItem } from '@/lib/reviewApi';

type Filter = 'ALL' | 'PUBLISHED' | 'HIDDEN';

export default function AdminReviewsPage() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState('');

  async function load(next = filter) {
    try { setItems((await listAdminReviews(next === 'ALL' ? undefined : next)).items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Yorumlar yüklenemedi.'); }
  }
  useEffect(() => { void load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="h-full overflow-y-auto px-6 py-8 lg:px-10">
      <p className="eyebrow text-gold">Operasyon</p>
      <h1 className="mt-3 font-display text-3xl font-light text-ink">Yorum moderasyonu</h1>
      <div className="mt-6 flex gap-2">{(['ALL', 'PUBLISHED', 'HIDDEN'] as Filter[]).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-xs ${filter === value ? 'bg-ink text-canvas' : 'border border-line text-muted'}`}>{value === 'ALL' ? 'Tümü' : value === 'PUBLISHED' ? 'Yayında' : 'Gizli'}</button>)}</div>
      {error && <p role="alert" className="mt-6 text-sm text-red-700">{error}</p>}
      <div className="mt-8 max-w-5xl space-y-4">
        {items?.map((review) => <AdminReview key={review.id} review={review} onSaved={() => load()} />)}
        {items?.length === 0 && <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Bu filtrede yorum yok.</p>}
        {items === null && !error && <p className="text-sm text-muted">Yükleniyor…</p>}
      </div>
    </main>
  );
}

function AdminReview({ review, onSaved }: { review: ReviewItem; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState(review.moderationReason ?? 'Kişisel bilgi veya uygunsuz içerik');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function setStatus(status: 'PUBLISHED' | 'HIDDEN') {
    setBusy(true); setError('');
    try { await moderateReview(review.id, status, status === 'HIDDEN' ? reason : undefined); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Moderasyon işlemi tamamlanamadı.'); }
    finally { setBusy(false); }
  }
  return (
    <article className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href={`/villalar/${review.villa.slug}`} className="text-sm font-medium text-ink hover:underline">{review.villa.title}</Link><p className="mt-1 text-xs text-muted">{review.guestName} · {new Date(review.createdAt).toLocaleDateString('tr-TR')}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs ${review.status === 'HIDDEN' ? 'bg-red-50 text-red-700' : 'bg-olive/10 text-olive'}`}>{review.status === 'HIDDEN' ? 'Gizli' : 'Yayında'}</span>
      </div>
      <p className="mt-3 text-gold">{'★'.repeat(review.rating)}</p>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{review.body}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {review.status === 'PUBLISHED' ? <><input value={reason} onChange={(e) => setReason(e.target.value)} minLength={2} maxLength={300} aria-label="Gizleme gerekçesi" className="min-w-[260px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-gold" /><button disabled={busy || reason.trim().length < 2} onClick={() => setStatus('HIDDEN')} className="rounded-full border border-red-200 px-4 py-2 text-xs text-red-700 disabled:opacity-40">Gizle</button></> : <button disabled={busy} onClick={() => setStatus('PUBLISHED')} className="rounded-full bg-ink px-5 py-2 text-xs text-canvas disabled:opacity-40">Yeniden yayınla</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      {review.moderationReason && <p className="mt-3 text-xs text-red-700">Gerekçe: {review.moderationReason}</p>}
    </article>
  );
}
