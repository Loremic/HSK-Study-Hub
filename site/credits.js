/* Crediti, social e guida rapida. Tutto viene da config.js (CREDITS); se è vuoto non compaiono crediti.
 * Posizioni: UNA riga discreta nel footer della pagina + finestra "Info" (pulsante in alto) + guida "?" (pulsante in alto).
 * Le scritte sono tradotte con I18n (IT/EN/ES); a ogni cambio lingua chiama Credits.refresh(). Solo link https. */
(function () {
"use strict";
const C = (window.HSK_CONFIG && window.HSK_CONFIG.CREDITS) || {};
const tx = (k, v) => window.I18n ? I18n.t(k, v) : k;
const NETS = [["instagram", "Instagram", "community e aggiornamenti"], ["tiktok", "TikTok", "pillole di studio e caratteri"], ["youtube", "YouTube", "guide e lezioni approfondite"]];
const safe = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; } };
const links = NETS.map(([k, n, d]) => ({ k, n, d, url: safe((C.links || {})[k]) })).filter(x => x.url);
const name = String(C.name || "").trim(), brand = String(C.brand || "").trim();
const active = !!(name || links.length);
const mk = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function linkEl(x, withDesc) {
  const a = mk("a", "cr-link", x.n); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer me";
  a.setAttribute("aria-label", tx("{n} (si apre in una nuova scheda)", { n: x.n + (withDesc ? ": " + tx(x.d) : "") }));
  return a;
}
function line() {
  const d = mk("div", "cr-line");
  if (name) { d.append(tx("Creato da") + " "); d.append(mk("b", "", name)); if (brand) d.append(" · " + brand); }
  links.forEach((x, i) => { d.append(name || i ? " · " : ""); d.append(linkEl(x)); });
  if (links.length && brand) d.title = tx("Canali dell’app e dei progetti FreeDeas (aggiornamenti e sponsorizzazioni)");
  return d;
}
function dialog(id, title, build) {
  let dlg = document.getElementById(id);
  if (dlg) dlg.remove();
  dlg = mk("dialog", "cr-dlg"); dlg.id = id; dlg.setAttribute("aria-labelledby", id + "T");
  const t = mk("h2", "", title); t.id = id + "T"; dlg.append(t); build(dlg);
  const b = mk("button", "btn", tx("Chiudi")); b.type = "button"; b.onclick = () => dlg.close(); dlg.append(b);
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
}
function openInfo() {
  dialog("crDlg", tx("Informazioni"), dlg => {
    dlg.append(mk("p", "", tx("Studio HSK: flashcard, quiz a ripetizione dilazionata, pronuncia e produzione scritta per i livelli HSK.")));
    if (name) { const p = mk("p", ""); p.append(tx("Ideato e realizzato da") + " "); p.append(mk("b", "", name)); p.append(brand ? " · " + brand + "." : "."); dlg.append(p); }
    if (links.length) {
      dlg.append(mk("h3", "", tx("Seguimi")));
      const ul = mk("ul", "cr-list");
      links.forEach(x => { const li = mk("li"); li.append(linkEl(x, true), mk("span", "hint", " — " + tx(x.d))); ul.append(li); });
      dlg.append(ul);
      if (brand) dlg.append(mk("p", "", tx("Questi canali servono per gli aggiornamenti dell’app e sono anche lo spazio in cui presenterò i prossimi progetti del brand FreeDeas, incluse eventuali sponsorizzazioni.")));
    }
    dlg.append(mk("p", "hint", tx("I tuoi progressi e i tuoi testi restano solo in questo browser.")));
  });
}
const GUIDE = [
  ["Studia", "Scegli il livello a sinistra (HSK 1–6 e 7–9; quelli senza parole sono ancora segnaposto). Nella scheda Studia scorri le unità, tocca una scheda per girarla e vedere pinyin, significato ed esempio; puoi passare all’elenco o cercare una parola in hanzi, pinyin o nella tua lingua."],
  ["Pronuncia", "Ascolta i toni, le consonanti e le finali toccando i suoni; allena l’orecchio con gli esercizi e leggi le regole di pronuncia. Se non senti nulla, controlla il volume e che il dispositivo abbia una voce cinese."],
  ["Esercizi", "Parlato / Pronuncia, Scritto, Comprensione e Quiz stanno nella scheda Esercizi, in alto: fai girare il rullo (trascina, rotellina del mouse o tasti ↑ ↓) e l’esercizio al centro si apre qui sotto."],
  ["Quiz", "Scegli il tipo di quiz e cosa ripassare. Le parole sbagliate tornano più spesso (ripetizione dilazionata, metodo Leitner). Nei quiz “Ascolta” l’audio parte solo quando premi ▶ Ascolta. Con “Modalità esame” ogni traccia si può ascoltare un numero limitato di volte (1–3), come negli esami HSK. I tasti 1–4 scelgono la risposta."],
  ["Lettura", "Esercizi di comprensione in stile HSK (vero/falso, completa la frase, scelta multipla; HSK 1–3) con correzione e punteggio. Con “Dal tuo file” carichi un PDF, TXT, DOCX, JPEG o PNG, correggi il testo estratto e ottieni domande create dal testo (controllate nel browser)."],
  ["Scrittura", "Scegli una traccia (casuale, dall’archivio o libera), scrivi in hanzi o pinyin oppure carica un file (PDF, TXT, DOCX, JPEG, PNG) o la foto di un testo a mano, e premi “Valuta il testo”. Il testo torna evidenziato: rosso errori e toni, ambra caratteri sbagliati, verde punti di forza, blu alternative; tocca una parte per leggere spiegazione e forma corretta. I testi valutati si conservano nel Quaderno, dove puoi selezionarli ed eliminarli."],
  ["Parlato", "Scegli una traccia (ascolta e ripeti, leggi, rispondi, descrivi), premi Registra e parla, oppure carica un file audio (MP3, M4A, OGG, FLAC…); vedi la forma d’onda (clicca per spostarti, clicca una parola per riascoltarla) e puoi salvare l’audio in .wav; controlla la trascrizione e premi “Valuta il parlato”. La voce resta sul tuo dispositivo; l’AI valuta il testo trascritto, quindi la pronuncia è solo indicativa."],
  ["Statistiche", "Qui vedi quante parole hai visto, consolidato e quali sono le più difficili. “Azzera statistiche” cancella solo i progressi di studio, non i testi scritti."],
  ["Info", "Tutto resta nel tuo browser: puoi cambiare tema (chiaro/scuro) e lingua (italiano, inglese, spagnolo) dall’intestazione."]
];
function openHelp() {
  dialog("hlpDlg", tx("Come usare il sito"), dlg => {
    dlg.classList.add("hlp");
    const dl = mk("dl", "hlp-list");
    const FE = (window.HSK_CONFIG || {}).FEATURES || {};
    GUIDE.filter(([h]) => !(h === "Parlato" && !FE.speaking) && !(h === "Lettura" && FE.reading === false)).forEach(([h, t]) => { dl.append(mk("dt", "", h === "Info" ? tx("Informazioni") : tx(h)), mk("dd", "", tx(t))); });
    dlg.append(dl);
  });
}
let btnInfo, btnHelp, foot;
function refresh() {
  if (btnHelp) { btnHelp.setAttribute("aria-label", tx("Guida")); btnHelp.title = tx("Come usare il sito"); }
  if (btnInfo) btnInfo.textContent = tx("Info");
  if (foot) foot.replaceChildren(line());
  ["crDlg", "hlpDlg"].forEach(id => { const d = document.getElementById(id); if (d && d.open) (id === "crDlg" ? openInfo : openHelp)(); });
}
function init() {
  const hr = document.querySelector(".hright");
  if (hr) {
    btnHelp = mk("button", "btn cr-btn cr-help", "?"); btnHelp.type = "button"; btnHelp.id = "helpBtn"; btnHelp.setAttribute("aria-haspopup", "dialog"); btnHelp.onclick = openHelp;
    hr.append(btnHelp);
    if (active) { btnInfo = mk("button", "btn cr-btn", ""); btnInfo.type = "button"; btnInfo.id = "infoBtn"; btnInfo.setAttribute("aria-haspopup", "dialog"); btnInfo.onclick = openInfo; hr.append(btnInfo); }
  }
  if (active) { foot = mk("footer", "cr-foot"); document.body.append(foot); }
  refresh();
}
window.Credits = { active, line, openInfo, openHelp, refresh };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
