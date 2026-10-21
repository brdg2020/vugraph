// briçskor tarayıcı double dummy köprüsü (DDS -> WASM)
#include "api/dll.h"
#include <cstring>
#include <cstdio>

static char g_out[8192];

extern "C" {

__attribute__((export_name("dd_buf"))) char* dd_buf() { return g_out; }

__attribute__((export_name("dd_init"))) int dd_init() {
  SetMaxThreads(1);
  return 1;
}

// Pozisyondaki her yasal kart için deklaranın değil, sırası gelen tarafın alacağı löve.
// in: g_out içinde "trump first ts0 tr0 ts1 tr1 ts2 tr2 PBN" (ts=-1 yoksa). PBN kalan kartlar.
// out: g_out içinde "S A 9|S Q 9|..." biçiminde, eşdeğer kartlar ayrı satır.
__attribute__((export_name("dd_solve"))) int dd_solve() {
  int trump, first, ts[3], tr[3];
  char pbn[96] = {0};
  if (std::sscanf(g_out, "%d %d %d %d %d %d %d %d %95[^\n]", &trump, &first, &ts[0], &tr[0], &ts[1], &tr[1], &ts[2], &tr[2], pbn) < 9) return -1;
  DealPBN dl; std::memset(&dl, 0, sizeof dl);
  dl.trump = trump; dl.first = first;
  for (int i = 0; i < 3; i++) { dl.currentTrickSuit[i] = ts[i] < 0 ? 0 : ts[i]; dl.currentTrickRank[i] = tr[i] < 0 ? 0 : tr[i]; }
  std::strncpy(dl.remainCards, pbn, 79);
  FutureTricks ft; std::memset(&ft, 0, sizeof ft);
  int r = SolveBoardPBN(dl, -1, 3, 1, &ft, 0);
  if (r != 1) { std::snprintf(g_out, sizeof g_out, "ERR %d", r); return r; }
  const char* SU = "SHDC"; const char* RK = "  23456789TJQKA";
  int n = 0;
  for (int i = 0; i < ft.cards; i++) {
    n += std::snprintf(g_out + n, sizeof g_out - n, "%c%c %d|", SU[ft.suit[i]], RK[ft.rank[i]], ft.score[i]);
    for (int k = 2; k <= 14; k++) if (ft.equals[i] & (1 << k))
      n += std::snprintf(g_out + n, sizeof g_out - n, "%c%c %d|", SU[ft.suit[i]], RK[k], ft.score[i]);
  }
  return ft.cards;
}

// Tam el DD tablosu: in g_out = PBN ("N:..."), out: 20 sayı (strain S,H,D,C,N x el N,E,S,W)
__attribute__((export_name("dd_table"))) int dd_table() {
  DdTableDealPBN td; std::memset(&td, 0, sizeof td);
  std::strncpy(td.cards, g_out, 79);
  DdTableResults res;
  int r = CalcDDtablePBN(td, &res);
  if (r != 1) return r;
  int n = 0;
  for (int s = 0; s < 5; s++) for (int h = 0; h < 4; h++) n += std::snprintf(g_out + n, sizeof g_out - n, "%d ", res.res_table[s][h]);
  return 1;
}
}

extern "C" int __cxa_thread_atexit(void (*)(void*), void*, void*) { return 0; }
