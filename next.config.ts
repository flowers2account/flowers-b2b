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
    ],
  },
};

export default nextConfig;
