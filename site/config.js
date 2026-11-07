// Configurazione del sito. Tutto ciò che qui è pubblico: NON inserire mai chiavi API in questo file.
window.HSK_CONFIG = {
  // URL del proxy AI (Cloudflare Worker in ../worker). Lascia vuoto per usare solo l'analisi locale.
  // Esempio: "https://hsk-ai.tuo-account.workers.dev/"
  AI_ENDPOINT: "",
  // Crediti e social (credits.js). Lascia vuoto ciò che non vuoi mostrare; i link devono essere https.
  CREDITS: { name: "Lorenzo Miceli", brand: "FreeDeas", links: { instagram: "", tiktok: "", youtube: "" } },
  // Audio: nessuna opzione. Le registrazioni opzionali si dichiarano in site/audio/manifest.json (vedi site/audio/README.md).
  // Rilevatore opzionale di testo scritto da AI (vedi detector.js). Spento di default: è solo un indizio, non una prova.
  AI_DETECTOR: { enabled: true, providers: ["local"], minChars: 20 }
};
