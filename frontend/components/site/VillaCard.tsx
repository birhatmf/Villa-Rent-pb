'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/components/site/LocaleLink';
import FavoriteButton from '@/components/site/FavoriteButton';
import type { VillaCardData } from '@/lib/types';
import { useCurrency } from './CurrencyProvider';
import { translateDefaultText } from '@/lib/localization';

/**
 * Tek villa kartı — hem ana sayfa `featuredVillas` bloğu hem `/villalar`
 * listelemesi bunu kullanır. İki ayrı kart tasarımı sürüklememek için paylaşıldı.
 */
export default function VillaCard({ villa, delay = 0 }: { villa: VillaCardData; delay?: number }) {
  const { formatPrice } = useCurrency();
  const locale = useLocale();
  const t = useTranslations('Common');
  const { min, max } = villa.priceRange;

  return (
    <article
      style={{ transitionDelay: `${delay}ms` }}
      className="reveal group relative"
    >
      <Link href={`/villalar/${villa.slug}`} className="block rounded-xl transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sand-deep ring-1 ring-black/10">
        {villa.images[0] && (
          <Image
            src={villa.images[0]}
            alt={villa.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-[1200ms] ease-[var(--ease-out-soft)] group-hover:scale-105"
          />
        )}
        {villa.images[1] && (
          <Image
            src={villa.images[1]}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
          />
        )}
        {villa.rating > 0 && (
          <div className="absolute left-4 top-4 rounded-full bg-canvas/90 px-3 py-1.5 text-[0.72rem] tracking-wide text-ink backdrop-blur-sm">
            ★ {villa.rating.toFixed(1)}
            <span className="text-muted"> · {villa.reviewCount}</span>
          </div>
        )}
      </div>

      <div className="pt-5">
        <p className="eyebrow text-muted">
          {villa.region.name}
          {villa.district ? ` · ${villa.district}` : ''}
        </p>
        <h3 className="mt-2.5 font-display text-2xl font-light leading-tight tracking-tight text-ink transition-colors group-hover:text-gold">
          {villa.title}
        </h3>
        {villa.summary && (
          <p className="mt-2 line-clamp-2 text-[0.93rem] leading-relaxed text-muted">
            {translateDefaultText(villa.summary, locale)}
          </p>
        )}

        <div className="mt-5 flex items-center gap-4 text-[0.83rem] text-muted">
          <span>{villa.capacity} {t('person')}</span>
          <Dot />
          <span>{villa.bedrooms} {t('room')}</span>
          <Dot />
          <span>{villa.bathrooms} {t('bathroom')}</span>
        </div>

        <div className="mt-4 flex items-baseline gap-1.5 border-t border-line pt-4">
          <span className="font-display text-xl text-ink tabular-nums">
            {min === max
              ? formatPrice(min, villa.currency)
              : `${formatPrice(min, villa.currency)} – ${formatPrice(max, villa.currency)}`}
          </span>
          <span className="text-[0.83rem] text-muted">/ {t('night')}</span>
        </div>
      </div>
      </Link>
      <FavoriteButton villaId={villa.id} className="absolute right-3 top-3 z-10" />
    </article>
  );
}

const Dot = () => <span className="h-1 w-1 rounded-full bg-line" />;
