// ─── Хранение ────────────────────────────────────────────
const KEY = 'bunpo.v1';
let st = freshState(), cloud = null, cloudStatus = 'local', saveTimer = null, saving = false, dirty = false;
const lsRead = () => { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
const lsWrite = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
const local = lsRead();
if (local && local.cards) {
  st = Object.assign(freshState(), local);
  if (upgradeState(st)) { st.updated = Date.now(); lsWrite(); }
}

function save() {
  st.updated = Date.now();
  lsWrite();
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushCloud, 1200);
}
async function pushCloud() {
  if (!cloud || saving || !dirty) return;
  saving = true; dirty = false;
  try { await cloud.set(JSON.parse(JSON.stringify(st))); cloudStatus = 'cloud'; }
  catch (e) { dirty = true; cloudStatus = 'error'; }
  saving = false;
  if (dirty) saveTimer = setTimeout(pushCloud, 1500);
}
async function pullCloud() {
  if (!cloud) return;
  try {
    const snap = await cloud.get();
    const remote = snap.exists ? snap.data() : null;
    if (remote && remote.cards && (remote.updated || 0) > (st.updated || 0)) {
      st = Object.assign(freshState(), JSON.parse(JSON.stringify(remote)));
      if (upgradeState(st)) { st.updated = Date.now(); dirty = true; pushCloud(); }
      lsWrite();
      if (!S) render();
    } else if (st.updated && (!remote || (remote.updated || 0) < st.updated)) { dirty = true; pushCloud(); }
    cloudStatus = 'cloud';
  } catch (e) { cloudStatus = 'error'; }
}
async function connectCloud() {
  if (!window.claude || !window.claude.use) return;
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    cloud = db.doc('data/users/' + id + '/progress');
    await pullCloud();
    if (view === 'settings' && !S) render();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !S) pullCloud(); });
  } catch (e) { cloudStatus = 'error'; }
}

// ─── Текст ───────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const furiHtml = run => furiTokens(run).map(([t, r]) => r ? `<ruby>${t}<rt>${r}</rt></ruby>` : t).join('');
const jpHtml = s => s.replace(JP_RUN, m => `<span class="ja" lang="ja">${furiHtml(m)}</span>`);
// [..] — подсветка, {..} — чтение, остальное как есть
function rich(s) {
  return String(s).split(/(\[[^\]]*\])/).map(p => p.startsWith('[') && p.endsWith(']') && p.length > 2
    ? `<span class="hl">${jpHtml(esc(p.slice(1, -1)))}</span>` : jpHtml(esc(p))).join('');
}
const plain = s => String(s).replace(/\[|\]/g, '').replace(/\{[^}]*\}/g, '');
const pl = (n, a, b, c) => { const m = n % 100, k = n % 10; return (m > 10 && m < 20) ? c : k === 1 ? a : (k > 1 && k < 5) ? b : c; };
const pct = r => Math.round(r * 100);
const memClass = r => r >= 0.97 ? 'm5' : r >= 0.9 ? 'm4' : r >= 0.8 ? 'm3' : r >= 0.65 ? 'm2' : 'm1';
const topicLabel = t => t.t;
const memTint = id => st.cards[id] ? 'tint-' + memClass(memoryOf(st.cards[id])) : '';
const WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function dueLabel(c) {
  const d = c.due - dayNum();
  if (c.relearn) return 'сегодня, до конца занятия';
  if (d <= 0) return 'сегодня';
  if (d === 1) return 'завтра';
  return fmtDay(c.due);
}

// ─── Навигация ───────────────────────────────────────────
let view = 'today', viewArg = null, S = null, mapVerb = 0, cameFrom = null, navDir = '', lastKey = '', mapTop = 0;
function go(v, arg, opts) {
  if (S && !(opts && opts.keep)) stopSession();
  cameFrom = v === 'topic' ? (view === 'topic' ? cameFrom : { view, arg: viewArg }) : null;
  const main = document.querySelector('.main'), wasTopic = view === 'topic';
  if ((view === 'map' || view === 'news') && main) mapTop = main.scrollTop;
  view = v; viewArg = arg === undefined ? null : arg;
  render();
  if ((v === 'map' || v === 'news') && wasTopic) document.querySelector('.main').scrollTop = mapTop;
  try { history.replaceState(null, '', '#' + (v === 'topic' ? 'topic-' + arg : v === 'settings' ? 'today' : v)); } catch (e) {}
}
function stepTopic(d) {
  const t = TOPICS[TOPICS.indexOf(BY_ID[viewArg]) + d];
  if (!t) return;
  navDir = d > 0 ? 'from-right' : 'from-left';
  go('topic', t.id);
}
function readHash() {
  const h = (location.hash || '').slice(1);
  if (h.startsWith('topic-') && BY_ID[h.slice(6)]) { view = 'topic'; viewArg = h.slice(6); }
  else if (['today', 'map', 'news', 'sheet'].includes(h)) view = h;
}

// ─── Каркас ──────────────────────────────────────────────
const app = document.getElementById('app');
// Всё содержимое должно войти в экран: если не входит, страница равномерно уменьшается
function fit() {
  document.querySelectorAll('.fit, .sess-col').forEach(el => {
    const box = el.parentElement, cs = getComputedStyle(box), room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    el.style.zoom = 1;
    if (innerWidth <= 860 || el.closest('.phase-task, .phase-result')) return;
    for (let z = 1; z >= 0.6 && el.getBoundingClientRect().height > room; z -= 0.04) el.style.zoom = z;
  });
}
window.addEventListener('resize', fit);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
function render() {
  document.body.classList.toggle('no-furi', !st.furigana);
  if (st.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', st.theme);
  hideTip();
  if (S) { renderSession(); fit(); animate(S.phase + S.i + ':' + (S.phase === 'task' ? S.t : ''), '.sess-col'); return; }
  const due = duePool(st).length, nw = newPool(st).length;
  const navItem = (v, label, badge) => `<button class="${view === v ? 'on' : ''}" data-go="${v}"><span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  const body = { today: viewToday, news: viewNews, topic: viewTopic, map: viewMap, sheet: viewSheet, settings: viewSettings }[view]();
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><b lang="ja">文法</b><span>Bunpō</span></div>
      <nav class="nav">${navItem('today', 'Сегодня', due + nw || '')}${navItem('sheet', 'Шпаргалка')}${navItem('map', 'Карта форм')}${navItem('settings', 'Настройки')}</nav>
    </aside>
    <main class="main"><div class="col ${view === 'map' || view === 'news' ? '' : 'fit'} view-${view}">${body}</div></main>
    <nav class="bottom">${[['today', 'Сегодня'], ['sheet', 'Шпаргалка'], ['map', 'Карта'], ['settings', 'Ещё']].map(([v, l]) => `<button class="${view === v ? 'on' : ''}" data-go="${v}">${l}</button>`).join('')}</nav>
  </div>`;
  fit();
  animate(view + viewArg, '.col');
}
function animate(key, sel) {
  const el = document.querySelector(sel);
  if (el && key !== lastKey) { el.classList.add('enter'); if (navDir) el.classList.add(navDir); }
  lastKey = key; navDir = '';
}

// ─── Сегодня ─────────────────────────────────────────────
const BOOKS = [{ n: 1, cls: 'g1', lessons: LESSONS.filter(l => l.n <= 12) }, { n: 2, cls: 'g2', lessons: LESSONS.filter(l => l.n > 12) }];
const bookTag = t => `<span class="book ${t.lesson <= 12 ? 'g1' : 'g2'}"><i></i>Genki ${t.lesson <= 12 ? 1 : 2}</span><span>Урок ${t.lesson} · тема ${t.num}</span>`;
function viewToday() {
  const now = Date.now(), today = dayNum(now), due = duePool(st, now), nw = newPool(st, now), d = dayToDate(today);
  const learned = Object.keys(st.cards).length, dayNo = today - st.start + 1;
  const todayLog = st.log[today] || { n: 0, r: 0 }, doneTotal = todayLog.n + todayLog.r, planTotal = doneTotal + due.length + nw.length;
  const mins = Math.max(1, Math.round(nw.length * 0.7 + due.length * 0.4));
  const first = today === st.start && nw.length && nw[0].lesson <= BASE_LESSONS;
  const head = first ? `Уроки 1–12: ещё ${nw.length} ${pl(nw.length, 'тема', 'темы', 'тем')}`
    : due.length + nw.length ? [due.length ? `${due.length} ${pl(due.length, 'повторение', 'повторения', 'повторений')}` : '', nw.length ? `${nw.length} ${pl(nw.length, 'новая тема', 'новые темы', 'новых тем')}` : ''].filter(Boolean).join(' и ')
    : 'На сегодня всё';
  const left = TOPICS.length - learned;
  const after = TOPICS.filter(t => !st.cards[t.id] && t.lesson > BASE_LESSONS && !nw.includes(t)).length;
  const finish = left ? today + Math.ceil(after / st.perDay) : null;
  const sub = due.length + nw.length ? `≈ ${mins} мин · сделано ${doneTotal} из ${planTotal}` : tomorrowPlan();
  const plan = `<section class="plan"><div class="plan-t"><div class="eyebrow">${WEEK[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} · день ${dayNo}</div><h1>${head}</h1><p>${sub}</p></div>
    ${due.length + nw.length ? `<button class="btn" data-act="start">${doneTotal ? 'Продолжить' : 'Начать'}</button>` : ''}</section>`;
  return `<div class="bento"><div class="b-left">${plan}${statTiles(now, learned, left, finish, todayLog)}</div>${memoryRing(now)}</div><div class="learn-row"><div class="books">${BOOKS.map(b => bookCard(b, now)).join('')}</div>${learnPanel(now)}</div>
    <div class="charts">${learned ? forecastChart() : ''}</div>`;
}
let learnType = null;
function learnPanel(now) {
  const cur = LEARN_TYPES.find(t => t.k === learnType);
  const item = t => {
    const done = t.ids.filter(id => st.cards[id]), m = done.length ? done.reduce((a, id) => a + memoryOf(st.cards[id], now), 0) / done.length : null;
    return `<button class="ltype ${learnType === t.k ? 'on' : ''}" data-ltype="${t.k}"><span>${t.name}</span><em>${done.length}/${t.ids.length}${m === null ? '' : ` · <b class="c-${memClass(m)}">${pct(m)}%</b>`}</em></button>`;
  };
  const detail = cur ? `<div class="ltype-how"><p><b>Что учить.</b> ${cur.what}</p><p><b>Как учить.</b> ${cur.how}</p>
      <div class="row-btns">${cur.ids.some(id => st.cards[id]) ? '<button class="btn btn-sm" data-act="study-type">Повторить эту группу</button>' : ''}<button class="linkish" data-ltype="off">Показать все</button></div></div>`
    : '<p class="ltype-hint">Выбери, что учить. Клетки других тем погаснут, а здесь появится способ, как учить именно это.</p>';
  return `<section class="ltypes"><div class="sec-h"><h2>Что учить</h2></div>${LEARN_TYPES.map(item).join('')}${detail}</section>`;
}
function tomorrowPlan() {
  const tomorrow = Date.now() + DAY;
  const r = duePool(st, tomorrow).length, n = newPool(st, tomorrow).length;
  if (!r && !n) return 'Завтра заданий нет.';
  return `Завтра: ${r} ${pl(r, 'повторение', 'повторения', 'повторений')}, ${n} ${pl(n, 'новая тема', 'новые темы', 'новых тем')}.`;
}
// Кольцо: средняя память сейчас и что с ней будет без повторений
function memoryRing(now) {
  const m = overallMemory(st, now), ids = Object.keys(st.cards);
  const avgIn = n => ids.reduce((s, id) => s + memoryOf(st.cards[id], now + n * DAY), 0) / ids.length;
  const later = m === null ? '<p>Появится после первой темы.</p>' : `<dl><div><dt>завтра</dt><dd>${pct(avgIn(1))}%</dd></div><div><dt>через неделю</dt><dd>${pct(avgIn(7))}%</dd></div><div><dt>через месяц</dt><dd>${pct(avgIn(30))}%</dd></div></dl>`;
  return `<section class="ring-card ${m === null ? '' : memClass(m)}"><div class="ring" style="--p:${m === null ? 0 : pct(m)}"><div><b>${m === null ? '—' : pct(m)}<small>%</small></b><span>память</span></div></div>${later}</section>`;
}
function statTiles(now, learned, left, finish, todayLog) {
  const days = streak(st), done = passedToday(now), fresh = done.filter(t => st.cards[t.id].born === dayNum(now)).length;
  const tile = (value, label, note) => `<div class="tile-s"><b>${value}</b><span>${label}</span><small>${note}</small></div>`;
  return `<div class="tiles-s">
    <button class="tile-s tile-new" data-go="news"><b>${done.length}</b><span>Пройдено сегодня</span><small>из них новых ${fresh} · открыть все →</small></button>
    ${tile(`${learned}<em>/${TOPICS.length}</em>`, 'тем пройдено', left ? `вся книга закроется ${fmtDay(finish)}` : 'пройдены все')}
    ${tile(days, pl(days, 'день подряд', 'дня подряд', 'дней подряд'), `сегодня ${todayLog.n + todayLog.r} ${pl(todayLog.n + todayLog.r, 'тема', 'темы', 'тем')}`)}
  </div>`;
}
function cellHtml(t, now) {
  const c = st.cards[t.id];
  const r = c ? memoryOf(c, now) : null, isDue = c && (c.relearn || c.due <= dayNum(now));
  const tip = c ? `${pct(r)}%, повтор ${dueLabel(c)}` : 'ещё не пройдена';
  const dim = learnType && learnTypeOf(t.id).k !== learnType;
  return `<button class="cell ${c ? memClass(r) : ''} ${isDue ? 'due' : ''} ${dim ? 'dim' : ''}" data-topic="${t.id}" data-tip="<b>${esc(t.id + ' ' + plain(t.t))}</b><br>${esc(tip)}" aria-label="${esc(t.id + ' ' + plain(t.t) + ': ' + tip)}"></button>`;
}
// Книга: сколько пройдено, память и клетки тем по урокам. Клетка открывает тему.
function bookCard(b, now) {
  const ts = b.lessons.flatMap(l => l.topics), cs = ts.filter(t => st.cards[t.id]);
  const avg = cs.length ? cs.reduce((s, t) => s + memoryOf(st.cards[t.id], now), 0) / cs.length : null;
  const row = l => { const m = lessonMemory(st, l.n); return `<div class="g-row" data-tip="${esc(l.n + '. ' + l.name)}"><span class="ln">${l.n}</span><div class="cells">${l.topics.map(t => cellHtml(t, now)).join('')}</div><span class="lp">${m === null ? '' : pct(m) + '%'}</span></div>`; };
  return `<section class="book-card ${b.cls}"><div class="book-h"><h2><i></i>Genki ${b.n}</h2><span>${cs.length}/${ts.length} тем${avg === null ? '' : ' · память ' + pct(avg) + '%'}</span></div>
    <div class="book-bar"><i style="width:${cs.length / ts.length * 100}%"></i></div>
    <div class="book-rows">${b.lessons.map(row).join('')}</div></section>`;
}
function barChart(title, note, data, labels, tipOf) {
  const max = Math.max(1, ...data);
  return `<section class="chart"><div class="sec-h"><h2>${title}</h2><span>${note}</span></div>
    <div class="bars">${data.map((n, i) => `<div class="bar-w" data-tip="${esc(tipOf(i, n))}"><i style="height:${n ? Math.max(6, n / max * 100) : 0}%"></i></div>`).join('')}</div>
    <div class="bar-x"><span>${labels[0]}</span><span>${labels[1]}</span></div></section>`;
}
function forecastChart() {
  const today = dayNum(), data = forecast(st);
  return barChart('Повторы вперёд', `${data.reduce((a, b) => a + b, 0)} за 14 дней`, data, ['сегодня', 'через 2 недели'], (i, n) => `${fmtDay(today + i)}: ${n} ${pl(n, 'тема', 'темы', 'тем')}`);
}
// ─── Новые темы дня ──────────────────────────────────────
// Что пройдено сегодня: и новые темы, и повторы. Оценка в этот день и есть прохождение.
const passedToday = (now = Date.now()) => TOPICS.filter(t => { const c = st.cards[t.id]; return c && dayNum(c.last) === dayNum(now); });
function viewNews() {
  const today = dayNum(), list = passedToday(), fresh = list.filter(t => st.cards[t.id].born === today), old = list.filter(t => st.cards[t.id].born !== today);
  const card = t => { const c = st.cards[t.id], r = memoryOf(c); return `<article class="news-card"><header class="t-head"><div class="t-meta">${bookTag(t)}<span class="pill acc">${pct(r)}% · повтор ${dueLabel(c)}</span><button class="linkish" data-topic="${t.id}">Открыть тему</button></div><h2 class="t-title">${rich(t.t)}</h2><p class="t-gist">${rich(t.g)}</p></header><div class="topic"><div class="c1">${topicBody(t)}</div><div class="c2">${variantsHtml(t)}</div></div></article>`; };
  const group = (title, ts) => ts.length ? `<section class="news-group"><div class="sec-h"><h2>${title}</h2><span>${ts.length}</span></div><div class="news">${ts.map(card).join('')}</div></section>` : '';
  return `<div class="t-bar"><button class="back" data-go="today">← Назад</button></div>
    <header class="today-h"><h1>${list.length ? `Сегодня пройдено: ${list.length} ${pl(list.length, 'тема', 'темы', 'тем')}` : 'Сегодня ты ещё ничего не прошёл'}</h1><p>${list.length ? 'Вся информация по каждой теме прямо здесь.' : 'Здесь появятся темы, как только ты их оценишь.'}</p></header>
    ${group('Новые', fresh)}${group('Повторённые', old)}`;
}

// ─── Карточка темы ───────────────────────────────────────
const SPEAK = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 6v4h2.5L9 13V3L5.5 6H3Z" fill="currentColor" stroke="none"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.7 3.7a6 6 0 0 1 0 8.6" stroke-linecap="round"/></svg>';
let CZ = null; // во время проверки: номер текущего скрытого места, открыто ли оно, отметки
const HAS_JA = /[぀-ヿ㐀-鿿]/;
function czClass(n) {
  if (!CZ) return '';
  if (n < CZ.at) return CZ.marks[n] ? 'cz cz-ok' : 'cz cz-miss';
  if (n === CZ.at) return CZ.shown ? 'cz cz-cur cz-shown' : 'cz cz-cur';
  return 'cz cz-hide';
}
const czNext = () => CZ ? CZ.n++ : -1;
// В строке таблицы скрываются японские ячейки. Если их несколько, первая остаётся подсказкой (словарная форма).
function rowHtml(r) {
  const ja = r.map((c, i) => HAS_JA.test(c) ? i : -1).filter(i => i >= 0), hide = new Set(ja.length > 1 ? ja.slice(1) : ja);
  const n = CZ && hide.size ? czNext() : -1, cls = n >= 0 ? czClass(n) : '';
  return `<tr>${r.map((c, i) => `<td${hide.has(i) && n >= 0 ? ` class="${cls}" data-cz="${n}"` : ''}><span>${rich(c)}</span></td>`).join('')}</tr>`;
}
const czBlock = (html, tag = 'div', extra = '') => { const n = czNext(); return n < 0 ? `<${tag}${extra ? ` class="${extra}"` : ''}>${html}</${tag}>` : `<${tag} class="${extra} ${czClass(n)}" data-cz="${n}"><span>${html}</span></${tag}>`; };
const tableHtml = tb => `${tb.cap ? `<div class="cap">${rich(tb.cap)}</div>` : ''}<div class="tbl-w"><table>${tb.h.some(Boolean) ? `<thead><tr>${tb.h.map(h => `<th>${rich(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${tb.r.map(rowHtml).join('')}</tbody></table></div>`;
// Блоки появляются, только если они есть у темы
// Правая колонка темы: таблица вариантов
const variantsHtml = t => t.v ? `<section class="blk"><div class="lab">ВСЕ ВАРИАНТЫ</div>${[].concat(t.v).map(tableHtml).join('')}</section>` : '';
function topicBody(t) {
  const sec = (name, html) => `<section class="blk"><div class="lab">${name}</div>${html}</section>`;
  const o = t.o ? sec('ОТКУДА', `<p>${rich(t.o)}</p>`) : '';
  const r = `<div class="rule"><div class="lab">ПРАВИЛО</div>${czBlock(rich(t.r))}</div>`;
  const e = t.e ? sec('ИСКЛЮЧЕНИЯ', czBlock(`<ul class="excs">${t.e.map(x => `<li>${rich(x)}</li>`).join('')}</ul>`)) : '';
  const c = t.c ? sec('СРАВНЕНИЕ', tableHtml(t.c)) : '';
  const src = t.src ? `<p class="src">${rich(t.src)}</p>` : '';
  return o + r + e + c + src;
}
function chip(id) {
  const t = BY_ID[id], c = st.cards[id];
  return `<button class="chip ${memTint(id)}" data-topic="${id}"><span>${rich(t.t)}</span><em>${c ? pct(memoryOf(c)) + '%' : t.id}</em></button>`;
}
function viewTopic() {
  const t = BY_ID[viewArg], c = st.cards[t.id], lesson = LESSONS.find(l => l.n === t.lesson);
  const i = TOPICS.indexOf(t), prev = TOPICS[i - 1], next = TOPICS[i + 1];
  const backTo = cameFrom && cameFrom.view && cameFrom.view !== 'topic' ? cameFrom.view : 'today';
  const links = [t.from && t.from.length ? `<div class="row"><span>Опирается на</span>${t.from.map(chip).join('')}</div>` : '', t.to && t.to.length ? `<div class="row"><span>Ведёт к</span>${t.to.map(chip).join('')}</div>` : ''].join('');
  return `<div class="t-bar"><button class="back" data-go="${backTo}">← Назад</button>
    <div class="arrows"><button class="arrow" data-step="-1" ${prev ? '' : 'disabled'} aria-label="Предыдущая тема"${prev ? ` data-tip="${esc(prev.id + ' ' + plain(prev.t))}"` : ''}>←</button><span>${t.id}</span><button class="arrow" data-step="1" ${next ? '' : 'disabled'} aria-label="Следующая тема"${next ? ` data-tip="${esc(next.id + ' ' + plain(next.t))}"` : ''}>→</button></div></div>
  <article class="topic"><div class="c1">
    <header class="t-head">
      <div class="t-meta">${bookTag(t)}${c ? `<span class="pill acc">память ${pct(memoryOf(c))}%</span>` : '<span class="pill">ещё не пройдена</span>'}</div>
      <h1 class="t-title">${rich(t.t)}</h1><p class="t-gist">${rich(t.g)}</p></header>
    ${topicBody(t)}
    ${links ? `<div class="links">${links}</div>` : ''}
    ${c ? memoryCurve(c) : ''}
    <div class="row-btns">${c ? `<button class="btn btn-sm" data-act="review-one" data-id="${t.id}">Проверить себя</button>` : ''}<button class="btn btn-2 btn-sm" data-act="practice" data-id="${t.id}">Потренироваться</button></div>
  </div><div class="c2">${variantsHtml(t)}</div></article>`;
}
function memoryCurve(c) {
  const r = memoryOf(c), m = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  return `<section class="metrics">${m(pct(r) + '%', 'память')}${m((c.S < 10 ? c.S.toFixed(1) : Math.round(c.S)) + ' дн.', 'прочность')}${m(dueLabel(c), 'повтор')}${m(c.reps + ' / ' + c.lapses, 'оценок / забыл')}</section>`;
}

// ─── Карта форм ──────────────────────────────────────────
const idNum = id => { const [a, b] = id.split('.'); return +a * 100 + +b; };
// ─── Шпаргалка ───────────────────────────────────────────
// Режим «проверить себя»: значения скрыты, называешь смысл сам и открываешь кликом
let sheetHide = false, sheetOpen = new Set();
function viewSheet() {
  const item = ([jp, ru, id], k) => {
    const shown = !sheetHide || sheetOpen.has(k), c = st.cards[id];
    return `<div class="sh-row ${c ? memClass(memoryOf(c)) : ''}"><button class="sh-jp" data-topic="${id}" title="Открыть тему ${id}">${rich(jp)}</button><button class="sh-ru ${shown ? '' : 'closed'}" data-sheet="${k}">${shown ? rich(ru) : '?'}</button></div>`;
  };
  const cols = SHEET.map((g, gi) => `<section class="sh-group"><h2>${g.h}${g.ex ? ` <span lang="ja">${rich(g.ex)}</span>` : ''}</h2>${g.items.map((it, ii) => item(it, gi + ':' + ii)).join('')}</section>`).join('');
  const total = SHEET.reduce((a, g) => a + g.items.length, 0);
  return `<header class="sh-head"><div><h1>Вся грамматика на одном экране</h1><p>Пример на 読む и смысл. Клик по японскому — открыть тему.</p></div>
      <div class="row-btns"><button class="btn btn-sm ${sheetHide ? '' : 'btn-2'}" data-act="sheet-hide">${sheetHide ? `Проверка: открыто ${sheetOpen.size} из ${total}` : 'Проверить себя: скрыть значения'}</button>${sheetHide ? '<button class="linkish" data-act="sheet-show">Показать всё</button>' : ''}</div></header>
    <div class="sheet">${cols}</div>
    <div class="sh-long"><b>Это коротко не объяснить, читай целиком:</b>${SHEET_LONG.map(([n, id]) => `<button class="chip" data-topic="${id}">${rich(n)}</button>`).join('')}</div>`;
}

function viewMap() {
  const v = MAP_VERBS[mapVerb], c = conj(v);
  const memTag = id => { const k = st.cards[id]; return k ? pct(memoryOf(k)) + '%' : id; };
  const bases = MAP_GROUPS.flatMap(g => g.rows).map(r => {
    const title = typeof r.title === 'function' ? r.title(c) : r.title;
    const items = r.items.filter(i => (i[3] !== 'trans' || v.trans) && (i[3] !== 'notmove' || (v.d !== '行く' && v.type !== 'くる')))
      .map(i => ({ jp: typeof i[0] === 'function' ? i[0](c) : i[0], ru: i[1], id: i[2] })).sort((a, b) => idNum(a.id) - idNum(b.id));
    return `<section class="base"><div class="base-h"><b lang="ja">${furiHtml(title)}</b><span><strong>${esc(r.name)}</strong> — ${rich(r.sub)}</span></div>
      <p class="base-w">${rich(ROW_WHY[r.name])}</p>
      <div class="forms">${items.map(i => `<button class="form ${memTint(i.id)}" data-topic="${i.id}"><span class="j ja" lang="ja">${furiHtml(i.jp)}</span><span class="p">${memTag(i.id)}</span><span class="r">${rich(i.ru)}</span></button>`).join('')}</div></section>`;
  }).join('');
  return `<header class="today-h"><h1>Карта форм</h1><p>Одна форма глагола, всё, что к ней цепляется. Выбери глагол, нажми на форму, чтобы открыть тему.</p></header>
    <div class="map-bar"><div class="tabs">${MAP_VERBS.map((m, i) => `<button class="tab ${i === mapVerb ? 'on' : ''}" lang="ja" data-verb="${i}">${furiHtml(m.d || m.label)}</button>`).join('')}</div>
    <div class="legend"><span><i class="tint-m1"></i>&lt;65%</span><span><i class="tint-m2"></i>65–80</span><span><i class="tint-m3"></i>80–90</span><span><i class="tint-m4"></i>90–97</span><span><i class="tint-m5"></i>97–100</span><span><i style="border:1px solid var(--line-2)"></i>ещё не пройдена</span></div></div>
    ${bases}
    <section><div class="sec-h"><h2>Перед чем что меняется</h2><span>сущ. и な-прил. ведут себя по-разному</span></div>
      <div class="tbl-w"><table><thead><tr>${MAP_ADAPTER.h.map(h => `<th>${rich(h)}</th>`).join('')}</tr></thead><tbody>${MAP_ADAPTER.r.map(x => `<tr><td>${rich(x[0])}</td><td>${rich(x[1])}</td><td>${rich(x[2])}</td><td>${rich(x[3])}</td><td>${x[4].map(id => `<button class="linkish" data-topic="${id}">${id}</button>`).join(' ')}</td></tr>`).join('')}</tbody></table></div></section>
    <section><div class="sec-h"><h2>Что получается на выходе</h2><span>и спрягается дальше по правилам этого типа</span></div>
      <div class="kinds">${MAP_KINDS.map(([k, ids]) => `<div class="kind"><b>${rich(k)}</b><div>${ids.map(chip).join('')}</div></div>`).join('')}</div></section>`;
}

// ─── Настройки ───────────────────────────────────────────
let backupText = '', backupMsg = '', resetArm = false;
function viewSettings() {
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(st[key]) === String(v) ? 'on' : ''}" data-set="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
  const syncText = { cloud: 'Прогресс сохраняется в твой аккаунт Claude и в браузер.', local: 'Прогресс сохраняется только в этом браузере. Делай резервную копию.', error: 'Облако сейчас недоступно, прогресс сохранён в браузере. Синхронизация повторится сама.' }[cloudStatus];
  return `<header class="today-h"><h1>Настройки</h1><p>${esc(syncText)}</p></header>
  <section class="set">
    <div class="set-r"><div>Новых тем в день<span>Уроки 1–12 идут без лимита, дальше по этому числу.</span></div><input class="num" id="perday" type="number" min="0" step="1" inputmode="numeric" value="${st.perDay}" aria-label="Новых тем в день"></div>
    <div class="set-r"><div>Фуригана<span>Чтение над иероглифами.</span></div>${seg('furigana', [[true, 'Показывать'], [false, 'Скрыть']])}</div>
    <div class="set-r"><div>Верные ответы в тренировке<span>Сразу к следующему заданию или по кнопке.</span></div>${seg('auto', [[true, 'Сразу'], [false, 'По кнопке']])}</div>
    <div class="set-r"><div>Тема оформления</div>${seg('theme', [['auto', 'Система'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
  </section>
  <section><div class="sec-h"><h2>Как считается память</h2></div>
    <ul class="notes"><li>Расписание автоматическое: новые темы и повторы приходят сами, сначала повторы, потом новое.</li><li>Насколько помнишь, оцениваешь ты сам: открываешь тему, читаешь и ставишь оценку от «Забыл» до «Легко».</li><li>Процент — расчётная вероятность вспомнить тему. Считается по твоим оценкам и времени с последнего повтора (формула FSRS-5).</li><li>Повтор назначается на день, когда процент дойдёт примерно до 90%.</li><li>Задания — только тренировка по желанию. На процент и расписание они не влияют.</li><li>Новый день начинается в 04:00.</li></ul></section>
  <section><div class="sec-h"><h2>Резервная копия</h2></div>
    <div class="row-btns"><button class="btn btn-2 btn-sm" data-act="export">Показать копию</button><button class="btn btn-2 btn-sm" data-act="copy">Скопировать</button><button class="btn btn-2 btn-sm" data-act="import">Загрузить из поля</button></div>
    <p class="empty" id="backup-msg">${esc(backupMsg)}</p>
    <textarea class="backup" id="backup" aria-label="Текст резервной копии" placeholder="Сюда попадёт копия. Чтобы восстановить, вставь её и нажми «Загрузить из поля».">${esc(backupText)}</textarea></section>
  <section><div class="row-btns"><button class="btn btn-2 btn-sm" data-act="reset">${resetArm ? 'Точно стереть весь прогресс' : 'Стереть прогресс'}</button>${resetArm ? '<button class="linkish" data-act="reset-cancel">Отмена</button>' : ''}</div></section>`;
}

// ─── Занятие ─────────────────────────────────────────────
// Новая тема: читаешь, потом вопросы. Повтор: сразу вопросы. Процент верных с первого раза ставит оценку сам.
const QN_NEW = 10, QN_REVIEW = 6, QN_PRACTICE = 12;
let UNDO = [];
function startSession(queue, single) {
  S = { queue, i: 0, single: !!single, flash: null, done: 0, began: Date.now(), item: null };
  UNDO = [];
  window.scrollTo(0, 0);
  enterItem();
}
function buildQueue() {
  const now = Date.now();
  const q = duePool(st, now).map(t => ({ id: t.id, mode: st.cards[t.id].relearn ? 'relearn' : 'review' }));
  newPool(st, now).forEach(t => q.push({ id: t.id, mode: 'new' }));
  return q;
}
function stopSession() { clearTimeout(S && S.timer); S = null; UNDO = []; }
function enterItem() {
  clearTimeout(S.timer);
  if (S.i >= S.queue.length) { S.phase = 'done'; render(); return; }
  S.item = S.queue[S.i]; S.topic = BY_ID[S.item.id]; S.peek = false; S.showCard = false;
  if (S.item.mode === 'new' && !st.cards[S.item.id]) { S.phase = 'read'; render(); window.scrollTo(0, 0); return; }
  startQuiz();
}
// Сначала вопросы из учебника, остаток добирают свои. Ошибку зададут ещё раз в конце, но в процент она уже не идёт.
// Сначала задания, где пишешь предложение целиком; не хватает — письменные формы, потом выбор
function quizFor(t, n) {
  const pick = [], used = new Set();
  const add = q => { if (pick.length >= n || used.has(q) || (q.from && used.has(q.from))) return; pick.push(q); used.add(q); if (q.from) used.add(q.from); };
  const book = new Set(t.bq || []);
  shuffle([...(t.sq || [])].filter(q => book.has(q.from))).forEach(add);
  shuffle([...(t.sq || [])]).forEach(add);
  shuffle([...(t.bq || []), ...(t.q || [])].filter(q => q.k === 'i')).forEach(add);
  shuffle([...(t.gq || [])]).forEach(add);
  shuffle([...(t.bq || []), ...(t.q || [])]).forEach(add);
  return shuffle(pick).map(q => ({ q }));
}
function startQuiz() {
  S.qs = quizFor(S.topic, S.practice ? QN_PRACTICE : S.item.mode === 'new' ? QN_NEW : QN_REVIEW);
  S.t = 0; S.ok = 0; S.bad = 0; S.miss = []; S.phase = 'task';
  beginTask(); render(); window.scrollTo(0, 0); focusInput();
}
function sessMove(d) {
  if (S.practice || S.i + d < 0 || S.i + d >= S.queue.length) return;
  pushUndo();
  S.i += d; S.flash = null;
  navDir = d > 0 ? 'from-right' : 'from-left';
  enterItem();
}
const scoredN = () => S.qs.filter(x => !x.retry).length;
const quizScore = () => scoredN() ? S.ok / scoredN() : 1;
// Меньше 60% — тема не закрепилась; 60–79 — слабо; 80–99 — хорошо; 100% в повторе — легко. Подсмотрел — не выше «слабо».
function autoGrade() {
  const sc = quizScore(), fresh = !st.cards[S.item.id];
  let g = sc < 0.6 ? 1 : sc < 0.8 ? 2 : sc < 1 ? 3 : fresh ? 3 : 4;
  return S.peek ? Math.min(g, 2) : g;
}
function rate(grade) {
  pushUndo();
  const it = S.item, t = S.topic, prev = st.cards[it.id], now = Date.now();
  const card = schedule(prev || null, grade, now);
  st.cards[it.id] = card;
  const today = dayNum(now), lg = st.log[today] = st.log[today] || { n: 0, r: 0 };
  if (it.mode === 'new') lg.n++; else lg.r++;
  save();
  S.done++;
  if (grade <= 2) S.missed = (S.missed || 0) + 1;
  S.flash = `<b>${rich(t.t)}</b>: ${pct(quizScore())}% верно, ${grade === 1 ? 'вернётся в конце занятия' : 'повтор ' + dueLabel(card)}. <button class="linkish" data-act="undo">Отменить</button>`;
  if (grade === 1) S.queue.push({ id: it.id, mode: 'relearn' });
  S.i++;
  enterItem();
}

// Отмена: каждый ответ, переход и оценка кладут снимок. «Отменить» или Ctrl+Z возвращает на шаг назад.
function pushUndo() {
  if (!S) return;
  UNDO.push({ s: JSON.stringify({ ...S, topic: null, q: null, timer: null }), st: JSON.stringify(st) });
  if (UNDO.length > 80) UNDO.shift();
}
function undo() {
  const u = UNDO.pop(); if (!u) return;
  clearTimeout(S && S.timer);
  S = JSON.parse(u.s); S.topic = BY_ID[S.item.id]; if (S.qs && S.qs[S.t]) S.q = S.qs[S.t].q;
  const before = JSON.stringify(st);
  st = JSON.parse(u.st);
  if (JSON.stringify(st) !== before) save();
  render(); focusInput();
}

// Тренировка: те же вопросы, но память и расписание не трогает
function startPractice(id) {
  const topic = BY_ID[id];
  S = { practice: true, queue: [{ id, mode: 'practice' }], i: 0, item: { id, mode: 'practice' }, topic };
  UNDO = [];
  startQuiz();
}
function beginTask() {
  const q = S.qs[S.t].q;
  S.q = q; S.answered = null; S.typed = '';
  if (q.k === 'c') S.opts = shuffle(q.o.map((text, i) => ({ text, right: i === 0 })));
  if (q.k === 'o') { S.pool = shuffle([...q.t, ...(q.d || [])].map((text, i) => ({ text, id: i }))); S.picked = []; }
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function submit(ok, extra) {
  if (S.answered) return;
  pushUndo();
  const cur = S.qs[S.t];
  S.answered = { ok, ...extra };
  if (!cur.retry) { if (ok) S.ok++; else { S.bad++; S.miss.push(S.t); S.qs.push({ q: cur.q, retry: true }); } }
  render();
  if (ok && st.auto) S.timer = setTimeout(advance, 850);
}
function acceptAnswer() {
  if (!S || !S.answered || S.answered.ok) return;
  pushUndo();
  const cur = S.qs[S.t];
  S.answered.ok = true;
  if (!cur.retry) { S.ok++; S.bad--; S.miss = S.miss.filter(i => i !== S.t); const j = S.qs.findIndex((x, i) => i > S.t && x.retry && x.q === cur.q); if (j >= 0) S.qs.splice(j, 1); }
  render();
}
function advance() {
  clearTimeout(S.timer);
  if (!S.answered) return;
  pushUndo();
  S.t++;
  if (S.t < S.qs.length) { beginTask(); render(); focusInput(); return; }
  S.phase = S.practice ? 'done' : 'result'; render(); window.scrollTo(0, 0);
}
function focusInput() { const el = document.getElementById('answer'); if (el) setTimeout(() => el.focus(), 0); }
function renderSession() {
  if (S.phase === 'done') { renderSummary(); return; }
  const total = S.queue.length, it = S.item, t = S.topic;
  const modeName = { new: 'Новая тема', review: 'Повторение', relearn: 'Ещё раз', practice: 'Тренировка, на память не влияет' }[it.mode];
  const inQuiz = S.phase === 'task', n = inQuiz ? S.qs.length : 0;
  const counter = (S.practice ? '' : `Тема <b>${S.i + 1}</b> из ${total} · `) + (inQuiz ? `вопрос <b>${S.t + 1}</b> из ${n}${S.qs[S.t].retry ? ' · ещё раз' : ''}` : modeName);
  const share = S.practice ? S.t / Math.max(1, n) : (S.i + (inQuiz ? S.t / n * 0.9 : S.phase === 'result' ? 0.95 : 0)) / total;
  const top = `<div class="sess-top"><div class="sess-r"><span>${counter}</span><button class="linkish undo" data-act="undo" ${UNDO.length ? '' : 'disabled'} title="Ctrl+Z">↶ Отменить</button><button class="linkish" data-act="exit">Выйти</button></div><div class="lbar"><i style="width:${share * 100}%"></i></div></div>`;
  const flash = S.flash && S.phase !== 'result' ? `<div class="flash">${S.flash}</div>` : '';
  let body = '', foot = '';
  const type = learnTypeOf(t.id);
  const cardOf = () => `<article class="topic"><div class="c1"><header class="t-head"><div class="t-meta">${bookTag(t)}<span class="pill">${type.name}</span>${st.cards[t.id] ? `<span class="pill acc">память ${pct(memoryOf(st.cards[t.id]))}%</span>` : ''}</div><h1 class="t-title">${rich(t.t)}</h1><p class="t-gist">${rich(t.g)}</p></header>${topicBody(t)}</div><div class="c2">${variantsHtml(t)}</div></article>`;
  if (S.phase === 'read') {
    body = flash + cardOf();
    const nq = Math.min(QN_NEW, (t.bq || []).length + (t.q || []).length);
    foot = `<div class="foot"><div class="foot-in"><small>Дальше ${nq} ${pl(nq, 'вопрос', 'вопроса', 'вопросов')}. Процент верных с первого раза станет памятью темы.</small><button class="btn" data-act="to-quiz">К вопросам · Enter</button></div></div>`;
  } else if (S.phase === 'result') {
    body = resultHtml();
    foot = `<div class="foot"><div class="foot-in"><small>Не тот клик? «Отменить» вернёт последний ответ.</small><button class="btn" data-act="commit">Дальше · Enter</button></div></div>`;
  } else {
    body = flash + (S.showCard ? `<div class="peek">${cardOf()}</div>` : '') + taskHtml();
    foot = taskFoot();
  }
  app.innerHTML = `<div class="sess phase-${S.phase}">${top}<div class="sess-body"><div class="sess-col">${body}</div></div>${foot}</div>`;
  if (S.phase === 'task' && S.q.k === 'i' && !S.answered) focusInput();
}
function resultHtml() {
  const g = autoGrade(), sc = quizScore(), n = scoredN(), t = S.topic;
  const next = g === 1 ? 'сегодня, в конце занятия' : dueLabel(schedule(st.cards[S.item.id] || null, g));
  const word = ['', 'Не закрепилось', 'Слабо', 'Хорошо', 'Отлично'][g];
  const miss = S.miss.map(i => S.qs[i].q);
  return `<section class="result g${g}"><div class="q-tag"><span>${rich(t.t)}</span></div>
    <div class="res-top"><div class="res-pct"><b>${pct(sc)}</b><small>%</small></div><div><h2>${word}</h2><p>${S.ok} из ${n} верно с первого раза${S.peek ? ', подсматривал тему' : ''}. Следующий повтор: <b>${next}</b>.</p></div></div>
    ${miss.length ? `<h3>Где ошибся</h3><ul class="res-miss">${miss.map(q => `<li>${qHtml(q.q)}<div class="ja" lang="ja">${rich(rightAnswer(q))}</div><small>${rich(q.w)}</small></li>`).join('')}</ul>` : '<p class="res-clean">Без единой ошибки.</p>'}
  </section>`;
}
// Условие из таблицы учебника идёт до <br>, сам вопрос — после
// Условие из учебника приходит одной строкой: режем его на строки «кто — что»
function ctxHtml(src) {
  let title = '', body = String(src);
  const m = body.match(/^([^:—→]{3,40}):\s+(.*)$/);
  if (m && /;|·|\.\s/.test(m[2])) { title = m[1]; body = m[2]; }
  const items = body.split(/;\s+|\s+·\s+|(?<=[.!])\s+(?=[А-ЯЁA-Z0-9])/).map(x => x.trim().replace(/[.;]$/, '')).filter(Boolean);
  if (items.length < 2) return `<div class="qz-ctx"><p>${rich(src)}</p></div>`;
  const row = it => { const k = it.match(/^(.{1,40}?):\s+(.*)$/) || it.match(/^(.{1,30}?)\s+[—→]\s+(.*)$/);
    return k ? `<div class="ctx-row"><b>${rich(k[1])}</b><span>${rich(k[2])}</span></div>` : `<div class="ctx-row one"><span>${rich(it)}</span></div>`; };
  return `<div class="qz-ctx">${title ? `<div class="ctx-h">${rich(title)}</div>` : ''}${items.map(row).join('')}</div>`;
}
// Строка вопроса: ＿＿ превращается в ячейку, хвостовая (подсказка по-русски) — в метку
function askHtml(text, kind) {
  let t = String(text), hint = '', asked = false;
  if (/^Q:s*/.test(t)) { asked = true; t = t.replace(/^Q:s*/, ''); }
  const h = t.match(/\s*\(([^()]*[а-яё][^()]*)\)\s*$/i);
  if (h) { hint = h[1]; t = t.slice(0, h.index); }
  const ja = /[぀-ヿ㐀-鿿]/.test(t.replace(/\([^)]*\)/g, '')) && !/[а-яё]{3}/i.test(t.split('→')[0].split(':')[0]) ;
  const html = rich(t).replace(/＿+/g, '<span class="gap"></span>');
  const label = asked ? '<div class="qz-lab">Тебя спрашивают:</div>' : '';
  const task = hint ? `<div class="qz-task">${asked ? 'Смысл ответа' : kind === 'i' ? 'Нужно' : 'Подсказка'}: <b>${rich(hint)}</b></div>` : '';
  return `${label}<p class="qz-ask ${ja ? 'jp' : ''}" ${ja ? 'lang="ja"' : ''}>${html}</p>${task}`;
}
// Письменный вариант: сверху исходный вопрос и смысл ответа, ниже фраза с пропуском
function preHtml(pre) {
  const p = String(pre).split('<br>');
  let t = p.pop(), hint = '';
  const h = t.match(/\s*\(([^()]*[а-яё][^()]*)\)\s*$/i);
  if (h) { hint = h[1]; t = t.slice(0, h.index); }
  const m = t.match(/^(.*?)\s*Q:\s*(.*)$/);
  const lead = m ? m[1] : t, jq = m ? m[2] : '';
  return p.map(ctxHtml).join('') + '<div class="qz-pre">'
    + (lead ? `<div class="qz-task">${rich(lead)}</div>` : '')
    + (jq ? `<div class="qz-lab">Тебя спрашивают:</div><p class="qz-small" lang="ja">${rich(jq)}</p>` : '')
    + (hint ? `<div class="qz-task">Смысл ответа: <b>${rich(hint)}</b></div>` : '')
    + '</div><div class="qz-lab">Впиши пропущенное:</div>';
}
const qHtml = (text, kind) => { const p = String(text).split('<br>'), last = p.pop(); return p.map(ctxHtml).join('') + `<div class="qz-q">${askHtml(last, kind)}</div>`; };
const KIND_HOW = { full: 'Напиши предложение целиком, каной или ромадзи', c: 'Выбери верный вариант', i: 'Впиши ответ каной или ромадзи', o: 'Собери фразу: нажимай плитки по порядку. Лишние останутся' };
function taskHtml() {
  const q = S.q, a = S.answered, t = S.topic;
  let w = '';
  if (q.k === 'c') {
    const answer = a && a.pick;
    w = `<div class="opts">${S.opts.map((o, i) => {
      const cls = a ? (o.right ? 'ok' : (answer === i ? 'no' : 'dim')) : '';
      return `<button class="opt ${cls}" ${a ? 'disabled' : ''} data-opt="${i}"><kbd>${i + 1}</kbd><span lang="ja">${rich(o.text)}</span></button>`;
    }).join('')}</div>`;
  } else if (q.k === 'i') {
    const cls = a ? (a.ok ? 'ok' : 'no') : '';
    w = `<div class="field ${q.full ? "long" : ""}"><input id="answer" class="${cls}" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ответ" value="${esc(S.typed)}" ${a ? 'readonly' : ''} aria-label="Ответ"></div>`;
  } else {
    const ansCls = a ? (a.ok ? 'ok' : 'no') : '';
    w = `<div class="tiles-ans ${ansCls}">${S.picked.map(id => { const x = S.pool.find(p => p.id === id); return `<button class="tile" ${a ? 'disabled' : ''} data-unpick="${id}">${rich(x.text)}</button>`; }).join('') || '<span class="tiles-ph">сюда встанут плитки</span>'}</div>
      <div class="tiles">${S.pool.map(p => `<button class="tile ${S.picked.includes(p.id) ? 'ghost' : ''}" ${a ? 'disabled' : ''} data-pick="${p.id}">${rich(p.text)}</button>`).join('')}</div>`;
  }
  const fb = a ? `<div class="fb ${a.ok ? 'ok' : 'no'}"><div class="h">${a.ok ? 'Верно' : (a.skipped ? 'Правильный ответ' : 'Неверно. Правильно так:')}</div>${!a.ok ? `<div class="right ja" lang="ja">${rich(rightAnswer(q))}</div>` : ''}${q.w ? `<div class="why">${rich(q.w)}</div>` : ''}${q.k === 'i' && !a.ok && !a.skipped ? `<div class="fb-you">Ты написал: <span lang="ja">${esc(S.typed)}</span> <button class="linkish" data-act="accept">Мой ответ тоже верный</button></div>` : ''}</div>` : '';
  const retry = S.qs[S.t].retry;
  return `<div class="quiz"><div class="qz-meta"><span>${rich(t.t)}</span>${q.s ? `<em class="q-src">учебник · ${q.s}</em>` : ''}${retry ? '<em class="q-src again">повтор ошибки · не в процент</em>' : ''}</div>
    <section class="qz-card">${q.pre ? preHtml(q.pre) : ''}${qHtml(q.q, q.k)}${q.pre ? "" : `<div class="qz-how">${KIND_HOW[q.full ? "full" : q.k]}</div>`}${q.help && q.help.length ? `<div class="qz-help"><span>Слова в помощь, нужную форму пиши сам:</span>${q.help.map(x => `<i lang="ja">${rich(x)}</i>`).join("")}</div>` : ""}${w}${fb}</section></div>`;
}
const rightAnswer = q => q.show || (q.k === 'c' ? q.o[0] : q.k === 'i' ? q.a[0] : q.t.join(' '));
function taskFoot() {
  const q = S.q, a = S.answered;
  if (a) return `<div class="foot"><div class="foot-in"><small>Enter</small><button class="btn" data-act="next">Дальше</button></div></div>`;
  const left = `<span class="row-btns"><button class="linkish" data-act="dunno">Не знаю</button>${S.practice ? '' : `<button class="linkish" data-act="peek">${S.showCard ? 'Скрыть тему' : 'Подсмотреть тему'}</button>`}</span>`;
  if (q.k === 'c') return `<div class="foot"><div class="foot-in">${left}<small>Клавиши 1–${S.opts.length}</small></div></div>`;
  if (q.k === 'i') return `<div class="foot"><div class="foot-in">${left}<button class="btn" data-act="check-input">Проверить</button></div></div>`;
  return `<div class="foot"><div class="foot-in">${left}<button class="btn" data-act="check-tiles" ${S.picked.length ? '' : 'disabled'}>Проверить</button></div></div>`;
}
function renderSummary() {
  if (S.practice) {
    const total = S.ok + S.bad;
    app.innerHTML = `<div class="sess"><div class="sess-body"><div class="sess-col summary">
      <div class="today-h"><div class="eyebrow">Тренировка окончена</div><h1>Верно ${S.ok} из ${total}</h1><p>На память и расписание это не повлияло.</p></div>
      <div class="row-btns"><button class="btn" data-act="practice" data-id="${S.topic.id}">Ещё раз</button><button class="btn btn-2" data-act="exit">К теме</button></div>
    </div></div></div>`;
    return;
  }
  const mins = Math.max(1, Math.round((Date.now() - S.began) / 6e4)), m = overallMemory(st);
  const learnedNow = Object.keys(st.cards).length;
  const left = duePool(st).length + newPool(st).length;
  app.innerHTML = `<div class="sess"><div class="sess-body"><div class="sess-col summary">
    <div class="today-h"><div class="eyebrow">Занятие окончено</div><h1>${S.done} ${pl(S.done, 'тема', 'темы', 'тем')} за ${mins} мин</h1><p>${left ? `Осталось на сегодня: ${left}.` : tomorrowPlan(dayNum())}</p></div>
    ${S.missed ? `<p class="sum-warn">В ${S.missed} ${pl(S.missed, 'теме', 'темах', 'темах')} ты что-то не вспомнил${S.over ? `, и ${S.over} ${pl(S.over, 'раз', 'раза', 'раз')} поставил оценку выше, чем показала проверка` : ''}. Они вернутся раньше.</p>` : ''}<div class="sum-nums"><div><b>${m === null ? '—' : pct(m) + '%'}</b><span>память сейчас</span></div><div><b>${learnedNow}/${TOPICS.length}</b><span>тем пройдено</span></div></div>
    <div class="row-btns">${left ? '<button class="btn" data-act="start">Продолжить</button>' : ''}<button class="btn ${left ? 'btn-2' : ''}" data-act="to-today">На главную</button></div>
  </div></div></div>`;
}

// ─── События ─────────────────────────────────────────────
function hideTip() { const t = document.getElementById('tip'); if (t) t.hidden = true; }
function showTip(html, x, y) {
  const t = document.getElementById('tip'); t.innerHTML = html; t.hidden = false;
  const r = t.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x + 12)) + 'px';
  t.style.top = Math.max(8, y - r.height - 10) + 'px';
}
document.addEventListener('mousemove', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) { showTip(el.dataset.tip, e.clientX, e.clientY); return; }
  hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });
app.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.say) { say(d.say); return; }
  if (d.go) return go(d.go);
  if (d.topic && !S) return go('topic', d.topic);
    if (d.step && !S) return stepTopic(+d.step);
  if (d.sstep && S) return sessMove(+d.sstep);
  if (d.sheet) { sheetOpen.add(d.sheet); return render(); }
  if (d.ltype) { learnType = d.ltype === 'off' || d.ltype === learnType ? null : d.ltype; return render(); }
  if (d.verb) { mapVerb = +d.verb; const top = document.querySelector('.main').scrollTop; render(); document.querySelector('.main').scrollTop = top; return; }
  if (d.set) { st[d.set] = d.val === 'true' ? true : d.val === 'false' ? false : (isNaN(+d.val) ? d.val : +d.val); save(); return render(); }
  if (d.opt !== undefined && S && !S.answered) { const i = +d.opt; return submit(S.opts[i].right, { pick: i }); }
  if (d.pick !== undefined && S && !S.answered) { const id = +d.pick; if (!S.picked.includes(id)) S.picked.push(id); return render(); }
  if (d.unpick !== undefined && S && !S.answered) { S.picked = S.picked.filter(x => x !== +d.unpick); return render(); }
  switch (d.act) {
    case 'start': { const q = buildQueue(); if (q.length) startSession(q); else { S = null; go('today'); } break; }
    case 'review-one': startSession([{ id: d.id, mode: 'review' }], true); break;
    case 'practice': startPractice(d.id); break;
    case 'undo': undo(); break;
    case 'accept': acceptAnswer(); break;
    case 'to-quiz': pushUndo(); startQuiz(); break;
    case 'commit': rate(autoGrade()); break;
    case 'peek': S.showCard = !S.showCard; if (S.showCard) S.peek = true; render(); break;
    case 'sheet-hide': if (sheetHide) { sheetOpen.clear(); } sheetHide = true; render(); break;
    case 'sheet-show': sheetHide = false; sheetOpen.clear(); render(); break;
    case 'study-type': { const now = Date.now(), t = LEARN_TYPES.find(x => x.k === learnType); startSession(t.ids.filter(id => st.cards[id]).sort((a, b) => memoryOf(st.cards[a], now) - memoryOf(st.cards[b], now)).map(id => ({ id, mode: 'review' }))); break; }
    case 'exit': case 'to-today': { const stay = S && (S.practice || S.single); stopSession(); if (!stay) view = 'today'; render(); window.scrollTo(0, 0); break; }
    case 'next': advance(); break;
    case 'dunno': submit(false, { skipped: true, pick: -1 }); break;
    case 'check-input': checkTyped(); break;
    case 'check-tiles': checkTiles(); break;
    case 'export': backupText = JSON.stringify(st); backupMsg = ''; render(); break;
    case 'copy': copyBackup(); break;
    case 'import': importBackup(); break;
    case 'reset': if (!resetArm) { resetArm = true; render(); } else { st = freshState(); resetArm = false; backupMsg = ''; save(); pushCloud(); go('today'); } break;
    case 'reset-cancel': resetArm = false; render(); break;  }
});
function checkTyped() {
  const el = document.getElementById('answer'); if (!el || S.answered) return;
  S.typed = romajiToKana(el.value, true);
  if (!S.typed.trim()) return;
  submit(checkInput(S.typed, S.q.a));
}
function checkTiles() {
  if (S.answered || !S.picked.length) return;
  const got = S.picked.map(id => S.pool.find(p => p.id === id).text);
  const same = order => got.length === order.length && got.every((x, i) => x === order[i]);
  submit([S.q.t, ...S.q.alts].some(same));
}
async function copyBackup() {
  backupText = JSON.stringify(st);
  try { await navigator.clipboard.writeText(backupText); backupMsg = 'Скопировано. Сохрани текст в надёжном месте.'; }
  catch (e) { backupMsg = 'Браузер не дал скопировать. Выдели текст в поле вручную.'; }
  render();
}
function importBackup() {
  const el = document.getElementById('backup');
  try {
    const next = JSON.parse(el.value);
    if (!next || typeof next.cards !== 'object') throw 0;
    st = Object.assign(freshState(), next); upgradeState(st); backupMsg = 'Прогресс загружен.'; backupText = ''; save(); pushCloud();
  } catch (e) { backupText = el.value; backupMsg = 'Не получилось прочитать копию. Вставь текст целиком, без правок.'; }
  render();
}
function say(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; const v = speechSynthesis.getVoices().find(x => /^ja/i.test(x.lang)); if (v) u.voice = v; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}
app.addEventListener('input', e => {
  if (e.target.id === 'answer' && !e.isComposing) {
    const el = e.target, conv = romajiToKana(el.value, false);
    if (conv !== el.value) { el.value = conv; }
    S.typed = el.value;
  }
});
app.addEventListener('change', e => {
  if (e.target.id !== 'perday') return;
  const n = Math.floor(Number(e.target.value));
  if (Number.isFinite(n) && n >= 0) { st.perDay = n; save(); }
  render();
});
app.addEventListener('compositionend', e => { if (e.target.id === 'answer') S.typed = e.target.value; });
document.addEventListener('keydown', e => {
  if (!S) {
    if (view === 'topic' && e.key === 'ArrowLeft') stepTopic(-1);
    if (view === 'topic' && e.key === 'ArrowRight') stepTopic(1);
    return;
  }
  if (e.key === 'Escape') { const stay = S.practice || S.single; stopSession(); if (!stay) view = 'today'; render(); return; }
  const inField = e.target.closest && e.target.closest('input,textarea');
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'я') && !(inField && e.target.value)) { e.preventDefault(); return undo(); }
  if (S.phase === 'done') return;
  if (S.phase === 'read' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); pushUndo(); return startQuiz(); }
  if (S.phase === 'result') { if (e.key === 'Enter') { e.preventDefault(); rate(autoGrade()); } return; }
  if (e.key === 'Enter') {
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (S.answered) return advance();
    if (S.q.k === 'i') return checkTyped();
    if (S.q.k === 'o') return checkTiles();
    return;
  }
  if (S.phase !== 'task' || S.answered) return;
  if (S.q.k === 'c' && /^[1-9]$/.test(e.key)) { const i = +e.key - 1; if (S.opts[i]) submit(S.opts[i].right, { pick: i }); }
  if (S.q.k === 'o' && /^[1-9]$/.test(e.key)) { const avail = S.pool[+e.key - 1]; if (avail && !S.picked.includes(avail.id)) { S.picked.push(avail.id); render(); } }
  if (S.q.k === 'o' && e.key === 'Backspace') { S.picked.pop(); render(); }
});

// ─── Запуск ──────────────────────────────────────────────
readHash();
render();
try {
  const hasJa = () => speechSynthesis.getVoices().some(v => /^ja/i.test(v.lang));
  const mark = () => document.body.classList.toggle('has-tts', hasJa());
  mark(); speechSynthesis.onvoiceschanged = mark;
} catch (e) {}
connectCloud();
setInterval(() => { if (!S && view === 'today') render(); }, 60000);
