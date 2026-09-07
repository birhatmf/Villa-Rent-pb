import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { maxIcalBytes } from './ical-parser';

export class IcalFetchError extends Error {
  constructor(public code: string, message = 'iCal kaynağı indirilemedi.', public httpStatus?: number) {
    super(message);
  }
}

export type IcalDownload =
  | { notModified: true; status: 304; etag?: string; lastModified?: string }
  | { notModified: false; status: number; text: string; etag?: string; lastModified?: string; finalUrl: string };

export function normalizeIcalUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new IcalFetchError('ICAL_URL_INVALID', 'Geçerli bir iCal adresi girin.');
  }
  if (url.protocol !== 'https:') throw new IcalFetchError('ICAL_URL_HTTPS_REQUIRED', 'iCal adresi HTTPS olmalı.');
  if (url.username || url.password) throw new IcalFetchError('ICAL_URL_CREDENTIALS', 'Adres içinde kullanıcı adı veya parola kullanılamaz.');
  url.hash = '';
  return url.toString();
}

export async function downloadIcal(
  rawUrl: string,
  conditional: { etag?: string | null; lastModified?: string | null } = {},
): Promise<IcalDownload> {
  let current = new URL(normalizeIcalUrl(rawUrl));
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const addresses = await safeAddresses(current.hostname);
    const response = await requestOnce(current, addresses[0], conditional);
    if (response.status >= 300 && response.status < 400) {
      const location = response.location;
      if (!location || redirect === 3) throw new IcalFetchError('ICAL_REDIRECT_INVALID');
      current = new URL(normalizeIcalUrl(new URL(location, current).toString()));
      continue;
    }
    if (response.status === 304) {
      return { notModified: true, status: 304, etag: response.etag, lastModified: response.lastModified };
    }
    if (response.status < 200 || response.status >= 300) {
      throw new IcalFetchError('ICAL_HTTP_ERROR', `iCal kaynağı HTTP ${response.status} döndürdü.`, response.status);
    }
    return {
      notModified: false,
      status: response.status,
      text: response.body,
      etag: response.etag,
      lastModified: response.lastModified,
      finalUrl: current.toString(),
    };
  }
  throw new IcalFetchError('ICAL_REDIRECT_INVALID');
}

async function safeAddresses(hostname: string) {
  const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    throw new IcalFetchError('ICAL_URL_PRIVATE_HOST', 'Yerel ağ adresleri kullanılamaz.');
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new IcalFetchError('ICAL_DNS_ERROR');
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new IcalFetchError('ICAL_URL_PRIVATE_HOST', 'Yerel ağ adresleri kullanılamaz.');
  }
  return addresses;
}

function requestOnce(
  url: URL,
  target: { address: string; family: number },
  conditional: { etag?: string | null; lastModified?: string | null },
) {
  return new Promise<{
    status: number;
    body: string;
    location?: string;
    etag?: string;
    lastModified?: string;
  }>((resolve, reject) => {
    const headers: Record<string, string> = { Accept: 'text/calendar, text/plain;q=0.9', 'User-Agent': 'MyVilla-iCal/1.0' };
    if (conditional.etag) headers['If-None-Match'] = conditional.etag;
    if (conditional.lastModified) headers['If-Modified-Since'] = conditional.lastModified;
    const req = request(url, {
      method: 'GET',
      headers,
      lookup: ((_host: string, _options: unknown, callback: (error: null, address: string, family: number) => void) =>
        callback(null, target.address, target.family)) as any,
    });
    req.setTimeout(10_000, () => req.destroy(new IcalFetchError('ICAL_TIMEOUT')));
    req.on('error', (error) => reject(error instanceof IcalFetchError ? error : new IcalFetchError('ICAL_NETWORK_ERROR')));
    req.on('response', async (response) => {
      const status = response.statusCode ?? 0;
      const contentLength = Number(response.headers['content-length'] ?? 0);
      if (contentLength > maxIcalBytes()) {
        response.destroy();
        reject(new IcalFetchError('ICAL_TOO_LARGE'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const raw of response) {
          const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          size += chunk.length;
          if (size > maxIcalBytes()) throw new IcalFetchError('ICAL_TOO_LARGE');
          chunks.push(chunk);
        }
        resolve({
          status,
          body: Buffer.concat(chunks).toString('utf8'),
          location: firstHeader(response.headers.location),
          etag: firstHeader(response.headers.etag),
          lastModified: firstHeader(response.headers['last-modified']),
        });
      } catch (error) {
        response.destroy();
        reject(error instanceof IcalFetchError ? error : new IcalFetchError('ICAL_NETWORK_ERROR'));
      }
    });
    req.end();
  });
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isPrivateAddress(raw: string) {
  const mapped = raw.toLowerCase().startsWith('::ffff:') ? raw.slice(7) : raw;
  if (isIP(mapped) === 4) {
    const [a, b] = mapped.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const value = raw.toLowerCase();
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
    /^fe[89ab]/.test(value) || value.startsWith('ff');
}
