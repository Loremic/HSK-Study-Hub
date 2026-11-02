// Configurazione del sito. Tutto ciò che qui è pubblico: NON inserire mai chiavi API in questo file.
window.HSK_CONFIG = {
  // URL del proxy AI (Cloudflare Worker in ../worker). Lascia vuoto per usare solo l'analisi locale.
  // Esempio: "https://hsk-ai.tuo-account.workers.dev/"
  AI_ENDPOINT: "",
  // Rilevatore opzionale di testo scritto da AI (vedi detector.js). Spento di default: è solo un indizio, non una prova.
  // Crediti e social (credits.js). Lascia vuoto ciò che non vuoi mostrare; i link devono essere https.
  CREDITS: { name: "Lorenzo Miceli", links: { instagram: "https://www.instagram.com/lor3mic?mdxt=MWVnZXNxenk1eXpyZw%3D%3D&utm_source=qr", tiktok: "", youtube: "" } },
  AI_DETECTOR: { enabled: false, providers: ["local"], minChars: 40 }
};
