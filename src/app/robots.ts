import type { MetadataRoute } from 'next'

const SITE_URL = 'https://uralskflowers.kz'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/api/',
        '/cabinet/',
        '/cart/',
        '/checkout/',
        '/favorites/',
        '/inventory/',
        '/login/',
        '/order/',
        '/payment/',
        '/preorder/',
        '/print/',
        '/register/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
