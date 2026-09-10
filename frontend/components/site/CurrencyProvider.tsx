'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  EMPTY_RATES,
  convertMoney,
  type DisplayCurrency,
  type ExchangeRates,
} from '@/lib/currency';

type CurrencyContextValue = {
  currency: DisplayCurrency;
  rates: ExchangeRates;
  setCurrency: (currency: DisplayCurrency) => void;
  formatPrice: (amount: number, sourceCurrency?: string) => string;
  formatCompactPrice: (amount: number, sourceCurrency?: string) => string;
};

const fallbackFormat = (amount: number, currency = 'TRY') =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'TRY',
  rates: EMPTY_RATES,
  setCurrency: () => {},
  formatPrice: fallbackFormat,
  formatCompactPrice: fallbackFormat,
});

export default function CurrencyProvider({
  children,
  initialCurrency,
  rates,
  locale,
}: {
  children: React.ReactNode;
  initialCurrency: DisplayCurrency;
  rates: ExchangeRates;
  locale: string;
}) {
  const [currency, setValue] = useState(initialCurrency);

  const value = useMemo<CurrencyContextValue>(() => ({
    currency,
    rates,
    setCurrency(next) {
      document.cookie = `mv_currency=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      setValue(next);
    },
    formatPrice(amount, sourceCurrency = 'TRY') {
      const converted = convertMoney(amount, sourceCurrency, currency, rates);
      const actualCurrency = converted === null ? sourceCurrency : currency;
      const actualAmount = converted === null ? amount : converted;
      const formatted = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
        style: 'currency',
        currency: actualCurrency,
        maximumFractionDigits: 0,
      }).format(actualAmount);
      return actualCurrency === sourceCurrency ? formatted : `≈ ${formatted}`;
    },
    formatCompactPrice(amount, sourceCurrency = 'TRY') {
      const converted = convertMoney(amount, sourceCurrency, currency, rates);
      const actualAmount = converted === null ? amount : converted;
      const actualCurrency = converted === null ? sourceCurrency : currency;
      const formatted = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
        style: 'currency',
        currency: actualCurrency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(actualAmount);
      return actualCurrency === sourceCurrency ? formatted : `≈ ${formatted}`;
    },
  }), [currency, locale, rates]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function MoneyRange({ min, max, currency }: { min: number; max: number; currency: string }) {
  const { formatPrice } = useCurrency();
  return <>{min === max ? formatPrice(min, currency) : `${formatPrice(min, currency)} – ${formatPrice(max, currency)}`}</>;
}

export function CurrencyNotice({ sourceCurrency, className = '' }: { sourceCurrency: string; className?: string }) {
  const { currency, rates } = useCurrency();
  const t = useTranslations('Common');
  if (currency === sourceCurrency || !rates.rates[currency] || !rates.rates[sourceCurrency]) return null;
  return <p className={className}>{t('approximate')} · {t('chargedIn', { currency: sourceCurrency })}</p>;
}
