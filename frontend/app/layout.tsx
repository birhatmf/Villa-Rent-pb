import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
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
  const branding = normalizeBranding(await getSetting('branding'));
  return {
    title: {
      default: branding.companyName,
      template: `%s · ${branding.shortName}`,
    },
    applicationName: branding.companyName,
    description: 'Bizzat gezilmiş, özel havuzlu kiralık villalar.',
    icons: branding.favicon
      ? {
          icon: [{ url: branding.favicon }],
          shortcut: branding.favicon,
          apple: branding.favicon,
        }
      : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        {children}
        <Reveal />
      </body>
    </html>
  );
}
