import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

const logger = new Logger('Security');

/** PII içermeyen, log aggregator'ların JSON olarak işleyebileceği güvenlik olayı. */
export function securityEvent(event: string, fields: Record<string, string | number | boolean | undefined>) {
  const payload = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  logger.warn(JSON.stringify({ event, at: new Date().toISOString(), ...payload }));
}

export function hashSecurityIdentity(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}
