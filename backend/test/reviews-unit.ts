import assert from 'node:assert/strict';
import { reviewCheckOutAt, reviewEligibility } from '../src/reviews/eligibility';

const booking = {
  status: 'CONFIRMED',
  paymentStatus: 'PAID',
  checkOut: new Date('2026-10-25T00:00:00.000Z'),
  villa: { timezone: 'Europe/Berlin', checkOutTime: '10:00' },
};

// Avrupa yaz saati değişim gününde 10:00 Berlin = 09:00 UTC.
assert.equal(reviewCheckOutAt(booking.checkOut, '10:00', 'Europe/Berlin').toISOString(), '2026-10-25T09:00:00.000Z');
assert.equal(reviewEligibility(booking, new Date('2026-10-25T08:59:59.000Z')), 'TOO_EARLY');
assert.equal(reviewEligibility(booking, new Date('2026-10-25T09:00:00.000Z')), 'ELIGIBLE');
assert.equal(reviewEligibility({ ...booking, paymentStatus: 'DECLARED' }, new Date('2026-10-25T10:00:00.000Z')), 'NOT_PAID');
assert.equal(reviewEligibility({ ...booking, status: 'CANCELLED' }, new Date('2026-10-25T10:00:00.000Z')), 'NOT_CONFIRMED');
assert.equal(reviewEligibility(booking, new Date('2026-11-24T09:00:00.001Z')), 'TOO_LATE');

console.log('review eligibility tests passed');
