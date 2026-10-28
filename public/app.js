// briçskor — kulüp turnuva sonuçları
import { mountPlayer } from '/board-view.js?v=3';
const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const SEATS = ['N', 'E', 'S', 'W'];
const SEAT_TR = { N: 'Kuzey', E: 'Doğu', S: 'Güney', W: 'Batı' };
const SUITS = ['S', 'H', 'D', 'C'];
const SYM = { S: '♠\uFE0E', H: '♥\uFE0E', D: '♦\uFE0E', C: '♣\uFE0E', N: 'NT' };
const DD_STRAINS = ['S', 'H', 'D', 'C', 'N']; // DDS sırası
const SHOW_STRAINS = ['N', 'S', 'H', 'D', 'C'];
const RANKS = '23456789TJQKA';
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MON3 = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DOW = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const CLUBS = [
  { slug: 'major', name: 'Major Boğaziçi Briç Spor Kulübü', city: 'İstanbul · Levent', site: 'https://majorbogazici.com' },
];

let EMBED = false;
const cache = new Map();
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  cache.set(url, p);
  try { return await p; } catch (e) { cache.delete(url); throw e; }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = p => (EMBED ? '/embed' : '') + p;
const fmtPct = v => v == null || isNaN(v) ? '–' : (+v).toFixed(2);
const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${+dd} ${MONTHS[+m - 1]} ${y}`; };
const dowOf = d => { const x = new Date(d + 'T12:00:00'); return ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][x.getDay()]; };
const pctClass = v => v >= 60 ? 'pc-good' : v <= 40 ? 'pc-bad' : '';
const cardHtml = c => `<span class="${c[0]}">${SYM[c[0]]}</span>${c[1] === 'T' ? '10' : c[1]}`;
const suitSpan = s => `<span class="sym ${s}">${SYM[s]}</span>`;
const normName = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const trName = s => String(s || '').toLocaleLowerCase('tr').replace(/(^|[\s\-'(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr'));
const VISA_TR = { kulup: 'Kulüp', bireysel: 'Bireysel', uyelik: 'Üyelik', vizesiz: 'Vizesiz' };
const fmtMp = v => v == null ? '–' : (+v).toFixed(2);
function clubTabs(club, info, active) {
  if (!info?.mp) return '';
  return `<nav class="tabs"><a href="${L('/kulup/' + club)}" data-link class="${active === 't' ? 'on' : ''}">Turnuvalar</a><a href="${L('/kulup/' + club + '/mp-siralamasi')}" data-link class="${active === 'mp' ? 'on' : ''}">MP sıralaması</a></nav>`;
}
async function mpIndex(club) {
  try { const mp = await getJSON(`/data/${club}/mp.json`); if (!mp._ix) { mp._ix = new Map(); mp.rows.forEach(r => mp._ix.set(normName(r[2]), r)); } return mp; } catch (e) { return null; }
}

function setTitle(t) { document.title = t ? `${t} · briçskor` : 'briçskor — Kulüp briç turnuva sonuçları'; }

// ---------- bridge helpers
function vulOf(vul, seat) { return vul === 'Both' || (vul === 'NS' && 'NS'.includes(seat)) || (vul === 'EW' && 'EW'.includes(seat)); }
function vulTr(v) { return { None: 'Kimse', NS: 'K-G', EW: 'D-B', Both: 'Herkes' }[v] || v; }
function declTricks(row) {
  if (!row.c || !row.c.level) return null;
  const r = (row.res || '').trim();
  const d = r === '=' || r === '' ? 0 : parseInt(r, 10);
  return isNaN(d) ? null : row.c.level + 6 + d;
}
function conHtml(row) {
  if (!row.c) return '<span class="con">Pas</span>';
  if (!row.c.level) return `<span class="con">${esc(row.con)}</span>`;
  const st = row.c.strain === 'N' ? 'NT' : `<span class="${row.c.strain}">${SYM[row.c.strain]}</span>`;
  const x = row.c.dbl === 2 ? 'XX' : row.c.dbl === 1 ? 'X' : '';
  const r = (row.res || '').trim();
  return `<span class="con">${row.c.level}${st}${x}<span class="muted"> ${row.by || ''}</span>${r === '' ? '' : r === '=' ? '=' : r}</span>`;
}
function ddTricks(board, seat, strain) { if (!board.dd) return null; return board.dd[DD_STRAINS.indexOf(strain)][SEATS.indexOf(seat)]; }
function ddDiff(board, row) {
  const t = declTricks(row); if (t == null || !row.by) return null;
  const d = ddTricks(board, row.by, row.c.strain); return d == null ? null : t - d;
}
function ddTag(diff) {
  if (diff == null || diff === 0) return '';
  return `<span class="tag-dd ${diff > 0 ? 'p' : 'm'}" title="Double dummy'ye göre">${diff > 0 ? '+' : ''}${diff} DD</span>`;
}
function leadInfo(board, row) {
  if (!board.leads || !row.c || !row.by || !row.lead) return null;
  const list = board.leads[row.by + row.c.strain]; if (!list) return null;
  const lead = row.lead.length === 2 ? row.lead : null; if (!lead) return null;
  const best = Math.max(...list.map(x => x[1]));
  const hit = list.find(x => x[0] === lead);
  if (!hit) return null;
  return { card: lead, tricks: hit[1], best, cost: best - hit[1] };
}
function score(level, strain, dbl, vul, tricks) {
  const need = level + 6;
  if (tricks >= need) {
    const per = strain === 'C' || strain === 'D' ? 20 : 30;
    let trick = level * per + (strain === 'N' ? 10 : 0);
    trick *= dbl === 2 ? 4 : dbl === 1 ? 2 : 1;
    let s = trick + (trick >= 100 ? (vul ? 500 : 300) : 50);
    if (level === 6) s += vul ? 750 : 500;
    if (level === 7) s += vul ? 1500 : 1000;
    if (dbl) s += dbl === 2 ? 100 : 50;
    const over = tricks - need;
    s += over * (dbl ? (vul ? 200 : 100) * dbl : per);
    return s;
  }
  const down = need - tricks;
  if (!dbl) return -down * (vul ? 100 : 50);
  let s = 0;
  for (let i = 1; i <= down; i++) s += vul ? (i === 1 ? 200 : 300) : (i === 1 ? 100 : i <= 3 ? 200 : 300);
  return -s * dbl;
}
function parText(par) {
  if (!par) return '';
  const c = (par.c || []).map(x => {
    const m = x.match(/^(\d)([SHDCN])(\*{0,2})?-?([NSEW]+)(.*)$/);
    if (!m) return esc(x);
    const st = m[2] === 'N' ? 'NT' : `<span class="${m[2]}">${SYM[m[2]]}</span>`;
    return `<b>${m[1]}${st}${m[3] ? 'X' : ''}</b> ${m[4]}${esc(m[5] || '')}`;
  });
  return `${c.join(', ')} <span class="muted">(${par.score > 0 ? '+' : ''}${par.score} K-G)</span>`;
}
function handLines(cards) { return SUITS.map((s, i) => `<div class="ln"><span class="sym ${s}">${SYM[s]}</span>${(cards[i] || '—').replace(/T/g, '10')}</div>`).join(''); }
function seatName(t, b, seat) {
  // tabloda bu elde o koltuktaki oyuncu yok; diyagramda isim yalnızca seçili satıra göre
  return '';
}
function diagram(board, opts = {}) {
  const names = opts.names || {};
  const small = opts.small ? ' small' : '';
  const hcp = board.hcp || {};
  const comp = SEATS.map(s => `<span class="c${s}${vulOf(board.vul, s) ? ' v' : ''}${board.dealer === s ? ' dl' : ''}" title="${SEAT_TR[s]}${vulOf(board.vul, s) ? ' · bölgede' : ''}${board.dealer === s ? ' · dağıtıcı' : ''}">${s}</span>`).join('');
  return `<div class="diag${small}">
    <div class="info"><b>${board.b}</b><br>Dağ: ${SEAT_TR[board.dealer]}<br>Bölge: ${vulTr(board.vul)}</div>
    <div class="hcpbox"><div class="hcpmini"><span></span><span>${hcp.N ?? ''}</span><span></span><span>${hcp.W ?? ''}</span><span>☐</span><span>${hcp.E ?? ''}</span><span></span><span>${hcp.S ?? ''}</span><span></span></div></div>
    ${SEATS.map(s => `<div class="hand p${s}"><div class="who">${s}${names[s] ? ' · <b>' + esc(names[s]) + '</b>' : ''}</div>${handLines(board.hands[s])}</div>`).join('')}
    <div class="compass">${comp}<div class="bn">${board.b}</div></div>
  </div>`;
}
function ddTable(board) {
  if (!board.dd) return '<p class="note">Double dummy analizi yok.</p>';
  const head = `<tr><th></th>${SHOW_STRAINS.map(s => `<th>${s === 'N' ? 'NT' : suitSpan(s)}</th>`).join('')}</tr>`;
  const rows = ['N', 'S', 'E', 'W'].map(seat => `<tr><td>${seat}</td>${SHOW_STRAINS.map(st => { const t = ddTricks(board, seat, st); const lv = t - 6; return `<td class="${lv > 0 ? 'mk' : 'no'}" title="${t} löve">${lv > 0 ? lv : '–'}</td>`; }).join('')}</tr>`).join('');
  return `<table class="dd">${head}${rows}</table><div class="par">Par: ${parText(board.par)}</div>`;
}

// ---------- data access
async function loadEvent(club, slug) { return getJSON(`/data/${club}/t/${slug}.json`); }
function pairMap(ev) { const m = {}; ev.pairs.forEach(p => m[p.key] = p); return m; }
function boardKey(bd) { return bd.key || String(bd.b); }
function findBoard(ev, key) { return ev.boards.find(b => boardKey(b) === key); }
function pairLink(ev, p) { return L(`/kulup/${ev.club}/${ev.slug}/cift/${p.key}`); }
function namesHtml(p, link = true) {
  return p.names.map((n, i) => link ? `<a href="${L('/oyuncu/' + p.slugs[i])}" data-link>${esc(n)}</a>` : esc(n)).join(' – ');
}

// ---------- views
let currentClubSort = 'az';
let currentClubQuery = '';

function fmtDateShort(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${+dd} ${MON3[+m - 1] || ''}`;
}

function clubCardHtml(c) {
  const shortName = c.short || c.name;
  const lastDate = c.last?.date ? `<span class="c-last">son: ${fmtDateShort(c.last.date)}</span>` : '';
  return `<a class="card club" href="${L('/kulup/' + c.slug)}" data-link title="${esc(c.name)}">
    <div class="c-head">
      <div class="nm">${esc(shortName)}</div>
      <span class="c-badge" title="${c.events} turnuva">${c.events}</span>
    </div>
    <div class="meta">
      <span class="c-city">${esc(c.city || '')}</span>
      ${lastDate}
    </div>
  </a>`;
}

function renderClubCards(clubs) {
  const grid = document.getElementById('clubs-grid');
  const countEl = document.getElementById('club-count');
  if (!grid) return;

  const q = normName(currentClubQuery.trim());
  let list = clubs.slice();

  if (q) {
    list = list.filter(c => {
      const hay = [c.name, c.short, c.city, ...(c.aliases || [])].filter(Boolean).map(normName).join(' ');
      return hay.includes(q);
    });
  }

  if (currentClubSort === 'az') {
    list.sort((a, b) => (a.short || a.name).localeCompare(b.short || b.name, 'tr'));
  } else if (currentClubSort === 'za') {
    list.sort((a, b) => (b.short || b.name).localeCompare(a.short || a.name, 'tr'));
  } else if (currentClubSort === 'events') {
    list.sort((a, b) => (b.events || 0) - (a.events || 0) || (a.short || a.name).localeCompare(b.short || b.name, 'tr'));
  } else if (currentClubSort === 'recent') {
    list.sort((a, b) => ((b.last?.date || '') + (b.last?.time || '')).localeCompare((a.last?.date || '') + (a.last?.time || '')));
  } else if (currentClubSort === 'city') {
    list.sort((a, b) => (a.city || '').localeCompare(b.city || '', 'tr') || (a.short || a.name).localeCompare(b.short || b.name, 'tr'));
  }

  if (countEl) {
    countEl.textContent = q ? `(${list.length}/${clubs.length})` : `(${clubs.length})`;
  }

  if (list.length === 0) {
    grid.innerHTML = '<div class="club-empty">Aramanızla eşleşen kulüp bulunamadı.</div>';
    return;
  }

  const soonCard = !q ? `<div class="card club soon">
    <div class="c-head"><div class="nm">+ Kulüp ekleyin</div></div>
    <div class="meta"><span class="c-city">Sonuçlarınızı yayımlayın</span></div>
  </div>` : '';

  grid.innerHTML = list.map(c => clubCardHtml(c)).join('') + soonCard;
}

function bindClubControls(clubs) {
  const qInput = document.getElementById('club-q');
  const chips = document.querySelectorAll('.sort-chip');

  if (qInput) {
    qInput.value = currentClubQuery;
    qInput.addEventListener('input', e => {
      currentClubQuery = e.target.value;
      renderClubCards(clubs);
    });
    qInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        qInput.value = '';
        currentClubQuery = '';
        renderClubCards(clubs);
      }
    });
  }

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const s = chip.dataset.sort;
      if (chip.classList.contains('on')) {
        if (s === 'az') {
          currentClubSort = 'za';
          chip.dataset.sort = 'za';
          chip.textContent = 'Z → A';
        } else if (s === 'za') {
          currentClubSort = 'az';
          chip.dataset.sort = 'az';
          chip.textContent = 'A → Z';
        }
      } else {
        chips.forEach(c => {
          c.classList.remove('on');
          c.setAttribute('aria-checked', 'false');
          if (c.dataset.sort === 'za') {
            c.dataset.sort = 'az';
            c.textContent = 'A → Z';
          }
        });
        chip.classList.add('on');
        chip.setAttribute('aria-checked', 'true');
        currentClubSort = s;
      }
      renderClubCards(clubs);
    });
  });
}

async function viewHome() {
  setTitle('');
  const clubs = await getJSON('/data/clubs.json');
  const latest = clubs.filter(c => c.last).map(c => ({ ...c.last, club: c.slug, clubShort: c.short || c.name })).sort((x, y) => ((y.date || '') + (y.time || '')).localeCompare((x.date || '') + (x.time || ''))).slice(0, 10);
  $app.innerHTML = `
    <h1>Kulüp turnuva sonuçları</h1>
    <p class="sub">Sıralama, eller, double dummy ve atak analizi, eli tekrar oynama. Telefonda da rahat.</p>
    <input class="search" id="q" placeholder="İsim arayın" autocomplete="off">
    <div class="card results-list" id="qres" hidden></div>

    <div class="clubs-header">
      <div class="clubs-title-row">
        <h2>Kulüpler <span class="clubs-count" id="club-count">(${clubs.length})</span></h2>
        <div class="club-filter-box">
          <svg class="search-ico" viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35"/></svg>
          <input type="search" id="club-q" class="club-filter-input" placeholder="Kulüp veya şehir ara…" autocomplete="off">
        </div>
      </div>
      <div class="club-sort-row">
        <span class="sort-label">Sırala:</span>
        <div class="sort-chips" role="radiogroup" aria-label="Kulüp sıralama">
          <button type="button" class="sort-chip ${currentClubSort === 'az' || currentClubSort === 'za' ? 'on' : ''}" data-sort="${currentClubSort === 'za' ? 'za' : 'az'}" aria-checked="${currentClubSort === 'az' || currentClubSort === 'za'}">${currentClubSort === 'za' ? 'Z → A' : 'A → Z'}</button>
          <button type="button" class="sort-chip ${currentClubSort === 'events' ? 'on' : ''}" data-sort="events" aria-checked="${currentClubSort === 'events'}">En Çok Turnuva</button>
          <button type="button" class="sort-chip ${currentClubSort === 'recent' ? 'on' : ''}" data-sort="recent" aria-checked="${currentClubSort === 'recent'}">En Yeni</button>
          <button type="button" class="sort-chip ${currentClubSort === 'city' ? 'on' : ''}" data-sort="city" aria-checked="${currentClubSort === 'city'}">Şehir</button>
        </div>
      </div>
    </div>

    <div class="clubs" id="clubs-grid"></div>

    <h2>Son turnuvalar</h2>
    <div class="card evlist">${latest.map(e => evRow(e.club, e, e.clubShort)).join('')}</div>`;

  renderClubCards(clubs);
  bindClubControls(clubs);
  bindSearch();
}
function evRow(club, e, clubLabel) {
  const [y, m, d] = (e.date || '---').split('-');
  return `<a class="ev" href="${L(`/kulup/${club}/${e.slug}`)}" data-link>
    <div class="dt"><div class="d">${+d || ''}</div><div class="m">${MON3[+m - 1] || ''}</div></div>
    <div><div class="nm">${esc(e.name)}</div><div class="meta">${clubLabel ? esc(clubLabel) + ' · ' : ''}${e.date ? dowOf(e.date) : ''} ${e.time || ''} · ${e.pairs} çift · ${e.boards} el</div></div>
    <div class="win">1. <b>${esc((e.winner || []).join(' – '))}</b><br>%${fmtPct(e.winnerPct)}</div></a>`;
}
async function bindSearch() {
  const q = document.getElementById('q'), out = document.getElementById('qres');
  if (!q) return;
  const [players, clubs] = await Promise.all([getJSON('/data/players.json'), getJSON('/data/clubs.json')]);
  const norm = normName;
  q.addEventListener('input', () => {
    const v = norm(q.value.trim());
    if (v.length < 2) { out.hidden = true; return; }
    const ch = clubs.filter(c => [c.name, c.short, ...(c.aliases || [])].filter(Boolean).some(x => norm(x).includes(v)));
    const hits = players.filter(p => norm(p[1]).includes(v)).slice(0, 12);
    out.hidden = false;
    out.innerHTML = (ch.length || hits.length)
      ? ch.map(c => `<a href="${L('/kulup/' + c.slug)}" data-link><span><b>${esc(c.name)}</b></span><span class="muted">kulüp · ${c.events} turnuva</span></a>`).join('')
        + hits.map(p => `<a href="${L('/oyuncu/' + p[0])}" data-link><span>${esc(p[1])}</span><span class="muted">${p[2]} turnuva</span></a>`).join('')
      : '<div class="empty">Sonuç yok</div>';
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = out.querySelector('a'); if (first) navigate(first.getAttribute('href')); } });
}

async function viewClub(club, q) {
  const info = (await getJSON('/data/clubs.json')).find(c => c.slug === club);
  const idx = await getJSON(`/data/${club}/index.json`);
  setTitle(`${idx.name} Skorları – Güncel Turnuva Sonuçları`);
  const months = [...new Set(idx.events.map(e => e.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const ym = q.get('ay') || months[0] || new Date().toISOString().slice(0, 7);
  $app.innerHTML = `
    ${EMBED ? '' : `<div class="crumb"><a href="/" data-link>Kulüpler</a>›</div>`}
    <h1 class="club-h">${esc(idx.name)} skorları</h1>
    <p class="sub">${info ? esc(info.city) + ' · ' : ''}${idx.events.length} turnuva${info?.site && !EMBED ? ` · <a href="${info.site}" rel="noopener">kulüp sitesi</a>` : ''}</p>
    ${clubTabs(club, info, 't')}
    ${calendarHtml(club, idx.events, ym, months)}
    ${EMBED ? embedFoot() : ''}`;
}
async function viewMp(club) {
  const info = (await getJSON('/data/clubs.json')).find(c => c.slug === club);
  const mp = info?.mp && await mpIndex(club);
  if (!mp) return notFound();
  const players = await getJSON('/data/players.json');
  const ours = new Map(players.map(p => [normName(p[1]), p[0]]));
  setTitle(`${info.name} MP Sıralaması`);
  const at = mp.at ? new Date(mp.at) : null;
  const atTxt = at ? `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}` : '';
  const rowHtml = r => { const sl = ours.get(normName(r[2])); const nm = esc(trName(r[2]));
    return `<tr data-n="${esc(normName(r[2]))}"><td class="num">${r[0]}</td><td>${sl ? `<a href="${L('/oyuncu/' + sl)}" data-link>${nm}</a>` : nm}<div class="note">${esc(r[3])}${r[5] ? ' · ' + esc(r[5]) : ''}</div></td><td class="num pct">${fmtMp(r[4])}</td><td class="hide-sm">${esc(VISA_TR[r[6]] || r[6])}</td></tr>`; };
  $app.innerHTML = `
    ${EMBED ? '' : `<div class="crumb"><a href="/" data-link>Kulüpler</a>›<a href="${L('/kulup/' + club)}" data-link>${esc(info.name)}</a>›</div>`}
    <h1 class="club-h">${esc(info.name)} MP sıralaması</h1>
    <p class="sub">TBF güncel masterpoint sıralaması · ${mp.rows.length} sporcu${atTxt ? ' · ' + atTxt : ''}</p>
    ${clubTabs(club, info, 'mp')}
    <input class="search" id="mpq" placeholder="Sporcu arayın" autocomplete="off">
    <div class="card tbl-wrap" style="margin-top:12px"><table class="t mp"><thead><tr><th class="num">Sıra</th><th>Sporcu</th><th class="num">Güncel MP</th><th class="hide-sm">Vize</th></tr></thead><tbody id="mpbody">${mp.rows.map(rowHtml).join('')}</tbody></table></div>
    <p class="note">${esc(mp.explanation || '')} Kaynak: <a href="https://mp.tbricfed.org.tr/ranking?club=${info.tbf}&mode=guncel" rel="noopener">Türkiye Briç Federasyonu</a>. Bağlantılı isimler briçskor oyuncu sayfasına gider.</p>
    ${EMBED ? embedFoot() : ''}`;
  const qi = document.getElementById('mpq'), trs = [...document.querySelectorAll('#mpbody tr')];
  qi.addEventListener('input', () => { const v = normName(qi.value); trs.forEach(tr => tr.hidden = v.length >= 2 && !tr.dataset.n.includes(v)); });
}
// vugraph tarzı aylık takvim: her günde o günün turnuvaları, tıklayınca yeni tasarım açılır
function calendarHtml(club, events, ym, months) {
  const [Y, M] = ym.split('-').map(Number);
  const evs = events.filter(e => e.date?.startsWith(ym));
  const first = new Date(Y, M - 1, 1); const startDow = (first.getDay() + 6) % 7; const days = new Date(Y, M, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  let cells = DOW.map((d, i) => `<div class="dow${i > 4 ? ' we' : ''}">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += '<div class="day out"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${String(d).padStart(2, '0')}`;
    const list = evs.filter(e => e.date === ds).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dw = (startDow + d - 1) % 7;
    cells += `<div class="day${ds === today ? ' today' : ''}${list.length ? ' has' : ''}${dw > 4 ? ' we' : ''}"><span class="n">${d}</span>${list.map(e => `<a href="${L(`/kulup/${club}/${e.slug}`)}" data-link title="${esc(e.name)} · ${e.time || ''}" data-n="${esc(e.name)}"><span class="et">${esc(e.time || '')}</span>${esc(e.name)}</a>`).join('')}</div>`;
  }
  const tail = (7 - (startDow + days) % 7) % 7; for (let i = 0; i < tail; i++) cells += '<div class="day out"></div>';
  const i = months.indexOf(ym); const prev = months[i + 1], next = i > 0 ? months[i - 1] : null;
  const nav = (m, t) => m ? `<a class="nav-arrow" href="${L(`/kulup/${club}?ay=${m}`)}" data-link aria-label="${t}">${t === 'Önceki ay' ? '‹' : '›'}</a>` : `<span class="nav-arrow dis">${t === 'Önceki ay' ? '‹' : '›'}</span>`;
  return `<div class="card calbox">
      <div class="cal-head">${nav(prev, 'Önceki ay')}<b>${MONTHS[M - 1]} ${Y}</b>${nav(next, 'Sonraki ay')}</div>
      <div class="cal big">${cells}</div>
    </div>
    <p class="note">Bir turnuvaya dokunun: sıralama, eller, double dummy ve eli oynama.</p>`;
}
const embedFoot = () => `<div class="embed-foot">Sonuçlar: <a href="https://skor.bricdersi.net" target="_blank" rel="noopener">briçskor</a></div>`;

function tourHeader(ev, active) {
  const tabs = [['siralama', 'Sıralama'], ['eller', 'Eller'], ['kartlar', 'Skor kartları'], ['matris', 'Matris'], ['indir', 'İndir / Yazdır']];
  return `<div class="crumb">${EMBED ? '' : '<a href="/" data-link>Kulüpler</a>›'}<a href="${L('/kulup/' + ev.club)}" data-link>${esc(ev.clubName)}</a>›</div>
    <h1>${esc(ev.name)}</h1>
    <p class="sub">${fmtDate(ev.date)}, ${ev.date ? dowOf(ev.date) : ''} ${ev.time || ''} · ${ev.pairs.length} çift · ${new Set(ev.boards.map(b => b.b)).size} el · ${ev.movement === 'howell' ? 'Howell' : 'Mitchell'}</p>
    <nav class="tabs">${tabs.map(([k, t]) => `<a href="${L(`/kulup/${ev.club}/${ev.slug}${k === 'siralama' ? '' : '?sekme=' + k}`)}" data-link class="${active === k ? 'on' : ''}">${t}</a>`).join('')}</nav>`;
}
function groupsOf(ev) {
  const g = new Map();
  const order = p => p.dir === 'NS' ? 0 : p.dir === 'EW' ? 1 : 2;
  [...ev.pairs].sort((a, b) => order(a) - order(b)).forEach(p => { const k = p.grp || (p.dir === 'NS' ? 'Kuzey - Güney' : p.dir === 'EW' ? 'Doğu - Batı' : 'Genel'); if (!g.has(k)) g.set(k, []); g.get(k).push(p); });
  g.forEach(l => l.sort((a, b) => a.rank - b.rank));
  return g;
}
async function viewTournament(club, slug, q) {
  const ev = await loadEvent(club, slug);
  setTitle(`${ev.name} ${fmtDate(ev.date)} — ${ev.clubName}`);
  const tab = q.get('sekme') || 'siralama';
  if (tab === 'eller') return navigate(L(`/kulup/${club}/${slug}/el/${boardKey(ev.boards[0])}`), true);
  let body = '';
  if (tab === 'siralama') body = rankingHtml(ev);
  else if (tab === 'eller') body = boardsHtml(ev);
  else if (tab === 'kartlar') body = scorecardsIndex(ev);
  else if (tab === 'matris') body = matrixHtml(ev);
  else if (tab === 'indir') body = downloadHtml(ev);
  $app.innerHTML = tourHeader(ev, tab) + body + (EMBED ? embedFoot() : '');
  if (tab === 'indir') bindDownloads(ev);
}
function rankingHtml(ev) {
  let html = '';
  for (const [g, list] of groupsOf(ev)) {
    html += `<div class="card" style="margin-bottom:14px"><div class="sect-title">${esc(g)}</div><div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Çift</th><th class="num hide-sm">No</th><th class="num">%</th></tr></thead><tbody>
      ${list.map(p => `<tr class="click" data-href="${pairLink(ev, p)}"><td><span class="rank r${p.rank}">${p.rank}</span></td><td class="names">${namesHtml(p)}<div class="bar"><i style="width:${Math.max(0, Math.min(100, (p.pct - 30) / 40 * 100))}%"></i></div></td><td class="num hide-sm muted">${p.no}</td><td class="num pct ${pctClass(p.pct)}">${fmtPct(p.pct)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  return html + `<p class="note">Bir çifte dokunun: el el skor kartı ve kişisel analiz.</p>`;
}
function boardsHtml(ev) {
  return `<div class="boards">${ev.boards.map(b => {
    const top = topContract(b);
    return `<a class="card bcard" href="${L(`/kulup/${ev.club}/${ev.slug}/el/${boardKey(b)}`)}" data-link>
      <div class="bh"><span>El ${boardKey(b)}</span><span class="pill">${top ? 'En çok: ' + conPlain(top) : ''}</span></div>
      ${diagram(b, { small: true })}
      <div class="row" style="margin-top:6px;font-size:13px"><span class="muted">Par:</span> ${parText(b.par)}</div></a>`;
  }).join('')}</div>`;
}
function conPlain(row) { if (!row.c?.level) return 'Pas'; return `${row.c.level}${row.c.strain === 'N' ? 'NT' : SYM[row.c.strain]}${row.by || ''}`; }
function topContract(b) {
  const m = new Map(); b.rows.forEach(r => { const k = conPlain(r); m.set(k, (m.get(k) || 0) + 1); });
  let best = null, n = 0; for (const [k, v] of m) if (v > n) { n = v; best = k; }
  return best ? b.rows.find(r => conPlain(r) === best) : null;
}
function scorecardsIndex(ev) {
  let html = '';
  for (const [g, list] of groupsOf(ev)) html += `<div class="card" style="margin-bottom:14px"><div class="sect-title">${esc(g)}</div><div class="evlist">${list.map(p => `<a class="ev" href="${pairLink(ev, p)}" data-link style="grid-template-columns:40px 1fr auto"><span class="rank r${p.rank}">${p.rank}</span><div class="nm">${esc(p.names.join(' – '))}</div><div class="pct ${pctClass(p.pct)}">%${fmtPct(p.pct)}</div></a>`).join('')}</div></div>`;
  return html;
}
function matrixHtml(ev) {
  const bnums = [...new Set(ev.boards.map(b => b.b))].sort((a, b) => a - b);
  let html = '';
  for (const [g, list] of groupsOf(ev)) {
    html += `<div class="card" style="margin-bottom:14px"><div class="sect-title">${esc(g)}</div><div class="tbl-wrap pad"><table class="mx"><tr><th>Çift</th>${bnums.map(b => `<th>${b}</th>`).join('')}<th>%</th></tr>
    ${list.map(p => { const m = new Map(p.boards.map(x => [x.b, x])); return `<tr><td><a href="${pairLink(ev, p)}" data-link>${p.rank}. ${esc(p.names.map(n => n.split(' ').slice(-1)[0]).join('–'))}</a></td>${bnums.map(b => { const x = m.get(b); if (!x) return '<td></td>'; const v = x.pct; const bg = v >= 50 ? `rgba(18,122,70,${(v - 50) / 60})` : `rgba(194,47,58,${(50 - v) / 60})`; return `<td class="v" style="background:${bg}" title="El ${b}: ${x.score} · %${v}">${Math.round(v)}</td>`; }).join('')}<td class="v">${fmtPct(p.pct)}</td></tr>`; }).join('')}
    </table></div></div>`;
  }
  return html + '<p class="note">Hücreler: o elde alınan yüzde. Yeşil iyi, kırmızı kötü.</p>';
}
function downloadHtml(ev) {
  return `<div class="card pad"><h3>El dosyaları</h3><p class="note">Elleri kendi programınızda (BBO, Bridge Composer, Bridge Baron vb.) açmak için indirin.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="dl-pbn">PBN indir</button><button class="btn" id="dl-lin">LIN indir</button><button class="btn" id="dl-print">Elleri yazdır</button></div></div>
    <div class="card pad" style="margin-top:14px"><h3>Kulübünüzün sitesine ekleyin</h3><p class="note">Bu kodu kulüp sitenize yapıştırın; sonuçlar sitenizin içinde görünür.</p>
    <pre style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:10px;font-size:13px">&lt;iframe src="https://skor.bricdersi.net/embed/kulup/${ev.club}" style="width:100%;height:900px;border:0"&gt;&lt;/iframe&gt;</pre></div><div id="printarea" class="print-only"></div>`;
}
function pbnOf(ev) {
  return ev.boards.map(b => {
    const deal = 'N:' + SEATS.map(s => b.hands[s].join('.')).join(' ');
    return `[Event "${ev.name}"]\n[Site "${ev.clubName}"]\n[Date "${(ev.date || '').replace(/-/g, '.')}"]\n[Board "${b.b}"]\n[Dealer "${b.dealer}"]\n[Vulnerable "${b.vul}"]\n[Deal "${deal}"]\n`
      + (b.dd ? `[DoubleDummyTricks "${['N', 'S', 'E', 'W'].map(s => ['N', 'S', 'H', 'D', 'C'].map(st => ddTricks(b, s, st).toString(16)).join('')).join('')}"]\n` : '')
      + (b.par ? `[OptimumScore "NS ${b.par.score}"]\n` : '');
  }).join('\n');
}
function linOf(b) {
  const order = ['S', 'W', 'N', 'E'];
  const dealerNum = { S: 1, W: 2, N: 3, E: 4 }[b.dealer];
  const hand = s => SUITS.map((su, i) => su + b.hands[s][i]).join('');
  const sv = { None: 'o', NS: 'n', EW: 'e', Both: 'b' }[b.vul];
  return `qx|o${b.b}|md|${dealerNum}${order.slice(0, 3).map(hand).join(',')},|rh||ah|Board ${b.b}|sv|${sv}|pg||`;
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function bindDownloads(ev) {
  const base = `${ev.date}-${ev.club}`;
  document.getElementById('dl-pbn').onclick = () => download(base + '.pbn', pbnOf(ev), 'text/plain');
  document.getElementById('dl-lin').onclick = () => download(base + '.lin', ev.boards.map(linOf).join('\n'), 'text/plain');
  document.getElementById('dl-print').onclick = () => { document.getElementById('printarea').innerHTML = boardsHtml(ev); setTimeout(() => window.print(), 200); };
}

async function viewBoard(club, slug, bkey, q) {
  const ev = await loadEvent(club, slug);
  const b = findBoard(ev, bkey);
  if (!b) return notFound();
  const pm = pairMap(ev);
  const me = q.get('cift');
  setTitle(`El ${bkey} — ${ev.name} ${fmtDate(ev.date)}`);
  const rows = [...b.rows].map((r, i) => ({ ...r, i })).sort((a, c) => (c.nsScore ?? 0) - (a.nsScore ?? 0));
  const keys = ev.boards.map(boardKey); const pos = keys.indexOf(bkey);
  const qs = me ? `?cift=${me}` : '';
  const urlOf = k => L(`/kulup/${club}/${slug}/el/${k}${qs}`);
  const namesFor = r => {
    const n = {}; if (!r) return n;
    const ns = pm[r.ns], ew = pm[r.ew];
    if (ns) { n.N = ns.names[0]; n.S = ns.names[1]; }
    if (ew) { n.E = ew.names[0]; n.W = ew.names[1]; }
    return n;
  };
  const myRow = me ? rows.find(r => r.ns === me || r.ew === me) : null;
  const focus = myRow?.c?.level ? myRow : topContract(b) || rows.find(r => r.c?.level);
  const tr = rows.map(r => {
    const ns = pm[r.ns], ew = pm[r.ew];
    const dd = ddDiff(b, r); const li = leadInfo(b, r);
    const mine = me && (r.ns === me || r.ew === me);
    return `<tr class="click${mine ? ' me' : ''}" data-row="${r.i}"><td>${conHtml(r)}${ddTag(dd)}</td><td>${r.lead ? cardHtml(r.lead) : ''}${li && li.cost > 0 ? ` <span class="tag-dd m" title="Bu atak double dummy'de ${li.cost} löve kaybettirdi">−${li.cost}</span>` : ''}</td>
      <td class="num">${r.nsScore > 0 ? r.nsScore : ''}</td><td class="num">${r.nsScore < 0 ? -r.nsScore : ''}</td>
      <td class="num pct ${pctClass(r.nsPct)}">${fmtPct(r.nsPct)}</td>
      <td class="names hide-sm" style="font-size:13px">${ns ? esc(ns.names.join(' – ')) : ''}<br><span class="muted">${ew ? esc(ew.names.join(' – ')) : ''}</span></td></tr>`;
  }).join('');
  const strip = keys.map(k => `<a href="${urlOf(k)}" data-link class="bk${k === bkey ? ' on' : ''}">${k}</a>`).join('');
  $app.innerHTML = tourHeader(ev, 'eller') + `
    <div class="bstrip-wrap no-print">
      <a class="nav-arrow${pos > 0 ? '' : ' dis'}" ${pos > 0 ? `href="${urlOf(keys[pos - 1])}" data-link` : ''} aria-label="Önceki el">‹</a>
      <div class="bstrip" id="bstrip">${strip}</div>
      <a class="nav-arrow${pos < keys.length - 1 ? '' : ' dis'}" ${pos < keys.length - 1 ? `href="${urlOf(keys[pos + 1])}" data-link` : ''} aria-label="Sonraki el">›</a>
    </div>
    <div class="bv">
      <div class="bv-main">
        <div class="conbar" id="conbar"></div>
        <div id="player" class="card"></div>
      </div>
      <div class="bv-side">
        <div class="card pad"><h3>Double dummy</h3>${ddTable(b)}</div>
        <div class="row no-print" style="margin-top:10px"><button class="btn sm" id="share">Paylaş</button><a class="btn sm" target="_blank" rel="noopener" id="bbo" href="#">BBO'da aç</a></div>
      </div>
    </div>
    <h2>Masalar <span class="note">— bir masaya dokunun: o kontrat ve atakla oynayın</span></h2>
    <div class="card tbl-wrap"><table class="t"><thead><tr><th>Kontrat</th><th>Atak</th><th class="num">K-G</th><th class="num">D-B</th><th class="num">K-G %</th><th class="hide-sm">Çiftler (K-G / D-B)</th></tr></thead><tbody>${tr}</tbody></table></div>
    <p class="note">“+1 DD”: deklaran double dummy'den bir löve fazla aldı. Atak yanındaki “−1”: o atak double dummy'de bir löve kaybettirdi.</p>
    ${EMBED ? embedFoot() : ''}`;
  // strip: aktif eli ortala
  const on = document.querySelector('.bk.on'); on?.scrollIntoView({ block: 'nearest', inline: 'center' });
  // kontrat seçici
  const conOf = r => ({ level: r.c.level, strain: r.c.strain, dbl: r.c.dbl || 0, by: r.by });
  const conKey = c => `${c.level}${c.strain}${c.dbl}${c.by}`;
  const cons = new Map();
  rows.filter(r => r.c?.level && r.by).forEach(r => { const k = conKey(conOf(r)); cons.set(k, { c: conOf(r), n: (cons.get(k)?.n || 0) + 1 }); });
  const parC = (b.par?.c || [])[0]?.match(/^(\d)([SHDCN])(\*{0,2})?-?([NSEW]+)/);
  if (parC) { const pc = { level: +parC[1], strain: parC[2], dbl: parC[3] ? 1 : 0, by: parC[4][0] }; const k = conKey(pc); if (!cons.has(k)) cons.set(k, { c: pc, n: 0, par: true }); else cons.get(k).par = true; }
  const conList = [...cons.values()].sort((x, y) => y.n - x.n);
  let current = focus?.c?.level ? conOf(focus) : conList[0]?.c;
  if (!current) { document.getElementById('player').innerHTML = '<div class="empty">Bu elde oynanan kontrat yok.</div>'; return; }
  const conTxt = c => `${c.level}${c.strain === 'N' ? 'NT' : `<span class="${c.strain}">${SYM[c.strain]}</span>`}${c.dbl === 2 ? 'XX' : c.dbl ? 'X' : ''}${c.by}`;
  const drawBar = () => {
    document.getElementById('conbar').innerHTML = conList.map(x => `<button class="chip${conKey(x.c) === conKey(current) ? ' on' : ''}" data-k="${conKey(x.c)}">${conTxt(x.c)}${x.n ? `<small>×${x.n}</small>` : ''}${x.par ? '<small>par</small>' : ''}</button>`).join('')
      + `<button class="chip${boxOpen ? ' on' : ''}" id="boxbtn">✎ Başka kontrat</button>`
      + (boxOpen ? `<div class="bidbox">
          <div class="bbr">${[1, 2, 3, 4, 5, 6, 7].map(l => `<button class="bb${current.level === l ? ' on' : ''}" data-l="${l}">${l}</button>`).join('')}</div>
          <div class="bbr">${['C', 'D', 'H', 'S', 'N'].map(st => `<button class="bb st${current.strain === st ? ' on' : ''}" data-s="${st}">${st === 'N' ? 'NT' : `<span class="${st}">${SYM[st]}</span>`}</button>`).join('')}</div>
          <div class="bbr"><span class="bbl">Deklaran</span>${['N', 'E', 'S', 'W'].map(x => `<button class="bb sm${current.by === x ? ' on' : ''}" data-d="${x}">${x}</button>`).join('')}<span class="bbl">Kontr</span>${[[0, '—'], [1, 'X'], [2, 'XX']].map(([v, t]) => `<button class="bb sm${(current.dbl || 0) === v ? ' on' : ''}" data-x="${v}">${t}</button>`).join('')}</div>
        </div>` : '');
    document.querySelectorAll('#conbar button.chip[data-k]').forEach(btn => btn.onclick = () => { current = cons.get(btn.dataset.k).c; player.setContract(current); drawBar(); });
    document.getElementById('boxbtn').onclick = () => { boxOpen = !boxOpen; drawBar(); };
    document.querySelectorAll('.bidbox .bb').forEach(btn => btn.onclick = () => {
      const d = btn.dataset;
      current = { ...current, level: d.l ? +d.l : current.level, strain: d.s || current.strain, by: d.d || current.by, dbl: d.x != null ? +d.x : (current.dbl || 0) };
      player.setContract(current); drawBar();
    });
  };
  let boxOpen = false;
  let names = namesFor(myRow || focus);
  const startPlays = focus?.lead && focus.lead.length === 2 && conKey(conOf(focus)) === conKey(current) ? [] : [];
  const player = mountPlayer(document.getElementById('player'), b, { contract: current, names, plays: startPlays });
  drawBar();
  document.querySelectorAll('tr[data-row]').forEach(trEl => trEl.onclick = e => {
    if (e.target.closest('a')) return;
    const r = b.rows[+trEl.dataset.row]; if (!r.c?.level || !r.by) return;
    current = conOf(r); names = namesFor(r); player.names = names; player.setNames?.(names);
    player.setContract(current);
    const lead = r.lead && r.lead.length === 2 ? r.lead : null;
    if (lead) player.setPlays([lead]);
    drawBar();
    document.querySelectorAll('tr.me').forEach(x => x.classList.remove('me')); trEl.classList.add('me');
    document.getElementById('player').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('bbo').onclick = e => { e.currentTarget.href = 'https://www.bridgebase.com/tools/handviewer.html?lin=' + encodeURIComponent(player.lin()); };
  document.getElementById('share').onclick = async () => {
    const url = location.href.replace('/embed/', '/');
    try { if (navigator.share) await navigator.share({ title: document.title, url }); else { await navigator.clipboard.writeText(url); toast('Link kopyalandı'); } } catch { }
  };
  // klavye + kaydırma ile el geçişi
  const go = d => { const k = keys[pos + d]; if (k) navigate(urlOf(k)); };
  boardKeyHandler = e => {
    if (e.target.closest('input,select,textarea')) return;
    if (e.key === 'ArrowRight' && !e.shiftKey) { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' && !e.shiftKey) { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight' && e.shiftKey) player.fwd();
    else if (e.key === 'ArrowLeft' && e.shiftKey) player.back();
  };
  let sx = null, sy = null;
  const tz = document.querySelector('.bv');
  tz.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  tz.addEventListener('touchend', e => {
    if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) go(dx < 0 ? 1 : -1);
  }, { passive: true });
}
let boardKeyHandler = null;
document.addEventListener('keydown', e => boardKeyHandler?.(e));
function toast(t) { const d = document.createElement('div'); d.textContent = t; Object.assign(d.style, { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: '#18201c', color: '#fff', padding: '10px 16px', borderRadius: '10px', zIndex: 99 }); document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }

async function viewPair(club, slug, key) {
  const ev = await loadEvent(club, slug);
  const pm = pairMap(ev); const p = pm[key];
  if (!p) return notFound();
  setTitle(`${p.names.join(' – ')} — ${ev.name} ${fmtDate(ev.date)}`);
  let decl = [], def = [], leads = [], lost = 0;
  const rowsHtml = p.boards.map(x => {
    const b = ev.boards.find(bb => bb.b === x.b && bb.sec === p.sec);
    const r = b && x.row != null ? b.rows[x.row] : null;
    const side = x.side || (p.dir === 'EW' ? 'ew' : 'ns');
    const mySeats = side === 'ns' ? 'NS' : 'EW';
    let role = '', ddc = '', leadc = '';
    if (r && r.c?.level && r.by) {
      const dd = ddDiff(b, r);
      if (mySeats.includes(r.by)) { role = 'Deklaran'; decl.push({ pct: x.pct, dd }); if (dd != null) ddc = ddTag(dd); }
      else {
        role = 'Savunma'; def.push({ pct: x.pct, dd });
        if (dd != null) ddc = ddTag(-dd);
        const leader = SEATS[(SEATS.indexOf(r.by) + 1) % 4];
        const li = leadInfo(b, r);
        if (li && mySeats.includes(leader)) { leads.push(li); if (li.cost > 0) { lost++; leadc = `<span class="tag-dd m">atak −${li.cost}</span>`; } }
      }
    } else if (r) role = 'Pas';
    const opp = pm[side === 'ns' ? r?.ew : r?.ns];
    return `<tr class="click" data-href="${L(`/kulup/${club}/${slug}/el/${b ? boardKey(b) : x.b}?cift=${key}`)}"><td><b>${x.b}</b></td><td>${r ? conHtml(r) : ''}</td><td class="hide-sm">${r?.lead ? cardHtml(r.lead) : ''}</td><td class="num">${esc(x.score)}</td><td class="num pct ${pctClass(x.pct)}">${fmtPct(x.pct)}</td><td>${role ? `<span class="pill">${role}</span>` : ''} ${ddc} ${leadc}</td><td class="hide-sm" style="font-size:13px">${opp ? esc(opp.names.join(' – ')) : esc(x.opp)}</td></tr>`;
  }).join('');
  const avg = a => a.length ? a.reduce((s, x) => s + x.pct, 0) / a.length : null;
  const sumDD = a => a.filter(x => x.dd != null).reduce((s, x) => s + x.dd, 0);
  const dDecl = sumDD(decl), dDef = -sumDD(def);
  $app.innerHTML = tourHeader(ev, 'kartlar') + `
    <h2 style="margin-top:0">${namesHtml(p)}</h2>
    <p class="sub">${p.rank}. sıra · %${fmtPct(p.pct)} · ${p.grp || (p.dir === 'NS' ? 'Kuzey-Güney' : p.dir === 'EW' ? 'Doğu-Batı' : '')}</p>
    <div class="stats">
      <div class="card stat"><div class="k">Deklaran</div><div class="v">%${fmtPct(avg(decl))}</div><div class="sx">${decl.length} el</div></div>
      <div class="card stat"><div class="k">Savunma</div><div class="v">%${fmtPct(avg(def))}</div><div class="sx">${def.length} el</div></div>
      <div class="card stat"><div class="k">Deklaran oyunu (DD'ye göre)</div><div class="v ${dDecl > 0 ? 'pc-good' : dDecl < 0 ? 'pc-bad' : ''}">${dDecl > 0 ? '+' : ''}${dDecl} löve</div><div class="sx">toplam fark</div></div>
      <div class="card stat"><div class="k">Savunma (DD'ye göre)</div><div class="v ${dDef > 0 ? 'pc-good' : dDef < 0 ? 'pc-bad' : ''}">${dDef > 0 ? '+' : ''}${dDef} löve</div><div class="sx">toplam fark</div></div>
      <div class="card stat"><div class="k">Ataklar</div><div class="v">${leads.length - lost}/${leads.length}</div><div class="sx">löve kaybettirmeyen atak</div></div>
    </div>
    <h2>El el skor kartı</h2>
    <div class="card tbl-wrap"><table class="t"><thead><tr><th>El</th><th>Kontrat</th><th class="hide-sm">Atak</th><th class="num">Skor</th><th class="num">%</th><th>Analiz</th><th class="hide-sm">Rakip</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    <p class="note">Analiz, masada alınan löveleri double dummy (dört el açık, en iyi oyun) sonucuyla karşılaştırır. Bir eli açmak için satıra dokunun.</p>
    ${EMBED ? embedFoot() : ''}`;
}

async function viewPlayer(slug) {
  const shard = await getJSON(`/data/p/${slug[0]}.json`); const p = shard[slug]; if (!p) return notFound();
  setTitle(`${p.name} — briç turnuva sonuçları`);
  const evs = p.events;
  const avg = evs.reduce((s, e) => s + e.pct, 0) / (evs.length || 1);
  const best = [...evs].sort((a, b) => b.pct - a.pct)[0];
  const wins = evs.filter(e => e.rank === 1).length;
  const partners = new Map(); evs.forEach(e => { const k = e.partner; if (!partners.has(k)) partners.set(k, []); partners.get(k).push(e.pct); });
  const pList = [...partners.entries()].map(([n, a]) => ({ n, c: a.length, avg: a.reduce((s, x) => s + x, 0) / a.length })).sort((a, b) => b.c - a.c);
  const clubsAll = await getJSON('/data/clubs.json');
  let mpRow = null;
  for (const c of clubsAll.filter(c => c.mp && evs.some(e => e.club === c.slug))) { const mp = await mpIndex(c.slug); mpRow = mp?._ix.get(normName(p.name)); if (mpRow) break; }
  const chron = [...evs].reverse();
  const W = 600, H = 110, pad = 6;
  const xs = i => pad + (chron.length > 1 ? i * (W - 2 * pad) / (chron.length - 1) : W / 2);
  const ys = v => H - pad - (Math.max(30, Math.min(75, v)) - 30) / 45 * (H - 2 * pad);
  const path = chron.map((e, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(e.pct).toFixed(1)}`).join('');
  $app.innerHTML = `
    <div class="crumb"><a href="/oyuncular" data-link>Oyuncular</a>›</div>
    <h1>${esc(p.name)}</h1>
    <p class="sub">${evs.length} turnuva · ${[...new Set(evs.map(e => e.clubName))].join(', ')}</p>
    <div class="stats">
      <div class="card stat"><div class="k">Ortalama</div><div class="v">%${fmtPct(avg)}</div></div>
      <div class="card stat"><div class="k">En iyi</div><div class="v">%${fmtPct(best?.pct)}</div><div class="sx">${best ? fmtDate(best.date) : ''}</div></div>
      <div class="card stat"><div class="k">Birincilik</div><div class="v">${wins}</div></div>
      <div class="card stat"><div class="k">Partner sayısı</div><div class="v">${pList.length}</div></div>
      ${mpRow ? `<div class="card stat"><div class="k">TBF güncel MP</div><div class="v">${fmtMp(mpRow[4])}</div><div class="sx">${esc(mpRow[3])}</div></div>` : ''}
    </div>
    ${chron.length > 1 ? `<h2>Gidişat</h2><div class="card pad"><svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${ys(50)}" y2="${ys(50)}" stroke="currentColor" opacity=".15" stroke-dasharray="4 4"/><path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${chron.map((e, i) => `<circle cx="${xs(i)}" cy="${ys(e.pct)}" r="3.5" fill="var(--brand)"><title>${fmtDate(e.date)} · %${fmtPct(e.pct)}</title></circle>`).join('')}</svg><div class="note">Kesikli çizgi: %50</div></div>` : ''}
    <h2>Turnuvalar</h2>
    <div class="card tbl-wrap"><table class="t"><thead><tr><th>Tarih</th><th>Turnuva</th><th>Partner</th><th class="num">Sıra</th><th class="num">%</th></tr></thead><tbody>
    ${evs.map(e => `<tr class="click" data-href="${L(`/kulup/${e.club}/${e.t}/cift/${e.pair}`)}"><td style="white-space:nowrap">${fmtDate(e.date)}</td><td>${esc(e.name)}<div class="note">${esc(e.clubName)}</div></td><td>${esc(e.partner)}</td><td class="num">${e.rank}/${e.field}</td><td class="num pct ${pctClass(e.pct)}">${fmtPct(e.pct)}</td></tr>`).join('')}
    </tbody></table></div>
    <h2>Partnerler</h2>
    <div class="card tbl-wrap"><table class="t"><thead><tr><th>Partner</th><th class="num">Turnuva</th><th class="num">Ort. %</th></tr></thead><tbody>${pList.map(x => `<tr><td>${esc(x.n)}</td><td class="num">${x.c}</td><td class="num pct ${pctClass(x.avg)}">${fmtPct(x.avg)}</td></tr>`).join('')}</tbody></table></div>`;
}
async function viewPlayers() {
  setTitle('Oyuncular');
  const players = await getJSON('/data/players.json');
  $app.innerHTML = `<h1>Oyuncular</h1><p class="sub">${players.length} oyuncu</p><input class="search" id="q" placeholder="İsim arayın" autocomplete="off"><div class="card results-list" id="qres" hidden></div>
    <div class="card results-list" id="all">${players.map(p => `<a href="/oyuncu/${p[0]}" data-link><span>${esc(p[1])}</span><span class="muted">${p[2]}</span></a>`).join('')}</div>`;
  bindSearch();
  document.getElementById('q').addEventListener('input', e => document.getElementById('all').hidden = e.target.value.trim().length >= 2);
}
function notFound() { $app.innerHTML = '<div class="empty"><h1>Sayfa bulunamadı</h1><p><a href="/" data-link>Ana sayfaya dön</a></p></div>'; }

// ---------- router
async function route() {
  let path = location.pathname.replace(/\/+$/, '') || '/';
  EMBED = path.startsWith('/embed');
  document.body.classList.toggle('embed', EMBED);
  if (EMBED) path = path.slice(6) || '/';
  const q = new URLSearchParams(location.search);
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (!seg.length) await viewHome();
    else if (seg[0] === 'kulup' && seg.length === 2) await viewClub(seg[1], q);
    else if (seg[0] === 'kulup' && seg.length === 3 && seg[2] === 'mp-siralamasi') await viewMp(seg[1]);
    else if (seg[0] === 'kulup' && seg.length === 3) await viewTournament(seg[1], seg[2], q);
    else if (seg[0] === 'kulup' && seg[3] === 'el' && seg[4]) await viewBoard(seg[1], seg[2], seg[4], q);
    else if (seg[0] === 'kulup' && seg[3] === 'cift' && seg[4]) await viewPair(seg[1], seg[2], seg[4]);
    else if (seg[0] === 'oyuncu' && seg[1]) await viewPlayer(seg[1]);
    else if (seg[0] === 'oyuncular') await viewPlayers();
    else notFound();
  } catch (e) { console.error(e); notFound(); }
  if (EMBED) parent?.postMessage?.({ bricskorHeight: document.documentElement.scrollHeight }, '*');
}
async function navigate(url, replace) { boardKeyHandler = null; replace ? history.replaceState({}, '', url) : history.pushState({}, '', url); window.scrollTo(0, 0); $modal.hidden = true; await route(); }
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey && a.origin === location.origin) { e.preventDefault(); navigate(a.getAttribute('href')); return; }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a')) navigate(tr.dataset.href);
});
window.addEventListener('popstate', () => { boardKeyHandler = null; route(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $modal.hidden = true; });
route();
