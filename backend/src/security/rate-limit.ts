import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const GLOBAL_RATE_LIMIT = { ttl: 60_000, limit: 120 } as const;
export const LOGIN_ACCOUNT_RATE_LIMIT = { ttl: 15 * 60_000, limit: 20 } as const;

export function isLoginRequest(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest<Request>();
  const path = request.originalUrl?.split('?')[0] ?? request.path;
  return request.method === 'POST' && (path === '/api/auth/login' || path === '/api/auth/register');
}

/** Limits password guesses for one account even when the source IP changes. */
export function loginAccountTracker(request: Request) {
  const rawEmail = typeof request.body?.email === 'string' ? request.body.email : '';
  const identity = rawEmail.trim().toLowerCase() || `missing-email:${request.ip ?? 'unknown'}`;
  return createHash('sha256').update(identity).digest('hex');
}
