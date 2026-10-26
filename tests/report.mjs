// Общие проверки (файлы, описание приложения, «паспорт») и сборка итогового отчёта.
import fs from 'node:fs';
import path from 'node:path';

const PUBLISHED = 'https://dmitriy-86v.github.io/atlas-quest/manifest.webmanifest';
const html = fs.readFileSync('index.html', 'utf8');
const version = (html.match(/GAME_VERSION = '([^']+)'/) || [])[1] || '?';
const global = { problems: [], ok: [] };

// 2. Все файлы из списка игры на месте
const FILES = JSON.parse(html.match(/\/\*FILES\*\/(.*?)\/\*\/FILES\*\//s)[1]);
const need = [...Object.entries(FILES.img).map(([n, e]) => `img/${n}.${e}`), ...FILES.vid.map(n => `img/${n}.mp4`), ...FILES.snd.map(n => `snd/${n}.mp3`)];
const lost = need.filter(f => !fs.existsSync(f));
lost.length ? global.problems.push(`[2 файлы] в папке нет: ${lost.join(', ')}`) : global.ok.push(`2 файлы: все ${need.length} файлов на месте`);

// 7. Описание приложения: иконки и обязательные поля
const man = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const iconsLost = (man.icons || []).map(i => i.src).filter(s => !fs.existsSync(s));
const req = ['name', 'short_name', 'start_url', 'display', 'icons'].filter(k => !man[k]);
if (iconsLost.length || req.length) global.problems.push(`[7 приложение] ${iconsLost.length ? 'нет иконок: ' + iconsLost.join(', ') : ''} ${req.length ? 'нет полей: ' + req.join(', ') : ''}`);
else global.ok.push('7 приложение: описание и иконки в порядке');

// 8. «Паспорт» приложения не изменился по сравнению с опубликованной версией
const PASSPORT = ['display', 'display_override', 'orientation', 'start_url', 'scope', 'id'];
try {
  const pub = await (await fetch(PUBLISHED)).json();
  const diff = PASSPORT.filter(k => JSON.stringify(pub[k]) !== JSON.stringify(man[k]));
  diff.length
    ? global.problems.push(`[8 паспорт] изменено: ${diff.map(k => `${k}: ${JSON.stringify(pub[k])} → ${JSON.stringify(man[k])}`).join('; ')}. ⚠ Уже установленные приложения нужно будет удалить и установить заново.`)
    : global.ok.push('8 паспорт: не изменился, установленные приложения обновятся сами');
} catch (e) { global.problems.push(`[8 паспорт] не удалось получить опубликованную версию: ${e.message}`); }

// Сборка отчёта по всем движкам
const ENG = { chrome: 'Chrome', webkit: 'Safari (движок iPhone)', firefox: 'Firefox' };
const runs = Object.keys(ENG).map(e => { try { return JSON.parse(fs.readFileSync(path.join('out', e, 'report.json'), 'utf8')); } catch { return { engine: e, profiles: [], missing: true }; } });
let total = 0, bad = 0;
let md = `# Отчёт проверки · версия ${version}\n\n_${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC_\n\n`;
const rows = [];
for (const r of runs) {
  if (r.missing) { md += `> ⚠ ${ENG[r.engine]}: проверка не выполнилась\n\n`; bad++; continue; }
  for (const p of r.profiles) { total++; if (p.problems.length) bad++; rows.push([ENG[r.engine], p]); }
}
const allOk = bad === 0 && global.problems.length === 0;
md += allOk ? `## ✅ Всё прошло: ${total} проверок на 3 движках\n\n` : `## ❌ Есть проблемы: ${bad} из ${total} профилей, общих — ${global.problems.length}\n\n`;
md += `### Общие проверки\n` + [...global.problems.map(x => `- ❌ ${x}`), ...global.ok.map(x => `- ✅ ${x}`)].join('\n') + '\n\n';
md += `### По устройствам\n\n| Движок | Устройство | Итог | Проблемы |\n|---|---|---|---|\n`;
for (const [e, p] of rows) md += `| ${e} | ${p.name} | ${p.problems.length ? '❌' : '✅'} | ${p.problems.length ? p.problems.join('<br>') : '—'} |\n`;
const warns = rows.flatMap(([e, p]) => p.warnings.map(w => `- ${e} · ${p.name}: ${w}`));
if (warns.length) md += `\n### Замечания (не ошибки)\n${warns.join('\n')}\n`;
const chromeLaptop = rows.find(([e, p]) => e === 'Chrome' && p.key === 'laptop');
if (chromeLaptop) md += `\n### Сцены по заданиям (Chrome, ноутбук)\n${chromeLaptop[1].tasks.map(t => `- ${t}`).join('\n')}\n`;
md += `\n### Скриншоты\n`;
for (const r of runs) for (const p of (r.profiles || [])) {
  md += `\n<details><summary>${ENG[r.engine]} · ${p.name}</summary>\n\n` + p.shots.map(s => `**${s.label}**<br><img src="${r.engine}/${s.f}" width="420">`).join('<br><br>\n') + `\n</details>\n`;
}
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/README.md', md);
fs.writeFileSync('out/summary.json', JSON.stringify({ version, allOk, total, bad, global }, null, 1));
console.log(allOk ? 'ALL OK' : `PROBLEMS: profiles ${bad}/${total}, global ${global.problems.length}`);
