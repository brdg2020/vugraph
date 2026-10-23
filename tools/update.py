#!/usr/bin/env python3
"""Günlük güncelleme: indirilen vugraph verisini arşive ekler, siteyi yeniden üretir.

Kullanım: update.py <indirilen.json> [<indirilen2.json> ...]
Her dosya: {"<kulüp>": {"<event_id>": {...olay..., "hints": {...}}}}
Sonra: build_data.py tools/clubs.json public && prerender.py public
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
os.makedirs(RAW, exist_ok=True)
added = {}
for path in sys.argv[1:]:
    data = json.load(open(path))
    for club, events in data.items():
        rp, hp = os.path.join(RAW, f"bricskor_{club}_raw.json"), os.path.join(RAW, f"bricskor_{club}_hints.json")
        raw = json.load(open(rp)) if os.path.exists(rp) else {}
        hints = json.load(open(hp)) if os.path.exists(hp) else {}
        n = 0
        for eid, ev in events.items():
            if not ev.get("boards"):
                continue
            h = ev.pop("hints", None)
            if eid not in raw:
                n += 1
            raw[eid] = ev
            if h:
                hints[eid] = h
        json.dump(raw, open(rp, "w"), ensure_ascii=False)
        json.dump(hints, open(hp, "w"))
        added[club] = n
print("yeni turnuva:", added)
env = dict(os.environ, DDRUN=os.environ.get("DDRUN", os.path.join(ROOT, "tools", "bin", "ddrun")))
subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_data.py"), os.path.join(ROOT, "tools", "clubs.json"),
                os.path.join(ROOT, "public")], check=True, env=env)
subprocess.run([sys.executable, os.path.join(ROOT, "tools", "prerender.py"), os.path.join(ROOT, "public")], check=True)
