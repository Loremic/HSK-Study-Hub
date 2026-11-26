/* Calligrafia: esercizio di scrittura carattere per carattere, con analisi locale (nessuna IA a pagamento).
   Dati dei tratti: data/strokes/hsk<livello>.json (da hanzi-writer-data / Make Me a Hanzi, licenza Arphic: vedi data/strokes/ARPHICPL.TXT).
   Parametri (0-100): forma (ogni tratto confrontato con la linea mediana del modello), attinenza (somiglianza dell'insieme con il carattere scelto),
   ordine dei tratti (solo scrivendo sul sito: da un file non si può sapere in che ordine sono stati tracciati).
   Un carattere è "acquisito" quando ha raggiunto 100 in tutti e tre (il punteggio migliore di ogni parametro si conserva tra i tentativi).
   Limiti: è un confronto geometrico, non un maestro di calligrafia: la tolleranza è tarata su una scrittura ordinata, non sulla bellezza del tratto. */
(function () {
"use strict";
const T = (s, v) => window.I18n ? I18n.t(s, v) : s;
/* Criteri di acquisizione e ripasso (valori di partenza basati sulla ricerca sul "successive relearning" e sull'effetto distanziamento):
   - acquisito = 3 prove PERFETTE sul sito (100 in forma, attinenza e ordine) di cui almeno 1 scritta a memoria (modello nascosto);
   - ripasso a intervalli crescenti dopo l'acquisizione: 1, 3, 7, 14, 30, 60 giorni. */
const GOAL = 3, MEM_MIN = 1, STEPS = [1, 3, 7, 14, 30, 60], DAY = 864e5;
const KEY = "hsk.callig", N = 96, D = 1024, Y0 = 900, LV_KEYS = ["1", "2", "3", "4", "5", "6", "79"], LV_NAME = { "1": "HSK 1", "2": "HSK 2", "3": "HSK 3", "4": "HSK 4", "5": "HSK 5", "6": "HSK 6", "79": "HSK 7–9" };
const h = (tag, a, ...kids) => { const e = document.createElement(tag); if (a) for (const k in a) { const v = a[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };

/* =================== geometria (funzioni pure, provate da test) =================== */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plen = p => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; };
function resample(p, n) {
  if (p.length === 1) p = [p[0], [p[0][0] + 1e-4, p[0][1]]];
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + dist(p[i - 1], p[i]));
  const L = cum[cum.length - 1], out = []; let j = 1;
  for (let k = 0; k < n; k++) {
    const t = L * k / (n - 1); while (j < p.length - 1 && cum[j] < t) j++;
    const seg = cum[j] - cum[j - 1], u = seg > 0 ? (t - cum[j - 1]) / seg : 0; out.push([p[j - 1][0] + (p[j][0] - p[j - 1][0]) * u, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * u]);
  }
  return out;
}
function bboxOf(polys) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of polys) for (const [x, y] of p) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return { x0: a, y0: b, x1: c, y1: d }; }
function normPolys(polys) {              // scala uniformemente il carattere in [0,1] sul lato maggiore, centrandolo
  const bb = bboxOf(polys), w = bb.x1 - bb.x0, hh = bb.y1 - bb.y0, m = Math.max(w, hh, 0.02), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  return polys.map(p => p.map(([x, y]) => [(x - cx) / m + 0.5, (y - cy) / m + 0.5]));
}
const refToUnit = ([x, y]) => [x / D, (Y0 - y) / D];
const refPolys = ref => ref.m.map(m => m.map(refToUnit));
const meanDist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += dist(a[i], b[i]); return s / a.length; };
const strokeScore = d => d <= 0.08 ? 100 : d >= 0.24 ? 0 : 100 * (0.24 - d) / 0.16;
const map01 = (v, lo, hi) => Math.round(Math.max(0, Math.min(100, 100 * (v - lo) / (hi - lo))));

/* ---- raster e distanze (griglia N x N) ---- */
function rasterLines(polys) {
  const g = new Uint8Array(N * N), put = (x, y) => { const ix = Math.round(x * (N - 1)), iy = Math.round(y * (N - 1)); if (ix >= 0 && iy >= 0 && ix < N && iy < N) g[iy * N + ix] = 1; };
  for (const p of polys) { if (p.length === 1) put(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i], n = Math.max(2, Math.ceil(dist(a, b) * (N - 1) * 2)); for (let k = 0; k <= n; k++) put(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); } }
  return g;
}
function dtOf(mask) {
  const INF = 1e9, d = new Float32Array(N * N), r2 = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; let v = d[i]; if (x) v = Math.min(v, d[i - 1] + 1); if (y) { v = Math.min(v, d[i - N] + 1); if (x) v = Math.min(v, d[i - N - 1] + r2); if (x < N - 1) v = Math.min(v, d[i - N + 1] + r2); } d[i] = v; }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) { const i = y * N + x; let v = d[i]; if (x < N - 1) v = Math.min(v, d[i + 1] + 1); if (y < N - 1) { v = Math.min(v, d[i + N] + 1); if (x < N - 1) v = Math.min(v, d[i + N + 1] + r2); if (x) v = Math.min(v, d[i + N - 1] + r2); } d[i] = v; }
  return d;
}
function chamferF(U, R, t) {                // F-score tra due maschere sottili con tolleranza t (pixel)
  const dU = dtOf(U), dR = dtOf(R); let nu = 0, nr = 0, pu = 0, pr = 0;
  for (let i = 0; i < U.length; i++) { if (U[i]) { nu++; if (dR[i] <= t) pu++; } if (R[i]) { nr++; if (dU[i] <= t) pr++; } }
  if (!nu || !nr) return 0; const P = pu / nu, Rc = pr / nr; return P + Rc ? 2 * P * Rc / (P + Rc) : 0;
}
const TOL_ATT = 0.085 * N, TOL_FORM = 0.045 * N;

/* ---- valutazione di un carattere scritto sul sito (tratti con ordine) ---- */
function lis(a) { const t = []; for (const v of a) { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] <= v) lo = m + 1; else hi = m; } t[lo] = v; } return t.length; }
function evalStrokes(user, ref) {
  const R = normPolys(refPolys(ref)), nR = R.length, U = normPolys(user.filter(s => s.length)), nU = U.length;
  const Rr = R.map(p => resample(p, 24)), Ur = U.map(p => resample(p, 24)), cand = [];
  for (let i = 0; i < nU; i++) for (let j = 0; j < nR; j++) {
    const df = meanDist(Ur[i], Rr[j]), dr = meanDist(Ur[i], Rr[j].slice().reverse()), c = Math.min(df, dr);
    if (c <= 0.30) cand.push({ i, j, df, dr, cost: c + 0.002 * Math.abs(i - j) });
  }
  cand.sort((a, b) => a.cost - b.cost); const ui = new Set(), rj = new Set(), pairs = [];
  for (const c of cand) if (!ui.has(c.i) && !rj.has(c.j)) { ui.add(c.i); rj.add(c.j); pairs.push(c); }
  const per = Array.from({ length: nR }, (_, j) => ({ j, status: "missing", score: 0, user: -1 }));
  for (const p of pairs) {
    const long = plen(R[p.j]) >= 0.12, rev = long && p.dr + 0.02 < p.df, d = Math.min(p.df, p.dr), s = strokeScore(d) * (rev ? 0.6 : 1);
    per[p.j] = { j: p.j, user: p.i, d, score: s, status: rev ? "reversed" : s >= 85 ? "ok" : "rough" };
  }
  const extra = nU - pairs.length, extraIdx = [...Array(nU).keys()].filter(i => !ui.has(i));
  const form = Math.round(Math.max(0, per.reduce((a, x) => a + x.score, 0) / nR * (1 - Math.min(0.5, 0.12 * extra))));
  const seq = pairs.slice().sort((a, b) => a.i - b.i).map(p => p.j), ord = nR ? Math.round(100 * lis(seq) / nR) : 0;
  const F = chamferF(rasterLines(U), rasterLines(R), TOL_ATT), att = map01(F, 0.55, 0.92);
  const outOfOrder = pairs.filter(p => p.i !== p.j).map(p => ({ user: p.i, expected: p.j }));
  return { form, att, ord, nUser: nU, nRef: nR, per, extra, extraIdx, outOfOrder, pairs: pairs.map(p => ({ i: p.i, j: p.j })), seq };
}

/* ---- da un'immagine (foto/scansione): maschera -> scheletro -> confronto ---- */
function otsu(g) {
  const hist = new Array(256).fill(0); for (const v of g) hist[v]++; const tot = g.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128; for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = i; } }
  return th;
}
function inkMask(rgba, W, H) {              // true = inchiostro (la classe meno numerosa, di solito scura)
  const g = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) g[i] = Math.round(0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]);
  const th = otsu(g), m = new Uint8Array(W * H); let dark = 0; for (let i = 0; i < m.length; i++) if (g[i] <= th) { m[i] = 1; dark++; }
  if (dark > m.length / 2) for (let i = 0; i < m.length; i++) m[i] ^= 1;
  return m;
}
function components(m, W, H) {              // componenti connesse (8-connesse): {pix:[indici]}
  const lab = new Int32Array(W * H), out = []; const st = [];
  for (let s = 0; s < m.length; s++) { if (!m[s] || lab[s]) continue; const id = out.length + 1, pix = []; lab[s] = id; st.push(s);
    while (st.length) { const i = st.pop(); pix.push(i); const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (m[j] && !lab[j]) { lab[j] = id; st.push(j); } } }
    out.push({ pix }); }
  return out;
}
function thin(g) {                          // Zhang-Suen su griglia N x N
  const idx = (x, y) => y * N + x; let changed = true;
  while (changed) { changed = false;
    for (let pass = 0; pass < 2; pass++) { const del = [];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { if (!g[idx(x, y)]) continue;
        const p2 = g[idx(x, y - 1)], p3 = g[idx(x + 1, y - 1)], p4 = g[idx(x + 1, y)], p5 = g[idx(x + 1, y + 1)], p6 = g[idx(x, y + 1)], p7 = g[idx(x - 1, y + 1)], p8 = g[idx(x - 1, y)], p9 = g[idx(x - 1, y - 1)];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
        if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue; del.push(idx(x, y)); }
      if (del.length) { changed = true; for (const i of del) g[i] = 0; } }
  }
  return g;
}
function skeletonOf(mask, W, H) {           // maschera dell'immagine -> scheletro N x N con il carattere riempito sul lato maggiore; null se non c'è inchiostro
  const comps = components(mask, W, H), minA = Math.max(10, W * H * 0.0012), keep = comps.filter(c => c.pix.length >= minA);
  if (!keep.length) return null;
  let x0 = W, y0 = H, x1 = 0, y1 = 0; const m = new Uint8Array(W * H);
  for (const c of keep) for (const i of c.pix) { m[i] = 1; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const w = x1 - x0 + 1, hh = y1 - y0 + 1, s = Math.max(w, hh), ox = x0 - (s - w) / 2, oy = y0 - (s - hh) / 2;
  const ii = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += m[y * W + x]; ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row; } }
  const area = (ax, ay, bx, by) => { ax = Math.max(0, Math.floor(ax)); ay = Math.max(0, Math.floor(ay)); bx = Math.min(W, Math.max(ax + 1, Math.ceil(bx))); by = Math.min(H, Math.max(ay + 1, Math.ceil(by))); return (ii[by * (W + 1) + bx] - ii[ay * (W + 1) + bx] - ii[by * (W + 1) + ax] + ii[ay * (W + 1) + ax]) / ((bx - ax) * (by - ay)); };
  const g = new Uint8Array(N * N), k = s / N;
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) if (area(ox + tx * k, oy + ty * k, ox + (tx + 1) * k, oy + (ty + 1) * k) > 0.35) g[ty * N + tx] = 1;
  const t = thin(g); let n = 0; for (const v of t) n += v; return n ? { sk: t, ratio: w / hh, comps: keep.length } : null;
}
function evalImage(skeleton, ref) {
  const R = rasterLines(normPolys(refPolys(ref))), F1 = chamferF(skeleton, R, TOL_ATT), F2 = chamferF(skeleton, R, TOL_FORM);
  return { form: map01(F2, 0.30, 0.85), att: map01(F1, 0.55, 0.92), ord: null };
}

/* =================== dati e progressi =================== */
const S = { sort: "theme", recall: false, peeked: false, root: null, ctx: null, idx: null, byCh: new Map(), refs: new Map(), lv: null, q: "", cur: null, strokes: [], live: null, showModel: true, mode: "draw", res: null, anim: 0, busy: false, els: {}, prog: null };
const hex = ch => ch.codePointAt(0).toString(16);
const base = () => (window.HSK_CONFIG && HSK_CONFIG.CALLI_BASE) || "../data/";
async function loadIdx() { if (S.idx) return S.idx; const r = await fetch(base() + "calli_index.json"); if (!r.ok) throw new Error("indice"); S.idx = await r.json(); S.idx.forEach(e => S.byCh.set(e.c, e)); return S.idx; }
const lvP = new Map();   // un file per livello HSK, scaricato solo quando serve (poi resta in memoria/cache)
async function loadRef(ch) {
  if (S.refs.has(ch)) return S.refs.get(ch);
  await loadIdx(); const e = S.byCh.get(ch); if (!e) throw new Error("tratti");
  if (!lvP.has(e.l)) lvP.set(e.l, fetch(base() + "strokes/hsk" + e.l + ".json").then(r => { if (!r.ok) throw new Error("tratti"); return r.json(); }).catch(er => { lvP.delete(e.l); throw er; }));
  const all = await lvP.get(e.l), d = all[ch]; if (!d) throw new Error("tratti");
  S.refs.set(ch, d); return d;
}
function prog() {
  if (S.prog) return S.prog; try { S.prog = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { S.prog = {}; }
  for (const k in S.prog) { const p = S.prog[k]; if (p.g === undefined) { p.g = p.f >= 100 && p.a >= 100 && p.o >= 100 ? 1 : 0; p.m = 0; } }   // dati della versione precedente
  return S.prog;
}
function saveProg() { try { localStorage.setItem(KEY, JSON.stringify(S.prog)); } catch (e) {} }
const pOf = ch => prog()[ch] || { f: 0, a: 0, o: 0, n: 0, g: 0, m: 0 };
const isDone = p => (p.g || 0) >= GOAL && (p.m || 0) >= MEM_MIN;          // acquisito
const isDue = p => isDone(p) && p.due && Date.now() >= p.due;               // da ripassare
const daysTo = p => Math.max(0, Math.ceil((p.due - Date.now()) / DAY));
function record(ch, r, ctx) {
  ctx = ctx || {}; const p = Object.assign({ f: 0, a: 0, o: 0, n: 0, g: 0, m: 0 }, prog()[ch]), was = isDone(p), wasDue = isDue(p), now = Date.now();
  p.f = Math.max(p.f, r.form); p.a = Math.max(p.a, r.att); if (r.ord != null) p.o = Math.max(p.o, r.ord); p.n++; p.t = now;
  const perfect = r.ord != null && r.form >= 100 && r.att >= 100 && r.ord >= 100, mem = !!ctx.recall && !ctx.peeked; let review = null;
  if (perfect) {
    if (wasDue) { if (mem) { p.s = Math.min((p.s || 0) + 1, STEPS.length - 1); p.due = now + STEPS[p.s] * DAY; review = "ok"; } else review = "needmem"; }
    else if (!was) { p.g = (p.g || 0) + 1; if (mem) p.m = (p.m || 0) + 1; }
  }
  if (!was && isDone(p)) { p.s = 0; p.due = now + STEPS[0] * DAY; }
  prog()[ch] = p; saveProg();
  if (window.Activity) { Activity.log("k", ch); if (!was && isDone(p)) Activity.log("m", ch); }
  return { p, newly: !was && isDone(p), review, perfect };
}
function lapse(ch) { const p = prog()[ch]; if (p && isDue(p)) { p.s = Math.max(0, (p.s || 0) - 1); p.due = Date.now() + DAY; saveProg(); return true; } return false; }   // ha guardato il modello durante il ripasso
function totals() { const P = prog(); let done = 0, due = 0; for (const k in P) { if (isDone(P[k])) done++; if (isDue(P[k])) due++; } return { done, due }; }

/* =================== disegno =================== */
const cssVar = (n, f) => (getComputedStyle(document.documentElement).getPropertyValue(n) || "").trim() || f;
function sizeOf() { return S.els.cv ? S.els.cv.width : 600; }
function modelPaths(ref) { return ref.s.map(d => new Path2D(d)); }
function withModel(g, size, fn) { const k = size / D; g.save(); g.translate(0, 0); g.scale(k, k); g.translate(0, Y0); g.scale(1, -1); fn(); g.restore(); }   // coordinate del modello: x verso destra, y verso l'alto, base a 900
function drawGrid(g, size) {
  g.save(); g.strokeStyle = cssVar("--linea", "#ccc"); g.lineWidth = 1.5; g.setLineDash([8, 8]);
  g.strokeRect(1, 1, size - 2, size - 2); g.beginPath(); g.moveTo(size / 2, 0); g.lineTo(size / 2, size); g.moveTo(0, size / 2); g.lineTo(size, size / 2); g.moveTo(0, 0); g.lineTo(size, size); g.moveTo(size, 0); g.lineTo(0, size); g.stroke(); g.restore();
}
function strokePoly(g, pts, size, color, w) {
  if (!pts.length) return; g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
  if (pts.length === 1) { g.beginPath(); g.arc(pts[0][0] * size, pts[0][1] * size, w / 2, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(pts[0][0] * size, pts[0][1] * size); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2 * size, my = (pts[i][1] + pts[i + 1][1]) / 2 * size; g.quadraticCurveTo(pts[i][0] * size, pts[i][1] * size, mx, my); } const l = pts[pts.length - 1]; g.lineTo(l[0] * size, l[1] * size); g.stroke(); }
  g.restore();
}
async function redraw(opts) {
  const cv = S.els.cv; if (!cv) return; const g = cv.getContext("2d"), size = cv.width; opts = opts || {};
  g.clearRect(0, 0, size, size); drawGrid(g, size);
  const ref = S.cur ? S.refs.get(S.cur) : null;
  if (ref && (S.showModel || opts.model)) { const paths = modelPaths(ref); withModel(g, size, () => { g.fillStyle = cssVar("--inchiostro", "#222"); g.globalAlpha = opts.model ? 0.22 : 0.13; for (const p of paths) g.fill(p); }); }
  const ink = cssVar("--inchiostro", "#222"), w = size * 0.034;
  S.strokes.forEach((s, i) => strokePoly(g, s, size, opts.colors ? opts.colors[i] || ink : ink, w));
  if (S.live) strokePoly(g, S.live, size, ink, w);
  if (opts.numbers) { g.save(); g.font = "bold " + Math.round(size * 0.04) + "px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; S.strokes.forEach((s, i) => { if (!s.length) return; const x = s[0][0] * size, y = s[0][1] * size; g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, size * 0.028, 0, 7); g.fill(); g.strokeStyle = opts.colors ? opts.colors[i] : ink; g.lineWidth = 2; g.stroke(); g.fillStyle = "#000"; g.fillText(String(i + 1), x, y + 1); }); g.restore(); }
}
function animateModel() {                    // mostra i tratti uno alla volta nell'ordine corretto
  const ref = S.cur && S.refs.get(S.cur), cv = S.els.cv; if (!ref || !cv) return; const my = ++S.anim, g = cv.getContext("2d"), size = cv.width, paths = modelPaths(ref);
  const lens = ref.m.map(m => { let L = 0; for (let i = 1; i < m.length; i++) L += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]); return L; });
  const T0 = performance.now(), per = j => 450 + lens[j] * 0.9, starts = []; let acc = 0; ref.m.forEach((_, j) => { starts.push(acc); acc += per(j) + 120; });
  const frame = now => {
    if (my !== S.anim) return; const t = now - T0;
    g.clearRect(0, 0, size, size); drawGrid(g, size);
    withModel(g, size, () => {
      ref.m.forEach((m, j) => {
        const p = Math.max(0, Math.min(1, (t - starts[j]) / per(j))); if (p <= 0) return;
        g.save(); g.clip(paths[j]); g.strokeStyle = cssVar("--rosso", "#c33"); g.lineWidth = 220; g.lineCap = "round"; g.lineJoin = "round"; g.setLineDash([lens[j] + 400, lens[j] + 400]); g.lineDashOffset = (lens[j] + 400) - p * (lens[j] + 400);
        g.beginPath(); m.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore();
      });
    });
    g.save(); g.font = "bold " + Math.round(size * 0.04) + "px system-ui,sans-serif"; g.fillStyle = cssVar("--inchiostro", "#222"); g.textAlign = "center";
    ref.m.forEach((m, j) => { if (t >= starts[j]) { const [x, y] = refToUnit(m[0]); g.fillText(String(j + 1), x * size - size * 0.03, y * size - size * 0.02); } }); g.restore();
    if (t < acc + 600) requestAnimationFrame(frame); else redraw();
  };
  requestAnimationFrame(frame);
}

/* =================== interfaccia =================== */
function pickList() {
  const q = (S.q || "").toLowerCase();
  const list = (S.idx || []).filter(e => (S.lv === "all" || e.l === S.lv) && (!q || e.c === S.q || (e.p || "").toLowerCase().includes(q) || meaningOf(e).toLowerCase().includes(q)));
  if (S.sort === "strokes") list.sort((x, y) => x.n - y.n || LV_KEYS.indexOf(x.l) - LV_KEYS.indexOf(y.l) || x.o - y.o);
  return list;                                    // l'indice è già ordinato per livello e posizione nelle unità tematiche
}
const unitName = u => (S.ctx && S.ctx.unitName ? S.ctx.unitName(u) : u);
const curLang = () => (window.I18n && I18n.lang) || "it";
function meaningOf(e) { const m = { it: e.mi, en: e.me, es: e.ms }; return m[curLang()] || e.me || e.mi || e.ms || ""; }
function drawPicker() {
  const box = S.els.grid; if (!box) return; box.replaceChildren();
  const list = pickList(); S.els.count.textContent = T("{n} caratteri", { n: list.length });
  let last = null;
  for (const e of list) {
    if (S.sort !== "strokes") { const key = e.l + "|" + e.u; if (key !== last) { last = key; box.append(h("h5", { class: "cl-unit" }, (S.lv === "all" ? LV_NAME[e.l] + " · " : "") + unitName(e.u))); } }
    const p = pOf(e.c), pct = Math.round((p.f + p.a + p.o) / 3), done = isDone(p), due = isDue(p);
    box.append(h("button", { type: "button", class: "cl-ch" + (done ? " done" : "") + (due ? " due" : "") + (e.c === S.cur ? " sel" : ""), "data-c": e.c, title: (e.p || "") + " · " + T("{n} tratti", { n: e.n }) + (due ? " · " + T("Da ripassare") : ""), "aria-pressed": String(e.c === S.cur), onclick: () => select(e.c) },
      h("span", { class: "cl-h" }, e.c), h("span", { class: "cl-p" }, e.p || ""), h("i", { class: "cl-bar", style: "width:" + (done ? 100 : pct) + "%" })));
  }
}
function drawLvChips() {
  const bar = S.els.lvs; bar.replaceChildren();
  for (const k of ["all", ...LV_KEYS]) bar.append(h("button", { type: "button", class: "cl-lv", "aria-pressed": String(S.lv === k), onclick: () => { S.lv = k; drawLvChips(); drawPicker(); } }, k === "all" ? T("Tutti") : LV_NAME[k]));
}
function drawSortChips() {
  const bar = S.els.sortBar; bar.replaceChildren();
  for (const [k, l] of [["theme", T("Per argomento")], ["strokes", T("Per numero di tratti")]]) bar.append(h("button", { type: "button", class: "cl-lv", "aria-pressed": String(S.sort === k), onclick: () => { S.sort = k; drawSortChips(); drawPicker(); } }, l));
}
function meterRow(label, val, hint) {
  return h("div", { class: "cl-m" }, h("div", { class: "cl-mh" }, h("span", null, label), h("b", null, val == null ? "—" : String(val))),
    h("div", { class: "cl-mb", role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": val == null ? null : val, "aria-label": label }, h("i", { class: val >= 100 ? "full" : "", style: "width:" + (val == null ? 0 : val) + "%" })), hint ? h("small", null, hint) : null);
}
const nextRev = p => daysTo(p) <= 1 ? T("Prossimo ripasso domani.") : T("Prossimo ripasso tra {n} giorni.", { n: daysTo(p) });
function drawResult() {
  const box = S.els.res; box.replaceChildren(); const r = S.res; if (!r) return;
  const bestP = pOf(S.cur);
  box.append(h("h4", null, T("Risultato")),
    meterRow(T("Correttezza della forma"), r.form, r.fromImage ? T("Stima dall’immagine.") : null),
    meterRow(T("Attinenza al carattere"), r.att), meterRow(T("Ordine dei tratti"), r.ord, r.ord == null ? T("Da un file non si può verificare: scrivi sul sito per questo parametro.") : null));
  const notes = h("ul", { class: "cl-notes" });
  for (const n of r.notes) notes.append(h("li", null, n)); box.append(notes);
  box.append(h("p", { class: "cl-best" }, T("Migliori punteggi su questo carattere: forma {f}, attinenza {a}, ordine {o}.", { f: bestP.f, a: bestP.a, o: bestP.o })));
  if (isDone(bestP)) box.append(h("p", { class: "cl-done", role: "status" }, "✓ " + T("Carattere acquisito!") + (isDue(bestP) ? "" : " " + nextRev(bestP))));
  else box.append(h("p", { class: "cl-best" }, T("Prove perfette: {g} su {n}, di cui a memoria: {m} su {k}.", { g: Math.min(bestP.g || 0, GOAL), n: GOAL, m: Math.min(bestP.m || 0, MEM_MIN), k: MEM_MIN })));
  if (r.review === "needmem") box.append(h("p", { class: "cl-note", role: "status" }, T("Per il ripasso serve una prova perfetta scritta a memoria, senza guardare il modello.")));
  if (r.review === "ok") box.append(h("p", { class: "cl-done", role: "status" }, "✓ " + T("Ripasso superato!") + " " + nextRev(bestP)));
}
function notesFor(r) {
  const n = []; if (r.fromImage) { n.push(r.att >= 100 && r.form >= 100 ? T("Forma e somiglianza perfette.") : r.att < 40 ? T("Il disegno non somiglia a questo carattere: controlla di aver scelto quello giusto.") : T("Prova a scrivere più ordinato e con tratti più chiari.")); return n; }
  const miss = r.per.filter(x => x.status === "missing").map(x => x.j + 1), rev = r.per.filter(x => x.status === "reversed").map(x => x.j + 1), rough = r.per.filter(x => x.status === "rough").map(x => x.j + 1);
  if (miss.length) n.push(T("Tratti mancanti o troppo lontani dal modello: {l}.", { l: miss.join(", ") }));
  if (r.extra) n.push(T("Tratti in più: {n}.", { n: r.extra }));
  if (rev.length) n.push(T("Direzione sbagliata nei tratti: {l} (guarda l’animazione per il verso giusto).", { l: rev.join(", ") }));
  if (rough.length) n.push(T("Forma da migliorare nei tratti: {l}.", { l: rough.join(", ") }));
  if (r.ord < 100 && r.outOfOrder.length) n.push(T("Ordine: i tratti scritti in posizione {a} andavano scritti in posizione {b}.", { a: r.outOfOrder.map(x => x.user + 1).join(", "), b: r.outOfOrder.map(x => x.expected + 1).join(", ") }));
  if (!n.length) n.push(T("Ottimo: tratti, forma e ordine corretti."));
  return n;
}
function colorsFor(r) { const ink = ["#2e9e5b", "#d99a1e", "#d23b3b"], c = Array(S.strokes.length).fill(ink[2]); for (const p of r.per) if (p.user >= 0) c[p.user] = p.status === "ok" ? ink[0] : p.score >= 50 ? ink[1] : ink[2]; return c; }

function promptOf(e) {                         // parola con il carattere da scrivere nascosto, pinyin e significato nella lingua scelta
  if (!e) return null; const w = (e.w || e.c).split("").map(c => c === e.c ? "＿" : c).join("");
  return { word: w, wp: e.wp || e.p || "", mean: meaningOf(e) };
}
function drawPrompt() {
  const E = S.els, e = S.byCh.get(S.cur); if (!E.prompt) return; E.prompt.replaceChildren(); const pr = promptOf(e); if (!pr) return;
  const p = pOf(S.cur), hidden = S.recall && !S.res;
  E.title.textContent = hidden ? "？" : S.cur;
  E.prompt.append(h("span", { class: "cl-pw" }, pr.word), h("span", { class: "cl-pp" }, (e.p && e.p !== pr.wp ? e.p + " · " : "") + pr.wp), pr.mean ? h("span", { class: "cl-pm" }, pr.mean) : null);
  if (isDue(p)) E.prompt.append(h("span", { class: "cl-pdue" }, T("Ripasso: scrivilo a memoria.")));
}
function setRecall(on) {
  S.recall = on; S.peeked = false; S.showModel = !on; const E = S.els;
  E.mCopy.setAttribute("aria-pressed", String(!on)); E.mRecall.setAttribute("aria-pressed", String(on)); E.model.setAttribute("aria-pressed", String(S.showModel)); E.model.textContent = on ? T("Mostra il modello") : T("Modello");
  drawPrompt(); redraw();
}
function nextExercise() {                       // prima i ripassi, poi i caratteri non ancora acquisiti nell'elenco corrente
  const list = pickList(), P = prog(); const due = list.filter(e => isDue(pOf(e.c)) && e.c !== S.cur), todo = list.filter(e => !isDone(pOf(e.c)) && e.c !== S.cur);
  const pick = (due.length ? due : todo.length ? todo : list.filter(e => e.c !== S.cur))[0]; if (pick) select(pick.c, true);
}
async function select(ch, forceRecall) {
  S.cur = ch; S.strokes = []; S.live = null; S.res = null; S.anim++; const e = S.byCh.get(ch); drawPicker();
  S.els.sub.textContent = e ? (e.p ? e.p + " · " : "") + T("{n} tratti", { n: e.n }) : ""; S.els.title.textContent = "…";
  S.els.msg.textContent = T("Carico il modello…"); S.els.msg.hidden = false; S.els.work.hidden = false;
  try { await loadRef(ch); S.els.msg.hidden = true; } catch (er) { S.els.msg.textContent = T("Dati del carattere non disponibili."); return; }
  const p = pOf(ch); setRecall(forceRecall || isDue(p) ? true : S.recall);   // un ripasso si fa sempre a memoria
  drawResult(); redraw(); S.els.badge.hidden = !isDone(p);
  if (window.innerWidth <= 820 && S.els.title) S.els.title.scrollIntoView({ block: "start" });   // layout a colonna singola: porta l'area di scrittura in vista
}
function pos(ev) { const r = S.els.cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))]; }
function bindCanvas(cv) {
  cv.addEventListener("pointerdown", ev => { if (S.mode !== "draw" || !S.cur || (ev.pointerType === "mouse" && ev.button !== 0)) return; ev.preventDefault(); cv.setPointerCapture(ev.pointerId); S.anim++; if (S.res) { S.res = null; drawResult(); drawPrompt(); } S.live = [pos(ev)]; redraw(); });
  cv.addEventListener("pointermove", ev => { if (!S.live) return; ev.preventDefault(); const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; for (const e of (evs.length ? evs : [ev])) { const p = pos(e), l = S.live[S.live.length - 1]; if (dist(p, l) > 0.004) S.live.push(p); } redraw(); });
  const end = ev => { if (!S.live) return; if (S.live.length === 1) S.live.push([S.live[0][0] + 0.002, S.live[0][1]]); S.strokes.push(S.live); S.live = null; redraw(); updateButtons(); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", e => e.preventDefault());
}
function updateButtons() { const E = S.els; E.undo.disabled = !S.strokes.length; E.clear.disabled = !S.strokes.length; E.eval.disabled = !S.strokes.length || S.busy; }
async function evaluateDrawn() {
  if (!S.cur || !S.strokes.length) return; const ref = await loadRef(S.cur), r = evalStrokes(S.strokes, ref); r.notes = notesFor(r);
  const out = record(S.cur, r, { recall: S.recall, peeked: S.peeked }); r.review = out.review; S.res = r; drawPrompt(); drawResult(); redraw({ colors: colorsFor(r), numbers: true, model: true }); S.els.badge.hidden = !isDone(out.p); drawPicker(); updateTot(); if (out.newly) S.els.res.scrollIntoView({ block: "nearest" });
}
/* ---- file ---- */
async function imageDataOf(file) {
  const doc = await FileKit.readDocument(file, { maxMB: (window.HSK_CONFIG && HSK_CONFIG.MAX_UPLOAD_MB) || 10, maxEdge: 700 });
  const cv = document.createElement("canvas"), g = cv.getContext("2d", { willReadFrequently: true });
  if (doc.kind === "image") {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(T("Immagine non leggibile."))); i.src = "data:image/jpeg;base64," + doc.b64; });
    cv.width = img.naturalWidth; cv.height = img.naturalHeight; g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);
  } else if (doc.kind === "pdf") {
    if (!window.pdfjsLib) throw new Error(T("Lettore PDF non disponibile: salva il carattere come JPG o PNG."));
    const bin = atob(doc.b64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise, page = await pdf.getPage(1), vp0 = page.getViewport({ scale: 1 }), sc = 700 / Math.max(vp0.width, vp0.height), vp = page.getViewport({ scale: sc });
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); await page.render({ canvasContext: g, viewport: vp }).promise;
  } else throw new Error(T("Per la calligrafia serve un’immagine (JPG, PNG) o un PDF con il carattere scritto a mano. TXT e DOCX contengono solo testo."));
  return { data: g.getImageData(0, 0, cv.width, cv.height), preview: cv };
}
async function onFile(file) {
  if (!file || !S.cur) return; const E = S.els; E.fileMsg.textContent = ""; E.fileMsg.className = "cl-fm";
  try {
    E.fileMsg.textContent = T("Analizzo il file…"); const ref = await loadRef(S.cur), { data, preview } = await imageDataOf(file), mask = inkMask(data.data, data.width, data.height), sk = skeletonOf(mask, data.width, data.height);
    if (!sk) { E.fileMsg.textContent = T("Non trovo il carattere nell’immagine: usa un foglio chiaro con tratti scuri ben visibili."); E.fileMsg.className = "cl-fm err"; return; }
    const r = evalImage(sk.sk, ref); r.fromImage = true; r.notes = notesFor(r); if (sk.comps > 14) r.notes.push(T("Nell’immagine vedo molti elementi separati: fotografa un solo carattere su fondo pulito.")); if (sk.ratio > 2.2 || sk.ratio < 0.4) r.notes.push(T("La forma è molto allungata: forse nel file ci sono più caratteri o un bordo."));
    const out = record(S.cur, r); S.res = r; drawResult(); E.fileMsg.textContent = ""; E.prev.replaceChildren(preview); preview.className = "cl-prev"; E.prev.hidden = false; S.els.badge.hidden = !isDone(out.p); drawPicker(); updateTot();
  } catch (er) { E.fileMsg.textContent = er.message || String(er); E.fileMsg.className = "cl-fm err"; }
}
function setMode(m) { S.mode = m; const E = S.els; E.drawPane.hidden = m !== "draw"; E.filePane.hidden = m !== "file"; E.mDraw.setAttribute("aria-pressed", String(m === "draw")); E.mFile.setAttribute("aria-pressed", String(m === "file")); }

function build() {
  const E = S.els = {}; S.root.replaceChildren();
  E.lvs = h("div", { class: "cl-lvs", role: "group", "aria-label": T("Livello") });
  E.search = h("input", { type: "search", class: "cl-q", placeholder: T("Cerca un carattere o un pinyin"), "aria-label": T("Cerca un carattere o un pinyin"), autocomplete: "off", oninput: ev => { S.q = ev.target.value.trim(); drawPicker(); } });
  E.count = h("span", { class: "cl-count" }); E.grid = h("div", { class: "cl-grid" });
  E.sortBar = h("div", { class: "cl-sort", role: "group", "aria-label": T("Ordine") });
  E.legend = h("p", { class: "cl-legend" }, h("span", { class: "cl-sw done" }), T("Acquisito"), " ", h("span", { class: "cl-sw due" }), T("Da ripassare"));
  const left = h("aside", { class: "cl-left" }, E.lvs, E.search, E.sortBar, E.count, E.legend, E.grid);
  E.title = h("div", { class: "cl-big", "aria-live": "polite" }, "—"); E.sub = h("div", { class: "cl-sub" }); E.badge = h("span", { class: "cl-badge", hidden: true }, "✓ " + T("Acquisito"));
  E.msg = h("p", { class: "cl-msg", hidden: false }, T("Scegli un carattere dall’elenco per iniziare."));
  E.cv = h("canvas", { class: "cl-cv", width: 600, height: 600, "aria-label": T("Area di scrittura"), role: "img" }); bindCanvas(E.cv);
  E.model = h("button", { type: "button", class: "btn", "aria-pressed": "true", onclick: () => {
    S.showModel = !S.showModel; E.model.setAttribute("aria-pressed", String(S.showModel));
    if (S.recall && S.showModel && !S.peeked) { S.peeked = true; if (lapse(S.cur)) { drawPicker(); updateTot(); } }   // a memoria: guardare il modello non conta come prova a memoria
    redraw(); } }, T("Modello"));
  E.play = h("button", { type: "button", class: "btn", onclick: animateModel }, "▶ " + T("Mostra l’ordine dei tratti"));
  E.undo = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { S.strokes.pop(); S.res = null; drawResult(); drawPrompt(); redraw(); updateButtons(); } }, T("Annulla tratto"));
  E.clear = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { S.strokes = []; S.res = null; drawResult(); drawPrompt(); redraw(); updateButtons(); } }, T("Cancella"));
  E.eval = h("button", { type: "button", class: "btn primary", disabled: true, onclick: evaluateDrawn }, T("Valuta"));
  E.mCopy = h("button", { type: "button", "aria-pressed": "true", onclick: () => setRecall(false) }, T("Copia dal modello")); E.mRecall = h("button", { type: "button", "aria-pressed": "false", onclick: () => setRecall(true) }, T("Scrivi a memoria"));
  E.prompt = h("div", { class: "cl-prompt" }); E.next = h("button", { type: "button", class: "btn", onclick: nextExercise }, T("Prossimo esercizio") + " →");
  E.drawPane = h("div", { class: "cl-pane" }, h("div", { class: "cl-modes seg", role: "group", "aria-label": T("Tipo di esercizio") }, E.mCopy, E.mRecall), E.prompt, h("p", { class: "hint" }, T("Scrivi il carattere con il dito, il mouse o la penna, tratto per tratto e nell’ordine giusto, poi premi Valuta.")), E.cv, h("div", { class: "cl-tools" }, E.model, E.play, E.undo, E.clear, E.eval, E.next));
  E.file = h("input", { type: "file", id: "clFile", accept: ".jpg,.jpeg,.png,.pdf", onchange: ev => { onFile(ev.target.files[0]); ev.target.value = ""; } }); E.fileMsg = h("p", { class: "cl-fm", role: "status" }); E.prev = h("div", { class: "cl-prevw", hidden: true });
  E.filePane = h("div", { class: "cl-pane", hidden: true }, h("p", { class: "hint" }, T("Carica una foto o una scansione (JPG, PNG, PDF) con UN solo carattere scritto a mano, scuro su fondo chiaro. Da un file si valutano forma e attinenza; l’ordine dei tratti richiede la scrittura sul sito.")), h("label", { class: "btn", for: "clFile" }, T("Scegli un file")), E.file, E.fileMsg, E.prev);
  E.mDraw = h("button", { type: "button", "aria-pressed": "true", onclick: () => setMode("draw") }, T("Scrivi qui")); E.mFile = h("button", { type: "button", "aria-pressed": "false", onclick: () => setMode("file") }, T("Carica un file"));
  E.res = h("div", { class: "cl-res", "aria-live": "polite" });
  E.work = h("div", { class: "cl-work", hidden: true }, h("div", { class: "cl-modes seg", role: "group" }, E.mDraw, E.mFile), E.drawPane, E.filePane, E.res);
  const right = h("section", { class: "cl-right" }, h("div", { class: "cl-head" }, E.title, h("div", null, E.sub, E.badge)), E.msg, E.work);
  S.root.append(h("h2", null, T("Calligrafia")), h("p", { class: "hint cl-intro" }, T("Esercitati a scrivere i caratteri, copiandoli dal modello o a memoria partendo da pinyin e significato. Dopo 3 prove perfette (forma, attinenza e ordine a 100), di cui una a memoria, il carattere è acquisito; poi tornerà da ripassare dopo 1, 3, 7, 14, 30 e 60 giorni.")),
    h("p", { class: "cl-tot", id: "clTot" }), h("div", { class: "cl-cols" }, left, right));
  drawLvChips(); drawSortChips(); drawPicker(); updateTot();
  if (S.cur) { const c = S.cur; S.cur = null; select(c); }
}
function updateTot() { const e = document.getElementById("clTot"); if (!e || !S.idx) return; const t = totals(); e.textContent = T("Caratteri acquisiti: {n} su {t}.", { n: t.done, t: S.idx.length }) + (t.due ? " " + T("Da ripassare: {n}.", { n: t.due }) : ""); }

window.Calli = {
  mount(root, ctx) { S.root = root; S.ctx = ctx; },
  async show() {
    if (!S.root) return; if (!S.els.grid) S.root.replaceChildren(h("p", { class: "cl-msg" }, T("Carico i caratteri…")));
    try { await loadIdx(); } catch (e) { S.root.replaceChildren(h("h2", null, T("Calligrafia")), h("p", { class: "cl-msg err" }, T("Elenco dei caratteri non disponibile."))); return; }
    const lv = (S.ctx && S.ctx.getLevel ? S.ctx.getLevel() : "hsk1").replace("hsk", "");
    const k = LV_KEYS.includes(lv) ? lv : "1";
    if (!S.els.grid) { if (!S.lv || S.lastLv !== lv) S.lv = k; S.lastLv = lv; build(); }
    else { updateTot(); if (S.lastLv !== lv) { S.lastLv = lv; S.lv = k; drawLvChips(); drawPicker(); } }
  },
  refresh() { S.els = {}; this.show(); },
  hide() { S.anim++; },
  _t: { resample, normPolys, evalStrokes, evalImage, inkMask, skeletonOf, rasterLines, chamferF, refPolys, thin, N, strokeScore, S }
};
})();
