export function safeInternalPath(value: string | null, fallback: string) {
  if (!value?.startsWith('/')) return fallback;
  try {
    const base = new URL('https://local.invalid');
    const target = new URL(value, base);
    return target.origin === base.origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}
