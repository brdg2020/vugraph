// Tanı: bir vugraph turnuvasının sayfalarını özetler. node tools/debug_event.mjs <kulüp> <id>
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const [club, id] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.goto(`https://clubs.vugraph.com/${club}/calendar.php`);
const out = await page.evaluate(async ([club, id]) => {
  const dec = new TextDecoder('windows-1254');
  const get = async u => dec.decode(await (await fetch(u)).arrayBuffer());
  const strip = h => h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const B = '/' + club + '/';
  const er = strip(await get(B + 'eventresults.php?event=' + id));
  const oc = (er.match(/onclick="[^"]*"/gi) || []).slice(0, 3);
  const r = { eventresults: er.slice(er.indexOf('<body'), er.indexOf('<body') + 2500), onclicks: oc };
  const m = er.match(/section.(\w+).*?pair.(\d+).*?direction.(NS|EW|NONE)/);
  if (m) {
    const ps = strip(await get(B + `pairsummary.php?event=${id}&section=${m[1]}&pair=${m[2]}&direction=${m[3]}`));
    r.pairsummary = ps.slice(ps.indexOf('<body'), ps.indexOf('<body') + 2500);
    const b = (ps.match(/board.(\d+)/) || [])[1] || 1;
    const bd = strip(await get(B + `boarddetails.php?event=${id}&section=${m[1]}&pair=${m[2]}&direction=${m[3]}&board=${b}`));
    r.boarddetails = bd.slice(bd.indexOf('<body'), bd.indexOf('<body') + 6000);
  }
  return r;
}, [club, id]);
await browser.close();
for (const [k, v] of Object.entries(out)) console.log(`===== ${k}\n${typeof v === 'string' ? v : JSON.stringify(v)}`);
