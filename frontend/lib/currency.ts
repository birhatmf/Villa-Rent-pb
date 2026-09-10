export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type DisplayCurrency = (typeof CURRENCIES)[number];

export type ExchangeRates = {
  base: 'EUR';
  rates: Record<string, number>;
  asOf: string | null;
  fetchedAt: string | null;
  source: 'ECB';
};

export const EMPTY_RATES: ExchangeRates = {
  base: 'EUR',
  rates: { EUR: 1 },
  asOf: null,
  fetchedAt: null,
  source: 'ECB',
};

export function isDisplayCurrency(value?: string | null): value is DisplayCurrency {
  return CURRENCIES.includes(value as DisplayCurrency);
}

export function convertMoney(
  amount: number,
  source: string,
  target: DisplayCurrency,
  rates: ExchangeRates,
) {
  if (source === target) return amount;
  const sourceRate = rates.rates[source];
  const targetRate = rates.rates[target];
  if (!sourceRate || !targetRate) return null;
  return (amount / sourceRate) * targetRate;
}
