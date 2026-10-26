#!/usr/bin/env python3
"""Günlük güncelleme: indirilen vugraph verisini arşive ekler, siteyi yeniden üretir.

Kullanım: update.py <indirilen.json> [<indirilen2.json> ...]
Her dosya: {"<kulüp>": {"<event_id>": {...olay..., "hints": {...}}}}
Sonra: build_data.py tools/clubs.json public && prerender.py public
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import rawstore
CLUBS = {c["vugraph"]: c for c in json.load(open(os.path.join(ROOT, "tools", "clubs.json")))}
added = {}
for path in sys.argv[1:]:
    data = json.load(open(path))
    for club, events in data.items():
        c = CLUBS.get(club)
        if not c:
            print("clubs.json'da olmayan kulüp atlandı:", club); continue
        known = set(rawstore.known_ids(c))
        n = 0
        for eid, ev in events.items():
            if not ev.get("boards"):
                continue
            h = ev.pop("hints", None)
            n += eid not in known
            rawstore.save_event(c, eid, ev, h)
        added[c["slug"]] = n
print("yeni turnuva:", added)
env = dict(os.environ, DDRUN=os.environ.get("DDRUN", os.path.join(ROOT, "tools", "bin", "ddrun")))
subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_data.py"), os.path.join(ROOT, "tools", "clubs.json"),
                os.path.join(ROOT, "public")], check=True, env=env)
subprocess.run([sys.executable, os.path.join(ROOT, "tools", "prerender.py"), os.path.join(ROOT, "public")], check=True)
