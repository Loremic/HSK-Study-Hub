/* Sezione Parlato (simulazione di esame orale).  window.Speaking
 *
 * Flusso: traccia -> registrazione (MediaRecorder) -> trascrizione (riconoscimento del browser / servizio opzionale / digitata)
 *         -> trascrizione modificabile -> valutazione: controlli locali + (facoltativa) valutazione AI SUL TESTO trascritto.
 *
 * LIMITI ONESTI (mostrati anche all'utente):
 *  - L'AI riceve la TRASCRIZIONE, non l'audio. Toni e fonetica non vengono "ascoltati": la pronuncia è una stima indiretta
 *    (confronto con il testo atteso nelle prove di ripetizione/lettura, confidenza del riconoscimento, ipotesi dell'AI).
 *  - Le registrazioni restano nel browser: non vengono salvate né inviate, salvo il servizio di trascrizione opzionale.
 */
(function () {
"use strict";
const W = window.Writing && window.Writing._t;
if (!W) { console.warn("Speaking: writing.js non caricato"); return; }
const CFG = Object.assign({ AI_ENDPOINT: "", AI_TIMEOUT_MS: 70000, SPEAKING_URL: "../data/speaking.json", STT: true }, window.HSK_CONFIG || {});
const tx = (k, v) => window.I18n ? I18n.t(k, v) : k.replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const curLang = () => window.I18n ? I18n.lang : "it";
const LV_ORDER = ["hsk1", "hsk2", "hsk3"];
const HANRE = /\p{Script=Han}/gu;
const arr = a => Array.isArray(a) ? a : [];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = x => { x = Number(x); return isFinite(x) ? clamp(Math.round(x), 0, 100) : null; };
const str = x => typeof x === "string" ? x : "";
const han = t => (String(t).match(HANRE) || []);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const LOG = "hsk.speaking.log", LOG_MAX = 100;
function pf(p, f) { const l = curLang(); return p[f + "_" + l] || (l === "it" ? p[f + "_it"] : tx(p[f + "_it"] || "")) || ""; }
const pList = p => { const l = curLang(), a = p["points_" + l]; return Array.isArray(a) && a.length ? a : (Array.isArray(p.points) ? p.points.map(x => tx(x)) : []); };

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
const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* ------------------------------------------------------------------ analisi locale (pura, testabile) */
// Sillabe attese dalla trascrizione pinyin di riferimento, allineate ai caratteri (null se il conteggio non torna).
function refSyllables(ref_zh, ref_py) {
  const hs = han(ref_zh), syl = [];
  for (const tok of (String(ref_py || "").match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*[0-5]?/gu) || [])) {
    const r = W.parsePinyinToken(tok); if (!r.ok) return null;
    for (const s of r.syls) syl.push(W.applyTone(s.base, s.tone));
  }
  return syl.length === hs.length ? syl : null;
}
// Allineamento LCS tra caratteri attesi e pronunciati. Restituisce i caratteri attesi mancanti/sbagliati e quelli in più.
function alignChars(ref, said) {
  const a = han(ref), b = han(said), n = a.length, m = b.length;
  const D = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i][j] = a[i] === b[j] ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  const hit = new Array(n).fill(false), extra = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (D[i + 1][j] >= D[i][j + 1]) i++; else { extra.push(b[j]); j++; } }
  while (j < m) extra.push(b[j++]);
  return { ref: a, hit, extra, acc: n ? Math.round(100 * D[0][0] / n) : null };
}
const FILLERS = ["嗯", "啊", "呃", "那个", "就是"];
function fillerCount(t) { return FILLERS.reduce((n, w) => n + (t.split(w).length - 1), 0); }
function rate(chars, sec) { return sec >= 3 ? Math.round(chars * 60 / sec) : null; }          // caratteri al minuto
function wordTypes(t) {
  const out = [];
  try { for (const s of new Intl.Segmenter("zh", { granularity: "word" }).segment(t)) if (s.isWordLike && /\p{Script=Han}/u.test(s.segment)) out.push(s.segment); } catch (e) { return han(t); }
  return out;
}
function localOpen(text, p, L, lex, dur, conf) {
  const n = han(text).length, toks = wordTypes(text), uniq = new Set(toks).size;
  const vc = lex ? W.vocab(text, lex) : null;
  const lenS = W.lengthScore(n, { min: L[0], lo: L[1], hi: L[2] });
  const rich = Math.min(100, Math.round(100 * uniq / Math.max(6, L[1] / 2)));
  const vEst = vc && vc.pct != null ? Math.round(.6 * rich + .4 * vc.pct) : rich;
  const kw = p && (arr(p.required).length || arr(p.keywords).length) ? W.kwCoverage(text, p) : null;
  const r = rate(n, dur);
  return { n, lenS, uniq, vc, vEst, kw, rate: r, fillers: fillerCount(text), pronEst: conf != null ? clamp(Math.round((conf - .5) / .45 * 100), 0, 100) : null };
}
const WEIGHTS = { argumentation: .30, vocabulary: .25, grammar: .30, pronunciation: .15 };
function combine(parts, free) {
  let s = 0, sw = 0, partial = false;
  for (const k in WEIGHTS) { if (free && k === "argumentation") continue; if (parts[k] == null) { partial = true; continue; } s += WEIGHTS[k] * parts[k]; sw += WEIGHTS[k]; }
  return { score: sw ? Math.round(s / sw) : null, partial };
}
function cleanSpeak(r) {
  r = r || {}; const a = r.argumentation || {}, v = r.vocabulary || {}, g = r.grammar || {}, p = r.pronunciation || {};
  return {
    arg: { score: num(a.score), comment: str(a.comment), covered: arr(a.covered_points).map(str), missing: arr(a.missing_points).map(str) },
    voc: { score: num(v.score), comment: str(v.comment), upgrades: arr(v.upgrades).map(u => ({ used: str(u.used), better: str(u.better), why: str(u.why) })) },
    gram: { score: num(g.score), comment: str(g.comment), errors: arr(g.errors).map(e => ({ excerpt: str(e.excerpt), correction: str(e.correction), category: str(e.category), explanation: str(e.explanation) })) },
    pron: { comment: str(p.comment), suspects: arr(p.suspects).map(s => ({ heard: str(s.heard), likely: str(s.likely_intended), pinyin: str(s.pinyin), issue: str(s.issue), why: str(s.why) })) },
    corrected: str(r.corrected_text), strengths: arr(r.strengths).map(str), next: arr(r.next_steps).map(str)
  };
}

/* ------------------------------------------------------------------ stato */
const S = { root: null, ctx: null, level: null, els: {}, mode: "random", ttype: "all", prompt: null, data: null, dataOk: true, lex: {}, sel: new Set(),
  rec: null, blob: null, url: null, dur: 0, source: "typed", conf: [], busy: false };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
function pickMime() { for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} } return ""; }
const aiOn = () => !!CFG.AI_ENDPOINT;

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
function blobB64(b) { return new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1] || ""); f.onerror = () => rej(f.error); f.readAsDataURL(b); }); }

async function loadData() {
  if (S.data) return;
  try { const r = await fetch(CFG.SPEAKING_URL, { cache: "no-cache" }); if (!r.ok) throw 0; const j = await r.json(); S.data = j; S.dataOk = true; }
  catch (e) { S.data = { levels: {}, prompts: [] }; S.dataOk = false; }
}
const limitsFor = p => {
  const lv = (S.data.levels || {})[S.level] || {}, t = p && p.task_type;
  if (t === "answer" || t === "describe") { const a = lv[t] || [10, 20, 40]; return [p.min_chars || a[0], p.target_min || a[1], p.max_chars || a[2]]; }
  const a = lv.describe || [15, 25, 60]; return [a[0], a[1], a[2] * 2];
};
const maxSec = p => (p && p.max_sec) || (((S.data.levels || {})[S.level] || {}).max_sec || {}).describe || 90;
const TYPE_LABEL = { repeat: "Ascolta e ripeti", read: "Leggi ad alta voce", answer: "Rispondi alle domande", describe: "Descrivi un argomento" };
const pool = () => (S.data.prompts || []).filter(p => p.level === S.level && (S.ttype === "all" || p.task_type === S.ttype));
const pick = a => a[Math.floor(Math.random() * a.length)];

async function getLex() {
  const ids = LV_ORDER.slice(0, LV_ORDER.indexOf(S.level) + 1), key = ids.join();
  if (!S.lex[key]) { const lists = []; for (const id of ids) { try { lists.push(await S.ctx.loadCards(id)); } catch (e) {} } S.lex[key] = W.buildLex(lists); }
  return S.lex[key];
}

/* ------------------------------------------------------------------ registratore */
function stopMedia() {
  const r = S.rec; if (!r) return;
  clearInterval(r.timer); cancelAnimationFrame(r.raf);
  try { r.recog && r.recog.stop(); } catch (e) {}
  try { r.stream && r.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { if (r.ac && r.ac.state !== "closed") r.ac.close(); } catch (e) {} r.ac = null;
}
function resetRecording() {
  stopMedia(); S.rec = null; if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) {} } S.url = null; S.blob = null; S.dur = 0; S.conf = []; S.source = "typed";
}
function micError(e) {
  const n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError") return tx("Permesso al microfono negato. Consentilo dalle impostazioni del browser per questo sito e riprova.");
  if (n === "NotFoundError" || n === "OverconstrainedError") return tx("Nessun microfono trovato.");
  if (n === "NotReadableError") return tx("Il microfono è in uso da un’altra applicazione.");
  return tx("Impossibile avviare la registrazione.");
}
async function startRec() {
  const E = S.els; setMsg(E.recMsg, "");
  if (!window.isSecureContext) return setMsg(E.recMsg, tx("La registrazione richiede una connessione sicura (https o localhost)."), "bad");
  if (!canRecord()) return setMsg(E.recMsg, tx("Questo browser non supporta la registrazione audio. Puoi scrivere qui sotto ciò che hai detto."), "warn");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { return setMsg(E.recMsg, micError(e), "bad"); }
  if (window.AudioKit) AudioKit.stop();
  resetRecording();
  const mime = pickMime(), chunks = [];
  let mr; try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { stream.getTracks().forEach(t => t.stop()); return setMsg(E.recMsg, tx("Impossibile avviare la registrazione."), "bad"); }
  const r = S.rec = { stream, mr, t0: Date.now(), max: maxSec(S.prompt), finals: [], interim: "", on: true };
  mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  mr.onstop = () => {
    r.on = false; S.dur = (Date.now() - r.t0) / 1000;
    S.blob = new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" });
    try { S.url = URL.createObjectURL(S.blob); } catch (e) {}
    const heard = r.finals.join("").trim();
    if (heard) { S.source = "browser"; E.ta.value = heard; }
    renderRecState(); onText();
  };
  // misuratore di livello
  try {
    const AC = window.AudioContext || window.webkitAudioContext; r.ac = new AC();
    const an = r.ac.createAnalyser(); an.fftSize = 512; r.ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); E.meter.firstChild.style.width = Math.min(100, m / 90 * 100) + "%"; r.raf = requestAnimationFrame(tick); };
    tick();
  } catch (e) {}
  // riconoscimento del browser (facoltativo, in parallelo)
  if (SR && E.useSR.checked) {
    try {
      const rc = r.recog = new SR(); rc.lang = "zh-CN"; rc.continuous = true; rc.interimResults = true; rc.maxAlternatives = 1;
      rc.onresult = ev => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i], alt = res[0];
          if (res.isFinal) { r.finals.push(alt.transcript); if (typeof alt.confidence === "number" && alt.confidence > 0) S.conf.push(alt.confidence); } else interim += alt.transcript;
        }
        E.live.textContent = r.finals.join("") + interim;
      };
      rc.onend = () => { if (r.on) { try { rc.start(); } catch (e) {} } };
      rc.onerror = ev => { if (ev && (ev.error === "not-allowed" || ev.error === "service-not-allowed")) { r.on && setMsg(E.recMsg, tx("Il riconoscimento vocale del browser non è disponibile: potrai trascrivere a mano o con il servizio."), "warn"); r.recog = null; } };
      rc.start();
    } catch (e) { r.recog = null; }
  }
  r.timer = setInterval(() => {
    const el = (Date.now() - r.t0) / 1000; E.time.textContent = fmt(el) + " / " + fmt(r.max);
    if (el >= r.max) stopRec();
  }, 200);
  mr.start(); renderRecState();
}
function stopRec() { const r = S.rec; if (!r || !r.on) return; try { r.recog && (r.recog.onend = null); } catch (e) {} stopMedia(); try { r.mr.state !== "inactive" && r.mr.stop(); } catch (e) {} }

/* ------------------------------------------------------------------ interfaccia */
function init() {
  const E = S.els = {}; S.root.replaceChildren(); resetRecording(); S.prompt = null;
  put(S.root, h("h2", null, tx("Esame orale")), h("p", { class: "hint" }, tx("Simulazione di parlato: ascolta o leggi la traccia, registrati, controlla la trascrizione e ricevi una valutazione.")));
  const modes = [["random", tx("Casuale")], ["archive", tx("Dall’archivio")], ["free", tx("Libera")]];
  E.modeSeg = h("div", { class: "seg", role: "group", "aria-label": tx("Tipo di traccia") }, modes.map(([k, l]) => h("button", { type: "button", "data-m": k, onclick: () => setMode(k) }, l)));
  E.type = h("select", { "aria-label": tx("Tipo di prova"), onchange: ev => { S.ttype = ev.target.value; if (S.mode === "random") { S.prompt = genPrompt(); renderPrompt(); } } },
    h("option", { value: "all" }, tx("Tutti i tipi")), Object.keys(TYPE_LABEL).map(k => h("option", { value: k }, tx(TYPE_LABEL[k]))));
  E.type.value = S.ttype;
  E.promptBox = h("div", { class: "wr-prompt" });
  put(S.root, h("div", { class: "wr-card" }, h("div", { class: "acts wr-left" }, E.modeSeg, E.type), E.promptBox));

  // registratore
  E.recMsg = h("p", { class: "wr-msg", hidden: true, role: "status" });
  E.meter = h("div", { class: "sp-meter", "aria-hidden": "true" }, h("i"));
  E.time = h("span", { class: "sp-time", "aria-live": "off" }, "0:00");
  E.live = h("p", { class: "sp-live zh", lang: "zh-Hans", "aria-live": "polite" });
  E.useSR = h("input", { type: "checkbox", id: "spUseSR" }); E.useSR.checked = !!SR;
  E.recBtn = h("button", { type: "button", class: "btn sp-rec", onclick: () => (S.rec && S.rec.on ? stopRec() : startRec()) });
  E.audio = h("audio", { controls: true, hidden: true, class: "sp-audio" });
  E.again = h("button", { type: "button", class: "btn", hidden: true, onclick: () => { resetRecording(); E.ta.value = ""; E.live.textContent = ""; renderRecState(); onText(); } }, tx("Registra di nuovo"));
  E.sttBtn = h("button", { type: "button", class: "btn", hidden: true, onclick: serverStt }, tx("Trascrivi con il servizio"));
  E.file = h("input", { type: "file", accept: FileKit.AUDIO_ACCEPT, "aria-label": tx("Carica un file audio"), onchange: ev => onAudioFile(ev.target.files[0]) });
  put(S.root, h("div", { class: "wr-card" }, h("h3", null, tx("1 · Registrazione")),
    h("div", { class: "acts wr-left" }, E.recBtn, E.time, E.again), E.meter, E.live, E.audio, E.recMsg,
    h("label", { class: "wr-lab" }, tx("Oppure carica un file audio (MP3, M4A, OGG, FLAC, WAV, WebM)")), E.file,
    SR ? h("label", { class: "hint sp-chk" }, E.useSR, " " + tx("Trascrivi mentre parli (riconoscimento del browser)")) : h("p", { class: "hint" }, tx("Questo browser non ha il riconoscimento vocale: dopo la registrazione scrivi ciò che hai detto o usa il servizio di trascrizione, se attivo.")),
    h("p", { class: "hint" }, tx("La registrazione resta sul tuo dispositivo e non viene salvata. Con il riconoscimento del browser l’audio può essere elaborato dal fornitore del browser (es. Google per Chrome)."))));

  // trascrizione
  E.ta = h("textarea", { class: "wr-ta", rows: "5", lang: "zh-Hans", spellcheck: "false", placeholder: tx("Qui compare la trascrizione. Correggila se il riconoscimento ha sbagliato, oppure scrivi tu ciò che hai detto."), oninput: () => { if (S.source !== "typed" && !S.edited) { /* resta la fonte originale finché non si riscrive tutto */ } S.edited = true; onText(); } });
  E.count = h("p", { class: "wr-count" });
  E.evalBtn = h("button", { type: "button", class: "btn big", onclick: evaluate }, tx("Valuta il parlato"));
  E.msg = h("p", { class: "wr-msg", hidden: true, role: "status" });
  E.res = h("div", { "aria-live": "polite" });
  put(S.root, h("div", { class: "wr-card" }, h("h3", null, tx("2 · Trascrizione")), E.ta, E.count,
    h("div", { class: "acts wr-left" }, E.sttBtn, E.evalBtn), E.msg,
    h("p", { class: "hint" }, tx("La valutazione si basa sul testo trascritto, non sul suono: gli errori che il riconoscimento “corregge da solo” possono sfuggire."))), E.res);
  put(S.root, h("h3", { class: "wr-h3" }, tx("Cronologia del parlato")), (E.hist = h("div", { class: "wr-hist" })));
  setMode("random", true); renderRecState(); onText(); renderHist();
}

function genPrompt() { const p = pool(); return p.length ? pick(p) : null; }
function setMode(m, first) {
  S.mode = m; if (!first) { resetRecording(); S.els.ta.value = ""; S.els.live.textContent = ""; S.els.res.replaceChildren(); renderRecState(); }
  S.prompt = m === "random" ? genPrompt() : null; renderPrompt(); onText();
}
function renderPrompt() {
  const E = S.els, box = E.promptBox; box.replaceChildren();
  E.modeSeg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === S.mode)));
  E.type.hidden = S.mode === "free";
  if (S.mode === "free") { S.prompt = null; put(box, h("p", null, tx("Parlato libero: scegli tu l’argomento. Vengono valutati lessico, grammatica e pronuncia (non l’attinenza, perché non c’è una traccia)."))); return; }
  if (S.mode === "archive") {
    const list = pool();
    if (!list.length) { put(box, h("p", { class: "wr-msg" }, S.dataOk ? tx("Non ci sono ancora tracce di questo tipo per {l}.", { l: LV_LABEL() }) : tx("Non riesco a caricare le tracce di parlato."))); return; }
    const sel = h("select", { "aria-label": tx("Scegli una traccia"), onchange: ev => { S.prompt = list.find(p => p.id === ev.target.value) || null; S.els.res.replaceChildren(); showPrompt(); } },
      h("option", { value: "" }, tx("— scegli una traccia —")), list.map(p => h("option", { value: p.id }, tx(TYPE_LABEL[p.task_type] || p.task_type) + " · " + (p.prompt_zh || "").slice(0, 18))));
    put(box, h("div", { class: "acts wr-left" }, sel), h("div", { class: "wr-pbody" })); showPrompt(); return;
  }
  put(box, h("div", { class: "wr-pbody" }), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => { resetRecording(); E.ta.value = ""; E.live.textContent = ""; E.res.replaceChildren(); S.prompt = genPrompt(); renderRecState(); showPrompt(); onText(); } }, tx("Nuova traccia"))));
  showPrompt();
}
const LV_LABEL = () => (((S.data.levels || {})[S.level]) || {}).label || S.level;
function showPrompt() {
  const body = S.els.promptBox.querySelector(".wr-pbody"); if (!body) return; body.replaceChildren();
  const p = S.prompt;
  if (!p) { if (S.mode !== "archive") put(body, h("p", { class: "hint" }, tx("Non ci sono ancora tracce di questo tipo per {l}.", { l: LV_LABEL() }))); else put(body, h("p", { class: "hint" }, tx("Scegli una traccia per iniziare."))); return; }
  const hide = h("input", { type: "checkbox" });
  const zh = h("p", { class: "zh lg sp-zh", lang: "zh-Hans" }, p.prompt_zh);
  hide.onchange = () => { zh.hidden = hide.checked; };
  const listen = h("button", { type: "button", class: "btn", onclick: () => window.AudioKit ? AudioKit.play("prompts/" + p.id, p.prompt_zh, S.ctx.speak) : S.ctx.speak(p.prompt_zh) }, "🔊 " + tx("Ascolta la traccia"));
  put(body, h("div", { class: "wr-title" }, tx(TYPE_LABEL[p.task_type] || pf(p, "title")), h("span", { class: "tag" }, tx("max {s} s", { s: maxSec(p) }))),
    pf(p, "instruction") ? h("p", null, pf(p, "instruction")) : null, zh,
    h("div", { class: "acts wr-left" }, listen, (p.task_type === "repeat") ? h("label", { class: "hint sp-chk" }, hide, " " + tx("Nascondi il testo (solo ascolto)")) : null),
    p.ref_py && p.task_type !== "answer" && p.task_type !== "describe" ? h("details", { class: "hint" }, h("summary", null, tx("Mostra il pinyin")), h("p", null, p.ref_py)) : null,
    pList(p).length ? h("ul", { class: "wr-pts" }, pList(p).map(x => h("li", null, x))) : null,
    arr(p.required).length ? h("p", null, h("b", null, tx("Da usare: ")), arr(p.required).map(w => h("span", { class: "chip zh" }, w))) : null);
  if (p.task_type === "repeat" || p.task_type === "read") { /* nessun limite di lunghezza: si misura l'accuratezza */ }
}
function renderRecState() {
  const E = S.els; if (!E.recBtn) return; const on = !!(S.rec && S.rec.on);
  E.recBtn.textContent = on ? "⏹ " + tx("Ferma") : "⏺ " + tx(S.blob ? "Registra ancora" : "Registra");
  E.recBtn.classList.toggle("on", on);
  if (!on) { E.meter.firstChild.style.width = "0"; E.time.textContent = S.blob ? fmt(S.dur) : "0:00"; }
  E.audio.hidden = !S.url; if (S.url) E.audio.src = S.url; else E.audio.removeAttribute("src");
  E.again.hidden = !S.blob; E.sttBtn.hidden = !(S.blob && aiOn() && CFG.STT !== false);
  if (on) E.recMsg.hidden = true;
}
function onText() {
  const E = S.els; if (!E.ta) return;
  const t = E.ta.value, n = han(t).length;
  const need = S.prompt && (S.prompt.task_type === "repeat" || S.prompt.task_type === "read") ? null : limitsFor(S.prompt || { task_type: "describe" });
  E.count.className = "wr-count" + (need && n && n < need[0] ? " low" : "");
  E.count.textContent = n ? tx("{n} caratteri cinesi", { n }) + (need ? " · " + tx("minimo {min}, consigliati {lo}–{hi}", { min: need[0], lo: need[1], hi: need[2] }) : "") : tx("Nessuna trascrizione");
  E.evalBtn.disabled = !t.trim();
}
async function onAudioFile(file) {
  const E = S.els; if (!file) return; if (S.rec && S.rec.on) stopRec();
  setMsg(E.recMsg, tx("Sto preparando l’audio…"));
  try {
    const a = await FileKit.prepareAudio(file, { maxMB: CFG.MAX_AUDIO_MB || 25, maxSec: 120 });
    resetRecording(); S.blob = a.blob; S.dur = a.duration; S.source = "typed"; S.edited = false; E.ta.value = "";
    try { S.url = URL.createObjectURL(file); } catch (e) {}
    renderRecState(); onText();
    let m = tx("File caricato ({d}).", { d: fmt(a.duration) });
    if (a.truncated) m += " " + tx("L’audio dura {d}: analizzo solo i primi 2 minuti.", { d: fmt(a.fullDuration) });
    if (aiOn() && CFG.STT !== false) { setMsg(E.recMsg, m, "ok"); await serverStt(); }
    else setMsg(E.recMsg, m + " " + tx("La trascrizione automatica non è disponibile (servizio AI non collegato): scrivi tu nel riquadro ciò che dici nell’audio."), "warn");
  } catch (e) { E.file.value = ""; setMsg(E.recMsg, e.message || tx("Non riesco a leggere il file audio."), "bad"); }
}
async function serverStt() {
  const E = S.els; if (!S.blob) return;
  setMsg(E.msg, tx("Trascrizione in corso…"));
  try {
    if (S.blob.size > 4.5 * 1048576) throw new Error(tx("Registrazione troppo lunga per il servizio di trascrizione."));
    const r = await callAI({ task: "stt", lang: curLang(), level: S.level, media_type: S.blob.type.split(";")[0], data: await blobB64(S.blob) });
    const t = str(r && r.text).trim(); if (!t) throw new Error(tx("Nessun testo riconosciuto."));
    E.ta.value = t; S.source = "whisper"; S.conf = []; onText(); setMsg(E.msg, tx("Trascrizione pronta: controllala e premi “Valuta il parlato”."), "ok");
  } catch (e) { setMsg(E.msg, e.message, "bad"); }
}

/* ------------------------------------------------------------------ valutazione */
function bar(label, val, note, est) {
  return h("div", { class: "wr-sc" }, h("div", { class: "wr-sc-h" }, h("b", null, label), h("span", { class: "wr-sc-v" }, val == null ? "—" : val + "/100", est && val != null ? h("span", { class: "tag" }, tx("stima")) : null)),
    h("div", { class: "bar" }, h("i", { style: `width:${val || 0}%` })), note ? h("div", { class: "hint" }, note) : null);
}
function gradeOf(s) { return s == null ? "" : s >= 90 ? tx("Ottimo") : s >= 75 ? tx("Buono") : s >= 60 ? tx("Sufficiente") : tx("Da migliorare"); }
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

async function evaluate() {
  const E = S.els, text = E.ta.value.trim(); if (!text || S.busy) return;
  if (S.rec && S.rec.on) stopRec();
  S.busy = true; E.evalBtn.disabled = true; setMsg(E.msg, tx("Analisi in corso…")); E.res.replaceChildren();
  const p = S.prompt, kind = p ? p.task_type : "free", conf = S.conf.length ? avg(S.conf) : null, dur = S.dur || 0;
  try {
    const lex = await getLex();
    if (kind === "repeat" || kind === "read") { const R = { kind, text, p, dur, conf, al: alignChars(p.ref_zh || p.prompt_zh, text), syl: refSyllables(p.ref_zh || p.prompt_zh, p.ref_py) }; renderRepeat(R); saveLog(R, R.al.acc, false); }
    else {
      const L = limitsFor(p || { task_type: "describe" }), loc = localOpen(text, p, L, lex, dur, conf), R = { kind, text, p, dur, conf, L, loc, ai: null, aiErr: "" };
      renderOpen(R);
      if (aiOn()) {
        setMsg(E.msg, tx("Valutazione AI in corso… (può richiedere alcuni secondi)"));
        try {
          R.ai = cleanSpeak(await callAI({ task: "speak_eval", lang: curLang(), level: S.level, text, duration_s: Math.round(dur), source: S.source,
            prompt: p ? { title_zh: p.prompt_zh, title_it: p.title_it, instruction_it: p.instruction_it, instruction_zh: p.prompt_zh, points: p.points, required: p.required, keywords: p.keywords } : null }));
        } catch (e) { R.aiErr = e.message; }
        renderOpen(R);
      }
      const c = openParts(R); saveLog(R, c.score, c.partial);
    }
    setMsg(E.msg, "");
    const o = E.res.querySelector(".wr-out"); if (o) o.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { setMsg(E.msg, e.message || tx("Errore durante l’analisi."), "bad"); }
  finally { S.busy = false; E.evalBtn.disabled = !E.ta.value.trim(); }
}
function openParts(R) {
  const ai = R.ai, l = R.loc, free = !R.p;
  const parts = { argumentation: free ? null : (ai ? ai.arg.score : null), vocabulary: ai && ai.voc.score != null ? ai.voc.score : l.vEst, grammar: ai ? ai.gram.score : null, pronunciation: l.pronEst };
  return combine(parts, free);
}

function caveats(R) {
  return h("div", { class: "wr-msg warn" }, tx("Come leggere la valutazione della pronuncia: si basa sul testo riconosciuto, non sull’ascolto dei toni. Se il riconoscimento ha capito la parola, di solito è comprensibile; se l’ha cambiata, può esserci un errore di tono o di sillaba. Per un giudizio vero serve un insegnante o un servizio specializzato."));
}
function renderRepeat(R) {
  const E = S.els, a = R.al, root = h("div", { class: "wr-out" }), score = a.acc;
  put(root, h("h3", { tabindex: "-1" }, tx("Valutazione")),
    h("div", { class: "wr-total" }, h("div", { class: "wr-num" }, score == null ? "—" : score), h("div", null, h("b", null, gradeOf(score)), h("div", { class: "hint" }, tx("Accuratezza rispetto al testo: nessuna chiamata AI, calcolata sul tuo dispositivo.")))));
  put(root, h("div", { class: "wr-scs" }, bar(tx("Accuratezza (caratteri corretti)"), score, tx("{k} su {n} caratteri riconosciuti", { k: a.hit.filter(Boolean).length, n: a.ref.length })),
    R.conf != null ? bar(tx("Chiarezza percepita dal riconoscimento"), clamp(Math.round((R.conf - .5) / .45 * 100), 0, 100), tx("Confidenza media del riconoscimento: {c}%. Indicativa: dipende anche dal microfono e dal rumore.", { c: Math.round(R.conf * 100) }), true) : null));
  put(root, h("h4", null, tx("Confronto con il testo")), h("p", { class: "zh lg", lang: "zh-Hans" }, a.ref.map((c, i) => h("span", { class: a.hit[i] ? "sp-ok" : "sp-miss", title: !a.hit[i] && R.syl ? R.syl[i] : null }, c))));
  const miss = a.ref.map((c, i) => ({ c, i })).filter(x => !a.hit[x.i]);
  if (miss.length) put(root, h("h4", null, tx("Da riascoltare e ripetere")), h("ul", { class: "wr-list" }, miss.slice(0, 12).map(x => h("li", null, h("span", { class: "zh lg" }, x.c), R.syl ? " · " + R.syl[x.i] : ""))),
    h("p", { class: "hint" }, tx("Questi caratteri non sono stati riconosciuti: può essere un errore di tono o di sillaba, oppure un problema del riconoscimento. Riascolta la traccia e riprova.")));
  else put(root, h("p", { class: "wr-msg ok" }, tx("Tutti i caratteri sono stati riconosciuti.")));
  if (a.extra.length) put(root, h("p", { class: "hint" }, tx("Caratteri in più o diversi rispetto al testo: "), a.extra.slice(0, 15).join(" ")));
  if (R.dur && R.dur > 0) put(root, h("p", { class: "hint" }, tx("Durata: {s} s", { s: Math.round(R.dur) })));
  put(root, caveats(R));
  S.els.res.replaceChildren(root);
}
function renderOpen(R) {
  const E = S.els, l = R.loc, ai = R.ai, c = openParts(R), root = h("div", { class: "wr-out" }), free = !R.p;
  put(root, h("h3", { tabindex: "-1" }, tx("Valutazione")),
    h("div", { class: "wr-total" }, h("div", { class: "wr-num" }, c.score == null ? "—" : c.score), h("div", null, h("b", null, gradeOf(c.score)), h("div", { class: "hint" },
      R.aiErr ? tx("Valutazione AI non disponibile: voto parziale, calcolato solo con i controlli automatici.") :
      !aiOn() ? tx("Voto parziale: senza servizio AI mancano argomentazione e grammatica.") :
      !ai ? tx("Valutazione AI in corso…") : c.partial ? tx("Voto parziale (manca qualche componente).") : tx("Voto complessivo su 100.")))));
  if (R.aiErr) put(root, h("p", { class: "wr-msg bad" }, R.aiErr));
  const aiWait = aiOn() && !R.aiErr ? tx("In attesa dell’AI…") : tx("Non valutabile senza il servizio AI.");
  put(root, h("div", { class: "wr-scs" },
    free ? null : bar(tx("Forza e coerenza delle argomentazioni"), ai ? ai.arg.score : null, ai ? ai.arg.comment : aiWait),
    bar(tx("Ricchezza e varietà del lessico"), ai && ai.voc.score != null ? ai.voc.score : l.vEst, ai ? ai.voc.comment : tx("Stima locale: parole diverse usate e quota di lessico del livello."), !(ai && ai.voc.score != null)),
    bar(tx("Grammatica e sintassi"), ai ? ai.gram.score : null, ai ? ai.gram.comment : aiWait),
    bar(tx("Pronuncia (indicativa)"), l.pronEst, ai && ai.pron.comment ? ai.pron.comment : (l.pronEst == null ? tx("Non valutabile: serve il riconoscimento vocale del browser durante la registrazione.") : tx("Stimata dalla confidenza del riconoscimento ({c}%).", { c: Math.round(R.conf * 100) })), true)));
  // dati di fluidità
  const info = [tx("{n} caratteri · richiesti {min}+, consigliati {lo}–{hi}", { n: l.n, min: R.L[0], lo: R.L[1], hi: R.L[2] }),
    l.rate != null ? tx("Velocità: {r} caratteri al minuto", { r: l.rate }) + (l.rate < 60 ? " · " + tx("molto lenta") : l.rate > 260 ? " · " + tx("molto veloce") : "") : null,
    l.fillers ? tx("Intercalari (嗯, 啊, 那个…): {n} — il riconoscimento ne omette spesso, il dato può essere sottostimato.", { n: l.fillers }) : null,
    l.vc && l.vc.pct != null ? tx("Lessico del livello: {p}% dei caratteri", { p: l.vc.pct }) : null].filter(Boolean);
  put(root, h("ul", { class: "wr-pts" }, info.map(x => h("li", null, x))));
  if (l.kw && (l.kw.req.hit.length + l.kw.req.miss.length + l.kw.kw.hit.length + l.kw.kw.miss.length)) put(root, h("h4", null, tx("Parole della traccia")),
    h("p", null, [...l.kw.req.hit, ...l.kw.kw.hit].map(w => h("span", { class: "chip okc zh" }, w)), [...l.kw.req.miss, ...l.kw.kw.miss].map(w => h("span", { class: "chip noc zh" }, w))));
  put(root, h("h4", null, tx("La tua trascrizione")), h("p", { class: "wr-text zh", lang: "zh-Hans" }, R.text));
  if (ai) {
    if (ai.arg.covered.length || ai.arg.missing.length) put(root, h("h4", null, tx("Contenuto")),
      ai.arg.covered.length ? h("ul", { class: "wr-list okl" }, ai.arg.covered.map(x => h("li", null, "✓ " + x))) : null,
      ai.arg.missing.length ? h("ul", { class: "wr-list" }, ai.arg.missing.map(x => h("li", { class: "nol" }, "✗ " + x))) : null);
    if (ai.gram.errors.length) put(root, h("h4", null, tx("Errori di grammatica")), h("ul", { class: "wr-list" }, ai.gram.errors.map(e => h("li", { class: "nol" },
      h("span", { class: "zh bad", lang: "zh-Hans" }, e.excerpt), " → ", h("span", { class: "zh ok", lang: "zh-Hans" }, e.correction), e.category ? h("span", { class: "tag" }, tx(e.category.replace(/_/g, " "))) : null, e.explanation ? h("div", { class: "hint" }, e.explanation) : null))));
    else put(root, h("p", { class: "wr-msg ok" }, tx("Nessun errore di grammatica rilevato nella trascrizione.")));
    if (ai.voc.upgrades.length) put(root, h("h4", null, tx("Per arricchire il lessico")), h("ul", { class: "wr-list" }, ai.voc.upgrades.map(u => h("li", null, h("span", { class: "zh", lang: "zh-Hans" }, u.used), " → ", h("span", { class: "zh ok", lang: "zh-Hans" }, u.better), u.why ? h("div", { class: "hint" }, u.why) : null))));
    if (ai.pron.suspects.length) put(root, h("h4", null, tx("Possibili problemi di pronuncia (ipotesi)")), h("ul", { class: "wr-list" }, ai.pron.suspects.map(s => h("li", null,
      h("span", { class: "zh", lang: "zh-Hans" }, s.heard), " → ", h("span", { class: "zh ok", lang: "zh-Hans" }, s.likely), s.pinyin ? " (" + s.pinyin + ")" : "", s.issue ? h("span", { class: "tag" }, s.issue) : null, s.why ? h("div", { class: "hint" }, s.why) : null))),
      h("p", { class: "hint" }, tx("Sono ipotesi ricavate dal testo: l’AI non ha ascoltato la tua voce.")));
    if (ai.corrected) put(root, h("h4", null, tx("Versione corretta")), h("p", { class: "wr-text zh", lang: "zh-Hans" }, ai.corrected));
    if (ai.strengths.length) put(root, h("h4", null, tx("Punti di forza")), h("ul", { class: "wr-pts" }, ai.strengths.map(x => h("li", null, x))));
    if (ai.next.length) put(root, h("h4", null, tx("Prossimi passi")), h("ul", { class: "wr-pts" }, ai.next.map(x => h("li", null, x))));
  }
  put(root, caveats(R));
  E.res.replaceChildren(root);
}

/* ------------------------------------------------------------------ cronologia (solo testo e voto: mai l'audio) */
function saveLog(R, score, partial) {
  const L = lsGet(LOG, []);
  L.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), level: S.level, kind: R.kind, title: R.p ? (R.p.title_it || R.p.id) : "", text: R.text.slice(0, 3000), score, partial: !!partial, dur: Math.round(R.dur || 0), src: S.source });
  lsSet(LOG, L.slice(-LOG_MAX)); renderHist();
}
function logDelete(ids) { const s = new Set(ids); lsSet(LOG, lsGet(LOG, []).filter(x => !s.has(x.id))); S.sel = new Set([...S.sel].filter(i => !s.has(i))); renderHist(); }
function renderHist() {
  const box = S.els.hist; if (!box) return; box.replaceChildren();
  const H = lsGet(LOG, []).slice().reverse();
  if (!H.length) { put(box, h("p", { class: "hint" }, tx("Nessuna prova registrata finora."))); return; }
  const all = h("input", { type: "checkbox" }); all.checked = H.every(x => S.sel.has(x.id));
  all.onchange = () => { S.sel = all.checked ? new Set(H.map(x => x.id)) : new Set(); renderHist(); };
  const n = S.sel.size, del = h("button", { type: "button", class: "btn", disabled: n ? null : true, onclick: () => { if (confirm(tx("Eliminare {n} prove selezionate?", { n }))) logDelete([...S.sel]); } }, n ? tx("Elimina selezionati ({n})", { n }) : tx("Elimina selezionati"));
  put(box, h("div", { class: "wr-bar" }, h("label", { class: "wr-selall" }, all, " " + tx("Seleziona tutti ({n})", { n: H.length })), del),
    h("div", { class: "wr-nb" }, H.map(x => {
      const cb = h("input", { type: "checkbox", "aria-label": tx("Seleziona: {t}", { t: x.title || x.kind }) }); cb.checked = S.sel.has(x.id);
      cb.onchange = () => { cb.checked ? S.sel.add(x.id) : S.sel.delete(x.id); renderHist(); };
      return h("div", { class: "wr-row" }, cb, h("details", { class: "wr-ent" }, h("summary", null, new Date(x.t).toLocaleDateString(curLang() === "it" ? "it-IT" : curLang() === "es" ? "es-ES" : "en-GB", { day: "2-digit", month: "short" }), " · ", x.level.replace("hsk", "HSK "), " · " + tx(TYPE_LABEL[x.kind] || "Parlato libero"),
        h("span", { class: "tag" }, x.score == null ? "—" : x.score + (x.partial ? "*" : ""))), h("p", { class: "wr-text zh", lang: "zh-Hans" }, x.text), h("div", { class: "acts wr-left" }, h("button", { type: "button", class: "btn", onclick: () => { if (confirm(tx("Eliminare questa prova?"))) logDelete([x.id]); } }, tx("Elimina")))));
    })), H.some(x => x.partial) ? h("p", { class: "hint" }, tx("* voto parziale (senza valutazione AI completa).")) : null);
}

/* ------------------------------------------------------------------ API pubblica */
async function show() {
  const l = S.ctx.getLevel();
  if (!LV_ORDER.includes(l)) { stopMedia(); S.level = l; S.els = {}; S.root.replaceChildren(h("h2", null, tx("Esame orale")), h("p", { class: "wr-msg" }, tx("Il parlato non è ancora disponibile per questo livello: per ora sono pronti HSK 1, 2 e 3."))); return; }
  await loadData();
  if (S.level !== l || !S.els.ta) { S.level = l; init(); }
}
window.Speaking = {
  mount(root, ctx) { S.root = root; S.ctx = ctx; },
  show,
  hide() { stopMedia(); if (S.rec && S.rec.on) { try { S.rec.mr.stop(); } catch (e) {} } if (window.AudioKit) AudioKit.stop(); },
  refresh() { const t = S.els && S.els.ta ? S.els.ta.value : ""; S.els = {}; return show().then(() => { if (S.els.ta && t) { S.els.ta.value = t; onText(); } }); },
  _t: { alignChars, refSyllables, localOpen, combine, cleanSpeak, fillerCount, rate }
};
})();
