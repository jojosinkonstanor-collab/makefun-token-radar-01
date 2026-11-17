#!/usr/bin/env bash
# Full rebuild from scratch: score the snapshot, render screenshots, rebuild the
# dossier, and run the local gate replica. Usage: ./run.sh [out-dir] (default: out)
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-out}"
rm -rf "$OUT" && mkdir -p "$OUT"
MAKEFUN_OUTPUT_DIR="$OUT" node main.ts --input input/snapshot.json
bash scripts/shots.sh "$OUT"
MAKEFUN_OUTPUT_DIR="$OUT" node main.ts --input input/snapshot.json
python3 scripts/check.py "$OUT" input/snapshot.json
node scripts/rebuild-dossier.mts
echo "OK: $OUT is complete. Open $OUT/dashboard/index.html to view the dashboard."
