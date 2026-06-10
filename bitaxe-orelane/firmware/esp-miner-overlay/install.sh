#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 /path/to/ESP-Miner" >&2
  exit 2
fi

repo="$1"
overlay_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

test -f "$repo/main/CMakeLists.txt"
test -f "$repo/main/main.c"
test -f "$repo/main/http_server/http_server.c"

cp "$overlay_dir/orelane.c" "$repo/main/orelane.c"
cp "$overlay_dir/orelane.h" "$repo/main/orelane.h"
cp "$overlay_dir/orelane_api.c" "$repo/main/orelane_api.c"
cp "$overlay_dir/orelane_api.h" "$repo/main/orelane_api.h"

if command -v patch >/dev/null 2>&1; then
  (cd "$repo" && patch -p1 < "$overlay_dir/esp-miner-orelane.patch")
else
  echo "patch command not found; copy succeeded, apply esp-miner-orelane.patch manually" >&2
fi

