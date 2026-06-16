import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'waterdrinker.blob.core.windows.net',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'img.ozexport.nl',
      },
      {
        protocol: 'https',
        hostname: '*.tildacdn.pro',
      },
      {
        protocol: 'https',
        hostname: '*.tildacdn.com',
      },
      {
        // самохостинг фото товаров на VPS (см. docs/INFRA.md, /assets-9f2a7c/)
        protocol: 'https',
        hostname: 'uralskflowers.kz',
      },
      {
        protocol: 'https',
        hostname: 'www.uralskflowers.kz',
      },
    ],
  },
};

export default nextConfig;
