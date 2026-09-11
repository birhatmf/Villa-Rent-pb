import assert from 'node:assert/strict';
import { JWT_AUDIENCE, JWT_ISSUER, jwtOptions } from '../src/auth/auth.module';

assert.throws(() => jwtOptions(), /en az 32 byte/);
assert.throws(() => jwtOptions('dev-secret-degistir'), /en az 32 byte/);
assert.throws(() => jwtOptions('x'.repeat(31)), /en az 32 byte/);

const options = jwtOptions('x'.repeat(32));
assert.equal(options.secret, 'x'.repeat(32));
assert.equal(options.signOptions?.algorithm, 'HS256');
assert.equal(options.signOptions?.issuer, JWT_ISSUER);
assert.equal(options.signOptions?.audience, JWT_AUDIENCE);
assert.deepEqual(options.verifyOptions?.algorithms, ['HS256']);
assert.equal(options.verifyOptions?.issuer, JWT_ISSUER);
assert.equal(options.verifyOptions?.audience, JWT_AUDIENCE);

console.log('jwt-config-security: required secret and pinned JWT policy passed');
