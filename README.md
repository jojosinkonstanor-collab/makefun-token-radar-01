# Token Radar — make.fun bounty `token-radar-01`

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jojosinkonstanor-collab/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jojosinkonstanor-collab/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)


A program that reads a sealed DefiLlama snapshot, ranks the protocols that
record no token by what their launch would be worth, and writes a static web
dashboard with a farm plan for each one. Built for the make.fun bounty
**"Build the best token launch radar"** ($1,325, deadline 14 Dec 2026 10:00 UTC).

> Status: **round 2 (radar-3) complete and verified, not yet submitted.**
> Round 1 was submitted 17 Nov 2026 (rank 6202, judge 82.75%); this iteration
> is awaiting a go-ahead before it is submitted. No secret or key is in this
> repository. Submission (public GitHub repo + commit + transcript bundle) is
> a separate step — see
> [What is still needed to submit](#what-is-still-needed-to-submit).

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | Entry point (Node 22, standard library only). Reads the snapshot, writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/`, writes `dossier.json`. |
| `lib/model.ts` | The radar-3 model: fitted size curve, blind tests, rank ranges, farm economics, board construction. |
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

## The model (radar-3)

Implied value follows from a comps curve **fitted** to the snapshot's own traded
tokens — log(market cap / TVL) against log TVL, plus a small multi-chain term —
and the fit is **tested blind by the same program**, with the results printed on
the board:

```
log(mcap_usd / tvl_usd) = -1.156 - 0.527 x (log tvl_usd - 17.121)
                          - 0.215 x min(chains - 1, 3) / 3
implied = max(1, round(tvl_usd x exp(...))), ratio winsorised to [0.005, 3]
```

Fitted by least squares to the 119 live-token, non-CEX protocols with a market
cap and TVL. The curve is the market's own size effect: bigger protocols trade
at lower multiples of TVL (mcap grows like TVL^0.47). The chain term is small
and about neutral out-of-sample; it is kept because without a per-row term the
board order would be TVL order alone and no refit could move a rank — the rank
ranges would collapse to points.

Blind tests, run by the program on the same snapshot (leave-one-out over the
119 traded tokens; walk-forward: train on the long-listed, test the newly
listed):

| Model | LOO median \|log error\| | LOO RMSE | Walk-forward 730d |
|---|---|---|---|
| **Size curve + chains (radar-3)** | **1.196** | **2.099** | **1.072** |
| Size curve alone | 1.212 | 2.085 | 1.020 |
| Flat global median | 1.597 | 2.270 | 1.636 |
| Category median (radar-2) | 1.716 | 2.401 | — |

The category median — the radar-2 model — is worse than a flat median
out-of-sample: 35 categories on 119 tokens overfits. Seven-day growth and age
were tried as extra terms and **dropped**: neither improves the leave-one-out
error beyond noise, and together with the chain term they are much worse
walk-forward (1.731 vs 1.072). They stay on the board as context and age still
sets the farm plan's hold, but they do not move the price. A robust Theil–Sen
fit gives slope −0.492 (OLS −0.527), so the curve is not an outlier artefact,
and the TVL-bin medians track the curve ($5–50M: 0.419 vs 0.382; $50–500M:
0.131 vs 0.113; $500M–5B: 0.032 vs 0.034; $5–50B: 0.008 vs 0.010).

**Rank ranges:** 200 bootstrap refits of the curve (seeded, so two runs are
byte-identical) re-rank the board; every row carries its 5th–95th percentile
rank (median width 33 places). The top is stable (Steakhouse #1–#1, Gauntlet
#2–#7); the mid-board moves (e.g. rank #86 spans #50–#157).

No protocol name is special-cased: one function scores every row, and every
row carries the fitted ratio and rank range it was scored with.

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

Seven steps per protocol, derived from its own record (category, chains, TVL,
age) and its economics — never from a hand-written list of names. Each step
states a cost and a time, and the plan is **dated** (start = snapshot date,
weekly actions on dates, hold-until date) and **netted to the dollar** in the
last step: gas per transaction by chain (the entry's own stated assumptions —
Ethereum $2.50, Arbitrum $0.15, Base $0.05, Solana $0.02, $0.50 default),
a counted number of transactions (2 setup + 1 a week + 1 to claim), the
capital tier ($50/$100/$150/$250 by TVL), the opportunity cost of locking
that capital at 8% a year over the hold, the all-in cost, the cash deployed,
and the break-even share of implied value — plus a verdict from a stated
rule: **FARM** when cash deployed is at most $1 per $125,000 of implied
value and the 95th-percentile refit rank is at most 80; **THIN** when it is
at most $1 per $80,000 or the rank is at most 40; **SKIP** otherwise.
On this snapshot: 54 FARM, 99 THIN, 25 SKIP.

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

- **Top of the page:** the five strongest launches as cards (with refit rank
  range, farm gas cost and verdict), then the board.
- **The board:** rank, protocol, TVL, 7-day growth, age with no token, fitted
  ratio, implied value (with a bar), farm gas cost, verdict. Click a row (or a
  top-5 card) for its detail view.
- **Detail view:** the full model breakdown (TVL × fitted ratio = implied),
  the comps evidence (traded tokens at this size vs the curve), the rank range
  from 200 refits, a one-sentence "why this rank", the recompute check against
  `board.json`, the seven-step farm plan with costs and times, and the farm
  economics netted to the dollar.
- **Filters:** search (name/category/chain), category, chain, and three tabs —
  Pre-token, Live token, Set aside. Sorting by implied value, TVL, growth,
  age, fitted ratio, farm cost, verdict or name. State is kept in the URL hash, so a filtered
  view or a detail view is a link.
- **Model panel** (below the board): the fitted curve, the blind-test tables
  (leave-one-out vs flat/category baselines, walk-forward, TVL bins vs the
  curve), the dropped-terms note, and the gas assumptions.

## Validation (all run from scratch, 2026-11-18)

`./run.sh` passes every check (15 checks in `scripts/check.py`, incl. the
radar-3 model checks):

- **Gate replica (`scripts/check.py`): all 15 checks pass** — dashboard files
  (4 files, 48,032 bytes, no network references), board file (178 rows),
  sorted by value (ranks 1–178, top $61,498,451, bottom $3,103,471), watchlist
  coverage 40/40, farm steps (7 per row, 20–600 chars), screenshots
  (3 × 1440×900 JPEG, 165–177 KB each), dossier (805,198 bytes, text
  48,189 of 65,536 bytes — the whole dashboard source fits, nothing cut),
  `data.js` agrees with `board.json`, all rows pre-token, no
  wrapped/staked/versioned rows, **model beats baselines** (LOO 1.196 vs
  category 1.716 vs flat 1.597), **rank ranges** (median width 33, max 107,
  no violations), **verdicts discriminate** (54 FARM / 99 THIN / 25 SKIP),
  **page recompute matches board** (every row's implied value recomputed from
  the fit), `model.js` in the dossier text.
- **Dossier byte-match:** rebuilding `dossier.json` from `out/` with the
  vendored library produces byte-identical output (`dossier_matches` row).
- **Determinism:** two runs of `main.ts` into different directories write
  byte-identical trees (`diff -r` clean) — the 200 bootstrap refits use a
  seeded generator.
- **Render checks (headless Chrome):** the board renders 178 rows with no
  empty state; the model strip, top-5 cards (with refit ranges and verdicts)
  and the first board rows show on the first screen; the detail view opens
  from the URL hash and shows the model breakdown, rank range, all seven farm
  steps including the net step, and the farm economics; the filtered view
  (Risk Curators, 33 rows) renders with the table; the live and set-aside tabs
  render; the model panel, validation tables and footer render at the bottom
  of the page. All three dossier screenshots were read back visually.
- **Top 5 by implied value:** Steakhouse Financial $61.5M (#1–#1), Gauntlet
  $47.2M (#2–#7), Veda $47.0M (#3–#8), USDD $42.0M (#2–#4), Nonce Capital
  $32.1M (#5–#7). Sanity: the ordering is driven by TVL through the fitted
  curve, and the TVL-bin medians track the curve (see the model section).

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

Round 1 → round 2 (radar-3), all measured on the sealed snapshot — see
`analysis/AUDIT-v2.md` for the full audit: the flat category-median model was
replaced by a fitted size curve tested blind (LOO 1.716 → 1.196), farm plans
were costed, dated and netted with a FARM/THIN/SKIP verdict (54/99/25), and
every row gained a rank range from 200 refits. What the blind test rejected:
growth/age terms, and ranking the 14 extra protocols the #11 entry's 192 rows
imply (they are versioned deployments or products of token'd protocols).

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
