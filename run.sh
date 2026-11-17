#!/usr/bin/env bash
# Full rebuild from scratch: score the snapshot, render screenshots, rebuild the
# dossier, and run the local gate replica. Usage: ./run.sh [out-dir] (default: out)
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-out}"
SNAP="${2:-input/snapshot.json}"
if [ ! -f "$SNAP" ]; then
  echo "token radar: no snapshot at $SNAP (the sealed snapshot is not committed to this repo; copy it from the kit's input/ or pass a path: ./run.sh [out-dir] [snapshot])" >&2
  exit 1
fi
rm -rf "$OUT" && mkdir -p "$OUT"
MAKEFUN_OUTPUT_DIR="$OUT" node main.ts --input "$SNAP"
bash scripts/shots.sh "$OUT"
MAKEFUN_OUTPUT_DIR="$OUT" node main.ts --input "$SNAP"
python3 scripts/check.py "$OUT" "$SNAP"
node scripts/rebuild-dossier.mts
echo "OK: $OUT is complete. Open $OUT/dashboard/index.html to view the dashboard."
