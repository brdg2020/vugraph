// Reads lines: "<pbn> <dealer 0-3> <vul 0-3> <leadspecs...>"
// leadspec = "<decl 0-3><strain 0-4>"  (strain 0=S..3=C,4=NT)
// Prints one JSON line per input line.
#include "api/dll.h"
#include <cstdio>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

int main() {
  SetMaxThreads(0);
  std::string line;
  const char *RK = "  23456789TJQKA";
  const char *SU = "SHDC";
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    std::istringstream is(line);
    std::string pbn; int dealer, vul;
    is >> pbn >> dealer >> vul;
    std::vector<std::string> specs; std::string s;
    while (is >> s) specs.push_back(s);
    // pbn uses '_' for spaces
    for (auto &c : pbn) if (c == '_') c = ' ';
    DdTableDealPBN td; std::memset(&td, 0, sizeof td);
    std::strncpy(td.cards, pbn.c_str(), 79);
    DdTableResults tr;
    int r = CalcDDtablePBN(td, &tr);
    if (r != 1) { std::printf("{\"err\":%d}\n", r); continue; }
    ParResultsDealer pr; std::memset(&pr, 0, sizeof pr);
    DealerPar(&tr, &pr, dealer, vul);
    std::printf("{\"dd\":[");
    for (int st = 0; st < 5; st++) {
      std::printf("%s[", st ? "," : "");
      for (int h = 0; h < 4; h++) std::printf("%s%d", h ? "," : "", tr.res_table[st][h]);
      std::printf("]");
    }
    std::printf("],\"par\":{\"score\":%d,\"c\":[", pr.score);
    for (int i = 0; i < pr.number; i++) std::printf("%s\"%s\"", i ? "," : "", pr.contracts[i]);
    std::printf("]},\"leads\":{");
    bool first = true;
    for (auto &sp : specs) {
      int decl = sp[0] - '0', strain = sp[1] - '0';
      DealPBN dl; std::memset(&dl, 0, sizeof dl);
      dl.trump = strain; dl.first = (decl + 1) % 4;
      std::strncpy(dl.remainCards, pbn.c_str(), 79);
      FutureTricks ft; std::memset(&ft, 0, sizeof ft);
      int rr = SolveBoardPBN(dl, -1, 3, 1, &ft, 0);
      if (rr != 1) continue;
      std::printf("%s\"%s\":[", first ? "" : ",", sp.c_str()); first = false;
      for (int i = 0; i < ft.cards; i++) {
        // each card + equals; score = tricks for leader side
        std::printf("%s[\"%c%c\",%d,%d]", i ? "," : "", SU[ft.suit[i]], RK[ft.rank[i]], ft.equals[i], ft.score[i]);
      }
      std::printf("]");
    }
    std::printf("}}\n");
    std::fflush(stdout);
  }
}
