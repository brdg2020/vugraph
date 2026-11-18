// scrape.js'i başsız Chromium'da (Playwright) çalıştırır — GitHub Actions günlük güncellemesi için.
// Kullanım: node tools/scrape_cli.mjs <çıktı.json> [ay sayısı=2]
// Bilinen turnuvalar repodaki raw/ dosyalarından okunur; yalnızca yeni olanlar çekilir.
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [out = 'update.json', scope = '2d'] = process.argv.slice(2);
let days = null;
let monthsCount = 2;
const scopeStr = String(scope).trim().toLowerCase();
if (scopeStr.endsWith('d') || scopeStr.endsWith('g') || scopeStr === 'gunluk') {
  days = parseInt(scopeStr) || 2;
} else if (process.env.DAYS) {
  days = parseInt(process.env.DAYS) || 2;
} else {
  monthsCount = +scopeStr || 2;
}
const readJSON = (p, d) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d;

const only = (process.env.KULUPLER || '').split(',').map(x => x.trim()).filter(Boolean); // boşsa hepsi
const clubs = readJSON(path.join(ROOT, 'tools', 'clubs.json'), []).filter(c => !only.length || only.includes(c.slug) || only.includes(c.vugraph));
const max = +(process.env.EN_COK || 0) || undefined; // tek çalıştırmada en fazla kaç turnuva
const skipP = path.join(ROOT, 'raw', 'bricskor_skip.json'); // eli olmayan olaylar (ör. genel sıralama) her gün tekrar çekilmesin
const skip = readJSON(skipP, {});
const known = {};
const idsOf = c => { const d = path.join(ROOT, 'raw', c.slug); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : []; };
for (const c of clubs) known[c.vugraph] = [...idsOf(c), ...(skip[c.vugraph] || [])];

const browser = await chromium.launch(process.env.CHROME_CHANNEL === 'none' ? {} : { channel: process.env.CHROME_CHANNEL || 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.goto(`https://clubs.vugraph.com/${clubs[0].vugraph}/calendar.php`, { timeout: 60000 });
await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'tools', 'scrape.js'), 'utf8') });
page.setDefaultTimeout(0);
const res = await page.evaluate(([c, m, d, k, x]) => window.bricskorScrape(c, { months: m, days: d, known: k, max: x, download: false }),
  [clubs.map(c => c.vugraph), monthsCount, days, known, max]);
const data = await page.evaluate(() => window.__bricskorOut || {});
await browser.close();

for (const [club, evs] of Object.entries(data))
  for (const [id, ev] of Object.entries(evs))
    if (!Object.keys(ev.boards || {}).length && !(skip[club] ||= []).includes(id)) skip[club].push(id);
fs.mkdirSync(path.dirname(skipP), { recursive: true });
fs.writeFileSync(skipP, JSON.stringify(skip));
fs.writeFileSync(out, JSON.stringify(data));
console.log(JSON.stringify({ yeni: res.yeni, takvim: res.takvim, log: res.log }));
if (!res.takvim && !days) { console.error('vugraph takviminde hiç turnuva bulunamadı — site erişimi engellenmiş olabilir'); process.exit(1); }
for (const [club, evs] of Object.entries(data))
  for (const ev of Object.values(evs)) console.log(`  ${club}: ${ev.title} (${Object.keys(ev.boards).length} el)`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `yeni=${res.yeni}\n`);
