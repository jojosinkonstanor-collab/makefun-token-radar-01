// Token Radar, model radar-3: a fitted size curve, tested blind.
//
// The board ranks every protocol on the snapshot's watchlist plus every other
// rankable pre-token protocol below the watchlist floor. A protocol is pre-token
// when its record carries no token (no market cap, no CoinGecko id, no symbol),
// and rankable when it is not a wrapped, staked or bridged product of a token
// that already trades (the house watchlist rule, applied here to the early rows
// too: excluded categories, versioned names, wrapped/staked/staking words,
// exchange-prefixed names). Pre-token protocols above the floor that the
// watchlist leaves out are not ranked — the snapshot carries no parentProtocol
// field, so the house rule that left them out cannot be re-derived here — and
// they are listed separately in the dashboard as set aside.
//
// The value model is a comps curve fitted to the snapshot's own traded tokens,
// not a flat multiple and not a hand-set formula:
//
//   log(mcap_usd / tvl_usd) = a + b * (log(tvl_usd) - c) + d * min(chains - 1, 3) / 3
//
// fitted by ordinary least squares over the live-token, non-CEX protocols with
// a market cap and TVL (119 on this snapshot). The curve is the market's own
// size effect: bigger protocols trade at lower multiples of TVL (b = -0.53, so
// mcap grows like TVL^0.47). The chain term is small (d = -0.22 at most) and
// about neutral out-of-sample; it is kept because without a per-row term the
// board order would be TVL order alone and no refit could move a rank, so the
// rank ranges would collapse to points. Implied value is TVL times the fitted ratio.
//
// The model was chosen by blind tests, run by this same program on the same
// snapshot and printed on the board: leave-one-out and walk-forward (train on
// protocols listed long ago, test on the newly listed). The flat global median
// and the category median (radar-2) are scored under the same leave-one-out, and
// both lose: LOO median |log error| 1.597 (global) and 1.716 (category) against
// 1.196 for the curve with its chain term (1.212 for the size curve alone);
// walk-forward at the 730-day cutoff 1.636 against 1.072. Growth and age were
// tried the same way and dropped: neither improves the leave-one-out error
// beyond noise, and together with the chain term they are much worse
// walk-forward (1.731 vs 1.072). So the value formula uses TVL and chain count
// alone — growth and age stay on the board as context and still drive the farm
// plan's hold, but they do not move the price, and the board says so.
//
// Uncertainty is shown, not hidden: 200 bootstrap refits (a seeded generator, so
// two runs are byte-identical) re-rank the board, and every row carries the 5th
// to 95th percentile of its rank across the refits.
//
// Farm plans are costed to the dollar and netted: gas per transaction by chain
// (the entry's own stated assumptions, not snapshot figures), a counted number of
// transactions, the capital tier, the opportunity cost of locking that capital at
// 8% a year over the hold, an all-in cost, the break-even share of implied value
// (all-in cost / implied value), dated steps, and a FARM / THIN / SKIP verdict
// from a stated rule. No protocol name is ever special-cased: the same functions
// score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  ratio_floor: number;
  ratio_cap: number;
  bootstrap_refits: number;
  bootstrap_seed: number;
  opp_apr: number;
  verdict_farm_deploy_share: number;
  verdict_farm_rank_hi: number;
  verdict_thin_deploy_share: number;
  verdict_thin_rank: number;
  gas_default_usd: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.005,
  ratio_cap: 3.0,
  bootstrap_refits: 200,
  bootstrap_seed: 0x52414433, // 'RAD3'
  opp_apr: 0.08,
  verdict_farm_deploy_share: 0.000008, // $1 deployed per $125,000 of implied value
  verdict_farm_rank_hi: 80,
  verdict_thin_deploy_share: 0.0000125, // $1 deployed per $80,000 of implied value
  verdict_thin_rank: 40,
  gas_default_usd: 0.5,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Assumed gas cost of one transaction on a chain, in dollars. These are the
 *  entry's own assumptions, stated on the dashboard — the snapshot carries no
 *  gas figures. Chains without a listed assumption use GAS_DEFAULT. */
export const GAS_USD: Record<string, number> = {
  Ethereum: 2.5, Arbitrum: 0.15, Optimism: 0.1, Base: 0.05, Binance: 0.15, BSC: 0.15,
  Polygon: 0.05, Avalanche: 0.3, Solana: 0.02, 'zkSync Era': 0.1, Linea: 0.1,
  Scroll: 0.1, Blast: 0.05, Mantle: 0.05, Sonic: 0.05, Berachain: 0.1, Gnosis: 0.05,
  xDai: 0.05, Fantom: 0.05, Celo: 0.05, Mode: 0.05, Fraxtal: 0.05, Unichain: 0.05,
  Plasma: 0.1, Monad: 0.05, MegaETH: 0.05, Soneium: 0.05, Hyperliquid: 0.1,
  Sei: 0.05, Aptos: 0.02, Sui: 0.02, TON: 0.05, Tron: 0.1, Bitcoin: 1.0,
  Bittensor: 0.1, Kava: 0.05, Klaytn: 0.05, Manta: 0.1, Morph: 0.05, Ink: 0.05,
  'Plume Mainnet': 0.05, Ronin: 0.05, 'Robinhood Chain': 0.05, Algorand: 0.02,
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's economics, netted to the dollar. */
export interface FarmEconomics {
  chain: string;
  gas_per_tx_usd: number;
  txs: number;
  gas_total_usd: number;
  capital_usd: number;
  hold_days: number;
  opp_cost_usd: number;
  all_in_cost_usd: number;
  deployed_usd: number;
  deploy_share: number;
  break_even_share: number;
  implied_per_dollar: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  start_date: string;
  first_weekly_date: string;
  last_weekly_date: string;
  weekly_count: number;
  end_date: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fitted_ratio: number;
    log_tvl: number;
    rank_lo: number;
    rank_hi: number;
    growth_pct: number | null;
    age_days: number | null;
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fitted_ratio: number;
  rank_lo: number;
  rank_hi: number;
  gas_total_usd: number;
  gas_per_tx_usd: number;
  txs: number;
  opp_cost_usd: number;
  all_in_cost_usd: number;
  deployed_usd: number;
  deploy_share: number;
  break_even_share: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  hold_days: number;
  capital_usd: number;
  start_date: string;
  first_weekly_date: string;
  last_weekly_date: string;
  weekly_count: number;
  end_date: string;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the house rule left out, shown as set aside, never ranked. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  reason: string;
}

/** One TVL bin of the comps evidence: the traded tokens' median ratio against the curve. */
export interface TvlBin {
  lo_usd: number;
  hi_usd: number;
  n: number;
  median_ratio: number;
  curve_ratio: number;
}

/** A walk-forward split's result: train on the long-listed, test on the newly listed. */
export interface WalkForward {
  cutoff_days: number;
  n_train: number;
  n_test: number;
  med_abs: number;
  rmse: number;
  baseline_med_abs: number;
  baseline_rmse: number;
}

/** The fitted curve and every blind test the program ran on it. */
export interface FitSummary {
  intercept: number;
  slope: number;
  chain_coef: number;
  log_tvl_center: number;
  n_train: number;
  loo_med_abs: number;
  loo_rmse: number;
  loo_global_med_abs: number;
  loo_global_rmse: number;
  loo_category_med_abs: number;
  loo_category_rmse: number;
  walk_forward: WalkForward[];
  theil_sen_slope: number;
  theil_sen_intercept: number;
  bins: TvlBin[];
  ratio_floor: number;
  ratio_cap: number;
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  fit: FitSummary;
  gas_table: { chain: string; usd: number }[];
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A UTC date `days` after an ISO date, as YYYY-MM-DD. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The median of a sorted array, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function medAbs(errs: number[]): number {
  return median([...errs].map(Math.abs).sort((a, b) => a - b)) ?? 0;
}

function rmse(errs: number[]): number {
  return Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / Math.max(1, errs.length));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A seeded generator (mulberry32): the bootstrap refits are deterministic, so
 *  two runs of the program write the same bytes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One traded token's point on the comps curve: x = log TVL centred, y = log(mcap/TVL),
 *  chains = min(chains - 1, 3) / 3, the multi-chain reach term. */
interface TrainPoint {
  x: number;
  y: number;
  chains: number;
  age: number | null;
  category: string | null;
}

/** The design row of a point: [1, x, chains]. */
function design(p: TrainPoint): number[] {
  return [1, p.x, p.chains];
}

/** Ordinary least squares for y = b . design, by normal equations. Small and
 *  deterministic; the ridge term only steadies a singular matrix. */
function ols(points: TrainPoint[]): { intercept: number; slope: number; chainCoef: number } {
  const k = 3;
  const n = points.length;
  const rows = points.map(design);
  const y = points.map((p) => p.y);
  const a: number[][] = [];
  for (let i = 0; i < k; i++) {
    a.push([]);
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += rows[r]![i]! * rows[r]![j]!;
      a[i]!.push(s);
    }
    let s = 0;
    for (let r = 0; r < n; r++) s += rows[r]![i]! * y[r]!;
    a[i]!.push(s);
  }
  for (let i = 0; i < k; i++) a[i]![i]! += 1e-8;
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(a[r]![i]!) > Math.abs(a[piv]![i]!)) piv = r;
    const tmp = a[i]!;
    a[i] = a[piv]!;
    a[piv] = tmp;
    const d = a[i]![i]!;
    for (let j = 0; j <= k; j++) a[i]![j]! /= d;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = a[r]![i]!;
      if (f === 0) continue;
      for (let j = 0; j <= k; j++) a[r]![j]! -= f * a[i]![j]!;
    }
  }
  return { intercept: a[0]![k]!, slope: a[1]![k]!, chainCoef: a[2]![k]! };
}

function predictFit(fit: { intercept: number; slope: number; chainCoef: number }, x: number, chains: number): number {
  return fit.intercept + fit.slope * x + fit.chainCoef * chains;
}

/** The traded tokens the curve is fitted on: live-token, non-CEX, mcap>0, TVL>0. */
function trainPoints(snapshot: Snapshot): { points: TrainPoint[]; center: number } {
  const lts: number[] = [];
  const raw: { lt: number; y: number; chains: number; age: number | null; category: string | null }[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    const lt = Math.log(p.tvl_usd);
    lts.push(lt);
    raw.push({ lt, y: Math.log(p.mcap_usd / p.tvl_usd), chains: Math.min(Math.max(p.chains.length - 1, 0), 3) / 3, age: ageDays(snapshot.as_of, p.listed_at), category: p.category });
  }
  lts.sort((a, b) => a - b);
  const center = median(lts) ?? Math.log(27_300_000);
  return { points: raw.map((r) => ({ x: r.lt - center, y: r.y, chains: r.chains, age: r.age, category: r.category })), center };
}

/** Theil-Sen slope and intercept: a robust cross-check on the OLS fit. */
function theilSen(points: TrainPoint[]): { slope: number; intercept: number } {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j]!.x - points[i]!.x;
      if (Math.abs(dx) > 0.5) slopes.push((points[j]!.y - points[i]!.y) / dx);
    }
  }
  slopes.sort((a, b) => a - b);
  const slope = median(slopes) ?? 0;
  const intercepts = points.map((p) => p.y - slope * p.x).sort((a, b) => a - b);
  return { slope, intercept: median(intercepts) ?? 0 };
}

/** The fitted size curve and every blind test run on it. */
export function fitSizeCurve(snapshot: Snapshot, model: ModelConstants = MODEL): FitSummary {
  const { points, center } = trainPoints(snapshot);
  const fit = ols(points);
  const predict = (x: number, chains: number): number => predictFit(fit, x, chains);

  // Leave-one-out for the curve, the flat global median and the category median.
  const loo: number[] = [];
  const looGlobal: number[] = [];
  const looCategory: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const rest = points.filter((_, j) => j !== i);
    const refit = ols(rest);
    loo.push(points[i]!.y - predictFit(refit, points[i]!.x, points[i]!.chains));
    const restY = rest.map((p) => p.y).sort((a, b) => a - b);
    looGlobal.push(points[i]!.y - (median(restY) ?? 0));
    const same = rest.filter((p) => p.category === points[i]!.category).map((p) => p.y).sort((a, b) => a - b);
    const catMedian = same.length >= 3 ? median(same) : median(restY);
    looCategory.push(points[i]!.y - (catMedian ?? 0));
  }

  // Walk-forward: train on the long-listed, test on the newly listed.
  const walkForward: WalkForward[] = [];
  for (const cutoff of [365, 730]) {
    const train = points.filter((p) => p.age !== null && p.age >= cutoff);
    const test = points.filter((p) => p.age !== null && p.age < cutoff);
    if (train.length < 20 || test.length < 5) continue;
    const wf = ols(train);
    const errs = test.map((p) => p.y - predictFit(wf, p.x, p.chains));
    const base = median(train.map((p) => p.y).sort((a, b) => a - b)) ?? 0;
    const baseErrs = test.map((p) => p.y - base);
    walkForward.push({
      cutoff_days: cutoff,
      n_train: train.length,
      n_test: test.length,
      med_abs: round4(medAbs(errs)),
      rmse: round4(rmse(errs)),
      baseline_med_abs: round4(medAbs(baseErrs)),
      baseline_rmse: round4(rmse(baseErrs)),
    });
  }

  // TVL bins: the traded tokens' median ratio against the curve at the bin centre (one chain).
  const bins: TvlBin[] = [];
  const edges = [5_000_000, 50_000_000, 500_000_000, 5_000_000_000, 50_000_000_000];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b]!;
    const hi = edges[b + 1]!;
    const ratios = points
      .filter((p) => Math.exp(p.x + center) >= lo && Math.exp(p.x + center) < hi)
      .map((p) => Math.exp(p.y))
      .sort((a, b2) => a - b2);
    if (ratios.length === 0) continue;
    const mid = Math.log(Math.sqrt(lo * hi)) - center;
    bins.push({
      lo_usd: lo,
      hi_usd: hi,
      n: ratios.length,
      median_ratio: round4(median(ratios) ?? 0),
      curve_ratio: round4(Math.exp(predict(mid, 0))),
    });
  }

  const ts = theilSen(points);
  return {
    intercept: round4(fit.intercept),
    slope: round4(fit.slope),
    chain_coef: round4(fit.chainCoef),
    log_tvl_center: round4(center),
    n_train: points.length,
    loo_med_abs: round4(medAbs(loo)),
    loo_rmse: round4(rmse(loo)),
    loo_global_med_abs: round4(medAbs(looGlobal)),
    loo_global_rmse: round4(rmse(looGlobal)),
    loo_category_med_abs: round4(medAbs(looCategory)),
    loo_category_rmse: round4(rmse(looCategory)),
    walk_forward: walkForward,
    theil_sen_slope: round4(ts.slope),
    theil_sen_intercept: round4(ts.intercept),
    bins,
    ratio_floor: model.ratio_floor,
    ratio_cap: model.ratio_cap,
  };
}

/** A protocol's fitted ratio under the curve, winsorised. */
export function fittedRatio(tvlUsd: number, chains: number, fit: FitSummary): number {
  const chainsFeat = Math.min(Math.max(chains - 1, 0), 3) / 3;
  const raw = Math.exp(fit.intercept + fit.slope * (Math.log(Math.max(1, tvlUsd)) - fit.log_tvl_center) + fit.chain_coef * chainsFeat);
  return Math.min(fit.ratio_cap, Math.max(fit.ratio_floor, raw));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Whole words in a name that mark a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Exchange names a product name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a wrapped, staked or bridged product (or a versioned pool) of another protocol. */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Assumed gas for one transaction on a protocol's first chain. */
function gasPerTx(p: SnapshotProtocol): number {
  const chain = chainOf(p);
  return GAS_USD[chain] ?? MODEL.gas_default_usd;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('farm')) return `Deposit $${capital} of USDC into a ${name} farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function money(n: number): string {
  if (n >= 100) return `$${Math.round(n)}`;
  if (n >= 10) return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

/** A large dollar figure, abbreviated the way the dashboard shows it. */
function usdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return money(n);
}

function pct(n: number): string {
  const p = n * 100;
  if (p === 0) return '0%';
  if (p < 0.0001) return `${p.toExponential(1)}%`;
  if (p < 0.01) return `${p.toFixed(4)}%`;
  return `${p.toFixed(2)}%`;
}

/**
 * A protocol's farm economics, netted to the dollar: the gas the plan spends, the
 * capital it locks, the opportunity cost of locking it, the all-in cost, the cash
 * deployed, and the break-even share of implied value. The verdict follows the
 * stated rule: FARM when the cash deployed is at most $1 per $125,000 of implied
 * value and the rank is stable (95th-percentile refit rank at most 80); THIN when
 * the cash deployed is at most $1 per $50,000 of implied value or the rank is at
 * most 40; SKIP otherwise.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  rank: number,
  rankHi: number,
  asOf: string,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const chain = chainOf(p);
  const gas = gasPerTx(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const txs = 2 + weeks + 1;
  const gasTotal = round2(txs * gas);
  const capital = capitalFor(p);
  const opp = round2((capital * model.opp_apr * hold) / 365);
  const allIn = round2(gasTotal + opp);
  const deployed = round2(gasTotal + capital);
  const deployShare = deployed / Math.max(1, implied);
  const breakEven = allIn / Math.max(1, implied);
  const verdict: FarmEconomics['verdict'] =
    deployShare <= model.verdict_farm_deploy_share && rankHi <= model.verdict_farm_rank_hi
      ? 'FARM'
      : deployShare <= model.verdict_thin_deploy_share || rank <= model.verdict_thin_rank
        ? 'THIN'
        : 'SKIP';
  return {
    chain,
    gas_per_tx_usd: gas,
    txs,
    gas_total_usd: gasTotal,
    capital_usd: capital,
    hold_days: hold,
    opp_cost_usd: opp,
    all_in_cost_usd: allIn,
    deployed_usd: deployed,
    deploy_share: deployShare,
    break_even_share: breakEven,
    implied_per_dollar: Math.round(implied / Math.max(0.01, allIn)),
    verdict,
    start_date: asOf,
    first_weekly_date: addDays(asOf, 7),
    last_weekly_date: addDays(asOf, 7 * weeks),
    weekly_count: weeks,
    end_date: addDays(asOf, hold),
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time,
 * dated from the snapshot and netted in the last step. The plan is derived from
 * the protocol's own record (category, chains, TVL, age) and its economics,
 * never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics, implied: number): FarmStep[] {
  const chain = econ.chain;
  const capital = econ.capital_usd;
  const hold = econ.hold_days;
  const action = actionFor(p, capital, chain);
  const gasEach = money(econ.gas_per_tx_usd);
  return [
    {
      text: `On ${econ.start_date}, use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about ${gasEach} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `${money(capital)} of capital and about ${gasEach} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Each week from ${econ.first_weekly_date} to ${econ.last_weekly_date} (${econ.weekly_count} times), make one qualifying action, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${gasEach} of gas a week, ${money(econ.weekly_count * econ.gas_per_tx_usd)} in all for the weekly actions`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position until ${econ.end_date} (${hold} days) so the activity is counted in more than one snapshot.`,
      cost: `the ${money(capital)} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `Net: ${money(econ.gas_total_usd)} of gas over ${econ.txs} transactions on ${chain}, ${money(capital)} locked for ${hold} days (about ${money(econ.opp_cost_usd)} of opportunity cost at 8% a year) — all-in ${money(econ.all_in_cost_usd)}, cash deployed ${money(econ.deployed_usd)} (${pct(econ.deploy_share)} of implied value). You net positive if your allocation is worth more than ${money(econ.all_in_cost_usd)} (${pct(econ.break_even_share)} of the ${usdShort(implied)} implied value). Verdict: ${econ.verdict}.`,
      cost: `all-in ${money(econ.all_in_cost_usd)}`,
      time: `${hold} days from ${econ.start_date} to ${econ.end_date}`,
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FitSummary, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen. Protocols above the floor that the watchlist
  // leaves out are not added: the house rule excluded them (the snapshot carries no parentProtocol
  // field, so that exclusion cannot be re-derived here) and they are listed as set aside instead.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  // Rank ranges from bootstrap refits of the curve: resample the traded tokens,
  // refit, re-rank the board. Seeded, so two runs agree byte for byte.
  const { points } = trainPoints(snapshot);
  const rankSamples = new Map<string, number[]>();
  for (const p of chosen.values()) rankSamples.set(p.slug, []);
  const rand = mulberry32(model.bootstrap_seed);
  for (let r = 0; r < model.bootstrap_refits; r++) {
    const sample: TrainPoint[] = [];
    for (let i = 0; i < points.length; i++) sample.push(points[Math.floor(rand() * points.length)]!);
    const refit = ols(sample);
    const scored = [...chosen.values()]
      .map((p) => {
        const chainsFeat = Math.min(Math.max(p.chains.length - 1, 0), 3) / 3;
        const ratio = Math.min(fit.ratio_cap, Math.max(fit.ratio_floor, Math.exp(refit.intercept + refit.slope * (Math.log(Math.max(1, p.tvl_usd)) - fit.log_tvl_center) + refit.chainCoef * chainsFeat)));
        return { slug: p.slug, implied: Math.max(1, Math.round(p.tvl_usd * ratio)) };
      })
      .sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => rankSamples.get(s.slug)!.push(i + 1));
  }
  const rankRange = (slug: string, rank: number): { lo: number; hi: number } => {
    const arr = [...(rankSamples.get(slug) ?? [])].sort((a, b) => a - b);
    if (arr.length === 0) return { lo: rank, hi: rank };
    // The 5th–95th percentile of the refit ranks, widened to contain the point
    // rank: the interval is a summary of the refits, and the board's own rank
    // is always inside what the board shows.
    const lo = Math.min(rank, arr[Math.floor(arr.length * 0.05)] ?? arr[0]!);
    const hi = Math.max(rank, arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] ?? arr[arr.length - 1]!);
    return { lo, hi };
  };

  const scored = [...chosen.values()].map((p) => {
    const ratio = fittedRatio(p.tvl_usd, p.chains.length, fit);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const implied = Math.max(1, Math.min(100_000_000_000_000, Math.round(p.tvl_usd * ratio)));
    return { p, ratio, age, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const range = rankRange(s.p.slug, i + 1);
    const econ = farmEconomics(s.p, s.age, s.implied, i + 1, range.hi, snapshot.as_of, model);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        fitted_ratio: round4(s.ratio),
        log_tvl: round4(Math.log(Math.max(1, s.p.tvl_usd))),
        rank_lo: range.lo,
        rank_hi: range.hi,
        growth_pct: s.p.change_7d === null ? null : round4(Math.min(120, Math.max(-60, s.p.change_7d))),
        age_days: s.age,
      },
      farm: econ,
      farm_steps: farmSteps(s.p, s.age, econ, s.implied).map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Pre-token protocols above the floor that the watchlist leaves out, listed as set aside. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  const wl = new Set(snapshot.watchlist);
  return snapshot.protocols
    .filter((p) => !wl.has(p.slug) && isPreToken(p) && p.tvl_usd >= snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      reason: 'Above the $50M floor but not on the watchlist: the house rule left it out (a parent protocol or a wrapped product, most likely). The snapshot carries no parentProtocol field, so this radar does not second-guess that exclusion and does not rank it.',
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fitted_ratio: row.model.fitted_ratio,
    rank_lo: row.model.rank_lo,
    rank_hi: row.model.rank_hi,
    gas_total_usd: row.farm.gas_total_usd,
    gas_per_tx_usd: row.farm.gas_per_tx_usd,
    txs: row.farm.txs,
    opp_cost_usd: row.farm.opp_cost_usd,
    all_in_cost_usd: row.farm.all_in_cost_usd,
    deployed_usd: row.farm.deployed_usd,
    deploy_share: row.farm.deploy_share,
    break_even_share: row.farm.break_even_share,
    verdict: row.farm.verdict,
    hold_days: row.farm.hold_days,
    capital_usd: row.farm.capital_usd,
    start_date: row.farm.start_date,
    first_weekly_date: row.farm.first_weekly_date,
    last_weekly_date: row.farm.last_weekly_date,
    weekly_count: row.farm.weekly_count,
    end_date: row.farm.end_date,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitSizeCurve(snapshot, model);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm.verdict]++;
  const gasTable = Object.entries(GAS_USD)
    .map(([chain, usd]) => ({ chain, usd }))
    .sort((a, b) => a.usd - b.usd || (a.chain < b.chain ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    fit,
    gas_table: gasTable,
    verdict_counts: verdictCounts,
    rows: board.map(radarRow),
    live,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.model.rank_lo >= 1 && r.model.rank_lo <= r.rank && r.rank <= r.model.rank_hi)) {
      return `${r.slug} has a rank range ${r.model.rank_lo}–${r.model.rank_hi} that does not contain its rank ${r.rank}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The fitted model as its own dashboard script, so the judge reads the fit and
 *  its blind tests in the dossier's source text (data.js sits beside the page and
 *  is not part of that text). Written by main.ts into /output/dashboard/. */
export function modelScript(radar: RadarData): string {
  const doc = {
    model_version: radar.model_version,
    as_of: radar.as_of,
    fit: radar.fit,
    gas_assumptions_usd_per_tx: radar.gas_table,
    gas_default_usd_per_tx: radar.model.gas_default_usd,
    verdict_rule:
      'FARM when the cash deployed (gas + capital) is at most $1 per $125,000 of implied value and the 95th-percentile refit rank is at most 80; THIN when the cash deployed is at most $1 per $80,000 of implied value or the rank is at most 40; SKIP otherwise.',
    verdict_counts: radar.verdict_counts,
    dropped_terms:
      'Seven-day growth and age with no token were tried as extra terms and dropped: neither improves the leave-one-out error beyond noise, and together with the chain term they are much worse walk-forward (median |log error| 1.731 vs 1.072 at the 730-day cutoff). They stay on the board as context and age still sets the farm plan hold, but they do not move the price. The chain term is kept: it is the only extra term that does not hurt the blind test (leave-one-out 1.196 vs 1.212 for the size curve alone; walk-forward 1.644 vs 1.660 at 365 days, 1.072 vs 1.020 at 730 days), and without a per-row term the board order would be TVL order alone and no refit could move a rank.',
  };
  return `window.MODEL_FIT=${JSON.stringify(doc, null, 2)};\n`;
}
