/* Hockey sur glace (NHL) dans le navigateur : même calcul que hockey.py (Poisson sur les buts du temps réglementaire),
   appliqué en direct au calendrier ESPN. */
(function (root) {
  'use strict';
  var M = null, SAFE = 0.70, LESS = 0.30, ALIAS = {}, N = 13;

  function fx(x) { return x.toFixed(1).replace('.', ','); }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function pmf(l) { var a = [], p = Math.exp(-l); a[0] = p; for (var k = 1; k < N; k++) { p = p * l / k; a[k] = p; } return a; }
  function grid(l1, l2) { var a = pmf(l1), b = pmf(l2), g = [], i, j; for (i = 0; i < N; i++) { g.push([]); for (j = 0; j < N; j++) g[i].push(a[i] * b[j]); } return g; }
  function gs(g, f) { var s = 0, i, j; for (i = 0; i < N; i++) for (j = 0; j < N; j++) if (f(i, j)) s += g[i][j]; return s; }

  function lam(home, away) {
    if (M.att[home] === undefined || M.att[away] === undefined) return null;
    return [Math.exp(M.mu + M.ha + M.att[home] - M.dfn[away]), Math.exp(M.mu + M.att[away] - M.dfn[home])];
  }
  function families(home, away, l1, l2) {
    var g = grid(l1, l2), ph = gs(g, function (i, j) { return i > j; }), pd = gs(g, function (i, j) { return i === j; }), pa = gs(g, function (i, j) { return i < j; });
    var q = 0.5 * (0.5 + ph / (ph + pa)), b = gs(g, function (i, j) { return i > 0 && j > 0; });
    var F = [['Résultat (temps réglementaire)', [[home, ph], ['Match nul', pd], [away, pa]], true],
      ['Vainqueur (prolongations incluses)', [[home, ph + pd * q], [away, pa + pd * (1 - q)]], true],
      ['Double chance', [[home + ' ou nul', ph + pd], [away + ' ou nul', pa + pd], [home + ' ou ' + away, ph + pa]], true],
      ['Les deux équipes marquent', [['Oui', b], ['Non', 1 - b]], false]];
    F.push(['Total buts (plus)', [2.5, 3.5, 4.5, 5.5, 6.5].map(function (x) { return ['Plus de ' + fx(x) + ' buts', gs(g, function (i, j) { return i + j > x; })]; }), false]);
    F.push(['Total buts (moins)', [3.5, 4.5, 5.5, 6.5, 7.5].map(function (x) { return ['Moins de ' + fx(x) + ' buts', gs(g, function (i, j) { return i + j < x; })]; }), false]);
    [[home, 0], [away, 1]].forEach(function (t) {
      F.push(['Buts de ' + t[0] + ' (plus)', [0.5, 1.5, 2.5, 3.5].map(function (x) { return [t[0] + ' plus de ' + fx(x), gs(g, function (i, j) { return (t[1] ? j : i) > x; })]; }), false]);
      F.push(['Buts de ' + t[0] + ' (moins)', [1.5, 2.5, 3.5].map(function (x) { return [t[0] + ' moins de ' + fx(x), gs(g, function (i, j) { return (t[1] ? j : i) < x; })]; }), false]);
    });
    F.push(['Handicap -1,5', [[home + ' -1,5', gs(g, function (i, j) { return i - j >= 2; })], [away + ' +1,5', gs(g, function (i, j) { return i - j < 2; })]], false]);
    F.push(['Handicap +1,5', [[away + ' -1,5', gs(g, function (i, j) { return j - i >= 2; })], [home + ' +1,5', gs(g, function (i, j) { return j - i < 2; })]], false]);
    return { F: F, p: [ph, pd, pa], q: q };
  }
  function classify(F) {
    var safe = [], less = [];
    F.forEach(function (f) {
      var items = f[1].slice().sort(function (u, v) { return v[1] - u[1]; });
      var rec = function (it) { return { m: f[0], s: it[0], p: r4(it[1]), v: true, sels: f[1].map(function (s) { return [s[0], r4(s[1])]; }) }; };
      var ok = items.filter(function (x) { return x[1] >= SAFE; });
      if (ok.length) safe.push(rec(ok.reduce(function (u, v) { return v[1] < u[1] ? v : u; })));
      else if (items[0][1] >= LESS) less.push(rec(items[0]));
    });
    var by = function (u, v) { return v.p - u.p; };
    return { safe: safe.sort(by), less: less.sort(by) };
  }
  function won(rec, home, away, hs, as, fh, fa) {
    var s = rec.s, m = rec.m, ln;
    if (m.indexOf('Résultat') === 0) return s === (hs > as ? home : as > hs ? away : 'Match nul');
    if (m.indexOf('Vainqueur') === 0) return s === (fh > fa ? home : away);
    if (m === 'Double chance') return s === home + ' ou nul' ? hs >= as : s === away + ' ou nul' ? as >= hs : hs !== as;
    if (m === 'Les deux équipes marquent') return (hs > 0 && as > 0) === (s === 'Oui');
    if (m.indexOf('Total buts') === 0) { var parts = s.split(' '); ln = parseFloat(parts[parts.length - 2].replace(',', '.')); return s.indexOf('Plus') === 0 ? hs + as > ln : hs + as < ln; }
    if (m.indexOf('Buts de') === 0) {
      var tm = m.slice('Buts de '.length, m.lastIndexOf(' (')), pts = tm === home ? hs : as;
      ln = parseFloat(s.slice(s.lastIndexOf(' ') + 1).replace(',', '.'));
      return m.slice(-6) === '(plus)' ? pts > ln : pts < ln;
    }
    var team = s.slice(0, s.lastIndexOf(' ')), d = team === home ? hs - as : as - hs;
    return s.indexOf('-1,5') >= 0 ? d >= 2 : d < 2;
  }

  function build(raw, base, parisFn) {
    var w = parisFn(raw.d), e = lam(raw.home, raw.away), known = !!e && !raw.pre;
    var l1 = e ? e[0] : Math.exp(M.mu), l2 = e ? e[1] : Math.exp(M.mu), R = families(raw.home, raw.away, l1, l2);
    var C = known ? classify(R.F) : { safe: [], less: [] }, p = R.p;
    if (base) { p = base.p; known = base.known; C = { safe: base.safe, less: base.less }; l1 = base.lh; l2 = base.la; }
    var it = { id: String(raw.id), date: w.d, time: w.t, state: raw.state, home: raw.home, away: raw.away, p: p.map(r4), lh: Math.round(l1 * 100) / 100, la: Math.round(l2 * 100) / 100,
      known: known, pre: raw.pre, safe: C.safe, less: C.less };
    if (raw.state === 'post' && raw.hs !== null) {
      var ot = raw.period > 3, rh = ot ? Math.min(raw.hs, raw.as) : raw.hs, ra = ot ? Math.min(raw.hs, raw.as) : raw.as, q = 0.5 * (0.5 + p[0] / (p[0] + p[2]));
      it.hs = raw.hs; it.as_ = raw.as; it.ot = ot;
      it.hit = known ? (p[0] + p[1] * q > 0.5) === (raw.hs > raw.as) : null;
      if (known) {
        var mk = function (t) { return function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.home, raw.away, rh, ra, raw.hs, raw.as), t: t }; }; };
        it.picks = C.safe.map(mk(0)).concat(C.less.map(mk(1)));
      }
    }
    return it;
  }
  function parse(json) {
    return (json.events || []).map(function (e) {
      var c = e.competitions[0], h = c.competitors.filter(function (x) { return x.homeAway === 'home'; })[0], a = c.competitors.filter(function (x) { return x.homeAway === 'away'; })[0];
      var nm = function (x) { return ALIAS[x.team.displayName] || x.team.displayName; }, num = function (x) { return x.score === undefined || x.score === '' ? null : Math.round(parseFloat(x.score)); };
      return { id: e.id, d: e.date.slice(0, 16), home: nm(h), away: nm(a), state: c.status.type.state, hs: num(h), as: num(a), period: c.status.period || 0, pre: ((e.season || {}).type) === 1 };
    });
  }

  root.Hockey = {
    setModel: function (m) { M = m; SAFE = m.safe; LESS = m.less; ALIAS = m.alias || {}; },
    ready: function () { return !!M; }, build: build, parse: parse
  };
})(typeof window !== 'undefined' ? window : globalThis);
