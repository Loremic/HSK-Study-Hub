#!/usr/bin/env python3
"""Genera site/moderation.js (copia per il browser) da worker/moderation.mjs, che è l'unica fonte.
Uso: python3 tools/build_moderation.py   — da rilanciare ogni volta che si modificano le liste."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "worker", "moderation.mjs"), encoding="utf-8").read()
body = re.sub(r"^export (function|const)", r"\1", src, flags=re.M)
out = ("/* GENERATO da tools/build_moderation.py a partire da worker/moderation.mjs: non modificare a mano.\n"
       " * Nel browser serve SOLO a dare un avviso immediato: il controllo vero è sul server (worker/forum.mjs). */\n"
       "(function () {\n\"use strict\";\n" + body + "\nwindow.Moderation = { moderate, normalize, CATEGORIES };\n})();\n")
open(os.path.join(ROOT, "site", "moderation.js"), "w", encoding="utf-8").write(out)
print("site/moderation.js:", len(out), "byte")
