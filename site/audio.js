/* AudioKit: riproduce un file registrato se esiste, altrimenti la sintesi vocale del browser.
 *  - site/audio/manifest.json elenca i file disponibili: { "syllables/ma3": "syllables/ma3.mp3", "prompts/hsk1-s-repeat-001": "prompts/hsk1-s-repeat-001.mp3" }
 *  - Chiavi: "syllables/<pinyin con numero di tono>", "prompts/<id traccia di parlato>", "models/<id>" (risposta modello).
 *  - Se il manifest è vuoto o il file non c'è, si usa SUBITO la voce del browser (dentro il gesto dell'utente: niente blocchi su Safari/iOS).
 * Uso: AudioKit.play(chiave, testoCinese, speakFn) */
(function () {
"use strict";
let manifest = {}, ready = false, cur = null;
fetch("audio/manifest.json").then(r => (r.ok ? r.json() : {})).then(m => { manifest = (m && typeof m === "object") ? m : {}; }).catch(() => {}).finally(() => { ready = true; });
const has = k => Object.prototype.hasOwnProperty.call(manifest, k) && /^[\w\-./]+\.(mp3|m4a|ogg|wav|webm)$/i.test(manifest[k]);
function stop() { try { if (cur) { cur.pause(); cur = null; } if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} }
function play(key, text, speakFn) {
  const say = () => { if (speakFn) speakFn(text); };
  if (!key || !has(key)) { say(); return "tts"; }
  try {
    if (cur) cur.pause();
    const a = new Audio("audio/" + manifest[key]); cur = a;
    a.addEventListener("error", say, { once: true });
    const p = a.play(); if (p && p.catch) p.catch(say);
    return "file";
  } catch (e) { say(); return "tts"; }
}
window.AudioKit = { play, stop, has, get ready() { return ready; }, manifest: () => manifest };
})();
