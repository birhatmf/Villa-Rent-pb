import assert from 'node:assert/strict';
import { MODERATED_VILLA_FIELDS, ownerEditNeedsReview } from '../src/villas/villas.service';

assert.equal(ownerEditNeedsReview('PUBLISHED', { title: 'Yeni başlık' }, true), true);
assert.equal(ownerEditNeedsReview('PUBLISHED', { rooms: [] }, true), true);
assert.equal(ownerEditNeedsReview('PUBLISHED', { pricePerNight: 12_000 }, true), false);
assert.equal(ownerEditNeedsReview('DRAFT', { title: 'Taslak' }, true), false);
assert.equal(ownerEditNeedsReview('PUBLISHED', { title: 'Admin düzeltmesi' }, false), false);
assert.ok(MODERATED_VILLA_FIELDS.includes('amenities'));
assert.ok(MODERATED_VILLA_FIELDS.includes('conceptIds'));

console.log('owner moderation security tests passed');
