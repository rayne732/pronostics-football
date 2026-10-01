/* Football américain (NFL) dans le navigateur : même calcul que nfl.py (points attendus par équipe, lois normales),
   appliqué en direct au calendrier ESPN. */
(function (root) {
  'use strict';
  var M = null, SAFE = 0.70, LESS = 0.30;

  function ncdf(x) {                                            // fonction de répartition de la loi normale (erreur < 1,5e-7)
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
  function families(lg, home, away, lh, la) {
    var m = M[lg], mm = lh - la, mt = lh + la, pw = sf(0, mm, m.sdm), base = pyRound(mm), F, k;
    F = [['Vainqueur du match', [[home, pw], [away, 1 - pw]], true]];
    [[home, 1], [away, -1]].forEach(function (t) {
      var sels = [];
      for (k = -14; k <= 14; k += 2) {
        var line = Math.floor(base * t[1] + k + 0.5) + 0.5;
        sels.push([t[0] + ' ' + sg(line), sf(-line, mm * t[1], m.sdm)]);
      }
      F.push(['Handicap', sels, false]);
    });
    var tot = pyRound(mt), lines = [];
    for (k = -21; k <= 21; k += 3) lines.push(tot + k + 0.5);
    F.push(['Total points (plus)', lines.map(function (ln) { return ['Plus de ' + f1(ln) + ' points', sf(ln, mt, m.sdt)]; }), false]);
    F.push(['Total points (moins)', lines.map(function (ln) { return ['Moins de ' + f1(ln) + ' points', 1 - sf(ln, mt, m.sdt)]; }), false]);
    [[home, lh], [away, la]].forEach(function (t) {
      var tl = [];
      for (k = -12; k <= 12; k += 3) tl.push(pyRound(t[1]) + k + 0.5);
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
    if (m === 'Vainqueur du match') return s === (hs > as ? home : away);
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
    var pts = tm === home ? hs : as;
    return m.slice(-6) === '(plus)' ? pts > ln : pts < ln;
  }

  /* un match brut {lg, id, d (UTC, ISO), home, away, state, hs, as, pre, label} -> structure de basket.py */
  function build(raw, base, parisFn) {
    var w = parisFn(raw.d), e = expected(raw.lg, raw.home, raw.away), known = !!e, lg = M[raw.lg];
    var lh = e ? e[0] : lg.mu, la = e ? e[1] : lg.mu;
    var C = known ? classify(families(raw.lg, raw.home, raw.away, lh, la)) : { safe: [], less: [] };
    var p = sf(0, lh - la, lg.sdm);
    if (base) { p = base.p; known = base.known; C = { safe: base.safe, less: base.less }; lh = base.lh; la = base.la; }
    var it = { id: String(raw.id), lg: raw.lg, date: w.d, time: w.t, state: raw.state, home: raw.home, away: raw.away, p: r4(p), lh: Math.round(lh * 10) / 10, la: Math.round(la * 10) / 10,
      known: known, pre: raw.pre, label: raw.label, safe: C.safe, less: C.less };
    if (raw.state === 'post') {
      it.hs = raw.hs; it.as_ = raw.as; it.hit = known ? (p > 0.5) === (raw.hs > raw.as) : null;
      if (known) {
        var mk = function (t) { return function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.home, raw.away, raw.hs, raw.as), t: t }; }; };
        it.picks = C.safe.map(mk(0)).concat(C.less.map(mk(1)));
      }
    }
    return it;
  }

  /* scoreboard ESPN NFL (un jour) -> matchs bruts */
  function parseNfl(json) {
    return (json.events || []).map(function (e) {
      var c = e.competitions[0], h = c.competitors.filter(function (x) { return x.homeAway === 'home'; })[0], a = c.competitors.filter(function (x) { return x.homeAway === 'away'; })[0];
      return { lg: 'NFL', id: e.id, d: e.date.slice(0, 16), home: h.team.displayName, away: a.team.displayName, state: c.status.type.state, hs: Math.round(parseFloat(h.score || 0)),
        as: Math.round(parseFloat(a.score || 0)), pre: false, label: e.week ? 'Semaine ' + e.week.number : '' };
    });
  }

  root.Nfl = {
    setModel: function (m) { M = { NFL: m }; SAFE = m.safe; LESS = m.less; },
    ready: function () { return !!M; }, build: build, parse: parseNfl,
    _families: families, _classify: classify, _expected: expected
  };
})(typeof window !== 'undefined' ? window : globalThis);
