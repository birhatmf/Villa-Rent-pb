import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from '@/components/site/LocaleLink';
import VillaCard from '@/components/site/VillaCard';
import VillaFilters from '@/components/site/VillaFilters';
import { getVillaFilterOptions, listVillas, VillaListError, type VillaListParams } from '@/lib/api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Villas' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function VillasPage({ searchParams, params: localeParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await localeParams;
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: 'Villas' }),
    getTranslations({ locale, namespace: 'Common' }),
  ]);
  const query = await searchParams;
  const params: VillaListParams = {};
  const preserved = new URLSearchParams();
  for (const key of ['q', 'bolge', 'konsept', 'from', 'to', 'sort', 'adults', 'children', 'infants', 'guests', 'page'] as const) {
    const raw = query[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!value) continue;
    preserved.set(key, value);
    if (key === 'adults' || key === 'children' || key === 'infants' || key === 'guests' || key === 'page') params[key] = Number(value);
    else params[key] = value;
  }

  const [options, listing] = await Promise.all([
    getVillaFilterOptions(),
    listVillas(params).then((data) => ({ data, error: '' })).catch((error: unknown) => {
      if (error instanceof VillaListError) return { data: null, error: error.message };
      throw error;
    }),
  ]);
  const { data, error } = listing;
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const pageHref = (page: number) => {
    const qs = new URLSearchParams(preserved);
    if (page === 1) qs.delete('page');
    else qs.set('page', String(page));
    return `/villalar${qs.size ? `?${qs}` : ''}`;
  };
  const pageNumbers = data ? [...new Set([1, data.page - 1, data.page, data.page + 1, pages])]
    .filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b) : [];

  return (
    <div className="mx-auto max-w-7xl px-6 pt-32 pb-24 lg:px-10 lg:pt-40">
      <nav aria-label={t('breadcrumb')} className="mb-9 flex items-center gap-3 text-xs text-muted">
        <Link href="/" className="hover:text-ink">{common('home')}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('breadcrumb')}</span>
      </nav>
      <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow text-olive">{t('eyebrow')}</p>
          <h1 className="mt-4 font-display text-[clamp(2.5rem,5vw,4.5rem)] font-light leading-[1.08] tracking-tight">{t('titleStart')} <em className="text-olive">{t('titleEmphasis')}</em></h1>
        </div>
        <p className="max-w-sm text-sm leading-7 text-muted">{t('intro')}</p>
      </div>

      <VillaFilters key={preserved.toString()} params={params} {...options} />

      {error ? (
        <div role="alert" className="mt-10 rounded-xl border border-line bg-sand/40 p-8">
          <h2 className="font-display text-2xl">{t('checkSearch')}</h2>
          <p className="mt-3 text-sm text-muted">{error}</p>
          <Link href="/villalar" className="mt-5 inline-block text-sm underline underline-offset-4">{t('clearFilters')}</Link>
        </div>
      ) : data && (
        <section aria-label={t('resultsLabel')} className="mt-10">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
            <p className="text-sm text-muted"><strong className="font-medium text-ink">{t('resultCount', { count: data.total })}</strong>{data.items.length > 0 && <span className="ml-3">· {t('showing', { from: (data.page - 1) * data.pageSize + 1, to: (data.page - 1) * data.pageSize + data.items.length })}</span>}</p>
            <p className="text-xs text-muted">{params.sort?.startsWith('fiyat_') ? t('priceSortNote') : t('seasonNote')}</p>
          </div>
          {data.items.length ? (
            <div className="grid gap-x-7 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((villa, i) => <VillaCard key={villa.id} villa={villa} delay={(i % 3) * 90} />)}
            </div>
          ) : (
            <div className="rounded-2xl bg-sand/50 px-6 py-20 text-center">
              <h2 className="font-display text-3xl font-light">{data.total ? t('emptyPage') : t('empty')}</h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted">{data.total ? t('emptyPageHelp') : t('emptyHelp')}</p>
              <Link href={data.total ? pageHref(1) : '/villalar'} className="mt-7 inline-block rounded-full bg-ink px-6 py-3.5 text-sm text-canvas transition-[background-color,transform] hover:bg-olive active:scale-[0.96]">{data.total ? t('firstPage') : t('all')}</Link>
            </div>
          )}

          {pages > 1 && data.page <= pages && (
            <nav aria-label={t('pagesLabel')} className="mt-14 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-8">
              {data.page > 1 && <Link href={pageHref(data.page - 1)} className="px-3 py-3 text-sm hover:text-olive" rel="prev">← {t('previous')}</Link>}
              {pageNumbers.map((p, i) => (
                <span key={p} className="flex items-center gap-2">
                  {i > 0 && p - pageNumbers[i - 1] > 1 && <span className="px-2 text-muted">…</span>}
                  <Link href={pageHref(p)} aria-label={`${p}. sayfa`} aria-current={p === data.page ? 'page' : undefined} className={`flex h-11 min-w-11 items-center justify-center rounded-full text-sm ${p === data.page ? 'bg-ink text-canvas' : 'border border-line hover:border-olive'}`}>{p}</Link>
                </span>
              ))}
              {data.page < pages && <Link href={pageHref(data.page + 1)} className="px-3 py-3 text-sm hover:text-olive" rel="next">{t('next')} →</Link>}
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
