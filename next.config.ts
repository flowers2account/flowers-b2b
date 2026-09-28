import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // pdfkit читает метрики стандартных шрифтов (.afm) и sRGB-профиль (.icc) через fs по
  // пути от своего __dirname. Бандлер (Turbopack) ломает __dirname → ENOENT в standalone.
  // serverExternalPackages оставляет pdfkit как обычный require (корректный __dirname),
  // а outputFileTracingIncludes кладёт его data-файлы в бандл.
  serverExternalPackages: ['pdfkit', 'fontkit'],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/pdfkit/js/data/**/*',
      // локальный индекс КТРУ: search.ts читает его через process.cwd() —
      // явно кладём в standalone-бандл, иначе на VPS ENOENT (см. /api/ktru/search)
      './data/enstru/enstru_index.json',
    ],
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
      {
        // самохостинг фото товаров на VPS (см. docs/INFRA.md, /assets-9f2a7c/)
        protocol: 'https',
        hostname: 'uralskflowers.kz',
      },
      {
        // Фото каталога Proflowers (раздел «Под заказ», docs/PROFLOWERS_SYNC.md).
        // TODO: MVP — хотлинк на CDN поставщика. Позже перекладывать фото на свой VPS при
        // синке (как остальные источники в этом списке) — не грузить чужой CDN и не зависеть
        // от их хоста.
        protocol: 'https',
        hostname: 'marketimg.proflowers.kz',
      },
      {
        protocol: 'https',
        hostname: 'www.uralskflowers.kz',
      },
    ],
  },
};

export default nextConfig;
