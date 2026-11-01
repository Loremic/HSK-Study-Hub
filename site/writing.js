/* =====================================================================
   writing.js — sezione "Scrittura" (produzione scritta in Hanzi e Pinyin)

   Due livelli di valutazione:
   1) ANALISI LOCALE (sempre attiva, offline, deterministica): lunghezza, copertura del
      lessico del livello, validità del pinyin (sillabe, toni), parole chiave della traccia,
      controlli rapidi su errori frequenti.
   2) VALUTAZIONE AI (opzionale, richiede il proxy in worker/): attinenza, grammatica e sintassi,
      testo corretto e, per le immagini/PDF scansionati, TRASCRIZIONE del manoscritto.
      Il flusso per i manoscritti è: immagine -> trascrizione letterale (+ difetti dei caratteri)
      -> l'utente controlla e corregge la trascrizione -> valutazione grammaticale.

   Configurazione in site/config.js (window.HSK_CONFIG).
   ===================================================================== */
(function () {
"use strict";

const CFG = Object.assign({
  AI_ENDPOINT: "",                    // URL del Cloudflare Worker (vuoto = solo analisi locale)
  PROMPTS_URL: "../data/prompts.json",// archivio delle tracce assegnate
  AI_TIMEOUT_MS: 70000,
  MAX_IMAGE_EDGE: 1600,               // lato massimo dell'immagine inviata, in px
  MAX_UPLOAD_MB: 12
}, window.HSK_CONFIG || {});

const LV_ORDER = ["hsk1", "hsk2", "hsk3"];
// Soglie di lunghezza (in caratteri) per livello. INDICATIVE: da tarare sul formato d'esame ufficiale.
// min = sotto questa soglia il voto scende; lo..hi = intervallo consigliato (voto pieno).
const LV = {
  hsk1: { label: "HSK 1", min: 20, lo: 30, hi: 60 },
  hsk2: { label: "HSK 2", min: 40, lo: 60, hi: 100 },
  hsk3: { label: "HSK 3", min: 80, lo: 100, hi: 160 }
};

/* ------------------------------------------------------------------ tracce casuali */
const TOPICS = {
  hsk1: [
    { it: "Presentati", zh: "自我介绍", brief: "Presentati a un nuovo amico.", keywords: ["我", "叫", "岁", "是", "喜欢", "家"], points: ["Come ti chiami", "Quanti anni hai", "Di dove sei", "Cosa ti piace"] },
    { it: "La mia famiglia", zh: "我的家人", brief: "Parla della tua famiglia.", keywords: ["家", "爸爸", "妈妈", "哥哥", "姐姐", "有"], points: ["Quante persone ci sono", "Chi sono", "Cosa fanno o quanti anni hanno"] },
    { it: "La mia giornata", zh: "我的一天", brief: "Racconta cosa fai di solito durante la giornata.", keywords: ["早上", "点", "吃", "去", "学习", "回"], points: ["A che ora ti alzi", "Cosa mangi", "Dove vai", "Cosa fai la sera"] },
    { it: "Il mio amico", zh: "我的朋友", brief: "Descrivi un tuo amico.", keywords: ["朋友", "他", "她", "很", "喜欢", "也"], points: ["Come si chiama", "Com'è", "Cosa vi piace fare insieme"] },
    { it: "Che tempo fa", zh: "今天的天气", brief: "Descrivi il tempo di oggi e cosa fai.", keywords: ["今天", "天气", "热", "冷", "下雨", "想"], points: ["Che tempo fa oggi", "Come ti senti", "Cosa vuoi fare"] },
    { it: "Al negozio", zh: "买东西", brief: "Racconta di quando fai acquisti.", keywords: ["买", "个", "多少", "块", "贵", "要"], points: ["Cosa compri", "Quanto costa", "Cosa pensi del prezzo"] },
    { it: "Il cibo che mi piace", zh: "我喜欢的食物", brief: "Parla del cibo e delle bevande che ti piacciono.", keywords: ["吃", "喝", "喜欢", "水", "米饭", "好吃"], points: ["Cosa ti piace mangiare", "Cosa bevi", "Cosa non ti piace"] },
    { it: "La mia stanza", zh: "我的房间", brief: "Descrivi la tua stanza.", keywords: ["房间", "有", "在", "桌子", "椅子", "书"], points: ["Cosa c'è nella stanza", "Dove si trovano le cose", "Com'è la stanza"] }
  ],
  hsk2: [
    { it: "Il programma della settimana", zh: "这个星期的计划", brief: "Racconta cosa farai questa settimana, anche nel fine settimana.", keywords: ["星期", "想", "去", "跟", "一起", "因为"], points: ["Dove vai", "Con chi", "Cosa fai", "Perché"] },
    { it: "Un viaggio", zh: "一次旅行", brief: "Racconta un viaggio (reale o immaginario).", keywords: ["旅游", "机场", "飞机", "酒店", "从", "到"], points: ["Dove sei andato", "Come ci sei arrivato", "Dove hai dormito", "Cosa ti è piaciuto"] },
    { it: "La mia scuola", zh: "我的学校", brief: "Parla della tua scuola o del tuo corso.", keywords: ["学校", "教室", "老师", "同学", "考试", "课"], points: ["Com'è la scuola", "Chi sono i tuoi compagni", "Cosa studi"] },
    { it: "Il mio migliore amico", zh: "我最好的朋友", brief: "Confronta te stesso con il tuo migliore amico.", keywords: ["朋友", "比", "高", "喜欢", "帮", "但是"], points: ["Chi è", "In cosa siete simili o diversi", "Come ti aiuta"] },
    { it: "Salute e sport", zh: "身体和运动", brief: "Parla di come ti tieni in forma.", keywords: ["身体", "跑步", "篮球", "累", "经常", "每"], points: ["Che sport fai", "Quanto spesso", "Come ti senti dopo"] },
    { it: "Come arrivare", zh: "怎么去", brief: "Spiega come arrivare da casa tua a un posto.", keywords: ["离", "近", "地铁", "公交车", "路", "出门"], points: ["Dove vuoi andare", "Con quale mezzo", "Quanto è lontano"] },
    { it: "Al ristorante", zh: "在饭馆", brief: "Racconta una cena al ristorante.", keywords: ["饭馆", "点", "菜", "不错", "红茶", "对"], points: ["Con chi sei", "Cosa ordini", "Com'è il cibo"] },
    { it: "Il mio hobby", zh: "我的爱好", brief: "Parla del tuo hobby.", keywords: ["爱好", "喜欢", "画", "歌", "看", "快乐"], points: ["Qual è", "Da quanto tempo lo fai", "Perché ti piace"] }
  ],
  hsk3: [
    { it: "Un'esperienza indimenticabile", zh: "一次难忘的经历", brief: "Racconta un'esperienza che ricordi bene.", keywords: ["次", "发现", "高兴", "后来", "刚才", "觉得"], points: ["Cosa è successo", "Quando e dove", "Come ti sei sentito", "Cosa hai imparato"] },
    { it: "La mia città", zh: "我的城市", brief: "Descrivi la tua città.", keywords: ["城市", "公园", "地铁", "附近", "方便", "但是"], points: ["Com'è la città", "Cosa c'è di bello", "Cosa non va", "Perché ti piace o no"] },
    { it: "Come imparo il cinese", zh: "怎样学好汉语", brief: "Spiega come studi il cinese e dai un consiglio.", keywords: ["方法", "复习", "词典", "比较", "办法", "应该"], points: ["Come studi", "Quali difficoltà hai", "Che consiglio dai"] },
    { it: "Due luoghi a confronto", zh: "比较两个地方", brief: "Confronta due luoghi che conosci.", keywords: ["比较", "不同", "更", "但是", "而且", "城市"], points: ["Quali luoghi", "Differenze", "Quale preferisci e perché"] },
    { it: "Quando sono stato male", zh: "生病的经历", brief: "Racconta di quando sei stato male.", keywords: ["感冒", "发烧", "担心", "医院", "放心", "好多"], points: ["Che sintomi avevi", "Cosa hai fatto", "Come sei guarito"] },
    { it: "I miei progetti", zh: "我的打算", brief: "Parla dei tuoi progetti per il futuro.", keywords: ["打算", "参加", "希望", "因为", "所以", "必须"], points: ["Cosa pensi di fare", "Quando", "Cosa devi preparare"] },
    { it: "Una festa", zh: "难忘的节日", brief: "Descrivi una festa che ti piace.", keywords: ["过节", "放假", "家人", "冬天", "春天", "蛋糕"], points: ["Quale festa", "Cosa si fa", "Con chi la passi"] },
    { it: "Un problema e la soluzione", zh: "遇到问题", brief: "Racconta un problema e come lo hai risolto.", keywords: ["办法", "办", "丢", "着急", "终于", "帮助"], points: ["Qual era il problema", "Cosa hai fatto", "Come è finita"] }
  ]
};

/* ------------------------------------------------------------------ pinyin */
// Inventario delle sillabe di pinyin, costruito dalle tavole standard (iniziale -> finali).
// 'v' = ü. Le sillabe "zero iniziale" sono scritte per intero (yi, wu, yu...).
const INIT = {
  b: "a o ai ei ao an en ang eng i ie iao ian in ing u",
  p: "a o ai ei ao ou an en ang eng i ie iao ian in ing u",
  m: "a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u",
  f: "a o ei ou an en ang eng u",
  d: "a e ai ei ao ou an en ang eng ong i ia ie iao iu ian ing u uo ui uan un",
  t: "a e ai ao ou an ang eng ong i ie iao ian ing u uo ui uan un",
  n: "a e ai ei ao ou an en ang eng ong i ie iao iu ian in iang ing u uo uan v ve",
  l: "a o e ai ei ao ou an ang eng ong i ia ie iao iu ian in iang ing u uo uan un v ve",
  g: "a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang",
  k: "a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang",
  h: "a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang",
  j: "i ia ie iao iu ian in iang ing iong u ue uan un",
  q: "i ia ie iao iu ian in iang ing iong u ue uan un",
  x: "i ia ie iao iu ian in iang ing iong u ue uan un",
  zh: "a e i ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang",
  ch: "a e i ai ao ou an en ang eng ong u ua uo uai ui uan un uang",
  sh: "a e i ai ei ao ou an en ang eng u ua uo uai ui uan un uang",
  r: "e i ao ou an en ang eng ong u ua uo ui uan un",
  z: "a e i ai ei ao ou an en ang eng ong u uo ui uan un",
  c: "a e i ai ao ou an en ang eng ong u uo ui uan un",
  s: "a e i ai ao ou an en ang eng ong u uo ui uan un",
  "": "a o e ai ei ao ou an en ang eng er yi ya yo yao ye you yan yin yang ying yong wu wa wo wai wei wan wen wang weng yu yue yuan yun"
};
const SYL = new Set();
for (const [ini, fin] of Object.entries(INIT)) for (const f of fin.split(" ")) SYL.add(ini + f);

const TONE_CH = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", v: "ǖǘǚǜ" };
const MARK = { "̄": 1, "́": 2, "̌": 3, "̀": 4 };

// Posizione corretta del segno di tono: a, e; in "ou" la o; altrimenti l'ultima vocale.
function toneIndex(base) {
  let i = base.indexOf("a"); if (i < 0) i = base.indexOf("e");
  if (i < 0 && base.includes("ou")) i = base.indexOf("o");
  if (i < 0) for (let k = base.length - 1; k >= 0; k--) if ("aeiouv".includes(base[k])) { i = k; break; }
  return i;
}
function applyTone(base, t) {
  if (!t || t > 4) return base.replace(/v/g, "ü");
  const i = toneIndex(base); if (i < 0) return base;
  return (base.slice(0, i) + TONE_CH[base[i]][t - 1] + base.slice(i + 1)).replace(/v/g, "ü");
}

// Scompone un token latino in sillabe pinyin. Accetta toni come segni (nǐ) o numeri (ni3), ü / v.
function parsePinyinToken(tok) {
  const items = []; let chunk = [];
  const segments = [];
  for (const ch of tok.normalize("NFD").toLowerCase()) {
    if (ch === "'" || ch === "’") { segments.push(chunk); chunk = []; continue; }
    if (ch === "̈") { if (chunk.length && chunk[chunk.length - 1].c) chunk[chunk.length - 1].c = "v"; continue; }
    if (MARK[ch]) { if (chunk.length && chunk[chunk.length - 1].c) chunk[chunk.length - 1].tone = MARK[ch]; continue; }
    if (/[0-5]/.test(ch)) { chunk.push({ digit: +ch }); continue; }
    if (/[a-z]/.test(ch)) { chunk.push({ c: ch, tone: 0 }); continue; }
    return { ok: false, syls: [], rest: ch };
  }
  segments.push(chunk);
  const syls = [];
  for (const seg of segments) {
    const L = [];
    for (const it of seg) {
      if (it.digit !== undefined) { if (!L.length) return { ok: false, syls, rest: String(it.digit) }; L[L.length - 1].digit = it.digit; }
      else L.push(Object.assign({}, it));
    }
    // Segmentazione con backtracking (la sola ricerca "greedy" sbaglia su fàn|guǎn, qù|nián…).
    // Una "r" finale dopo una sillaba è l'erhua (nǎr, wánr): valida, ma non conta come sillaba.
    const memo = new Map();
    const solve = i => {
      if (i === L.length) return [];
      if (memo.has(i)) return memo.get(i);
      let res = null;
      for (let k = Math.min(6, L.length - i); k >= 1 && !res; k--) {
        if (L.slice(i, i + k - 1).some(x => x.digit !== undefined)) continue;
        if (!SYL.has(L.slice(i, i + k).map(x => x.c).join(""))) continue;
        const rest = solve(i + k); if (rest) res = [[i, k]].concat(rest);
      }
      if (!res && i === L.length - 1 && L[i].c === "r" && i > 0) res = [[i, 1, true]];
      memo.set(i, res); return res;
    };
    const plan = solve(0);
    if (!plan) return { ok: false, syls, rest: L.map(x => x.c).join("") };
    for (const [i, k, er] of plan) {
      if (er) continue;
      const part = L.slice(i, i + k), base = part.map(x => x.c).join("");
      let markTone = 0, markIdx = -1; part.forEach((x, j) => { if (x.tone) { markTone = x.tone; markIdx = j; } });
      const digit = part[part.length - 1].digit;
      const tone = markTone || (digit >= 1 && digit <= 4 ? digit : 0);
      syls.push({ base, tone, digit, hasTone: !!markTone || digit !== undefined, misplaced: markIdx >= 0 && markIdx !== toneIndex(base) });
    }
  }
  return { ok: syls.length > 0, syls };
}

const LATIN_TOKEN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*[0-5]?/gu;
function latinTokens(text) {
  return (text.replace(/\p{Script=Han}/gu, " ").match(LATIN_TOKEN) || []);
}
// "ni3 hao3" -> "nǐ hǎo" (solo i token interamente validi che contengono numeri di tono)
function numToMarks(text) {
  return text.replace(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*[0-5]?(?:[\p{L}\p{M}]+[0-5])*/gu, tok => {
    if (!/[0-5]/.test(tok)) return tok;
    // "ni3hao3": spezza dopo ogni numero
    const parts = tok.match(/[^0-5]+[0-5]?/g) || [tok];
    const out = [];
    for (const p of parts) {
      const r = parsePinyinToken(p);
      if (!r.ok) return tok;
      out.push(r.syls.map(s => (s.digit !== undefined ? applyTone(s.base, s.digit) : applyTone(s.base, s.tone))).join(""));
    }
    return out.join("");
  });
}

/* ------------------------------------------------------------------ misure e controlli locali */
function measure(text) {
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const toks = latinTokens(text);
  const bad = [], misplaced = [];
  let syl = 0, toned = 0, untoned = 0, sylAll = 0;
  for (const t of toks) {
    const r = parsePinyinToken(t);
    if (!r.ok) { bad.push(t); continue; }
    const tokHasTone = r.syls.some(s => s.hasTone);
    sylAll += r.syls.length;
    if (tokHasTone || !han) syl += r.syls.length;   // in un testo misto contano solo i token con toni
    r.syls.forEach(s => { if (s.hasTone) toned++; else untoned++; if (s.misplaced) misplaced.push({ tok: t, base: s.base, tone: s.tone, fix: applyTone(s.base, s.tone) }); });
  }
  const script = han && !toks.length ? "hanzi" : han ? "mixed" : toks.length ? "pinyin" : "vuoto";
  return { han, tokens: toks.length, syl, sylAll, toned, untoned, bad, misplaced, script, units: han + syl };
}

// Controlli rapidi su errori frequenti (euristiche: segnalano, non garantiscono).
const RULES = [
  { id: "du-ye", re: /都也/g, msg: "Ordine: di solito si dice 也都 (anche… tutti), non 都也." },
  { id: "bu-you", re: /不有/g, msg: "“Non avere” si dice 没有, non 不有." },
  { id: "mei-shi", re: /没是/g, msg: "La negazione di 是 è 不是, non 没是." },
  { id: "er-ge", re: /(?<![第十百千万零一二三四五六七八九])二个/g, msg: "Davanti al classificatore si usa 两 (两个), non 二个." },
  { id: "pos-neg-ma", re: /(有没有|是不是|好不好|能不能|会不会|可不可以|对不对|行不行)[^，。！？；\n]*吗/g, msg: "Una domanda affermativo-negativa (有没有, 是不是…) non vuole anche 吗." },
  { id: "bi-hen", re: /比[^，。！？；很]{1,6}很(?![多久少])/g, msg: "Nei comparativi con 比 non si usa 很: dì 比我高 / 比我高很多, non 比我很高." },
  { id: "classif", re: /[一二两三四五六七八九十几](?=学生|老师|朋友|苹果|电脑|椅子|桌子|[书猫狗])/g, msg: "Manca il classificatore tra numero e nome (es. 三个学生, 一本书, 一只猫)." },
  { id: "punct-lat", re: /\p{Script=Han}[,.;:?!]/gu, msg: "Nel testo cinese usa la punteggiatura cinese (， 。 ？ ！)." },
  { id: "space", re: /\p{Script=Han} +\p{Script=Han}/gu, msg: "In cinese le parole non si separano con spazi." }
];
function runRules(text) {
  const out = [];
  for (const r of RULES) {
    r.re.lastIndex = 0; let m;
    while ((m = r.re.exec(text))) { out.push({ id: r.id, msg: r.msg, s: m.index, e: m.index + m[0].length }); if (m[0].length === 0) r.re.lastIndex++; }
  }
  const t = text.trimEnd();
  if (/\p{Script=Han}$/u.test(t) && t.length > 3) out.push({ id: "final-punct", msg: "Manca la punteggiatura finale (。).", s: Math.max(0, t.length - 2), e: t.length });
  return out.sort((a, b) => a.s - b.s);
}

// Lessico cumulativo del livello (parole + caratteri contenuti), per stimare la copertura.
function buildLex(cardLists) {
  const words = new Set(), chars = new Set(); let max = 1;
  for (const list of cardLists) for (const c of list) {
    for (const w of String(c.hanzi || "").split(/[^\p{Script=Han}]+/u)) {
      if (!w) continue; words.add(w); max = Math.max(max, [...w].length); for (const ch of w) chars.add(ch);
    }
  }
  return { words, chars, max };
}
function vocab(text, lex) {
  const runs = text.match(/\p{Script=Han}+/gu) || [];
  let total = 0, known = 0; const unk = new Map();
  for (const run of runs) {
    const cs = [...run]; total += cs.length; let i = 0, buf = "";
    const flush = () => { if (buf) { unk.set(buf, (unk.get(buf) || 0) + 1); buf = ""; } };
    while (i < cs.length) {
      let m = 0;
      for (let k = Math.min(lex.max, cs.length - i); k >= 1; k--) if (lex.words.has(cs.slice(i, i + k).join(""))) { m = k; break; }
      if (m) { flush(); known += m; i += m; } else { buf += cs[i]; i++; }
    }
    flush();
  }
  const unknown = [...unk.entries()].map(([w, n]) => ({ w, n, charsKnown: [...w].every(c => lex.chars.has(c)) })).sort((a, b) => b.n - a.n);
  return { total, known, pct: total ? Math.round(100 * known / total) : null, unknown };
}

function kwCoverage(text, p) {
  const req = p.required || [], kw = p.keywords || [];
  const split = list => ({ hit: list.filter(w => text.includes(w)), miss: list.filter(w => !text.includes(w)) });
  const R = split(req), K = split(kw);
  const parts = [];
  if (req.length) parts.push([0.6, R.hit.length / req.length]);
  if (kw.length) parts.push([0.4, K.hit.length / kw.length]);
  const sw = parts.reduce((a, b) => a + b[0], 0);
  return { req: R, kw: K, score: sw ? Math.round(100 * parts.reduce((a, b) => a + b[0] * b[1], 0) / sw) : null };
}

function lengthScore(n, p) {
  if (n <= 0) return 0;
  if (n < p.min) return Math.round(75 * n / p.min);
  if (n < p.lo) return Math.round(75 + 25 * (n - p.min) / Math.max(1, p.lo - p.min));
  if (n <= p.hi * 1.6) return 100;
  return 90;
}
function combine(parts, free) {
  const W = free ? { length: .3, grammar: .7 } : { length: .2, relevance: .35, grammar: .45 };
  let sw = 0, s = 0, partial = false;
  for (const k in W) { if (parts[k] == null) { partial = true; continue; } s += W[k] * parts[k]; sw += W[k]; }
  return { score: sw ? Math.round(s / sw) : null, partial };
}
const gradeOf = s => s == null ? "" : s >= 85 ? "Ottimo" : s >= 70 ? "Buono" : s >= 55 ? "Sufficiente" : "Da migliorare";

/* ------------------------------------------------------------------ DOM helper */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  put(e, ...kids);
  return e;
}
// Come Node.append, ma ignora null/false e appiattisce gli array annidati (append stamperebbe "null").
function put(parent, ...kids) {
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; parent.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return parent;
}

/* ------------------------------------------------------------------ stato e storage */
const S = { ctx: null, root: null, level: null, mode: "random", prompt: null, archive: null, archiveOk: true,
  file: null, hw: null, busy: false, lex: {}, lastTopic: -1, ta: null, els: {} };
const DK = l => "hsk.writing.draft." + l, HK = "hsk.writing.history";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const aiOn = () => !!CFG.AI_ENDPOINT;
const pick = a => a[Math.floor(Math.random() * a.length)];
const sample = (a, n) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); };

function limitsOf(p) {
  const base = LV[S.level];
  if (!p) return { min: base.min, lo: base.lo, hi: base.hi };
  const min = p.min_chars ?? p.min ?? base.min, hi = p.max_chars ?? p.hi ?? base.hi;
  return { min, hi: Math.max(hi, min), lo: Math.min(p.target_min ?? p.lo ?? Math.max(min, base.lo), Math.max(hi, min)) };
}
function genPrompt() {
  const list = TOPICS[S.level]; let i; do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === S.lastTopic);
  S.lastTopic = i; const t = list[i], b = LV[S.level];
  return { id: "gen-" + Date.now().toString(36), type: "generated", level: S.level, title_it: t.it, title_zh: t.zh, instruction_it: t.brief,
    keywords: t.keywords, required: sample(t.keywords, 3), points: t.points, min: b.min, lo: b.lo, hi: b.hi };
}

/* ------------------------------------------------------------------ servizio AI */
async function callAI(payload) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), CFG.AI_TIMEOUT_MS);
  try {
    const r = await fetch(CFG.AI_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || ("Errore del servizio (" + r.status + ")"));
    return j.result;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Il servizio AI non ha risposto in tempo. Riprova tra poco.");
    if (e instanceof TypeError) throw new Error("Impossibile contattare il servizio AI (rete o configurazione).");
    throw e;
  } finally { clearTimeout(to); }
}
const arr = x => Array.isArray(x) ? x : [];
const num = x => { x = Number(x); return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : null; };
const str = x => typeof x === "string" ? x : "";
function cleanEval(r) {
  r = r || {};
  const g = r.grammar || {}, v = r.relevance || {};
  return {
    relevance: { applicable: v.applicable !== false, score: num(v.score), comment: str(v.comment), covered: arr(v.covered_points).map(str), missing: arr(v.missing_points).map(str) },
    grammar: { score: num(g.score), comment: str(g.comment), errors: arr(g.errors).map(e => ({ excerpt: str(e.excerpt), correction: str(e.correction), category: str(e.category), explanation: str(e.explanation), severity: e.severity === "major" ? "major" : "minor" })).filter(e => e.excerpt || e.explanation) },
    corrected: str(r.corrected_text), strengths: arr(r.strengths).map(str), next: arr(r.next_steps).map(str)
  };
}
function cleanTranscribe(r) {
  r = r || {};
  return { legible: r.legible !== false, script: str(r.script), text: str(r.transcription), confidence: str(r.confidence), notes: str(r.general_notes),
    issues: arr(r.char_issues).map(i => ({ written: str(i.written), intended: str(i.intended), problem: str(i.problem), description: str(i.description), fix: str(i.how_to_fix) })).filter(i => i.written || i.description) };
}

/* ------------------------------------------------------------------ file in ingresso */
const readAsB64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1] || ""); f.onerror = () => rej(f.error); f.readAsDataURL(blob); });
async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch (e) { try { return new TextDecoder("gb18030").decode(buf); } catch (e2) { return new TextDecoder().decode(buf); } }
}
async function imageToJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Immagine non leggibile. Se è un file HEIC, convertilo in JPG o PNG.")); i.src = url; });
    const k = Math.min(1, CFG.MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL("image/jpeg", 0.85).split(",")[1], preview: url };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = base + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = () => rej(new Error("pdf.js non disponibile")); document.head.append(s);
  });
}
async function pdfText(file) {
  const lib = await loadPdfJs(); const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise; let out = "";
  for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) { const tc = await (await pdf.getPage(p)).getTextContent(); out += tc.items.map(i => i.str).join(" ") + "\n"; }
  return out.trim();
}

/* ------------------------------------------------------------------ interfaccia */
function setMsg(node, text, kind) { node.className = "wr-msg" + (kind ? " " + kind : ""); node.textContent = text || ""; node.hidden = !text; }

function init() {
  const E = S.els = {};
  S.root.replaceChildren();
  const draft = lsGet(DK(S.level), null);
  S.mode = draft && draft.mode || "random"; S.prompt = draft && draft.prompt || null; S.hw = null; S.file = null;
  if (S.mode === "random" && !S.prompt) S.prompt = genPrompt();

  const modes = [["random", "Casuale"], ["archive", "Dall’archivio"], ["free", "Libera"]];
  E.modeSeg = h("div", { class: "seg", role: "group", "aria-label": "Tipo di traccia" }, modes.map(([k, l]) => h("button", { type: "button", "data-m": k, onclick: () => setMode(k) }, l)));
  E.promptBox = h("div", { class: "wr-prompt" });
  E.ta = S.ta = h("textarea", { class: "wr-ta", id: "wrText", rows: "9", lang: "zh-Hans", spellcheck: "false", "aria-describedby": "wrCount", placeholder: "Scrivi qui in hanzi o in pinyin (ni3 hao3 oppure nǐ hǎo)…", oninput: onInput });
  E.count = h("div", { class: "wr-count", id: "wrCount", "aria-live": "off" });
  E.fileMsg = h("p", { class: "wr-msg", hidden: true, role: "status" });
  E.prev = h("div", { class: "wr-prev", hidden: true });
  E.trBtn = h("button", { type: "button", class: "btn", hidden: true, onclick: transcribe }, "Leggi e trascrivi il manoscritto");
  E.hw = h("div", { class: "wr-hw", hidden: true });
  E.conv = h("button", { type: "button", class: "btn", onclick: () => { E.ta.value = numToMarks(E.ta.value); onInput(); } }, "Converti ni3 → nǐ");
  E.go = h("button", { type: "button", class: "btn big", onclick: evaluate }, "Valuta il testo");
  E.res = h("div", { class: "wr-res", "aria-live": "polite" });
  E.hist = h("div", { class: "wr-hist" });
  E.file = h("input", { type: "file", id: "wrFile", accept: ".txt,.md,.pdf,image/*", onchange: ev => onFile(ev.target.files[0]) });

  put(S.root, 
    h("h2", null, "Produzione scritta"),
    h("p", { class: "hint" }, "Scrivi un testo in hanzi o in pinyin (o carica un file) e ricevi una valutazione su lunghezza, attinenza alla traccia e grammatica. Livello attuale: ",
      h("b", null, LV[S.level].label), ". Puoi cambiarlo dalla colonna a sinistra."),
    aiOn() ? null : h("p", { class: "wr-msg warn" }, "Il servizio AI non è collegato: avrai l’analisi automatica (lunghezza, lessico del livello, pinyin, errori frequenti) ma non la correzione grammaticale completa né la lettura dei manoscritti."),
    h("section", { class: "wr-card" }, h("h3", null, "1 · Scegli la traccia"), E.modeSeg, E.promptBox),
    h("section", { class: "wr-card" }, h("h3", null, "2 · Scrivi o carica un file"),
      h("label", { for: "wrText", class: "wr-lab" }, "Il tuo testo"), E.ta, E.count,
      h("div", { class: "acts wr-left" }, E.conv),
      h("div", { class: "wr-up" },
        h("label", { for: "wrFile", class: "wr-lab" }, "Oppure carica un file (testo, PDF o foto di un testo scritto a mano)"), E.file,
        h("p", { class: "hint" }, "Le immagini e i PDF scansionati vengono inviati al servizio AI solo per la trascrizione; questo sito non li conserva."),
        E.fileMsg, E.prev, E.trBtn), E.hw),
    h("div", { class: "acts wr-left" }, E.go, h("button", { type: "button", class: "btn", onclick: clearAll }, "Svuota")),
    E.res,
    h("h3", { class: "wr-h3" }, "Ultimi testi valutati"), E.hist
  );
  E.ta.value = draft && draft.text || "";
  renderPrompt(); onInput(); renderHist();
}

function setMode(m) {
  S.mode = m;
  if (m === "random") S.prompt = genPrompt();
  else if (m === "free") S.prompt = null;
  else S.prompt = null;
  saveDraft(); renderPrompt(); onInput();
}
function saveDraft() { lsSet(DK(S.level), { mode: S.mode, prompt: S.prompt, text: S.ta ? S.ta.value : "" }); }

async function ensureArchive() {
  if (S.archive) return;
  try { const r = await fetch(CFG.PROMPTS_URL, { cache: "no-cache" }); if (!r.ok) throw 0; const j = await r.json(); S.archive = arr(j.prompts || j).filter(p => p && p.id); S.archiveOk = true; }
  catch (e) { S.archive = []; S.archiveOk = false; }
}

function renderPrompt() {
  const E = S.els, box = E.promptBox; box.replaceChildren();
  E.modeSeg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === S.mode)));
  const b = LV[S.level];
  if (S.mode === "free") {
    put(box, h("p", null, "Scrittura libera: scegli tu l’argomento. Vengono valutate lunghezza e grammatica (non l’attinenza, perché non c’è una traccia)."),
      h("p", { class: "hint" }, `Lunghezza consigliata per ${b.label}: ${b.lo}–${b.hi} caratteri (minimo ${b.min}).`));
    return;
  }
  if (S.mode === "archive") {
    put(box, h("p", { class: "hint" }, "Carico l’archivio…"));
    ensureArchive().then(() => {
      if (S.mode !== "archive") return;
      box.replaceChildren();
      const list = S.archive.filter(p => p.level === S.level);
      if (!list.length) {
        put(box, h("p", { class: "wr-msg" }, S.archiveOk ? `L’archivio delle tracce per ${b.label} è ancora vuoto.` : "Non riesco a caricare l’archivio delle tracce."),
          h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => setMode("random") }, "Usa una traccia casuale"),
            h("button", { type: "button", class: "btn", onclick: () => setMode("free") }, "Scrittura libera")));
        return;
      }
      const sel = h("select", { "aria-label": "Scegli una traccia", onchange: ev => { S.prompt = list.find(p => p.id === ev.target.value) || null; saveDraft(); showPrompt(); } },
        h("option", { value: "" }, "— scegli una traccia —"), list.map(p => h("option", { value: p.id }, (p.title_it || p.title_zh || p.id) + (p.source ? " · " + p.source : ""))));
      if (S.prompt && S.prompt.type !== "generated") sel.value = S.prompt.id;
      put(box, h("div", { class: "acts wr-left" }, sel, h("button", { type: "button", class: "btn", onclick: () => { S.prompt = pick(list); sel.value = S.prompt.id; saveDraft(); showPrompt(); } }, "Una a caso")), h("div", { class: "wr-pbody" }));
      showPrompt();
    });
    return;
  }
  put(box, h("div", { class: "wr-pbody" }), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => { S.prompt = genPrompt(); saveDraft(); showPrompt(); } }, "Nuova traccia")));
  showPrompt();
}
function showPrompt() {
  const body = S.els.promptBox.querySelector(".wr-pbody"); if (!body) return; body.replaceChildren();
  const p = S.prompt; onInput();
  if (!p) { put(body, h("p", { class: "hint" }, "Scegli una traccia per iniziare.")); return; }
  const L = limitsOf(p);
  put(body, 
    h("div", { class: "wr-title" }, p.title_zh ? h("span", { class: "zh" }, p.title_zh) : null, p.title_zh && p.title_it ? " · " : null, p.title_it),
    p.instruction_zh ? h("p", { class: "zh" }, p.instruction_zh) : null,
    p.instruction_it ? h("p", null, p.instruction_it) : null,
    p.image ? h("img", { class: "wr-img", src: p.image, alt: "Immagine della traccia" }) : null,
    arr(p.points).length ? h("ul", { class: "wr-pts" }, arr(p.points).map(x => h("li", null, x))) : null,
    arr(p.required).length ? h("p", null, h("b", null, "Da usare: "), arr(p.required).map(w => h("span", { class: "chip zh" }, w))) : null,
    arr(p.keywords).length ? h("p", { class: "hint" }, "Parole utili: ", arr(p.keywords).join(" · ")) : null,
    h("p", { class: "hint" }, `Lunghezza richiesta: almeno ${L.min} caratteri, consigliati ${L.lo}–${L.hi}.`));
}

function onInput() {
  const E = S.els; if (!E.ta) return;
  const m = measure(E.ta.value), L = limitsOf(S.mode === "free" ? null : S.prompt);
  const lbl = { hanzi: "hanzi", pinyin: "pinyin", mixed: "hanzi + pinyin", vuoto: "" }[m.script];
  E.count.className = "wr-count" + (m.units && m.units < L.min ? " low" : "");
  E.count.textContent = m.units ? `${m.units} caratteri (${lbl}) · richiesti ${L.min}+, consigliati ${L.lo}–${L.hi}` : `Nessun testo · richiesti ${L.min}+ caratteri, consigliati ${L.lo}–${L.hi}`;
  E.conv.hidden = !/[a-züv][1-5]/i.test(E.ta.value);
  saveDraft();
}
function clearAll() {
  S.els.ta.value = ""; S.hw = null; S.file = null; S.els.hw.hidden = true; S.els.prev.hidden = true; S.els.trBtn.hidden = true; S.els.file.value = "";
  setMsg(S.els.fileMsg, ""); S.els.res.replaceChildren(); onInput();
}

/* ---- caricamento file e trascrizione */
async function onFile(file) {
  const E = S.els; S.file = null; S.hw = null; E.hw.hidden = true; E.prev.hidden = true; E.prev.replaceChildren(); E.trBtn.hidden = true; setMsg(E.fileMsg, "");
  if (!file) return;
  if (file.size > CFG.MAX_UPLOAD_MB * 1048576) return setMsg(E.fileMsg, `Il file supera ${CFG.MAX_UPLOAD_MB} MB.`, "bad");
  const n = file.name.toLowerCase(), t = file.type || "";
  try {
    if (t.startsWith("text/") || /\.(txt|md)$/.test(n)) {
      E.ta.value = (await readTextFile(file)).trim(); onInput(); setMsg(E.fileMsg, "Testo caricato dal file. Controllalo e premi “Valuta il testo”.", "ok");
    } else if (t === "application/pdf" || n.endsWith(".pdf")) {
      let txt = ""; let extractOk = true;
      try { txt = await pdfText(file); } catch (e) { extractOk = false; }
      if (txt.replace(/\s/g, "").length >= 5) { E.ta.value = txt; onInput(); setMsg(E.fileMsg, "Testo estratto dal PDF. Controllalo e premi “Valuta il testo”.", "ok"); }
      else {
        S.file = { kind: "pdf", media: "application/pdf", b64: await readAsB64(file), name: file.name };
        E.trBtn.hidden = !aiOn();
        setMsg(E.fileMsg, (extractOk ? "Questo PDF sembra una scansione (nessun testo selezionabile). " : "Non riesco a leggere il testo del PDF qui. ") + (aiOn() ? "Premi “Leggi e trascrivi” per farlo leggere dal servizio AI." : "La lettura delle scansioni richiede il servizio AI, non collegato: digita il testo a mano."), aiOn() ? "" : "warn");
      }
    } else if (t.startsWith("image/")) {
      const im = await imageToJpeg(file);
      S.file = { kind: "image", media: "image/jpeg", b64: im.b64, name: file.name };
      E.prev.hidden = false; put(E.prev, h("img", { src: im.preview, alt: "Anteprima del testo caricato" }));
      E.trBtn.hidden = !aiOn();
      setMsg(E.fileMsg, aiOn() ? "Immagine pronta. Premi “Leggi e trascrivi”: otterrai una trascrizione da controllare e un’analisi dei caratteri." : "La lettura delle immagini richiede il servizio AI, non collegato: digita il testo a mano.", aiOn() ? "" : "warn");
    } else setMsg(E.fileMsg, "Formato non supportato. Usa .txt, .md, .pdf oppure un’immagine (JPG, PNG).", "bad");
  } catch (e) { setMsg(E.fileMsg, e.message || "Non riesco a leggere il file.", "bad"); }
}

async function transcribe() {
  const E = S.els; if (!S.file || S.busy) return;
  S.busy = true; E.trBtn.disabled = true; setMsg(E.fileMsg, "Sto leggendo il manoscritto…", "");
  try {
    const T = cleanTranscribe(await callAI({ task: "transcribe", level: S.level, media_type: S.file.media, data: S.file.b64 }));
    S.hw = T; E.ta.value = T.text; onInput(); renderHw();
    setMsg(E.fileMsg, T.legible ? "Trascrizione pronta: controllala nel riquadro qui sopra e correggila se serve, poi premi “Valuta il testo”." : "Il testo è poco leggibile: controlla con attenzione la trascrizione.", T.legible ? "ok" : "warn");
  } catch (e) { setMsg(E.fileMsg, e.message, "bad"); }
  finally { S.busy = false; E.trBtn.disabled = false; }
}
function renderHw() {
  const E = S.els, T = S.hw; E.hw.replaceChildren(); E.hw.hidden = !T;
  if (!T) return;
  put(E.hw, h("h4", null, "Analisi del manoscritto"),
    h("p", { class: "hint" }, "La trascrizione è letterale: gli errori non vengono corretti qui, ma nella valutazione. L’analisi dei tratti da una foto è indicativa e l’ordine dei tratti non è verificabile da un’immagine."),
    T.confidence ? h("p", null, "Affidabilità della lettura: ", h("b", null, T.confidence)) : null,
    T.notes ? h("p", null, T.notes) : null,
    T.issues.length ? h("ul", { class: "wr-list" }, T.issues.map(i => h("li", null,
      h("span", { class: "zh lg" }, i.written || "?"), i.intended && i.intended !== i.written ? [" → ", h("span", { class: "zh lg ok" }, i.intended)] : null,
      " ", h("span", { class: "tag" }, HW[i.problem] || "Carattere"), h("div", null, i.description), i.fix ? h("div", { class: "hint" }, "Come migliorare: " + i.fix) : null))) :
      h("p", { class: "hint" }, "Nessun difetto evidente nei caratteri."));
}
const HW = { tratto_mancante: "Tratto mancante", tratto_in_piu: "Tratto in più", tratti_scambiati: "Tratti scambiati o direzione", componente_errato: "Componente sbagliato", proporzioni: "Proporzioni", struttura_spazi: "Struttura e spaziatura", carattere_simile: "Confuso con un carattere simile", illeggibile: "Illeggibile" };
const CAT = { ordine_parole: "Ordine delle parole", classificatore: "Classificatore", particelle: "Particelle (的 / 了 / 吗…)", aspetto_verbale: "Aspetto verbale (了 / 过 / 着)", negazione: "Negazione", coverbi: "Preposizioni e coverbi", complementi: "Complementi", connettivi: "Connettivi e frasi complesse", vocabolario: "Scelta delle parole", caratteri: "Caratteri", pinyin: "Pinyin e toni", punteggiatura: "Punteggiatura", altro: "Altro" };

/* ---- valutazione */
async function getLex() {
  const ids = LV_ORDER.slice(0, LV_ORDER.indexOf(S.level) + 1), key = ids.join();
  if (!S.lex[key]) { const lists = []; for (const id of ids) { try { lists.push(await S.ctx.loadCards(id)); } catch (e) {} } S.lex[key] = buildLex(lists); }
  return S.lex[key];
}
async function evaluate() {
  const E = S.els; if (S.busy) return;
  const text = E.ta.value.trim();
  if (!text) { E.res.replaceChildren(h("p", { class: "wr-msg warn" }, "Scrivi o carica prima un testo.")); E.ta.focus(); return; }
  const free = S.mode === "free" || !S.prompt, P = free ? null : S.prompt, L = limitsOf(P);
  const m = measure(text), lex = await getLex();
  const R = { text, free, prompt: P, L, m, rules: runRules(text), vocab: m.han ? vocab(text, lex) : null, kw: P ? kwCoverage(text, P) : null, ai: null, aiErr: "" };
  R.parts = { length: lengthScore(m.units, L), relevance: P ? (R.kw && R.kw.score) : null, grammar: null };
  R.relEstimated = true;
  renderResult(R, true);
  if (aiOn()) {
    S.busy = true; E.go.disabled = true; E.res.setAttribute("aria-busy", "true");
    try {
      R.ai = cleanEval(await callAI({ task: "evaluate", level: S.level, text, script: m.script,
        prompt: P ? { title_it: P.title_it, title_zh: P.title_zh, instruction_it: P.instruction_it, instruction_zh: P.instruction_zh, keywords: P.keywords, required: P.required, points: P.points } : null }));
      R.parts.grammar = R.ai.grammar.score;
      if (P && R.ai.relevance.applicable && R.ai.relevance.score != null) { R.parts.relevance = R.ai.relevance.score; R.relEstimated = false; }
    } catch (e) { R.aiErr = e.message; }
    finally { S.busy = false; E.go.disabled = false; E.res.removeAttribute("aria-busy"); }
    renderResult(R);
  }
  const c = combine(R.parts, free);
  const hist = lsGet(HK, []); hist.unshift({ t: Date.now(), level: S.level, mode: free ? "free" : S.mode, title: P ? (P.title_it || P.title_zh) : "Scrittura libera", units: m.units, score: c.score, partial: c.partial });
  lsSet(HK, hist.slice(0, 30)); renderHist();
}

// Evidenzia nel testo gli errori trovati (AI, controlli rapidi, pinyin).
function highlighted(R) {
  const t = R.text, ranges = [];
  if (R.ai) for (const e of R.ai.grammar.errors) { const i = e.excerpt ? t.indexOf(e.excerpt) : -1; if (i >= 0) ranges.push({ s: i, e: i + e.excerpt.length, k: "ai" }); }
  for (const r of R.rules) ranges.push({ s: r.s, e: r.e, k: "rule" });
  ranges.sort((a, b) => a.s - b.s || b.e - a.e);
  const out = []; let pos = 0;
  for (const r of ranges) { if (r.s < pos) continue; if (r.s > pos) out.push(t.slice(pos, r.s)); out.push(h("mark", { class: r.k }, t.slice(r.s, r.e))); pos = r.e; }
  out.push(t.slice(pos)); return out;
}

function bar(label, val, note, est) {
  const v = val == null ? null : val;
  return h("div", { class: "wr-sc" }, h("div", { class: "wr-sc-h" }, h("b", null, label), h("span", { class: "wr-sc-v" }, v == null ? "—" : v + "/100", est && v != null ? h("span", { class: "tag" }, "stima") : null)),
    h("div", { class: "bar" }, h("i", { style: `width:${v || 0}%` })), note ? h("div", { class: "hint" }, note) : null);
}

function renderResult(R, scroll) {
  const E = S.els, m = R.m, ai = R.ai, c = combine(R.parts, R.free), L = R.L;
  const root = h("div", { class: "wr-out" });
  put(root, h("h3", { id: "wrOut", tabindex: "-1" }, "Valutazione"),
    h("div", { class: "wr-total" }, h("div", { class: "wr-num" }, c.score == null ? "—" : c.score), h("div", null, h("b", null, gradeOf(c.score)), h("div", { class: "hint" },
      R.aiErr ? "Valutazione AI non disponibile: voto parziale, calcolato solo con i controlli automatici." :
      !aiOn() ? "Voto parziale: senza servizio AI mancano la grammatica completa" + (R.free ? "." : " e l’attinenza vera e propria.") :
      !ai ? "Valutazione AI in corso…" : c.partial ? "Voto parziale (manca qualche componente)." : "Voto complessivo su 100."))));
  if (R.aiErr) put(root, h("p", { class: "wr-msg bad" }, R.aiErr));
  const lenNote = `${m.units} caratteri · minimo ${L.min}, consigliati ${L.lo}–${L.hi}` + (m.units > L.hi * 1.6 ? " · molto più lungo del richiesto: più testo, più occasioni di errore" : "");
  put(root, h("div", { class: "wr-scs" },
    bar("Lunghezza", R.parts.length, lenNote),
    R.free ? null : bar("Attinenza e precisione", R.parts.relevance, ai && !R.relEstimated ? ai.relevance.comment : "Stima dalle parole chiave della traccia; la verifica del contenuto è affidata all’AI.", R.relEstimated),
    bar("Grammatica e sintassi", R.parts.grammar, ai ? ai.grammar.comment : (aiOn() && !R.aiErr ? "In attesa dell’AI…" : "Non valutabile senza il servizio AI. Vedi i controlli automatici qui sotto."))));

  put(root, h("h4", null, "Il tuo testo"), h("p", { class: "wr-text zh", lang: "zh-Hans" }, highlighted(R)),
    h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => S.ctx.speak(R.text) }, "Ascolta")),
    h("p", { class: "hint" }, "Evidenziato in rosso ciò che è stato segnalato."));

  if (ai && ai.grammar.errors.length) {
    put(root, h("h4", null, `Correzioni dell’AI (${ai.grammar.errors.length})`), h("ul", { class: "wr-list" }, ai.grammar.errors.map(e => h("li", null,
      h("span", { class: "zh lg bad" }, e.excerpt), e.correction ? [" → ", h("span", { class: "zh lg ok" }, e.correction)] : null, " ",
      h("span", { class: "tag" + (e.severity === "major" ? " major" : "") }, CAT[e.category] || "Altro"), h("div", null, e.explanation)))));
  } else if (ai) put(root, h("p", { class: "wr-msg ok" }, "L’AI non ha trovato errori da segnalare."));
  if (ai && ai.corrected) put(root, h("h4", null, "Testo corretto"), h("p", { class: "wr-text zh ok-bg", lang: "zh-Hans" }, ai.corrected), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => S.ctx.speak(ai.corrected) }, "Ascolta")));
  if (ai && !R.free) put(root, h("h4", null, "Attinenza alla traccia"), ai.relevance.covered.length || ai.relevance.missing.length ? h("ul", { class: "wr-list" },
    ai.relevance.covered.map(x => h("li", { class: "okl" }, "✓ " + x)), ai.relevance.missing.map(x => h("li", { class: "nol" }, "✗ Manca: " + x))) : null);

  if (R.rules.length) put(root, h("h4", null, "Controlli automatici"), h("ul", { class: "wr-list" }, R.rules.map(r => h("li", null,
    h("span", { class: "zh lg bad" }, R.text.slice(Math.max(0, r.s - 2), r.e + 2)), h("div", null, r.msg)))), h("p", { class: "hint" }, "Sono controlli rapidi su errori frequenti: segnalano dubbi, non sono una correzione completa."));

  if (R.kw && (R.kw.req.hit.length + R.kw.req.miss.length + R.kw.kw.hit.length + R.kw.kw.miss.length)) {
    const chips = (hit, miss) => [hit.map(w => h("span", { class: "chip zh okc" }, "✓ " + w)), miss.map(w => h("span", { class: "chip zh noc" }, "✗ " + w))];
    put(root, h("h4", null, "Parole della traccia"), R.kw.req.hit.length + R.kw.req.miss.length ? h("p", null, h("b", null, "Da usare: "), chips(R.kw.req.hit, R.kw.req.miss)) : null,
      R.kw.kw.hit.length + R.kw.kw.miss.length ? h("p", null, h("b", null, "Utili: "), chips(R.kw.kw.hit, R.kw.kw.miss)) : null);
  }
  if (R.vocab) {
    put(root, h("h4", null, "Vocabolario del livello"), h("p", null, `${R.vocab.pct}% dei caratteri appartiene al lessico fino a ${LV[S.level].label}.`),
      R.vocab.unknown.length ? h("p", null, "Fuori lessico: ", R.vocab.unknown.slice(0, 20).map(u => h("span", { class: "chip zh" + (u.charsKnown ? "" : " noc") }, u.w))) : null,
      h("p", { class: "hint" }, "Stima: nomi propri e parole di livelli superiori compaiono qui. In chiaro i gruppi fatti di caratteri già noti, in rosso quelli con caratteri nuovi. Non influisce sul voto."));
  }
  if (m.tokens) {
    const items = [];
    if (m.bad.length) items.push(h("li", null, "Non sono pinyin valido: ", m.bad.slice(0, 15).map(t => h("span", { class: "chip bad" }, t)), h("span", { class: "hint" }, " (se sono nomi propri o parole italiane, ignora)")));
    if (m.misplaced.length) items.push(h("li", null, "Segno di tono sulla vocale sbagliata: ", m.misplaced.slice(0, 10).map(x => h("span", { class: "chip" }, x.tok + " → " + x.fix))));
    if (m.sylAll && m.untoned / m.sylAll > .3 && m.script !== "hanzi") items.push(h("li", null, `${m.untoned} sillabe senza tono: nel pinyin vanno segnati i toni (tranne il tono neutro).`));
    put(root, h("h4", null, "Pinyin"), items.length ? h("ul", { class: "wr-list" }, items) : h("p", { class: "wr-msg ok" }, "Sillabe e segni di tono corretti nella forma."));
  }
  if (S.hw && S.hw.issues.length) put(root, h("h4", null, "Scrittura a mano"), h("p", { class: "hint" }, `${S.hw.issues.length} caratteri da migliorare: vedi il riquadro “Analisi del manoscritto”.`));
  if (ai && (ai.strengths.length || ai.next.length)) put(root, h("h4", null, "In sintesi"), ai.strengths.length ? h("ul", { class: "wr-list okl" }, ai.strengths.map(x => h("li", null, "✓ " + x))) : null,
    ai.next.length ? h("p", null, h("b", null, "Per migliorare:")) : null, ai.next.length ? h("ul", { class: "wr-list" }, ai.next.map(x => h("li", null, x))) : null);
  E.res.replaceChildren(root);
  if (scroll) { const t = root.querySelector("#wrOut"); if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: "start", behavior: "smooth" }); } }
}

function renderHist() {
  const H = lsGet(HK, []), box = S.els.hist; box.replaceChildren();
  if (!H.length) { put(box, h("p", { class: "hint" }, "Qui compariranno i testi che valuti.")); return; }
  const mode = { random: "Casuale", archive: "Archivio", free: "Libera" };
  const t = h("table", { class: "tbl" }, h("tr", null, ["Data", "Livello", "Traccia", "Caratteri", "Voto"].map(x => h("th", null, x))));
  H.slice(0, 8).forEach(x => put(t, h("tr", null, h("td", null, new Date(x.t).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })), h("td", null, (LV[x.level] || {}).label || x.level),
    h("td", null, (mode[x.mode] || "") + " · " + x.title), h("td", null, x.units), h("td", null, x.score == null ? "—" : x.score + (x.partial ? "*" : "")))));
  put(box, h("div", { class: "wrap" }, t), H.some(x => x.partial) ? h("p", { class: "hint" }, "* voto parziale (senza valutazione AI completa).") : null);
}

/* ------------------------------------------------------------------ API pubblica */
window.Writing = {
  // ctx: { loadCards(id) -> Promise<card[]>, speak(text), getLevel() }
  mount(root, ctx) { S.root = root; S.ctx = ctx; },
  show() { const l = S.ctx.getLevel(); if (S.level !== l || !S.els.ta) { S.level = l; init(); } },
  _t: { SYL, measure, parsePinyinToken, numToMarks, applyTone, runRules, buildLex, vocab, kwCoverage, lengthScore, combine, TOPICS, LV, cleanEval, cleanTranscribe }
};
})();
