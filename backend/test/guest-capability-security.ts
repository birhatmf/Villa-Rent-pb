import assert from 'node:assert/strict';
import { isGuestCapabilityActive } from '../src/bookings/bookings.service';

assert.equal(isGuestCapabilityActive('REQUESTED'), true);
assert.equal(isGuestCapabilityActive('HOLD'), true);
assert.equal(isGuestCapabilityActive('CONFIRMED'), true);
assert.equal(isGuestCapabilityActive('CANCELLED'), false);
assert.equal(isGuestCapabilityActive('EXPIRED'), false);
assert.equal(isGuestCapabilityActive('DECLINED'), false);
assert.equal(isGuestCapabilityActive('WITHDRAWN'), false);

console.log('guest capability security tests passed');
