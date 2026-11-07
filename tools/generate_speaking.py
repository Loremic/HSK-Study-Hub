#!/usr/bin/env python3
"""Genera le tracce di PARLATO e le salva in data/speaking.json.

Modello dei compiti (ispirato alle prove orali classiche HSKK; NON sono prove ufficiali né testi d'esame copiati):
  repeat    ascolta e ripeti una frase            -> confronto automatico con il testo di riferimento
  read      leggi ad alta voce un breve testo     -> confronto automatico con il testo di riferimento
  answer    ascolta una domanda e rispondi        -> valutazione AI sulla trascrizione
  describe  parla di un argomento                 -> valutazione AI sulla trascrizione
Frasi e testi da ripetere/leggere vengono dagli esempi delle schede (hanzi + pinyin già presenti nei JSON).
Limiti di lunghezza/durata: pratica, non requisiti ufficiali. Per HSK 4+ non ci sono dati: nessuna traccia.
Uso: python3 tools/generate_speaking.py [--seed 2026]
"""
import argparse, json, random, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_prompts as g
from i18n_ui4 import UI4

ROOT = g.ROOT
ORDER = g.ORDER
HAN = g.HAN
LEVELS = {
    "hsk1": {"label": "HSK 1", "repeat": [4, 10], "answer": [10, 15, 40], "describe": [15, 25, 60], "max_sec": {"repeat": 20, "answer": 60, "describe": 90, "read": 60}},
    "hsk2": {"label": "HSK 2", "repeat": [6, 16], "answer": [20, 30, 70], "describe": [30, 45, 90], "read": [25, 45], "max_sec": {"repeat": 20, "answer": 75, "describe": 120, "read": 90}},
    "hsk3": {"label": "HSK 3", "repeat": [8, 22], "answer": [40, 60, 120], "describe": [50, 80, 150], "read": [30, 70], "max_sec": {"repeat": 25, "answer": 90, "describe": 120, "read": 120}},
}
T3 = lambda it, en, es: (it, en, es)
TXT = {
    "repeat": T3("Ascolta e ripeti", "Listen and repeat", "Escucha y repite"),
    "read": T3("Leggi ad alta voce", "Read aloud", "Lee en voz alta"),
    "answer": T3("Rispondi alla domanda", "Answer the question", "Responde a la pregunta"),
}
INS = {
    "repeat": T3("Ascolta la frase e ripetila ad alta voce, con i toni giusti.", "Listen to the sentence and repeat it out loud, with the right tones.", "Escucha la frase y repítela en voz alta, con los tonos correctos."),
    "read": T3("Leggi ad alta voce questo breve testo, con i toni e il ritmo giusti.", "Read this short text aloud, with the right tones and rhythm.", "Lee en voz alta este breve texto, con los tonos y el ritmo correctos."),
    "answer": T3("Ascolta la domanda e rispondi in cinese con frasi complete.", "Listen to the question and answer in Chinese with complete sentences.", "Escucha la pregunta y responde en chino con frases completas."),
}
PTS = {
    "repeat": T3("Pronuncia con attenzione i toni", "Pronounce the tones carefully", "Pronuncia con cuidado los tonos"),
    "read": T3("Non fermarti sulle parole difficili", "Do not stop on difficult words", "No te detengas en las palabras difíciles"),
    "a1": T3("Rispondi con frasi complete", "Answer with complete sentences", "Responde con frases completas"),
    "a2": T3("Aggiungi un motivo o un esempio", "Add a reason or an example", "Añade un motivo o un ejemplo"),
    "d1": T3("Parla in modo ordinato, dall'inizio alla fine", "Speak in an orderly way, from start to finish", "Habla de forma ordenada, de principio a fin"),
}
DUR = {"it": "Parla per circa {s} secondi.", "en": "Speak for about {s} seconds.", "es": "Habla durante unos {s} segundos."}
# domande: (cinese, italiano, inglese, spagnolo)
QUESTIONS = [
    ("你叫什么名字？你是哪国人？", "Come ti chiami? Di che nazionalità sei?", "What is your name? Where are you from?", "¿Cómo te llamas? ¿De qué país eres?"),
    ("你家有几口人？", "Quante persone ci sono nella tua famiglia?", "How many people are in your family?", "¿Cuántas personas hay en tu familia?"),
    ("你喜欢吃什么？", "Cosa ti piace mangiare?", "What do you like to eat?", "¿Qué te gusta comer?"),
    ("你今天做什么？", "Cosa fai oggi?", "What are you doing today?", "¿Qué haces hoy?"),
    ("你住在哪儿？", "Dove abiti?", "Where do you live?", "¿Dónde vives?"),
    ("你几点起床？", "A che ora ti alzi?", "What time do you get up?", "¿A qué hora te levantas?"),
    ("你的朋友叫什么名字？他喜欢什么？", "Come si chiama il tuo amico? Cosa gli piace?", "What is your friend called? What does he like?", "¿Cómo se llama tu amigo? ¿Qué le gusta?"),
    ("你会说汉语吗？说一说。", "Sai parlare cinese? Dimmi qualcosa.", "Can you speak Chinese? Tell me something.", "¿Hablas chino? Cuéntame algo."),
    ("今天天气怎么样？你喜欢这样的天气吗？", "Che tempo fa oggi? Ti piace questo tempo?", "What is the weather like today? Do you like it?", "¿Qué tiempo hace hoy? ¿Te gusta?"),
    ("你周末常常做什么？", "Cosa fai di solito nel fine settimana?", "What do you usually do at the weekend?", "¿Qué sueles hacer el fin de semana?"),
    ("你有什么爱好？", "Che hobby hai?", "What are your hobbies?", "¿Qué aficiones tienes?"),
    ("你喜欢学习汉语吗？为什么？", "Ti piace studiare cinese? Perché?", "Do you like studying Chinese? Why?", "¿Te gusta estudiar chino? ¿Por qué?"),
    ("你去过中国吗？你想去哪儿？", "Sei stato in Cina? Dove vorresti andare?", "Have you been to China? Where would you like to go?", "¿Has estado en China? ¿Adónde te gustaría ir?"),
    ("你每天怎么去学校或者去上班？", "Come vai ogni giorno a scuola o al lavoro?", "How do you get to school or work every day?", "¿Cómo vas cada día a la escuela o al trabajo?"),
    ("你最好的朋友是谁？他怎么样？", "Chi è il tuo migliore amico? Com'è?", "Who is your best friend? What is he like?", "¿Quién es tu mejor amigo? ¿Cómo es?"),
    ("你觉得学习汉语难不难？为什么？", "Pensi che studiare cinese sia difficile? Perché?", "Do you think Chinese is hard to learn? Why?", "¿Crees que estudiar chino es difícil? ¿Por qué?"),
    ("你想去哪儿旅游？为什么？", "Dove vorresti andare in viaggio? Perché?", "Where would you like to travel? Why?", "¿Adónde te gustaría viajar? ¿Por qué?"),
]


def examples(cards, lv, lex):
    out = []
    for l in ORDER[: ORDER.index(lv) + 1]:
        for c in cards[l]:
            e = c.get("example")
            if e and e.get("zh") and e.get("pinyin"):
                out.append((e["zh"].strip(), e["pinyin"].strip()))
    return list(dict.fromkeys(out))


def nchars(s): return sum(1 for ch in s if HAN.match(ch))


def build(seed):
    cards, lex, chars, own = g.load_levels()
    rng = random.Random(seed); out = []; rep = {}
    for lv in ORDER:
        L, C, cfg = lex[lv], chars[lv], LEVELS[lv]; rep[lv] = {}
        n = [0]
        def add(p, kind):
            n[0] += 1; p.update({"id": f"{lv}-s-{kind}-{n[0]:03d}", "level": lv, "task_type": kind, "type": "generated", "source": "Generata dal sillabo"}); out.append(p); rep[lv][kind] = rep[lv].get(kind, 0) + 1
        ex = examples(cards, lv, L); ex = [(z, p) for z, p in ex if g.zh_ok(z, C)]
        # --- ripeti
        lo, hi = cfg["repeat"]; pool = [e for e in ex if lo <= nchars(e[0]) <= hi]; rng.shuffle(pool)
        for z, py in pool[:40]:
            i = TXT["repeat"]; s = INS["repeat"]; pt = PTS["repeat"]
            add({"title_it": i[0], "title_en": i[1], "title_es": i[2], "instruction_it": s[0], "instruction_en": s[1], "instruction_es": s[2],
                 "prompt_zh": z, "ref_zh": z, "ref_py": py, "keywords": [], "required": [], "points": [pt[0]], "points_en": [pt[1]], "points_es": [pt[2]],
                 "min_chars": max(2, int(nchars(z) * .5)), "target_min": nchars(z), "max_chars": int(nchars(z) * 1.6) + 2, "max_sec": cfg["max_sec"]["repeat"]}, "repeat")
        # --- leggi (HSK 2-3): 2-3 frasi consecutive dal pool di esempi
        if "read" in cfg:
            lo, hi = cfg["read"]; shorts = [e for e in ex if 5 <= nchars(e[0]) <= 18]; made = 0; tries = 0
            while made < 8 and tries < 400 and len(shorts) >= 3:
                tries += 1; k = rng.choice([2, 3, 4]); grp = rng.sample(shorts, k); z = "".join(a for a, _ in grp); py = " ".join(b for _, b in grp)
                if not (lo <= nchars(z) <= hi): continue
                i = TXT["read"]; s = INS["read"]; pt = PTS["read"]; made += 1
                add({"title_it": i[0], "title_en": i[1], "title_es": i[2], "instruction_it": s[0], "instruction_en": s[1], "instruction_es": s[2],
                     "prompt_zh": z, "ref_zh": z, "ref_py": py, "keywords": [], "required": [], "points": [pt[0]], "points_en": [pt[1]], "points_es": [pt[2]],
                     "min_chars": int(nchars(z) * .5), "target_min": nchars(z), "max_chars": int(nchars(z) * 1.6) + 2, "max_sec": cfg["max_sec"]["read"]}, "read")
        # --- rispondi
        mn, tl, mx = cfg["answer"]
        for zh, it, en, es in QUESTIONS:
            if not g.zh_ok(zh, C): continue
            i = TXT["answer"]; s = INS["answer"]
            add({"title_it": i[0], "title_en": i[1], "title_es": i[2], "instruction_it": f"{s[0]} {it}", "instruction_en": f"{s[1]} {en}", "instruction_es": f"{s[2]} {es}",
                 "prompt_zh": zh, "keywords": [], "required": [], "points": [PTS["a1"][0], PTS["a2"][0]], "points_en": [PTS["a1"][1], PTS["a2"][1]], "points_es": [PTS["a1"][2], PTS["a2"][2]],
                 "min_chars": mn, "target_min": tl, "max_chars": mx, "max_sec": cfg["max_sec"]["answer"]}, "answer")
        # --- descrivi / parla di un argomento (macro-argomenti del livello)
        mn, tl, mx = cfg["describe"]
        for tid, it, zhv, brief, pts, seeds in g.TOPICS:
            kws = list(dict.fromkeys(w for w in seeds.split() if w in L))
            title_zh = next((t for t in zhv if g.zh_ok(t, C)), None)
            if len(kws) < 4 or not title_zh: continue
            if lv == "hsk1" and tid in ("passato", "futuro", "confronto", "problema", "citta", "viaggio", "telefono", "musica", "salute"): continue
            sec = cfg["max_sec"]["describe"]
            add({"title_it": it, "title_en": g.tr(it, 0), "title_es": g.tr(it, 1), "title_zh": title_zh,
                 "instruction_it": f"{brief} {DUR['it'].format(s=sec // 2)}", "instruction_en": f"{g.tr(brief, 0)} {DUR['en'].format(s=sec // 2)}", "instruction_es": f"{g.tr(brief, 1)} {DUR['es'].format(s=sec // 2)}",
                 "prompt_zh": f"请说说“{title_zh}”。" if g.zh_ok("请说说", C) else "", "keywords": kws[:10], "required": [],
                 "points": [PTS["d1"][0]] + pts, "points_en": [PTS["d1"][1]] + [g.tr(x, 0) for x in pts], "points_es": [PTS["d1"][2]] + [g.tr(x, 1) for x in pts],
                 "min_chars": mn, "target_min": tl, "max_chars": mx, "max_sec": sec}, "describe")
    return out, rep, lex, chars


def validate(ps, lex, chars):
    errs = []
    for p in ps:
        lv = p["level"]
        for k in ("required", "keywords"):
            for w in p.get(k, []):
                if w not in lex[lv]: errs.append(f"{p['id']}: {k} '{w}' fuori lessico")
        for k in ("prompt_zh", "ref_zh", "title_zh"):
            if p.get(k) and not g.zh_ok(p[k], chars[lv]): errs.append(f"{p['id']}: {k} fuori livello")
        if p["task_type"] in ("repeat", "read") and not (p.get("ref_zh") and p.get("ref_py")): errs.append(f"{p['id']}: manca riferimento")
        if not (p["min_chars"] <= p["target_min"] <= p["max_chars"]): errs.append(f"{p['id']}: limiti incoerenti")
    ids = [p["id"] for p in ps]; errs += [f"id duplicato {i}" for i in set(ids) if ids.count(i) > 1]
    return errs


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--seed", type=int, default=2026); a = ap.parse_args()
    ps, rep, lex, chars = build(a.seed); errs = validate(ps, lex, chars)
    for lv in ORDER: print(" ", lv, rep[lv])
    if errs: print("ERRORI:"); [print(" -", e) for e in errs]; sys.exit(1)
    path = ROOT / "data" / "speaking.json"
    old = json.load(open(path, encoding="utf-8")) if path.exists() else {"prompts": []}
    keep = [p for p in old.get("prompts", []) if p.get("type") != "generated"]
    json.dump({"version": 1, "levels": LEVELS, "prompts": keep + ps}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"scritto {path.relative_to(ROOT)}: {len(keep) + len(ps)} tracce")


if __name__ == "__main__":
    main()
