# briçskor (vugraph)

Briç kulüplerinin turnuva sonuçlarını yayımlayan site — https://skor.bricdersi.net

- Takvim, sıralama, skor kartları, matris, oyuncu sayfaları
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

```bash
# DDS'i yerel olarak derle (bir kez)
git clone --depth 1 https://github.com/dds-bridge/dds.git /tmp/dds
g++ -std=c++20 -O2 -fPIC -shared -I /tmp/dds/library/src -I /tmp/dds/library/src/api $(find /tmp/dds/library/src -name "*.cpp") -o /tmp/ddsbuild/libdds.so -lpthread
g++ -std=c++20 -O2 -I /tmp/dds/library/src tools/ddrun.cpp -L/tmp/ddsbuild -ldds -Wl,-rpath,/tmp/ddsbuild -o /tmp/ddsbuild/ddrun

# ham veriden site verisi üret
DDRUN=/tmp/ddsbuild/ddrun python3 tools/build_data.py raw/bricskor_major_raw.json major "Major Boğaziçi Briç Spor Kulübü" public
```

## Yerel test ve yayın

```bash
python3 tools/serve.py public          # http://127.0.0.1:8088
firebase deploy --only hosting --project bricskor
```

Firebase: `erdembridge1@gmail.com` hesabı, proje `bricskor`, alan adı `skor.bricdersi.net` (Squarespace DNS'te CNAME `skor` → `bricskor.web.app`).

Site şu an `noindex` (Google'a kapalı). Yayına açarken `public/index.html` içindeki robots etiketi, `public/robots.txt` ve `firebase.json` içindeki `X-Robots-Tag` başlığı kaldırılmalı.

## Lisans notu

Double dummy motoru [DDS](https://github.com/dds-bridge/dds) (Bo Haglund, Soren Hein — Apache-2.0) WebAssembly'e derlenerek kullanılmaktadır.
