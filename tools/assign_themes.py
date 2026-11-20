#!/usr/bin/env python3
"""Riorganizza le schede di un livello in unità TEMATICHE (come HSK 1), al posto dell'ordine alfabetico.

Uso:  python3 tools/assign_themes.py hsk2 hsk3        (idempotente: si può rilanciare)

Per ogni livello legge  data/themes/<livello>.json  = { "<id scheda>": "<chiave tema>" }  e riscrive in data/flashcards_<livello>.json:
  phase  -> "Fase N · ..."        unit -> "NN Nome tema"        order -> ordine progressivo (fase, unità, ordine originale)
L'ordine originale del sillabo viene conservato in "syllabus_order". Le unità vuote spariscono e la numerazione resta continua.
Per un livello nuovo (HSK 4–9): compila i dati delle schede, crea data/themes/<livello>.json (anche con l'aiuto di un modello:
elenco dei temi in THEMES) e lancia questo script. Le schede senza tema finiscono in "Altre parole" e lo script le elenca.
I nomi di temi e fasi sono tradotti in tools/i18n_ui7.py.
"""
import json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHASES = [
  ("Fase 1 · Persone e vita quotidiana", ["people", "food", "home", "school", "work", "time"]),
  ("Fase 2 · Il mondo intorno a noi", ["places", "transport", "body", "nature", "leisure", "shopping", "tech", "society"]),
  ("Fase 3 · Lingua e grammatica", ["emotion", "verbs", "adj", "adv", "measure", "grammar"]),
]
NAMES = {"people": "Persone e famiglia", "food": "Cibo e bevande", "home": "Casa, oggetti e vestiti", "school": "Scuola e studio", "work": "Lavoro e professioni",
  "time": "Tempo, date e orari", "places": "Luoghi e città", "transport": "Trasporti e viaggi", "body": "Corpo e salute", "nature": "Natura, animali e meteo",
  "leisure": "Sport, musica e tempo libero", "shopping": "Acquisti e soldi", "tech": "Comunicazione e tecnologia", "society": "Società e cultura",
  "emotion": "Emozioni, carattere e opinioni", "verbs": "Verbi di uso quotidiano", "adj": "Aggettivi e descrizioni", "adv": "Avverbi e preposizioni",
  "measure": "Numeri, classificatori e quantità", "grammar": "Congiunzioni, particelle e strutture"}
OTHER = ("Fase 3 · Lingua e grammatica", "Altre parole")
MIN_UNIT = 3

def apply(level):
    fp = os.path.join(ROOT, "data", "flashcards_%s.json" % level); tp = os.path.join(ROOT, "data", "themes", "%s.json" % level)
    cards = json.load(open(fp, encoding="utf-8")); themes = json.load(open(tp, encoding="utf-8"))
    for c in cards: c.setdefault("syllabus_order", c["order"])
    by = {}
    missing = []
    for c in cards:
        k = themes.get(str(c["id"]))
        if k not in NAMES: missing.append(c); k = None
        by.setdefault(k, []).append(c)
    seq, n, order = [], 0, 0
    for phase, keys in PHASES:
        for k in keys:
            lst = by.get(k, [])
            if not lst: continue
            if len(lst) < MIN_UNIT: print("  avviso: %s ha solo %d parole (%s)" % (k, len(lst), level))
            n += 1
            for c in sorted(lst, key=lambda x: x["syllabus_order"]):
                order += 1; c["phase"] = phase; c["unit"] = "%02d %s" % (n, NAMES[k]); c["order"] = order
    if by.get(None):
        n += 1
        for c in sorted(by[None], key=lambda x: x["syllabus_order"]):
            order += 1; c["phase"], c["unit"], c["order"] = OTHER[0], "%02d %s" % (n, OTHER[1]), order
        print("  %d schede senza tema -> 'Altre parole': %s" % (len(by[None]), [c["hanzi"] for c in by[None]][:10]))
    cards.sort(key=lambda c: c["order"])
    json.dump(cards, open(fp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("%s: %d schede in %d unità" % (level, len(cards), n))

if __name__ == "__main__":
    for lv in sys.argv[1:] or ["hsk2", "hsk3"]: apply(lv)
