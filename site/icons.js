/* Sostituisce in automatico le emoji/pittogrammi di testo con icone vettoriali CSS (icons.css), così l'interfaccia
   resta uniforme e minimalista e le icone seguono il colore del tema. Agisce sul testo già presente e su quello inserito dopo. */
(function () {
"use strict";
const MAP = { "🔊": "sound", "💡": "bulb", "💾": "save", "⏱": "timer", "⏸": "pause", "⏮": "prev", "⏭": "next", "⏹": "stop", "⏺": "rec", "▶": "play", "⚙": "gear", "✕": "close" };
const RX = /(🔊|💡|💾|⏱|⏸|⏮|⏭|⏹|⏺|▶|⚙|✕)️?/;
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|OPTION|INPUT|TITLE)$/;
function fix(node) {
  if (node.nodeType === 3) {
    if (!node.parentNode || !RX.test(node.nodeValue) || SKIP.test(node.parentNode.nodeName)) return;
    const frag = document.createDocumentFragment();
    node.nodeValue.split(new RegExp(RX.source, "g")).forEach((part, i) => {
      if (i % 2) { const s = document.createElement("span"); s.className = "ic ic-" + MAP[part]; s.setAttribute("aria-hidden", "true"); frag.append(s); }
      else if (part) frag.append(part);
    });
    node.replaceWith(frag);
  } else if (node.nodeType === 1 && !SKIP.test(node.nodeName)) {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), list = [];
    while (w.nextNode()) if (RX.test(w.currentNode.nodeValue)) list.push(w.currentNode);
    list.forEach(fix);
  }
}
const obs = new MutationObserver(ms => ms.forEach(m => {
  if (m.type === "characterData") fix(m.target); else m.addedNodes.forEach(fix);
}));
function start() { fix(document.body); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); }
document.body ? start() : document.addEventListener("DOMContentLoaded", start);
window.Icons = { fix };
})();
