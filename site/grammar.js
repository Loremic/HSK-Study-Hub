/* Roadmap grammaticale: un percorso per livello HSK (lezioni brevi con schema, spiegazione ed esempi) e collegamenti
   trasversali tra argomenti affini di livelli diversi. Dati in data/grammar.json (caricati alla prima apertura).
   Progresso "capito" in localStorage ("hsk.grammar"), sincronizzato con l'account se attivo. */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s, lang = () => (window.I18n && I18n.lang) || "it";
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const LV = { 1: "hsk1", 2: "hsk2", 3: "hsk3", 4: "hsk4", 5: "hsk5", 6: "hsk6", 79: "hsk79" }, LVN = { 1: "HSK 1", 2: "HSK 2", 3: "HSK 3", 4: "HSK 4", 5: "HSK 5", 6: "HSK 6", 79: "HSK 7–9" };
const URL_ = (window.HSK_CONFIG && window.HSK_CONFIG.GRAMMAR_URL) || "../data/grammar.json", KEY = "hsk.grammar";
let host, opts, data = null, byId = {}, open = null, done = {};
try { done = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {} };
const L = o => o[lang()] || o.en || o.it;
const lvOfLevel = id => +Object.keys(LV).find(k => LV[k] === id) || 1;
async function load() { if (data) return; try { data = await (await fetch(URL_)).json(); } catch (e) { data = []; } byId = {}; data.forEach(p => { byId[p.id] = p; }); }
function pointsOf(lv) { return data.filter(p => p.lv === lv); }
function draw() {
  host.replaceChildren(); const lv = lvOfLevel(opts.getLevel()), pts = pointsOf(lv), w = el("div", "gr-wrap");
  const n = pts.filter(p => done[p.id]).length;
  w.append(el("h2", "", T("Roadmap di grammatica") + " · " + LVN[lv]), el("p", "hint", T("Un percorso dal più semplice al più complesso. Apri una lezione, studiala e segnala come capita; i collegamenti portano ad argomenti affini negli altri livelli.")));
  const pr = el("div", "gr-prog"), bar = el("i"); bar.style.width = (pts.length ? Math.round(100 * n / pts.length) : 0) + "%"; pr.append(bar); w.append(pr, el("p", "gr-count", T("{n} di {t} lezioni completate", { n, t: pts.length })));
  const ol = el("ol", "gr-road");
  pts.forEach((p, i) => {
    const li = el("li", "gr-step" + (done[p.id] ? " done" : "") + (open === p.id ? " open" : "")), b = el("button", "gr-head"); b.type = "button"; b.setAttribute("aria-expanded", String(open === p.id));
    const dot = el("span", "gr-dot", done[p.id] ? "" : String(i + 1)); b.append(dot, el("span", "gr-title", L(p.t)), el("span", "gr-pat zh", p.p));
    b.onclick = () => { open = open === p.id ? null : p.id; draw(); if (open) { const t = host.querySelector(".gr-step.open"); if (t) t.scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
    li.append(b); if (open === p.id) li.append(lesson(p)); ol.append(li);
  });
  w.append(ol); host.append(w);
}
function lesson(p) {
  const d = el("div", "gr-body"); d.append(el("p", "gr-d", L(p.d)));
  p.ex.forEach(e => { const r = el("div", "gr-ex"), s = el("button", "btn gr-say"); s.type = "button"; s.append(el("span", "ic ic-sound")); s.setAttribute("aria-label", T("Ascolta")); s.onclick = () => opts.speak(e.zh);
    const t = el("div"); t.append(el("div", "gr-zh zh", e.zh), el("div", "gr-py", e.py), el("div", "gr-tr", L(e.tr))); r.append(s, t); d.append(r); });
  const rel = (p.rel || []).map(id => byId[id]).filter(Boolean);
  if (rel.length) { const w = el("div", "gr-rel"); w.append(el("span", "gr-rl", T("Collegamenti") + ":"));
    rel.forEach(q => { const c = el("button", "gr-chip"); c.type = "button"; c.append(el("b", "", LVN[q.lv]), " " + L(q.t)); c.onclick = () => go(q); w.append(c); }); d.append(w); }
  const m = el("button", "btn " + (done[p.id] ? "" : "big"), done[p.id] ? T("Segna come da rivedere") : T("Ho capito")); m.type = "button";
  m.onclick = () => { if (done[p.id]) delete done[p.id]; else done[p.id] = 1; save(); draw(); };
  d.append(el("div", "acts", "")); d.lastChild.append(m); return d;
}
function go(q) { open = q.id; if (LV[q.lv] !== opts.getLevel()) opts.setLevel(LV[q.lv]); else draw(); }   // setLevel ricarica la vista tramite show()
window.Grammar = {
  mount(h, o) { host = h; opts = o; },
  async show() { if (!host) return; await load(); draw(); const s = host.querySelector(".gr-step.open"); if (s) setTimeout(() => s.scrollIntoView({ block: "center" }), 60); },
  refresh() { this.show(); }, hide() {}
};
})();
