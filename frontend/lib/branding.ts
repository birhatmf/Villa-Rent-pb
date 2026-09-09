export type Branding = {
  companyName: string;
  shortName: string;
  logo: string;
  logoOnDark: string;
  favicon: string;
};

export const BRANDING_DEFAULTS: Branding = {
  companyName: 'Villa Sepeti',
  shortName: 'Villa Sepeti',
  logo: '',
  logoOnDark: '',
  favicon: '',
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function normalizeBranding(value?: Record<string, unknown> | null): Branding {
  const companyName = text(value?.companyName) || BRANDING_DEFAULTS.companyName;
  return {
    companyName,
    shortName: text(value?.shortName) || companyName,
    logo: text(value?.logo),
    logoOnDark: text(value?.logoOnDark),
    favicon: text(value?.favicon),
  };
}
