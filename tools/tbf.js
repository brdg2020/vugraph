// TBF MP sıralaması — mp.tbricfed.org.tr üzerindeki bir sekmede çalıştırılır (yalnızca ağ yoksa; normalde tools/tbf.py).
// Kullanım: await bricskorTbf({major: 134, hosgoru: 98})  → bricskor_mp_<tarih>.json indirir
// Sonra: python3 tools/tbf.py --from <indirilen dosya>
window.bricskorTbf = async function (clubs) {
  const out = {};
  for (const [slug, id] of Object.entries(clubs)) {
    let page = 1, meta = {}, rows = [];
    while (true) {
      const j = await (await fetch(`/api/ranking/list?mode=guncel&club=${id}&page=${page}`, { headers: { Accept: 'application/json' } })).json();
      meta = j.meta;
      rows.push(...j.data.map(x => [x.rank, x.id, `${x.first_name || ''} ${x.last_name || ''}`.trim(), x.title?.name || '', x.value, x.city?.name || '', x.visa_type || '']));
      if (page >= (meta.last_page || 1)) break;
      page++; await new Promise(r => setTimeout(r, 400));
    }
    out[slug] = { club_id: id, at: meta.last_calculated_at, explanation: meta.explanation, fetched: new Date().toISOString(), cols: ['rank', 'id', 'name', 'title', 'mp', 'city', 'visa'], rows };
  }
  window.__bricskorTbf = out;
  const name = 'bricskor_mp_' + new Date().toISOString().slice(0, 10) + '.json';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.rows.length]));
};
