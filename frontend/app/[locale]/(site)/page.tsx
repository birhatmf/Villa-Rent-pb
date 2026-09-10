import type { Metadata } from 'next';
import { renderSections } from '@/components/blocks';
import { getPage } from '@/lib/api';
import { translateDefaultText } from '@/lib/localization';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const { seo, title } = await getPage('home');
  return {
    title: translateDefaultText(seo.title ?? title, locale),
    description: seo.description ? translateDefaultText(seo.description, locale) : undefined,
    alternates: { languages: { tr: '/', en: '/en' } },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const page = await getPage('home');
  return <>{renderSections(page.sections, locale)}</>;
}
