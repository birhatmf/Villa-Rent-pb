import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const uploadUrl = process.env.NEXT_PUBLIC_SITE_URL;
const uploadPattern = uploadUrl ? new URL('/uploads/**', uploadUrl) : null;

const config: NextConfig = {
  // Çalışan dev sunucusunun manifestleri production build tarafından ezilmesin.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http', hostname: 'localhost', port: '4000' },
      ...(uploadPattern ? [uploadPattern] : []),
    ],
  },
};

export default createNextIntlPlugin('./i18n/request.ts')(config);
