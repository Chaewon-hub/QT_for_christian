// Service worker: 오프라인에서도 앱이 열리도록 파일을 기기에 보관한다.
// 새 버전을 올릴 때는 CACHE 이름의 숫자를 올린다 (예: qtnote-v1.1.1).
const CACHE = 'qtnote-v1.3.0';
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/sheet.css',
  'assets/fonts/fonts.css',
  'js/main.js',
  'js/schema.js',
  'js/i18n.js',
  'js/store.js',
  'js/form.js',
  'js/sheet.js',
  'js/sheep.js',
  
  'js/pdf.js',
  'js/images.js', 'js/richbody.js', 'js/rich.js',
  'assets/vendor/html2canvas.min.js',
  'assets/vendor/jspdf.umd.min.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/fonts/pretendard/Pretendard-Regular.woff2',
  'assets/fonts/pretendard/Pretendard-Bold.woff2',
  'assets/fonts/pretendard/Pretendard-ExtraBold.woff2',
  'assets/fonts/hahmlet/hahmlet-korean-700-normal.woff2',
  'assets/fonts/hahmlet/hahmlet-latin-700-normal.woff2',
  'assets/fonts/mono/space-mono-latin-400-normal.woff2',
  'assets/fonts/mono/space-mono-latin-700-normal.woff2',
  'assets/fonts/mono/dm-mono-latin-400-normal.woff2',
  'assets/fonts/mono/dm-mono-latin-500-normal.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('qtnote-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// 같은 출처의 GET 요청만 처리: 캐시 우선, 없으면 받아서 캐시(일본어 글꼴 등은 처음 쓸 때 저장된다).
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = req.mode === 'navigate';
    const hit = await cache.match(isPage ? 'index.html' : req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (isPage) { const shell = await cache.match('index.html'); if (shell) return shell; }
      throw err;
    }
  })());
});
