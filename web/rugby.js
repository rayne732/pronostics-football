/* Rugby à XV dans le navigateur : même calcul que rugby.py (points attendus, lois normales, match nul), appliqué au calendrier ESPN en direct. */
(function (root) {
  'use strict';
  var M = null, SAFE = 0.70, LESS = 0.30, ALIAS = {}, IDS = {};

  function ncdf(x) {
    var z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  function sf(x, mean, sd) { return 1 - ncdf((x - mean) / sd); }
  function pyRound(x) { var f = Math.floor(x), d = x - f; return d < 0.5 ? f : d > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1); }
  function f1(x) { return x.toFixed(1).replace('.', ','); }
  function sg(x) { return (x < 0 ? '-' : '+') + f1(Math.abs(x)); }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }

  function expected(lg, home, away) {
    var m = M[lg];
    if (!m || m.att[home] === undefined || m.att[away] === undefined) return null;
    return [m.mu + m.ha + m.att[home] - m.dfn[away], m.mu + m.att[away] - m.dfn[home]];
  }
  function probs(lg, lh, la) {
    var mm = lh - la, sd = M[lg].sdm, pd = ncdf((0.5 - mm) / sd) - ncdf((-0.5 - mm) / sd), ph = 1 - ncdf((0.5 - mm) / sd);
    return [ph, pd, 1 - ph - pd];
  }
  function families(lg, home, away, lh, la) {
    var m = M[lg], mm = lh - la, mt = lh + la, p = probs(lg, lh, la), base = pyRound(mm), k, F;
    F = [['Résultat du match', [[home, p[0]], ['Match nul', p[1]], [away, p[2]]], true],
      ['Double chance', [[home + ' ou nul', p[0] + p[1]], [away + ' ou nul', p[2] + p[1]], [home + ' ou ' + away, p[0] + p[2]]], true]];
    [[home, 1], [away, -1]].forEach(function (t) {
      var sels = [];
      for (k = -24; k <= 24; k += 3) {
        var line = Math.floor(base * t[1] + k + 0.5) + 0.5;
        sels.push([t[0] + ' ' + sg(line), sf(-line, mm * t[1], m.sdm)]);
      }
      F.push(['Handicap', sels, false]);
    });
    var tot = pyRound(mt), lines = [];
    for (k = -24; k <= 24; k += 6) lines.push(tot + k + 0.5);
    F.push(['Total points (plus)', lines.map(function (ln) { return ['Plus de ' + f1(ln) + ' points', sf(ln, mt, m.sdt)]; }), false]);
    F.push(['Total points (moins)', lines.map(function (ln) { return ['Moins de ' + f1(ln) + ' points', 1 - sf(ln, mt, m.sdt)]; }), false]);
    [[home, lh], [away, la]].forEach(function (t) {
      var tl = [];
      for (k = -15; k <= 15; k += 5) tl.push(pyRound(t[1]) + k + 0.5);
      F.push(['Points de ' + t[0] + ' (plus)', tl.map(function (ln) { return [t[0] + ' plus de ' + f1(ln), sf(ln, t[1], m.sdp)]; }), false]);
      F.push(['Points de ' + t[0] + ' (moins)', tl.map(function (ln) { return [t[0] + ' moins de ' + f1(ln), 1 - sf(ln, t[1], m.sdp)]; }), false]);
    });
    return F;
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
    if (m === 'Résultat du match') return s === (hs > as ? home : as > hs ? away : 'Match nul');
    if (m === 'Double chance') return s === home + ' ou nul' ? hs >= as : s === away + ' ou nul' ? as >= hs : hs !== as;
    if (m === 'Handicap') {
      var i = s.lastIndexOf(' '), team = s.slice(0, i), line = parseFloat(s.slice(i + 1).replace(',', '.'));
      return team === home ? hs - as + line > 0 : as - hs + line > 0;
    }
    if (m.indexOf('Total points') === 0) {
      var parts = s.split(' '); ln = parseFloat(parts[parts.length - 2].replace(',', '.'));
      return s.indexOf('Plus') === 0 ? hs + as > ln : hs + as < ln;
    }
    ln = parseFloat(s.slice(s.lastIndexOf(' ') + 1).replace(',', '.'));
    var tm = m.slice('Points de '.length, m.lastIndexOf(' ('));
    return m.slice(-6) === '(plus)' ? (tm === home ? hs : as) > ln : (tm === home ? hs : as) < ln;
  }

  function build(raw, base, parisFn) {
    var w = parisFn(raw.d), e = expected(raw.lg, raw.home, raw.away), known = !!e, lg = M[raw.lg];
    var lh = e ? e[0] : lg.mu, la = e ? e[1] : lg.mu;
    var C = known ? classify(families(raw.lg, raw.home, raw.away, lh, la)) : { safe: [], less: [] }, p = probs(raw.lg, lh, la);
    if (base) { p = base.p; known = base.known; C = { safe: base.safe, less: base.less }; lh = base.lh; la = base.la; }
    var it = { id: String(raw.id), lg: raw.lg, date: w.d, time: w.t, state: raw.state, home: raw.home, away: raw.away, p: p.map(r4), lh: Math.round(lh * 10) / 10, la: Math.round(la * 10) / 10,
      known: known, safe: C.safe, less: C.less };
    if (raw.state === 'post' && raw.hs !== null) {
      it.hs = raw.hs; it.as_ = raw.as;
      var fav = p[0] >= p[2] ? 0 : 2;
      it.hit = known ? ((raw.hs > raw.as && fav === 0) || (raw.as > raw.hs && fav === 2)) : null;
      if (known) {
        var mk = function (t) { return function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.home, raw.away, raw.hs, raw.as), t: t }; }; };
        it.picks = C.safe.map(mk(0)).concat(C.less.map(mk(1)));
      }
    }
    return it;
  }

  function parse(lg, json) {
    return (json.events || []).map(function (e) {
      var c = e.competitions[0], h = c.competitors.filter(function (x) { return x.homeAway === 'home'; })[0], a = c.competitors.filter(function (x) { return x.homeAway === 'away'; })[0];
      var nm = function (x) { return ALIAS[x.team.displayName] || x.team.displayName; }, num = function (x) { return x.score === undefined || x.score === '' ? null : Math.round(parseFloat(x.score)); };
      return { lg: lg, id: e.id, d: e.date.slice(0, 16), home: nm(h), away: nm(a), state: c.status.type.state, hs: num(h), as: num(a) };
    });
  }

  root.Rugby = {
    setModel: function (m, alias, ids) { M = m.m; SAFE = m.safe; LESS = m.less; ALIAS = alias || {}; IDS = ids || {}; },
    ready: function () { return !!M; }, build: build, parse: parse, ids: function () { return IDS; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
