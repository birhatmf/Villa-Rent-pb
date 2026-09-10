'use client';

import NextLink, { type LinkProps } from 'next/link';
import { useLocale } from 'next-intl';

type Props = LinkProps & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

const UNLOCALIZED = ['/admin', '/hesabim/ev-sahibi', '/hesabim/villalarim'];

export default function LocaleLink({ href, ...props }: Props) {
  const locale = useLocale();
  const path = typeof href === 'string' ? href : href.pathname?.toString() ?? '';
  const shouldLocalize = locale !== 'tr'
    && path.startsWith('/')
    && !path.startsWith(`/${locale}`)
    && !UNLOCALIZED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  const localizedHref = shouldLocalize
    ? `${locale === 'tr' ? '' : `/${locale}`}${path === '/' ? '' : path}` || '/'
    : href;

  return <NextLink href={localizedHref} {...props} />;
}
