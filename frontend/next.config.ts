import type { NextConfig } from 'next';

const uploadUrl = process.env.NEXT_PUBLIC_SITE_URL;
const uploadPattern = uploadUrl ? new URL('/uploads/**', uploadUrl) : null;

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http', hostname: 'localhost', port: '4000' },
      ...(uploadPattern ? [uploadPattern] : []),
    ],
  },
};

export default config;
