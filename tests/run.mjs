// Автоматические проверки игры «Атлас пропавшего картографа».
// Запуск: node tests/run.mjs <engine>   (engine: chrome | webkit | firefox)
// Игра должна быть доступна по адресу BASE (локальный сервер в GitHub Actions).
import { chromium, webkit, firefox } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ENGINE = process.argv[2] || 'chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/';
const OUT = path.resolve('out', ENGINE);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

/* 9 профилей устройств; на каждом движке — те, что он умеет эмулировать */
const PROFILES = {
  'android-portrait':  { w: 412,  h: 915,  mobile: true,  name: 'Android-телефон вертикально' },
  'android-landscape': { w: 915,  h: 412,  mobile: true,  name: 'Android-телефон горизонтально' },
  'iphone-portrait':   { w: 390,  h: 844,  mobile: true,  name: 'iPhone вертикально' },
  'iphone-landscape':  { w: 844,  h: 390,  mobile: true,  name: 'iPhone горизонтально' },
  'narrow-landscape':  { w: 740,  h: 360,  mobile: true,  name: 'Узкий телефон горизонтально' },
  'tablet-portrait':   { w: 800,  h: 1280, mobile: true,  name: 'Планшет вертикально' },
  'tablet-landscape':  { w: 1280, h: 800,  mobile: true,  name: 'Планшет горизонтально' },
  'laptop':            { w: 1366, h: 768,  mobile: false, name: 'Ноутбук' },
  'monitor':           { w: 1920, h: 1080, mobile: false, name: 'Большой монитор' },
  /* Chrome, который представляется Mi Браузером: проверяем защиту игры (картинки вместо видео + подсказка) */
  'mi-browser':        { w: 915,  h: 412,  mobile: true,  name: 'Mi Браузер (защита), телефон горизонтально',
    ua: 'Mozilla/5.0 (Linux; U; Android 14; ru-ru; 23090RA98G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.36.0-gn', mi: true },
};
const BY_ENGINE = {
  chrome:  Object.keys(PROFILES),
  webkit:  ['iphone-portrait', 'iphone-landscape', 'tablet-portrait', 'tablet-landscape', 'laptop'],
  firefox: ['laptop', 'monitor', 'tablet-landscape'],   // Firefox не эмулирует сенсорные телефоны
};

/* Проверка наложений: кнопки поверх карточек, герои поверх текста, выход за край экрана */
const OVERLAP_JS = `(() => {
  const out = []; const W = innerWidth;
  const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.1; };
  if (document.body.classList.contains('cine') || document.body.classList.contains('peek')) return out;
  document.querySelectorAll('#app *').forEach(e => { const b = e.getBoundingClientRect();
    if (b.width > 0 && b.height > 0 && (b.right > W + 1 || b.left < -1)) out.push('выходит за край: ' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]); });
  const btns = [...document.querySelectorAll('#sndBtn,#fsBtn,#eyeBtn')].filter(vis).map(b => b.getBoundingClientRect());
  const cards = [...document.querySelectorAll('#app .card, #app .topbar')].map(c => [c, c.getBoundingClientRect()]);
  cards.forEach(([c, cb]) => btns.forEach(bb => { if (!(bb.bottom <= cb.top || bb.top >= cb.bottom || bb.right <= cb.left || bb.left >= cb.right)) out.push('кнопка поверх: ' + c.className.split(' ')[0]); }));
  [...document.querySelectorAll('.portrait.on')].filter(vis).forEach(p => {
    if (!p.naturalWidth) return;
    const r = p.getBoundingClientRect(); const s = Math.min(r.width / p.naturalWidth, r.height / p.naturalHeight);
    const iw = p.naturalWidth * s, ih = p.naturalHeight * s; const L = r.left + (r.width - iw) / 2, T = r.bottom - ih;
    cards.forEach(([c, cb]) => { if (c.classList.contains('topbar')) return;
      const ox = Math.min(L + iw, cb.right) - Math.max(L, cb.left), oy = Math.min(r.bottom, cb.bottom) - Math.max(T, cb.top);
      if (ox > 12 && oy > 12) out.push('герой под текстом: ' + p.id); });
  });
  return [...new Set(out)];
})()`;

const report = { engine: ENGINE, profiles: [] };
const browserType = ENGINE === 'webkit' ? webkit : ENGINE === 'firefox' ? firefox : chromium;
const launchOpts = ENGINE === 'chrome' ? { channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] } : {};
const browser = await browserType.launch(launchOpts);
const FILES = JSON.parse(fs.readFileSync('index.html', 'utf8').match(/\/\*FILES\*\/(.*?)\/\*\/FILES\*\//s)[1]);

for (const key of BY_ENGINE[ENGINE]) {
  const P = PROFILES[key];
  const res = { key, name: P.name, checks: {}, problems: [], warnings: [], shots: [], tasks: [] };
  const fail = (check, msg) => { res.checks[check] = 'fail'; res.problems.push(`[${check}] ${msg}`); };
  const ok = check => { if (res.checks[check] !== 'fail') res.checks[check] = 'ok'; };
  const ctxOpts = { viewport: { width: P.w, height: P.h }, deviceScaleFactor: 1 };
  if (P.mobile && ENGINE !== 'firefox') Object.assign(ctxOpts, { isMobile: true, hasTouch: true, screen: { width: Math.min(P.w, P.h), height: Math.max(P.w, P.h) } });
  if (P.ua) ctxOpts.userAgent = P.ua;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const jsErrors = [], missing = [];
  page.on('pageerror', e => jsErrors.push(String(e.message || e)));
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) missing.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.on('dialog', d => d.accept());
  let shotN = 0;
  const shot = async label => {
    const f = `shots/${key}-${String(++shotN).padStart(2, '0')}.jpg`;
    try { await page.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 55 }); res.shots.push({ f, label }); } catch (e) {}
  };
  const overlap = async where => {
    await page.waitForTimeout(700);
    const o = await page.evaluate(OVERLAP_JS);
    if (o.length) fail('5 наложения', `${where}: ${o.join('; ')}`); else ok('5 наложения');
  };
  const isPhone = P.mobile && Math.min(P.w, P.h) < 600 && ENGINE !== 'firefox';
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1500);
    ok('1 открывается');

    // 6. Подсказка «Поверните телефон»
    const rotVisible = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none');
    if (isPhone && P.h > P.w) { if (rotVisible) ok('6 поверните телефон'); else fail('6 поверните телефон', 'подсказка не появилась'); await shot('Подсказка повернуть'); await page.click('#rotSkip'); }
    else if (rotVisible) fail('6 поверните телефон', 'подсказка появилась там, где не нужна');
    else ok('6 поверните телефон');

    // Mi Браузер: игра должна узнать его и показать подсказку «Открыть в Chrome»
    if (P.mi) {
      const hint = await page.locator('.mi-hint a').count();
      if (hint) ok('9 mi-браузер'); else fail('9 mi-браузер', 'нет подсказки «Открыть в Chrome»');
    }
    // Диагностика: каждый ролик по отдельности на чистой странице (только Safari, ноутбук)
    if (ENGINE === 'webkit' && key === 'laptop') {
      const probe = await ctx.newPage();
      await probe.goto(BASE + 'manifest.webmanifest');
      const vids = await page.evaluate(() => FILES.vid);
      for (const v of vids) {
        const r = await probe.evaluate(src => new Promise(res => {
          const el = document.createElement('video'); el.muted = true; el.preload = 'auto';
          const t = setTimeout(() => res('нет ответа'), 8000);
          el.onloadeddata = () => { clearTimeout(t); res('ok'); el.removeAttribute('src'); el.load(); };
          el.onerror = () => { clearTimeout(t); res('ошибка ' + (el.error ? el.error.code : '?')); };
          el.src = src; document.body.appendChild(el);
        }), BASE + 'img/' + v + '.mp4');
        if (r !== 'ok') res.warnings.push(`проба ролика ${v}: ${r}`);
      }
      res.warnings.push(`проба роликов по отдельности завершена (${vids.length} шт.)`);
      for (const f of (fs.existsSync('tests/probe') ? fs.readdirSync('tests/probe') : []).filter(x => x.endsWith('.mp4'))) {
        const r = await probe.evaluate(src => new Promise(res => {
          const el = document.createElement('video'); el.muted = true; el.preload = 'auto';
          const t = setTimeout(() => res('нет ответа'), 8000);
          el.onloadeddata = () => { clearTimeout(t); res('ok'); el.removeAttribute('src'); el.load(); };
          el.onerror = () => { clearTimeout(t); res('ошибка ' + (el.error ? el.error.code : '?')); };
          el.src = src; document.body.appendChild(el);
        }), BASE + 'tests/probe/' + f);
        res.warnings.push(`проба варианта ${f}: ${r}`);
      }
      await probe.close();
    }
    // 3. Титульный экран
    if (await page.locator('.title-card h1').isVisible()) ok('3 экраны'); else fail('3 экраны', 'нет титульного экрана');
    await overlap('титульный экран'); await shot('Титульный экран');

    // Вступление
    await page.click('#go'); await page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => typeof endCine === 'function' && endCine());
      if (i === 1) { await overlap('вступление (таверна)'); await shot('Вступление: таверна'); }
      await page.click('#next'); await page.waitForTimeout(350);
    }
    // Регистрация
    await page.evaluate(() => typeof endCine === 'function' && endCine());
    await page.fill('#nm', 'Тест'); await page.fill('#sh', 'Проверка');
    await overlap('регистрация'); await shot('Регистрация');
    await page.click('#go'); await page.waitForTimeout(1200);
    await page.evaluate(() => typeof endCine === 'function' && endCine());
    if (await page.locator('[data-ch=c1]').isVisible()) ok('3 экраны'); else fail('3 экраны', 'порт не открылся');
    await overlap('порт'); await shot('Порт с атласом');

    /* Тестовый Safari иногда не прокручивает длинную карточку до кнопки — тогда нажимаем её программно и пишем замечание */
    const clickSafe = async (sel, label) => {
      try { await page.locator(sel).scrollIntoViewIfNeeded({ timeout: 5000 }); await page.click(sel, { timeout: 8000 }); }
      catch (e) { await page.evaluate(q => { const b = document.querySelector(q); b.scrollIntoView({ block: 'center' }); b.click(); }, sel); res.warnings.push(`${label}: кнопку пришлось нажать программно (тестовый Safari не прокрутил к ней)`); }
    };
    // 4. Главы целиком: каждая доступная глава по очереди
    const chs = await page.evaluate(() => CHAPTERS.filter(c => c.ready).map(c => ({ id: c.id, idx: CHAPTERS.indexOf(c), total: c.steps.filter(s => s.type !== 'story').length })));
    for (const ch of chs) {
    const CH = ch.id, CI = ch.idx, PFX = chs.length > 1 ? `гл.${CI + 1} ` : '';
    await page.evaluate(() => typeof endCine === 'function' && endCine());
    await page.click(`[data-ch=${CH}]`); await page.waitForTimeout(500);
    let n = 0, guard = 0;
    while (guard++ < 80) {
      await page.waitForTimeout(250);
      if (await page.locator('h2:has-text("Глава пройдена")').count()) break;
      await page.evaluate(() => typeof endCine === 'function' && endCine());
      const st = await page.evaluate(([ci, id]) => CHAPTERS[ci].steps[state.ch[id].idx], [CI, CH]);
      await page.waitForTimeout(900);
      const scene = await page.evaluate(() => imgScene);
      const sceneFile = await page.evaluate(s => (SCENE_IMG[s] || {}).file, scene);
      const wantVid = !P.mi && FILES.vid.includes(sceneFile);
      if (P.mi) { const anyVid = await page.locator('.svid').count(); if (anyVid) fail('9 mi-браузер', `${st.type === 'story' ? 'сюжет' : 'задание ' + (n + 1)}: в Mi Браузере появилось видео`); else ok('9 mi-браузер'); }
      const vid = await page.evaluate(() => { const v = document.querySelector('.simg.on .svid'); return v ? { t: v.currentTime, err: v.error ? v.error.code : 0 } : null; });
      const label = PFX + (st.type === 'story' ? 'сюжет' : `задание ${n + 1}`);
      let media = vid ? 'видео' : 'картинка';
      if (wantVid && !vid) fail('4 глава', `${label} (${scene}): видео есть в папке, но не показано`);
      if (vid && vid.err) {
        /* Тестовая сборка Firefox не умеет H.264 (обычный Firefox на Windows/Android умеет) — это ограничение теста */
        if (ENGINE === 'firefox' && vid.err === 4) { if (!res.warnings.some(w => w.startsWith('видео'))) res.warnings.push('видео H.264 не поддерживается тестовой сборкой Firefox — игра показывает картинки сцен (обычный Firefox видео показывает)'); }
        else fail('4 глава', `${label} (${scene}): ошибка воспроизведения видео (${vid.err})`);
      }
      if (ENGINE === 'chrome' && vid && !vid.err && vid.t < 0.2) {
        await page.waitForTimeout(1200);
        const t2 = await page.evaluate(() => { const v = document.querySelector('.simg.on .svid'); return v ? v.currentTime : 0; });
        if (t2 < 0.2) res.warnings.push(`${label} (${scene}): видео не начало играть`); else media = 'видео ▶';
      } else if (vid && vid.t >= 0.2) media = 'видео ▶';
      res.tasks.push(`${label}: ${scene} — ${media}`);
      if (st.type === 'story') { await overlap(label); if (st.hero) await shot(`${label}: карточка «${st.hero}»`); await clickSafe('#next', label); continue; }
      n++;
      await overlap(`${label} до ответа`);
      if (st.type === 'choice') await page.click(`.opt[data-i="${st.ans}"]`);
      else if (st.type === 'map') {
        await page.waitForSelector('#tmap svg, #skip', { timeout: 20000 });
        if (await page.locator('#skip').count()) { fail('4 глава', `${label}: карта не загрузилась`); await page.click('#skip'); }
        else {
          const xy = await page.evaluate(t => { const s = document.querySelector('#tmap svg'); const w = +s.getAttribute('width'), h = +s.getAttribute('height');
            return d3.geoMercator().fitExtent([[10, 10], [w - 10, h - 10]], { type: 'MultiPoint', coordinates: t.bbox })(t.target); }, st);
          await page.locator('#tmap svg').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
          const box = await page.locator('#tmap svg').boundingBox();
          await page.mouse.click(box.x + xy[0], box.y + xy[1]); await page.click('#mok');
        }
      } else if (st.type === 'order') { for (const it of st.items) await page.locator('.chip', { hasText: it }).first().click(); await page.click('#ochk'); }
      else if (st.type === 'match') { for (let k = 0; k < st.pairs.length; k++) { await page.click(`.mrow >> nth=${k}`); await page.locator('.chip', { hasText: st.pairs[k][1] }).click(); } await page.click('#mchk'); }
      await page.waitForTimeout(500);
      const fb = await page.locator('.fb h3').textContent().catch(() => null);
      if (!fb) fail('4 глава', `${label}: нет пояснения после ответа`);
      else if (st.type !== 'map' && !/Верно/.test(fb)) fail('4 глава', `${label}: верный ответ не засчитан («${fb}»)`);
      if (st.rv && st.rv.bbox && /Верно/.test(fb || '')) {
        await page.waitForTimeout(1500);
        if (!(await page.locator('#rvmap svg').count())) fail('4 глава', `${label}: не прорисовался фрагмент карты`);
      }
      if ([1, 4, 11, 13, 18].includes(n)) { await overlap(`${label} после ответа`); await shot(`${label}: ${st.type} (после ответа)`); }
      await clickSafe('#cont', label);
    }
    if (n === ch.total) ok('4 глава'); else fail('4 глава', `${PFX}пройдено заданий: ${n} из ${ch.total}`);
    await overlap(PFX + 'финал главы'); await shot(PFX + 'Финал главы');
    await page.click('#hub'); await page.waitForTimeout(800);
    }
    await page.click('#jr'); await page.waitForTimeout(600);
    if (await page.locator('.jcard').count() >= 20) ok('3 экраны'); else fail('3 экраны', 'журнал неполный');
    await overlap('судовой журнал'); await shot('Судовой журнал');

    // 7. Установка и офлайн (Chrome, ноутбук — один раз, это не зависит от экрана)
    if (ENGINE === 'chrome' && key === 'laptop') {
      const sw = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'нет'; const r = await navigator.serviceWorker.ready; return r.active ? 'ok' : 'нет'; });
      if (sw !== 'ok') fail('7 приложение', 'офлайн-режим (service worker) не запустился');
      await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(2000);
      if (await page.locator('.title-card h1').count()) ok('7 приложение'); else fail('7 приложение', 'без интернета игра не открылась');
      await ctx.setOffline(false);
    }
  } catch (e) {
    const lines = String(e.message || e).split('\n');
    const why = lines.filter(l => /intercepts pointer|not visible|outside of the viewport|not stable|waiting for/.test(l)).slice(-2).map(l => l.trim()).join(' / ');
    fail('сбой проверки', lines[0] + (why ? ' — ' + why : ''));
    await shot('Момент сбоя');
  }
  if (jsErrors.length) fail('1 открывается', 'ошибки в коде: ' + [...new Set(jsErrors)].slice(0, 3).join(' | ')); else ok('1 открывается');
  if (missing.length) fail('2 файлы', 'не найдены: ' + [...new Set(missing)].slice(0, 5).join(', ')); else ok('2 файлы');
  await ctx.close();
  report.profiles.push(res);
  console.log(`${ENGINE} / ${key}: ${res.problems.length ? 'ПРОБЛЕМЫ ' + res.problems.length : 'ok'}`);
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
