'use client';

import { useTranslations } from 'next-intl';

export default function VillaListingError({ reset }: { reset: () => void }) {
  const t = useTranslations('Villas');
  return (
    <div role="alert" className="mx-auto max-w-3xl px-6 pt-40 pb-24 text-center">
      <h1 className="font-display text-3xl">{t('loadError')}</h1>
      <p className="mt-4 text-muted">{t('tryLater')}</p>
      <button onClick={reset} className="mt-6 rounded-full bg-ink px-6 py-3 text-canvas transition-[background-color,transform] hover:bg-olive active:scale-[0.96]">{t('retry')}</button>
    </div>
  );
}
