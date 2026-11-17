#!/usr/bin/env bash
# Render the three dossier screenshots from the generated dashboard with a headless
# Chrome, then convert to JPEG (<=512 KiB each, 1440x900) with PIL.
# Usage: scripts/shots.sh [out-dir]   (default: out)
set -euo pipefail
OUT="${1:-out}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CH="${CHROME:-/tmp/shot/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell}"
PAGE="file://$ROOT/$OUT/dashboard/index.html"
TMP="$(mktemp -d)"

# Pick the top-ranked slug for the detail shot.
TOP_SLUG="$(node -e "const b=require('$ROOT/$OUT/board.json');console.log(b.rows[0].slug)")"
# A category with several rows, for the filtered shot.
CAT="$(node -e "const b=require('$ROOT/$OUT/board.json');const c={};b.rows.forEach(r=>{c[r.category||'Other']=(c[r.category||'Other']||0)+1});console.log(Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0])")"

shot() {
  local name="$1" url="$2"
  "$CH" --no-sandbox --disable-gpu --hide-scrollbars \
    --screenshot="$TMP/$name.png" --window-size=1440,900 "$url" >/dev/null 2>&1
}

shot 1-board "$PAGE"
shot 2-detail "$PAGE#p=$TOP_SLUG"
shot 3-filtered "$PAGE#category=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$CAT")"

python3 - "$TMP" "$ROOT/screenshots" << 'EOF'
import sys, os
from PIL import Image
tmp, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
for name in ["1-board", "2-detail", "3-filtered"]:
    src = os.path.join(tmp, name + ".png")
    im = Image.open(src).convert("RGB")
    assert im.size == (1440, 900), (name, im.size)
    out = os.path.join(dest, name + ".jpg")
    q = 85
    while q >= 50:
        im.save(out, "JPEG", quality=q, optimize=True)
        if os.path.getsize(out) <= 512 * 1024:
            break
        q -= 5
    print(f"{name}.jpg: {im.size} {os.path.getsize(out)} bytes (quality {q})")
    assert os.path.getsize(out) <= 512 * 1024, name
EOF
rm -rf "$TMP"
echo "screenshots written to $ROOT/screenshots"
