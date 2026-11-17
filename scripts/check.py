#!/usr/bin/env python3
"""Local replica of the sealed gate's seven rows, run against out/.

Checks: dashboard_files, board_file, sorted_by_value, coverage, farm_steps,
screenshots, dossier_matches (the dossier part is compared by a node one-liner
in the shell wrapper; here we check the dossier exists and is within caps).
Usage: python3 scripts/check.py [out-dir] [snapshot]
Exit 0 when every row passes.
"""
import json, os, re, sys
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else "out"
snap_path = sys.argv[2] if len(sys.argv) > 2 else "input-snapshot.json"
fails = []

def check(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""))
    if not ok:
        fails.append(name)

# --- dashboard_files ---
dash = os.path.join(out, "dashboard")
files = []
for root, dirs, names in os.walk(dash):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for n in names:
        if n.startswith("."):
            continue
        files.append(os.path.join(root, n))
names_ok = all(re.match(r"^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$", os.path.basename(f)) for f in files)
total = sum(os.path.getsize(f) for f in files)
has_html = os.path.isfile(os.path.join(dash, "index.html"))
has_css = any(f.endswith(".css") for f in files)
has_js = any(f.endswith(".js") for f in files)
net = []
for f in files:
    text = open(f, encoding="utf-8", errors="ignore").read()
    # The scorer refuses http(s) in HTML attribute values, <style> bodies, inline
    # <script> imports, CSS files and JS import/require specifiers. Visible text
    # may carry URLs; this check flags the risky shapes conservatively.
    if re.search(r'(?:href|src|action|import|from|require)\s*=\s*["\']https?://', text):
        net.append(f)
    if f.endswith(".css") and re.search(r'https?://', text):
        net.append(f)
    if f.endswith(".js") and re.search(r'(?:import\s|from\s|require\()\s*["\']https?://', text):
        net.append(f)
check("dashboard_files", has_html and has_css and has_js and len(files) <= 400 and total <= 4 * 1024 * 1024 and names_ok and not net,
      f"{len(files)} files, {total} bytes, net-refs={net}")

# --- board_file / sorted_by_value / coverage / farm_steps ---
snap = json.load(open(snap_path))
board = json.load(open(os.path.join(out, "board.json")))
rows = board["rows"] if isinstance(board, dict) else board
slugs = {p["slug"] for p in snap["protocols"]}
ok_rows = 100 <= len(rows) <= 4000
bad = []
seen = set()
for r in rows:
    if r["slug"] not in slugs:
        bad.append(("unknown slug", r["slug"]))
    if r["slug"] in seen:
        bad.append(("dup slug", r["slug"]))
    seen.add(r["slug"])
    if not isinstance(r.get("name"), str) or not r["name"]:
        bad.append(("bad name", r["slug"]))
    if not isinstance(r.get("implied_value_usd"), int) or r["implied_value_usd"] <= 0 or r["implied_value_usd"] > 10**14:
        bad.append(("bad implied", r["slug"]))
    steps = r.get("farm_steps", [])
    if not (3 <= len(steps) <= 12) or any(not (20 <= len(s.strip()) <= 600) for s in steps):
        bad.append(("bad farm_steps", r["slug"]))
check("board_file", ok_rows and not bad, f"{len(rows)} rows, issues={bad[:5]}")
ranks = sorted(r["rank"] for r in rows)
check("sorted_by_value", ranks == list(range(1, len(rows) + 1)) and
      all(rows[i]["implied_value_usd"] >= rows[i + 1]["implied_value_usd"] for i in range(len(rows) - 1)) and
      not (len(rows) >= 2 and rows[0]["implied_value_usd"] == rows[-1]["implied_value_usd"]),
      f"ranks 1..{len(rows)}, top={rows[0]['implied_value_usd']}, bottom={rows[-1]['implied_value_usd']}")
missing = [s for s in snap["watchlist"] if s not in seen]
check("coverage", not missing, f"watchlist {len(snap['watchlist'])}, missing={missing}")
check("farm_steps", not any(b[0] == "bad farm_steps" for b in bad), "all rows 3-12 steps, 20-600 chars")

# --- screenshots ---
shots_dir = os.path.join(out, "screenshots")
shots = sorted(n for n in os.listdir(shots_dir) if not n.startswith("."))
ok_shots = 3 <= len(shots) <= 4
dims = []
for n in shots:
    p = os.path.join(shots_dir, n)
    size = os.path.getsize(p)
    im = Image.open(p)
    im.verify()
    im = Image.open(p)
    w, h = im.size
    dims.append((n, w, h, size))
    if size > 512 * 1024 or max(w, h) > 1440 or min(w, h) < 800:
        ok_shots = False
check("screenshots", ok_shots, str(dims))

# --- dossier ---
dpath = os.path.join(out, "dossier.json")
dsize = os.path.getsize(dpath) if os.path.exists(dpath) else -1
d = json.load(open(dpath)) if os.path.exists(dpath) else {}
text_bytes = len(d.get("text", "").encode())
check("dossier", 0 < dsize <= 1_500_000 and text_bytes <= 65536 and len(d.get("images", [])) == len(shots),
      f"{dsize} bytes, text {text_bytes} bytes, images {len(d.get('images', []))}")

# --- data consistency: dashboard recompute matches board ---
data = open(os.path.join(out, "data.js")).read()
m = re.match(r"window\.RADAR=(.*);\s*$", data, re.S)
radar = json.loads(m.group(1))
board_by_slug = {r["slug"]: r for r in rows}
mismatch = []
for r in radar["rows"]:
    b = board_by_slug.get(r["slug"])
    if not b or b["implied_value_usd"] != r["implied_value_usd"] or b["rank"] != r["rank"]:
        mismatch.append(r["slug"])
check("data.js agrees with board.json", not mismatch and len(radar["rows"]) == len(rows),
      f"{len(radar['rows'])} rows, mismatches={mismatch[:5]}")
# every board row is pre-token in the snapshot
pre = {p["slug"] for p in snap["protocols"] if p["mcap_usd"] is None and p["gecko_id"] is None and p["symbol"] is None}
bad_pre = [r["slug"] for r in rows if r["slug"] not in pre]
check("all board rows pre-token", not bad_pre, f"non-pre-token rows={bad_pre[:5]}")
# no wrapped/staked/bridged product on the board (watchlist rule, re-applied)
wrapped = [r["slug"] for r in rows if (r["category"] in ("Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"))
           or re.search(r"\b(wrapped|staked|staking)\b", r["name"], re.I)
           or re.search(r"\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$", r["name"])]
check("no wrapped/staked/versioned rows", not wrapped, f"flagged={wrapped[:5]}")

print()
print("RESULT:", "ALL PASS" if not fails else f"FAILURES: {fails}")
sys.exit(0 if not fails else 1)
