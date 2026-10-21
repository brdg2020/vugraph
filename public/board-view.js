// briçskor — tek el görünümü: kompakt diyagram, kolay geçiş, BBO tarzı double dummy ile oynama
const SEATS = ['N', 'E', 'S', 'W'];
const SUITS = ['S', 'H', 'D', 'C'];
const SYM = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎', N: 'NT' };
const RANKS = '23456789TJQKA';
const SEAT_TR = { N: 'Kuzey', E: 'Doğu', S: 'Güney', W: 'Batı' };
const DD_STRAINS = ['S', 'H', 'D', 'C', 'N'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lho = s => SEATS[(SEATS.indexOf(s) + 1) % 4];
const sideOf = s => 'NS'.includes(s) ? 'NS' : 'EW';
const rankV = c => RANKS.indexOf(c[1]);

// ---------- DD worker
let worker = null, reqId = 0; const pending = new Map();
function dd(op, arg) {
  if (!worker) {
    worker = new Worker('/dd-worker.js?v=1');
    worker.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.err ? p.rej(new Error(e.data.err)) : p.res(e.data.res); };
  }
  return new Promise((res, rej) => { const id = ++reqId; pending.set(id, { res, rej }); worker.postMessage({ id, op, arg }); });
}

// ---------- oyun durumu (oynanan kart listesinden türetilir)
export function derive(board, con, plays) {
  const hands = {}; SEATS.forEach(s => hands[s] = SUITS.flatMap((su, i) => (board.hands[s][i] || '').split('').filter(Boolean).map(r => su + r)));
  const trump = con.strain;
  let leader = lho(con.by), trick = [], won = { NS: 0, EW: 0 }, last = null, tricks = [];
  for (const c of plays) {
    const seat = SEATS[(SEATS.indexOf(leader) + trick.length) % 4];
    hands[seat] = hands[seat].filter(x => x !== c);
    trick.push({ s: seat, c });
    if (trick.length === 4) {
      let w = trick[0];
      for (const t of trick.slice(1)) {
        if (t.c[0] === w.c[0]) { if (rankV(t.c) > rankV(w.c)) w = t; }
        else if (t.c[0] === trump) w = t;
      }
      won[sideOf(w.s)]++; last = { cards: trick, win: w.s }; tricks.push(last);
      leader = w.s; trick = [];
    }
  }
  const toPlay = SEATS[(SEATS.indexOf(leader) + trick.length) % 4];
  return { hands, trick, leader, toPlay, won, last, tricks, done: plays.length === 52 };
}
function legalCards(st) {
  const h = st.hands[st.toPlay];
  if (!st.trick.length) return h;
  const ls = st.trick[0].c[0];
  const f = h.filter(c => c[0] === ls);
  return f.length ? f : h;
}

export function score(level, strain, dbl, vul, tricks) {
  const need = level + 6;
  if (tricks >= need) {
    const per = strain === 'C' || strain === 'D' ? 20 : 30;
    let t = (level * per + (strain === 'N' ? 10 : 0)) * (dbl === 2 ? 4 : dbl === 1 ? 2 : 1);
    let s = t + (t >= 100 ? (vul ? 500 : 300) : 50);
    if (level === 6) s += vul ? 750 : 500;
    if (level === 7) s += vul ? 1500 : 1000;
    if (dbl) s += dbl === 2 ? 100 : 50;
    s += (tricks - need) * (dbl ? (vul ? 200 : 100) * dbl : per);
    return s;
  }
  const down = need - tricks;
  if (!dbl) return -down * (vul ? 100 : 50);
  let s = 0; for (let i = 1; i <= down; i++) s += vul ? (i === 1 ? 200 : 300) : (i === 1 ? 100 : i <= 3 ? 200 : 300);
  return -s * dbl;
}
const vulOf = (vul, seat) => vul === 'Both' || (vul === 'NS' && 'NS'.includes(seat)) || (vul === 'EW' && 'EW'.includes(seat));

// ---------- bileşen
export function mountPlayer(root, board, opts) {
  const S = {
    con: opts.contract, plays: opts.plays || [], redo: [], ddOn: true, ddMap: null, ddFor: -1, names: opts.names || {},
  };
  let ver = 0;
  const conLabel = c => `${c.level}${c.strain === 'N' ? 'NT' : `<span class="${c.strain}">${SYM[c.strain]}</span>`}${c.dbl === 2 ? 'XX' : c.dbl ? 'X' : ''} ${c.by}`;

  async function refreshDD() {
    const myVer = ++ver;
    S.ddMap = null;
    const st = derive(board, S.con, S.plays);
    if (!S.ddOn || st.done) { draw(); return; }
    draw();
    const rem = SEATS.map(s => SUITS.map(su => st.hands[s].filter(c => c[0] === su).map(c => c[1]).sort((a, b) => RANKS.indexOf(b) - RANKS.indexOf(a)).join('')).join('.')).join(' ');
    try {
      const res = await dd('solve', {
        trump: DD_STRAINS.indexOf(S.con.strain), first: SEATS.indexOf(st.leader),
        trick: st.trick.map(t => [SUITS.indexOf(t.c[0]), RANKS.indexOf(t.c[1]) + 2]),
        pbn: 'N:' + rem,
      });
      if (myVer !== ver) return;
      const declSide = sideOf(S.con.by);
      const remaining = 13 - st.tricks.length;
      const m = {};
      for (const [c, v] of Object.entries(res)) m[c] = st.won[declSide] + (sideOf(st.toPlay) === declSide ? v : remaining - v);
      S.ddMap = m; draw();
    } catch (e) { console.warn(e); }
  }

  function play(card) { S.plays = [...S.plays, card]; S.redo = []; refreshDD(); opts.onChange?.(S); }
  function back() { if (!S.plays.length) return; S.redo.push(S.plays.at(-1)); S.plays = S.plays.slice(0, -1); refreshDD(); }
  function fwd() { if (!S.redo.length) return; S.plays = [...S.plays, S.redo.pop()]; refreshDD(); }
  function start() { while (S.plays.length) S.redo.push(S.plays.pop()); refreshDD(); }
  function end() { while (S.redo.length) S.plays.push(S.redo.pop()); refreshDD(); }
  function backTrick() { const n = S.plays.length % 4 || 4; for (let i = 0; i < n && S.plays.length; i++) S.redo.push(S.plays.pop()); refreshDD(); }
  async function ddFinish() {
    // kalan eli double dummy en iyi oyunla bitir
    let guard = 0;
    while (guard++ < 60) {
      const st = derive(board, S.con, S.plays);
      if (st.done) break;
      if (!S.ddMap) await refreshDD();
      if (!S.ddMap) break;
      const legal = legalCards(st);
      const declSide = sideOf(S.con.by);
      const best = legal.reduce((b, c) => {
        const v = S.ddMap[c] ?? -1; if (b == null) return c;
        const bv = S.ddMap[b] ?? -1;
        return sideOf(st.toPlay) === declSide ? (v > bv ? c : b) : (v < bv ? c : b);
      }, null);
      S.plays = [...S.plays, best]; S.redo = [];
      await refreshDD();
    }
  }
  S.setContract = c => { S.con = c; S.plays = []; S.redo = []; refreshDD(); };
  S.setPlays = p => { S.plays = p; S.redo = []; refreshDD(); };
  S.back = back; S.fwd = fwd;
  S.setNames = n => { S.names = n || {}; draw(); };
  S.lin = () => linFor(board, S.con, S.plays, S.names);

  function handHtml(seat, st) {
    const legal = new Set(st.done ? [] : legalCards(st));
    const isTurn = !st.done && st.toPlay === seat;
    const declSide = sideOf(S.con.by);
    let best = null;
    if (isTurn && S.ddMap) {
      const vals = [...legal].map(c => S.ddMap[c]).filter(v => v != null);
      best = sideOf(seat) === declSide ? Math.max(...vals) : Math.min(...vals);
    }
    const lines = SUITS.map(su => {
      // kartlar yerinde kalır; oynananlar soluklaşır (el kaymaz)
      const orig = (board.hands[seat][SUITS.indexOf(su)] || '').split('').filter(Boolean).map(r => su + r);
      const have = new Set(st.hands[seat]);
      const cards = orig.map(c => {
        const gone = !have.has(c);
        const ok = !gone && isTurn && legal.has(c);
        const v = ok && S.ddMap ? S.ddMap[c] : null;
        return `<button class="ck${ok ? ' ok' : ''}${gone ? ' gone' : ''}" data-c="${c}" ${ok ? '' : 'tabindex="-1"'}>${c[1] === 'T' ? '10' : c[1]}<i class="${v == null ? '' : v === best ? 'g' : 'b'}">${v ?? ''}</i></button>`;
      }).join('');
      return `<div class="hl"><span class="sy ${su}">${SYM[su]}</span>${cards || '<span class="void">—</span>'}</div>`;
    }).join('');
    const nm = S.names[seat];
    return `<div class="hb h${seat}${isTurn ? ' turn' : ''}"><div class="hn"><b>${seat}</b>${nm ? ' ' + esc(nm) : ''}${seat === S.con.by ? ' <em>dek.</em>' : ''}</div>${lines}</div>`;
  }

  function draw() {
    const st = derive(board, S.con, S.plays);
    const show = st.trick.length ? { cards: st.trick, win: null } : (st.last && S.plays.length ? st.last : null);
    const declSide = sideOf(S.con.by);
    const need = S.con.level + 6;
    const dw = st.won[declSide];
    let res = '';
    if (st.done) {
      const sc = score(S.con.level, S.con.strain, S.con.dbl || 0, vulOf(board.vul, S.con.by), dw);
      const diff = dw - need;
      res = `<b>${diff === 0 ? '=' : diff > 0 ? '+' + diff : diff}</b> · ${sideOf(S.con.by) === 'NS' ? sc : -sc} K-G`;
    }
    const comp = SEATS.map(s => `<span class="cs c${s}${vulOf(board.vul, s) ? ' v' : ''}${board.dealer === s ? ' dl' : ''}">${s}</span>`).join('');
    root.innerHTML = `
      <div class="pt">
        ${SEATS.map(s => handHtml(s, st)).join('')}
        <div class="mid">
          ${comp}
          <div class="tr">${show ? show.cards.map(t => `<span class="tc2 t${t.s}${show.win === t.s ? ' w' : ''}"><span class="${t.c[0]}">${SYM[t.c[0]]}</span>${t.c[1] === 'T' ? '10' : t.c[1]}</span>`).join('') : `<span class="bnum">${board.b}</span>`}</div>
        </div>
        <div class="info2"><div class="cl">${conLabel(S.con)}</div><div>K-G <b>${st.won.NS}</b> · D-B <b>${st.won.EW}</b></div>${res ? `<div class="res">${res}</div>` : ''}</div>
        <div class="info3"><span>Dağ. ${board.dealer}</span><span>${{ None: 'Kimse', NS: 'K-G', EW: 'D-B', Both: 'Herkes' }[board.vul]} böl.</span>${board.hcp ? `<span class="muted">${board.hcp.N}/${board.hcp.E}/${board.hcp.S}/${board.hcp.W} P</span>` : ''}</div>
      </div>
      <div class="pc">
        <button class="ib" data-a="start" title="Başa">⏮</button>
        <button class="ib" data-a="btrick" title="Önceki löve">⏪</button>
        <button class="ib" data-a="back" title="Geri (bir kart)">◀</button>
        <button class="ib" data-a="fwd" title="İleri (bir kart)">▶</button>
        <button class="ib" data-a="end" title="Sona">⏭</button>
        <span class="spacer"></span>
        <label class="tog"><input type="checkbox" data-a="ddtog" ${S.ddOn ? 'checked' : ''}> DD</label>
        <button class="btn sm" data-a="ddfin" title="Kalanı double dummy en iyi oyunla oyna">DD ile bitir</button>
      </div>
      <p class="note pn">${S.ddOn ? `Kartlardaki sayı: o kart oynanırsa deklaranın (${S.con.by}) toplam alacağı löve, iki taraf da en iyi oynarsa. <span class="g">Yeşil</span> en iyi seçim.` : 'Kartlara dokunarak eli oynayın.'}</p>`;
    root.querySelectorAll('.ck.ok').forEach(b => b.onclick = () => play(b.dataset.c));
    root.querySelectorAll('[data-a]').forEach(b => {
      const a = b.dataset.a;
      if (a === 'ddtog') b.onchange = () => { S.ddOn = b.checked; refreshDD(); };
      else b.onclick = () => ({ start, btrick: backTrick, back, fwd, end, ddfin: ddFinish })[a]();
    });
  }
  refreshDD();
  return S;
}

export function linFor(board, con, plays, names = {}) {
  const order = ['S', 'W', 'N', 'E'];
  const hand = st => SUITS.map((su, i) => su + (board.hands[st][i] || '')).join('');
  const dealerNum = { S: 1, W: 2, N: 3, E: 4 }[board.dealer];
  const sv = { None: 'o', NS: 'n', EW: 'e', Both: 'b' }[board.vul];
  const pn = order.map(x => (names[x] || x).replace(/[|,]/g, ' ')).join(',');
  // açık artırma: dağıtıcıdan deklarana kadar pas, deklaran kontratı söyler, X/XX, sonra üç pas
  let seat = board.dealer, bids = [];
  while (seat !== con.by) { bids.push('p'); seat = lho(seat); }
  bids.push(`${con.level}${con.strain === 'N' ? 'N' : con.strain}`);
  if (con.dbl >= 1) bids.push('d');
  if (con.dbl === 2) { bids.push('p'); bids.push('r'); }
  bids.push('p', 'p', 'p');
  const pc = plays.map(c => `pc|${c}|`).join('');
  return `pn|${pn}|st||md|${dealerNum}${order.slice(0, 3).map(hand).join(',')},|rh||ah|Board ${board.b}|sv|${sv}|${bids.map(b => `mb|${b}|`).join('')}${pc}`;
}

export async function ddTableLive(board) {
  const pbn = 'N:' + SEATS.map(s => board.hands[s].join('.')).join(' ');
  const arr = await dd('table', { pbn });
  return DD_STRAINS.map((_, st) => SEATS.map((_, h) => arr[st * 4 + h]));
}
