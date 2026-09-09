'use client';

import { useEffect, useState } from 'react';
import { BRANDING_DEFAULTS, normalizeBranding, type Branding } from './branding';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(BRANDING_DEFAULTS);

  useEffect(() => {
    fetch(`${API}/settings/branding`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : {}))
      .then((value) => setBranding(normalizeBranding(value)))
      .catch(() => {});
  }, []);

  return branding;
}
