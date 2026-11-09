/* Filtro di moderazione dei contenuti del forum (IT / EN / ES / ZH).
 *
 * UNICA FONTE: questo file. Il worker lo importa (controllo AUTOREVOLE, lato server); tools/build_moderation.py ne genera la copia
 * per il browser (site/moderation.js), usata solo per avvisare subito l'utente: un filtro nel browser si può sempre aggirare.
 *
 * Esito: { verdict: "ok" | "review" | "block", cats: [...] }
 *   block  = pubblicazione rifiutata (insulti, odio, minacce, bestemmie, dati personali)
 *   review = il contenuto NON viene pubblicato finché un moderatore non lo approva (politica, link, spam)
 *
 * LIMITI (da dire agli utenti e al gestore): un filtro a liste dà falsi positivi (parola offensiva citata o negata) e falsi negativi
 * (giri di parole, ironia, lingue non coperte). Per questo il worker può aggiungere una seconda lettura con l'AI (FORUM_AI=1) e
 * gli utenti possono segnalare. Le liste sono un punto di partenza: vanno aggiornate in base a ciò che succede nel forum.
 */

// --- normalizzazione -----------------------------------------------------------------------------------------------------------
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "€": "e", "+": "t", "!": "i" };
const base = s => String(s).normalize("NFKD").toLowerCase().replace(/[̀-ͯ]/g, "");
export function normalize(s) {
  let t = base(s);
  t = t.replace(/(?<=[a-z])[0134578@$€+!]|[0134578@$€+](?=[a-z])/g, c => LEET[c] || c);        // 5tr0nz0, p!ttana
  t = t.replace(/\b(?:[a-z][\s.\-_*,]){2,}[a-z]\b/g, m => m.replace(/[\s.\-_*,]/g, ""));       // s t r o n z o, f.u.c.k
  return t;
}
const collapse = w => w.replace(/(.)\1+/g, "$1");           // stronzooo -> stronzo (anche le liste sono compresse allo stesso modo)
const tokensOf = t => t.split(/[^a-z]+/).filter(Boolean).map(collapse);

// --- liste (scritte in modo naturale, normalizzate all'avvio) ---------------------------------------------------------------------
// parole intere
const W = {
  insult: ["stronzo", "stronza", "stronzi", "coglione", "coglioni", "cretino", "cretina", "idiota", "idioti", "imbecille", "imbecilli", "deficiente", "deficienti", "vaffanculo", "fanculo",
    "bastardo", "bastarda", "bastardi", "puttana", "puttane", "troia", "troie", "mongoloide", "ritardato", "ritardata", "cazzone", "pezzente", "vaffa",
    "asshole", "bitch", "bastard", "dumbass", "moron", "retard", "retarded", "cunt", "motherfucker", "shithead", "dickhead", "scumbag", "douchebag", "jackass", "prick", "wanker", "twat", "kys",
    "gilipollas", "cabron", "pendejo", "pendeja", "imbecil", "estupido", "estupida", "malparido", "hijueputa", "zorra", "capullo", "subnormal", "mamon", "cabrona", "hdp", "ctm", "puto"],
  homophobic: ["frocio", "frocia", "froci", "ricchione", "ricchioni", "culattone", "culattoni", "finocchi", "fag", "fags", "faggot", "faggots", "dyke", "tranny", "maricon", "maricones", "marica", "maricas", "bollera", "bolleras", "lesbicona"],
  racist: ["nigger", "niggers", "nigga", "niggas", "chink", "chinks", "gook", "gooks", "spic", "spics", "kike", "kikes", "wetback", "paki", "coon", "negraccio", "negracci", "sudaca", "sudacas",
    "terrone", "terroni", "beaner", "raghead", "towelhead"],
  violence: ["ammazzali", "ammazzateli", "uccidiamoli", "bruciateli", "sterminiamoli", "sgozzali", "impiccateli", "violentala", "stupratela", "muori"],
};
// radici (prefisso) per varianti: stronz-, cazz-, ecc. Min 5 lettere per evitare falsi positivi
const STEMS = {
  insult: ["stronz", "coglion", "vaffancul", "pezzodimerd", "figlioditroi", "testadicazz", "motherfuck", "fuckyou", "fuckoff", "hijodeput", "hijoputa", "gilipoll", "cabronazo"],
  homophobic: ["frocio", "ricchion", "culatton", "faggot"],
  racist: ["negracc", "sudaca", "muso giall"],
};
// espressioni (più parole, confronto su testo normalizzato)
const P = {
  insult: ["testa di cazzo", "pezzo di merda", "figlio di puttana", "figlio di troia", "faccia di merda", "vai a cagare", "sei un idiota", "sei una merda", "sei uno stronzo",
    "fuck you", "fuck off", "piece of shit", "son of a bitch", "shut the fuck up", "hijo de puta", "hija de puta", "vete a la mierda", "ve a la mierda", "puta madre", "eres un idiota", "eres una mierda",
    "de mierda", "di merda", "of shit", "go to hell", "vai all inferno"],
  homophobic: ["gay di merda", "lesbica di merda", "gay de mierda", "queer di merda", "i gay fanno schifo", "sporco gay", "sporca lesbica", "sporco omosessuale"],
  racist: ["sporco negro", "sporchi negri", "sporco ebreo", "sporchi ebrei", "sporco cinese", "sporchi cinesi", "cinesi di merda", "negro di merda", "negros de mierda", "negro de mierda", "moro de mierda", "muso giallo", "musi gialli",
    "occhi a mandorla", "tornatevene a casa", "tornate a casa vostra", "tornate al vostro paese", "go back to your country", "go back to china", "vuelve a tu pais", "razza inferiore", "razza superiore", "ching chong", "white power", "heil hitler", "sieg heil"],
  violence: ["ti ammazzo", "vi ammazzo", "ti uccido", "vi uccido", "ti spacco la faccia", "ti spezzo", "morte a", "devono morire", "dovrebbero morire", "meritano di morire", "kill yourself", "go die", "i will kill", "i ll kill", "kill all",
    "te voy a matar", "los voy a matar", "muerte a", "muerete", "mueran", "ammazzati", "uccidetevi", "suicidati", "ti stupro", "ti violento", "bomba contro", "farli fuori"],
  blasphemy: ["porco dio", "dio porco", "dio cane", "dio maiale", "dio bastardo", "dio boia", "dio merda", "dio schifoso", "porca madonna", "madonna puttana", "madonna troia", "madonna maiala", "cristo porco", "gesu cristo di merda", "gesu porco", "porco gesu", "dio ladro", "allah di merda", "allah porco", "maometto porco", "maometto di merda", "me cago en dios", "me cago en la virgen", "hostia puta", "goddamn jesus"],
  politics: ["elezioni", "elezione", "voto politico", "voteremo", "alle urne", "partito democratico", "forza italia", "fratelli d italia", "movimento 5 stelle", "m5s", "la lega", "centrodestra", "centrosinistra", "destra politica", "sinistra politica", 
    "governo meloni", "governo draghi", "governo conte", "premier", "primo ministro", "parlamento", "senatore", "deputato", "propaganda", "dittatura", "dittatore", "regime", "referendum", "sovranista", "sovranismo", "antifascista", "antifascismo", "liberismo", "neoliberismo",
    "election", "elections", "vote for", "voting for", "left wing", "right wing", "left-wing", "right-wing", "republican", "republicans", "democrats", "the democrats", "gop", "maga", "liberals", "conservatives", "political party", "prime minister", "dictator", "dictatorship",
    "elecciones", "partido politico", "voto por", "izquierda politica", "ultraderecha", "ultraizquierda", "dictadura", "presidente del gobierno", "partido popular", "psoe", "vox", "podemos", "gobierno de espana"],
  religion: ["la religione e una", "la religione e solo", "le religioni sono", "religion is a", "religion is just", "religions are", "la religion es", "las religiones son", "religione e l oppio", "oppio dei popoli", "chi crede in dio e", "chi crede e un", "believers are", "los creyentes son", "i credenti sono", "i cristiani sono", "i musulmani sono", "gli ebrei sono", "gli islamici sono", "i buddisti sono", "muslims are", "christians are", "jews are", "los musulmanes son", "los judios son", "los cristianos son"],
};
// nomi propri di politici/partiti (parola intera): sollevano "review"
const POL_NAMES = ["meloni", "salvini", "schlein", "berlusconi", "renzi", "mattarella", "trump", "biden", "harris", "obama", "putin", "zelensky", "zelenskyy", "netanyahu", "macron", "orban", "marine le pen", "lepen", "sanchez", "feijoo", "abascal", "maduro", "kim jong", "erdogan", "hamas", "hezbollah", "isis", "taliban", "brexit", "xi jinping"];
// gruppi (persone) + espressioni di svalutazione nella stessa frase  -> odio verso gruppi
const GROUPS = ["gay", "omosessuali", "omosessuale", "lesbiche", "lesbica", "trans", "transessuali", "bisessuali", "queer", "ebrei", "ebreo", "musulmani", "musulmano", "islamici", "cristiani", "cattolici", "buddisti", "induisti", "atei",
  "neri", "africani", "cinesi", "giapponesi", "coreani", "asiatici", "arabi", "immigrati", "stranieri", "rom", "zingari", "italiani", "americani", "russi", "ucraini", "donne", "femmine", "disabili", "handicappati", "vecchi",
  "gays", "jews", "muslims", "christians", "blacks", "asians", "chinese", "arabs", "immigrants", "foreigners", "women", "gypsies", "homosexuals", "lesbians", "transgender",
  "gais", "judios", "musulmanes", "cristianos", "negros", "asiaticos", "chinos", "arabes", "inmigrantes", "extranjeros", "mujeres", "gitanos", "homosexuales", "lesbianas"];
const DENIGR = ["fanno schifo", "fa schifo", "schifosi", "schifoso", "da eliminare", "vanno eliminati", "devono morire", "tornino a casa", "sono una piaga", "sono inferiori", "sporchi", "sporco", "feccia", "parassiti", "animali", "subumani", "malati", "pericolosi", "ci rovinano", "vanno sterminati", "vanno cacciati", "sono il male", "stupidi", "ignoranti", "ladri", "terroristi", "pervertiti", "bugiardi",
  "are disgusting", "are filth", "are scum", "are animals", "are inferior", "should die", "should be killed", "should be deported", "are the problem", "are dirty", "are stupid", "are criminals", "are terrorists", "are perverts", "are liars", "ruin everything",
  "dan asco", "dan pena", "son basura", "son escoria", "son animales", "son inferiores", "deberian morir", "deben morir", "son sucios", "son estupidos", "son criminales", "son terroristas", "son pervertidos", "son mentirosos", "son una plaga"];
// cinese (confronto diretto sul testo originale)
const ZH = {
  insult: ["傻逼", "傻b", "煞笔", "沙比", "他妈的", "操你妈", "草你妈", "草泥马", "艹", "日你妈", "日你娘", "滚蛋", "混蛋", "王八蛋", "贱人", "婊子", "狗杂种", "白痴", "脑残", "智障", "屌", "骚货", "死开"],
  violence: ["去死", "死全家", "杀了你", "弄死", "砍死"],
  homophobic: ["死基佬", "变态同性恋", "人妖", "娘炮"],
  racist: ["黑鬼", "支那", "小日本"],
  politics: ["共产党", "国民党", "民进党", "习近平", "毛泽东", "台独", "港独", "藏独", "疆独", "六四", "天安门事件", "法轮功", "选举", "投票给", "独裁", "政党", "特朗普", "拜登", "普京", "民主党", "共和党", "左派", "右派", "反动"],
  religion: ["信教的人都", "基督徒都", "穆斯林都", "犹太人都", "佛教是迷信"],
};
const SPAM = { link: /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|it|io|ru|cn|xyz|top|info|biz|ly|me|co|tv|app)\b)/i, email: /[\w.+-]+@[\w-]+\.[\w.]+/, phone: /(?:\+?\d[\s.\-()]*){9,}/,
  telegram: /\b(telegram|whatsapp|t\.me|wa\.me|onlyfans|bitcoin|crypto|casino|scommess|viagra|forex|investimento garantito)\b/i, repeat: /(.)\1{14,}/u };

// --- preparazione ---------------------------------------------------------------------------------------------------------------
const prep = a => a.map(x => tokensOf(normalize(x)).join(" ")).filter(Boolean);
const SETS = {}, STEM = {}, PHR = {};
for (const k in W) SETS[k] = new Set(W[k].flatMap(x => tokensOf(normalize(x))));
for (const k in STEMS) STEM[k] = STEMS[k].map(x => collapse(base(x).replace(/[^a-z]/g, "")));
for (const k in P) PHR[k] = prep(P[k]);
const POLN = new Set(POL_NAMES.flatMap(x => prep([x])));
const GRP = new Set(GROUPS.flatMap(x => tokensOf(normalize(x))));
const DEN = prep(DENIGR);
const has = (padded, phrase) => padded.includes(" " + phrase + " ");

function shouting(t) { const up = (t.match(/[A-Z]/g) || []).length, lo = (t.match(/[a-z]/g) || []).length; return up + lo >= 30 && up / (up + lo) > .85; }

/** Valuta un testo. kind: "nick" | "title" | "body" (il nick è più rigido: niente link, niente politica). */
export function moderate(text, kind = "body") {
  const raw = String(text == null ? "" : text);
  const cats = new Set();
  // 1) cinese
  for (const k in ZH) if (ZH[k].some(w => raw.includes(w))) cats.add(k);
  // 2) lettere latine
  const norm = normalize(raw);
  const toks = tokensOf(norm), joined = toks.join(" "), padded = " " + joined + " ";
  for (const k in SETS) if (toks.some(t => SETS[k].has(t))) cats.add(k);
  for (const k in STEM) if (toks.some(t => STEM[k].some(s => t.startsWith(s)))) cats.add(k);
  // le radici con spazi ("muso giallo") e le espressioni si cercano sul testo unito
  for (const k in STEMS) for (const s of STEMS[k]) if (s.length > 7 && padded.replace(/ /g, "").includes(s)) cats.add(k);
  for (const k in PHR) if (PHR[k].some(p => has(padded, p))) cats.add(k);
  // 3) gruppi + svalutazione nella stessa frase
  for (const sent of norm.split(/[.!?;\n:]+/)) {
    const st = tokensOf(sent), sp = " " + st.join(" ") + " ";
    if (st.some(t => GRP.has(t)) && DEN.some(d => has(sp, d))) cats.add("group_hate");
  }
  // 4) nomi di politici/partiti
  for (const n of POLN) if (has(padded, n)) { cats.add("politics"); break; }
  // 5) spam e dati personali
  if (SPAM.email.test(raw) || SPAM.phone.test(raw.replace(/\d{4}-\d{2}-\d{2}/g, ""))) cats.add("personal_data");
  if (SPAM.link.test(raw)) cats.add("link");
  if (SPAM.telegram.test(raw) || SPAM.repeat.test(raw) || shouting(raw)) cats.add("spam");
  if ((raw.match(/https?:\/\//gi) || []).length >= 3) cats.add("spam");
  if (kind === "nick" && cats.has("link")) cats.add("spam");

  const BLOCK = ["insult", "homophobic", "racist", "violence", "blasphemy", "group_hate", "personal_data", "spam"];
  const out = [...cats];
  const verdict = out.some(c => BLOCK.includes(c)) || (kind === "nick" && out.length) ? "block" : out.length ? "review" : "ok";
  return { verdict, cats: out };
}
export const CATEGORIES = ["insult", "homophobic", "racist", "violence", "blasphemy", "group_hate", "religion", "politics", "link", "spam", "personal_data"];
