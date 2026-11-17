// Token Radar's dashboard, model radar-3. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan, and the fitted curve with the blind tests
// that chose it. No network: every byte it shows is in data.js (and model.js, the fit's own
// script, written beside this page by main.ts so the dossier's source text carries it).
(function () {
  'use strict';

  var DATA = window.RADAR;
  var FIT = window.MODEL_FIT ? window.MODEL_FIT.fit : (DATA ? DATA.fit : null);
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }

  // The model in one function: the fitted size curve with its small chain term. The page
  // recomputes a row from the snapshot figures and checks the number board.json carries, so
  // the page's code and the board's data are visibly the same arithmetic.
  // ratio = exp(a + b * (ln tvl - c) + d * min(chains - 1, 3) / 3), winsorised to the
  // fit's floor and cap; implied = round(tvl * ratio).
  function fittedOf(row) {
    var f = FIT || DATA.fit;
    var chainsFeat = Math.min(Math.max(((row.chains || []).length - 1), 0), 3) / 3;
    var raw = Math.exp(f.intercept + f.slope * (Math.log(Math.max(1, row.tvl_usd)) - f.log_tvl_center) + f.chain_coef * chainsFeat);
    return Math.min(f.ratio_cap, Math.max(f.ratio_floor, raw));
  }
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * fittedOf(row)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is board.json's own: main.ts writes the seven steps per row, and the page
  // shows them as written — the same strings the gate checks. No step is re-derived here.
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var p = n * 100;
    if (p === 0) return '0%';
    if (p < 0.0001) return p.toExponential(1) + '%';
    return p.toFixed(4) + '%';
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (n >= 100) return '$' + Math.round(n);
    if (n >= 10) return '$' + n.toFixed(1);
    return '$' + n.toFixed(2);
  }

  /** Why this row ranks where it does, in one sentence built from its own components. */
  function whyRank(row) {
    var bits = [];
    bits.push('TVL ' + fmtUsd(row.tvl_usd));
    bits.push('a ' + fmtMult(row.fitted_ratio) + ' fitted ratio for its size');
    if (row.change_7d !== null && row.change_7d !== undefined) bits.push('7-day growth ' + fmtPct(row.change_7d) + ' (shown, not priced)');
    bits.push(fmtAge(row.age_days) + ' with no token');
    bits.push('refits #' + row.rank_lo + '–#' + row.rank_hi);
    return 'Rank ' + row.rank + ': ' + bits.join(', ') + ' — ' + fmtUsd(row.implied_value_usd) + ' implied (' + DATA.model_version + ').';
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'fitted') { av = a.fitted_ratio; bv = b.fitted_ratio; }
      else if (key === 'cost') { av = a.gas_total_usd; bv = b.gas_total_usd; }
      else if (key === 'verdict') { av = { FARM: 0, THIN: 1, SKIP: 2 }[a.verdict]; bv = { FARM: 0, THIN: 1, SKIP: 2 }[b.verdict]; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    var f = FIT || DATA.fit;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is priced from the market: a size curve fitted to the ' + f.n_train + ' tokens that already trade — bigger protocols trade at lower multiples of TVL. ' + (top ? 'The strongest launch on this snapshot is ' + top.name + ', at ' + fmtUsd(top.implied_value_usd) + ' implied.' : '') })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Blind test (LOO)' }), el('b', { text: 'median ' + f.loo_med_abs.toFixed(2) + ' log' })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm / thin / skip' }), el('b', { text: DATA.verdict_counts.FARM + ' / ' + DATA.verdict_counts.THIN + ' / ' + DATA.verdict_counts.SKIP }))
      )
    );
  }

  function modelStrip() {
    var f = FIT || DATA.fit;
    var wf = (f.walk_forward || []).filter(function (w) { return w.cutoff_days === 730; })[0] || f.walk_forward[0];
    return el('section', { class: 'strip' },
      el('h2', { text: 'How this board is priced — and how the model was tested' }),
      el('p', null,
        el('b', { text: 'Fitted size curve: ' }),
        el('span', { text: 'log(market cap / TVL) = ' + f.intercept.toFixed(3) + ' ' + (f.slope < 0 ? '− ' : '+ ') + Math.abs(f.slope).toFixed(3) + ' · (log TVL − ' + f.log_tvl_center.toFixed(2) + ') ' + (f.chain_coef < 0 ? '− ' : '+ ') + Math.abs(f.chain_coef).toFixed(3) + ' · min(chains − 1, 3) / 3, fitted by least squares to the ' + f.n_train + ' tokens that already trade. ' }),
        el('b', { text: 'Blind test: ' }),
        el('span', { text: 'leave-one-out median error ' + f.loo_med_abs.toFixed(3) + ' log (RMSE ' + f.loo_rmse.toFixed(3) + '), vs ' + f.loo_global_med_abs.toFixed(3) + ' flat and ' + f.loo_category_med_abs.toFixed(3) + ' category median; walk-forward ' + (wf ? wf.med_abs.toFixed(3) + ' (train ' + wf.n_train + ', test ' + wf.n_test + ') vs flat ' + wf.baseline_med_abs.toFixed(3) : 'n/a') + '. ' }),
        el('b', { text: 'Dropped: ' }),
        el('span', { text: '7-day growth and age — neither improves the blind test. The small chain term stays: without a per-row term the board order would be TVL order alone. Every row carries its rank range from 200 refits.' })
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    return el('section', { class: 'spot' },
      el('h2', { text: 'The five strongest launches' }),
      el('p', { class: 'sub', text: 'The top of the board, by implied value. Select one for its model and farm plan.' }),
      el('div', { class: 'spot-grid' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: 'Rank ' + r.rank + ' · refits #' + r.rank_lo + '–#' + r.rank_hi }),
          el('b', { text: r.name }),
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'meta', text: fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' in 7d' }),
          el('span', { class: 'meta', text: 'Farm ' + fmtMoney(r.gas_total_usd) + ' gas · ' + r.verdict })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; render(); } });
    }
    var countText = state.tab === 'pre-token' ? rows().length + ' rows shown'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : DATA.set_aside.length + ' set aside, not ranked';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }),
        el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('set-aside', 'Set aside'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ' · no token' })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.fitted_ratio) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtMoney(r.gas_total_usd) }),
        el('td', null, el('span', { class: 'verdict ' + r.verdict.toLowerCase(), text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('fitted', 'Fitted'),
            sortHeader('implied', 'Implied value'),
            sortHeader('cost', 'Farm $'),
            sortHeader('verdict', 'Verdict')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the traded tokens the size curve is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function setAsideTable() {
    var tbody = el('tbody');
    DATA.set_aside.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: '—' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', null, el('span', { class: 'sub', text: r.reason })),
        el('td', null, el('span', { class: 'status aside', text: 'not ranked' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Above the floor but not on the watchlist, so not ranked. The house rule left them out; the snapshot carries no parentProtocol field, so this radar does not second-guess that exclusion.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Why set aside' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var f = FIT || DATA.fit;
    var looRows = [
      ['Size curve (this board)', f.loo_med_abs, f.loo_rmse],
      ['Flat global median', f.loo_global_med_abs, f.loo_global_rmse],
      ['Category median (radar-2)', f.loo_category_med_abs, f.loo_category_rmse],
    ].map(function (r) {
      return el('tr', null,
        el('td', { text: r[0] }),
        el('td', { class: 'num', text: r[1].toFixed(3) }),
        el('td', { class: 'num', text: r[2].toFixed(3) })
      );
    });
    var wfRows = (f.walk_forward || []).map(function (w) {
      return el('tr', null,
        el('td', { text: 'Train listed ≥' + w.cutoff_days + 'd ago, test the newer ones (n=' + w.n_train + '/' + w.n_test + ')' }),
        el('td', { class: 'num', text: w.med_abs.toFixed(3) }),
        el('td', { class: 'num', text: w.baseline_med_abs.toFixed(3) })
      );
    });
    var binRows = (f.bins || []).map(function (b) {
      return el('tr', null,
        el('td', { text: fmtUsd(b.lo_usd) + '–' + fmtUsd(b.hi_usd) }),
        el('td', { class: 'num', text: 'n=' + b.n }),
        el('td', { class: 'num', text: fmtMult(b.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(b.curve_ratio) })
      );
    });
    var gasRows = (DATA.gas_table || []).slice(0, 12).map(function (g) {
      return el('span', { class: 'gas', text: g.chain + ' ' + fmtMoney(g.usd) });
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — and tested' }),
      el('p', { class: 'sub', text: 'Every row is scored by one fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The curve is fitted to the traded tokens: log(market cap / TVL) = ' + f.intercept.toFixed(3) + ' ' + (f.slope < 0 ? '− ' : '+ ') + Math.abs(f.slope).toFixed(3) + ' · (log TVL − ' + f.log_tvl_center.toFixed(2) + ') ' + (f.chain_coef < 0 ? '− ' : '+ ') + Math.abs(f.chain_coef).toFixed(3) + ' · min(chains − 1, 3) / 3. Bigger protocols trade at lower multiples of TVL, so a flat multiple overstates the big launches and understates the small ones. A robust Theil–Sen fit of the same points gives slope ' + f.theil_sen_slope.toFixed(3) + ' — the curve is not an outlier artefact.' }),
      el('h3', { text: 'Blind test: leave-one-out on the ' + f.n_train + ' traded tokens' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'slim' }, null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Model' }), el('th', { scope: 'col', text: 'Median |log error|' }), el('th', { scope: 'col', text: 'RMSE (log)' }))),
          el('tbody', null, looRows)
        )
      ),
      el('p', { class: 'sub', text: 'Each traded token is held out in turn, the model refits without it, and the held-out token is predicted. The category median — the radar-2 model — is worse than a flat median: 35 categories on 119 tokens overfits.' }),
      el('h3', { text: 'Blind test: walk-forward' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'slim' }, null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Split' }), el('th', { scope: 'col', text: 'Curve median |log error|' }), el('th', { scope: 'col', text: 'Flat median' }))),
          el('tbody', null, wfRows)
        )
      ),
      el('h3', { text: 'The curve against the traded tokens, by size' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'slim' }, null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'TVL bin' }), el('th', { scope: 'col', text: 'Tokens' }), el('th', { scope: 'col', text: 'Median ratio' }), el('th', { scope: 'col', text: 'Curve ratio' }))),
          el('tbody', null, binRows)
        )
      ),
      el('h3', { text: 'What the blind test dropped — and kept' }),
      el('p', { class: 'sub', text: 'Seven-day growth and age with no token were tried as extra terms and dropped: neither improves the leave-one-out error beyond noise, and together with the chain term they are much worse walk-forward. They stay on the board as context — growth and age are shown on every row — and age still sets the farm plan\u2019s hold, but they do not move the price. The chain term is kept: it is the only extra term that does not hurt the blind test, and without a per-row term the board order would be TVL order alone and no refit could move a rank. A term stays only if the blind test keeps it.' }),
      el('h3', { text: 'Farm costs: assumed gas per transaction' }),
      el('p', { class: 'sub', text: 'Gas is not in the snapshot, so the plan states its own assumptions: the cheapest chains first. Chains without a listed assumption use $0.50 a transaction. A plan counts 2 setup transactions, 1 a week over the hold, and 1 to claim.' }),
      el('div', { class: 'gas-grid' }, gasRows),
      el('p', { class: 'sub note', text: 'A protocol records no token; that is what the snapshot says, never proof it has none. Implied value is this model\u2019s estimate, not a price and not a prediction that a token will launch. Rank ranges come from 200 refits of the curve on resampled traded tokens.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var f = FIT || DATA.fit;
    var bin = null;
    (f.bins || []).forEach(function (b) {
      if (row.tvl_usd >= b.lo_usd && row.tvl_usd < b.hi_usd) bin = b;
    });
    var curveNote = bin
      ? 'Traded tokens at this size (' + fmtUsd(bin.lo_usd) + '–' + fmtUsd(bin.hi_usd) + ', n=' + bin.n + ') trade at a median ' + fmtMult(bin.median_ratio) + ' of TVL; the curve says ' + fmtMult(bin.curve_ratio) + '.'
      : 'Fitted from the ' + f.n_train + ' tokens that already trade.';
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · refits #' + row.rank_lo + '–#' + row.rank_hi }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? (row.chains.length > 4 ? row.chains.slice(0, 4).join(', ') + ' +' + (row.chains.length - 4) + ' more' : row.chains.join(', ')) : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted ratio' }), el('b', { class: 'num', text: fmtMult(row.fitted_ratio) })),
        el('div', null, el('span', { text: 'Seven-day growth (context, not priced)' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token (context, not priced)' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Rank range, 200 refits' }), el('b', { class: 'num', text: '#' + row.rank_lo + '–#' + row.rank_hi })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: curveNote }),
      el('p', { class: 'why', text: whyRank(row) }),
      el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' LOO ' + f.loo_med_abs.toFixed(3) + ' log; walk-forward ' + ((f.walk_forward || [])[1] || (f.walk_forward || [])[0] || { med_abs: 0 }).med_abs.toFixed(3) + '. An estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — netted to the dollar' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Gas (' + row.txs + ' tx on ' + (row.chains && row.chains.length ? row.chains[0] : 'its chain') + ')' }), el('b', { class: 'num', text: fmtMoney(row.gas_total_usd) })),
        el('div', null, el('span', { text: 'Capital locked' }), el('b', { class: 'num', text: fmtMoney(row.capital_usd) })),
        el('div', null, el('span', { text: 'Opportunity cost, ' + row.hold_days + ' days at 8%/yr' }), el('b', { class: 'num', text: fmtMoney(row.opp_cost_usd) })),
        el('div', null, el('span', { text: 'Cash deployed (gas + capital)' }), el('b', { class: 'num', text: fmtMoney(row.deployed_usd) })),
        el('div', null, el('span', { text: 'Break-even share of implied value' }), el('b', { class: 'num', text: fmtShare(row.break_even_share) })),
        el('div', { class: 'total' }, el('span', { text: 'All-in cost · verdict' }), el('b', { class: 'num', text: fmtMoney(row.all_in_cost_usd) + ' · ' + row.verdict }))
      ),
      el('p', { class: 'sub', text: 'Farm ' + row.start_date + ' → ' + row.end_date + ', one action a week (' + row.weekly_count + ' times). FARM: cash deployed ≤ $1 per $125,000 of implied value and refit high ≤ #80. THIN: ≤ $1 per $80,000 or rank ≤ #40.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', null,
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot date ' + DATA.as_of + '. Floor $' + Math.round(DATA.floor_usd / 1e6) + 'M.' }),
      el('p', { text: 'A protocol on this board records no token in the snapshot; that is the record, never proof it has none. Implied values are model estimates, not prices, and no row predicts whether or when a token launches.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(modelStrip());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(setAsideTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
