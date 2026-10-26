// scrape.js'i başsız Chromium'da (Playwright) çalıştırır — GitHub Actions günlük güncellemesi için.
// Kullanım: node tools/scrape_cli.mjs <çıktı.json> [ay sayısı=2]
// Bilinen turnuvalar repodaki raw/ dosyalarından okunur; yalnızca yeni olanlar çekilir.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [out = 'update.json', months = '2'] = process.argv.slice(2);
const readJSON = (p, d) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d;

const clubs = readJSON(path.join(ROOT, 'tools', 'clubs.json'), []);
const skipP = path.join(ROOT, 'raw', 'bricskor_skip.json'); // eli olmayan olaylar (ör. genel sıralama) her gün tekrar çekilmesin
const skip = readJSON(skipP, {});
const known = {};
for (const c of clubs) known[c.vugraph] = [...Object.keys(readJSON(path.join(ROOT, c.raw), {})), ...(skip[c.vugraph] || [])];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`https://clubs.vugraph.com/${clubs[0].vugraph}/calendar.php`, { timeout: 60000 });
await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'tools', 'scrape.js'), 'utf8') });
page.setDefaultTimeout(0);
const res = await page.evaluate(([c, m, k]) => window.bricskorScrape(c, { months: m, known: k, download: false }),
  [clubs.map(c => c.vugraph), +months, known]);
const data = await page.evaluate(() => window.__bricskorOut || {});
await browser.close();

for (const [club, evs] of Object.entries(data))
  for (const [id, ev] of Object.entries(evs))
    if (!Object.keys(ev.boards || {}).length && !(skip[club] ||= []).includes(id)) skip[club].push(id);
fs.mkdirSync(path.dirname(skipP), { recursive: true });
fs.writeFileSync(skipP, JSON.stringify(skip));
fs.writeFileSync(out, JSON.stringify(data));
console.log(JSON.stringify({ yeni: res.yeni, log: res.log }));
for (const [club, evs] of Object.entries(data))
  for (const ev of Object.values(evs)) console.log(`  ${club}: ${ev.title} (${Object.keys(ev.boards).length} el)`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `yeni=${res.yeni}\n`);
