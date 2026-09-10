import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getVillaBySlug, getVillaReviews } from '@/lib/api';
import { MoneyRange } from '@/components/site/CurrencyProvider';
import MinistryBadge from '@/components/site/MinistryBadge';
import PhotoGallery from '@/components/site/PhotoGallery';
import PushWhatsAppUp from '@/components/site/PushWhatsAppUp';
import VillaBooking from '@/components/site/VillaBooking';
import VillaReviews from '@/components/site/VillaReviews';
import { Chip, Rule, Section, Stat } from '@/components/site/detailShared';
import {
  BED_TYPE_LABEL,
  BUILDING_TYPE_LABEL,
  PET_POLICY_LABEL,
  POOL_TYPE_LABEL,
  VIEW_TAGS,
  WEEKDAYS,
} from '@/lib/villaSchema';
import { translateDefaultText } from '@/lib/localization';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const villa = await getVillaBySlug(slug);
  if (!villa) return {};
  return {
    title: `${villa.title} · ${villa.region.name}`,
    description: villa.summary ?? undefined,
    alternates: { languages: { tr: `/villalar/${slug}`, en: `/en/villalar/${slug}` } },
  };
}

const EN_LABELS: Record<string, string> = {
  DETACHED: 'Detached villa', SEMI_DETACHED: 'Semi-detached villa', SITE: 'Villa in a residential complex', STONE_HOUSE: 'Stone house', BUNGALOW: 'Bungalow',
  NONE: 'No pool', PRIVATE: 'Private pool', SHARED: 'Shared pool', INFINITY: 'Infinity pool',
  NOT_ALLOWED: 'Not allowed', ALLOWED_FREE: 'Allowed (free)', ALLOWED_FEE: 'Allowed (additional fee)',
  DOUBLE: 'Double bed', TWIN: '2 single beds', SINGLE: 'Single bed', BUNK: 'Bunk bed', SOFA_BED: 'Sofa bed',
  sea: 'Sea view', nature: 'Nature view',
};
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function VillaDetailPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const [villa, reviews, t] = await Promise.all([
    getVillaBySlug(slug),
    getVillaReviews(slug),
    getTranslations({ locale, namespace: 'VillaDetail' }),
  ]);
  if (!villa) notFound();
  const label = (value: string, fallback: string) => locale === 'en' ? EN_LABELS[value] ?? fallback : fallback;

  const orderedImages = (() => {
    const cover = villa.images.find((i) => i.isCover) ?? villa.images[0];
    if (!cover) return villa.images;
    return [cover, ...villa.images.filter((i) => i.id !== cover.id)];
  })();

  const included: string[] = [];
  const excluded: string[] = [];
  (villa.utilitiesIncluded ? included : excluded).push(t('electricityWater'));
  (villa.gasIncluded ? included : excluded).push(t('bottledGas'));
  if (villa.poolType !== 'NONE' && villa.poolHeated) {
    (villa.poolHeatingIncluded ? included : excluded).push(t('poolHeating'));
  }

  const distanceBadges: string[] = [];
  if (villa.beachDistanceM) distanceBadges.push(t('beachDistance', { distance: villa.beachDistanceM }));
  if (villa.nearCenter) distanceBadges.push(t('nearCenter'));
  if (villa.viewTags.length) {
    distanceBadges.push(...villa.viewTags.map((tag) => label(tag, VIEW_TAGS.find((v) => v.value === tag)?.label ?? tag)));
  }

  return (
    <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-32 lg:pb-28">
      <PushWhatsAppUp />
      <div className="mx-auto max-w-5xl px-6 lg:px-10">
        <p className="eyebrow text-gold">
          {villa.region.name}
          {villa.district ? ` · ${villa.district}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] font-light leading-[1.08] tracking-[-0.02em] text-ink">
              {villa.title}
            </h1>
            <p className="mt-3 text-[0.95rem] text-muted">
              {label(villa.buildingType, BUILDING_TYPE_LABEL[villa.buildingType])} · {t('bedrooms', { count: villa.bedrooms })} · {t('bathrooms', { count: villa.bathrooms })} ·{' '}
              {t('guests', { count: villa.maxAdults + villa.maxChildren })}
            </p>
          </div>
          {/* Fiyat başlığın hemen yanında: sayfanın altına inmeden görünür. */}
          <div className="shrink-0 text-right">
            <p className="font-display text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-none text-ink tabular-nums">
              <MoneyRange min={villa.priceRange.min} max={villa.priceRange.max} currency={villa.currency} />
            </p>
            <p className="mt-1.5 text-[0.8rem] text-muted">{t('nightlySeasonal')}</p>
            {villa.rating > 0 && (
              <p className="mt-2 text-[0.85rem] text-ink">
                ★ {villa.rating.toFixed(1)} <span className="text-muted">· {t('reviews', { count: villa.reviewCount })}</span>
              </p>
            )}
          </div>
        </div>
        {villa.summary && <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-muted">{translateDefaultText(villa.summary, locale)}</p>}
      </div>

      <PhotoGallery villaId={villa.id} title={villa.title} images={orderedImages} />

      <div className="mx-auto mt-16 max-w-5xl px-6 lg:px-10">
        <VillaBooking
          villa={{
            slug: villa.slug,
            currency: villa.currency,
            pricePerNight: villa.pricePerNight,
            priceRange: villa.priceRange,
            priceRules: villa.priceRules,
            blockedDates: villa.blockedDates,
            minNights: villa.minNights,
            maxAdults: villa.maxAdults,
            maxChildren: villa.maxChildren,
            maxInfants: villa.maxInfants,
            cleaningFee: villa.cleaningFee,
            cleaningFeeThresholdNights: villa.cleaningFeeThresholdNights,
            depositAmount: villa.depositAmount,
            bookingMode: villa.bookingMode,
          }}
        >
          <Section title={t('capacityRooms')}>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              <Stat label={t('adult')} value={villa.maxAdults} />
              <Stat label={t('child')} value={villa.maxChildren} />
              <Stat label={t('infant')} value={villa.maxInfants} />
              <Stat label={t('bedroom')} value={villa.bedrooms} />
              <Stat label={t('bathroom')} value={villa.bathrooms} />
            </div>
            {villa.rooms.length > 0 && (
              <div className="mt-6 space-y-2.5">
                {villa.rooms.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
                    <span className="text-[0.9rem] text-ink">
                      {i + 1}. {t('bedroom')} · {label(r.bedType, BED_TYPE_LABEL[r.bedType])} × {r.bedCount}
                    </span>
                    <span className="flex gap-2 text-[0.8rem] text-muted">
                      {r.hasEnsuite && <span>{t('ensuite')}</span>}
                      {r.hasJacuzzi && <span>{t('jacuzzi')}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={t('features')}>
            <div className="flex flex-wrap gap-2">
              {villa.poolType !== 'NONE' && (
                <Chip>
                  {label(villa.poolType, POOL_TYPE_LABEL[villa.poolType])}
                  {villa.poolSecluded ? ` · ${t('secluded')}` : ''}
                  {villa.poolHeated ? ` · ${t('heated')}` : ''}
                </Chip>
              )}
              {villa.wifiMbps && <Chip>Wi‑Fi {villa.wifiMbps} Mbps</Chip>}
              {distanceBadges.map((b) => (
                <Chip key={b}>{b}</Chip>
              ))}
              {villa.amenities.map((a) => (
                <Chip key={a}>{translateDefaultText(a, locale)}</Chip>
              ))}
            </div>
            {villa.videoUrl && (
              <a
                href={villa.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-[0.9rem] text-ink underline underline-offset-4 hover:text-gold"
              >
                {t('videoTour')}
              </a>
            )}
          </Section>

          {(included.length > 0 || excluded.length > 0) && (
            <Section title={t('included')}>
              <ul className="space-y-1.5 text-[0.9rem] text-ink">
                {included.map((i) => (
                  <li key={i}>✓ {i}</li>
                ))}
              </ul>
              {excluded.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[0.9rem] text-muted">
                  {excluded.map((i) => (
                    <li key={i}>✕ {i} ({t('excluded')})</li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section title={t('rules')}>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-[0.9rem]">
              <Rule label={t('pets')} value={label(villa.petPolicy, PET_POLICY_LABEL[villa.petPolicy])} />
              <Rule label={t('checkInTime')} value={villa.checkInTime} />
              <Rule label={t('checkOutTime')} value={villa.checkOutTime} />
              {villa.checkInWeekday !== null && villa.checkInWeekday !== undefined && (
                <Rule label={t('checkInDay')} value={t('onlyDay', { day: locale === 'en' ? EN_WEEKDAYS[villa.checkInWeekday] : WEEKDAYS[villa.checkInWeekday] })} />
              )}
              <Rule label={t('events')} value={villa.eventsAllowed ? t('allowed') : t('notAllowed')} />
              <Rule label={t('smoking')} value={villa.smokingAllowed ? t('allowed') : t('notAllowed')} />
              {villa.familiesOnly && <Rule label={t('groupRule')} value={t('familiesOnly')} />}
              {!villa.allowSingleMaleGroups && <Rule label="" value={t('noSingleMaleGroups')} />}
              {!villa.allowYoungGroups && <Rule label="" value={t('noYoungGroups')} />}
            </dl>
            {villa.customRules.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-line pt-5 text-[0.9rem] text-ink-soft">
                {villa.customRules.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            )}
          </Section>
        </VillaBooking>

        <div className="mt-16">
          <MinistryBadge permitNumber={villa.permitNumber ?? null} />
        </div>
        <VillaReviews reviews={reviews} />
      </div>
    </div>
  );
}
