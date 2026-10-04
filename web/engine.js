/* Moteur de marchés : même calcul que winamax.py (grille de scores Poisson 11x11), exécuté dans le navigateur. */
(function (root) {
  'use strict';
  var N = 11, SAFE = 0.70, LESS = 0.30, D = null;

  function fx(x) { return String(x).replace('.', ','); }

  function pmfArr(lam, n) {
    var a = new Array(n), p = Math.exp(-lam);
    a[0] = p;
    for (var k = 1; k < n; k++) { p = p * lam / k; a[k] = p; }
    return a;
  }
  function cdf(x, lam) {                       // P(K <= x), x peut être non entier
    var m = Math.floor(x);
    if (m < 0) return 0;
    var p = Math.exp(-lam), s = p;
    for (var i = 1; i <= m; i++) { p = p * lam / i; s += p; }
    return s > 1 ? 1 : s;
  }
  function sf(x, lam) { return 1 - cdf(x, lam); }
  function grid(l1, l2) {
    var a = pmfArr(l1, N), b = pmfArr(l2, N), g = [];
    for (var i = 0; i < N; i++) { g.push([]); for (var j = 0; j < N; j++) g[i].push(a[i] * b[j]); }
    return g;
  }
  function gsum(g, f) {
    var s = 0;
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) if (f(i, j)) s += g[i][j];
    return s;
  }
  function lam(M, home, away) {               // buts (ou corners) attendus domicile / extérieur
    var a = M.t[home] || [0, 0], b = M.t[away] || [0, 0];
    return [Math.exp(M.mu + M.ha + a[0] - b[1]), Math.exp(M.mu + b[0] - a[1])];
  }
  function known(div, team) { return !!D.leagues[div].g.t[team]; }

  function families(div, home, away, ov) {
    var L = D.leagues[div], F = [];
    var gl = ov || lam(L.g, home, away), lh = gl[0], la = gl[1], g = grid(lh, la);
    function add(name, items, validated, lottery, kind, extra) {
      F.push({ name: name, kind: kind || name, sels: items, validated: !!validated, lottery: !!lottery, extra: !!extra });
    }
    var p1 = gsum(g, function (i, j) { return i > j; }), pn = gsum(g, function (i, j) { return i === j; }),
        p2 = gsum(g, function (i, j) { return i < j; });
    add('Résultat du match', [[home, p1], ['Match nul', pn], [away, p2]], true);
    add('Double chance', [[home + ' ou nul', p1 + pn], [away + ' ou nul', p2 + pn], [home + ' ou ' + away, p1 + p2]], true);
    var b = gsum(g, function (i, j) { return i > 0 && j > 0; });
    add('Les deux équipes marquent', [['Oui', b], ['Non', 1 - b]]);
    add('Total buts (plus)', [0.5, 1.5, 2.5, 3.5, 4.5].map(function (x) {
      return ['Plus de ' + fx(x) + ' buts', gsum(g, function (i, j) { return i + j > x; })]; }));
    add('Total buts (moins)', [1.5, 2.5, 3.5, 4.5, 5.5].map(function (x) {
      return ['Moins de ' + fx(x) + ' buts', gsum(g, function (i, j) { return i + j < x; })]; }));
    [[home, lh], [away, la]].forEach(function (t) {
      add('Buts de ' + t[0] + ' (plus)', [0.5, 1.5, 2.5, 3.5].map(function (x) { return [t[0] + ' plus de ' + fx(x), sf(x, t[1])]; }),
        false, false, "Buts d'une équipe (plus)");
      add('Buts de ' + t[0] + ' (moins)', [1.5, 2.5, 3.5].map(function (x) { return [t[0] + ' moins de ' + fx(x), cdf(x - 0.5, t[1])]; }),
        false, false, "Buts d'une équipe (moins)");
    });
    add('Pair / impair', [['Total pair', gsum(g, function (i, j) { return (i + j) % 2 === 0; })],
                          ['Total impair', gsum(g, function (i, j) { return (i + j) % 2 === 1; })]]);
    add('Tranche de buts', [['0-1 but', gsum(g, function (i, j) { return i + j <= 1; })],
                            ['2-3 buts', gsum(g, function (i, j) { return i + j >= 2 && i + j <= 3; })],
                            ['4 buts ou plus', gsum(g, function (i, j) { return i + j >= 4; })]]);
    add('Handicap -1', [[home + ' gagne par 2+', gsum(g, function (i, j) { return i - j >= 2; })],
                        ["Écart d'un but pour le dom.", gsum(g, function (i, j) { return i - j === 1; })],
                        [away + ' (+1)', gsum(g, function (i, j) { return i - j <= 0; })]]);
    add('Victoire sans encaisser', [[home, gsum(g, function (i, j) { return i > j && j === 0; })],
                                    [away, gsum(g, function (i, j) { return j > i && i === 0; })]]);

    // --- marchés supplémentaires façon bookmaker : écart de buts, handicaps, remboursé si nul, multichance, combinaisons (MyMatch)
    [[home, 1], [away, -1]].forEach(function (t) {
      [2, 3].forEach(function (k) {
        var pk = gsum(g, function (i, j) { return t[1] * (i - j) >= k; });
        add(t[0] + ' gagne par au moins ' + k + ' buts', [['Oui', pk], ['Non', 1 - pk]], false, false, 'Écart de buts (oui/non)', true);
      });
    });
    function sg(x) { return (x >= 0 ? '+' : '-') + fx(Math.abs(x)); }
    [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].forEach(function (hc) {
      var ph = gsum(g, function (i, j) { return i - j + hc > 0; });
      add('Handicap ' + sg(hc), [[home + ' (' + sg(hc) + ')', ph], [away + ' (' + sg(-hc) + ')', 1 - ph]], false, false, 'Handicap (demi-buts)', true);
    });
    if (p1 + p2 > 0) add('Vainqueur (remboursé si match nul)', [[home, p1 / (p1 + p2)], [away, p2 / (p1 + p2)]]);
    var groups = [[home + ' : 1-0, 2-0 ou 3-0', [[1, 0], [2, 0], [3, 0]]], [home + ' : 2-1, 3-1 ou 3-2', [[2, 1], [3, 1], [3, 2]]],
                  [away + ' : 0-1, 0-2 ou 0-3', [[0, 1], [0, 2], [0, 3]]], [away + ' : 1-2, 1-3 ou 2-3', [[1, 2], [1, 3], [2, 3]]], ['Nul : 0-0, 1-1 ou 2-2', [[0, 0], [1, 1], [2, 2]]]];
    add('Score exact multichance', groups.map(function (gr) { return [gr[0], gr[1].reduce(function (s0, c) { return s0 + g[c[0]][c[1]]; }, 0)]; }), false, true);
    var resopts = [[home + ' gagne', function (i, j) { return i > j; }], [away + ' gagne', function (i, j) { return i < j; }],
                   [home + ' ou nul', function (i, j) { return i >= j; }], [away + ' ou nul', function (i, j) { return i <= j; }]];
    var goalopts = [['plus de 0,5 buts', function (i, j) { return i + j > 0.5; }], ['plus de 1,5 buts', function (i, j) { return i + j > 1.5; }],
                    ['plus de 2,5 buts', function (i, j) { return i + j > 2.5; }], ['moins de 2,5 buts', function (i, j) { return i + j < 2.5; }],
                    ['moins de 3,5 buts', function (i, j) { return i + j < 3.5; }], ['les deux équipes marquent', function (i, j) { return i > 0 && j > 0; }]];
    var combos = [];
    resopts.forEach(function (ro) { goalopts.forEach(function (go) { combos.push([ro[0] + ' + ' + go[0], gsum(g, function (i, j) { return ro[1](i, j) && go[1](i, j); })]); }); });
    add('Combiné résultat + buts (MyMatch)', combos, false, false, 'Combiné MyMatch', true);

    var s = L.ht, ht = grid(s * lh, s * la), sh = grid((1 - s) * lh, (1 - s) * la), names = [home, 'Nul', away];
    var htres = [gsum(ht, function (i, j) { return i > j; }), gsum(ht, function (i, j) { return i === j; }),
                 gsum(ht, function (i, j) { return i < j; })];
    add('Résultat à la mi-temps', names.map(function (n, i) { return [n, htres[i]]; }));
    function res(d) { return d > 0 ? 0 : d === 0 ? 1 : 2; }
    function dd(gr) {
      var o = {};
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) { var d = i - j; o[d] = (o[d] || 0) + gr[i][j]; }
      return o;
    }
    var d1 = dd(ht), d2 = dd(sh), hf = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    Object.keys(d1).forEach(function (x) {
      Object.keys(d2).forEach(function (y) { hf[res(+x)][res(+x + +y)] += d1[x] * d2[y]; });
    });
    var items = [];
    for (var a = 0; a < 3; a++) for (var c = 0; c < 3; c++) items.push([names[a] + ' / ' + names[c], hf[a][c]]);
    add('Mi-temps / Fin de match', items, false, true);
    var cells = [];
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) cells.push([g[i][j], i, j]);
    cells.sort(function (x, y) { return y[0] - x[0]; });
    add('Score exact', cells.slice(0, 3).map(function (c2) { return [c2[1] + '-' + c2[2], c2[0]]; }), false, true);
    var l = lh + la;
    add('Premier but', [[home, lh / l * (1 - Math.exp(-l))], [away, la / l * (1 - Math.exp(-l))], ['Aucun but', Math.exp(-l)]], false, true);

    add('Dernier but', [[home, lh / l * (1 - Math.exp(-l))], [away, la / l * (1 - Math.exp(-l))], ['Aucun but', Math.exp(-l)]], false, true);

    var cc = [0, 0], ct = 0;
    if (L.c) {                                          // pas de corners pour tous les championnats
      cc = lam(L.c, home, away); ct = cc[0] + cc[1];
      add('Corners (plus)', [7.5, 8.5, 9.5, 10.5, 11.5].map(function (x) { return ['Plus de ' + fx(x) + ' corners', sf(x, ct)]; }));
      add('Corners (moins)', [8.5, 9.5, 10.5, 11.5, 12.5].map(function (x) { return ['Moins de ' + fx(x) + ' corners', cdf(x, ct)]; }));
    }
    return { fams: F, lh: lh, la: la, corners: ct, ch: cc[0], ca: cc[1], grid: g, p1x2: [p1, pn, p2], over25: gsum(g, function (i, j) { return i + j > 2.5; }), btts: b };
  }

  function classify(F) {
    var safe = [], less = [];
    F.forEach(function (f) {
      if (f.extra) return;
      var items = f.sels.slice().sort(function (a, b) { return b[1] - a[1]; });
      var rec = function (it) { return { m: f.name, s: it[0], p: it[1], v: f.validated, f: f }; };
      if (f.lottery) { less.push(rec(items[0])); return; }
      var ok = items.filter(function (x) { return x[1] >= SAFE; });
      if (ok.length) safe.push(rec(ok.reduce(function (a, b) { return b[1] < a[1] ? b : a; })));
      else if (items[0][1] >= LESS) less.push(rec(items[0]));
    });
    var by = function (a, b) { return b.p - a.p; };
    return { safe: safe.sort(by), less: less.sort(by) };
  }

  root.Engine = { setData: function (d) { D = d; }, families: families, classify: classify, known: known, SAFE: SAFE };
})(typeof window !== 'undefined' ? window : globalThis);
