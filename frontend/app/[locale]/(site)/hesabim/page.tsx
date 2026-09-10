'use client';

import Image from 'next/image';
import Link from '@/components/site/LocaleLink';
import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { logout, me, type AccountUser } from '@/lib/authApi';
import { useCurrency } from '@/components/site/CurrencyProvider';
import { listFavorites, removeFavorite, type FavoriteVilla } from '@/lib/favoritesApi';
import { listMyBookings, type GuestBooking } from '@/lib/reservationApi';

export default function HesabimPage() {
  const locale = useLocale();
  const t = useTranslations('Account');
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => router.replace('/giris?next=/hesabim'));
  }, [router]);

  async function onLogout() {
    await logout().catch(() => {});
    router.replace('/');
    router.refresh();
  }

  if (error) return <Centered>{error}</Centered>;
  if (!user) return <Centered>{t('loading')}</Centered>;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-28 pt-36 lg:px-10">
      <p className="eyebrow text-gold">{t('title')}</p>
      <h1 className="mt-4 font-display text-[clamp(2.2rem,4vw,3.2rem)] font-light leading-tight tracking-[-0.02em] text-ink">
        {t('hello', { name: user.name.split(' ')[0] })}
      </h1>

      <dl className="mt-14 divide-y divide-line border-y border-line">
        <Row label={t('fullName')} value={user.name} />
        <Row label={t('email')} value={user.email} />
        <Row label={t('phone')} value={user.phone || '—'} />
        <Row
          label={t('memberSince')}
          value={new Date(user.createdAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />
      </dl>

      <div className="mt-6 flex flex-wrap gap-5">
        <Link href="/hesabim/profil" className="text-[0.88rem] text-ink underline underline-offset-4 hover:text-gold">
          {t('profileSecurity')}
        </Link>
        <Link href="/hesabim/seyahatlerim" className="text-[0.88rem] text-ink underline underline-offset-4 hover:text-gold">
          {t('allTrips')}
        </Link>
        <Link href="/hesabim/yorumlarim" className="text-[0.88rem] text-ink underline underline-offset-4 hover:text-gold">
          {t('myReviews')}
        </Link>
      </div>

      {user.role === 'HOST' || user.role === 'ADMIN' ? (
        <div className="mt-14 flex flex-col items-start gap-4 rounded-xl border border-line bg-sand/30 px-6 py-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-light text-ink">Villalarım</h2>
            <p className="mt-1.5 text-[0.9rem] text-muted">
              Villalarınızı ekleyin, düzenleyin, fotoğraf ve fiyat kurallarını yönetin.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/hesabim/ev-sahibi/rezervasyonlar"
              className="rounded-full border border-ink/25 px-6 py-3 text-[0.9rem] text-ink transition-colors hover:border-ink"
            >
              Gelen rezervasyonlar
            </Link>
            <Link
              href="/hesabim/villalarim"
              className="rounded-full bg-ink px-6 py-3 text-[0.9rem] text-canvas transition-colors hover:bg-olive"
            >
              Villalarımı yönet
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-14 rounded-xl border border-dashed border-line px-6 py-8 text-center">
          <p className="text-[0.95rem] text-muted">
            {t('hostPrompt')}
          </p>
          <Link
            href="/ev-sahibi"
            className="mt-4 inline-block text-[0.9rem] text-ink underline underline-offset-4 transition-colors hover:text-gold"
          >
            {t('hostApplication')}
          </Link>
        </div>
      )}

      <BookingsSection />

      <FavoritesSection />

      <div className="mt-12 flex flex-wrap items-center gap-6">
        {user.role === 'ADMIN' && (
          <Link
            href="/admin"
            className="rounded-full border border-ink/20 px-6 py-3 text-[0.9rem] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-canvas"
          >
            {t('adminPanel')}
          </Link>
        )}
        <button
          onClick={onLogout}
          className="text-[0.9rem] text-muted transition-colors hover:text-ink"
        >
          {t('logout')}
        </button>
      </div>
    </div>
  );
}

function BookingsSection() {
  const { formatPrice } = useCurrency();
  const locale = useLocale();
  const t = useTranslations('Account');
  const [bookings, setBookings] = useState<GuestBooking[] | null>(null);

  useEffect(() => {
    listMyBookings({ pageSize: 3 })
      .then((result) => setBookings(result.items))
      .catch(() => setBookings([]));
  }, []);

  if (bookings === null) return null;

  return (
    <div className="mt-14">
      <div className="flex items-center justify-between gap-4">
        <h2 className="eyebrow text-muted">{t('recentTrips')}</h2>
        <Link href="/hesabim/seyahatlerim" className="text-[0.82rem] text-ink underline underline-offset-4">{t('viewAll')}</Link>
      </div>
      {bookings.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line px-5 py-7 text-center text-[0.9rem] text-muted">
          {t('noBookings')} <Link href="/villalar" className="text-ink underline underline-offset-4">{t('exploreVillas')}</Link>.
        </p>
      ) : <ul className="mt-5 divide-y divide-line border-y border-line">
        {bookings.map((booking) => {
          const state =
            booking.status === 'CONFIRMED'
              ? t('statusConfirmed')
              : booking.status === 'REQUESTED'
                ? t('statusRequested')
                : booking.status === 'DECLINED'
                  ? t('statusDeclined')
                  : booking.status === 'WITHDRAWN'
                    ? t('statusWithdrawn')
              : booking.status === 'CANCELLED'
                ? t('statusCancelled')
                : booking.status === 'EXPIRED'
                  ? t('statusExpired')
                  : booking.paymentStatus === 'DECLARED'
                    ? t('statusChecking')
                    : booking.paymentStatus === 'PAID'
                      ? t('statusPaid')
                      : booking.paymentStatus === 'PENDING'
                        ? t('statusDeposit')
                        : t('statusHeld');
          return (
            <li key={booking.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
              <div className="min-w-0">
                <Link href={`/hesabim/seyahatlerim/${booking.id}`} className="text-[0.95rem] text-ink underline-offset-4 hover:underline">
                  {booking.villa.title}
                </Link>
                <p className="mt-0.5 text-[0.82rem] text-muted">
                  {new Date(`${booking.checkIn}T00:00:00Z`).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – {new Date(`${booking.checkOut}T00:00:00Z`).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {formatPrice(booking.totalAmount, booking.currency)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[0.76rem] ${
                  booking.status === 'CONFIRMED'
                    ? 'bg-olive/15 text-olive'
                    : booking.status === 'HOLD'
                      ? 'bg-gold/20 text-ink'
                      : 'bg-sand text-muted'
                }`}
              >
                {state}
              </span>
            </li>
          );
        })}
      </ul>}
    </div>
  );
}

function FavoritesSection() {
  const { formatPrice } = useCurrency();
  const t = useTranslations('Account');
  const [favorites, setFavorites] = useState<FavoriteVilla[] | null>(null);

  useEffect(() => {
    listFavorites()
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, []);

  async function onRemove(id: string) {
    setFavorites((prev) => prev?.filter((f) => f.id !== id) ?? null);
    await removeFavorite(id).catch(() => {});
  }

  if (favorites === null) return null;

  return (
    <div className="mt-14">
      <h2 className="eyebrow text-muted">{t('favorites')}</h2>
      {favorites.length === 0 ? (
        <p className="mt-4 text-[0.9rem] text-muted">
          {t('noFavorites')}{' '}
          <Link href="/" className="text-ink underline underline-offset-4 hover:text-gold">
            {t('exploreVillas')}
          </Link>
          .
        </p>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {favorites.map((v) => (
            <div key={v.id} className="group relative overflow-hidden rounded-xl border border-line">
              <Link href={`/villalar/${v.slug}`} className="block">
                <div className="relative aspect-[4/3] bg-sand-deep">
                  {v.images[0] && <Image src={v.images[0].url} alt={v.title} fill sizes="50vw" className="object-cover" />}
                </div>
                <div className="p-4">
                  <p className="text-[0.8rem] text-muted">{v.region.name}</p>
                  <p className="mt-1 text-[0.95rem] text-ink">{v.title}</p>
                  <p className="mt-1 text-[0.85rem] text-muted">
                    {v.priceRange.min === v.priceRange.max
                      ? formatPrice(v.priceRange.min, v.currency)
                      : `${formatPrice(v.priceRange.min, v.currency)} – ${formatPrice(v.priceRange.max, v.currency)}`}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => onRemove(v.id)}
                aria-label={t('removeFavorite')}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-canvas/90 text-ink transition-colors hover:text-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-5 sm:flex-row sm:items-center sm:justify-between">
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="text-[0.98rem] text-ink">{value}</dd>
    </div>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-[60vh] items-center justify-center text-[0.9rem] text-muted">
    {children}
  </div>
);
