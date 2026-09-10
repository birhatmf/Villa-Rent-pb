import Image from 'next/image';
import { useTranslations } from 'next-intl';

/** 7464 sayılı Kanun kapsamında zorunlu izin belgesi ibaresi — villa detay sayfasının en altında. */
export default function MinistryBadge({ permitNumber }: { permitNumber: string | null }) {
  const t = useTranslations('Ministry');
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-sand/30 px-5 py-4">
      <div className="relative h-11 w-11 shrink-0">
        <Image src="/bakanlik-logo.webp" alt={t('name')} fill className="object-contain" />
      </div>
      <div>
        <p className="text-[0.85rem] text-ink">{t('name')}</p>
        {permitNumber ? (
          <p className="mt-0.5 text-[0.8rem] text-muted">{t('permit', { number: permitNumber })}</p>
        ) : (
          <p className="mt-0.5 text-[0.8rem] text-muted">{t('pending')}</p>
        )}
      </div>
    </div>
  );
}
