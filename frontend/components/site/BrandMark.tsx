import type { Branding } from '@/lib/branding';

export default function BrandMark({
  branding,
  onDark = false,
  compact = false,
  className = '',
}: {
  branding: Branding;
  onDark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const logo = onDark ? branding.logoOnDark || branding.logo : branding.logo;

  if (compact && branding.favicon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={branding.favicon} alt={branding.companyName} className={`object-contain ${className}`} />
    );
  }

  if (logo && !compact) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt={branding.companyName} className={`object-contain ${className}`} />
    );
  }

  return <span className={className}>{compact ? branding.shortName.charAt(0) : branding.companyName}</span>;
}
