import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { assertPrimaryAdminMutable } from '../src/admin/users.service';

assert.doesNotThrow(() => assertPrimaryAdminMutable(false, { active: false }));
assert.throws(() => assertPrimaryAdminMutable(true, { active: false }), BadRequestException);
assert.throws(() => assertPrimaryAdminMutable(true, { role: 'GUEST' }), BadRequestException);

console.log('primary-admin security tests passed');
