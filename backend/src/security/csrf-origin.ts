const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cookie taşıyan state-changing istekleri production frontend origin'iyle sınırlar. */
export function isAllowedMutationOrigin(method: string, origin: string | undefined, allowedOrigins: readonly string[]) {
  if (SAFE_METHODS.has(method.toUpperCase()) || !origin || allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}
