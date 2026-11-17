# Token Radar — make.fun bounty `token-radar-01`

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jojosinkonstanor-collab/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jojosinkonstanor-collab/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)


A program that reads a sealed DefiLlama snapshot, ranks the protocols that
record no token by what their launch would be worth, and writes a static web
dashboard with a farm plan for each one. Built for the make.fun bounty
**"Build the best token launch radar"** ($1,325, deadline 14 Dec 2026 10:00 UTC).

> Status: **entry complete, not submitted.** No account was created, nothing
> was paid, and no secret or key is in this repository. Submission (public
> GitHub repo + commit + transcript bundle) is a separate step — see
> [What is still needed to submit](#what-is-still-needed-to-submit).

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | Entry point (Node 22, standard library only). Reads the snapshot, writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/`, writes `dossier.json`. |
| `lib/model.ts` | The radar-2 model: peer multiples, implied value, farm plans, board construction. |
| `vendor/makefun-board.ts` | make.fun's dossier library, byte for byte as shipped in the kit. |
| `dashboard/` | The static page: `index.html`, `app.css`, `app.js`. No framework, no network. |
| `screenshots/` | The three dossier screenshots (board, detail, filtered), 1440×900 JPEG. |
| `input/` | The sealed snapshot's home. The snapshot itself (DefiLlama, fetched 2026-11-14T01:18:33Z; 758 protocols, watchlist floor $50M) is **not committed** to this repo: the grader mounts it at `/input/snapshot.json`. For local runs, copy the sealed `snapshot.json` from the kit's `input/` here, or pass `--input <path>`. |
| `scripts/check.py` | Local replica of the gate's seven rows, plus data-consistency checks. |
| `scripts/shots.sh` | Renders the three screenshots with a headless Chrome. |
| `scripts/rebuild-dossier.mts` | Rebuilds `dossier.json` from `out/` and compares bytes. |
| `run.sh` | Full rebuild from scratch + all checks. |
| `out/` | Generated output (git-ignored): `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`. |

## How to run

Local runs need the sealed snapshot at `input/snapshot.json` — it is not committed to this repo (the grader mounts it at `/input/snapshot.json`); copy it from the kit's `input/` first, or pass `--input <path-to-snapshot>` (or `./run.sh [out-dir] [snapshot]`).

```bash
./run.sh            # full rebuild into out/ + gate checks
# or step by step:
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
bash scripts/shots.sh out
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
python3 scripts/check.py out input/snapshot.json
```

Requirements: Node.js 22+ (tested on Node v24.22.1; the bounty asks for 22.18).
Screenshots need a headless Chrome — `scripts/shots.sh` uses `CHROME`
(default: the `chrome-headless-shell` under `/tmp/shot`, installed during this
build; point `CHROME=/path/to/chrome` at any headless Chromium/Chrome).
Python 3 + Pillow is used only for the JPEG conversion and the gate checks.

In the grader's container the program runs as `node main.ts` with the sealed
snapshot mounted at `/input/snapshot.json` and output at `/output`.

## The model (radar-2)

Implied value follows only from the snapshot's own figures:

```
peer     = median(mcap_usd / tvl_usd) over live-token protocols in the same
           category (at least 3 peers, else the global median over all
           live-token protocols), winsorised to [0.05, 3.0]
growth   = clamp(change_7d, -60, 120) per cent
growthMult   = 1 + (growth / 100) x 0.5
maturityMult = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365)
chainMult    = 1 + 0.03 x min(chains - 1, 3)
implied  = max(1, round(tvl_usd x peer x growthMult x maturityMult x chainMult))
```

The one claim is the **peer multiple**: a token, when it launches, is priced
the way the market already prices the tokens of protocols like it. On this
snapshot the global median is 0.25x; category medians run from 0.13x (Lending,
n=15) to 1.22x (Cross Chain Bridge, n=4). The peer multiple is rounded to 4
decimals *before* it is used, so the dashboard's recompute of a row lands on
exactly the number `board.json` carries — the detail view shows that check.

No protocol name is special-cased: one function scores every row, and every
row carries the peer multiple and peer count it was scored with.

### Coverage

- **Board: 178 rows.** All 40 watchlist protocols, plus all 138 rankable
  pre-token protocols below the $50M floor.
- **Rankable** = records no token (`mcap_usd`, `gecko_id` and `symbol` all
  null) and is not a wrapped, staked or bridged product: excluded categories
  (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC,
  CEX), versioned names (`… V2`, `… 2.0`), names containing a whole word
  `wrapped` / `staked` / `staking`, and names beginning with an exchange name.
  This is the house watchlist rule, re-applied to the early rows.
- **Set aside, not ranked: 92 protocols.** Pre-token protocols above the
  $50M floor that the watchlist leaves out. The snapshot carries no
  `parentProtocol` field, so the house rule that excluded them cannot be
  re-derived here; the radar does not second-guess that exclusion and lists
  them in the dashboard's "Set aside" tab with the reason instead of ranking
  them. (20 of the 92 pass the name/category filters and are almost certainly
  parent-protocol children, e.g. a curator vault or a perps deployment of a
  larger protocol.)
- **Live token: 24 shown** (top 24 by market cap), kept apart from the ranking
  with their market caps — and they are the peers the model prices from.

### Farm plans

Six steps per protocol, derived from its own record (category, chains, TVL,
age) — never from a hand-written list of names. Each step states a cost and a
time: fresh wallet, the category's one action with a capital tier ($50/$100/
$150/$250 by TVL), a weekly qualifying action, a hold of 30–60 days by age,
claiming only from the protocol's own published link, and a farm log.

### Assumptions and limits (stated on the dashboard too)

- "Records no token" is what the snapshot says, never proof a protocol has
  none; a protocol on the list may still have a token its DefiLlama record
  does not carry.
- Implied value is the model's estimate, not a price, and no row predicts
  whether or when a token launches.
- Age is the time since DefiLlama first listed the protocol; 24 board rows
  have no `listed_at` and use 365 days. Two rows have no `change_7d` and use 0%.
- The snapshot is frozen at 2026-11-14. The program re-reads whatever
  snapshot it is given, so a future snapshot re-ranks the board — but the
  grade reads this snapshot's bytes.

## How to read the dashboard

- **Top of the page:** the five strongest launches as cards, then the board.
- **The board:** rank, protocol, TVL, 7-day growth, age with no token, peer
  multiple, implied value (with a bar), token status. Click a row (or a top-5
  card) for its detail view.
- **Detail view:** the full model breakdown (TVL × peer × growth × maturity ×
  chain = implied), the peer evidence (how many live-token peers set the
  multiple, or that the global median was used), a one-sentence "why this
  rank", the recompute check against `board.json`, and the six-step farm plan
  with costs and times.
- **Filters:** search (name/category/chain), category, chain, and three tabs —
  Pre-token, Live token, Set aside. Sorting by implied value, TVL, growth,
  age, peer multiple or name. State is kept in the URL hash, so a filtered
  view or a detail view is a link.
- **Model panel** (below the board): the formula, the peer-multiple table by
  category with peer counts, and the disclaimers.

## Validation (all run from scratch, 2026-11-17)

`./run.sh` passes every check:

- **Gate replica (`scripts/check.py`): all 10 checks pass** — dashboard files
  (3 files, 37,608 bytes, no network references), board file (178 rows),
  sorted by value (ranks 1–178, top $583,082,314, bottom $608,860), watchlist
  coverage 40/40, farm steps (6 per row, 20–600 chars), screenshots
  (3 × 1440×900 JPEG, 139–152 KB each), dossier (611,483 bytes, text
  37,922 of 65,536 bytes — the whole dashboard source fits, nothing cut),
  `data.js` agrees with `board.json`, all rows pre-token, no
  wrapped/staked/versioned rows.
- **Dossier byte-match:** rebuilding `dossier.json` from `out/` with the
  vendored library produces byte-identical output (`dossier_matches` row).
- **Render checks (headless Chrome):** the board renders 178 rows with no
  empty state; the detail view opens from the URL hash and its recompute line
  reads "the same number board.json carries"; the live and set-aside tabs
  render; the model panel, peer table and footer render at the bottom of the
  page. All three dossier screenshots were read back visually and show the
  board, the detail dialog (with model breakdown and farm plan) and the
  filtered view (Risk Curators, 33 rows).
- **Top 5 by implied value:** Steakhouse Financial $583.1M, Gauntlet $347.3M,
  Veda $333.9M, USDD $153.2M, Upshift $119.8M. Sanity: the ordering is driven
  by TVL × peer multiple, and the peer multiples in the table (0.13x–1.22x)
  match the live-token market on this snapshot.

Two bugs found and fixed during testing: the dashboard's recompute disagreed
with `board.json` by a few dollars because the peer multiple was rounded only
when stored (fixed: round before use); and the top-5 spotlight cards ran the
value and the TVL onto one line (fixed in CSS).

## Iterating (3 submissions allowed)

This entry is built to be re-submitted after grading feedback:

1. Edit the model in `lib/model.ts` (constants in `MODEL`, peer rules in
   `buildPeerTable`, farm plans in `farmSteps`) or the page in `dashboard/`.
2. Run `./run.sh` — it rebuilds everything and re-runs the gate replica.
   If a check fails, fix it before submitting; the gate is pass/fail and an
   invalid entry is listed with 0 and no rate.
3. Re-render screenshots only when the dashboard changed (`scripts/shots.sh`
   reads the current `out/`).
4. Keep a note of what changed between submissions (model version label in
   `lib/model.ts`, `MODEL_VERSION`, is the place to bump it).

Ideas worth trying if the dev grade comes back weak: a stronger growth signal
(e.g. rank by implied value per unit of TVL, or a momentum term that rewards
sustained rather than one-week growth — the snapshot only carries 7-day
change, so this would need care); a "newness" view for the youngest protocols;
or a denser first screen so the judge's board screenshot shows more rows.
Do not chase these blindly — the judge weighs coverage and a stated value
model first, then farm plans, then the page.

## What is still needed to submit

- **A public GitHub repository** containing this project (minus `out/` and
  the kit), with a commit; the submission needs the repo URL and the full
  40-character commit SHA.
- **A transcript bundle** (`.tar.gz`) made by the kit's CLI
  (`node cli/makefun.mjs bundle`, run from inside the unpacked kit) over the
  agent sessions that built this entry. The kit is kept at
  `../kit-token-radar-01/token-radar-01-kit/` (outside this repo) for that.
  The bundle needs the run record (harness, version, provider, model,
  effort, prompt, MCP servers, instruction files); this session's harness
  details must be supplied when bundling.
- **An account + API key on make.fun** for the actual submission — not
  present here, and deliberately not created by this build.
- The deadline is **14 Dec 2026 10:00 UTC** (17:00 WIB). Entries are open
  30 days from 14 Nov 2026; up to 3 submissions per bounty are allowed.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
