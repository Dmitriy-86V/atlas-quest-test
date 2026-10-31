/* Офлайн-режим игры: файлы сохраняются на устройстве после первого открытия.
   При выходе новой версии поменяйте VERSION — старый кэш удалится. */
const VERSION = 'atlas-v13';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
/* картинки и звуки скачиваются сразу, чтобы игра работала без интернета (видео — нет, они тяжёлые) */
const ASSETS = ["./img/alenquer-face.jpg", "./img/alenquer.png", "./img/calicut.jpg", "./img/cape-storm.jpg", "./img/cape-verde.jpg", "./img/chest.jpg", "./img/columbus-face.jpg", "./img/columbus.png", "./img/dias-face.jpg", "./img/dias.png", "./img/eclipse.jpg", "./img/fog.jpg", "./img/hero-face.jpg", "./img/hero.png", "./img/hispaniola.jpg", "./img/island.jpg", "./img/lisbon.jpg", "./img/malindi.jpg", "./img/map-room.jpg", "./img/map.jpg", "./img/ocean-day.jpg", "./img/ocean-night.jpg", "./img/palace.jpg", "./img/palos.jpg", "./img/penguin-coast.jpg", "./img/pilot-face.jpg", "./img/pilot.png", "./img/port-dawn.jpg", "./img/port-day.jpg", "./img/port-night.jpg", "./img/sailor-face.jpg", "./img/sailor.png", "./img/sebastian-face.jpg", "./img/sebastian.png", "./img/southern-sky.jpg", "./img/sunset-port.jpg", "./img/taino-village.jpg", "./img/tavern.jpg", "./img/vasco-face.jpg", "./img/vasco.png", "./snd/calicut.mp3", "./snd/cape-storm.mp3", "./snd/cape-verde.mp3", "./snd/chest.mp3", "./snd/eclipse.mp3", "./snd/fog.mp3", "./snd/hispaniola.mp3", "./snd/island.mp3", "./snd/lisbon.mp3", "./snd/malindi.mp3", "./snd/map-room.mp3", "./snd/ocean-day.mp3", "./snd/ocean-night.mp3", "./snd/palace.mp3", "./snd/palos.mp3", "./snd/penguin-coast.mp3", "./snd/port-day.mp3", "./snd/port-night.mp3", "./snd/southern-sky.mp3", "./snd/sunset-port.mp3", "./snd/taino-village.mp3", "./snd/tavern.mp3"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE).then(() => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  /* видео не кэшируем (браузер грузит их частями); без сети вместо видео будет картинка */
  if(url.pathname.endsWith('.mp4') || req.headers.has('range')) return;
  /* сама игра: сначала сеть (чтобы приходили обновления), без сети — сохранённая копия */
  if(req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')){
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  /* картинки, звуки, карта, шрифты: из кэша, а в фоне обновляем */
  e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(r => { if(r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
