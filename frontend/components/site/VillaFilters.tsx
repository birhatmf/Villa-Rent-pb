'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/components/site/LocaleLink';
import DateRangeField from '@/components/blocks/DateRangeField';
import GuestsField from '@/components/blocks/GuestsField';
import type { VillaFilterOption, VillaListParams } from '@/lib/api';

export default function VillaFilters({ params, regions, concepts }: {
  params: VillaListParams;
  regions: VillaFilterOption[];
  concepts: VillaFilterOption[];
}) {
  const locale = useLocale();
  const t = useTranslations('Filters');
  const search = useTranslations('Search');
  const [open, setOpen] = useState(false);
  const [concept, setConcept] = useState(params.konsept ?? '');
  const [error, setError] = useState('');
  const field = 'flex min-w-0 flex-col gap-2 bg-surface px-6 py-4';
  const active = !!(params.q || params.bolge || params.konsept || params.from || params.to || params.adults || params.children || params.infants || params.guests);

  return (
    <form
      action={`${locale === 'tr' ? '' : `/${locale}`}/villalar`}
      method="get"
      className="relative rounded-2xl border border-line bg-surface text-ink [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-olive [&_input]:focus-visible:outline-2 [&_input]:focus-visible:outline-olive [&_select]:focus-visible:outline-2 [&_select]:focus-visible:outline-olive"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const from = String(data.get('from') ?? '');
        const to = String(data.get('to') ?? '');
        if ((!!from !== !!to) || (from && to && from >= to)) {
          event.preventDefault();
          setOpen(true);
          setError(t('dateError'));
        } else {
          setError('');
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="villa-filter-fields"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-5 text-sm font-medium lg:hidden"
      >
        <span>{active ? t('edit') : t('open')}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      <div id="villa-filter-fields" className={`${open ? 'block' : 'hidden'} lg:block`}>
        <div className="grid gap-px rounded-t-2xl bg-line/60 lg:grid-cols-[1fr_0.9fr_1.5fr_1fr]">
          <label className={`${field} lg:rounded-tl-2xl`}>
            <span className="eyebrow text-muted">{t('villaName')}</span>
            <input name="q" defaultValue={params.q} maxLength={200} placeholder={t('villaPlaceholder')} className="w-full min-w-0 text-[0.95rem] outline-offset-4 placeholder:text-muted" />
          </label>
          <label className={field}>
            <span className="eyebrow text-muted">{t('region')}</span>
            <select name="bolge" defaultValue={params.bolge ?? ''} className="min-w-0 bg-transparent text-[0.95rem] outline-offset-4">
              <option value="">{t('allRegions')}</option>
              {params.bolge && !regions.some((r) => r.slug === params.bolge) && <option value={params.bolge}>{search('noRegion')}</option>}
              {regions.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
            </select>
          </label>
          <DateRangeField defaultFrom={params.from} defaultTo={params.to} />
          <GuestsField
            className="lg:[&>button]:rounded-tr-2xl"
            defaultAdults={Number.isInteger(params.adults) && params.adults! >= 1 && params.adults! <= 20 ? params.adults : 2}
            defaultChildren={Number.isInteger(params.children) && params.children! >= 0 && params.children! <= 12 ? params.children : 0}
            defaultInfants={Number.isInteger(params.infants) && params.infants! >= 0 && params.infants! <= 10 ? params.infants : 0}
          />
        </div>

        <fieldset className="border-t border-line px-6 pt-5 pb-6">
          <legend className="sr-only">{t('concept')}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs text-muted">{t('holidayType')}</span>
            {[{ id: 'all', slug: '', name: t('allConcepts') }, ...concepts].map((c) => (
              <button
                type="button"
                key={c.id}
                aria-pressed={concept === c.slug}
                onClick={() => setConcept(concept === c.slug ? '' : c.slug)}
                className={`min-h-10 rounded-full border px-4 py-2 text-xs transition-colors ${concept === c.slug ? 'border-olive bg-olive text-white' : 'border-line text-muted hover:border-olive hover:text-olive'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <input type="hidden" name="konsept" value={concept} />
        </fieldset>

        <div className="flex flex-col gap-4 rounded-b-2xl border-t border-line bg-canvas/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted">{t('sort')}</span>
            <select name="sort" defaultValue={params.sort ?? 'yeni'} className="min-h-11 min-w-0 rounded-lg border border-line bg-surface px-3 text-ink">
              <option value="yeni">{t('newest')}</option>
              <option value="fiyat_artan">{t('priceAsc')}</option>
              <option value="fiyat_azalan">{t('priceDesc')}</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-5">
            <Link href="/villalar" className="text-xs text-muted underline underline-offset-4 hover:text-ink">{t('clearFilters')}</Link>
            <button type="submit" className="min-h-12 rounded-lg bg-ink px-7 py-3 text-sm text-canvas transition-colors hover:bg-olive">{t('search')} <span aria-hidden="true" className="ml-3">→</span></button>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="px-6 pb-5 text-sm text-red-700">{error}</p>}
    </form>
  );
}
