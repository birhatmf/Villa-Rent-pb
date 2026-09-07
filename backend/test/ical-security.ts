import assert from 'node:assert/strict';
import { downloadIcal, IcalFetchError, normalizeIcalUrl } from '../src/ical/ical-fetch';

assert.throws(
  () => normalizeIcalUrl('http://calendar.example.test/feed.ics'),
  (error: unknown) => error instanceof IcalFetchError && error.code === 'ICAL_URL_HTTPS_REQUIRED',
);
assert.throws(
  () => normalizeIcalUrl('https://user:secret@calendar.example.test/feed.ics'),
  (error: unknown) => error instanceof IcalFetchError && error.code === 'ICAL_URL_CREDENTIALS',
);
async function main() {
  await assert.rejects(
    downloadIcal('https://127.0.0.1/feed.ics'),
    (error: unknown) => error instanceof IcalFetchError && error.code === 'ICAL_URL_PRIVATE_HOST',
  );
  await assert.rejects(
    downloadIcal('https://[::1]/feed.ics'),
    (error: unknown) => error instanceof IcalFetchError && error.code === 'ICAL_URL_PRIVATE_HOST',
  );
  await assert.rejects(
    downloadIcal('https://[ff02::1]/feed.ics'),
    (error: unknown) => error instanceof IcalFetchError && error.code === 'ICAL_URL_PRIVATE_HOST',
  );
  console.log('ical-security: HTTPS, URL kimlik bilgisi ve özel IPv4/IPv6 hedef korumaları geçti');
}

void main();
