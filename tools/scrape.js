// briçskor vugraph çekici — clubs.vugraph.com üzerindeki bir sekmede çalıştırılır (Chrome).
// Kullanım (sayfa bağlamında): await bricskorScrape(['major','hosgoru'], {months: 2})
// Node'da: node tools/scrape_cli.mjs (GitHub Actions). Yalnızca skor.bricdersi.net'te henüz olmayan turnuvaları çeker, sonucu
// bricskor_update_<tarih>.json olarak indirir. Dosya: {"<kulüp>": {"<id>": olay}}
window.bricskorScrape = async function (clubs, opts = {}) {
  const months = opts.months || 2, workers = opts.workers || 4, force = opts.force || false;
  const dec = new TextDecoder('windows-1254');
  const get = async u => { for (let k = 0; k < 3; k++) { try { const r = await fetch(u); return new DOMParser().parseFromString(dec.decode(await r.arrayBuffer()), 'text/html'); } catch (e) { await new Promise(s => setTimeout(s, 800)); } } throw new Error('fail ' + u); };
  const tx = e => e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : '';
  const suit = c => { const im = c.querySelector('img'); return im ? (im.getAttribute('alt') || '').toUpperCase()[0] : ''; };
  const parseHand = cell => ({ name: tx(cell.querySelector('.isim')), cards: cell.innerHTML.split(/<img[^>]*>/i).slice(1).map(p => p.replace(/<br>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()).slice(0, 4).map(p => p.replace(/\s/g, '').replace(/^(-|—)$/, '')) });
  const travT = doc => [...doc.querySelectorAll('table')].find(t => t.rows[0] && /Kontrat/.test(t.rows[0].textContent) && !t.querySelector('table'));
  const handT = doc => [...doc.querySelectorAll('table')].filter(t => t.rows.length === 3 && t.rows[1] && t.rows[1].cells.length === 3 && t.querySelectorAll('img').length >= 16).pop();
  const rowsOf = t => { const rows = []; [...t.rows].forEach(tr => { const cl = tr.cells[0] && tr.cells[0].className; if (cl === 'results' || cl === 'resultspecial') { const c = [...tr.cells]; rows.push({ con: tx(c[0]) + suit(c[0]), dec: tx(c[1]), res: tx(c[2]), lead: (suit(c[3]) || '') + '|' + tx(c[3]), ns: tx(c[4]), ew: tx(c[5]), nsp: tx(c[6]), ewp: tx(c[7]), sp: cl === 'resultspecial' }); } }); return rows; };
  async function scrape(club, id) {
    const B = '/' + club + '/';
    const d = await get(B + 'eventresults.php?event=' + id);
    const title = tx(d.querySelector('h3')); const pairs = []; let grp = '';
    d.querySelectorAll('tr').forEach(tr => { const oc = tr.getAttribute('onclick'); if (!oc) { if (tr.cells.length === 1) grp = tx(tr); return; } const m = oc.match(/section.(\w+).*?pair.(\d+).*?direction.(NS|EW|NONE)/); if (m) { const c = [...tr.cells].map(tx); pairs.push({ sec: m[1], no: +m[2], dir: m[3], grp, rank: +c[0], names: c[1], pct: parseFloat(c[2]) }); } });
    for (const p of pairs) { const s = await get(B + 'pairsummary.php?event=' + id + '&section=' + p.sec + '&pair=' + p.no + '&direction=' + p.dir); p.boards = []; s.querySelectorAll('tr').forEach(tr => { const c = [...tr.cells].map(tx); if (c.length >= 4 && /^\d+$/.test(c[0])) p.boards.push({ b: +c[0], opp: c[1], score: c[2], pct: parseFloat(c[3]) }); }); }
    const boardSet = new Map(); pairs.forEach(p => p.boards.forEach(x => { if (!boardSet.has(x.b)) boardSet.set(x.b, p); }));
    const boards = {};
    for (const [b, p] of boardSet.entries()) {
      const bd = await get(B + 'boarddetails.php?event=' + id + '&section=' + p.sec + '&pair=' + p.no + '&direction=' + p.dir + '&board=' + b);
      const tt = travT(bd), ht = handT(bd); if (!tt || !ht) continue;
      boards[p.sec + '|' + b] = { sec: p.sec, b, hands: { N: parseHand(ht.rows[0].cells[1]), E: parseHand(ht.rows[1].cells[2]), S: parseHand(ht.rows[2].cells[1]), W: parseHand(ht.rows[1].cells[0]) }, rows: rowsOf(tt).map(({ sp, ...r }) => r) };
    }
    const hints = {};
    for (const p of pairs) {
      if (p.dir === 'EW') continue;
      for (const x of p.boards) {
        const bd = boards[Object.keys(boards).find(k => k.endsWith('|' + x.b))]; if (!bd) continue;
        const sc = parseInt(x.score); const sig = new Set();
        bd.rows.forEach(r => { const ns = parseInt(r.ns), ew = parseInt(r.ew); const v = !isNaN(ns) ? ns : (!isNaN(ew) ? -ew : 0); if (v === sc || v === -sc) sig.add(r.con + r.dec + r.res + r.lead); });
        if (sig.size < 2) continue;
        const dd = await get(B + 'boarddetails.php?event=' + id + '&section=' + p.sec + '&pair=' + p.no + '&direction=' + p.dir + '&board=' + x.b);
        const t = travT(dd); if (!t) continue; const idx = rowsOf(t).findIndex(r => r.sp);
        if (idx >= 0) hints[p.sec + (p.dir === 'NONE' ? 'H' : p.dir[0]) + p.no + '|' + x.b] = idx;
      }
    }
    return { id, title, pairs, boards, hints };
  }
  const now = new Date(); const out = {}; const jobs = []; const log = [];
  for (const club of clubs) {
    out[club] = {};
    let known = new Set();
    if (opts.known) known = new Set((opts.known[club] || []).map(String));
    else if (!force) { try { const idx = await (await fetch('https://skor.bricdersi.net/data/' + club + '/index.json', { cache: 'no-store' })).json(); known = new Set(idx.events.map(e => String(e.id))); } catch (e) { log.push(club + ': mevcut liste alınamadı'); } }
    for (let k = 0; k < months; k++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const cal = await get('/' + club + '/calendar.php?month=' + (dt.getMonth() + 1) + '&year=' + dt.getFullYear());
      const ids = [...new Set([...cal.querySelectorAll('a')].map(a => ((a.getAttribute('href') || '').match(/event.(\d+)/) || [])[1]).filter(Boolean))];
      ids.filter(id => !known.has(id)).forEach(id => jobs.push([club, +id]));
      log.push(club + ' ' + (dt.getMonth() + 1) + '/' + dt.getFullYear() + ': takvimde ' + ids.length + ' turnuva');
    }
  }
  const uniq = [...new Map(jobs.map(j => [j.join(':'), j])).values()];
  const q = [...uniq];
  await Promise.all(Array.from({ length: workers }, async () => { while (q.length) { const [c, id] = q.shift(); try { out[c][id] = await scrape(c, id); log.push(c + id + ' ok'); } catch (e) { log.push(c + id + ' HATA ' + e.message); } } }));
  window.__bricskorOut = out;
  const name = 'bricskor_update_' + now.toISOString().slice(0, 10) + '.json';
  if (uniq.length && opts.download !== false && typeof document !== 'undefined') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  return { yeni: uniq.length, dosya: uniq.length ? name : null, log: log.slice(-20) };
};
