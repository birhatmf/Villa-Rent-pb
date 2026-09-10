import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import WhatsAppButton from '@/components/site/WhatsAppButton';
import CurrencyProvider from '@/components/site/CurrencyProvider';
import { getExchangeRates, getSetting } from '@/lib/api';
import { normalizeBranding } from '@/lib/branding';
import { isDisplayCurrency, type DisplayCurrency } from '@/lib/currency';
import { localizeContent } from '@/lib/localization';
import { cookies, headers } from 'next/headers';

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, cookieStore, headerStore, footer, brandingValue, rates] = await Promise.all([
    params,
    cookies(),
    headers(),
    getSetting('footer'),
    getSetting('branding'),
    getExchangeRates(),
  ]);
  const branding = normalizeBranding(brandingValue);
  const localizedFooter = localizeContent(footer, locale);
  const savedCurrency = cookieStore.get('mv_currency')?.value;
  const acceptLanguage = headerStore.get('accept-language')?.toLowerCase() ?? '';
  const automaticCurrency: DisplayCurrency = locale === 'tr'
    ? 'TRY'
    : acceptLanguage.includes('en-gb')
      ? 'GBP'
      : acceptLanguage.includes('en-us')
        ? 'USD'
        : 'EUR';
  const initialCurrency = isDisplayCurrency(savedCurrency) ? savedCurrency : automaticCurrency;

  return (
    <CurrencyProvider initialCurrency={initialCurrency} rates={rates} locale={locale}>
      <Header branding={branding} />
      <main>{children}</main>
      <Footer content={localizedFooter} branding={branding} />
      <WhatsAppButton config={localizedFooter.whatsapp} />
    </CurrencyProvider>
  );
}
