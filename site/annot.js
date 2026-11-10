/* Testo evidenziato e cliccabile.  window.Annot
 *  Annot.collect(text, {errors, highlights, suggestions, rules}) -> { spans:[{s,e,kind,...}], loose:[...] }
 *  Annot.render({text, spans, loose}, {speak}) -> nodo DOM: legenda con filtri, testo con parti cliccabili, pannello di dettaglio, tabella.
 *  Colori (non solo colore: anche sottolineatura diversa, icona ed etichetta nel dettaglio):
 *   error  rosso   = errori generali e di tono        strength verde = punti di forza
 *   hanzi  ambra   = carattere sbagliato (hanzi)       alt      blu   = alternative suggerite
 */
(function () {
"use strict";
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const KIND = {
  error:    { icon: "✗", label: "Errore", rank: 0 },
  tone:     { icon: "✗", label: "Errore di tono", rank: 0 },
  hanzi:    { icon: "字", label: "Carattere errato", rank: 0 },
  strength: { icon: "✓", label: "Punto di forza", rank: 1 },
  alt:      { icon: "💡", label: "Alternativa suggerita", rank: 2 }
};
const GROUP = { error: "error", tone: "error", hanzi: "hanzi", strength: "strength", alt: "alt" };      // gruppo di legenda/filtro
function h(tag, cls, kids) { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of [].concat(kids == null ? [] : kids)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; }
const kindOfCat = c => c === "caratteri" ? "hanzi" : c === "pinyin" ? "tone" : "error";

function collect(text, src) {
  const cand = [];
  for (const e of (src.errors || [])) cand.push({ kind: kindOfCat(e.category), excerpt: e.excerpt, correction: e.correction, explanation: e.explanation, alts: e.alternatives || [], category: e.category, severity: e.severity });
  for (const r of (src.rules || [])) cand.push({ kind: "error", s: r.s, e: r.e, excerpt: text.slice(r.s, r.e), explanation: tx(r.msg), local: true });
  for (const x of (src.local || [])) cand.push({ kind: x.kind, s: x.s, e: x.e, excerpt: x.excerpt, correction: x.correction, explanation: x.explanation, alts: x.alts || [], category: x.category, local: true });
  for (const x of (src.highlights || [])) cand.push({ kind: "strength", excerpt: x.excerpt, explanation: x.note });
  for (const x of (src.suggestions || [])) cand.push({ kind: "alt", excerpt: x.excerpt, correction: x.alternative, explanation: x.explanation });
  cand.forEach((c, i) => { c.id = i; });
  // posizioni: una stessa citazione ripetuta nel testo si lega alla prima occorrenza libera
  const taken = [], free = (s, e) => !taken.some(t => s < t[1] && e > t[0]);
  const order = cand.slice().sort((a, b) => KIND[a.kind].rank - KIND[b.kind].rank || a.id - b.id), spans = [], loose = [];
  for (const c of order) {
    if (c.s == null) {
      // 1) citazione esatta (prima occorrenza libera); 2) senza spazi/punteggiatura; 3) la parte più lunga (>=2 caratteri) che si ritrova
      const tryFind = ex => { let from = 0; while (ex) { const i = text.indexOf(ex, from); if (i < 0) return -1; if (free(i, i + ex.length)) return i; from = i + 1; } return -1; };
      let ex = c.excerpt || "", at = tryFind(ex);
      if (at < 0) { const t = ex.replace(/[\s，。！？、；：“”‘’（）()]/g, ""); if (t && t !== ex) { ex = t; at = tryFind(ex); } }
      if (at < 0 && ex.length > 2) { for (let len = ex.length - 1; len >= 2 && at < 0; len--) for (let k = 0; k + len <= ex.length && at < 0; k++) { const sub = ex.slice(k, k + len), i = tryFind(sub); if (i >= 0) { at = i; ex = sub; } } if (at >= 0 && ex.length < 2) at = -1; }
      if (at >= 0) { c.s = at; c.e = at + ex.length; c.excerpt = ex; }
    }
    if (c.s != null && c.e > c.s && free(c.s, c.e)) { taken.push([c.s, c.e]); spans.push(c); }
    else if (!c.local) loose.push(c);                              // citazione non trovata o sovrapposta: resta solo nella tabella
  }
  spans.sort((a, b) => a.s - b.s);
  return { text, spans, loose, all: cand.filter(c => spans.includes(c) || loose.includes(c)).sort((a, b) => (a.s == null ? 1e9 : a.s) - (b.s == null ? 1e9 : b.s)) };
}

function render(D, o) {
  o = o || {};
  const root = h("div", "an-wrap"), counts = { error: 0, hanzi: 0, strength: 0, alt: 0 };
  D.spans.forEach(s => counts[GROUP[s.kind]]++);
  // legenda con filtri
  const legend = h("div", "an-legend", null); legend.setAttribute("role", "group"); legend.setAttribute("aria-label", tx("Mostra o nascondi i tipi di evidenziatura"));
  const LEG = [["error", tx("Errori e toni")], ["hanzi", tx("Caratteri (hanzi)")], ["strength", tx("Punti di forza")], ["alt", tx("Alternative")]];
  for (const [g, lab] of LEG) {
    const b = h("button", "an-leg an-k-" + g, [h("span", "an-ic", { error: "✗", hanzi: "字", strength: "✓", alt: "💡" }[g]), " " + lab + " (" + counts[g] + ")"]);
    b.type = "button"; b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", () => { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); textEl.classList.toggle("hide-" + g, !on); });
    legend.append(b);
  }
  // testo
  const textEl = h("p", "an-text zh"); textEl.setAttribute("lang", "zh-Hans");
  const panel = h("div", "an-panel"); panel.setAttribute("role", "region"); panel.setAttribute("aria-live", "polite"); panel.setAttribute("aria-label", tx("Dettaglio della parte selezionata"));
  const nodes = new Map(); let pos = 0, activeBtn = null;
  const show = c => {
    if (activeBtn) activeBtn.classList.remove("cur"); activeBtn = nodes.get(c.id) || null; if (activeBtn) activeBtn.classList.add("cur");
    const K = KIND[c.kind], g = GROUP[c.kind]; panel.className = "an-panel an-k-" + g; panel.replaceChildren();
    panel.append(h("div", "an-ph", [h("span", "an-ic", K.icon), " " + tx(K.label), c.category && c.kind !== "strength" && c.kind !== "alt" && o.catLabel ? h("span", "tag", o.catLabel(c.category)) : null]));
    const line = h("p", "an-line", [h("span", "zh lg " + (g === "strength" ? "ok" : g === "alt" ? "" : "bad"), c.excerpt)]);
    if (c.correction) line.append(" → ", h("span", "zh lg ok", c.correction));
    panel.append(line);
    if (c.explanation) panel.append(h("p", null, c.explanation));
    if (c.alts && c.alts.length) panel.append(h("p", null, [h("b", null, tx("Altre forme corrette: ")), ...c.alts.flatMap((a, i) => [i ? " · " : "", h("span", "zh lg", a)])]));
    if (o.speak && (c.correction || g === "strength")) { const b = h("button", "btn", "🔊 " + tx("Ascolta")); b.type = "button"; b.addEventListener("click", () => o.speak(c.correction || c.excerpt)); panel.append(h("div", "acts wr-left", b)); }
  };
  const add = (str) => { if (str) textEl.append(document.createTextNode(str)); };
  for (const c of D.spans) {
    add(D.text.slice(pos, c.s));
    const b = h("button", "an an-k-" + GROUP[c.kind] + " an-" + c.kind, D.text.slice(c.s, c.e)); b.type = "button";
    b.setAttribute("aria-label", tx(KIND[c.kind].label) + ": " + D.text.slice(c.s, c.e)); b.addEventListener("click", () => show(c)); nodes.set(c.id, b); textEl.append(b); pos = c.e;
  }
  add(D.text.slice(pos));
  panel.className = "an-panel"; panel.append(h("p", "hint", D.spans.length ? tx("Tocca una parte evidenziata per vedere cosa è giusto o sbagliato e come si corregge.") : tx("Nessuna parte evidenziata.")));
  root.append(legend, textEl, panel);
  // tabella: analisi dettagliata degli elementi
  if (D.all.length) {
    const tb = h("table", "an-table"); const cap = h("caption", "hint", tx("Analisi dettagliata degli elementi del testo"));
    tb.append(cap, h("thead", null, h("tr", null, [tx("Elemento del testo"), tx("Valutazione"), tx("Correzione / Note"), tx("Spiegazione")].map(t => h("th", null, t)))));
    const body = h("tbody");
    for (const c of D.all) {
      const K = KIND[c.kind], g = GROUP[c.kind], r = h("tr", "an-k-" + g);
      const el = h("button", "an an-k-" + g + " an-" + c.kind, c.excerpt); el.type = "button"; el.addEventListener("click", () => { show(c); const n = nodes.get(c.id); if (n) n.scrollIntoView({ block: "center", behavior: "smooth" }); else panel.scrollIntoView({ block: "nearest" }); });
      r.append(h("td", "zh", el), h("td", null, [h("span", "an-ic", K.icon), " " + tx(K.label)]), h("td", "zh", [c.correction || "", c.alts && c.alts.length ? h("div", "hint", c.alts.join(" · ")) : null]), h("td", null, c.explanation || ""));
      [...r.children].forEach((td, i) => td.setAttribute("data-l", [tx("Elemento del testo"), tx("Valutazione"), tx("Correzione / Note"), tx("Spiegazione")][i]));
      body.append(r);
    }
    tb.append(body); root.append(h("div", "an-tw", tb));
  }
  return root;
}
window.Annot = { collect, render, KIND, _t: { kindOfCat } };
})();
