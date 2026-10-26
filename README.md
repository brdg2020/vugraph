# briçskor (vugraph)

Briç kulüplerinin turnuva sonuçlarını yayımlayan site — https://skor.bricdersi.net

- Takvim, sıralama, skor kartları, matris, oyuncu sayfaları
- Kulüp başına TBF güncel MP sıralaması (`/kulup/<kulüp>/mp-siralamasi`), oyuncu sayfasında güncel MP
- Tek el görünümü: kompakt diyagram, el şeridi, klavye/kaydırma ile geçiş
- Double dummy tablosu, par ve masa bazında DD karşılaştırması, atak analizi
- BBO tarzı eli oynama: her kartta canlı double dummy (DDS → WebAssembly, tarayıcıda çalışır)
- PBN/LIN indirme, BBO'da açma, kulüp sitelerine gömülebilir pencere (`/embed/kulup/<kulüp>`)

## Yapı

| Klasör | İçerik |
|---|---|
| `public/` | Statik site (Firebase Hosting). `app.js` yönlendirme ve sayfalar, `board-view.js` el görünümü ve oynatıcı, `dd-worker.js` + `dds.wasm` tarayıcıda double dummy |
| `public/data/` | Üretilmiş JSON: `<kulüp>/index.json`, `<kulüp>/t/<turnuva>.json`, `players.json`, `p/<harf>.json` |
| `tools/build_data.py` | vugraph ham verisini site verisine çevirir, double dummy tablosu, par ve atak analizini ekler |
| `tools/ddrun.cpp` | `build_data.py`'nin kullandığı yerel DDS sürücüsü |
| `tools/serve.py` | Yerel test sunucusu (SPA yönlendirmeli) |
| `wasm/` | DDS'i WebAssembly'e derleme betiği ve köprü kodu |

## Veri üretme

Kulüpler `tools/clubs.json` içinde tanımlı (`vugraph`: vugraph kısa adı, `tbf`: TBF kulüp kimliği, `index: true` olanlar Google'a açık). Her kulübün vugraph ham verisi ve TBF sıralaması `raw/` klasöründe; double dummy önbelleği `tools/.ddcache.json`.

```bash
# DDS'i yerel olarak derle (bir kez)
git clone --depth 1 https://github.com/dds-bridge/dds.git /tmp/dds
mkdir -p /tmp/ddsbuild
g++ -std=c++20 -O2 -fPIC -shared -I /tmp/dds/library/src -I /tmp/dds/library/src/api $(find /tmp/dds/library/src -name "*.cpp") -o /tmp/ddsbuild/libdds.so -lpthread
g++ -std=c++20 -O2 -I /tmp/dds/library/src tools/ddrun.cpp -L/tmp/ddsbuild -ldds -Wl,-rpath,/tmp/ddsbuild -o /tmp/ddsbuild/ddrun

# tüm kulüplerin verisini üret, sonra arama motoru sayfalarını oluştur
DDRUN=/tmp/ddsbuild/ddrun python3 tools/build_data.py tools/clubs.json public
python3 tools/prerender.py public
```

`prerender.py` her kulüp için `public/kulup/<kulüp>.html` (ör. "Major Boğaziçi Briç Spor Kulübü Skorları"), her turnuva için `public/kulup/<kulüp>/<turnuva>.html`, ayrıca `index.html`, `app.html` (diğer yollar, noindex), `sitemap.xml` ve `robots.txt` üretir. Sayfalar JavaScript olmadan da sıralamayı gösterir; JavaScript yüklenince uygulama devralır.

### Günlük güncelleme (GitHub Actions)

`.github/workflows/gunluk.yml` her gün **17:15** ve **23:40 (İstanbul)**'da çalışır, bilgisayar açık olmasına gerek yoktur:

1. `tools/scrape_cli.mjs` — `scrape.js`'i başsız Chromium'da çalıştırır, vugraph'tan yalnızca `raw/`'da olmayan turnuvaları çeker
2. `tools/tbf.py` — TBF güncel MP sıralamasını çeker (`raw/bricskor_<kulüp>_mp.json`)
3. `tools/update.py` — ham veriyi ekler, `build_data.py` + `prerender.py` ile siteyi üretir
4. Değişiklik varsa repoya commit eder ve Firebase Hosting'e yayımlar

Elle çalıştırmak için: Actions → "Günlük skor güncellemesi" → Run workflow.

Yayın anahtarsızdır: GitHub, Google Cloud'daki `github` Workload Identity havuzu üzerinden `github-deploy@bricskor.iam.gserviceaccount.com` servis hesabı (Firebase Hosting Admin) kimliğine bürünür. Repoda secret gerekmez; havuz yalnızca `brdg2020/vugraph` reposunu kabul eder.

Ağ erişimi olmayan bir ortamda elle güncelleme: tarayıcıda `tools/scrape.js` (clubs.vugraph.com üzerinde) ve `tools/tbf.js` (mp.tbricfed.org.tr üzerinde) çalıştırılır, indirilen dosyalar `update.py <dosya>` ve `tbf.py --from <dosya>` ile içe aktarılır.

## Yerel test ve yayın

```bash
python3 tools/serve.py public          # http://127.0.0.1:8088
firebase deploy --only hosting --project bricskor
```

Firebase: `erdembridge1@gmail.com` hesabı, proje `bricskor`, alan adı `skor.bricdersi.net` (Squarespace DNS'te CNAME `skor` → `bricskor.web.app`).

Kulüp ve turnuva sayfaları Google'a açık; el, oyuncu ve gömülü (`/embed`) sayfalar `noindex`. Yayından sonra `sitemap.xml` Google Search Console'a gönderilmeli.

## Lisans notu

Double dummy motoru [DDS](https://github.com/dds-bridge/dds) (Bo Haglund, Soren Hein — Apache-2.0) WebAssembly'e derlenerek kullanılmaktadır.
