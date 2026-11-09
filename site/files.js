/* Lettura sicura dei file caricati.  window.FileKit
 *
 * Documenti ammessi: PDF, TXT, DOCX, JPEG, PNG.   Audio ammessi: MP3, M4A, OGG, FLAC (e WAV/WEBM/AAC).
 * Ogni file viene controllato PRIMA di usarlo: estensione ammessa, dimensione, contenuto reale (firma "magic bytes", non solo il nome),
 * e per il DOCX anche la dimensione del contenuto decompresso (contro i "zip bomb"). Tutto avviene nel browser: il file non viene
 * inviato a nessuno, salvo i casi in cui l'utente chiede esplicitamente la lettura/trascrizione tramite il servizio AI.
 *
 *   await FileKit.readDocument(file, { maxMB, maxEdge })  ->
 *        { kind:"text",  text, name }
 *        { kind:"pdf",   text|"" , b64, name }       (text vuoto = PDF scansionato: serve la lettura AI)
 *        { kind:"image", b64 (JPEG), preview, name }
 *   await FileKit.prepareAudio(file, { maxMB, maxSec }) -> { blob, duration, truncated, converted, name }
 * Gli errori sono Error con messaggio già pronto per l'utente (tradotto).
 */
(function () {
"use strict";
const tx = (k, v) => window.I18n ? I18n.t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, n) => v && n in v ? v[n] : m);
const DOC_EXT = [".txt", ".pdf", ".docx", ".jpg", ".jpeg", ".png"];
const AUDIO_EXT = [".mp3", ".m4a", ".ogg", ".oga", ".flac", ".wav", ".webm", ".aac"];
const ACCEPT = DOC_EXT.join(",") + ",image/jpeg,image/png,application/pdf,text/plain";
const AUDIO_ACCEPT = AUDIO_EXT.join(",") + ",audio/*";
const ext = n => { const m = /\.[a-z0-9]+$/i.exec(n || ""); return m ? m[0].toLowerCase() : ""; };
const bytes = (buf, n = 16, off = 0) => new Uint8Array(buf, off, Math.min(n, Math.max(0, buf.byteLength - off)));
const startsWith = (u, sig, off = 0) => sig.every((b, i) => u[off + i] === b);
const ascii = (u, a, b) => String.fromCharCode(...u.slice(a, b));

/* ---- riconoscimento del contenuto reale */
function sniffDoc(buf) {
  const u = bytes(buf, 16);
  if (startsWith(u, [0x25, 0x50, 0x44, 0x46])) return "pdf";                    // %PDF
  if (startsWith(u, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(u, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(u, [0x50, 0x4b, 0x03, 0x04])) return "zip";                    // DOCX è uno zip
  if (startsWith(u, [0xd0, 0xcf, 0x11, 0xe0])) return "ole";                    // vecchio .doc
  const head = bytes(buf, 4096); if (head.includes(0)) return startsWith(head, [0xff, 0xfe]) || startsWith(head, [0xfe, 0xff]) ? "text" : "binary";
  return "text";
}
function sniffAudio(buf) {
  const u = bytes(buf, 16);
  if (ascii(u, 0, 4) === "OggS") return "ogg";
  if (ascii(u, 0, 4) === "fLaC") return "flac";
  if (ascii(u, 0, 4) === "RIFF" && ascii(u, 8, 12) === "WAVE") return "wav";
  if (ascii(u, 4, 8) === "ftyp") return "m4a";                                   // anche mp4/m4a/aac in contenitore MP4
  if (ascii(u, 0, 3) === "ID3" || (u[0] === 0xff && (u[1] & 0xe0) === 0xe0)) return u[1] !== undefined && (u[1] & 0x06) === 0 ? "aac" : "mp3";   // MP3 (ADTS-AAC ha layer 00)
  if (startsWith(u, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  return "unknown";
}
const AUDIO_OK = { ".mp3": ["mp3"], ".m4a": ["m4a"], ".ogg": ["ogg"], ".oga": ["ogg"], ".flac": ["flac"], ".wav": ["wav"], ".webm": ["webm"], ".aac": ["aac", "m4a", "mp3"] };
const DOC_OK = { ".txt": ["text"], ".pdf": ["pdf"], ".docx": ["zip"], ".jpg": ["jpeg"], ".jpeg": ["jpeg"], ".png": ["png"] };

/* ---- testo */
function decodeText(buf) {
  const u = bytes(buf, 4);
  if (startsWith(u, [0xff, 0xfe])) return new TextDecoder("utf-16le").decode(buf);
  if (startsWith(u, [0xfe, 0xff])) return new TextDecoder("utf-16be").decode(buf);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch (e) { try { return new TextDecoder("gb18030", { fatal: true }).decode(buf); } catch (e2) { throw new Error(tx("Non riesco a leggere la codifica del testo. Salvalo come UTF-8.")); } }       // molti .txt cinesi sono GBK
}

/* ---- DOCX: lettura minima dello zip, solo word/document.xml, con limiti */
const MAX_XML = 8 * 1048576;
async function inflateRaw(data, cap) {
  if (typeof DecompressionStream === "undefined") throw new Error(tx("Questo browser non può aprire i file Word. Salva il documento come PDF o TXT."));
  const rd = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader(); const parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > cap) { try { rd.cancel(); } catch (e) {} throw new Error(tx("Il documento Word è troppo grande o non valido.")); } parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
async function docxXml(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf); let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(tx("Il file Word non è valido."));
  const cnt = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  if (cnt > 5000) throw new Error(tx("Il file Word non è valido."));
  for (let i = 0; i < cnt; i++) {
    if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (name !== "word/document.xml") continue;
    if (flags & 1) throw new Error(tx("Il documento Word è protetto da password."));
    if (usize > MAX_XML) throw new Error(tx("Il documento Word è troppo grande o non valido."));
    if (lo + 30 > buf.byteLength || dv.getUint32(lo, true) !== 0x04034b50) throw new Error(tx("Il file Word non è valido."));
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u8.subarray(start, start + csize);
    return new TextDecoder("utf-8").decode(method === 0 ? raw : method === 8 ? await inflateRaw(raw, MAX_XML) : (() => { throw new Error(tx("Il file Word non è valido.")); })());
  }
  throw new Error(tx("Questo file non sembra un documento Word (.docx)."));
}
function xmlText(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error(tx("Il file Word non è valido."));
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", out = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    let line = ""; const walk = n => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; const t = c.localName;
      if (t === "t") line += c.textContent; else if (t === "tab") line += "\t"; else if (t === "br" || t === "cr") line += "\n"; else if (t === "del" || t === "delText") continue; else walk(c); } };
    walk(p); out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---- PDF (testo selezionabile, con pdf.js da cdnjs caricato solo quando serve) */
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = base + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js"; res(window.pdfjsLib); }; s.onerror = () => rej(new Error("pdf.js non disponibile")); document.head.append(s); });
}
async function pdfText(buf, maxPages = 10) {
  const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: buf.slice(0) }).promise; let out = "";
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) { const tc = await (await pdf.getPage(p)).getTextContent(); out += tc.items.map(i => i.str).join(" ") + "\n"; }
  return out.trim();
}

/* ---- immagini: sempre ricodificate in JPEG ridotto (toglie anche i metadati EXIF/GPS) */
async function imageToJpeg(file, maxEdge) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(tx("Immagine non leggibile."))); i.src = url; });
    const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL("image/jpeg", 0.85).split(",")[1], preview: url };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}
const b64Of = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1] || ""); f.onerror = () => rej(f.error); f.readAsDataURL(blob); });

function checkBasic(file, allowed, maxMB, hint) {
  const e = ext(file.name);
  if (e === ".doc") throw new Error(tx("I file .doc (Word vecchio formato) non sono supportati: salvalo come .docx, PDF o TXT."));
  if (!allowed.includes(e)) throw new Error(tx("Formato non supportato. Formati ammessi: {f}.", { f: hint }));
  if (!file.size) throw new Error(tx("Il file è vuoto."));
  if (file.size > maxMB * 1048576) throw new Error(tx("Il file supera {n} MB.", { n: maxMB }));
  return e;
}

async function readDocument(file, o) {
  o = Object.assign({ maxMB: 10, maxEdge: 1600 }, o || {});
  const e = checkBasic(file, DOC_EXT, o.maxMB, "PDF, TXT, DOCX, JPEG, PNG"), buf = await file.arrayBuffer(), real = sniffDoc(buf);
  if (real === "ole") throw new Error(tx("I file .doc (Word vecchio formato) non sono supportati: salvalo come .docx, PDF o TXT."));
  if (!DOC_OK[e].includes(real)) throw new Error(tx("Il contenuto del file non corrisponde all’estensione {e}: non lo apro.", { e }));
  if (real === "text") { const t = decodeText(buf).trim(); if (!t) throw new Error(tx("Il file è vuoto.")); return { kind: "text", text: t, name: file.name }; }
  if (real === "zip") { const t = xmlText(await docxXml(buf)); if (t.replace(/\s/g, "").length < 2) throw new Error(tx("Il documento Word non contiene testo. Se contiene immagini, salvale come JPG o PNG, oppure usa il PDF.")); return { kind: "text", text: t, name: file.name, docx: true }; }
  if (real === "pdf") { let t = ""; try { t = await pdfText(buf); } catch (er) { t = ""; } return { kind: "pdf", text: t.replace(/\s/g, "").length >= 5 ? t : "", b64: await b64Of(file), name: file.name }; }
  const im = await imageToJpeg(file, o.maxEdge); return { kind: "image", b64: im.b64, preview: im.preview, name: file.name };
}

/* ---- audio: decodifica nel browser e riconversione in WAV mono 16 kHz (formato unico, piccolo, accettato dal servizio di trascrizione) */
function wavOf(f32, rate) {
  const n = f32.length, out = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, f32[i])); out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([out], { type: "audio/wav" });
}
async function prepareAudio(file, o) {
  o = Object.assign({ maxMB: 30, maxSec: 120 }, o || {});
  const e = checkBasic(file, AUDIO_EXT, o.maxMB, "MP3, M4A, OGG, FLAC, WAV");
  const buf = await file.arrayBuffer(), real = sniffAudio(buf);
  if (!AUDIO_OK[e].includes(real)) throw new Error(tx("Il contenuto del file non corrisponde all’estensione {e}: non lo apro.", { e }));
  const AC = window.AudioContext || window.webkitAudioContext;
  try {
    if (!AC) throw new Error("no AudioContext");
    const ac = new AC(); let dec;
    try { dec = await ac.decodeAudioData(buf.slice(0)); } finally { try { ac.close(); } catch (er) {} }
    const dur = dec.duration, keep = Math.min(dur, o.maxSec), rate = 16000, len = Math.max(1, Math.floor(keep * rate));
    const off = new OfflineAudioContext(1, len, rate), src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start(0);
    const rendered = await off.startRendering();
    return { blob: wavOf(rendered.getChannelData(0), rate), duration: keep, truncated: dur > o.maxSec + 0.5, fullDuration: dur, converted: true, name: file.name };
  } catch (er) {
    // il browser non sa decodificare questo formato (es. OGG/FLAC su Safari): se è abbastanza piccolo lo si invia così com'è al servizio
    if (file.size <= 4 * 1048576) {
    const MT = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", wav: "audio/wav", webm: "audio/webm" };
    return { blob: file.type ? file : file.slice(0, file.size, MT[e.slice(1)] || "audio/mpeg"), duration: 0, truncated: false, converted: false, name: file.name };
    }
    throw new Error(tx("Il browser non riesce ad aprire questo file audio. Convertilo in MP3 o WAV oppure prova un altro browser."));
  }
}

window.FileKit = { ACCEPT, AUDIO_ACCEPT, DOC_EXT, AUDIO_EXT, readDocument, prepareAudio, b64Of, _t: { sniffDoc, sniffAudio, decodeText, xmlText, docxXml, wavOf } };
})();
