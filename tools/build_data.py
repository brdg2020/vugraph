#!/usr/bin/env python3
"""vugraph ham JSON'unu briçskor veri dosyalarına dönüştürür + double dummy analizi ekler.

Kullanım: build_data.py <raw.json> <club_slug> <club_name> <out_public_dir>
"""
import json, re, subprocess, sys, tempfile, unicodedata, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rawstore
from names import clean_name
from collections import defaultdict

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "ddrun")
DDRUN = os.environ.get("DDRUN", BIN if os.path.exists(BIN) else "/tmp/ddsbuild/ddrun")
SEATS = "NESW"
STRAINS = "SHDCN"  # DDS strain order

TR_UP = str.maketrans({"i": "İ", "ı": "I"})
TR_LO = str.maketrans({"İ": "i", "I": "ı"})


def tr_title(s):
    s = re.sub(r"\s+", " ", s.strip())
    out = []
    for w in s.split(" "):
        if not w:
            continue
        lw = w.translate(TR_LO).lower()
        out.append(lw[0].translate(TR_UP).upper() + lw[1:])
    return " ".join(out)


def slugify(s):
    s = s.translate(TR_LO).lower()
    rep = {"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"}
    s = "".join(rep.get(c, c) for c in s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def dealer_vul(b):
    dealer = (b - 1) % 4
    vul = ["None", "NS", "EW", "Both", "NS", "EW", "Both", "None",
           "EW", "Both", "None", "NS", "Both", "None", "NS", "EW"][(b - 1) % 16]
    return dealer, vul


VUL_DDS = {"None": 0, "Both": 1, "NS": 2, "EW": 3}


def parse_contract(con):
    c = con.strip().upper().replace(" ", "")
    if not c or c in ("-", "—") or c.startswith("PAS") or c in ("P", "AP", "ALLPASS"):
        return None
    m = re.match(r"^([1-7])(X{0,2})(NT|SA|N|[SHDC])(X{0,2})$", c)
    if not m:
        m2 = re.match(r"^([1-7])(NT|SA|N|[SHDC])(X{0,2})$", c)
        if not m2:
            return {"raw": con}
        lvl, st, dbl = m2.group(1), m2.group(2), m2.group(3)
    else:
        lvl, dbl, st = m.group(1), m.group(2) or m.group(4), m.group(3)
    st = "N" if st in ("NT", "SA", "N") else st
    return {"level": int(lvl), "strain": st, "dbl": len(dbl or "")}


def to_int(s):
    s = (s or "").strip()
    try:
        return int(s)
    except ValueError:
        return None


def to_float(s):
    try:
        return float(str(s).strip())
    except ValueError:
        return None


_DIRS = {"Kuzey", "Doğu", "Güney", "Batı"}
_VUL = {"Kimse", "Herkes", "K - G", "D - B"}


def _bad_boards(boards):
    """Takım/Lehman turnuvalarında vugraph çift özeti yerine zon tablosu okunuyor (rakip "Kuzey", skor "Kimse")."""
    return any(b.get("opp") in _DIRS and b.get("score") in _VUL for b in boards)


def _scoring(name, pairs, broken):
    """pct: MP yüzdesi · imp: IMP · puan: takım/Lehman toplam puanı."""
    if re.search(r"imp|butler", name or "", re.I):
        return "imp"
    ps = [p["pct"] for p in pairs if p.get("pct") is not None]
    if broken or re.search(r"lehman|leh-|takım", name or "", re.I) or (ps and (min(ps) < 0 or max(ps) > 100)):
        return "puan"
    return "pct"


def parse_title(t):
    m = re.match(r"^(.*?)\s*Sonuçları\s*\((\d\d)-(\d\d)-(\d{4})\s+(\d\d:\d\d)\)", t)
    if not m:
        return t, None, None
    return m.group(1).strip(), f"{m.group(4)}-{m.group(3)}-{m.group(2)}", m.group(5)


def hcp(cards):
    v = {"A": 4, "K": 3, "Q": 2, "J": 1}
    return sum(v.get(c, 0) for s in cards for c in s)


DDDIR = os.environ.get("DDDIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "ddcache"))
_LEGACY = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".ddcache.json")  # eski tek dosyalık önbellek (geçiş için)
_legacy_cache = None


def _dd_compute(todo):
    """ddrun'ı çekirdek sayısı kadar paralel süreçle çalıştırır."""
    from concurrent.futures import ThreadPoolExecutor
    n = max(1, min(len(todo), os.cpu_count() or 2))
    chunks = [todo[i::n] for i in range(n)]

    def go(ch):
        out = subprocess.run([DDRUN], input="\n".join(ch) + "\n", capture_output=True, text=True, check=True).stdout.strip().splitlines()
        if len(out) != len(ch):
            raise RuntimeError(f"ddrun {len(ch)} satır yerine {len(out)} satır döndürdü")
        return ch, out

    res = {}
    with ThreadPoolExecutor(n) as ex:
        for ch, out in ex.map(go, chunks):
            for l, o in zip(ch, out):
                res[l] = json.loads(o)
    return res


def run_dd(jobs, shard):
    """jobs: list of (pbn, dealer, vul, specs) -> list of dicts. Önbellek turnuva başına: ddcache/<kulüp>/<id>.json"""
    global _legacy_cache
    lines = [f"{p.replace(' ', '_')} {d} {v} {' '.join(sp)}" for p, d, v, sp in jobs]
    uniq = list(dict.fromkeys(lines))
    cache = json.load(open(shard)) if os.path.exists(shard) else {}
    missing = [l for l in uniq if l not in cache]
    if missing:
        if _legacy_cache is None:
            _legacy_cache = json.load(open(_LEGACY)) if os.path.exists(_LEGACY) else {}
        for l in missing:
            if l in _legacy_cache:
                cache[l] = _legacy_cache[l]
        todo = [l for l in missing if l not in cache]
        if todo:
            cache.update(_dd_compute(todo))
        os.makedirs(os.path.dirname(shard), exist_ok=True)
        with open(shard, "w") as f:
            json.dump({l: cache[l] for l in uniq}, f, separators=(",", ":"))
    return [cache[l] for l in lines]


AMBIG = []


PLAYERS = defaultdict(lambda: {"name": "", "events": []})


def collect_simultane_pool(clubs):
    """Simultane turnuvalarda tüm Türkiye aynı elleri oynar. El kağıdı yüklemeyen kulüpler için ortak havuz oluşturur."""
    pool = defaultdict(dict)
    for c in clubs:
        raw, _ = rawstore.load(c)
        for ev in raw.values():
            name, dt, tm = parse_title(ev["title"])
            if not dt or not re.search(r"simultane|smlt|sim\b", name, re.I):
                continue
            is_eve = bool(re.search(r"aksam|akşam", name, re.I) or (tm and int(tm.split(":")[0]) >= 18))
            for bd in ev.get("boards", {}).values():
                b = bd.get("b")
                hands = {s: bd["hands"][s]["cards"] for s in SEATS if s in bd.get("hands", {})}
                if len(hands) == 4 and any(any(suit) for suit in hands.values()):
                    if b not in pool[(dt, is_eve)]:
                        pool[(dt, is_eve)][b] = hands
    return pool


def build(raw, club_slug, club_name, out_dir, raw_hints=None, sim_pool=None):
    events_out = []
    seen_slugs = set()
    players = PLAYERS
    os.makedirs(f"{out_dir}/data/{club_slug}/t", exist_ok=True)

    for ev in sorted(raw.values(), key=lambda e: e["id"]):
        name, date, time = parse_title(ev["title"])
        if not ev.get("pairs"):
            continue
        # --- pairs
        pairs = {}
        broken = any(_bad_boards(p.get("boards") or []) for p in ev["pairs"])
        for p in ev["pairs"]:
            if broken:
                p = dict(p, boards=[])  # takım/Lehman: vugraph çift özeti el el sonuç vermiyor
            key = f"{p['sec']}{p['dir'][0] if p['dir'] != 'NONE' else 'H'}{p['no']}"
            names = [tr_title(x) for x in re.split(r"\s+-\s+", p["names"]) if x.strip()]
            pairs[key] = {
                "key": key, "sec": p["sec"], "dir": p["dir"], "no": p["no"], "grp": p.get("grp", ""),
                "rank": p["rank"], "names": names, "pct": p["pct"],
                "slugs": [slugify(n) for n in names], "boards": p["boards"], "raw": p["names"],
            }
        by_raw = defaultdict(list)
        for k, p in pairs.items():
            by_raw[re.sub(r"\s+", " ", p["raw"]).strip()].append(k)

        # --- boards (bölümler aynı eli oynar; traveller tüm salonu kapsar)
        boards = {}
        for bk, bd in ev["boards"].items():
            b = bd["b"]
            if b in boards:
                continue
            dealer, vul = dealer_vul(b)
            hands = {s: bd["hands"][s]["cards"] for s in SEATS}
            rows = []
            for r in bd["rows"]:
                ns, ew = to_int(r["ns"]), to_int(r["ew"])
                nss = ns if ns is not None else (-ew if ew is not None else 0)
                lead = r["lead"].replace("|", "")
                lead = re.sub(r"^([SHDC])\1", r"\1", lead)
                rows.append({
                    "con": r["con"], "c": parse_contract(r["con"]), "by": r["dec"].strip()[:1] or None,
                    "res": r["res"].strip(), "lead": lead.upper().replace("10", "T"),
                    "nsScore": nss, "nsPct": to_float(r["nsp"]), "ewPct": to_float(r["ewp"]),
                    "ns": None, "ew": None,
                })
            boards[b] = {"sec": "A", "b": b, "dealer": SEATS[dealer], "vul": vul, "hands": hands, "rows": rows}

        # Simultane turnuvalarda el kağıtları boşsa havuzdan tamamla
        is_sim = bool(re.search(r"simultane|smlt|sim\b", name, re.I))
        is_eve = bool(re.search(r"aksam|akşam", name, re.I) or (time and int(time.split(":")[0]) >= 18))
        if is_sim and sim_pool:
            pool_boards = sim_pool.get((date, is_eve))
            if not pool_boards and (date, not is_eve) in sim_pool:
                if len([k for k in sim_pool if k[0] == date]) == 1:
                    pool_boards = sim_pool[(date, not is_eve)]
            if pool_boards:
                for b, bd in boards.items():
                    if not any(any(suit) for suit in bd["hands"].values()) and b in pool_boards:
                        bd["hands"] = pool_boards[b]

        # --- masaları kur: (K-G çifti, D-B çifti, K-G skoru, K-G %)
        def opp_key(p, name):
            ks = by_raw.get(re.sub(r"\s+", " ", name).strip(), [])
            same = [k for k in ks if pairs[k]["sec"] == p["sec"]]
            return (same or ks or [None])[0]

        def matches_ns(bd, sc, pc):
            return any(r["nsScore"] == sc and r["nsPct"] == pc for r in bd["rows"])

        hints = (raw_hints or {}).get(str(ev["id"]), {})
        tables = defaultdict(list)  # b -> [(nsKey, ewKey, score, pct)]
        seen = set()
        for k, p in pairs.items():
            for e in p["boards"]:
                bd = boards.get(e["b"])
                if not bd:
                    continue
                sc, pc = to_int(e["score"]), e["pct"]
                ok = opp_key(p, e["opp"])
                if (e["b"], k) in seen:
                    continue
                if p["dir"] == "NS":
                    t = (k, ok, sc, pc)
                elif p["dir"] == "EW":
                    t = (ok, k, -sc if sc is not None else None, None if pc is None else round(100 - pc, 2))
                else:  # Howell: yönü skor/yüzde eşleşmesinden çıkar
                    if matches_ns(bd, sc, pc):
                        t = (k, ok, sc, pc)
                    else:
                        t = (ok, k, -sc if sc is not None else None, None if pc is None else round(100 - pc, 2))
                seen.add((e["b"], k))
                if ok:
                    seen.add((e["b"], ok))
                tables[e["b"]].append(t)

        ambiguous = []
        for b, tl in tables.items():
            bd = boards[b]
            for nsk, ewk, sc, pc in tl:
                hint = hints.get(f"{nsk}|{b}") if nsk else None
                if hint is not None and hint < len(bd["rows"]) and bd["rows"][hint]["ns"] is None:
                    i = hint
                else:
                    cand = [i for i, r in enumerate(bd["rows"]) if r["ns"] is None and r["nsScore"] == sc and
                            (r["nsPct"] is None or pc is None or abs(r["nsPct"] - pc) < .02)]
                    if not cand:
                        cand = [i for i, r in enumerate(bd["rows"]) if r["ns"] is None and r["nsScore"] == sc]
                    if not cand:
                        continue
                    sig = {(bd["rows"][i]["con"], bd["rows"][i]["by"], bd["rows"][i]["lead"], bd["rows"][i]["res"]) for i in cand}
                    if len(sig) > 1 and nsk:
                        ambiguous.append((ev["id"], pairs[nsk]["sec"], pairs[nsk]["no"], pairs[nsk]["dir"], b, nsk))
                    i = cand[0]
                bd["rows"][i]["ns"], bd["rows"][i]["ew"] = nsk, ewk
                for key, side in ((nsk, "ns"), (ewk, "ew")):
                    if key:
                        for e in pairs[key]["boards"]:
                            if e["b"] == b:
                                e["row"], e["side"] = i, side
        AMBIG.extend(ambiguous)

        # --- double dummy
        blist = sorted(boards.values(), key=lambda x: x["b"])
        for x in blist:
            x["key"] = str(x["b"])
        jobs = []
        for bd in blist:
            h = bd["hands"]
            pbn = "N:" + " ".join(".".join(h[s]) for s in SEATS)
            specs = set()
            for r in bd["rows"]:
                c = r["c"]
                if c and "strain" in c and r["by"] in SEATS:
                    specs.add(f"{SEATS.index(r['by'])}{STRAINS.index(c['strain'])}")
            jobs.append((pbn, SEATS.index(bd["dealer"]), VUL_DDS[bd["vul"]], sorted(specs)))
        dd = run_dd(jobs, os.path.join(DDDIR, club_slug, f"{ev['id']}.json")) if jobs else []
        for bd, res in zip(blist, dd):
            if "err" in res:
                continue
            # dd[strain][hand] -> tricks; reorder strains to N S H D C for display: keep S H D C N
            bd["dd"] = res["dd"]
            bd["par"] = res["par"]
            leads = {}
            for spec, cards in res["leads"].items():
                decl, strain = SEATS[int(spec[0])], STRAINS[int(spec[1])]
                rk = "23456789TJQKA"
                lst = []
                for card, eq, tr in cards:
                    lst.append([card, tr])
                    for i in range(13):  # eşdeğer küçük kartlar
                        if eq & (1 << (i + 2)):
                            lst.append([card[0] + rk[i], tr])
                leads[decl + strain] = lst
            bd["leads"] = leads
            bd["hcp"] = {s: hcp(bd["hands"][s]) for s in SEATS}

        ev_slug = f"{date}-{slugify(name)}" if date else str(ev["id"])
        while ev_slug in seen_slugs:
            ev_slug += "-2"
        seen_slugs.add(ev_slug)
        out = {
            "id": ev["id"], "slug": ev_slug, "club": club_slug, "clubName": club_name,
            "name": clean_name(name, date),
            "date": date, "time": time, "source": "vugraph", "scoring": _scoring(name, ev["pairs"], broken),
            "movement": "howell" if any(p["dir"] == "NONE" for p in pairs.values()) else "mitchell",
            "pairs": [{k2: v for k2, v in p.items() if k2 != "raw"} for p in
                      sorted(pairs.values(), key=lambda p: (p["sec"], p["grp"], p["rank"]))],
            "boards": blist,
        }
        for bd in out["boards"]:
            for r in bd["rows"]:
                pass
        with open(f"{out_dir}/data/{club_slug}/t/{ev_slug}.json", "w") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

        top = sorted(pairs.values(), key=lambda p: -p["pct"])[:1]
        events_out.append({
            "id": ev["id"], "slug": ev_slug, "name": out["name"], "date": date, "time": time,
            "pairs": len(pairs), "boards": len(boards),
            "winner": top[0]["names"] if top else [], "winnerPct": top[0]["pct"] if top else None,
            "scoring": out["scoring"],
        })
        for p in pairs.values():
            for nm, sl in zip(p["names"], p["slugs"]):
                pl = players[sl]
                pl["name"] = nm
                partner = [n for n in p["names"] if n != nm]
                pl["events"].append({"club": club_slug, "clubName": club_name, "t": ev_slug, "name": out["name"],
                                     "date": date, "pair": p["key"], "partner": partner[0] if partner else "",
                                     "pct": p["pct"], "sc": out["scoring"], "rank": p["rank"], "grp": p["grp"] or p["dir"],
                                     "field": sum(1 for q in pairs.values() if q["grp"] == p["grp"])})

    events_out.sort(key=lambda e: (e["date"] or "", e["time"] or ""), reverse=True)
    with open(f"{out_dir}/data/{club_slug}/index.json", "w") as f:
        json.dump({"club": club_slug, "name": club_name, "events": events_out}, f, ensure_ascii=False)
    return events_out


def write_players(out_dir):
    players = PLAYERS
    os.makedirs(f"{out_dir}/data/p", exist_ok=True)
    plist = []
    shards = defaultdict(dict)
    for sl, pl in players.items():
        pl["events"].sort(key=lambda e: e["date"] or "", reverse=True)
        shards[sl[:1] or "_"][sl] = {"slug": sl, **pl}
        plist.append([sl, pl["name"], len(pl["events"])])
    for k, v in shards.items():
        with open(f"{out_dir}/data/p/{k}.json", "w") as f:
            json.dump(v, f, ensure_ascii=False, separators=(",", ":"))
    plist.sort(key=lambda x: x[1])
    with open(f"{out_dir}/data/players.json", "w") as f:
        json.dump(plist, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    # Kullanım: build_data.py tools/clubs.json public
    cfg_path, out_dir = sys.argv[1], sys.argv[2]
    base = os.path.dirname(os.path.abspath(cfg_path))
    clubs = json.load(open(cfg_path))
    sim_pool = collect_simultane_pool(clubs)
    meta = []
    for c in clubs:
        raw, hints = rawstore.load(c)
        if not raw:
            print("veri yok, atlandı:", c["slug"]); continue
        evs = build(raw, c["slug"], c["name"], out_dir, hints, sim_pool)
        print(c["slug"], len(evs), "turnuva")
        m = {k: c.get(k) for k in ("slug", "name", "short", "city", "site", "aliases", "index", "tbf")} | \
            {"events": len(evs), "last": evs[0] if evs else None}
        mp_raw = os.path.join(base, "..", "raw", f"bricskor_{c['slug']}_mp.json")
        if os.path.exists(mp_raw):  # TBF MP sıralaması (tools/tbf.py)
            mp = json.load(open(mp_raw))
            with open(f"{out_dir}/data/{c['slug']}/mp.json", "w") as f:
                json.dump(mp, f, ensure_ascii=False, separators=(",", ":"))
            m["mp"] = {"count": len(mp["rows"]), "at": mp.get("at")}
        meta.append(m)
    write_players(out_dir)
    with open(f"{out_dir}/data/clubs.json", "w") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    try:
        json.dump(AMBIG, open(os.path.join(tempfile.gettempdir(), "ambig.json"), "w"))
    except OSError:
        pass
    print("belirsiz masa:", len(AMBIG))
