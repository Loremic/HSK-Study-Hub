#!/usr/bin/env python3
"""Controlla data/prompts.json (archivio delle tracce assegnate).
Uso:  python3 tools/validate_prompts.py [percorso/prompts.json]
Esce con codice 1 se trova errori."""
import json, re, sys
from collections import Counter

path = sys.argv[1] if len(sys.argv) > 1 else "data/prompts.json"
LEVELS = {"hsk1", "hsk2", "hsk3"}
TYPES = {"exam", "generated"}
STR = ("id", "level", "title_it", "instruction_it")
OPT_STR = ("type", "source", "title_zh", "instruction_zh", "image")
OPT_INT = ("min_chars", "target_min", "max_chars")
OPT_LIST = ("keywords", "required", "points")
HAN = re.compile(r"[一-鿿]")

d = json.load(open(path, encoding="utf-8"))
items = d["prompts"] if isinstance(d, dict) else d
errs, ids = [], Counter()
for n, p in enumerate(items, 1):
    w = f"#{n} ({p.get('id', '?')})"
    for k in STR:
        if not isinstance(p.get(k), str) or not p[k].strip(): errs.append(f"{w}: campo obbligatorio mancante o vuoto: {k}")
    ids[p.get("id")] += 1
    if p.get("level") not in LEVELS: errs.append(f"{w}: level deve essere uno tra {sorted(LEVELS)}")
    if "type" in p and p["type"] not in TYPES: errs.append(f"{w}: type deve essere uno tra {sorted(TYPES)}")
    for k in OPT_STR:
        if k in p and not isinstance(p[k], str): errs.append(f"{w}: {k} deve essere testo")
    for k in OPT_INT:
        if k in p and not (isinstance(p[k], int) and p[k] > 0): errs.append(f"{w}: {k} deve essere un intero positivo")
    for k in OPT_LIST:
        if k in p and not (isinstance(p[k], list) and all(isinstance(x, str) and x for x in p[k])): errs.append(f"{w}: {k} deve essere una lista di testi")
    for k in ("keywords", "required"):
        for x in p.get(k, []):
            if not HAN.search(x): errs.append(f"{w}: {k} deve contenere hanzi, trovato '{x}'")
    lo, tm, hi = p.get("min_chars"), p.get("target_min"), p.get("max_chars")
    if lo and hi and lo > hi: errs.append(f"{w}: min_chars > max_chars")
    if tm and hi and tm > hi: errs.append(f"{w}: target_min > max_chars")
for i, c in ids.items():
    if c > 1: errs.append(f"id duplicato: {i}")
print(f"{len(items)} tracce controllate, {len(errs)} problemi")
for e in errs: print(" -", e)
sys.exit(1 if errs else 0)
