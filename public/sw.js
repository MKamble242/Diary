const CACHE_NAME = 'diary-cache-v1'
const APP_SHELL_URL = new URL('./', self.location).toString()

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const response = await fetch(APP_SHELL_URL, { cache: 'reload' })
      if (!response.ok) throw new Error('Could not cache the Diary app shell.')
      await cache.put(APP_SHELL_URL, response.clone())
      const html = await response.text()
      const assetPaths = [
        ...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
      ].map((match) => new URL(match[1], APP_SHELL_URL).toString())
      await Promise.all(
        [
          ...new Set([
            ...assetPaths,
            new URL('manifest.webmanifest', APP_SHELL_URL).toString(),
            new URL('icons/diary-192.svg', APP_SHELL_URL).toString(),
            new URL('icons/diary-512.svg', APP_SHELL_URL).toString(),
          ]),
        ].map(async (url) => {
          const assetResponse = await fetch(url, { cache: 'reload' })
          if (!assetResponse.ok) throw new Error(`Could not cache ${url}.`)
          await cache.put(url, assetResponse)
        }),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('diary-cache-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME)
            await cache.put(APP_SHELL_URL, response.clone())
          }
          return response
        } catch {
          const cached = await caches.match(APP_SHELL_URL)
          if (cached !== undefined) return cached
          return new Response('Diary is not available offline yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  if (/\.(?:js|css|svg|png|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const cached = await cache.match(url.href, { ignoreSearch: true })
        if (cached !== undefined) return cached
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      })(),
    )
  }
})
