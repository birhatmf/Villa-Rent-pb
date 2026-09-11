import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { assertBcryptPasswordLength } from '../src/auth/auth.service';

assert.doesNotThrow(() => assertBcryptPasswordLength('a'.repeat(72)));
assert.throws(() => assertBcryptPasswordLength('😀'.repeat(19)), BadRequestException);

console.log('password-length security tests passed');
