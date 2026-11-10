/* Forma d'onda dell'audio registrato/caricato, parole cliccabili e salvataggio.  window.WaveView
 *  - Tutto in locale (canvas + Web Audio): nessun servizio esterno.
 *  - Le parole della trascrizione sono distribuite sulla parte "parlata" dell'audio in proporzione ai caratteri:
 *    l'associazione è APPROSSIMATIVA (le Web Speech API non danno i tempi delle parole). Cliccando una parola si riascolta da lì.
 *  - Salvataggio: .wav (PCM 16 bit mono 16 kHz) e file originale (webm/m4a/…). MP3 solo se imposti MP3_LIB in config.js (vedi README).
 */
(function () {
"use strict";
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const CFG = Object.assign({ MP3_LIB: "" }, window.HSK_CONFIG || {});
function h(tag, cls, text, attrs) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };
const HAN = /\p{Script=Han}/u;

// intervallo parlato: prime/ultime finestre di 20 ms sopra una soglia relativa (almeno 3 di fila, per ignorare i colpi)
function speechSpan(x, rate) {
  const fr = Math.max(1, Math.round(rate * 0.02)), n = Math.floor(x.length / fr), rms = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let j = 0; j < fr; j++) { const v = x[i * fr + j]; a += v * v; } rms[i] = Math.sqrt(a / fr); }
  const sorted = Array.from(rms).sort((a, b) => a - b), p95 = sorted[Math.floor(n * 0.95)] || 0, th = Math.max(0.012, p95 * 0.12);
  const on = i => rms[i] > th, run = (i, d) => on(i) && on(i + d) && on(i + 2 * d);
  let a = 0, b = n - 1; while (a < n - 2 && !run(a, 1)) a++; while (b > 2 && !run(b, -1)) b--;
  if (b <= a) { a = 0; b = n - 1; }
  return [a * fr / rate, Math.min(x.length / rate, (b + 1) * fr / rate)];
}
function wordsOf(text) {
  const out = []; let seg = null; try { seg = new Intl.Segmenter("zh", { granularity: "word" }); } catch (e) {}
  if (seg) for (const p of seg.segment(text)) { if (p.isWordLike && HAN.test(p.segment)) out.push(p.segment); }
  else for (const ch of text) if (HAN.test(ch)) out.push(ch);
  return out;
}
function timeWords(words, a, b) {
  const tot = words.reduce((n, w) => n + [...w].length, 0) || 1; let acc = 0;
  return words.map(w => { const l = [...w].length, t0 = a + (b - a) * acc / tot; acc += l; return { w, t0, t1: a + (b - a) * acc / tot }; });
}
function download(blob, name) { const u = URL.createObjectURL(blob), a = h("a"); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()); };
const extOf = t => /webm/.test(t) ? "webm" : /mp4|m4a|aac/.test(t) ? "m4a" : /ogg|opus/.test(t) ? "ogg" : /mpeg|mp3/.test(t) ? "mp3" : /flac/.test(t) ? "flac" : /wav/.test(t) ? "wav" : "audio";
function loadScript(src) { return new Promise((ok, ko) => { const s = h("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("lib")); document.head.append(s); }); }
async function toMp3(samples, rate) {
  if (!window.lamejs) await loadScript(CFG.MP3_LIB);
  const enc = new lamejs.Mp3Encoder(1, rate, 96), pcm = new Int16Array(samples.length), out = [];
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) out.push(new Uint8Array(b)); }
  const e = enc.flush(); if (e.length) out.push(new Uint8Array(e)); return new Blob(out, { type: "audio/mpeg" });
}

function mount(root, o) {
  const audio = o.audio, st = { blob: null, pcm: null, dur: 0, span: [0, 0], peaks: null, words: [], cur: -1, tok: 0 };
  root.replaceChildren(); root.hidden = true;
  const canvas = h("canvas", "wv-canvas", null, { tabindex: "0", role: "slider", "aria-label": tx("Forma d’onda: clicca per spostarti nell’audio"), "aria-valuemin": "0" });
  const play = h("button", "btn", "▶", { type: "button", "aria-label": tx("Riproduci / pausa") }), time = h("span", "wv-time", "0:00");
  const chips = h("div", "wv-words", null, { "aria-label": tx("Parole della trascrizione: clicca per riascoltare da lì") });
  const note = h("p", "hint", tx("L’associazione tra parole e audio è approssimativa: i tempi sono stimati dalla lunghezza delle parole, non rilevati dal riconoscimento vocale."));
  const wavBtn = h("button", "btn", "💾 " + tx("Salva .wav"), { type: "button" }), origBtn = h("button", "btn", "💾", { type: "button" }), mp3Btn = h("button", "btn", "💾 " + tx("Salva .mp3"), { type: "button" });
  const msg = h("p", "wr-msg", "", { role: "status" }); msg.hidden = true;
  const say = (t, k) => { msg.className = "wr-msg" + (k ? " " + k : ""); msg.textContent = t || ""; msg.hidden = !t; };
  mp3Btn.hidden = !CFG.MP3_LIB;
  root.append(h("div", "wv-head", null), canvas, h("div", "acts wr-left", null), chips, note, msg);
  root.children[0].append(h("b", null, tx("Forma d’onda")), " ", time);
  root.children[2].append(play, wavBtn, origBtn, mp3Btn);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || undefined;

  function draw() {
    if (!st.peaks) return; const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = 96;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = H * dpr; }
    const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const ink = css("--inchiostro") || "#333", acc = css("--rosso") || "#c0392b", line = css("--linea") || "#ccc", n = st.peaks.length / 2;
    const x0 = st.span[0] / st.dur * W, x1 = st.span[1] / st.dur * W;
    g.fillStyle = acc; g.globalAlpha = .09; g.fillRect(x0, 0, Math.max(1, x1 - x0), H); g.globalAlpha = 1;
    g.strokeStyle = line; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.fillStyle = ink; g.globalAlpha = .75;
    for (let i = 0; i < n; i++) { const x = i / n * W, lo = st.peaks[2 * i], hi = st.peaks[2 * i + 1]; g.fillRect(x, H / 2 - hi * H / 2, Math.max(1, W / n - .5), Math.max(1, (hi - lo) * H / 2)); }
    g.globalAlpha = 1;
    g.fillStyle = acc; for (const w of st.words) g.fillRect(w.t0 / st.dur * W, H - 6, 1.5, 6);          // tacche all'inizio di ogni parola
    const t = Math.min(st.dur, audio.currentTime || 0), px = t / st.dur * W; g.fillRect(px - 1, 0, 2, H);
    time.textContent = fmt(t) + " / " + fmt(st.dur); canvas.setAttribute("aria-valuemax", String(Math.round(st.dur))); canvas.setAttribute("aria-valuenow", String(Math.round(t)));
    let k = -1; for (let i = 0; i < st.words.length; i++) if (t >= st.words[i].t0 && t < st.words[i].t1) { k = i; break; }
    if (k !== st.cur) { const ch = chips.children; if (ch[st.cur]) ch[st.cur].classList.remove("cur"); if (ch[k]) ch[k].classList.add("cur"); st.cur = k; }
  }
  let raf = 0; const loop = () => { draw(); raf = audio.paused ? 0 : requestAnimationFrame(loop); };
  audio.addEventListener("play", () => { play.textContent = "⏸"; cancelAnimationFrame(raf); loop(); });
  const stopped = () => { play.textContent = "▶"; draw(); };
  audio.addEventListener("pause", stopped); audio.addEventListener("ended", stopped); audio.addEventListener("timeupdate", () => { if (audio.paused) draw(); });
  play.addEventListener("click", () => { if (audio.paused) { if (audio.ended || audio.currentTime >= st.dur - .05) audio.currentTime = 0; audio.play().catch(() => {}); } else audio.pause(); });
  const seekTo = t => { try { audio.currentTime = Math.max(0, Math.min(st.dur, t)); } catch (e) {} draw(); };
  let dragging = false; const at = e => { const r = canvas.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width * st.dur); };
  canvas.addEventListener("pointerdown", e => { dragging = true; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} at(e); });
  canvas.addEventListener("pointermove", e => { if (dragging) at(e); }); canvas.addEventListener("pointerup", () => { dragging = false; }); canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("keydown", e => { const d = e.key === "ArrowRight" ? 2 : e.key === "ArrowLeft" ? -2 : 0; if (d) { e.preventDefault(); seekTo((audio.currentTime || 0) + d); } else if (e.key === " " || e.key === "Enter") { e.preventDefault(); play.click(); } });
  window.addEventListener("resize", () => { if (!root.hidden) { st.peaks && buildPeaks(); draw(); } });

  function buildPeaks() {
    const n = Math.max(60, Math.min(600, Math.floor(canvas.clientWidth / 3) || 200)), x = st.pcm, per = Math.max(1, Math.floor(x.length / n)); st.peaks = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) { let lo = 0, hi = 0; for (let j = i * per, e = Math.min(x.length, j + per); j < e; j++) { const v = x[j]; if (v < lo) lo = v; if (v > hi) hi = v; } st.peaks[2 * i] = lo; st.peaks[2 * i + 1] = hi; }
    const m = Math.max(.05, ...st.peaks.map(Math.abs)); for (let i = 0; i < st.peaks.length; i++) st.peaks[i] /= m;
  }
  function buildWords() {
    chips.replaceChildren(); st.cur = -1; const text = o.getText ? o.getText() : "";
    st.words = st.pcm ? timeWords(wordsOf(text), st.span[0], st.span[1]) : [];
    for (const w of st.words) { const b = h("button", "wv-chip zh", w.w, { type: "button", lang: "zh-Hans" }); b.addEventListener("click", () => { seekTo(w.t0); audio.currentTime = w.t0; audio.play().catch(() => {}); const stop = () => { if (audio.currentTime >= w.t1 - .02) { audio.pause(); audio.removeEventListener("timeupdate", stop); } }; audio.addEventListener("timeupdate", stop); }); chips.append(b); }
    note.hidden = !st.words.length; draw();
  }
  async function setBlob(blob) {
    const my = ++st.tok; st.blob = blob; st.pcm = null; st.peaks = null; root.hidden = !blob; if (!blob) return;
    origBtn.textContent = "💾 " + tx("Salva originale (.{e})", { e: extOf(blob.type || "") });
    try {
      const d = await FileKit.decodeBlob(blob); if (my !== st.tok) return;
      st.pcm = d.samples; st.dur = d.duration; st.span = speechSpan(d.samples, d.rate); root.hidden = false; canvas.hidden = false; say("");
      buildPeaks(); buildWords();
    } catch (e) { if (my !== st.tok) return; canvas.hidden = true; chips.replaceChildren(); st.words = []; note.hidden = true; say(tx("Il browser non riesce a disegnare la forma d’onda di questo audio, ma puoi riascoltarlo e salvarlo."), "warn"); wavBtn.disabled = true; return; }
    wavBtn.disabled = false;
  }
  wavBtn.addEventListener("click", () => { if (st.pcm) download(FileKit._t.wavOf(st.pcm, 16000), "hsk-parlato-" + stamp() + ".wav"); });
  origBtn.addEventListener("click", () => { if (st.blob) download(st.blob, "hsk-parlato-" + stamp() + "." + extOf(st.blob.type || "")); });
  mp3Btn.addEventListener("click", async () => { if (!st.pcm) return; mp3Btn.disabled = true; say(tx("Creo l’MP3…")); try { download(await toMp3(st.pcm, 16000), "hsk-parlato-" + stamp() + ".mp3"); say(""); } catch (e) { say(tx("Non riesco a creare l’MP3 (libreria non trovata). Salva come .wav."), "bad"); } finally { mp3Btn.disabled = false; } });
  return { setBlob, refreshWords: buildWords, destroy() { cancelAnimationFrame(raf); root.replaceChildren(); }, _st: st };
}
window.WaveView = { mount, _t: { speechSpan, wordsOf, timeWords } };
})();
