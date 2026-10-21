// briçskor double dummy worker — DDS (Bo Haglund & Soren Hein, Apache-2.0) WASM derlemesi
let inst = null, mem = null;
const enc = new TextEncoder(), dec = new TextDecoder();
const wasi = {
  environ_get: () => 0, environ_sizes_get: (a, b) => { const v = new DataView(mem.buffer); v.setUint32(a, 0, true); v.setUint32(b, 0, true); return 0; },
  fd_close: () => 0, fd_fdstat_get: () => 8, fd_fdstat_set_flags: () => 0, fd_prestat_get: () => 8, fd_prestat_dir_name: () => 8,
  fd_read: () => 0, fd_seek: () => 0, path_open: () => 76, proc_exit: c => { throw new Error('exit ' + c); },
  fd_write: (fd, iovs, n, out) => { const v = new DataView(mem.buffer); let t = 0; for (let i = 0; i < n; i++) t += v.getUint32(iovs + i * 8 + 4, true); v.setUint32(out, t, true); return 0; },
};
const ready = (async () => {
  const r = await fetch('/dds.wasm?v=1');
  const { instance } = await WebAssembly.instantiate(await r.arrayBuffer(), { wasi_snapshot_preview1: wasi });
  inst = instance; mem = instance.exports.memory;
  instance.exports._initialize?.(); instance.exports.dd_init();
})();
function put(s) { const p = inst.exports.dd_buf(); const b = enc.encode(s + '\0'); new Uint8Array(mem.buffer, p, b.length).set(b); }
function get() { const p = inst.exports.dd_buf(); const a = new Uint8Array(mem.buffer, p, 8192); return dec.decode(a.subarray(0, a.indexOf(0))); }
self.onmessage = async e => {
  await ready;
  const { id, op, arg } = e.data;
  try {
    if (op === 'solve') {
      // arg: {trump, first, trick:[[s,r],..], pbn}
      const t = [0, 1, 2].map(i => arg.trick[i] || [-1, -1]);
      put(`${arg.trump} ${arg.first} ${t.map(x => x.join(' ')).join(' ')} ${arg.pbn}`);
      const n = inst.exports.dd_solve();
      const txt = get();
      if (n < 0 || txt.startsWith('ERR')) throw new Error(txt || 'solve ' + n);
      const res = {}; txt.split('|').filter(Boolean).forEach(x => { const [c, v] = x.split(' '); res[c] = +v; });
      self.postMessage({ id, res });
    } else if (op === 'table') {
      put(arg.pbn); const r = inst.exports.dd_table(); if (r !== 1) throw new Error('table ' + r);
      self.postMessage({ id, res: get().trim().split(/\s+/).map(Number) });
    }
  } catch (err) { self.postMessage({ id, err: String(err) }); }
};
