import assert from 'node:assert/strict';
import { parseCalendarDate, parseStayDates, quoteStay } from '../src/villas/availability';
import { prepaymentFor, paymentReference, readPaymentSettings } from '../src/bookings/payment';

const date = parseCalendarDate;
const villa = {
  currency: 'TRY',
  pricePerNight: 10_000,
  cleaningFee: 2_500,
  cleaningFeeThresholdNights: 4,
  depositAmount: 5_000,
  priceRules: [{ startDate: date('2026-07-01'), endDate: date('2026-07-05'), pricePerNight: 18_000 }],
};

// Sezon kuralı yalnızca kapsadığı geceleri fiyatlar; bitiş günü hariçtir.
const summer = quoteStay(villa, parseStayDates('2026-07-03', '2026-07-07'));
assert.deepEqual(
  summer.priceSnapshot.nights.map((night) => night.amount),
  [18_000, 18_000, 10_000, 10_000],
);
assert.equal(summer.accommodationAmount, 56_000);
// 4 gece eşiğin altında değil — temizlik ücreti uygulanmaz.
assert.equal(summer.cleaningFeeAmount, 0);
assert.equal(summer.totalAmount, 56_000);

const short = quoteStay(villa, parseStayDates('2026-09-10', '2026-09-12'));
assert.equal(short.accommodationAmount, 20_000);
assert.equal(short.cleaningFeeAmount, 2_500);
assert.equal(short.totalAmount, 22_500);

// Ayarlar okunurken IBAN boşluksuz/büyük harfe çekilir, aralık dışı değerler kırpılır.
const settings = readPaymentSettings({ iban: 'tr12 3456 7890', depositRate: 250, deadlineHours: 0 });
assert.equal(settings.iban, 'TR1234567890');
assert.equal(settings.depositRate, 100);
assert.equal(settings.deadlineHours, 1);

const rateOnly = readPaymentSettings({ depositRate: 30 });
assert.equal(prepaymentFor(22_500, rateOnly), 6_750);

// Sabit tutar oranı ezer; toplamı asla aşmaz.
const fixed = readPaymentSettings({ depositRate: 30, depositFixedAmount: 5_000 });
assert.equal(prepaymentFor(22_500, fixed), 5_000);
assert.equal(prepaymentFor(3_000, fixed), 3_000);
assert.equal(prepaymentFor(0, fixed), 0);

assert.equal(paymentReference('ckabcdef123456'), 'MV-123456');

console.log('payment-unit: ok');
