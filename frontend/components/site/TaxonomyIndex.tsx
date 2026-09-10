import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from '@/components/site/LocaleLink';
import type { Concept, Region } from '@/lib/types';
import { translateDefaultText } from '@/lib/localization';

type Props = {
  kind: 'region' | 'concept';
  items: (Region | Concept)[];
};

export default async function TaxonomyIndex({ kind, items }: Props) {
  const locale = await getLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: 'Taxonomy' }),
    getTranslations({ locale, namespace: 'Common' }),
  ]);
  const isRegion = kind === 'region';
  const base = isRegion ? 'bolgeler' : 'konseptler';

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-10 lg:pt-40">
      <nav aria-label={common('home')} className="mb-10 flex items-center gap-3 text-xs text-muted">
        <Link href="/" className="hover:text-ink">{common('home')}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{isRegion ? t('regions') : t('concepts')}</span>
      </nav>

      <header className="mb-12 grid gap-7 lg:grid-cols-[1fr_0.65fr] lg:items-end">
        <div>
          <p className="eyebrow text-olive">{isRegion ? t('regionEyebrow') : t('conceptEyebrow')}</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.7rem,6vw,5rem)] font-light leading-[1.02] tracking-tight">
            <em className="text-olive">{isRegion ? t('regionTitle') : t('conceptTitle')}</em>
          </h1>
        </div>
        <p className="max-w-md text-sm leading-7 text-muted">
          {isRegion ? t('regionIntro') : t('conceptIntro')}
        </p>
      </header>

      <section aria-label={isRegion ? t('regions') : t('concepts')} className="grid auto-rows-[17rem] gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={`/${base}/${item.slug}`}
            style={{ transitionDelay: `${Math.min(index, 5) * 60}ms` }}
            className={`reveal group relative overflow-hidden rounded-xl bg-sand-deep ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive ${index === 0 ? 'sm:row-span-2 lg:col-span-2' : ''}`}
          >
            <Image
              src={item.image}
              alt=""
              fill
              priority={index === 0}
              sizes={index === 0 ? '(max-width: 640px) 100vw, 66vw' : '(max-width: 640px) 100vw, 33vw'}
              className="object-cover transition-transform duration-[1200ms] ease-[var(--ease-out-soft)] group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white lg:p-8">
              <div>
                <p className="eyebrow text-white/65">{item.villaCount} {common('villa')}</p>
                <h2 className={`mt-2 font-display font-light leading-none ${index === 0 ? 'text-4xl lg:text-6xl' : 'text-3xl'}`}>{translateDefaultText(item.name, locale)}</h2>
                {item.subtitle && <p className="mt-3 max-w-sm text-sm text-white/75">{translateDefaultText(item.subtitle, locale)}</p>}
              </div>
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/40 transition-colors group-hover:bg-white group-hover:text-ink">→</span>
            </div>
          </Link>
        ))}
      </section>

      <div className="mt-14 border-t border-line pt-8 text-center">
        <Link href="/villalar" className="inline-flex min-h-12 items-center rounded-full bg-ink px-7 py-3 text-sm text-canvas transition-[background-color,transform] hover:bg-olive active:scale-[0.96]">{t('allVillas')} <span aria-hidden="true" className="ml-3">→</span></Link>
      </div>
    </div>
  );
}
