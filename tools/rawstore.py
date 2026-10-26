"""Ham vugraph verisi: raw/<kulüp>/<turnuva_id>.json (turnuva başına bir dosya, ipuçları "hints" alanında).

Turnuva başına dosya, her güncellemede yalnızca yeni turnuvaların dosyalarının değişmesini sağlar
(tek büyük JSON her gün baştan yazılınca git deposu hızla büyüyordu).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def club_dir(c):
    return os.path.join(ROOT, "raw", c["slug"])


def known_ids(c):
    d = club_dir(c)
    return sorted(f[:-5] for f in os.listdir(d) if f.endswith(".json")) if os.path.isdir(d) else []


def load(c):
    """-> (raw: {eid: olay}, hints: {eid: ipuçları})"""
    raw, hints = {}, {}
    d = club_dir(c)
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith(".json"):
                ev = json.load(open(os.path.join(d, f)))
                h = ev.pop("hints", None)
                eid = str(ev["id"])
                raw[eid] = ev
                if h:
                    hints[eid] = h
    return raw, hints


def save_event(c, eid, ev, hints=None):
    d = club_dir(c)
    os.makedirs(d, exist_ok=True)
    out = dict(ev)
    if hints:
        out["hints"] = hints
    with open(os.path.join(d, f"{eid}.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
