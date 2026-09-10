import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import TaxonomyIndex from '@/components/site/TaxonomyIndex';
import { listRegions } from '@/lib/api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Taxonomy' });
  return {
    title: t('regionMetaTitle'),
    description: t('regionMetaDescription'),
    alternates: { languages: { tr: '/bolgeler', en: '/en/bolgeler' } },
  };
}

export default async function RegionsPage() {
  return <TaxonomyIndex kind="region" items={await listRegions()} />;
}
