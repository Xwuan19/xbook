/**
 * ============================================================================
 * XBOOK SERVICE WORKER — PWA (cài được trên iPhone & Android)
 * ============================================================================
 * Chiến lược:
 *  - Trang HTML (điều hướng): ưu tiên mạng → rớt mạng thì mở bản đã lưu của ĐÚNG trang đó
 *    (trang chủ "/" và trang quản trị "/admin.html" cache riêng, không lẫn nhau).
 *  - File tĩnh (core.js, app.js, admin.js, logo, icon...): trả bản đã lưu ngay, cập nhật ngầm.
 *  - API (/api/..., /uploads/...) và CDN ngoài: KHÔNG cache — luôn lấy dữ liệu mới
 *    để đơn hàng / trạng thái đăng ký luôn chính xác.
 *
 * ⚠️ Mỗi lần deploy có thay đổi file tĩnh (core.js / app.js / admin.js / *.html / logo / icon...):
 *    tăng CACHE_NAME bên dưới (xbook-static-v6 → v7) để máy người dùng xoá cache cũ.
 * ============================================================================
 */

const CACHE_NAME = 'xbook-static-v6';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/admin',
  '/admin.html',
  '/domain.js',
  '/core.js',
  '/app.js',
  '/admin.js',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest'
];

/** Trang HTML dùng làm bản dự phòng offline cho từng đường dẫn */
function offlinePageFor(pathname) {
  return pathname.startsWith('/admin') ? '/admin.html' : '/index.html';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // addAll sẽ hỏng nếu 1 file lỗi → thêm từng file để bỏ qua file lỗi
      .then((cache) => Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  // Chỉ xử lý tài nguyên cùng tên miền; bỏ qua API, ảnh upload và mọi CDN bên ngoài.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // 1. Điều hướng trang: mạng trước, rớt mạng thì dùng bản đã lưu của đúng trang đó
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          // /admin là route chuyển hướng → lưu theo đường dẫn thật của trang
          const cacheKey = url.pathname === '/' ? '/index.html' : url.pathname;
          const cache = await caches.open(CACHE_NAME);
          await cache.put(cacheKey, copy).catch(() => null);
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const fallbacks = [url.pathname, offlinePageFor(url.pathname), '/index.html'];
        for (const key of fallbacks) {
          const cached = await cache.match(key, { ignoreSearch: true });
          if (cached) return cached;
        }
        return new Response('Không có kết nối mạng — mở lại trang khi có mạng nhé.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // 2. File tĩnh: trả bản đã lưu ngay (mở app tức thì), đồng thời cập nhật ngầm
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
