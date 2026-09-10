import type { Concept, Page, Region, VillaListResponse } from './types';
import type { VillaDetail } from './villaApi';
import { EMPTY_RATES, type ExchangeRates } from './currency';

const API = process.env.API_URL ?? 'http://localhost:4000/api';

async function fetchJson<T>(url: string, label: string): Promise<{ response: Response; data?: T }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { response };

    const text = await response.text();
    if (text.trim()) {
      try {
        return { response, data: JSON.parse(text) as T };
      } catch {
        if (attempt === 1) throw new Error(`${label}: sunucu geçersiz JSON döndürdü.`);
      }
    } else if (attempt === 1) {
      throw new Error(`${label}: sunucu boş yanıt döndürdü.`);
    }
  }

  throw new Error(`${label}: yanıt okunamadı.`);
}

export type VillaPublicDetail = Omit<
  VillaDetail,
  'commissionRate' | 'reviewNote' | 'reviewedAt' | 'hostId' | 'status' | 'blockedDates'
> & {
  blockedDates: { startDate: string; endDate: string }[];
};

export async function getPageBySlug(slug: string): Promise<Page | null> {
  // ponytail: no-store — admin inline editör gelene kadar tasarım iterasyonu için.
  // Yayına çıkarken revalidate + admin kaydında on-demand revalidate'e çevrilecek.
  const { response, data } = await fetchJson<Page>(
    `${API}/pages/${encodeURIComponent(slug)}`,
    `Sayfa yüklenemedi (${slug})`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Sayfa yüklenemedi (${slug}): ${response.status}`);
  return data!;
}

export async function getPage(slug: string): Promise<Page> {
  const page = await getPageBySlug(slug);
  if (!page) throw new Error(`Sayfa bulunamadı (${slug})`);
  return page;
}

export async function getVillaBySlug(slug: string): Promise<VillaPublicDetail | null> {
  const res = await fetch(`${API}/villas/${slug}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Villa yüklenemedi (${slug}): ${res.status}`);
  return res.json();
}

export type PublicReviewPage = {
  items: Array<{
    rating: number;
    body: string;
    guestName: string;
    verifiedStay: true;
    createdAt: string;
    villa: { title: string; slug: string };
    response: { body: string; createdAt: string; updatedAt: string } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  distribution: Array<{ rating: number; count: number }>;
};

export async function getVillaReviews(slug: string): Promise<PublicReviewPage> {
  const res = await fetch(`${API}/villas/${encodeURIComponent(slug)}/reviews?pageSize=6`, { cache: 'no-store' });
  if (!res.ok) return { items: [], total: 0, page: 1, pageSize: 6, distribution: [] };
  return res.json();
}

export type VillaListParams = {
  q?: string;
  bolge?: string;
  konsept?: string;
  guests?: number;
  adults?: number;
  children?: number;
  infants?: number;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
};

export class VillaListError extends Error {}

export async function listVillas(params: VillaListParams): Promise<VillaListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`${API}/villas?${qs}`, { cache: 'no-store' });
  if (res.status === 400) {
    const body = await res.json();
    throw new VillaListError(typeof body.message === 'string'
      ? body.message
      : 'Filtreleri kontrol edin. Misafir sayısı ve sayfa numarası geçerli bir tam sayı olmalı.');
  }
  if (!res.ok) throw new Error(`Villalar yüklenemedi: ${res.status}`);
  return res.json();
}

/** Tutarlar backend'de `quoteStay` ile hesaplanır — arayüzde para aritmetiği yapılmaz. */
export type StayQuote = {
  currency: string;
  nights: { date: string; amount: number }[];
  accommodationAmount: number;
  cleaningFeeAmount: number;
  /** Hasar depozitosu (girişte alınır) — kaporadan farklıdır. */
  depositAmount: number;
  totalAmount: number;
  /** Rezervasyonu bağlamak için şimdi havale edilecek kapora. */
  prepaymentAmount: number;
};

export type AvailabilityResult = {
  from: string;
  to: string;
  available: boolean;
  nights: number;
  minimumNights: number;
  bookingMode?: 'INSTANT' | 'REQUEST';
  reasons: Array<'SALES_PAUSED' | 'DATES_UNAVAILABLE' | 'MIN_STAY' | 'CHECKIN_DAY' | 'SYNC_UNHEALTHY' | 'CAPACITY_EXCEEDED'>;
  quote: StayQuote;
};

export async function getVillaAvailability(
  slug: string,
  params: { from: string; to: string; adults?: number; children?: number; infants?: number },
): Promise<AvailabilityResult> {
  const qs = new URLSearchParams(Object.entries(params).filter((entry) => entry[1] !== undefined).map(([key, value]) => [key, String(value)]));
  const res = await fetch(`${API}/villas/${encodeURIComponent(slug)}/availability?${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Müsaitlik kontrol edilemedi: ${res.status}`);
  return res.json();
}

export type VillaFilterOption = Pick<Region, 'id' | 'slug' | 'name'>;

export async function getVillaFilterOptions() {
  const [regions, concepts] = await Promise.all(['regions', 'concepts'].map(async (path) => {
    const res = await fetch(`${API}/${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Filtreler yüklenemedi: ${res.status}`);
    return res.json() as Promise<VillaFilterOption[]>;
  }));
  return { regions, concepts };
}

async function getTaxonomy<T>(path: 'regions' | 'concepts', slug?: string): Promise<T | null> {
  const label = path === 'regions' ? 'Bölgeler' : 'Konseptler';
  const { response, data } = await fetchJson<T>(
    `${API}/${path}${slug ? `/${encodeURIComponent(slug)}` : ''}`,
    `${label} yüklenemedi`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${label} yüklenemedi: ${response.status}`);
  return data!;
}

export const listRegions = () => getTaxonomy<Region[]>('regions') as Promise<Region[]>;
export const listConcepts = () => getTaxonomy<Concept[]>('concepts') as Promise<Concept[]>;
export const getRegionBySlug = (slug: string) => getTaxonomy<Region>('regions', slug);
export const getConceptBySlug = (slug: string) => getTaxonomy<Concept>('concepts', slug);

export async function getSetting(key: string): Promise<Record<string, any>> {
  try {
    const res = await fetch(`${API}/settings/${key}`, { cache: 'no-store' });
    // Ayar okunamazsa site çökmesin — bileşenler boş objeyle de render eder.
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export async function getExchangeRates(): Promise<ExchangeRates> {
  try {
    const res = await fetch(`${API}/exchange-rates`, { cache: 'no-store' });
    if (!res.ok) return EMPTY_RATES;
    return await res.json();
  } catch {
    return EMPTY_RATES;
  }
}

export const formatPrice = (value: number, currency = 'TRY') =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
