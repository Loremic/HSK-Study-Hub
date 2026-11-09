// Configurazione del sito. Tutto ciò che qui è pubblico: NON inserire mai chiavi API in questo file.
window.HSK_CONFIG = {
  // URL del proxy AI (Cloudflare Worker in ../worker). Lascia vuoto per usare solo l'analisi locale.
  // Esempio: "https://hsk-ai.tuo-account.workers.dev/"
  AI_ENDPOINT: "",
  // Crediti e social (credits.js). Lascia vuoto ciò che non vuoi mostrare; i link devono essere https.
  CREDITS: { name: "Lorenzo Miceli", brand: "FreeDeas", links: { instagram: "", tiktok: "", youtube: "" } },
  // Audio: nessuna opzione. Le registrazioni opzionali si dichiarano in site/audio/manifest.json (vedi site/audio/README.md).
  // Rilevatore opzionale di testo scritto da AI (vedi detector.js). Spento di default: è solo un indizio, non una prova.
  // enabled: true (anche "true"/"on" vanno bene). Il rilevatore gira in locale; se non compare, apri la console del browser:
  // c'è una riga [AIDetector] che dice perché (e AIDetector.status() la ripete). Sotto "minChars" caratteri cinesi mostra solo un avviso.
  AI_DETECTOR: { enabled: true, providers: ["local"], minChars: 25 },
  // Sezioni attive. Parlato (anche con file audio), Lettura e Forum si spengono mettendo false.
  FEATURES: { speaking: true, forum: true, reading: true },
  // Forum / Community. endpoint vuoto = usa lo stesso worker di AI_ENDPOINT. Se il worker non ha il database (o non c'è nessun endpoint)
  // il forum parte in MODALITÀ LOCALE: i messaggi restano solo su questo dispositivo (utile per provare). Vedi README.
  FORUM: { endpoint: "" }
};
