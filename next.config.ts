import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    // Ensure WASM files are emitted to static dir (required for Vercel)
    config.output = config.output ?? {}
    config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm'
    return config
  },
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
