// Собирает всё в один файл: node src/build.mjs → bunpo.html
import fs from 'node:fs';
const root = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = f => fs.readFileSync(root + f, 'utf8');
const data = fs.readdirSync(root + 'data').sort().map(f => read('data/' + f));
const js = [read('app/helpers.js'), ...data, read('app/dict.js'), read('app/core.js'), read('app/map.js'), read('app/sheet.js'), read('app/ui.js')].join('\n');
// Синтаксическая ошибка не должна попасть на сайт
new Function(js);
const html = `<title>Bunpō N5–N4</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap">
<style>
${read('app/style.css')}</style>
<div id="app"></div>
<div id="tip" hidden></div>
<script>
(function () {
${js}
})();
</script>
`;
fs.writeFileSync(root + '../bunpo.html', html);
// Сайт сам проверяет, не вышла ли новая версия (браузер телефона держит старую копию до 10 минут)
const BUILD = String(Date.now());
const UPDATE = `<script>(function(){var B='${BUILD}';function chk(){if(!/^https?:$/.test(location.protocol))return;fetch(location.pathname+'?check='+Date.now(),{cache:'no-store'}).then(function(r){return r.text()}).then(function(t){var m=t.match(/data-build="([0-9]+)"/);if(!m||m[1]===B)return;var k='bunpo.upd.'+m[1];try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){}location.replace(location.pathname+'?v='+m[1]+location.hash)}).catch(function(){})}chk();document.addEventListener('visibilitychange',function(){if(!document.hidden)chk()})})();</script>`;
// Отдельная обёртка, чтобы файл открывался двойным щелчком без публикации
const standalone = `<!doctype html><html lang="ru" data-build="${BUILD}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#09090c"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Bunpō"><meta name="format-detection" content="telephone=no"></head><body>\n${html}${UPDATE}</body></html>`;
fs.writeFileSync(root + '../bunpo-local.html', standalone);
console.log('bunpo.html', (html.length / 1024).toFixed(0) + ' KB');
