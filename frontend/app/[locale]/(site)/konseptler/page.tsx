import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import TaxonomyIndex from '@/components/site/TaxonomyIndex';
import { listConcepts } from '@/lib/api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Taxonomy' });
  return {
    title: t('conceptMetaTitle'),
    description: t('conceptMetaDescription'),
    alternates: { languages: { tr: '/konseptler', en: '/en/konseptler' } },
  };
}

export default async function ConceptsPage() {
  return <TaxonomyIndex kind="concept" items={await listConcepts()} />;
}
