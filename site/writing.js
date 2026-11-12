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

// i18n: tx() traduce una chiave italiana; pf() sceglie il campo di una traccia nella lingua scelta (title_en...) oppure traduce il testo italiano.
const tx = (k, v) => window.I18n ? I18n.t(k, v) : k.replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const curLang = () => window.I18n ? I18n.lang : "it";
function pf(p, f) { const l = curLang(); return p[f + "_" + l] || (l === "it" ? p[f + "_it"] : tx(p[f + "_it"] || "")) || ""; }
const pList = p => { const l = curLang(), a = p["points_" + l]; return Array.isArray(a) && a.length ? a : (Array.isArray(p.points) ? p.points.map(x => tx(x)) : []); };

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
  if (/\p{Script=Han}$/u.test(t) && t.length > 3) out.push({ id: "final-punct", msg: tx("Manca la punteggiatura finale (。)."), s: Math.max(0, t.length - 2), e: t.length });
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
  // pinyin del lessico: "sillabe senza tono" -> varianti di toni, per controllare i toni scritti dallo studente
  const py = new Map(), rev = new Map();
  for (const list of cardLists) for (const c of list) for (const v of String(c.pinyin || "").split(/[\/•;；、]/)) {
    const syl = []; let okv = true;
    for (const t of v.trim().split(/\s+/)) { if (!t) continue; const r = parsePinyinToken(t.replace(/[.,…]/g, "")); if (!r.ok) { okv = false; break; } r.syls.forEach(s => syl.push({ b: s.base, t: s.tone || 0 })); }
    if (!okv || !syl.length || syl.length > 4) continue;
    const key = syl.map(s => s.b).join("|"), tones = syl.map(s => s.t), arr = py.get(key) || [];
    const hz = (String(c.hanzi || "").match(/\p{Script=Han}+/u) || [""])[0]; if (hz && [...hz].length === syl.length) { const ra = rev.get(key) || []; if (!ra.some(x => x.h === hz)) { ra.push({ h: hz, tones }); rev.set(key, ra); } }
    if (!arr.some(a => a.join() === tones.join())) arr.push(tones); py.set(key, arr);
  }
  return { words, chars, max, py, rev };
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
const gradeOf = s => s == null ? "" : s >= 85 ? tx("Ottimo") : s >= 70 ? tx("Buono") : s >= 55 ? tx("Sufficiente") : tx("Da migliorare");

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
const S = { sel: new Set(), tele: { pasted: 0, typed: 0, t0: 0 }, ctx: null, root: null, level: null, mode: "random", prompt: null, archive: null, archiveOk: true,
  file: null, hw: null, busy: false, lex: {}, lastTopic: -1, ta: null, els: {} };
const DK = l => "hsk.writing.draft." + l, NK = "hsk.writing.notebook", PFX = "hsk.writing.";
const NB_MAX = 100;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const aiOn = () => !!(window.HSK_CONFIG || {}).AI_ENDPOINT;
const pick = a => a[Math.floor(Math.random() * a.length)];
const sample = (a, n) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); };

function tele(ev) { // telemetria minima, solo in memoria: quanti caratteri digitati e quanti incollati
  const t = S.tele; if (!t.t0) t.t0 = Date.now();
  if (ev && ev.inputType && ev.inputType.startsWith("insertText") && ev.data) t.typed += ev.data.length;
  else if (ev && ev.inputType === "insertCompositionText" && ev.data) t.typed += 1;
}
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
    const r = await fetch((window.HSK_CONFIG || {}).AI_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || tx("Errore del servizio ({s})", { s: r.status }));
    return j.result;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(tx("Il servizio AI non ha risposto in tempo. Riprova tra poco."));
    if (e instanceof TypeError) throw new Error(tx("Impossibile contattare il servizio AI (rete o configurazione)."));
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
    grammar: { score: num(g.score), comment: str(g.comment), errors: arr(g.errors).map(e => ({ excerpt: str(e.excerpt), correction: str(e.correction), category: str(e.category), explanation: str(e.explanation), severity: e.severity === "major" ? "major" : "minor", alternatives: arr(e.alternatives).map(str).filter(Boolean).slice(0, 3) })).filter(e => e.excerpt || e.explanation) },
    highlights: arr(r.highlights).map(x => ({ excerpt: str(x && x.excerpt), note: str(x && x.note) })).filter(x => x.excerpt).slice(0, 6),
    suggestions: arr(r.suggestions).map(x => ({ excerpt: str(x && x.excerpt), alternative: str(x && x.alternative), explanation: str(x && x.explanation) })).filter(x => x.excerpt && x.alternative).slice(0, 5),
    corrected: str(r.corrected_text), strengths: arr(r.strengths).map(str), next: arr(r.next_steps).map(str)
  };
}
function cleanTranscribe(r) {
  r = r || {};
  return { legible: r.legible !== false, script: str(r.script), text: str(r.transcription), confidence: str(r.confidence), notes: str(r.general_notes),
    issues: arr(r.char_issues).map(i => ({ written: str(i.written), intended: str(i.intended), problem: str(i.problem), description: str(i.description), fix: str(i.how_to_fix) })).filter(i => i.written || i.description) };
}

/* ------------------------------------------------------------------ file in ingresso */
/* (lettura dei file: vedi files.js) */

/* ------------------------------------------------------------------ interfaccia */
function setMsg(node, text, kind) { node.className = "wr-msg" + (kind ? " " + kind : ""); node.textContent = text || ""; node.hidden = !text; }

function init() {
  const E = S.els = {};
  S.root.replaceChildren();
  const draft = lsGet(DK(S.level), null);
  S.mode = draft && draft.mode || "random"; S.prompt = draft && draft.prompt || null; S.hw = null; S.file = null;
  if (S.mode === "random" && !S.prompt) S.prompt = genPrompt();

  const modes = [["random", tx("Casuale")], ["archive", tx("Dall’archivio")], ["free", tx("Libera")]];
  E.modeSeg = h("div", { class: "seg", role: "group", "aria-label": tx("Tipo di traccia") }, modes.map(([k, l]) => h("button", { type: "button", "data-m": k, onclick: () => setMode(k) }, l)));
  E.promptBox = h("div", { class: "wr-prompt" });
  E.ta = S.ta = h("textarea", { class: "wr-ta", id: "wrText", rows: "9", lang: "zh-Hans", spellcheck: "false", "aria-describedby": "wrCount", placeholder: tx("Scrivi qui in hanzi o in pinyin (ni3 hao3 oppure nǐ hǎo)…"), oninput: ev => { tele(ev); onInput(); }, onpaste: ev => { try { S.tele.pasted += (ev.clipboardData.getData("text") || "").length; } catch (e) {} } });
  E.count = h("div", { class: "wr-count", id: "wrCount", "aria-live": "off" });
  E.fileMsg = h("p", { class: "wr-msg", hidden: true, role: "status" });
  E.prev = h("div", { class: "wr-prev", hidden: true });
  E.trBtn = h("button", { type: "button", class: "btn", hidden: true, onclick: transcribe }, tx("Leggi e trascrivi il manoscritto"));
  E.hw = h("div", { class: "wr-hw", hidden: true });
  E.conv = h("button", { type: "button", class: "btn", onclick: () => { E.ta.value = numToMarks(E.ta.value); onInput(); } }, tx("Converti ni3 → nǐ"));
  E.go = h("button", { type: "button", class: "btn big", onclick: evaluate }, tx("Valuta il testo"));
  E.res = h("div", { class: "wr-res", "aria-live": "polite" });
  E.hist = h("div", { class: "wr-hist" });
  E.file = h("input", { type: "file", id: "wrFile", accept: FileKit.ACCEPT, onchange: ev => onFile(ev.target.files[0]) });

  put(S.root, 
    h("h2", null, tx("Produzione scritta")),
    h("p", { class: "hint" }, tx("Scrivi un testo in hanzi o in pinyin (o carica un file) e ricevi una valutazione su lunghezza, attinenza alla traccia e grammatica. Livello attuale: {l}. Puoi cambiarlo dalla colonna a sinistra.", { l: LV[S.level].label })),
    aiOn() ? null : h("p", { class: "wr-msg warn" }, tx("Il servizio AI non è collegato: avrai l’analisi automatica (lunghezza, lessico del livello, pinyin, errori frequenti) ma non la correzione grammaticale completa né la lettura dei manoscritti.")),
    h("section", { class: "wr-card" }, h("h3", null, tx("1 · Scegli la traccia")), E.modeSeg, E.promptBox),
    h("section", { class: "wr-card" }, h("h3", null, tx("2 · Scrivi o carica un file")),
      h("label", { for: "wrText", class: "wr-lab" }, tx("Il tuo testo")), E.ta, E.count,
      h("div", { class: "acts wr-left" }, E.conv),
      h("div", { class: "wr-up" },
        h("label", { for: "wrFile", class: "wr-lab" }, tx("Oppure carica un file (PDF, TXT, DOCX, JPEG o PNG; anche la foto di un testo scritto a mano)")), E.file,
        h("p", { class: "hint" }, tx("Le immagini e i PDF scansionati vengono inviati al servizio AI solo per la trascrizione; questo sito non li conserva.")),
        E.fileMsg, E.prev, E.trBtn), E.hw),
    h("div", { class: "acts wr-left" }, E.go, h("button", { type: "button", class: "btn", onclick: clearAll }, tx("Svuota"))),
    E.res,
    h("h3", { class: "wr-h3" }, tx("Quaderno di scrittura")), E.hist
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
    put(box, h("p", null, tx("Scrittura libera: scegli tu l’argomento. Vengono valutate lunghezza e grammatica (non l’attinenza, perché non c’è una traccia).")),
      h("p", { class: "hint" }, tx("Lunghezza consigliata per {l}: {lo}–{hi} caratteri (minimo {min}).", { l: b.label, lo: b.lo, hi: b.hi, min: b.min })));
    return;
  }
  if (S.mode === "archive") {
    put(box, h("p", { class: "hint" }, tx("Carico l’archivio…")));
    ensureArchive().then(() => {
      if (S.mode !== "archive") return;
      box.replaceChildren();
      const list = S.archive.filter(p => p.level === S.level);
      if (!list.length) {
        put(box, h("p", { class: "wr-msg" }, S.archiveOk ? tx("L’archivio delle tracce per {l} è ancora vuoto.", { l: b.label }) : tx("Non riesco a caricare l’archivio delle tracce.")),
          h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => setMode("random") }, tx("Usa una traccia casuale")),
            h("button", { type: "button", class: "btn", onclick: () => setMode("free") }, tx("Scrittura libera"))));
        return;
      }
      const sel = h("select", { "aria-label": tx("Scegli una traccia"), onchange: ev => { S.prompt = list.find(p => p.id === ev.target.value) || null; saveDraft(); showPrompt(); } },
        h("option", { value: "" }, tx("— scegli una traccia —")), list.map(p => h("option", { value: p.id }, (pf(p, "title") || p.title_zh || p.id) + (p.source ? " · " + tx(p.source) : ""))));
      if (S.prompt && S.prompt.type !== "generated") sel.value = S.prompt.id;
      put(box, h("div", { class: "acts wr-left" }, sel, h("button", { type: "button", class: "btn", onclick: () => { S.prompt = pick(list); sel.value = S.prompt.id; saveDraft(); showPrompt(); } }, tx("Una a caso"))), h("div", { class: "wr-pbody" }));
      showPrompt();
    });
    return;
  }
  put(box, h("div", { class: "wr-pbody" }), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => { S.prompt = genPrompt(); saveDraft(); showPrompt(); } }, tx("Nuova traccia"))));
  showPrompt();
}
function showPrompt() {
  const body = S.els.promptBox.querySelector(".wr-pbody"); if (!body) return; body.replaceChildren();
  const p = S.prompt; onInput();
  if (!p) { put(body, h("p", { class: "hint" }, tx("Scegli una traccia per iniziare."))); return; }
  const L = limitsOf(p);
  put(body, 
    h("div", { class: "wr-title" }, p.title_zh ? h("span", { class: "zh" }, p.title_zh) : null, p.title_zh && pf(p, "title") ? " · " : null, pf(p, "title")),
    p.instruction_zh ? h("p", { class: "zh" }, p.instruction_zh) : null,
    pf(p, "instruction") ? h("p", null, pf(p, "instruction")) : null,
    p.image ? h("img", { class: "wr-img", src: p.image, alt: tx("Immagine della traccia") }) : null,
    pList(p).length ? h("ul", { class: "wr-pts" }, pList(p).map(x => h("li", null, x))) : null,
    arr(p.required).length ? h("p", null, h("b", null, tx("Da usare: ")), arr(p.required).map(w => h("span", { class: "chip zh" }, w))) : null,
    arr(p.keywords).length ? h("p", { class: "hint" }, tx("Parole utili: "), arr(p.keywords).join(" · ")) : null,
    h("p", { class: "hint" }, tx("Lunghezza richiesta: almeno {min} caratteri, consigliati {lo}–{hi}.", { min: L.min, lo: L.lo, hi: L.hi })));
}

function onInput() {
  const E = S.els; if (!E.ta) return;
  const m = measure(E.ta.value), L = limitsOf(S.mode === "free" ? null : S.prompt);
  const lbl = { hanzi: "hanzi", pinyin: "pinyin", mixed: tx("hanzi + pinyin"), vuoto: "" }[m.script];
  E.count.className = "wr-count" + (m.units && m.units < L.min ? " low" : "");
  E.count.textContent = m.units ? tx("{n} caratteri ({s}) · richiesti {min}+, consigliati {lo}–{hi}", { n: m.units, s: lbl, min: L.min, lo: L.lo, hi: L.hi }) : tx("Nessun testo · richiesti {min}+ caratteri, consigliati {lo}–{hi}", { min: L.min, lo: L.lo, hi: L.hi });
  E.conv.hidden = !/[a-züv][1-5]/i.test(E.ta.value);
  saveDraft();
}
function clearAll() {
  S.tele = { pasted: 0, typed: 0, t0: 0 };
  S.els.ta.value = ""; S.hw = null; S.file = null; S.els.hw.hidden = true; S.els.prev.hidden = true; S.els.trBtn.hidden = true; S.els.file.value = "";
  setMsg(S.els.fileMsg, ""); S.els.res.replaceChildren(); onInput();
}

/* ---- caricamento file e trascrizione */
async function onFile(file) {
  const E = S.els; S.file = null; S.hw = null; E.hw.hidden = true; E.prev.hidden = true; E.prev.replaceChildren(); E.trBtn.hidden = true; setMsg(E.fileMsg, "");
  if (!file) return;
  try {
    // FileKit controlla estensione, firma reale del file, dimensione e (per DOCX) contenuto; formati: PDF, TXT, DOCX, JPEG, PNG
    const f = await FileKit.readDocument(file, { maxMB: CFG.MAX_UPLOAD_MB, maxEdge: CFG.MAX_IMAGE_EDGE });
    if (f.kind === "text") { E.ta.value = f.text; onInput(); setMsg(E.fileMsg, f.docx ? tx("Testo estratto dal documento Word. Controllalo e premi “Valuta il testo”.") : tx("Testo caricato dal file. Controllalo e premi “Valuta il testo”."), "ok"); }
    else if (f.kind === "pdf") {
      if (f.text) { E.ta.value = f.text; onInput(); setMsg(E.fileMsg, tx("Testo estratto dal PDF. Controllalo e premi “Valuta il testo”."), "ok"); }
      else {
        S.file = { kind: "pdf", media: "application/pdf", b64: f.b64, name: f.name }; E.trBtn.hidden = !aiOn();
        setMsg(E.fileMsg, aiOn() ? tx("Questo PDF sembra una scansione (nessun testo selezionabile). Premi “Leggi e trascrivi” per farlo leggere dal servizio AI.") : tx("Questo PDF sembra una scansione e la lettura richiede il servizio AI, non collegato: digita il testo a mano."), aiOn() ? "" : "warn");
      }
    } else {
      S.file = { kind: "image", media: "image/jpeg", b64: f.b64, name: f.name };
      E.prev.hidden = false; put(E.prev, h("img", { src: f.preview, alt: tx("Anteprima del testo caricato") })); E.trBtn.hidden = !aiOn();
      setMsg(E.fileMsg, aiOn() ? tx("Immagine pronta. Premi “Leggi e trascrivi”: otterrai una trascrizione da controllare e un’analisi dei caratteri.") : tx("La lettura delle immagini richiede il servizio AI, non collegato: digita il testo a mano."), aiOn() ? "" : "warn");
    }
  } catch (e) { setMsg(E.fileMsg, e.message || tx("Non riesco a leggere il file."), "bad"); E.file.value = ""; }
}

async function transcribe() {
  const E = S.els; if (!S.file || S.busy) return;
  S.busy = true; E.trBtn.disabled = true; setMsg(E.fileMsg, tx("Sto leggendo il manoscritto…"), "");
  try {
    const T = cleanTranscribe(await callAI({ task: "transcribe", lang: curLang(), level: S.level, media_type: S.file.media, data: S.file.b64 }));
    S.hw = T; E.ta.value = T.text; onInput(); renderHw();
    setMsg(E.fileMsg, T.legible ? tx("Trascrizione pronta: controllala nel riquadro qui sopra e correggila se serve, poi premi “Valuta il testo”.") : tx("Il testo è poco leggibile: controlla con attenzione la trascrizione."), T.legible ? "ok" : "warn");
  } catch (e) { setMsg(E.fileMsg, e.message, "bad"); }
  finally { S.busy = false; E.trBtn.disabled = false; }
}
function renderHw() {
  const E = S.els, T = S.hw; E.hw.replaceChildren(); E.hw.hidden = !T;
  if (!T) return;
  put(E.hw, h("h4", null, tx("Analisi del manoscritto")),
    h("p", { class: "hint" }, tx("La trascrizione è letterale: gli errori non vengono corretti qui, ma nella valutazione. L’analisi dei tratti da una foto è indicativa e l’ordine dei tratti non è verificabile da un’immagine.")),
    T.confidence ? h("p", null, tx("Affidabilità della lettura: "), h("b", null, T.confidence)) : null,
    T.notes ? h("p", null, T.notes) : null,
    T.issues.length ? h("ul", { class: "wr-list" }, T.issues.map(i => h("li", null,
      h("span", { class: "zh lg" }, i.written || "?"), i.intended && i.intended !== i.written ? [" → ", h("span", { class: "zh lg ok" }, i.intended)] : null,
      " ", h("span", { class: "tag" }, tx(HW[i.problem] || "Carattere")), h("div", null, i.description), i.fix ? h("div", { class: "hint" }, tx("Come migliorare: ") + i.fix) : null))) :
      h("p", { class: "hint" }, tx("Nessun difetto evidente nei caratteri.")));
}
const HW = { tratto_mancante: "Tratto mancante", tratto_in_piu: "Tratto in più", tratti_scambiati: "Tratti scambiati o direzione", componente_errato: "Componente sbagliato", proporzioni: "Proporzioni", struttura_spazi: "Struttura e spaziatura", carattere_simile: "Confuso con un carattere simile", illeggibile: "Illeggibile" };
const CAT = { ordine_parole: "Ordine delle parole", ordine: "Ordine delle parole", grammatica: "Grammatica", stile: "Stile", classificatore: "Classificatore", particelle: "Particelle (的 / 了 / 吗…)", aspetto_verbale: "Aspetto verbale (了 / 过 / 着)", negazione: "Negazione", avverbi: "Avverbi", coverbi: "Preposizioni e coverbi", complementi: "Complementi", connettivi: "Connettivi e frasi complesse", vocabolario: "Scelta delle parole", caratteri: "Caratteri", pinyin: "Pinyin e toni", punteggiatura: "Punteggiatura", altro: "Altro" };

/* ---- valutazione */
async function getLex() {
  const ids = LV_ORDER.slice(0, LV_ORDER.indexOf(S.level) + 1), key = ids.join();
  if (!S.lex[key]) { const lists = []; for (const id of ids) { try { lists.push(await S.ctx.loadCards(id)); } catch (e) {} } S.lex[key] = buildLex(lists); }
  return S.lex[key];
}
async function evaluate() {
  const E = S.els; if (S.busy) return;
  const text = E.ta.value.trim();
  if (window.HSKAI) await HSKAI.ready;
  if (!text) { E.res.replaceChildren(h("p", { class: "wr-msg warn" }, tx("Scrivi o carica prima un testo."))); E.ta.focus(); return; }
  const free = S.mode === "free" || !S.prompt, P = free ? null : S.prompt, L = limitsOf(P);
  const m = measure(text), lex = await getLex();
  const R = { text, free, prompt: P, L, m, rules: runRules(text), local: window.Checker ? Checker.run(text, { lex }) : [], vocab: m.han ? vocab(text, lex) : null, kw: P ? kwCoverage(text, P) : null, ai: null, aiErr: "" };
  R.parts = { length: lengthScore(m.units, L), relevance: P ? (R.kw && R.kw.score) : null, grammar: null };
  R.relEstimated = true;
  renderResult(R, true);
  const nb = lsGet(NK, []);
  // il rilevatore gira PRIMA della chiamata AI: è locale e non deve dipendere dalla rete
  if (window.AIDetector && AIDetector.enabled()) {
    try { R.det = await AIDetector.analyze(text, { level: S.level, lexicon: lex.chars, telemetry: S.tele.pasted + S.tele.typed ? S.tele : null, baseline: nb.filter(x => x.level === S.level).slice(0, 6) }); }
    catch (e) { console.error("[AIDetector]", e); R.det = { humanPct: null, signals: [], notes: [tx("Il rilevatore ha avuto un errore: {m}", { m: e.message })] }; }
    renderResult(R);
  }
  if (aiOn()) {
    S.busy = true; E.go.disabled = true; E.res.setAttribute("aria-busy", "true");
    try {
      R.ai = cleanEval(await callAI({ task: "evaluate", lang: curLang(), level: S.level, text, script: m.script,
        prompt: P ? { title_it: P.title_it, title_zh: P.title_zh, instruction_it: P.instruction_it, instruction_zh: P.instruction_zh, keywords: P.keywords, required: P.required, points: P.points } : null }));
      R.parts.grammar = R.ai.grammar.score;
      if (P && R.ai.relevance.applicable && R.ai.relevance.score != null) { R.parts.relevance = R.ai.relevance.score; R.relEstimated = false; }
    } catch (e) { R.aiErr = e.message; }
    finally { S.busy = false; E.go.disabled = false; E.res.removeAttribute("aria-busy"); }
    renderResult(R);
  }
  const c = combine(R.parts, free);
  nb.unshift({ id: Date.now().toString(36), t: Date.now(), level: S.level, mode: free ? "free" : S.mode, title: P ? (P.title_it || P.title_zh) : tx("Scrittura libera"), text, units: m.units, score: c.score, partial: c.partial });
  lsSet(NK, nb.slice(0, NB_MAX)); renderHist();
}

function bar(label, val, note, est) {
  const v = val == null ? null : val;
  return h("div", { class: "wr-sc" }, h("div", { class: "wr-sc-h" }, h("b", null, label), h("span", { class: "wr-sc-v" }, v == null ? "—" : v + "/100", est && v != null ? h("span", { class: "tag" }, tx("stima")) : null)),
    h("div", { class: "bar" }, h("i", { style: `width:${v || 0}%` })), note ? h("div", { class: "hint" }, note) : null);
}

function renderResult(R, scroll) {
  const E = S.els, m = R.m, ai = R.ai, c = combine(R.parts, R.free), L = R.L;
  const root = h("div", { class: "wr-out" });
  put(root, h("h3", { id: "wrOut", tabindex: "-1" }, tx("Valutazione")),
    h("div", { class: "wr-total" }, h("div", { class: "wr-num" }, c.score == null ? "—" : c.score), h("div", null, h("b", null, gradeOf(c.score)), h("div", { class: "hint" },
      R.aiErr ? tx("Valutazione AI non disponibile: voto parziale, calcolato solo con i controlli automatici.") :
      !aiOn() ? tx(R.free ? "Voto parziale: senza servizio AI mancano la grammatica completa." : "Voto parziale: senza servizio AI mancano la grammatica completa e l’attinenza vera e propria.") :
      !ai ? tx("Valutazione AI in corso…") : c.partial ? tx("Voto parziale (manca qualche componente).") : tx("Voto complessivo su 100.")))));
  if (R.aiErr) put(root, h("p", { class: "wr-msg bad" }, R.aiErr));
  const lenNote = tx(m.units > L.hi * 1.6 ? "{n} caratteri · minimo {min}, consigliati {lo}–{hi} · molto più lungo del richiesto: più testo, più occasioni di errore" : "{n} caratteri · minimo {min}, consigliati {lo}–{hi}", { n: m.units, min: L.min, lo: L.lo, hi: L.hi });
  put(root, h("div", { class: "wr-scs" },
    bar(tx("Lunghezza"), R.parts.length, lenNote),
    R.free ? null : bar(tx("Attinenza e precisione"), R.parts.relevance, ai && !R.relEstimated ? ai.relevance.comment : tx("Stima dalle parole chiave della traccia; la verifica del contenuto è affidata all’AI."), R.relEstimated),
    bar(tx("Grammatica e sintassi"), R.parts.grammar, ai ? ai.grammar.comment : (aiOn() && !R.aiErr ? tx("In attesa dell’AI…") : tx("Non valutabile senza il servizio AI. Vedi i controlli automatici qui sotto.")))));

  const D = Annot.collect(R.text, { errors: ai ? ai.grammar.errors : [], highlights: ai ? ai.highlights : [], suggestions: ai ? ai.suggestions : [], rules: R.rules, local: R.local });
  put(root, h("h4", null, tx("Il tuo testo, corretto e commentato")), Annot.render(D, { speak: S.ctx.speak, catLabel: c => tx(CAT[c] || "Altro") }),
    h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => S.ctx.speak(R.text) }, "🔊 " + tx("Ascolta il testo intero"))),
    !ai ? h("p", { class: R.local.some(x => x.kind === "error" || x.kind === "hanzi" || x.kind === "tone") || R.rules.length ? "hint" : "wr-msg warn" }, R.local.some(x => x.kind === "error" || x.kind === "hanzi" || x.kind === "tone") || R.rules.length ? tx("Controllo automatico senza AI: riconosce classificatori, caratteri confusi, ordine delle parole, toni del pinyin e alcune strutture. Non capisce il senso: per una correzione completa serve il servizio AI.") : tx("Il controllo automatico non ha trovato errori tra quelli che sa riconoscere (classificatori, caratteri confusi, ordine delle parole, toni del pinyin). Questo NON vuol dire che il testo sia perfetto: per una correzione completa serve il servizio AI.")) : null);
  if (ai && !ai.grammar.errors.length) put(root, h("p", { class: "wr-msg ok" }, tx("L’AI non ha trovato errori da segnalare.")));
  if (ai && ai.corrected) put(root, h("h4", null, tx("Testo corretto")), h("p", { class: "wr-text zh ok-bg", lang: "zh-Hans" }, ai.corrected), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => S.ctx.speak(ai.corrected) }, "Ascolta")));
  if (ai && !R.free) put(root, h("h4", null, tx("Attinenza alla traccia")), ai.relevance.covered.length || ai.relevance.missing.length ? h("ul", { class: "wr-list" },
    ai.relevance.covered.map(x => h("li", { class: "okl" }, "✓ " + x)), ai.relevance.missing.map(x => h("li", { class: "nol" }, tx("✗ Manca: {x}", { x })))) : null);


  if (R.kw && (R.kw.req.hit.length + R.kw.req.miss.length + R.kw.kw.hit.length + R.kw.kw.miss.length)) {
    const chips = (hit, miss) => [hit.map(w => h("span", { class: "chip zh okc" }, "✓ " + w)), miss.map(w => h("span", { class: "chip zh noc" }, "✗ " + w))];
    put(root, h("h4", null, tx("Parole della traccia")), R.kw.req.hit.length + R.kw.req.miss.length ? h("p", null, h("b", null, tx("Da usare: ")), chips(R.kw.req.hit, R.kw.req.miss)) : null,
      R.kw.kw.hit.length + R.kw.kw.miss.length ? h("p", null, h("b", null, tx("Utili: ")), chips(R.kw.kw.hit, R.kw.kw.miss)) : null);
  }
  if (R.vocab) {
    put(root, h("h4", null, tx("Vocabolario del livello")), h("p", null, tx("{p}% dei caratteri appartiene al lessico fino a {l}.", { p: R.vocab.pct, l: LV[S.level].label })),
      R.vocab.unknown.length ? h("p", null, tx("Fuori lessico: "), R.vocab.unknown.slice(0, 20).map(u => h("span", { class: "chip zh" + (u.charsKnown ? "" : " noc") }, u.w))) : null,
      h("p", { class: "hint" }, tx("Stima: nomi propri e parole di livelli superiori compaiono qui. In chiaro i gruppi fatti di caratteri già noti, in rosso quelli con caratteri nuovi. Non influisce sul voto.")));
  }
  if (m.tokens) {
    const items = [];
    if (m.bad.length) items.push(h("li", null, tx("Non sono pinyin valido: "), m.bad.slice(0, 15).map(t => h("span", { class: "chip bad" }, t)), h("span", { class: "hint" }, tx(" (se sono nomi propri o parole italiane, ignora)"))));
    if (m.misplaced.length) items.push(h("li", null, tx("Segno di tono sulla vocale sbagliata: "), m.misplaced.slice(0, 10).map(x => h("span", { class: "chip" }, x.tok + " → " + x.fix))));
    if (m.sylAll && m.untoned / m.sylAll > .3 && m.script !== "hanzi") items.push(h("li", null, tx("{n} sillabe senza tono: nel pinyin vanno segnati i toni (tranne il tono neutro).", { n: m.untoned })));
    put(root, h("h4", null, tx("Pinyin")), items.length ? h("ul", { class: "wr-list" }, items) : h("p", { class: "wr-msg ok" }, tx("Sillabe e segni di tono corretti nella forma.")));
  }
  if (R.det && R.det.humanPct != null) put(root, h("h4", null, tx("Indizi di scrittura automatica (opzionale)")),
    h("div", { class: "wr-det" }, h("div", { class: "wr-detn" }, tx("Probabilità testo umano: {p}%", { p: R.det.humanPct })), h("span", { class: "tag" }, tx("affidabilità {l}", { l: tx(R.det.level) }))),
    h("ul", { class: "wr-list" }, R.det.signals.map(x => h("li", null, h("b", null, x.label + ": "), String(x.value), x.note ? h("div", { class: "hint" }, x.note) : null))),
    h("p", { class: "wr-msg warn" }, tx("Stima orientativa, non una prova e non influisce sul voto. Non è calibrata e sbaglia spesso sui testi brevi e di chi studia cinese.")));
  else if (R.det && R.det.notes.length) put(root, h("h4", null, tx("Indizi di scrittura automatica (opzionale)")), h("p", { class: "wr-msg" }, R.det.notes[0]));
  if (S.hw && S.hw.issues.length) put(root, h("h4", null, tx("Scrittura a mano")), h("p", { class: "hint" }, tx("{n} caratteri da migliorare: vedi il riquadro “Analisi del manoscritto”.", { n: S.hw.issues.length })));
  if (ai && (ai.strengths.length || ai.next.length)) put(root, h("h4", null, tx("In sintesi")), ai.strengths.length ? h("ul", { class: "wr-list okl" }, ai.strengths.map(x => h("li", null, "✓ " + x))) : null,
    ai.next.length ? h("p", null, h("b", null, tx("Per migliorare:"))) : null, ai.next.length ? h("ul", { class: "wr-list" }, ai.next.map(x => h("li", null, x))) : null);
  E.res.replaceChildren(root);
  if (scroll) { const t = root.querySelector("#wrOut"); if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: "start", behavior: "smooth" }); } }
}

// Quaderno: elenco con caselle di selezione. Lo stato della selezione vive solo in memoria (S.sel); i testi stanno in localStorage (NK).
function nbDelete(ids) {
  const set = new Set(ids); lsSet(NK, lsGet(NK, []).filter(y => !set.has(y.id)));
  ids.forEach(id => S.sel.delete(id)); renderHist();
}
function renderHist() {
  const H = lsGet(NK, []), box = S.els.hist; box.replaceChildren();
  const alive = new Set(H.map(x => x.id)); [...S.sel].forEach(id => { if (!alive.has(id)) S.sel.delete(id); });
  if (!H.length) { put(box, h("p", { class: "hint" }, tx("Il quaderno è vuoto: qui resteranno i testi che valuti, con il voto."))); return; }
  const mode = { random: tx("Casuale"), archive: tx("Archivio"), free: tx("Libera") };
  const n = S.sel.size, all = h("input", { type: "checkbox", id: "wrSelAll", "aria-label": tx("Seleziona tutti i testi") });
  all.checked = n === H.length; all.indeterminate = n > 0 && n < H.length;
  all.onchange = () => { all.checked ? H.forEach(x => S.sel.add(x.id)) : S.sel.clear(); renderHist(); };
  const del = h("button", { type: "button", class: "btn", disabled: n === 0, onclick: () => {
    if (confirm(tx(n === 1 ? "Eliminare {n} testo dal quaderno?\n\nL’operazione non si può annullare." : "Eliminare {n} testi dal quaderno?\n\nL’operazione non si può annullare.", { n }))) nbDelete([...S.sel]);
  } }, n ? tx("Elimina selezionati ({n})", { n }) : tx("Elimina selezionati"));
  put(box, h("div", { class: "wr-bar" }, h("label", { class: "wr-selall" }, all, " " + tx("Seleziona tutti ({n})", { n: H.length })), del));
  put(box, h("div", { class: "wr-nb" }, H.map(x => {
    const cb = h("input", { type: "checkbox", "aria-label": tx("Seleziona: {t}", { t: x.title }) }); cb.checked = S.sel.has(x.id);
    cb.onchange = () => { cb.checked ? S.sel.add(x.id) : S.sel.delete(x.id); renderHist(); };
    return h("div", { class: "wr-row" }, cb, h("details", { class: "wr-ent" },
      h("summary", null, h("span", { class: "wr-d" }, new Date(x.t).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })), " · ", (LV[x.level] || {}).label || x.level, " · ", (mode[x.mode] || "") + " · " + x.title,
        h("span", { class: "tag" }, x.score == null ? "—" : x.score + (x.partial ? "*" : ""))),
      h("p", { class: "wr-text zh", lang: "zh-Hans" }, x.text || tx("(testo non conservato)")),
      h("div", { class: "acts wr-left" },
        h("button", { type: "button", class: "btn", onclick: () => { S.els.ta.value = x.text || ""; onInput(); S.els.ta.scrollIntoView({ behavior: "smooth", block: "center" }); } }, tx("Riapri nell’editor")),
        h("button", { type: "button", class: "btn", onclick: () => { if (confirm(tx("Eliminare questo testo?"))) nbDelete([x.id]); } }, tx("Elimina")))));
  })), H.some(x => x.partial) ? h("p", { class: "hint" }, tx("* voto parziale (senza valutazione AI completa).")) : null);
}

/* ------------------------------------------------------------------ API pubblica */
window.Writing = {
  // ctx: { loadCards(id) -> Promise<card[]>, speak(text), getLevel() }
  mount(root, ctx) { S.root = root; S.ctx = ctx; },
  show() {
    const l = S.ctx.getLevel();
    if (!LV[l]) { S.level = l; S.els = {}; S.root.replaceChildren(h("h2", null, tx("Produzione scritta")), h("p", { class: "wr-msg" }, tx("Scrittura non ancora disponibile per questo livello: per ora sono pronti HSK 1, 2 e 3."))); return; }
    if (S.level !== l || !S.els.ta) { S.level = l; init(); }
  },
  refresh() { if (S.els && S.els.ta) saveDraft(); S.els = {}; this.show(); },     // cambio lingua: ridisegna mantenendo il testo (bozza)
  _t: { SYL, measure, parsePinyinToken, numToMarks, applyTone, runRules, buildLex, vocab, kwCoverage, lengthScore, combine, TOPICS, LV, cleanEval, cleanTranscribe }
};
})();
