// Проверка контента и логики без браузера: node src/test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = f => fs.readFileSync(root + f, 'utf8');
const dataFiles = fs.readdirSync(root + 'data').sort().map(f => 'data/' + f);
const code = ['app/helpers.js', ...dataFiles, 'app/dict.js', 'app/core.js', 'app/map.js', 'app/sheet.js'].map(read).join('\n') +
  '\n;globalThis.__x={SHEET,SHEET_LONG,LEARN_TYPES,ROW_WHY,MAP_GROUPS,MAP_VERBS,LESSONS,TOPICS,BY_ID,FURI,furiTokens,toReading,romajiToKana,checkInput,normAnswer,conj,schedule,upgradeState,memoryOf,retention,intervalDays,freshState,duePool,newPool,dayNum,fmtDay,overallMemory,DAY};';
const ctx = { console, Math, Date, Object, Array, Set, String, Number, JSON, RegExp };
ctx.globalThis = ctx;
vm.runInNewContext(code, ctx);
const X = ctx.__x;
let fails = 0;
const bad = (m) => { fails++; console.log('FAIL', m); };

// Структура
const counts = X.LESSONS.map(l => l.topics.length);
console.log('Уроков', X.LESSONS.length, 'тем', X.TOPICS.length, 'по урокам', counts.join(','), 'заданий', X.TOPICS.reduce((s, t) => s + t.q.length, 0));
const EXPECT = [3,7,8,8,6,7,6,8,7,7,4,6,6,5,4,5,6,6,5,6,5,6,6];
EXPECT.forEach((n, i) => { if (counts[i] !== n) bad(`урок ${i + 1}: ${counts[i]} тем, в книге ${n}`); });

// Поля
for (const t of X.TOPICS) {
  if (!t.t || !t.g || !t.r) bad(t.id + ' нет названия, смысла или правила');
  if (t.q.length < 3) bad(t.id + ' заданий меньше 3');
  (t.from || []).forEach(f => { if (!X.BY_ID[f]) bad(t.id + ' опора ' + f + ' не найдена'); else if (parseFloat(f) >= 0 && +f.split('.')[0] > t.lesson) bad(t.id + ' опирается на будущий урок ' + f); });
  t.q.forEach((q, i) => {
    if (q.k === 'c' && new Set(q.o).size !== q.o.length) bad(t.id + ' дубль вариантов q' + i);
    if (q.k === 'i') q.a.forEach(a => { if (/[㐀-鿿]/.test(X.toReading(a))) bad(t.id + ' ответ без чтения: ' + a + ' → ' + X.toReading(a)); });
    if (!q.w) bad(t.id + ' нет объяснения q' + i);
  });
}

// Таблица: каждая тема есть хотя бы в одной ячейке, ячейки собираются для любого глагола
const onMap = new Set();
for (const g of X.MAP_GROUPS) for (const r of g.rows) for (const it of r.items) {
  onMap.add(it[2]);
  if (!X.BY_ID[it[2]]) bad('таблица: нет темы ' + it[2]);
  if (typeof it[0] === 'function') for (const v of X.MAP_VERBS) { const s = it[0](X.conj(v)); if (!s || /undefined/.test(s)) bad('таблица: ' + it[2] + ' для ' + (v.d || v.type)); }
}
X.TOPICS.forEach(t => { if (!onMap.has(t.id)) bad('нет в таблице: ' + t.id); });
for (const g of X.MAP_GROUPS) for (const r of g.rows) if (!X.ROW_WHY[r.name]) bad('строка без логики: ' + r.name);

// Типы работы: каждая тема ровно в одном
const seen = {};
X.LEARN_TYPES.forEach(g => g.ids.forEach(id => { if (!X.BY_ID[id]) bad('тип ' + g.k + ': нет темы ' + id); seen[id] = (seen[id] || 0) + 1; }));
X.TOPICS.forEach(tp => { if (seen[tp.id] !== 1) bad('тема ' + tp.id + ' в типах ' + (seen[tp.id] || 0) + ' раз'); });

// Покрытие фуриганы
const miss = {};
const scan = s => { if (typeof s !== 'string') return; for (const run of s.match(/[぀-ヿ㐀-鿿々〜ー]+(?:\{[^}]+\}[぀-ヿ㐀-鿿々〜ー]*)*/g) || []) for (const [txt, r] of X.furiTokens(run)) if (/[㐀-鿿々]/.test(txt) && !r) miss[txt] = (miss[txt] || 0) + 1; };
const walk = o => { if (typeof o === 'string') scan(o); else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
X.TOPICS.forEach(t => { const { to, ...rest } = t; walk(rest); });
// Шпаргалка ссылается только на существующие темы
X.SHEET.forEach(g => g.items.forEach(i => { if (!X.BY_ID[i[2]]) bad('шпаргалка: нет темы ' + i[2]); }));
X.SHEET_LONG.forEach(i => { if (!X.BY_ID[i[1]]) bad('шпаргалка: нет темы ' + i[1]); });
walk(X.ROW_WHY); walk(X.SHEET); walk(X.SHEET_LONG);

// Покрытие фуриганы
if (Object.keys(miss).length) { fails++; console.log('Нет чтений:', Object.entries(miss).map(([k, v]) => k + '×' + v).join(' ')); }

// Спряжение
const conjCases = [
  [{ d: '読む', type: 'う' }, { te: '読んで', ta: '読んだ', neg: '読まない', stem: '読み', pot: '読める', vol: '読もう', ba: '読めば', pass: '読まれる', caus: '読ませる', caupass: '読まされる' }],
  [{ d: '行く', type: 'う' }, { te: '行って', ta: '行った', neg: '行かない', pot: '行ける', vol: '行こう' }],
  [{ d: '買う', type: 'う' }, { te: '買って', neg: '買わない', pass: '買われる', caus: '買わせる', vol: '買おう' }],
  [{ d: '話す', type: 'う' }, { te: '話して', ta: '話した', neg: '話さない', caupass: '話させられる' }],
  [{ d: '泳ぐ', type: 'う' }, { te: '泳いで', ta: '泳いだ' }],
  [{ d: '待つ', type: 'う' }, { te: '待って', neg: '待たない', pot: '待てる' }],
  [{ d: '食べる', type: 'る' }, { te: '食べて', neg: '食べない', pot: '食べられる', vol: '食べよう', ba: '食べれば', caus: '食べさせる' }],
  [{ type: 'する' }, { te: 'して', neg: 'しない', pot: 'できる', caus: 'させる' }],
  [{ type: 'くる' }, { te: 'きて', neg: 'こない', pot: 'こられる', ba: 'くれば' }],
];
for (const [v, exp] of conjCases) { const c = X.conj(v); for (const k in exp) if (c[k] !== exp[k]) bad(`conj ${v.d || v.type}.${k}: ${c[k]} ≠ ${exp[k]}`); }

// Ромадзи
const rom = { yomimasu: 'よみます', yonde: 'よんで', itte: 'いって', kyou: 'きょう', 'shinbun': 'しんぶん', ningen: 'にんげん', 'konnichiha': 'こんにちは', hon: 'ほん' };
for (const k in rom) if (X.romajiToKana(k, true) !== rom[k]) bad(`romaji ${k}: ${X.romajiToKana(k, true)}`);
if (X.romajiToKana('yon', false) !== 'よn') bad('romaji хвост n должен ждать');
if (!X.checkInput('yonde', ['読んで'])) bad('checkInput romaji');
if (!X.checkInput('読んで', ['読んで'])) bad('checkInput кандзи');
if (!X.checkInput('よんで', ['読んで'])) bad('checkInput кана');
if (!X.checkInput('きます。', ['来ます'])) bad('checkInput 来ます');
if (X.checkInput('よむ', ['読んで'])) bad('checkInput ложно верно');
if (X.checkInput('', ['読んで'])) bad('checkInput пусто');

// FSRS
const now = Date.UTC(2026, 9, 30, 12);
const g3 = X.schedule(null, 3, now);
if (Math.abs(g3.S - 3.173) > 1e-6) bad('S0');
const r0 = X.memoryOf(g3, now), r1 = X.memoryOf(g3, now + 3.173 * X.DAY);
if (Math.abs(r0 - 1) > 1e-9) bad('память сразу = 100%');
if (Math.abs(r1 - 0.9) > 0.001) bad('память через S дней = 90%: ' + r1);
if (X.intervalDays(3.173) !== 3) bad('интервал');
const later = now + 3 * X.DAY, good = X.schedule(g3, 3, later), hard = X.schedule(g3, 2, later), easy = X.schedule(g3, 4, later), lapse = X.schedule(g3, 1, later);
if (!(good.S > g3.S && easy.S > good.S && hard.S < good.S && lapse.S < g3.S)) bad('порядок прочности ' + [hard.S, good.S, easy.S, lapse.S].join());
if (!lapse.relearn || good.relearn) bad('забыл → вернётся сегодня, остальное нет');
if (X.schedule(null, 4, now).due <= X.schedule(null, 2, now).due) bad('первая оценка: «уже знал» даёт интервал длиннее');

// Прогресс первой версии остаётся рабочим
const oldCard = { S: 3.173, D: 5, last: now, due: 20760, reps: 1, lapses: 0, born: 20756, relearn: false, q: { 0: 1, 2: 1 } };
if (Math.abs(X.memoryOf(oldCard, now) - 1) > 1e-9 || X.schedule(oldCard, 3, later).reps !== 2) bad('старая запись темы');

// План дня
const st = X.freshState();
const today = X.dayNum();
if (X.newPool(st).length !== 77) bad('день 1: нужно 77 тем, а не ' + X.newPool(st).length);
X.TOPICS.filter(t => t.lesson <= 12).forEach(t => { st.cards[t.id] = X.schedule(null, 3); });
if (X.newPool(st).length !== 0) bad('день 1 закрыт: новых быть не должно');
const tomorrow = Date.now() + X.DAY;
const np = X.newPool(st, tomorrow);
if (np.length !== 5 || np[0].id !== '13.1' || np[4].id !== '13.5') bad('день 2: нужно 13.1–13.5, а не ' + np.map(t => t.id));
np.slice(0, 2).forEach(t => { st.cards[t.id] = X.schedule(null, 3, tomorrow); });
if (X.newPool(st, tomorrow).length !== 3) bad('день 2 частично: должно остаться 3');
if (X.duePool(st).length) bad('просрочка сразу после изучения');

// Разовая оценка 4 всем пройденным
const bulk = X.freshState();
bulk.v = 1;
bulk.cards['1.1'] = X.schedule(X.schedule(null, 1, now), 4, now + X.DAY);
bulk.cards['1.2'] = X.schedule(X.schedule(null, 3, now), 4, now + X.DAY);
const bornDay = bulk.cards['1.1'].born;
if (!X.upgradeState(bulk)) bad('upgrade не сработал');
for (const id of ['1.1', '1.2']) { const c = bulk.cards[id]; if (c.reps !== 1 || c.lapses !== 0 || c.relearn || Math.abs(c.S - 15.69105) > 1e-6 || c.born !== bornDay || c.last !== now + X.DAY) bad('upgrade результат ' + JSON.stringify(c)); }
const once = JSON.stringify(bulk.cards);
if (X.upgradeState(bulk) || JSON.stringify(bulk.cards) !== once) bad('upgrade должен быть разовым');
if (X.freshState().v !== 2) bad('новый прогресс не должен переписываться');

console.log(fails ? `\nОшибок: ${fails}` : '\nВсё сходится.');
process.exit(fails ? 1 : 0);
