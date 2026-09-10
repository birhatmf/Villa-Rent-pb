import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import TaxonomyDetail from '@/components/site/TaxonomyDetail';
import { getRegionBySlug, listVillas } from '@/lib/api';

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const [region, t] = await Promise.all([getRegionBySlug(slug), getTranslations({ locale, namespace: 'Taxonomy' })]);
  if (!region) return {};
  return {
    title: t('regionDetailTitle', { name: region.name }),
    description: t('regionDetailDescription', { name: region.name }),
    alternates: { languages: { tr: `/bolgeler/${slug}`, en: `/en/bolgeler/${slug}` } },
  };
}

export default async function RegionPage({ params }: Props) {
  const { slug } = await params;
  const [region, listing] = await Promise.all([getRegionBySlug(slug), listVillas({ bolge: slug })]);
  if (!region) notFound();
  return <TaxonomyDetail kind="region" item={region} listing={listing} />;
}
