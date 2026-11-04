#!/usr/bin/env python3
"""Arama motorları için hazır HTML sayfaları üretir.

Kullanım: prerender.py public [site_url]
- public/index.html            ana sayfa (dizine açık)
- public/kulup/<k>.html        kulüp skor sayfası (kulüp "index": true ise dizine açık)
- public/kulup/<k>/<t>.html    turnuva sıralaması
- public/app.html              diğer tüm yollar için (noindex) uygulama kabuğu
- public/sitemap.xml, public/robots.txt
"""
import html, json, os, re, sys
from datetime import date

PUB = sys.argv[1]
SITE = (sys.argv[2] if len(sys.argv) > 2 else "https://skor.bricdersi.net").rstrip("/")
TPL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html")).read()
MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
e = lambda s: html.escape(str(s if s is not None else ""), quote=True)


def fdate(d):
    if not d:
        return ""
    y, m, dd = map(int, d.split("-"))
    return f"{dd} {MONTHS[m - 1]} {y}"


def dow(d):
    y, m, dd = map(int, d.split("-"))
    return DAYS[date(y, m, dd).weekday()]



def brand(c):
    """Google başlığı için kısa kulüp adı: "Yalıkavak İhtisas Briç", "Major Boğaziçi Briç"."""
    b = re.sub(r"\s*\(.*?\)", "", c.get("short") or c["name"]).strip()
    return b if "briç" in b.lower() else b + " Briç"


def is_imp(ev):
    if re.search(r"imp|lehman|butler|takım|pairs", ev.get("name") or "", re.I):
        return True
    ps = [p["pct"] for p in ev.get("pairs", []) if p.get("pct") is not None]
    return bool(ps) and (min(ps) < 0 or max(ps) > 100)


def fmt_score(ev, pct):
    sc = ev.get("scoring") or ("imp" if is_imp(ev) else "pct")
    if sc == "pct":
        return f"%{pct:.2f}"
    return f"{round(pct, 2):g} " + ("IMP" if sc == "imp" else "puan")

def page(path, title, desc, content, index=True, jsonld=None):
    out = TPL
    canon = f'<link rel="canonical" href="{SITE}{path}">' if path else ""
    ld = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    for k, v in {"{{ROBOTS}}": "index, follow" if index else "noindex, follow", "{{CANONICAL}}": canon,
                 "{{TITLE}}": e(title), "{{DESC}}": e(desc), "{{JSONLD}}": ld, "{{CONTENT}}": content}.items():
        out = out.replace(k, v)
    return out


def write(rel, text):
    p = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(text)


def ev_row(club, ev, label=""):
    y, m, d = (ev.get("date") or "--- -- --").split("-") if ev.get("date") else ("", "0", "")
    meta = (e(label) + " · " if label else "") + (dow(ev["date"]) + " " if ev.get("date") else "") + e(ev.get("time") or "")
    return (f'<a class="ev" href="/kulup/{club}/{ev["slug"]}"><div class="dt"><div class="d">{int(d) if d else ""}</div>'
            f'<div class="m">{MONTHS[int(m) - 1][:3] if m and m != "0" else ""}</div></div>'
            f'<div><div class="nm">{e(ev["name"])}</div><div class="meta">{meta} · {ev["pairs"]} çift · {ev["boards"]} el</div></div>'
            f'<div class="win">1. <b>{e(" – ".join(ev.get("winner") or []))}</b><br>{fmt_score(ev, ev["winnerPct"]) if ev.get("winnerPct") is not None else ""}</div></a>')


def ranking(ev):
    order = {"NS": 0, "EW": 1}
    groups = {}
    for p in sorted(ev["pairs"], key=lambda p: (order.get(p["dir"], 2), p["rank"])):
        g = p.get("grp") or {"NS": "Kuzey - Güney", "EW": "Doğu - Batı"}.get(p["dir"], "Genel")
        groups.setdefault(g, []).append(p)
    out = ""
    for g, lst in groups.items():
        lst.sort(key=lambda p: p["rank"])
        rows = "".join(
            f'<tr><td><span class="rank r{p["rank"]}">{p["rank"]}</span></td><td class="names">'
            + " – ".join(f'<a href="/oyuncu/{s}">{e(n)}</a>' for n, s in zip(p["names"], p["slugs"]))
            + f'</td><td class="num pct">{p["pct"]:.2f}</td></tr>' for p in lst)
        out += (f'<div class="card" style="margin-bottom:14px"><div class="sect-title">{e(g)}</div><div class="tbl-wrap">'
                f'<table class="t"><thead><tr><th>#</th><th>Çift</th><th class="num">{"%" if ev.get("scoring", "pct") == "pct" else ("IMP" if ev.get("scoring") == "imp" else "Puan")}</th></tr></thead><tbody>{rows}</tbody></table></div></div>')
    return out


DOW = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]


def calendar(club, evs):
    if not evs:
        return ""
    ym = max(x["date"] for x in evs if x.get("date"))[:7]
    Y, M = map(int, ym.split("-"))
    import calendar as _c
    start = date(Y, M, 1).weekday()
    days = _c.monthrange(Y, M)[1]
    months = sorted({x["date"][:7] for x in evs if x.get("date")}, reverse=True)
    cells = "".join(f'<div class="dow{" we" if i > 4 else ""}">{d}</div>' for i, d in enumerate(DOW))
    cells += '<div class="day out"></div>' * start
    for d in range(1, days + 1):
        ds = f"{ym}-{d:02d}"
        lst = sorted([x for x in evs if x.get("date") == ds], key=lambda x: x.get("time") or "")
        we = " we" if (start + d - 1) % 7 > 4 else ""
        links = "".join(f'<a href="/kulup/{club}/{x["slug"]}" title="{e(x["name"])} · {e(x.get("time"))}" data-n="{e(x["name"])}"><span class="et">{e(x.get("time"))}</span>{e(x["name"])}</a>' for x in lst)
        cells += f'<div class="day{" has" if lst else ""}{we}"><span class="n">{d}</span>{links}</div>'
    cells += '<div class="day out"></div>' * ((7 - (start + days) % 7) % 7)
    prev = months[1] if len(months) > 1 else None
    nav_prev = f'<a class="nav-arrow" href="/kulup/{club}?ay={prev}" aria-label="Önceki ay">‹</a>' if prev else '<span class="nav-arrow dis">‹</span>'
    return (f'<div class="card calbox"><div class="cal-head">{nav_prev}<b>{MONTHS[M - 1]} {Y}</b><span class="nav-arrow dis">›</span></div>'
            f'<div class="cal big">{cells}</div></div><p class="note">Bir turnuvaya dokunun: sıralama, eller, double dummy ve eli oynama.</p>')


clubs = json.load(open(os.path.join(PUB, "data", "clubs.json")))
urls = []
today = date.today().isoformat()

# --- uygulama kabuğu (diğer yollar)
write("app.html", page("", "briçskor — Kulüp briç turnuva sonuçları", "Briç kulüplerinin turnuva sonuçları.",
                       '<div class="loading">Yükleniyor…</div>', index=False))

# --- ana sayfa
tr_order = "a b c ç d e f g ğ h ı i j k l m n o ö p r s ş t u ü v y z".split()
tr_map = {c: i for i, c in enumerate(tr_order)}
def tr_key(s):
    return [tr_map.get(ch, ord(ch) + 1000) for ch in (s or "").lower()]

clubs_az = sorted(clubs, key=lambda c: tr_key(c.get("short") or c["name"]))

def prerender_club_card(c):
    short_name = c.get("short") or c["name"]
    last_str = ""
    if c.get("last") and c["last"].get("date"):
        try:
            _, m, d = c["last"]["date"].split("-")
            last_str = f'<span class="c-last">son: {int(d)} {MONTHS[int(m)-1][:3]}</span>'
        except Exception:
            pass
    city = e(c.get("city") or "")
    return (
        f'<a class="card club" href="/kulup/{c["slug"]}" data-link title="{e(c["name"])}">'
        f'<div class="c-head"><div class="nm">{e(short_name)}</div>'
        f'<span class="c-badge" title="{c["events"]} turnuva">{c["events"]}</span></div>'
        f'<div class="meta"><span class="c-city">{city}</span>{last_str}</div></a>'
    )

soon_card = ('<div class="card club soon"><div class="c-head"><div class="nm">+ Kulübünüzü ekleyin</div></div>'
             '<div class="meta"><span class="c-city">Sonuçlarınızı yayımlayın</span></div></div>')

clubs_markup = (
    '<div class="clubs-header">'
    '<div class="clubs-title-row">'
    f'<h2>Kulüpler <span class="clubs-count" id="club-count">({len(clubs)})</span></h2>'
    '<div class="club-filter-box">'
    '<svg class="search-ico" viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35"/></svg>'
    '<input type="search" id="club-q" class="club-filter-input" placeholder="Kulüp veya şehir ara…" autocomplete="off">'
    '</div></div>'
    '<div class="club-sort-row"><span class="sort-label">Sırala:</span>'
    '<div class="sort-chips" role="radiogroup" aria-label="Kulüp sıralama">'
    '<button type="button" class="sort-chip on" data-sort="az" aria-checked="true">A → Z</button>'
    '<button type="button" class="sort-chip" data-sort="events" aria-checked="false">En Çok Turnuva</button>'
    '<button type="button" class="sort-chip" data-sort="recent" aria-checked="false">En Yeni</button>'
    '<button type="button" class="sort-chip" data-sort="city" aria-checked="false">Şehir</button>'
    '</div></div></div>'
    f'<div class="clubs" id="clubs-grid">{"".join(prerender_club_card(c) for c in clubs_az)}{soon_card}</div>'
)

latest = sorted([dict(c["last"], club=c["slug"], label=c.get("short") or c["name"]) for c in clubs if c.get("last")],
                key=lambda x: (x.get("date") or "") + (x.get("time") or ""), reverse=True)
home = ('<h1>Kulüp turnuva sonuçları</h1><p class="sub">Sıralama, eller, double dummy ve atak analizi, eli tekrar oynama. Telefonda da rahat.</p>'
        '<input class="search" id="q" placeholder="İsim arayın" autocomplete="off"><div class="card results-list" id="qres" hidden></div>'
        + clubs_markup
        + '<h2>Son turnuvalar</h2><div class="card evlist">' + "".join(ev_row(x["club"], x, x["label"]) for x in latest) + "</div>")
names = ", ".join(c.get("short") or c["name"] for c in clubs)
write("index.html", page("/", "briçskor — Briç kulüp skorları ve turnuva sonuçları",
                         f"Briç kulüplerinin güncel turnuva skorları: {names}. Sıralama, eller, double dummy analizi ve eli oynama.",
                         home, index=True,
                         jsonld={"@context": "https://schema.org", "@type": "WebSite", "name": "briçskor", "url": SITE + "/"}))
urls.append(("/", today))

# --- kulüp ve turnuva sayfaları
for c in clubs:
    slug, name = c["slug"], c["name"]
    idx = json.load(open(os.path.join(PUB, "data", slug, "index.json")))
    evs = idx["events"]
    body = (f'<div class="crumb"><a href="/">Kulüpler</a>›</div><h1 class="club-h">{e(name)} skorları</h1>'
            f'<p class="sub">{e(c.get("city"))} · {len(evs)} turnuva</p>'
            + (f'<nav class="tabs"><a class="on" href="/kulup/{slug}">Turnuvalar</a><a href="/kulup/{slug}/mp-siralamasi">MP sıralaması</a></nav>' if c.get("mp") else "")
            + calendar(slug, evs)
            + '<details class="arsiv"><summary>Tüm turnuvalar</summary><div class="card evlist">'
            + "".join(ev_row(slug, x) for x in evs) + "</div></details>")
    short = c.get("short") or name
    title = f"{brand(c)} Skorları – Güncel Turnuva Sonuçları | briçskor"
    desc = (f"{brand(c)} turnuva skorları: " + (f"son turnuva {evs[0]['name']} ({fdate(evs[0]['date'])}). " if evs else "")
            + "Sıralama, eller, double dummy analizi, skor kartları ve eli tekrar oynama.")
    ld = {"@context": "https://schema.org", "@type": "SportsOrganization", "name": name, "sport": "Bridge",
          "url": f"{SITE}/kulup/{slug}", **({"sameAs": [c["site"]]} if c.get("site") else {}),
          **({"address": {"@type": "PostalAddress", "addressLocality": c["city"].split("·")[-1].strip(), "addressCountry": "TR"}} if c.get("city") else {})}
    write(f"kulup/{slug}.html", page(f"/kulup/{slug}", title, desc, body, index=bool(c.get("index")), jsonld=ld))
    if c.get("index"):
        urls.append((f"/kulup/{slug}", evs[0]["date"] if evs else today))
    mp_p = os.path.join(PUB, "data", slug, "mp.json")
    if c.get("mp") and os.path.exists(mp_p):  # TBF MP sıralaması
        mp = json.load(open(mp_p))
        trn = lambda s: " ".join(w[:1] + w[1:].replace("I", "ı").replace("İ", "i").lower() for w in str(s).split())
        rows = "".join(f'<tr><td class="num">{r[0]}</td><td>{e(trn(r[2]))}<div class="note">{e(r[3])}</div></td>'
                       f'<td class="num pct">{r[4]:.2f}</td></tr>' for r in mp["rows"][:300])
        body = (f'<div class="crumb"><a href="/">Kulüpler</a>›<a href="/kulup/{slug}">{e(name)}</a>›</div>'
                f'<h1 class="club-h">{e(name)} MP sıralaması</h1><p class="sub">TBF güncel masterpoint sıralaması · {len(mp["rows"])} sporcu</p>'
                f'<nav class="tabs"><a href="/kulup/{slug}">Turnuvalar</a><a class="on" href="/kulup/{slug}/mp-siralamasi">MP sıralaması</a></nav>'
                f'<div class="card tbl-wrap"><table class="t"><thead><tr><th class="num">Sıra</th><th>Sporcu</th><th class="num">Güncel MP</th></tr></thead><tbody>{rows}</tbody></table></div>'
                f'<p class="note">{e(mp.get("explanation"))} Kaynak: Türkiye Briç Federasyonu.</p>')
        short = c.get("short") or name
        write(f"kulup/{slug}/mp-siralamasi.html", page(f"/kulup/{slug}/mp-siralamasi", f"{name} MP Sıralaması – TBF Güncel Masterpoint | briçskor",
              f"{short} sporcularının Türkiye Briç Federasyonu güncel masterpoint (MP) sıralaması: {len(mp['rows'])} sporcu.", body, index=bool(c.get("index"))))
        if c.get("index"):
            urls.append((f"/kulup/{slug}/mp-siralamasi", (mp.get("at") or today)[:10]))
    for x in evs:
        ev = json.load(open(os.path.join(PUB, "data", slug, "t", x["slug"] + ".json")))
        body = (f'<div class="crumb"><a href="/">Kulüpler</a>›<a href="/kulup/{slug}">{e(name)}</a>›</div>'
                f'<h1>{e(ev["name"])}</h1><p class="sub">{fdate(ev["date"])}, {dow(ev["date"]) if ev.get("date") else ""} {e(ev.get("time"))} · '
                f'{len(ev["pairs"])} çift · {len(ev["boards"])} el</p>' + ranking(ev)
                + f'<div class="row"><a class="btn sm primary" href="/kulup/{slug}/{ev["slug"]}/el/1">Elleri gör ›</a></div>')
        title = f"{brand(c)} – {ev['name']} ({fdate(ev['date'])}) Sonuçları"
        win = next((p for p in ev["pairs"] if p["rank"] == 1), None)
        desc = (f"{brand(c)} turnuvası: {ev['name']}, {fdate(ev['date'])}. Sonuçlar"
                + (f" – 1. {' – '.join(win['names'])} ({fmt_score(ev, win['pct'])})." if win else ".") + " Eller, double dummy ve skor kartları.")
        ld = {"@context": "https://schema.org", "@type": "SportsEvent", "name": f"{ev['name']} – {name}",
              "startDate": f"{ev['date']}T{ev.get('time') or '00:00'}:00+03:00", "sport": "Bridge",
              "eventStatus": "https://schema.org/EventScheduled",
              "location": {"@type": "Place", "name": name, "address": {"@type": "PostalAddress", "addressCountry": "TR"}},
              "organizer": {"@type": "SportsOrganization", "name": name, "url": f"{SITE}/kulup/{slug}"}}
        write(f"kulup/{slug}/{ev['slug']}.html", page(f"/kulup/{slug}/{ev['slug']}", title, desc, body, index=bool(c.get("index")), jsonld=ld))
        if c.get("index"):
            urls.append((f"/kulup/{slug}/{ev['slug']}", ev["date"]))

write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{d}</lastmod></url>\n" for u, d in urls) + "</urlset>\n")
write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /embed/\nSitemap: {SITE}/sitemap.xml\n")
print(len(urls), "URL sitemap'te")
