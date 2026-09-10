'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import DateRangeField from './DateRangeField';
import GuestsField from './GuestsField';
import RegionField from './RegionField';

type Slide = { image: string; caption?: string };

export default function Hero({ content }: { content: Record<string, any> }) {
  const t = useTranslations('Common');
  const slides: Slide[] = content.slides ?? [];
  const [active, setActive] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || reduceMotion) return;
    const t = setInterval(() => setActive((i) => (i + 1) % slides.length), 6500);
    return () => clearInterval(t);
  }, [slides.length, reduceMotion]);

  return (
    <section className="relative z-10 flex min-h-[92svh] flex-col justify-end overflow-visible">
      {slides.map((s, i) => (
        <div
          key={s.image}
          aria-hidden={i !== active}
          className={`absolute inset-0 overflow-hidden ${
            reduceMotion
              ? 'transition-opacity duration-200'
              : 'transition-opacity duration-[1600ms] ease-[var(--ease-out-soft)]'
          } ${i === active ? 'opacity-100' : 'opacity-0'}`}
        >
          <Image
            src={s.image}
            alt={s.caption ?? ''}
            fill
            priority={i === 0}
            sizes="100vw"
            className={`object-cover ${
              reduceMotion
                ? ''
                : `transition-transform duration-[9000ms] ease-linear ${i === active ? 'scale-110' : 'scale-100'}`
            }`}
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/70" />

      <div className="relative mx-auto w-full max-w-[1320px] px-6 pb-12 pt-36 lg:px-10">
        <div className="max-w-3xl">
          {content.eyebrow && (
            <p className="eyebrow text-white/70">{content.eyebrow}</p>
          )}
          <h1 className="mt-6 whitespace-pre-line font-display text-[clamp(2.6rem,6.4vw,5rem)] font-light leading-[1.04] tracking-[-0.02em] text-white">
            {content.title}
          </h1>
          {content.subtitle && (
            <p className="mt-7 max-w-xl text-[1.05rem] leading-relaxed text-white/80">
              {content.subtitle}
            </p>
          )}
        </div>

        <SearchBar search={content.search} />

        {slides.length > 1 && (
          <div className="mt-10 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              {slides.map((s, i) => (
                <button
                  key={s.image}
                  type="button"
                  aria-label={t('slide', { number: i + 1 })}
                  onClick={() => setActive(i)}
                  className={`h-px transition-[width,background-color] duration-500 ${
                    i === active ? 'w-14 bg-white' : 'w-7 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
            <p className="text-[0.8rem] tracking-wide text-white/60">
              {slides[active]?.caption}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SearchBar({
  search,
}: {
  search?: { cta?: string; regions?: { id: string; slug: string; name: string }[] };
}) {
  const locale = useLocale();
  const t = useTranslations('Search');
  const regions = search?.regions ?? [];
  return (
    <form
      action={`${locale === 'tr' ? '' : `/${locale}`}/villalar`}
      className="mt-12 grid gap-px overflow-visible rounded-2xl bg-line/60 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:grid-cols-2 lg:grid-cols-[1.4fr_1.6fr_0.9fr_auto]"
    >
      <RegionField
        regions={regions}
        className="rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none lg:rounded-l-2xl lg:rounded-r-none"
      />
      <DateRangeField />
      <GuestsField className="sm:col-span-2 lg:col-span-1" />
      <button
        type="submit"
        className="bg-ink px-8 py-5 text-[0.95rem] text-canvas transition-colors hover:bg-olive sm:col-span-2 sm:rounded-b-2xl lg:col-span-1 lg:rounded-b-none lg:rounded-r-2xl lg:px-10"
      >
        {locale === 'tr' ? search?.cta ?? t('search') : t('search')}
      </button>
    </form>
  );
}
