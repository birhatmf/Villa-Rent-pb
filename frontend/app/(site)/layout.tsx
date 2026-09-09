import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import WhatsAppButton from '@/components/site/WhatsAppButton';
import { getSetting } from '@/lib/api';
import { normalizeBranding } from '@/lib/branding';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [footer, brandingValue] = await Promise.all([getSetting('footer'), getSetting('branding')]);
  const branding = normalizeBranding(brandingValue);

  return (
    <>
      <Header branding={branding} />
      <main>{children}</main>
      <Footer content={footer} branding={branding} />
      <WhatsAppButton config={footer.whatsapp} />
    </>
  );
}
