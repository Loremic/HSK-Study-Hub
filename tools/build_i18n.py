#!/usr/bin/env python3
"""Genera site/i18n/en.js e site/i18n/es.js dai dizionari tools/i18n_ui*.py (chiave = testo italiano).
Uso: python3 tools/build_i18n.py"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from i18n_ui1 import UI1; from i18n_ui2 import UI2; from i18n_ui3 import UI3; from i18n_ui4 import UI4; from i18n_ui5 import UI5; from i18n_ui6 import UI6
ALL = {}
for d in (UI1, UI2, UI3, UI4, UI5, UI6): ALL.update(d)
(ROOT / "site" / "i18n").mkdir(exist_ok=True)
for i, lang in enumerate(("en", "es")):
    tr = {k: v[i] for k, v in ALL.items() if v[i] and v[i] != k}
    js = f'/* generato da tools/build_i18n.py: non modificare a mano */\nI18n.register("{lang}", ' + json.dumps(tr, ensure_ascii=False, indent=0) + ");\n"
    (ROOT / "site" / "i18n" / f"{lang}.js").write_text(js, encoding="utf-8")
    print(lang, len(tr), "voci")
