/**
 * Kapora ve havale bilgisi `Setting` tablosundaki `payments` anahtarında tutulur.
 * POS yok: misafir kaporayı adminin girdiği IBAN'a gönderir, admin dekontu görünce
 * rezervasyonu onaylar.
 *
 * Bu ayarlar HALKA AÇIK UÇTAN SERVİS EDİLMEZ (bkz. settings.controller PUBLIC_KEYS);
 * IBAN yalnızca kendi rezervasyonunu görüntüleyen misafire döner.
 */
export type PaymentSettings = {
  accountHolder: string;
  iban: string;
  bankName: string;
  /** Toplam tutarın yüzdesi. `depositFixedAmount` doluysa kullanılmaz. */
  depositRate: number;
  /** 0'dan büyükse oran yerine bu sabit tutar istenir. */
  depositFixedAmount: number;
  /** Havale bildirimi sonrası bekletmenin uzatılacağı süre. */
  deadlineHours: number;
  note: string;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  accountHolder: '',
  iban: '',
  bankName: '',
  depositRate: 30,
  depositFixedAmount: 0,
  deadlineHours: 24,
  note: '',
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function readPaymentSettings(raw: Record<string, any> | null | undefined): PaymentSettings {
  const source = raw ?? {};
  return {
    accountHolder: str(source.accountHolder),
    iban: str(source.iban).replace(/\s+/g, '').toUpperCase(),
    bankName: str(source.bankName),
    depositRate: num(source.depositRate, DEFAULT_PAYMENT_SETTINGS.depositRate, 0, 100),
    depositFixedAmount: Math.round(num(source.depositFixedAmount, 0, 0, 10_000_000)),
    deadlineHours: Math.round(num(source.deadlineHours, DEFAULT_PAYMENT_SETTINGS.deadlineHours, 1, 168)),
    note: str(source.note),
  };
}

/**
 * Rezervasyonu bağlamak için şimdi istenecek tutar. Toplamı asla aşmaz.
 * Kapora = platformun tüm komisyonu; kalan tutar misafir ile ev sahibi arasında
 * platform dışında kapanır. Öncelik: sabit tutar (>0) > villa bazlı oran > genel oran.
 */
export function prepaymentFor(totalAmount: number, settings: PaymentSettings, villaCommissionRate?: number | null): number {
  const rate = villaCommissionRate != null ? Math.min(Math.max(villaCommissionRate, 0), 100) : settings.depositRate;
  const requested = settings.depositFixedAmount > 0
    ? settings.depositFixedAmount
    : Math.round((totalAmount * rate) / 100);
  return Math.min(Math.max(requested, 0), Math.max(totalAmount, 0));
}

/** Havale açıklamasına yazılacak, misafire gösterilen kısa referans. */
export const paymentReference = (bookingId: string) => `MV-${bookingId.slice(-6).toUpperCase()}`;

/**
 * Misafir iletişim bilgisi (ad/e‑posta/telefon) host'a ancak rezervasyon
 * CONFIRMED olunca açılır — kapora ödenmeden host misafire platform dışından
 * ulaşıp komisyonu atlayamasın diye. Admin (hostId yok) her zaman görür.
 */
export const revealGuestContact = (hostId: string | undefined, status: string) => !hostId || status === 'CONFIRMED';
