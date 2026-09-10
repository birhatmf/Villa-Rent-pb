import { Injectable } from '@nestjs/common';
import { SettingsService } from './settings.service';

const SETTING_KEY = 'exchangeRates';
const SOURCE_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 15 * 60 * 1000;
const SUPPORTED = new Set(['EUR', 'TRY', 'USD', 'GBP']);

export type ExchangeRates = {
  base: 'EUR';
  rates: Record<string, number>;
  asOf: string | null;
  fetchedAt: string | null;
  source: 'ECB';
};

const EMPTY: ExchangeRates = {
  base: 'EUR',
  rates: { EUR: 1 },
  asOf: null,
  fetchedAt: null,
  source: 'ECB',
};

@Injectable()
export class ExchangeRatesService {
  private refreshPromise: Promise<ExchangeRates> | null = null;
  private lastAttemptAt = 0;

  constructor(private settings: SettingsService) {}

  async get(): Promise<ExchangeRates> {
    const saved = this.normalize(await this.settings.get(SETTING_KEY));
    if (saved.fetchedAt && Date.now() - Date.parse(saved.fetchedAt) < MAX_AGE_MS) return saved;
    if (Date.now() - this.lastAttemptAt < RETRY_AFTER_MS) return saved;

    this.lastAttemptAt = Date.now();
    this.refreshPromise ??= this.refresh().finally(() => {
      this.refreshPromise = null;
    });

    try {
      return await this.refreshPromise;
    } catch {
      return saved;
    }
  }

  private async refresh(): Promise<ExchangeRates> {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`ECB kur servisi ${response.status} döndürdü.`);
    const xml = await response.text();
    const asOf = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/i)?.[1];
    if (!asOf) throw new Error('ECB kur tarihi okunamadı.');

    const rates: Record<string, number> = { EUR: 1 };
    for (const match of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
      if (SUPPORTED.has(match[1])) rates[match[1]] = Number(match[2]);
    }
    if (!rates.TRY || !rates.USD || !rates.GBP) throw new Error('ECB yanıtında gerekli kurlar bulunamadı.');

    const value: ExchangeRates = {
      base: 'EUR',
      rates,
      asOf,
      fetchedAt: new Date().toISOString(),
      source: 'ECB',
    };
    await this.settings.set(SETTING_KEY, value);
    return value;
  }

  private normalize(value: Record<string, any>): ExchangeRates {
    const rates = Object.fromEntries(
      Object.entries(value.rates ?? {}).filter(
        ([currency, rate]) => SUPPORTED.has(currency) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0,
      ),
    );
    return {
      ...EMPTY,
      rates: { EUR: 1, ...rates },
      asOf: typeof value.asOf === 'string' ? value.asOf : null,
      fetchedAt: typeof value.fetchedAt === 'string' ? value.fetchedAt : null,
    };
  }
}
