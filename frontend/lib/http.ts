'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Admin ve müşteri API sarmalayıcılarının ortak tabanı. */
export async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message) ? body.message[0] : body.message;
    // Süresi dolmuş, parola değişimiyle iptal edilmiş veya kapatılmış hesabın
    // okunabilir çerezini de temizle; middleware giriş sayfasında döngüye girmesin.
    if (res.status === 401 && path !== '/auth/logout') {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    }
    throw new ApiError(msg ?? `İstek başarısız (${res.status})`, res.status);
  }
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Sunucudan geçersiz bir yanıt alındı.', 502);
  }
}
