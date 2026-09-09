import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatPrice, getVillaBySlug, getVillaReviews } from '@/lib/api';
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const villa = await getVillaBySlug(slug);
  if (!villa) return {};
  return {
    title: `${villa.title} · ${villa.region.name}`,
    description: villa.summary ?? undefined,
  };
}

export default async function VillaDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [villa, reviews] = await Promise.all([getVillaBySlug(slug), getVillaReviews(slug)]);
  if (!villa) notFound();

  const orderedImages = (() => {
    const cover = villa.images.find((i) => i.isCover) ?? villa.images[0];
    if (!cover) return villa.images;
    return [cover, ...villa.images.filter((i) => i.id !== cover.id)];
  })();

  const included: string[] = [];
  const excluded: string[] = [];
  (villa.utilitiesIncluded ? included : excluded).push('Elektrik ve su');
  (villa.gasIncluded ? included : excluded).push('Tüpgaz');
  if (villa.poolType !== 'NONE' && villa.poolHeated) {
    (villa.poolHeatingIncluded ? included : excluded).push('Havuz ısıtması');
  }

  const distanceBadges: string[] = [];
  if (villa.beachDistanceM) distanceBadges.push(`Plaja yaklaşık ${villa.beachDistanceM} m`);
  if (villa.nearCenter) distanceBadges.push('Merkeze yakın (~3 km çevresinde)');
  if (villa.viewTags.length) {
    distanceBadges.push(...villa.viewTags.map((t) => VIEW_TAGS.find((v) => v.value === t)?.label ?? t));
  }

  const priceLabel =
    villa.priceRange.min === villa.priceRange.max
      ? formatPrice(villa.priceRange.min, villa.currency)
      : `${formatPrice(villa.priceRange.min, villa.currency)} – ${formatPrice(villa.priceRange.max, villa.currency)}`;

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
              {BUILDING_TYPE_LABEL[villa.buildingType]} · {villa.bedrooms} yatak odası · {villa.bathrooms} banyo ·{' '}
              {villa.maxAdults + villa.maxChildren} kişi
            </p>
          </div>
          {/* Fiyat başlığın hemen yanında: sayfanın altına inmeden görünür. */}
          <div className="shrink-0 text-right">
            <p className="font-display text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-none text-ink tabular-nums">{priceLabel}</p>
            <p className="mt-1.5 text-[0.8rem] text-muted">gecelik · sezona göre değişir</p>
            {villa.rating > 0 && (
              <p className="mt-2 text-[0.85rem] text-ink">
                ★ {villa.rating.toFixed(1)} <span className="text-muted">· {villa.reviewCount} yorum</span>
              </p>
            )}
          </div>
        </div>
        {villa.summary && <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-muted">{villa.summary}</p>}
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
          <Section title="Kapasite ve Odalar">
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              <Stat label="Yetişkin" value={villa.maxAdults} />
              <Stat label="Çocuk" value={villa.maxChildren} />
              <Stat label="Bebek" value={villa.maxInfants} />
              <Stat label="Yatak odası" value={villa.bedrooms} />
              <Stat label="Banyo" value={villa.bathrooms} />
            </div>
            {villa.rooms.length > 0 && (
              <div className="mt-6 space-y-2.5">
                {villa.rooms.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
                    <span className="text-[0.9rem] text-ink">
                      {i + 1}. Yatak Odası · {BED_TYPE_LABEL[r.bedType]} × {r.bedCount}
                    </span>
                    <span className="flex gap-2 text-[0.8rem] text-muted">
                      {r.hasEnsuite && <span>Ebeveyn banyosu</span>}
                      {r.hasJacuzzi && <span>Jakuzi</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Konsept ve Nitelikler">
            <div className="flex flex-wrap gap-2">
              {villa.poolType !== 'NONE' && (
                <Chip>
                  {POOL_TYPE_LABEL[villa.poolType]}
                  {villa.poolSecluded ? ' · Korunaklı' : ''}
                  {villa.poolHeated ? ' · Isıtmalı' : ''}
                </Chip>
              )}
              {villa.wifiMbps && <Chip>Wi‑Fi {villa.wifiMbps} Mbps</Chip>}
              {distanceBadges.map((b) => (
                <Chip key={b}>{b}</Chip>
              ))}
              {villa.amenities.map((a) => (
                <Chip key={a}>{a}</Chip>
              ))}
            </div>
            {villa.videoUrl && (
              <a
                href={villa.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-[0.9rem] text-ink underline underline-offset-4 hover:text-gold"
              >
                Video turu izleyin ↗
              </a>
            )}
          </Section>

          {(included.length > 0 || excluded.length > 0) && (
            <Section title="Fiyata Dahil Olanlar">
              <ul className="space-y-1.5 text-[0.9rem] text-ink">
                {included.map((i) => (
                  <li key={i}>✓ {i}</li>
                ))}
              </ul>
              {excluded.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[0.9rem] text-muted">
                  {excluded.map((i) => (
                    <li key={i}>✕ {i} (hariç)</li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section title="Kurallar">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-[0.9rem]">
              <Rule label="Evcil hayvan" value={PET_POLICY_LABEL[villa.petPolicy]} />
              <Rule label="Giriş saati" value={villa.checkInTime} />
              <Rule label="Çıkış saati" value={villa.checkOutTime} />
              {villa.checkInWeekday !== null && villa.checkInWeekday !== undefined && (
                <Rule label="Giriş günü" value={`Yalnızca ${WEEKDAYS[villa.checkInWeekday]}`} />
              )}
              <Rule label="Parti / etkinlik" value={villa.eventsAllowed ? 'İzin var' : 'İzin yok'} />
              <Rule label="Sigara (kapalı alan)" value={villa.smokingAllowed ? 'İzin var' : 'İzin yok'} />
              {villa.familiesOnly && <Rule label="Grup kısıtı" value="Yalnızca ailelere uygun" />}
              {!villa.allowSingleMaleGroups && <Rule label="" value="Bekar erkek gruplarına kiralanmaz" />}
              {!villa.allowYoungGroups && <Rule label="" value="Genç arkadaş gruplarına uygun değil" />}
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
