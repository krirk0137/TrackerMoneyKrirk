// Service worker แบบ network-first สำหรับไฟล์ในโดเมนตัวเอง
// (ออนไลน์ = ได้ของใหม่เสมอ, ออฟไลน์ = ใช้ที่ cache ไว้)
// CDN และ Supabase ปล่อยให้ไปเน็ตตามปกติ
const CACHE = "tracker-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles/main.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./app/config.js",
  "./app/supabaseClient.js",
  "./app/ui.js",
  "./app/theme.js",
  "./app/auth.js",
  "./app/nav.js",
  "./app/transactions.js",
  "./app/dashboard.js",
  "./app/accounts.js",
  "./app/calendar.js",
  "./app/savings.js",
  "./app/categories.js",
  "./app/recurring.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // CDN / Supabase → ปล่อยผ่าน
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
