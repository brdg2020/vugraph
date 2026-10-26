#!/usr/bin/env python3
"""TBF masterpoint (güncel) kulüp sıralamasını çeker: mp.tbricfed.org.tr

Kullanım:
  tbf.py                     clubs.json'da "tbf" kimliği olan tüm kulüpleri çeker (ağ gerekir)
  tbf.py --from <dosya.json> tarayıcıda tools/tbf.js ile indirilmiş dosyayı içe aktarır
Çıktı: raw/bricskor_<kulüp>_mp.json  (build_data.py bunu public/data/<kulüp>/mp.json'a yazar)
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://mp.tbricfed.org.tr/api/ranking/list?mode=guncel&club={club}&page={page}"


def row(x):
    return [x["rank"], x["id"], f'{x.get("first_name") or ""} {x.get("last_name") or ""}'.strip(),
            (x.get("title") or {}).get("name") or "", x.get("value"), (x.get("city") or {}).get("name") or "",
            x.get("visa_type") or ""]


def fetch(club_id):
    rows, page, meta = [], 1, {}
    while True:
        req = urllib.request.Request(API.format(club=club_id, page=page),
                                     headers={"Accept": "application/json", "User-Agent": "bricskor (skor.bricdersi.net)"})
        for k in range(3):
            try:
                j = json.load(urllib.request.urlopen(req, timeout=30)); break
            except Exception:
                if k == 2: raise
                time.sleep(3)
        meta = j["meta"]
        rows += [row(x) for x in j["data"]]
        if page >= meta.get("last_page", 1):
            break
        page += 1
        time.sleep(0.4)  # nazik ol
    return pack(club_id, meta, rows)


def pack(club_id, meta, rows):
    return {"club_id": club_id, "at": meta.get("last_calculated_at"), "explanation": meta.get("explanation"),
            "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "cols": ["rank", "id", "name", "title", "mp", "city", "visa"], "rows": rows}


def save(slug, data):
    p = os.path.join(ROOT, "raw", f"bricskor_{slug}_mp.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if os.path.exists(p):  # sıralama değişmediyse dosyaya dokunma (gereksiz commit/yayın olmasın)
        old = json.load(open(p))
        if old.get("rows") == data["rows"] and old.get("at") == data["at"]:
            print(f"{slug}: değişiklik yok ({len(data['rows'])} sporcu)")
            return
    json.dump(data, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{slug}: {len(data['rows'])} sporcu (TBF {data['at']})")


if __name__ == "__main__":
    clubs = [c for c in json.load(open(os.path.join(ROOT, "tools", "clubs.json"))) if c.get("tbf")]
    if len(sys.argv) > 2 and sys.argv[1] == "--from":
        data = json.load(open(sys.argv[2]))
        for c in clubs:
            if c["slug"] in data:
                save(c["slug"], data[c["slug"]])
    else:
        for c in clubs:
            try:
                save(c["slug"], fetch(c["tbf"]))
            except Exception as e:  # sıralama alınamazsa eski veri kalır, güncelleme durmaz
                print(f"{c['slug']}: TBF sıralaması alınamadı: {e}", file=sys.stderr)
