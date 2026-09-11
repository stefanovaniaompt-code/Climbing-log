const CACHE_NAME = 'climbing-coach-shell-v2'

const BASE_URL = new URL('./', self.registration.scope).pathname
const appPath = path => `${BASE_URL}${path}`

const APP_SHELL = [
  BASE_URL,
  appPath('index.html'),
  appPath('manifest.webmanifest'),
  appPath('icon-180.png'),
  appPath('icon-192.png'),
  appPath('icon-512.png'),
  appPath('icon-maskable-512.png'),
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(appPath('index.html'), copy))
          }
          return response
        })
        .catch(() => caches.match(appPath('index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        }
        return response
      }).catch(() => cached)
      return cached || network
    }),
  )
})
