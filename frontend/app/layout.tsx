import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import Reveal from '@/components/site/Reveal';
import { getSetting } from '@/lib/api';
import { normalizeBranding } from '@/lib/branding';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const [brandingValue, locale] = await Promise.all([getSetting('branding'), getLocale()]);
  const branding = normalizeBranding(brandingValue);
  return {
    title: {
      default: branding.companyName,
      template: `%s · ${branding.shortName}`,
    },
    applicationName: branding.companyName,
    description: locale === 'en'
      ? 'Personally inspected rental villas with private pools.'
      : 'Bizzat gezilmiş, özel havuzlu kiralık villalar.',
    icons: branding.favicon
      ? {
          icon: [{ url: branding.favicon }],
          shortcut: branding.favicon,
          apple: branding.favicon,
        }
      : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Reveal />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
