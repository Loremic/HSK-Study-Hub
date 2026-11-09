/* Comprensione del testo (Lettura).  window.Reading
 *
 * Due modi:
 *  - ESERCIZI: data/reading.json, testi originali in stile HSK (vero/falso, completa la frase con un elenco di parole, scelta multipla).
 *    Verificati: lessico del livello, citazioni presenti nel testo, risoluzione indipendente concorde. Non sono testi d'esame ufficiali.
 *  - DAL TUO FILE: PDF, TXT, DOCX, JPEG, PNG (FileKit) -> testo modificabile -> domande in stile HSK generate dall'AI (worker "read_gen")
 *    e VERIFICATE nel browser (la citazione deve stare nel testo; nelle frasi da completare la frase riempita deve esistere nel testo).
 *    Senza servizio AI: domande "completa la frase" costruite in locale dal testo.
 * Il file e il testo non vengono salvati: nel log restano solo punteggi.
 */
(function () {
"use strict";
const W = window.Writing && window.Writing._t;
const CFG = Object.assign({ AI_ENDPOINT: "", AI_TIMEOUT_MS: 70000, READING_URL: "../data/reading.json", MAX_UPLOAD_MB: 10, MAX_IMAGE_EDGE: 1600 }, window.HSK_CONFIG || {});
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const curLang = () => window.I18n ? I18n.lang : "it";
const LV = ["hsk1", "hsk2", "hsk3"], LOG = "hsk.reading.log", LOG_MAX = 200, READ_MAX = 3000;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const arr = a => Array.isArray(a) ? a : [];
const str = x => typeof x === "string" ? x : "";
const HANRE = /\p{Script=Han}/gu;
const han = t => String(t).match(HANRE) || [];
const norm = s => String(s).replace(/[\s，。！？、；：“”‘’（）()「」『』《》,.!?;:"'—…·\-]/g, "");
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const letter = i => String.fromCharCode(65 + i);
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
  }
  put(e, ...kids); return e;
}
function put(p, ...kids) { for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; p.append(c.nodeType ? c : document.createTextNode(String(c))); } return p; }
function setMsg(n, t, kind) { n.className = "wr-msg" + (kind ? " " + kind : ""); n.textContent = t || ""; n.hidden = !t; }

const TYPE_LABEL = { tf: "Vero o falso", blank: "Completa la frase", mcq: "Scelta multipla", mixed: "Esercizio dal tuo file" };
const TYPE_ZH = { tf: "判断对错", blank: "选词填空", mcq: "选择正确答案", mixed: "阅读理解" };
const aiOn = () => !!CFG.AI_ENDPOINT;

/* ------------------------------------------------------------------ logica pura (testabile) */
// prepara un esercizio per la sessione: mescola le opzioni e riallinea le risposte
function prepare(ex) {
  const out = { id: ex.id, level: ex.level, type: ex.type, title: ex.title, passage: ex.passage || "", src: ex.src || "set", items: [] };
  let bank = null, map = null;
  if (ex.type === "blank" && ex.bank) { const order = shuffle(ex.bank.map((w, i) => i)); bank = order.map(i => ex.bank[i]); map = order; }
  for (const it of ex.items) {
    const o = { type: it.type || ex.type, q: it.q, evidence: it.evidence || "", explanation: it.explanation || "" };
    if (o.type === "tf") { o.answer = it.answer === true || it.answer === 1; }
    else if (bank) { o.options = bank; o.answer = map.indexOf(it.answer); }
    else { const order = shuffle(arr(it.options).map((x, i) => i)); o.options = order.map(i => it.options[i]); o.answer = order.indexOf(it.answer); }
    out.items.push(o);
  }
  return out;
}
const gradeOf = pct => pct >= 90 ? tx("Ottimo") : pct >= 75 ? tx("Buono") : pct >= 60 ? tx("Sufficiente") : tx("Da migliorare");
function mark(items, given) {
  let ok = 0; const res = items.map((it, i) => { const g = given[i]; const right = g !== undefined && g !== null && (it.type === "tf" ? g === it.answer : g === it.answer); if (right) ok++; return right; });
  return { ok, total: items.length, res };
}
// controllo delle domande generate dall'AI: ogni domanda deve essere ancorata al testo, altrimenti è scartata
function vetQuestions(raw, text) {
  const T = norm(text), good = []; let dropped = 0;
  for (const q of arr(raw)) {
    try {
      const type = q.type, stem = str(q.q).trim(), ev = str(q.evidence).trim(); let a = q.answer, opts = arr(q.options).map(str).map(s => s.trim());
      if (!["tf", "mcq", "blank"].includes(type) || !stem || stem.length > 120) throw 0;
      if (type === "tf") { if (a !== 0 && a !== 1) throw 0; if (!ev || !T.includes(norm(ev))) throw 0; good.push({ type, q: stem, answer: a === 1, evidence: ev, explanation: str(q.explanation) }); continue; }
      if (opts.length < 3 || opts.length > 4 || opts.some(o => !o) || new Set(opts).size !== opts.length || !Number.isInteger(a) || a < 0 || a >= opts.length) throw 0;
      if (type === "mcq") { if (!ev || !T.includes(norm(ev))) throw 0; }
      else {
        if (stem.split("____").length !== 2) throw 0;
        const fill = o => norm(stem.replace("____", o));
        if (!T.includes(fill(opts[a]))) throw 0;                                    // la frase completata deve esistere nel testo
        if (opts.some((o, i) => i !== a && T.includes(fill(o)))) throw 0;           // un'altra opzione darebbe una frase pure presente: ambigua
      }
      good.push({ type, q: stem, options: opts, answer: a, evidence: ev || stem.replace("____", opts[a]), explanation: str(q.explanation) });
    } catch (e) { dropped++; }
  }
  return { items: good, dropped };
}
// domande "completa la frase" costruite in locale (nessuna AI): sceglie una parola dal testo e propone distrattori
function localCloze(text, lex, n) {
  const sents = (text.match(/[^。！？!?\n]+[。！？!?]?/g) || []).map(s => s.trim()).filter(s => han(s).length >= 6 && han(s).length <= 40);
  let seg; try { seg = new Intl.Segmenter("zh", { granularity: "word" }); } catch (e) { return []; }
  const wordsOf = s => [...seg.segment(s)].filter(x => x.isWordLike && /^\p{Script=Han}{1,4}$/u.test(x.segment)).map(x => x.segment);
  const junk = /^[了的着过得地吗呢吧]|[了的着过得地吗呢吧]$|^[一二三四五六七八九十两几]/u;
  const known = w => !lex || lex.words.has(w) || [...w].every(ch => lex.chars.has(ch));
  const good = w => [...w].length >= 2 && !junk.test(w) && known(w);
  const pool = [...new Set(sents.flatMap(wordsOf))].filter(good), out = [];
  for (const strict of [true, false]) {
    for (const s of shuffle(sents)) {
      if (out.length >= n) break; if (out.some(o => o.evidence === s)) continue;
      const cand = wordsOf(s).filter(w => good(w) && (!strict || !lex || lex.words.has(w))); if (!cand.length) continue;
      const w = cand[rnd(cand.length)], at = s.indexOf(w); if (at < 0 || s.indexOf(w, at + 1) >= 0) continue;
      const same = pool.filter(x => x !== w && [...x].length === [...w].length && !s.includes(x)), dis = shuffle(same).slice(0, 3);
      if (dis.length < 2) continue;
      const opts = shuffle([w, ...dis]);
      out.push({ type: "blank", q: s.slice(0, at) + "____" + s.slice(at + w.length), options: opts, answer: opts.indexOf(w), evidence: s, explanation: "" });
    }
  }
  return out;
}
function cutText(t) {                                    // massimo READ_MAX caratteri, tagliando a fine frase
  if (t.length <= READ_MAX) return { text: t, cut: false };
  const head = t.slice(0, READ_MAX), k = Math.max(head.lastIndexOf("。"), head.lastIndexOf("！"), head.lastIndexOf("？"), head.lastIndexOf("\n"));
  return { text: (k > READ_MAX * .5 ? head.slice(0, k + 1) : head).trim(), cut: true };
}

/* ------------------------------------------------------------------ stato e AI */
const S = { root: null, ctx: null, level: null, data: null, dataOk: true, lex: {}, mode: "sets", ttype: "all", ex: null, given: [], done: false, timer: null, els: {}, file: null, text: "" };
async function callAI(payload) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), CFG.AI_TIMEOUT_MS);
  try {
    const r = await fetch(CFG.AI_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || tx("Errore del servizio ({s})", { s: r.status }));
    return j.result;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(tx("Il servizio AI non ha risposto in tempo. Riprova tra poco."));
    if (e instanceof TypeError) throw new Error(tx("Impossibile contattare il servizio AI (rete o configurazione)."));
    throw e;
  } finally { clearTimeout(to); }
}
async function loadData() {
  if (S.data) return;
  try { const r = await fetch(CFG.READING_URL, { cache: "no-cache" }); if (!r.ok) throw 0; S.data = await r.json(); S.dataOk = true; } catch (e) { S.data = { sets: [] }; S.dataOk = false; }
}
async function getLex() {
  const ids = LV.slice(0, LV.indexOf(S.level) + 1), key = ids.join();
  if (!S.lex[key] && W) { const lists = []; for (const id of ids) { try { lists.push(await S.ctx.loadCards(id)); } catch (e) {} } S.lex[key] = W.buildLex(lists); }
  return S.lex[key] || null;
}
const sets = () => (S.data.sets || []).filter(s => s.level === S.level && (S.ttype === "all" || s.type === S.ttype));
const doneMap = () => { const m = {}; for (const x of lsGet(LOG, [])) if (x.id && (!m[x.id] || x.score > m[x.id].score)) m[x.id] = x; return m; };

/* ------------------------------------------------------------------ interfaccia */
function stopTimer() { clearInterval(S.timer); S.timer = null; }
function init() {
  S.els = {}; S.root.replaceChildren(); stopTimer(); S.ex = null;
  put(S.root, h("h2", null, tx("Lettura")), h("p", { class: "hint" }, tx("Comprensione del testo in stile HSK: esercizi pronti oppure domande create dal tuo file.")));
  const seg = h("div", { class: "seg", role: "group", "aria-label": tx("Modalità") }, [["sets", tx("Esercizi")], ["file", tx("Dal tuo file")]].map(([k, l]) => h("button", { type: "button", "data-m": k, onclick: () => setMode(k) }, l)));
  S.els.seg = seg; S.els.body = h("div"); S.els.hist = h("div", { class: "wr-hist" });
  put(S.root, h("div", { class: "acts wr-left rd-bar" }, seg), S.els.body, h("h3", { class: "wr-h3" }, tx("Cronologia della lettura")), S.els.hist);
  setMode(S.mode); renderHist();
}
function setMode(m) { S.mode = m; stopTimer(); S.ex = null; S.els.seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m))); m === "sets" ? viewSets() : viewFile(); }

/* --- elenco esercizi */
function viewSets() {
  const B = S.els.body; B.replaceChildren();
  const types = [["all", tx("Tutti")], ["tf", tx(TYPE_LABEL.tf)], ["blank", tx(TYPE_LABEL.blank)], ["mcq", tx(TYPE_LABEL.mcq)]];
  const sel = h("div", { class: "seg", role: "group", "aria-label": tx("Tipo di prova") }, types.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(S.ttype === k), onclick: () => { S.ttype = k; viewSets(); } }, l)));
  const list = sets(), done = doneMap();
  const rand = h("button", { type: "button", class: "btn big", onclick: () => { const todo = list.filter(s => !done[s.id]); const pool = todo.length ? todo : list; if (pool.length) openEx(pool[rnd(pool.length)], "set"); } }, tx("Esercizio casuale"));
  rand.disabled = !list.length;
  put(B, h("div", { class: "wr-card" }, h("div", { class: "acts wr-left" }, sel, rand),
    list.length ? h("div", { class: "rd-list" }, list.map((s, i) => { const d = done[s.id]; return h("button", { type: "button", class: "rd-row", onclick: () => openEx(s, "set") },
      h("span", { class: "tag" }, tx(TYPE_LABEL[s.type])), " " + (s.passage ? s.passage.slice(0, 16) + "…" : (s.items[0].q || "").replace("____", "＿").slice(0, 16) + "…"), d ? h("span", { class: "tag ok" }, "✓ " + d.score + "/" + d.total) : null); })) :
      h("p", { class: "hint" }, S.dataOk ? tx("Non ci sono ancora esercizi di questo tipo per {l}.", { l: S.level.replace("hsk", "HSK ") }) : tx("Non riesco a caricare gli esercizi di lettura."))),
    h("p", { class: "hint" }, tx("Esercizi originali nello stile HSK (non sono testi d’esame ufficiali). Il formato reale può variare: controlla le indicazioni ufficiali del CTI.")));
}

/* --- esercizio */
function openEx(ex, src) {
  stopTimer(); if (src !== "file") S.note = ""; S.ex = prepare(Object.assign({}, ex, { src })); S.given = S.ex.items.map(() => null); S.done = false; renderEx();
  S.els.body.scrollIntoView({ block: "start" });
}
function passageNode(text, hl) {
  const p = h("p", { class: "zh lg rd-passage", lang: "zh-Hans" });
  const ranges = hl.map(e => { const i = text.indexOf(e); return i >= 0 ? [i, i + e.length] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
  let pos = 0; for (const [a, b] of ranges) { if (a < pos) continue; p.append(text.slice(pos, a)); p.append(h("mark", null, text.slice(a, b))); pos = b; }
  p.append(text.slice(pos)); return p;
}
function renderEx() {
  const B = S.els.body, ex = S.ex; B.replaceChildren(); const done = S.done;
  const back = h("button", { type: "button", class: "btn", onclick: () => { stopTimer(); S.ex = null; S.mode === "sets" ? viewSets() : viewFile(true); } }, "← " + tx("Indietro"));
  const head = h("div", { class: "wr-title" }, tx(TYPE_LABEL[ex.type] || TYPE_LABEL.mixed), h("span", { class: "tag zh" }, TYPE_ZH[ex.type] || TYPE_ZH.mixed), ex.src === "file" ? h("span", { class: "tag" }, tx("dal tuo file")) : null);
  put(B, back, h("div", { class: "wr-card" }, head));
  const card = B.lastChild;
  if (ex.src === "file" && S.note) put(card, h("p", { class: "wr-msg warn" }, S.note));
  if (ex.passage) {
    const hl = done ? ex.items.map((it, i) => (S.given[i] !== it.answer && it.evidence ? it.evidence : null)).filter(Boolean) : [];
    put(card, passageNode(ex.passage, hl), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => S.ctx.speak(ex.passage.slice(0, 600)) }, "🔊 " + tx("Leggi il testo"))));
    if (done && hl.length) put(card, h("p", { class: "hint" }, tx("In giallo: la parte del testo che contiene la risposta alle domande sbagliate.")));
  }
  if (ex.type === "blank" && ex.items[0].options) put(card, h("div", { class: "rd-bank", "aria-label": tx("Parole tra cui scegliere") }, ex.items[0].options.map((w, i) => h("span", { class: "chip zh" }, letter(i) + " " + w))));
  const fm = done ? mark(ex.items, S.given) : null;
  ex.items.forEach((it, i) => {
    const name = "q" + i, legend = h("legend", null, h("b", null, (i + 1) + ". "), h("span", { class: "zh", lang: "zh-Hans" }, it.q));
    const fs = h("fieldset", { class: "rd-q" + (done ? (fm.res[i] ? " good" : " bad") : "") }, legend);
    const set = v => { S.given[i] = v; };
    if (it.type === "tf") {
      [[true, "✓ 对 · " + tx("Vero")], [false, "✗ 错 · " + tx("Falso")]].forEach(([v, l]) => { const r = h("input", { type: "radio", name, disabled: done, onchange: () => set(v) }); r.checked = S.given[i] === v; fs.append(h("label", { class: "rd-opt" }, r, " " + l)); });
    } else if (it.type === "blank" || (ex.type === "blank")) {
      const sl = h("select", { "aria-label": tx("Scegli la parola per la frase {n}", { n: i + 1 }), disabled: done, onchange: e => set(e.target.value === "" ? null : +e.target.value) }, h("option", { value: "" }, "—"), it.options.map((w, k) => h("option", { value: k }, letter(k) + " " + w)));
      if (S.given[i] != null) sl.value = String(S.given[i]); fs.append(sl);
    } else {
      it.options.forEach((o, k) => { const r = h("input", { type: "radio", name, disabled: done, onchange: () => set(k) }); r.checked = S.given[i] === k; fs.append(h("label", { class: "rd-opt" }, r, h("span", { class: "zh", lang: "zh-Hans" }, " " + letter(k) + ". " + o))); });
    }
    if (done) {
      const right = it.type === "tf" ? (it.answer ? tx("Vero") : tx("Falso")) : letter(it.answer) + " " + it.options[it.answer];
      fs.append(h("p", { class: "rd-fb" }, fm.res[i] ? "✓ " + tx("Corretto") : "✗ " + tx("Risposta giusta: {a}", { a: right })),
        it.evidence ? h("p", { class: "hint" }, tx("Nel testo: "), h("span", { class: "zh", lang: "zh-Hans" }, "“" + it.evidence + "”")) : null, it.explanation ? h("p", { class: "hint" }, it.explanation) : null);
    }
    card.append(fs);
  });
  if (!done) {
    const timerBox = h("span", { class: "rd-time", "aria-live": "off" }), cb = h("input", { type: "checkbox" });
    cb.onchange = () => { stopTimer(); timerBox.textContent = ""; if (cb.checked) { let left = Math.max(60, ex.items.length * 50); const tick = () => { timerBox.textContent = "⏱ " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); if (left-- <= 0) { stopTimer(); finish(); } }; tick(); S.timer = setInterval(tick, 1000); } };
    put(card, h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn big", onclick: finish }, tx("Controlla le risposte")), h("label", { class: "hint rd-chk" }, cb, " " + tx("Con timer (stile esame)")), timerBox));
  } else {
    const pct = Math.round(100 * fm.ok / fm.total);
    put(card, h("div", { class: "wr-total" }, h("div", { class: "wr-num" }, fm.ok + "/" + fm.total), h("div", null, h("b", null, gradeOf(pct)), h("div", { class: "hint" }, pct + "%"))),
      h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn big", onclick: () => openEx(S.ex.src === "file" ? S.ex : srcEx(S.ex.id) || S.ex, S.ex.src) }, tx("Riprova")), back.cloneNode(true)));
    card.lastChild.lastChild.onclick = back.onclick;
  }
}
const srcEx = id => (S.data.sets || []).find(s => s.id === id);
function finish() {
  if (!S.ex || S.done) return; stopTimer();
  const m = mark(S.ex.items, S.given); S.done = true;
  const L = lsGet(LOG, []); L.push({ k: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: Date.now(), id: S.ex.id || "", level: S.level, type: S.ex.type, src: S.ex.src, score: m.ok, total: m.total }); lsSet(LOG, L.slice(-LOG_MAX));
  renderEx(); renderHist(); S.els.body.scrollIntoView({ block: "start" });
}

/* --- dal tuo file */
function viewFile(keep) {
  const B = S.els.body; B.replaceChildren();
  const E = S.els; E.fMsg = h("p", { class: "wr-msg", hidden: true, role: "status" }); E.gMsg = h("p", { class: "wr-msg", hidden: true, role: "status" });
  E.input = h("input", { type: "file", accept: FileKit.ACCEPT, "aria-label": tx("Carica un file"), onchange: ev => onFile(ev.target.files[0]) });
  E.ta = h("textarea", { class: "wr-ta", rows: "8", lang: "zh-Hans", spellcheck: "false", placeholder: tx("Incolla qui un testo in cinese oppure carica un file: il testo comparirà qui e potrai correggerlo."), oninput: info });
  E.info = h("p", { class: "wr-count" });
  E.read = h("button", { type: "button", class: "btn", hidden: true, onclick: readFromFile }, tx("Leggi il testo dal file"));
  E.n = h("select", { "aria-label": tx("Numero di domande") }, [3, 5, 8].map(n => h("option", { value: n }, tx("{n} domande", { n })))); E.n.value = "5";
  E.types = ["mcq", "tf", "blank"].map(k => { const c = h("input", { type: "checkbox", "data-t": k }); c.checked = true; return c; });
  E.go = h("button", { type: "button", class: "btn big", onclick: generate }, tx("Crea le domande"));
  put(B, h("div", { class: "wr-card" }, h("h3", null, tx("1 · Il testo")), h("label", { class: "wr-lab" }, tx("Carica un file (PDF, TXT, DOCX, JPEG o PNG)")), E.input, E.fMsg,
    h("div", { class: "acts wr-left" }, E.read), E.ta, E.info,
    h("p", { class: "hint" }, tx("Il file viene letto nel tuo browser. Solo per i PDF scansionati e le foto il testo viene letto dal servizio AI, se collegato; il sito non conserva nulla. Usa testi di cui hai i diritti."))),
    h("div", { class: "wr-card" }, h("h3", null, tx("2 · Le domande")), h("div", { class: "acts wr-left" }, E.n, ...E.types.map((c, i) => h("label", { class: "hint rd-chk" }, c, " " + tx(TYPE_LABEL[c.dataset.t])))), h("div", { class: "acts wr-left" }, E.go), E.gMsg,
      h("p", { class: "hint" }, aiOn() ? tx("Le domande sono create dall’AI nello stile HSK del livello scelto e poi controllate qui: ogni risposta deve essere dimostrata da una frase del testo, altrimenti la domanda viene scartata.") : tx("Il servizio AI non è collegato: creo semplici domande “completa la frase” dal testo, senza AI."))));
  if (keep && S.text) E.ta.value = S.text; info();
}
function info() {
  const E = S.els; S.text = E.ta.value; const n = han(S.text).length;
  if (!n) return (E.info.textContent = tx("Nessun testo"));
  getLex().then(lex => { if (!lex || !W) return; const v = W.vocab(S.text, lex); E.info.textContent = tx("{n} caratteri cinesi", { n }) + (v && v.pct != null ? " · " + tx("Lessico del livello: {p}% dei caratteri", { p: v.pct }) : "") + (S.text.length > READ_MAX ? " · " + tx("userò i primi {n} caratteri", { n: READ_MAX }) : ""); });
}
async function onFile(file) {
  const E = S.els; S.file = null; E.read.hidden = true; setMsg(E.fMsg, ""); if (!file) return;
  try {
    const f = await FileKit.readDocument(file, { maxMB: CFG.MAX_UPLOAD_MB, maxEdge: CFG.MAX_IMAGE_EDGE });
    if (f.kind === "text" || (f.kind === "pdf" && f.text)) { E.ta.value = f.text; info(); setMsg(E.fMsg, tx("Testo caricato. Controllalo, correggilo se serve e crea le domande."), "ok"); }
    else { S.file = f; E.read.hidden = !aiOn(); setMsg(E.fMsg, aiOn() ? tx("Il file non contiene testo selezionabile (scansione o foto). Premi “Leggi il testo dal file”.") : tx("Il file non contiene testo selezionabile e la lettura richiede il servizio AI, non collegato: incolla il testo a mano."), aiOn() ? "" : "warn"); }
  } catch (e) { E.input.value = ""; setMsg(E.fMsg, e.message || tx("Non riesco a leggere il file."), "bad"); }
}
async function readFromFile() {
  const E = S.els, f = S.file; if (!f) return; E.read.disabled = true; setMsg(E.fMsg, tx("Sto leggendo il file…"));
  try {
    const r = await callAI({ task: "transcribe", lang: curLang(), level: S.level, media_type: f.kind === "pdf" ? "application/pdf" : "image/jpeg", data: f.b64 });
    const t = str(r && r.transcription).trim(); if (!t) throw new Error(tx("Non sono riuscito a leggere del testo nel file."));
    E.ta.value = t; info(); setMsg(E.fMsg, tx("Testo letto: controllalo e correggilo, poi crea le domande."), "ok");
  } catch (e) { setMsg(E.fMsg, e.message, "bad"); } finally { E.read.disabled = false; }
}
async function generate() {
  const E = S.els, cut = cutText(E.ta.value.trim()), text = cut.text;
  if (han(text).length < 15) return setMsg(E.gMsg, tx("Il testo è troppo corto per creare domande (servono almeno 15 caratteri cinesi)."), "warn");
  const types = E.types.filter(c => c.checked).map(c => c.dataset.t); if (!types.length) return setMsg(E.gMsg, tx("Scegli almeno un tipo di domanda."), "warn");
  const n = +E.n.value; E.go.disabled = true; setMsg(E.gMsg, aiOn() ? tx("Creo le domande… (può richiedere alcuni secondi)") : tx("Creo le domande…"));
  try {
    let items = [], note = "";
    if (aiOn()) {
      try {
        const r = await callAI({ task: "read_gen", lang: curLang(), level: S.level, text, n, types }), v = vetQuestions(r && r.questions, text);
        items = v.items.filter(q => types.includes(q.type)).slice(0, n); if (v.dropped) note = tx("Ho scartato {n} domande che non erano verificabili sul testo.", { n: v.dropped });
      } catch (e) { note = e.message + " " + tx("Uso le domande automatiche semplici."); }
    }
    if (!items.length) { const lex = await getLex(); items = localCloze(text, lex, n); if (items.length && !note) note = tx("Domande automatiche semplici (completa la frase), senza AI."); }
    if (!items.length) return setMsg(E.gMsg, note || tx("Non sono riuscito a creare domande da questo testo: prova con un testo più lungo."), "warn");
    if (cut.cut) note = (note ? note + " " : "") + tx("Testo lungo: uso i primi {n} caratteri.", { n: READ_MAX });
    S.note = note; S.text = E.ta.value;
    openEx({ id: "", level: S.level, type: "mixed", passage: text, items }, "file");
  } finally { E.go.disabled = false; }
}

/* --- cronologia (solo punteggi) */
function renderHist() {
  const box = S.els.hist; if (!box) return; box.replaceChildren(); const H = lsGet(LOG, []).slice().reverse();
  if (!H.length) return put(box, h("p", { class: "hint" }, tx("Nessun esercizio svolto finora.")));
  const avg = Math.round(100 * H.reduce((a, x) => a + x.score / x.total, 0) / H.length);
  put(box, h("p", { class: "hint" }, tx("{n} esercizi svolti · media {p}%", { n: H.length, p: avg })),
    h("div", { class: "wr-nb" }, H.slice(0, 15).map(x => h("div", { class: "wr-row" }, h("span", null, new Date(x.t).toLocaleDateString(curLang() === "it" ? "it-IT" : curLang() === "es" ? "es-ES" : "en-GB", { day: "2-digit", month: "short" }) + " · " + x.level.replace("hsk", "HSK ") + " · " + tx(TYPE_LABEL[x.type] || TYPE_LABEL.mixed)),
      h("span", { class: "tag" }, x.score + "/" + x.total)))),
    h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => { if (confirm(tx("Cancellare tutta la cronologia della lettura?"))) { lsSet(LOG, []); renderHist(); if (S.mode === "sets" && !S.ex) viewSets(); } } }, tx("Cancella cronologia"))));
}

/* ------------------------------------------------------------------ API pubblica */
async function show() {
  const l = S.ctx.getLevel();
  if (!LV.includes(l)) { stopTimer(); S.level = l; S.els = {}; S.root.replaceChildren(h("h2", null, tx("Lettura")), h("p", { class: "wr-msg" }, tx("La lettura non è ancora disponibile per questo livello: per ora sono pronti HSK 1, 2 e 3."))); return; }
  await loadData();
  if (S.level !== l || !S.els.body) { S.level = l; S.ex = null; init(); }
}
window.Reading = { mount(root, ctx) { S.root = root; S.ctx = ctx; }, show, hide: stopTimer, refresh() { const t = S.els.ta ? S.els.ta.value : S.text; S.text = t; S.els = {}; return show().then(() => { if (S.els.ta && t) { S.els.ta.value = t; info(); } }); }, _t: { prepare, mark, vetQuestions, localCloze, cutText, norm } };
})();
