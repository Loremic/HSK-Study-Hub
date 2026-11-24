/* Ascolto guidato: le frasi vengono lette ad alta voce una dopo l'altra (o in ciclo) con la sintesi vocale nativa del browser,
   con il testo (hanzi), il pinyin e la traduzione sullo schermo. Pensato per imparare "in movimento".
   Fonti: frasi d'esempio delle schede del livello (con traduzione) oppure testi di lettura (data/reading.json, senza traduzione).
   Limite onesto: la sintesi vocale del browser può fermarsi quando lo schermo si spegne; l'app prova a tenerlo acceso (Wake Lock). */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s, lang = () => (window.I18n && I18n.lang) || "it";
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const CFG = Object.assign({ READING_URL: "../data/reading.json" }, window.HSK_CONFIG || {});
const PK = "hsk.ui.listen";
let host = null, opts = null, ui = null, list = [], idx = 0, playing = false, token = 0, wake = null, voice = null, srcKey = "", readingCache = null;
let pref = { src: "ex", rate: 0.8, gap: 1.5, loop: true, shuffle: false, py: true, tr: true, twice: false };
try { Object.assign(pref, JSON.parse(localStorage.getItem(PK) || "{}")); } catch (e) {}
const savePref = () => { try { localStorage.setItem(PK, JSON.stringify(pref)); } catch (e) {} };
const hasTTS = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const trOf = ex => (ex && (ex[lang()] || ex.en || ex.it)) || "";
function pickVoice() { try { voice = speechSynthesis.getVoices().find(v => /^zh/i.test(v.lang) && /CN|Hans|cmn/i.test(v.lang + v.name)) || speechSynthesis.getVoices().find(v => /^zh/i.test(v.lang)) || null; } catch (e) {} }
if (hasTTS) { pickVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", pickVoice); }
const sentences = txt => (txt.match(/[^。！？!?]+[。！？!?]?/g) || []).map(s => s.trim()).filter(s => s.length > 1);

async function build() {
  let out = [];
  if (pref.src === "ex") {
    const cards = (await opts.loadCards(opts.getLevel())) || [], seen = new Set();
    cards.forEach(c => { if (c.example && c.example.zh && !seen.has(c.example.zh)) { seen.add(c.example.zh); out.push({ zh: c.example.zh, py: c.example.pinyin || "", tr: trOf(c.example), tag: c.hanzi }); } });
  } else {
    if (!readingCache) { try { readingCache = (await (await fetch(CFG.READING_URL)).json()).sets || []; } catch (e) { readingCache = []; } }
    const lv = opts.getLevel();
    readingCache.filter(s => s.level === lv && s.passage).forEach(s => sentences(s.passage).forEach(z => out.push({ zh: z, py: "", tr: "", tag: "" })));
  }
  if (pref.shuffle) for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const sleep = (ms, tk) => new Promise(r => { const t = setTimeout(r, ms); ui._wake = () => { clearTimeout(t); r(); }; });
function say(text, tk) {
  return new Promise(res => {
    if (!hasTTS) return res();
    const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; u.rate = pref.rate; if (voice) u.voice = voice;
    let done = false; const fin = () => { if (!done) { done = true; clearInterval(keep); res(); } };
    u.onend = fin; u.onerror = fin;
    const keep = setInterval(() => { if (tk !== token) { fin(); return; } try { speechSynthesis.pause(); speechSynthesis.resume(); } catch (e) {} }, 12000);   // evita lo stop automatico di alcuni browser sulle frasi lunghe
    try { speechSynthesis.cancel(); speechSynthesis.resume(); speechSynthesis.speak(u); } catch (e) { fin(); }
  });
}
function draw() {
  const s = list[idx]; if (!s) { ui.zh.textContent = ""; ui.py.textContent = ""; ui.tr.textContent = ""; ui.pos.textContent = ""; return; }
  ui.card.classList.remove("in"); void ui.card.offsetWidth; ui.card.classList.add("in");
  ui.zh.textContent = s.zh; ui.py.textContent = pref.py ? s.py : ""; ui.tr.textContent = pref.tr ? (s.tr || (pref.src === "rd" ? T("(i testi di lettura non hanno traduzione: usa le frasi d’esempio per vederla)") : "")) : "";
  ui.pos.textContent = (idx + 1) + " / " + list.length; ui.bar.style.width = Math.round(100 * (idx + 1) / list.length) + "%";
}
async function run() {
  const tk = ++token; playing = true; setBtn(); await lock();
  while (playing && tk === token && list.length) {
    draw(); const s = list[idx];
    await say(s.zh, tk); if (tk !== token) return;
    if (pref.twice) { await sleep(600, tk); if (tk !== token) return; await say(s.zh, tk); if (tk !== token) return; }
    await sleep(pref.gap * 1000, tk); if (tk !== token) return;
    if (idx + 1 >= list.length) { if (!pref.loop) { stop(); return; } idx = 0; } else idx++;
  }
}
function stop() { playing = false; token++; try { speechSynthesis.cancel(); } catch (e) {} if (ui && ui._wake) ui._wake(); unlock(); setBtn(); }
async function lock() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch (e) {} }
function unlock() { try { if (wake) wake.release(); } catch (e) {} wake = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && playing) lock(); });
function setBtn() { if (!ui) return; ui.play.textContent = playing ? "⏸ " + T("Pausa") : "▶ " + T("Ascolta"); ui.play.setAttribute("aria-pressed", String(playing)); }
function go(d) { if (!list.length) return; const was = playing; stop(); idx = (idx + d + list.length) % list.length; draw(); if (was) run(); }
async function reload() { const was = playing; stop(); idx = 0; ui.msg.textContent = T("Caricamento…"); list = await build(); ui.msg.textContent = list.length ? "" : T("Nessuna frase disponibile per questo livello."); draw(); if (was && list.length) run(); }
function view() {
  host.replaceChildren(); const w = el("div", "ls-wrap");
  w.append(el("h2", "", T("Ascolto guidato")), el("p", "hint", T("Le frasi vengono lette una dopo l’altra, con testo e traduzione. Ideale per ascoltare mentre cammini o viaggi.")));
  if (!hasTTS) w.append(el("p", "msg", T("Il tuo browser non supporta la sintesi vocale.")));
  const card = el("div", "ls-card"), zh = el("div", "ls-zh"), py = el("div", "ls-py"), tr = el("div", "ls-tr"), pos = el("div", "ls-pos"), bar = el("div", "ls-bar"), fill = el("i"); bar.append(fill);
  card.setAttribute("aria-live", "polite"); card.append(zh, py, tr); w.append(card, bar, pos);
  const ctl = el("div", "ls-ctl"), prev = el("button", "btn", "⏮"), play = el("button", "btn big", ""), next = el("button", "btn", "⏭");
  prev.setAttribute("aria-label", T("Frase precedente")); next.setAttribute("aria-label", T("Frase successiva"));
  prev.onclick = () => go(-1); next.onclick = () => go(1); play.onclick = () => { if (playing) stop(); else if (list.length) run(); };
  ctl.append(prev, play, next); w.append(ctl);
  const msg = el("p", "hint"); w.append(msg);
  const set = el("div", "ls-set");
  const sel = (label, key, choices, conv) => { const l = el("label", "", label + " "), s = el("select"); choices.forEach(([v, t]) => { const o = el("option", "", t); o.value = v; if (String(pref[key]) === String(v)) o.selected = true; s.append(o); }); s.onchange = () => { pref[key] = conv ? conv(s.value) : s.value; savePref(); if (key === "src") reload(); }; l.append(s); return l; };
  const chk = (label, key, after) => { const l = el("label", "chk"), c = el("input"); c.type = "checkbox"; c.checked = !!pref[key]; c.onchange = () => { pref[key] = c.checked; savePref(); if (after) after(); }; l.append(c, " " + label); return l; };
  set.append(
    sel(T("Fonte"), "src", [["ex", T("Frasi d’esempio (con traduzione)")], ["rd", T("Testi di lettura")]]),
    sel(T("Velocità"), "rate", [[0.6, "0.6×"], [0.8, "0.8×"], [1, "1×"], [1.2, "1.2×"]], Number),
    sel(T("Pausa tra le frasi"), "gap", [[0.5, "0,5 s"], [1.5, "1,5 s"], [3, "3 s"], [5, "5 s"]], Number),
    chk(T("Ripeti in ciclo"), "loop"), chk(T("Ordine casuale"), "shuffle", reload), chk(T("Leggi ogni frase due volte"), "twice"), chk(T("Mostra pinyin"), "py", draw), chk(T("Mostra traduzione"), "tr", draw));
  w.append(set, el("p", "hint", T("Su telefono lo schermo resta acceso durante l’ascolto; se lo blocchi, alcuni browser interrompono la voce.")));
  host.append(w); ui = { card, zh, py, tr, pos, bar: fill, play, msg }; setBtn();
}
window.Listen = {
  mount(h, o) { host = h; opts = o; view(); },
  async show() { if (!ui) return; const key = opts.getLevel() + "|" + pref.src; if (key !== srcKey) { srcKey = key; await reload(); } },
  refresh() { if (!host) return; const was = playing; stop(); view(); srcKey = ""; this.show(); },
  hide() { stop(); }
};
})();
