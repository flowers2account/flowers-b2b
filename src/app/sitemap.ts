import type { MetadataRoute } from 'next'

const SITE_URL = 'https://uralskflowers.kz'

const routes = [
  '',
  '/about',
  '/catalog',
  '/categories',
  '/contacts',
  '/delivery',
  '/legal/oferta',
  '/legal/personal-data',
  '/legal/privacy',
  '/payment',
  '/returns',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === '' || route === '/catalog' ? 'daily' : 'monthly',
    priority: route === '' ? 1 : route === '/catalog' || route === '/categories' ? 0.9 : 0.6,
  }))
}
