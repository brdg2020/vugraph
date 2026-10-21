#!/usr/bin/env bash
# DDS'i (github.com/dds-bridge/dds) tarayıcı için WASM'a derler.
# Gerekenler: wasi-sdk (github.com/WebAssembly/wasi-sdk/releases), python3
set -euo pipefail
W=${WASI_SDK:-/opt/wasi-sdk}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${WORK:-/tmp/ddsw}
[ -d /tmp/dds ] || git clone --depth 1 https://github.com/dds-bridge/dds.git /tmp/dds
rm -rf "$WORK/src" && mkdir -p "$WORK/obj" && cp -r /tmp/dds/library/src "$WORK/src"
cd "$WORK/src"
# tek iş parçacıklı derleme: istisnalar ve std::thread kullanımlarını ayıkla
python3 - <<'PY'
import re
for f in ['api/dds_c_api.cpp','calc_tables.cpp','trans_table/trans_table_s.cpp','trans_table/trans_table_p.cpp',
          'trans_table/trans_table_l.cpp','system/system.cpp','system/parallel_boards.cpp']:
    out=[]
    for line in open(f).read().split('\n'):
        code,sep,com=line.partition('//')
        code=re.sub(r'\bthrow\s*;','abort();',code); code=re.sub(r'\bthrow\s+[^;]*;','abort();',code)
        code=re.sub(r'\btry\b','if (true)',code); code=re.sub(r'\bcatch\s*\([^)]*\)','else if (false)',code)
        code=code.replace('std::thread::hardware_concurrency()','1u')
        out.append(code+sep+com)
    open(f,'w').write('#include <cstdlib>\n'+'\n'.join(out))
PY
sed -i 's/#include <mutex>//; s/#include <thread>//; s/#include <condition_variable>//' $(grep -rl "#include <mutex>\|#include <thread>\|#include <condition_variable>" .)
cd "$WORK"
CXX="$W/bin/clang++ --target=wasm32-wasi --sysroot=$W/share/wasi-sysroot -std=c++20 -O3 -fno-exceptions -DDDS_THREADS_NONE -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_SIGNAL -include $HERE/threadshim.h -I src -I src/api"
for f in $(find src -name "*.cpp") "$HERE/bricskor_dd.cpp"; do $CXX -c "$f" -o "obj/$(echo "$f" | tr / _).o"; done
$W/bin/clang++ --target=wasm32-wasi --sysroot=$W/share/wasi-sysroot -O3 -mexec-model=reactor -Wl,-z,stack-size=4194304 \
  -Wl,--initial-memory=134217728 -Wl,--max-memory=1073741824 obj/*.o -lwasi-emulated-process-clocks -lwasi-emulated-signal -o dds.wasm
$W/bin/llvm-strip dds.wasm -o "$HERE/../public/dds.wasm"
echo "public/dds.wasm güncellendi"
