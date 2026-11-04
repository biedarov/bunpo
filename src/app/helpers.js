const LESSONS = [], CARDS = {};
const L = (n, name, topics) => LESSONS.push({ n, name, topics });
const K = (id, card) => { CARDS[id] = card; };
const BOOK = {};
const B = (id, src, tasks) => (BOOK[id] = BOOK[id] || []).push(...tasks.map(x => ({ ...x, s: src })));
// Конструкторы вопросов: выбор (первый вариант верный), ввод, сборка из плиток
const qc = (q, o, w) => ({ k: 'c', q, o, w });
const qi = (q, a, w) => ({ k: 'i', q, a: [].concat(a), w });
const qo = (q, t, d, w, alts) => ({ k: 'o', q, t, d: d || [], w, alts: alts || [] });
