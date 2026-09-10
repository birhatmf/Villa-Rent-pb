import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import TaxonomyDetail from '@/components/site/TaxonomyDetail';
import { getConceptBySlug, listVillas } from '@/lib/api';

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const [concept, t] = await Promise.all([getConceptBySlug(slug), getTranslations({ locale, namespace: 'Taxonomy' })]);
  if (!concept) return {};
  return {
    title: concept.name,
    description: t('conceptDetailDescription', { name: concept.name }),
    alternates: { languages: { tr: `/konseptler/${slug}`, en: `/en/konseptler/${slug}` } },
  };
}

export default async function ConceptPage({ params }: Props) {
  const { slug } = await params;
  const [concept, listing] = await Promise.all([getConceptBySlug(slug), listVillas({ konsept: slug })]);
  if (!concept) notFound();
  return <TaxonomyDetail kind="concept" item={concept} listing={listing} />;
}
