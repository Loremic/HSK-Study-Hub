/* Rilevatore OPZIONALE di testo probabilmente generato da AI.  window.AIDetector
 *
 * ATTENZIONE: nessun rilevatore è affidabile. Questo modulo è un INDIZIO per l'autovalutazione, non una prova:
 * non va usato come voto né per accusare qualcuno. Sui testi brevi e di studenti non madrelingua gli errori sono frequenti
 * (i detector tendono a classificare come "AI" chi scrive con lessico semplice e frasi regolari: proprio i testi HSK).
 * Il punteggio NON è una probabilità calibrata.
 *
 * Attivazione (config.js):
 *   AI_DETECTOR: { enabled: true, providers: ["local"], minChars: 40, remote: { url: "", timeoutMs: 15000 } }
 *   Se enabled non è true il modulo non fa nulla e l'interfaccia non mostra niente.
 *
 * API:
 *   AIDetector.enabled()                       -> boolean
 *   await AIDetector.analyze(text, ctx)        -> { humanPct|null, reliable, level, signals[], notes[], providers[] }
 *       ctx = { level:'hsk1'|'hsk2'|'hsk3', lexicon:Set<string>|null, telemetry:{pasted,typed,ms}|null, baseline:[{text}...]|null }
 *   AIDetector.register(name, async (text, ctx) => ({ signals:[...], aiProb?: 0..1 }))   // provider aggiuntivi
 *   AIDetector.stats(text)                     -> feature grezze (per test)
 *
 * Provider remoto (facoltativo): POST {text, lang:"zh"} -> { ai_probability: 0..1 }.  Va fatto passare dal proprio server
 * (mai chiavi nel browser). Se disponibile pesa il 60% del risultato.
 */
(function () {
"use strict";
const CFG = (window.HSK_CONFIG && window.HSK_CONFIG.AI_DETECTOR) || {};
const HAN = /[一-鿿]/;
const SENT_SPLIT = /[。！？!?；;\n]+/;
// connettivi tipici del cinese "da manuale" prodotto dai modelli
const FORMULAIC = ["首先", "其次", "再次", "总之", "综上所述", "总而言之", "此外", "另外", "值得注意的是", "不仅", "而且", "与此同时", "因此", "由此可见", "不可否认", "在当今社会", "随着", "总的来说", "一方面", "另一方面", "意义重大", "至关重要"];
const tx = (k, v) => window.I18n ? I18n.t(k, v) : k.replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

function tokens(text) {
  const out = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try { for (const s of new Intl.Segmenter("zh", { granularity: "word" }).segment(text)) if (s.isWordLike) out.push(s.segment); if (out.length) return out; } catch (e) {}
  }
  for (const ch of text) if (HAN.test(ch)) out.push(ch); else if (/[a-zāáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜ0-9]/i.test(ch)) out.push(ch);
  return out;
}
// MATTR: type/token ratio su finestre mobili (poco sensibile alla lunghezza)
function mattr(toks, w = 25) {
  if (toks.length < w) return toks.length ? new Set(toks).size / toks.length : 0;
  let acc = 0, n = 0; for (let i = 0; i + w <= toks.length; i++) { acc += new Set(toks.slice(i, i + w)).size / w; n++; } return acc / n;
}
function stats(text) {
  const sents = text.split(SENT_SPLIT).map(s => s.trim()).filter(s => s.replace(/[\s，,、“”"'‘’（）()：:]/g, "").length);
  const lens = sents.map(s => [...s].filter(c => HAN.test(c) || /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜ]/.test(c)).length);
  const toks = tokens(text), han = [...text].filter(c => HAN.test(c));
  const formulaic = FORMULAIC.reduce((n, w) => n + (text.split(w).length - 1), 0);
  const commas = (text.match(/[，,]/g) || []).length;
  const punctKinds = new Set(text.match(/[，。！？、；：“”‘’（）…—,.!?;:]/g) || []).size;
  const big = []; for (let i = 0; i + 1 < han.length; i++) big.push(han[i] + han[i + 1]);
  return { chars: han.length, tokens: toks.length, sentences: sents.length, lens, meanLen: mean(lens), cvLen: mean(lens) ? sd(lens) / mean(lens) : 0,
    mattr: mattr(toks), formulaic, formulaicPer100: han.length ? formulaic * 100 / han.length : 0, commaPerSent: sents.length ? commas / sents.length : 0, punctKinds,
    bigramRepeat: big.length ? 1 - new Set(big).size / big.length : 0, han: han.length };
}

/* ---- provider locale: stilometria. Ogni segnale ha direction = +1 (verso "AI") o -1 (verso "umano") e peso. */
async function localProvider(text, ctx) {
  const s = stats(text), sig = [];
  const add = (id, label, value, dir, w, note) => sig.push({ id, label, value, dir: clamp(dir, -1, 1), w, note });
  if (s.sentences >= 4) add("burst", tx("Variazione della lunghezza delle frasi (burstiness)"), +s.cvLen.toFixed(2), s.cvLen < .25 ? .8 : s.cvLen < .4 ? .2 : -.5, 1.2,
    tx("Frasi molto regolari sono tipiche dei modelli, ma anche di chi segue schemi di studio."));
  if (s.tokens >= 25) add("mattr", tx("Varietà lessicale (MATTR)"), +s.mattr.toFixed(2), s.mattr > .93 ? .3 : s.mattr < .7 ? -.2 : 0, .5, tx("Poco discriminante nei testi brevi."));
  if (s.chars >= 30) add("formula", tx("Connettivi “da saggio” (首先, 总之, 综上所述…)"), +s.formulaicPer100.toFixed(1), s.formulaicPer100 >= 3 ? 1 : s.formulaicPer100 >= 1.2 ? .4 : -.3, 1.4, tx("Densità per 100 caratteri."));
  if (s.sentences >= 3) add("punct", tx("Punteggiatura molto uniforme"), s.punctKinds, s.punctKinds <= 2 && s.sentences >= 6 ? .3 : -.1, .4, "");
  if (s.chars >= 40) add("rep", tx("Ripetizione di coppie di caratteri"), +s.bigramRepeat.toFixed(2), s.bigramRepeat > .35 ? -.4 : s.bigramRepeat < .08 ? .2 : 0, .4, "");
  // coerenza con il livello: uno studente HSK 1–3 raramente usa molte parole fuori dal sillabo
  if (ctx.lexicon && s.tokens >= 15 && ctx.level) {
    const words = tokens(text).filter(w => HAN.test(w)); let out = 0;
    for (const w of words) if (![...w].every(c => ctx.lexicon.has(c)) ) out++;
    const r = words.length ? out / words.length : 0;
    add("level", tx("Parole con caratteri oltre il livello"), +(r * 100).toFixed(0) + "%", r > .25 ? .9 : r > .12 ? .4 : -.2, 1.2, tx("Un testo molto sopra il livello dichiarato è un indizio forte, non una prova (si usano dizionari)."));
  }
  // telemetria di scrittura (solo se raccolta in pagina)
  const t = ctx.telemetry;
  if (t && t.pasted + t.typed >= 20) {
    const frac = t.pasted / (t.pasted + t.typed);
    add("paste", tx("Quota di testo incollato"), Math.round(frac * 100) + "%", frac > .8 ? .9 : frac > .4 ? .4 : -.6, 1.6, tx("Incollare non significa usare un’AI: può essere una bozza scritta altrove."));
  }
  // deriva rispetto allo stile personale (ultimi testi nel quaderno)
  const base = (ctx.baseline || []).filter(b => b && b.text && b.text.length >= 40).slice(-6);
  if (base.length >= 3 && s.sentences >= 3) {
    const bs = base.map(b => stats(b.text)), bl = mean(bs.map(x => x.meanLen)), bc = mean(bs.map(x => x.formulaicPer100));
    const jump = bl ? Math.abs(s.meanLen - bl) / bl : 0;
    add("drift", tx("Differenza dal tuo stile abituale (lunghezza frasi)"), Math.round(jump * 100) + "%", jump > .8 ? .7 : jump > .4 ? .2 : -.4, 1, tx("Confronto con {n} tuoi testi precedenti.", { n: base.length }));
    if (bc < .3 && s.formulaicPer100 >= 2) add("drift2", tx("Uso insolito di connettivi rispetto ai tuoi testi"), +s.formulaicPer100.toFixed(1), .6, .8, "");
  }
  return { signals: sig, stats: s };
}

const providers = { local: localProvider };
async function remoteProvider(text) {
  const r = CFG.remote || {}; if (!r.url) return { signals: [] };
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), r.timeoutMs || 15000);
  try {
    const res = await fetch(r.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang: "zh" }), signal: ac.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json(); const p = Number(j.ai_probability);
    if (!isFinite(p) || p < 0 || p > 1) throw new Error("risposta non valida");
    return { aiProb: p, signals: [{ id: "remote", label: tx("Servizio di rilevamento esterno"), value: Math.round(p * 100) + "% AI", dir: p * 2 - 1, w: 3, note: tx("Punteggio del provider configurato.") }] };
  } finally { clearTimeout(to); }
}
providers.remote = remoteProvider;

const enabled = () => CFG.enabled === true;
const minChars = () => CFG.minChars || 40;

async function analyze(text, ctx) {
  ctx = ctx || {};
  const res = { humanPct: null, reliable: false, level: "n/d", signals: [], notes: [], providers: [] };
  if (!enabled()) { res.notes.push(tx("Rilevatore disattivato.")); return res; }
  const han = [...text].filter(c => HAN.test(c)).length;
  if (han < minChars()) { res.notes.push(tx("Testo troppo breve ({n} caratteri): sotto {m} non si può stimare nulla di sensato.", { n: han, m: minChars() })); return res; }
  const names = (CFG.providers && CFG.providers.length ? CFG.providers : ["local"]);
  let remoteP = null;
  for (const n of names) {
    const fn = providers[n]; if (!fn) { res.notes.push(`Provider sconosciuto: ${n}`); continue; }
    try { const o = await fn(text, ctx); res.signals.push(...o.signals); res.providers.push(n); if (typeof o.aiProb === "number") remoteP = o.aiProb; }
    catch (e) { res.notes.push(`Provider “${n}” non disponibile (${e.message}).`); }
  }
  const sig = res.signals.filter(x => x.id !== "remote");
  const W = sig.reduce((a, x) => a + x.w, 0);
  let ai = W ? .5 + .5 * (sig.reduce((a, x) => a + x.dir * x.w, 0) / W) : .5;
  ai = clamp(ai, .12, .88);                       // mai certezza: i segnali sono deboli
  if (remoteP != null) ai = .4 * ai + .6 * clamp(remoteP, .05, .95);
  if (W < 3) res.notes.push(tx("Pochi segnali disponibili: stima molto incerta."));
  res.humanPct = Math.round((1 - ai) * 100);
  res.reliable = false;                           // per costruzione: mai "affidabile"
  res.level = han < 80 ? tx("molto bassa") : han < 200 ? tx("bassa") : tx("media-bassa");
  res.notes.push(tx("Il punteggio riassume indizi stilistici, non è una probabilità calibrata. Gli studenti di cinese vengono spesso classificati come “AI” per errore."));
  return res;
}

window.AIDetector = { enabled, analyze, register: (n, f) => { providers[n] = f; }, stats, _t: { tokens, mattr, FORMULAIC } };
})();
