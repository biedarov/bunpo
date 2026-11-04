// ─── Данные ──────────────────────────────────────────────
const TOPICS = [], BY_ID = {};
LESSONS.forEach(l => l.topics.forEach((t, i) => {
  t.id = l.n + '.' + (i + 1); t.lesson = l.n; t.num = i + 1;
  Object.assign(t, CARDS[t.id]);
  t.bq = BOOK[t.id] || [];
  TOPICS.push(t); BY_ID[t.id] = t;
}));
TOPICS.forEach(t => (t.from || []).forEach(f => { if (BY_ID[f]) (BY_ID[f].to = BY_ID[f].to || []).push(t.id); }));
const BASE_LESSONS = 12; // уроки, которые закрываются в первый день

// ─── Фуригана ────────────────────────────────────────────
const FURI_KEYS = Object.keys(FURI).sort((a, b) => b.length - a.length);
const JP_RUN = /[぀-ヿ㐀-鿿々〜ー]+(?:\{[^}]+\}[぀-ヿ㐀-鿿々〜ー]*)*/g;
const isKanji = c => /[㐀-鿿々]/.test(c);

// Разбирает японский кусок на [текст, чтение|null]
function furiTokens(run) {
  const out = []; let i = 0;
  const push = (t, r) => out.push([t, r || null]);
  while (i < run.length) {
    if (run[i + 1] === '{' && isKanji(run[i])) {
      const end = run.indexOf('}', i);
      push(run[i], run.slice(i + 2, end)); i = end + 1; continue;
    }
    if (!isKanji(run[i]) && !FURI_FIRST.has(run[i])) { push(run[i]); i++; continue; }
    let hit = null;
    for (const k of FURI_BY[run[i]] || []) if (run.startsWith(k, i)) { hit = k; break; }
    if (!hit) { push(run[i]); i++; continue; }
    const v = FURI[hit];
    if (v.includes('{')) templateTokens(v).forEach(t => out.push(t)); else push(hit, v);
    i += hit.length;
  }
  return out;
}
// Запись словаря с разметкой по иероглифам: 来{き}ます
function templateTokens(v) {
  const out = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i + 1] === '{') { const end = v.indexOf('}', i); out.push([v[i], v.slice(i + 2, end)]); i = end; }
    else out.push([v[i], null]);
  }
  return out;
}
const FURI_BY = {}, FURI_FIRST = new Set();
FURI_KEYS.forEach(k => { (FURI_BY[k[0]] = FURI_BY[k[0]] || []).push(k); FURI_FIRST.add(k[0]); });

// Весь текст каной: для проверки ввода
function toReading(s) {
  return furiTokens(String(s).replace(/\[|\]/g, '')).map(([t, r]) => r || t).join('');
}

// ─── Ромадзи → кана ──────────────────────────────────────
const KANA = {a:'あ',i:'い',u:'う',e:'え',o:'お',ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',sa:'さ',si:'し',shi:'し',su:'す',se:'せ',so:'そ',za:'ざ',zi:'じ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',ta:'た',ti:'ち',chi:'ち',tu:'つ',tsu:'つ',te:'て',to:'と',da:'だ',di:'ぢ',du:'づ',de:'で',do:'ど',na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',ha:'は',hi:'ひ',fu:'ふ',hu:'ふ',he:'へ',ho:'ほ',ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',ya:'や',yu:'ゆ',yo:'よ',ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',wa:'わ',wo:'を',kya:'きゃ',kyu:'きゅ',kyo:'きょ',gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',sha:'しゃ',shu:'しゅ',sho:'しょ',sya:'しゃ',syu:'しゅ',syo:'しょ',ja:'じゃ',ju:'じゅ',jo:'じょ',zya:'じゃ',zyu:'じゅ',zyo:'じょ',cha:'ちゃ',chu:'ちゅ',cho:'ちょ',tya:'ちゃ',tyu:'ちゅ',tyo:'ちょ',nya:'にゃ',nyu:'にゅ',nyo:'にょ',hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',bya:'びゃ',byu:'びゅ',byo:'びょ',pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ',mya:'みゃ',myu:'みゅ',myo:'みょ',rya:'りゃ',ryu:'りゅ',ryo:'りょ','-':'ー',xtu:'っ',ltu:'っ'};
// final=true: хвостовая n становится ん (при проверке)
function romajiToKana(input, final) {
  const s = input.toLowerCase(); let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (!/[a-z'-]/.test(c)) { out += c; i++; continue; }
    if (c === 'n') {
      const nx = s[i + 1];
      if (nx === 'n') { out += 'ん'; i += /[aiueoy]/.test(s[i + 2] || '') ? 1 : 2; continue; }
      if (nx === "'") { out += 'ん'; i += 2; continue; }
      if (nx && !/[aiueoy]/.test(nx)) { out += 'ん'; i++; continue; }
      if (nx === undefined) { if (final) { out += 'ん'; i++; continue; } out += c; i++; continue; }
    }
    if (c !== 'n' && c === s[i + 1] && /[bcdfghjkmpqrstvwxyz]/.test(c)) { out += 'っ'; i++; continue; }
    let done = false;
    for (const len of [3, 2, 1]) {
      const k = s.slice(i, i + len);
      if (KANA[k]) { out += KANA[k]; i += len; done = true; break; }
    }
    if (!done) { out += c; i++; }
  }
  return out;
}
const normAnswer = s => toReading(romajiToKana(String(s), true).replace(/[\s　。．.、,？?！!「」]/g, '')).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/は/g, 'わ').replace(/へ/g, 'え').replace(/を/g, 'お');
const checkInput = (typed, answers) => { const u = normAnswer(typed); return !!u && answers.some(a => normAnswer(a) === u); };

// ─── Время и дни ─────────────────────────────────────────
const DAY = 864e5, ROLLOVER = 4; // день заканчивается в 04:00
const dayNum = (ts = Date.now()) => {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 6e4 - ROLLOVER * 36e5) / DAY);
};
const dayToDate = n => new Date((n * DAY) + ROLLOVER * 36e5 + new Date((n * DAY) + ROLLOVER * 36e5).getTimezoneOffset() * 6e4);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtDay = n => { const d = dayToDate(n); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };

// ─── FSRS-5: кривая забывания и планировщик ──────────────
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const F = 19 / 81, DECAY = -0.5, TARGET = 0.9;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const d0 = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
// Сколько процентов памяти осталось через t дней при прочности S
const retention = (S, t) => Math.pow(1 + F * Math.max(0, t) / S, DECAY);
// «Забыл» = 0%, пока тема не оценена заново, хотя карточку только что видели
const memoryOf = (card, now = Date.now()) => card.relearn ? 0 : retention(card.S, (now - card.last) / DAY);
const intervalDays = S => Math.max(1, Math.round(S / F * (Math.pow(TARGET, 1 / DECAY) - 1)));

// Оценку ставишь ты сам: 1 забыл, 2 с трудом, 3 помню, 4 легко. Задания на неё не влияют.
function schedule(card, grade, now = Date.now()) {
  const today = dayNum(now);
  if (!card) {
    const S = W[grade - 1], D = d0(grade);
    return { S, D, last: now, due: today + intervalDays(S), reps: 1, lapses: grade === 1 ? 1 : 0, born: today, relearn: grade === 1 };
  }
  const t = (now - card.last) / DAY, R = retention(card.S, t);
  let D = card.D - W[6] * (grade - 3);
  D = card.D + (D - card.D) * (10 - card.D) / 9;
  D = clamp(W[7] * d0(4) + (1 - W[7]) * D, 1, 10);
  let S;
  if (dayNum(card.last) === today) S = card.S * Math.exp(W[17] * (grade - 3 + W[18]));
  else if (grade === 1) S = Math.min(card.S, W[11] * Math.pow(card.D, -W[12]) * (Math.pow(card.S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
  else S = card.S * (1 + Math.exp(W[8]) * (11 - card.D) * Math.pow(card.S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (grade === 2 ? W[15] : 1) * (grade === 4 ? W[16] : 1));
  S = clamp(S, 0.1, 36500);
  return { ...card, S, D, last: now, due: today + intervalDays(S), reps: card.reps + 1, lapses: card.lapses + (grade === 1 ? 1 : 0), relearn: grade === 1 };
}

// Разовая правка прогресса версии 1: каждая тема пройдена один раз с оценкой 4
function upgradeState(st) {
  if (st.v >= 2) return false;
  Object.keys(st.cards).forEach(id => {
    const c = st.cards[id];
    st.cards[id] = { ...schedule(null, 4, c.last), born: c.born };
  });
  st.v = 2;
  return true;
}

// ─── План дня ────────────────────────────────────────────
function freshState() {
  return { v: 2, start: dayNum(), cards: {}, log: {}, perDay: 5, furigana: true, theme: 'auto', auto: true, updated: 0 };
}
function duePool(st, now = Date.now()) {
  const today = dayNum(now);
  return TOPICS.filter(t => { const c = st.cards[t.id]; return c && (c.relearn || c.due <= today); })
    .sort((a, b) => memoryOf(st.cards[a.id], now) - memoryOf(st.cards[b.id], now));
}
function newPool(st, now = Date.now()) {
  const today = dayNum(now);
  const left = TOPICS.filter(t => !st.cards[t.id]);
  const base = left.filter(t => t.lesson <= BASE_LESSONS);
  if (base.length) return base; // уроки 1–12 — без лимита, пока не закрыты
  if (today === st.start) return [];
  const doneToday = TOPICS.filter(t => st.cards[t.id] && st.cards[t.id].born === today && t.lesson > BASE_LESSONS).length;
  return left.slice(0, Math.max(0, st.perDay - doneToday));
}
function overallMemory(st, now = Date.now()) {
  const ids = Object.keys(st.cards);
  if (!ids.length) return null;
  return ids.reduce((s, id) => s + memoryOf(st.cards[id], now), 0) / ids.length;
}
function lessonMemory(st, n, now = Date.now()) {
  const l = LESSONS.find(x => x.n === n), cs = l.topics.map(t => st.cards[t.id]).filter(Boolean);
  if (!cs.length) return null;
  return cs.reduce((s, c) => s + memoryOf(c, now), 0) / l.topics.length; // непройденные считаются как 0
}

function streak(st) {
  let d = dayNum(), n = 0;
  if (!st.log[d]) d--;
  while (st.log[d]) { n++; d--; }
  return n;
}
function forecast(st, days = 14) {
  const today = dayNum(), out = Array.from({ length: days }, () => 0);
  Object.values(st.cards).forEach(c => { const i = Math.max(0, c.due - today); if (i < days) out[i]++; });
  return out;
}

// ─── Спряжение: для карты форм ───────────────────────────
const ROWS = { 'う': 'わいうえお', 'く': 'かきくけこ', 'ぐ': 'がぎぐげご', 'す': 'さしすせそ', 'つ': 'たちつてと', 'ぬ': 'なにぬねの', 'ぶ': 'ばびぶべぼ', 'む': 'まみむめも', 'る': 'らりるれろ' };
const TE = { 'う': 'って', 'つ': 'って', 'る': 'って', 'む': 'んで', 'ぶ': 'んで', 'ぬ': 'んで', 'く': 'いて', 'ぐ': 'いで', 'す': 'して' };
function conj(v) {
  if (v.type === 'する') return { dic: 'する', neg: 'しない', stem: 'し', te: 'して', ta: 'した', pot: 'できる', vol: 'しよう', ba: 'すれば', pass: 'される', caus: 'させる', caupass: 'させられる' };
  if (v.type === 'くる') return { dic: 'くる', neg: 'こない', stem: 'き', te: 'きて', ta: 'きた', pot: 'こられる', vol: 'こよう', ba: 'くれば', pass: 'こられる', caus: 'こさせる', caupass: 'こさせられる' };
  const d = v.d, b = d.slice(0, -1);
  if (v.type === 'る') return { dic: d, neg: b + 'ない', stem: b, te: b + 'て', ta: b + 'た', pot: b + 'られる', vol: b + 'よう', ba: b + 'れば', pass: b + 'られる', caus: b + 'させる', caupass: b + 'させられる' };
  const l = d.slice(-1), r = ROWS[l];
  const te = d === '行く' ? b + 'って' : b + TE[l];
  const ta = te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た');
  return { dic: d, neg: b + r[0] + 'ない', stem: b + r[1], te, ta, pot: b + r[3] + 'る', vol: b + r[4] + 'う', ba: b + r[3] + 'ば', pass: b + r[0] + 'れる', caus: b + r[0] + 'せる', caupass: l === 'す' ? b + 'させられる' : b + r[0] + 'される' };
}

// ─── Письменные задания из «собери фразу» ────────────────
// Берём плитку, которую легче всего перепутать с лишней (読んで ↔ 読みて), и просим вписать её самому.
const plainKana = s => toReading(String(s)).replace(/[\s　。．.、,？?！!「」]/g, '');
function gapFrom(q) {
  if (q.k !== 'o' || !q.d || !q.d.length || q.t.length < 2) return null;
  const pref = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
  let best = -1, score = 0;
  q.t.forEach((tile, i) => {
    const a = plainKana(tile);
    if (!a) return;
    q.d.forEach(d => { const b = plainKana(d); if (b === a) return; const s = Math.max(pref(a, b), [...a].filter(c => b.includes(c)).length / 2); if (s > score) { score = s; best = i; } });
  });
  if (best < 0 || score < 1) return null;
  const tile = q.t[best], sentence = q.t.map((x, i) => i === best ? '＿＿' : x).join(' ');
  const ans = [tile];
  if (/は$/.test(plainKana(tile))) ans.push(plainKana(tile).replace(/は$/, 'わ'));
  return { k: 'i', pre: q.q, q: sentence, a: ans, w: q.w, s: q.s, show: q.t.map((x, i) => i === best ? `[${x}]` : x).join(' '), from: q };
}
TOPICS.forEach(t => { t.gq = [...t.bq, ...(t.q || [])].map(gapFrom).filter(Boolean); });
// Из выбора: прячем в верном ответе слова, которыми он отличается от самого похожего неверного
function gapFromChoice(q) {
  if (q.k !== 'c' || /[а-яё]/i.test(q.o[0])) return null;
  const right = q.o[0].split(/\s+/);
  if (right.length < 2) return null;
  let best = null;
  q.o.slice(1).forEach(o => {
    const w = o.split(/\s+/);
    if (w.length !== right.length) return;
    const diff = right.map((x, i) => x !== w[i] ? i : -1).filter(i => i >= 0);
    if (diff.length && diff.length <= 2 && diff.length < right.length && (!best || diff.length < best.length)) best = diff;
  });
  if (!best) return null;
  const hide = best.map(i => right[i]).join(' ');
  if (!plainKana(hide)) return null;
  return { k: 'i', pre: q.q, q: right.map((x, i) => best.includes(i) ? '＿＿' : x).join(' '), a: [hide], w: q.w, s: q.s, show: right.map((x, i) => best.includes(i) ? `[${x}]` : x).join(' '), from: q };
}
TOPICS.forEach(t => { t.gq.push(...[...t.bq, ...(t.q || [])].map(gapFromChoice).filter(Boolean)); });

// ─── Написать предложение целиком ────────────────────────
// Дан смысл (или вопрос), пишешь всю фразу. В помощь — нужные слова, кроме того места, где проверяется грамматика.
const shuffleSeed = (a, seed) => { const r = [...a]; let x = seed; for (let i = r.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = x % (i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };
function keyTile(q) {
  const pref = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
  let best = -1, score = 0;
  q.t.forEach((tile, i) => { const a = plainKana(tile); if (!a) return;
    (q.d || []).forEach(d => { const b = plainKana(d); if (b === a) return; const s = Math.max(pref(a, b), [...a].filter(ch => b.includes(ch)).length / 2); if (s > score) { score = s; best = i; } }); });
  return score >= 1 ? best : -1;
}
function sentFrom(q, n) {
  if (q.k === 'o' && q.t.length >= 2) {
    const key = keyTile(q);
    const words = q.t.filter((_, i) => i !== key).map(x => x.replace(/[。、？！]$/, ''));
    return { k: 'i', full: true, q: q.q, a: [q.t.join(''), ...(q.alts || []).map(x => x.join(''))], help: shuffleSeed(words, n + 7), w: q.w, s: q.s, show: q.t.join(' '), from: q };
  }
  if (q.k === 'c' && !/[а-яё]/i.test(q.o[0])) {
    const right = q.o[0].split(/\s+/);
    if (right.length < 2 || /[а-яё]/i.test(q.o.join(''))) return null;
    let diff = null;
    q.o.slice(1).forEach(o => { const w = o.split(/\s+/); if (w.length !== right.length) return;
      const d = right.map((x, i) => x !== w[i] ? i : -1).filter(i => i >= 0); if (d.length && d.length < right.length && (!diff || d.length < diff.length)) diff = d; });
    const words = right.filter((_, i) => !(diff || []).includes(i)).map(x => x.replace(/[。、？！]$/, '').replace(/^(はい|いいえ|ええ)、/, ''));
    return { k: 'i', full: true, q: q.q, a: [q.o[0]], help: shuffleSeed(words.filter(Boolean), n + 3), w: q.w, s: q.s, show: q.o[0], from: q };
  }
  return null;
}
TOPICS.forEach(t => { t.sq = [...t.bq, ...(t.q || [])].map(sentFrom).filter(Boolean); });
