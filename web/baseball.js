/* Baseball (MLB) dans le navigateur : même calcul que baseball.py (binomiales négatives sur les points marqués),
   appliqué en direct au calendrier de l'API officielle de la MLB. */
(function (root) {
  'use strict';
  var M = null, SAFE = 0.70, LESS = 0.30, R = 26;

  function fx(x) { return x.toFixed(1).replace('.', ','); }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function pmf(mean) {
    var r = 1 / M.alpha, p = r / (r + mean), a = [Math.pow(p, r)];
    for (var k = 1; k < R; k++) a[k] = a[k - 1] * (k - 1 + r) / k * (1 - p);
    return a;
  }
  function lam(home, away) {
    if (M.att[home] === undefined || M.att[away] === undefined) return null;
    return [Math.exp(M.mu + M.ha + M.att[home] - M.dfn[away]), Math.exp(M.mu + M.att[away] - M.dfn[home])];
  }
  function families(home, away, l1, l2) {
    var a = pmf(l1), b = pmf(l2), g = [], i, j;
    for (i = 0; i < R; i++) { g.push([]); for (j = 0; j < R; j++) g[i].push(a[i] * b[j]); }
    var gs = function (f) { var s = 0; for (i = 0; i < R; i++) for (j = 0; j < R; j++) if (f(i, j)) s += g[i][j]; return s; };
    var ph = gs(function (i, j) { return i > j; }), pt = gs(function (i, j) { return i === j; }), pa = gs(function (i, j) { return i < j; }), q = ph / (ph + pa);
    var F = [['Vainqueur du match', [[home, ph + pt * q], [away, pa + pt * (1 - q)]], true]];
    F.push(['Total points (plus)', [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5].map(function (x) { return ['Plus de ' + fx(x) + ' points', gs(function (i, j) { return i + j > x; })]; }), false]);
    F.push(['Total points (moins)', [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5].map(function (x) { return ['Moins de ' + fx(x) + ' points', gs(function (i, j) { return i + j < x; })]; }), false]);
    [[home, 0], [away, 1]].forEach(function (t) {
      F.push(['Points de ' + t[0] + ' (plus)', [1.5, 2.5, 3.5, 4.5, 5.5].map(function (x) { return [t[0] + ' plus de ' + fx(x), gs(function (i, j) { return (t[1] ? j : i) > x; })]; }), false]);
      F.push(['Points de ' + t[0] + ' (moins)', [2.5, 3.5, 4.5, 5.5, 6.5].map(function (x) { return [t[0] + ' moins de ' + fx(x), gs(function (i, j) { return (t[1] ? j : i) < x; })]; }), false]);
    });
    F.push(['Handicap -1,5', [[home + ' -1,5', gs(function (i, j) { return i - j >= 2; })], [away + ' +1,5', gs(function (i, j) { return i - j < 2; })]], false]);
    F.push(['Handicap +1,5', [[away + ' -1,5', gs(function (i, j) { return j - i >= 2; })], [home + ' +1,5', gs(function (i, j) { return j - i < 2; })]], false]);
    return { F: F, p: ph + pt * q };
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
  function won(rec, home, away, hs, as) {
    var s = rec.s, m = rec.m, ln;
    if (m === 'Vainqueur du match') return s === (hs > as ? home : away);
    if (m.indexOf('Total points') === 0) { var parts = s.split(' '); ln = parseFloat(parts[parts.length - 2].replace(',', '.')); return s.indexOf('Plus') === 0 ? hs + as > ln : hs + as < ln; }
    if (m.indexOf('Points de') === 0) {
      var tm = m.slice('Points de '.length, m.lastIndexOf(' (')), pts = tm === home ? hs : as;
      ln = parseFloat(s.slice(s.lastIndexOf(' ') + 1).replace(',', '.'));
      return m.slice(-6) === '(plus)' ? pts > ln : pts < ln;
    }
    var team = s.slice(0, s.lastIndexOf(' ')), d = team === home ? hs - as : as - hs;
    return s.indexOf('-1,5') >= 0 ? d >= 2 : d < 2;
  }

  var LABELS = { R: 'Saison régulière', F: 'Wild Card', D: 'Division Series', L: 'Championship Series', W: 'World Series' };
  function build(raw, base, parisFn) {
    var w = parisFn(raw.d), e = lam(raw.home, raw.away), known = !!e;
    var l1 = e ? e[0] : Math.exp(M.mu), l2 = e ? e[1] : Math.exp(M.mu), R_ = families(raw.home, raw.away, l1, l2);
    var C = known ? classify(R_.F) : { safe: [], less: [] }, p = R_.p;
    if (base) { p = base.p; known = base.known; C = { safe: base.safe, less: base.less }; l1 = base.lh; l2 = base.la; }
    var it = { id: String(raw.id), date: w.d, time: w.t, state: raw.state, home: raw.home, away: raw.away, p: r4(p), lh: Math.round(l1 * 100) / 100, la: Math.round(l2 * 100) / 100,
      known: known, label: LABELS[raw.type] || '', safe: C.safe, less: C.less };
    if (raw.state === 'post' && raw.hs !== null) {
      it.hs = raw.hs; it.as_ = raw.as;
      it.hit = known ? (p > 0.5) === (raw.hs > raw.as) : null;
      if (known) {
        var mk = function (t) { return function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.home, raw.away, raw.hs, raw.as), t: t }; }; };
        it.picks = C.safe.map(mk(0)).concat(C.less.map(mk(1)));
      }
    }
    return it;
  }
  function parse(json) {
    var out = [];
    (json.dates || []).forEach(function (d) {
      d.games.forEach(function (g) {
        var t = g.teams, ab = g.status.abstractGameState, num = function (x) { return x.score === undefined || x.score === null ? null : Math.round(x.score); };
        out.push({ id: g.gamePk, d: g.gameDate.slice(0, 16), home: t.home.team.name, away: t.away.team.name, state: ab === 'Final' ? 'post' : ab === 'Live' ? 'in' : 'pre',
          hs: num(t.home), as: num(t.away), type: g.gameType });
      });
    });
    return out;
  }

  root.Baseball = { setModel: function (m) { M = m; SAFE = m.safe; LESS = m.less; }, ready: function () { return !!M; }, build: build, parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
