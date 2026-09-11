import assert from 'node:assert/strict';
import { isAllowedMutationOrigin } from '../src/security/csrf-origin';

const allowed = ['https://villa.example'];
assert.equal(isAllowedMutationOrigin('GET', 'https://evil.example', allowed), true);
assert.equal(isAllowedMutationOrigin('POST', undefined, allowed), true);
assert.equal(isAllowedMutationOrigin('POST', 'https://villa.example', allowed), true);
assert.equal(isAllowedMutationOrigin('POST', 'https://evil.example', allowed), false);

console.log('csrf-origin security tests passed');
