#!/usr/bin/env python3
"""Arama motorları için hazır HTML sayfaları üretir.

Kullanım: prerender.py public [site_url]
- public/index.html            ana sayfa (dizine açık)
- public/kulup/<k>.html        kulüp skor sayfası (kulüp "index": true ise dizine açık)
- public/kulup/<k>/<t>.html    turnuva sıralaması
- public/app.html              diğer tüm yollar için (noindex) uygulama kabuğu
- public/sitemap.xml, public/robots.txt
"""
import html, json, os, sys
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
            f'<div class="win">1. <b>{e(" – ".join(ev.get("winner") or []))}</b><br>%{ev.get("winnerPct") or ""}</div></a>')


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
                f'<table class="t"><thead><tr><th>#</th><th>Çift</th><th class="num">%</th></tr></thead><tbody>{rows}</tbody></table></div></div>')
    return out


clubs = json.load(open(os.path.join(PUB, "data", "clubs.json")))
urls = []
today = date.today().isoformat()

# --- uygulama kabuğu (diğer yollar)
write("app.html", page("", "briçskor — Kulüp briç turnuva sonuçları", "Briç kulüplerinin turnuva sonuçları.",
                       '<div class="loading">Yükleniyor…</div>', index=False))

# --- ana sayfa
latest = sorted([dict(c["last"], club=c["slug"], label=c.get("short") or c["name"]) for c in clubs if c.get("last")],
                key=lambda x: (x.get("date") or "") + (x.get("time") or ""), reverse=True)
home = ('<h1>Kulüp turnuva sonuçları</h1><p class="sub">Sıralama, eller, double dummy ve atak analizi, eli tekrar oynama. Telefonda da rahat.</p>'
        '<input class="search" id="q" placeholder="İsim arayın" autocomplete="off"><div class="card results-list" id="qres" hidden></div>'
        '<h2>Kulüpler</h2><div class="clubs">'
        + "".join(f'<a class="card club" href="/kulup/{c["slug"]}"><div class="nm">{e(c["name"])} skorları</div>'
                  f'<div class="meta">{e(c.get("city"))} · {c["events"]} turnuva</div></a>' for c in clubs)
        + '</div><h2>Son turnuvalar</h2><div class="card evlist">' + "".join(ev_row(x["club"], x, x["label"]) for x in latest) + "</div>")
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
    last_html = ""
    if evs:
        lev = json.load(open(os.path.join(PUB, "data", slug, "t", evs[0]["slug"] + ".json")))
        last_html = (f'<h2>Son turnuva: <a href="/kulup/{slug}/{lev["slug"]}">{e(lev["name"])}</a> '
                     f'<span class="note">{fdate(lev["date"])} {e(lev.get("time"))}</span></h2>' + ranking(lev)
                     + f'<div class="row"><a class="btn sm primary" href="/kulup/{slug}/{lev["slug"]}/el/1">Elleri gör ›</a></div>')
    body = (f'<div class="crumb"><a href="/">Kulüpler</a>›</div><h1>{e(name)} skorları</h1>'
            f'<p class="sub">{e(c.get("city"))} · {len(evs)} turnuva · güncel turnuva sonuçları</p>' + last_html
            + '<h2>Tüm turnuvalar</h2><div class="card evlist">' + "".join(ev_row(slug, x) for x in evs) + "</div>")
    short = c.get("short") or name
    title = f"{name} Skorları – Güncel Turnuva Sonuçları | briçskor"
    desc = (f"{short} briç turnuva skorları: " + (f"son turnuva {evs[0]['name']} ({fdate(evs[0]['date'])}). " if evs else "")
            + "Sıralama, eller, double dummy analizi, skor kartları ve eli tekrar oynama.")
    ld = {"@context": "https://schema.org", "@type": "SportsOrganization", "name": name, "sport": "Bridge",
          "url": f"{SITE}/kulup/{slug}", **({"sameAs": [c["site"]]} if c.get("site") else {}),
          **({"address": {"@type": "PostalAddress", "addressLocality": c["city"].split("·")[-1].strip(), "addressCountry": "TR"}} if c.get("city") else {})}
    write(f"kulup/{slug}.html", page(f"/kulup/{slug}", title, desc, body, index=bool(c.get("index")), jsonld=ld))
    if c.get("index"):
        urls.append((f"/kulup/{slug}", evs[0]["date"] if evs else today))
    for x in evs:
        ev = json.load(open(os.path.join(PUB, "data", slug, "t", x["slug"] + ".json")))
        body = (f'<div class="crumb"><a href="/">Kulüpler</a>›<a href="/kulup/{slug}">{e(name)}</a>›</div>'
                f'<h1>{e(ev["name"])}</h1><p class="sub">{fdate(ev["date"])}, {dow(ev["date"]) if ev.get("date") else ""} {e(ev.get("time"))} · '
                f'{len(ev["pairs"])} çift · {len(ev["boards"])} el</p>' + ranking(ev)
                + f'<div class="row"><a class="btn sm primary" href="/kulup/{slug}/{ev["slug"]}/el/1">Elleri gör ›</a></div>')
        title = f"{ev['name']} {fdate(ev['date'])} Sonuçları – {short} Skorları"
        win = next((p for p in ev["pairs"] if p["rank"] == 1), None)
        desc = (f"{short} {ev['name']} {fdate(ev['date'])} briç turnuvası sonuçları"
                + (f": 1. {' – '.join(win['names'])} (%{win['pct']:.2f})." if win else ".") + " Eller, double dummy ve skor kartları.")
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
