import assert from 'node:assert/strict';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  GLOBAL_RATE_LIMIT,
  isLoginRequest,
  LOGIN_ACCOUNT_RATE_LIMIT,
  loginAccountTracker,
} from '../src/security/rate-limit';

function context(request: Partial<Request>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

assert.equal(isLoginRequest(context({ method: 'POST', originalUrl: '/api/auth/login' })), true);
assert.equal(isLoginRequest(context({ method: 'GET', originalUrl: '/api/auth/login' })), false);
assert.equal(isLoginRequest(context({ method: 'POST', originalUrl: '/api/auth/register' })), true);

const first = loginAccountTracker({ body: { email: ' USER@example.com ' }, ip: '10.0.0.1' } as Request);
const second = loginAccountTracker({ body: { email: 'user@EXAMPLE.com' }, ip: '10.0.0.2' } as Request);
const other = loginAccountTracker({ body: { email: 'other@example.com' }, ip: '10.0.0.1' } as Request);

assert.equal(first, second, 'email normalization must prevent IP rotation from bypassing the account limit');
assert.notEqual(first, other, 'different accounts need independent login budgets');
assert.equal(GLOBAL_RATE_LIMIT.limit, 120);
assert.equal(LOGIN_ACCOUNT_RATE_LIMIT.limit, 20);

console.log('rate-limit security tests passed');
