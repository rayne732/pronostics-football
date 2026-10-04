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
                   [home + ' ou nul', function (i, j) { return i >= j; }], [away + ' ou nul', function (i, j) { return i <= j; }], [home + ' ou ' + away, function (i, j) { return i !== j; }]];
    var goalopts = [['plus de 0,5 buts', function (i, j) { return i + j > 0.5; }], ['plus de 1,5 buts', function (i, j) { return i + j > 1.5; }],
                    ['plus de 2,5 buts', function (i, j) { return i + j > 2.5; }], ['moins de 2,5 buts', function (i, j) { return i + j < 2.5; }],
                    ['moins de 3,5 buts', function (i, j) { return i + j < 3.5; }], ['les deux équipes marquent', function (i, j) { return i > 0 && j > 0; }],
                    ['les deux équipes ne marquent pas toutes deux', function (i, j) { return !(i > 0 && j > 0); }]];
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


    // --- marchés buts / mi-temps supplémentaires (tous « extra »)
    function S(k) { return k > 1 ? 's' : ''; }
    function exs(name, items, kind) { add(name, items, false, false, kind, true); }
    function tot(f) { return function (i, j) { return f(i + j); }; }
    exs('Nombre exact de buts', [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return [k + ' but' + S(k), gsum(g, tot(function (t) { return t === k; }))]; })
      .concat([['9 buts ou plus', gsum(g, tot(function (t) { return t >= 9; }))]]));
    exs('Nombre de buts (intervalle)', [['0-1 but', gsum(g, tot(function (t) { return t <= 1; }))], ['2-3 buts', gsum(g, tot(function (t) { return t >= 2 && t <= 3; }))],
      ['4-6 buts', gsum(g, tot(function (t) { return t >= 4 && t <= 6; }))], ['7 buts ou plus', gsum(g, tot(function (t) { return t >= 7; }))]]);
    [[home, function (i, j) { return i; }], [away, function (i, j) { return j; }]].forEach(function (t) {
      var own = t[1];
      exs('Nombre exact de buts de ' + t[0], [0, 1, 2].map(function (k) { return [k + ' but' + S(k), gsum(g, function (i, j) { return own(i, j) === k; })]; })
        .concat([['3 buts ou plus', gsum(g, function (i, j) { return own(i, j) >= 3; })]]), "Nombre exact de buts d'une équipe");
      exs('Intervalle de buts de ' + t[0], [['0 but', gsum(g, function (i, j) { return own(i, j) === 0; })], ['1-2 buts', gsum(g, function (i, j) { return own(i, j) >= 1 && own(i, j) <= 2; })],
        ['1-3 buts', gsum(g, function (i, j) { return own(i, j) >= 1 && own(i, j) <= 3; })], ['2-3 buts', gsum(g, function (i, j) { return own(i, j) >= 2 && own(i, j) <= 3; })],
        ['4 buts ou plus', gsum(g, function (i, j) { return own(i, j) >= 4; })]], "Intervalle de buts d'une équipe");
    });
    var mv = [];
    [[home, 1], [away, -1]].forEach(function (t) {
      mv.push([t[0] + ' gagne par exactement 1 but', gsum(g, function (i, j) { return t[1] * (i - j) === 1; })]);
      mv.push([t[0] + ' gagne par exactement 2 buts', gsum(g, function (i, j) { return t[1] * (i - j) === 2; })]);
      mv.push([t[0] + ' gagne par au moins 3 buts', gsum(g, function (i, j) { return t[1] * (i - j) >= 3; })]);
    });
    mv.push(['Match nul', pn]);
    exs('Marge de victoire', mv);
    var rs3 = [[home, function (i, j) { return i > j; }], ['Match nul', function (i, j) { return i === j; }], [away, function (i, j) { return i < j; }]];
    var gl6 = [['plus de 1,5', function (i, j) { return i + j > 1.5; }], ['moins de 1,5', function (i, j) { return i + j < 1.5; }], ['plus de 2,5', function (i, j) { return i + j > 2.5; }],
               ['moins de 2,5', function (i, j) { return i + j < 2.5; }], ['plus de 3,5', function (i, j) { return i + j > 3.5; }], ['moins de 3,5', function (i, j) { return i + j < 3.5; }]];
    var rg = [];
    rs3.forEach(function (ro) { gl6.forEach(function (go) { rg.push([ro[0] + ' et ' + go[0], gsum(g, function (i, j) { return ro[1](i, j) && go[1](i, j); })]); }); });
    exs('Résultat et nombre de buts', rg);
    var rb = [];
    rs3.forEach(function (ro) {
      rb.push([ro[0] + ' et oui', gsum(g, function (i, j) { return ro[1](i, j) && i > 0 && j > 0; })]);
      rb.push([ro[0] + ' et non', gsum(g, function (i, j) { return ro[1](i, j) && !(i > 0 && j > 0); })]);
    });
    exs('Résultat et les deux équipes marquent', rb);
    var fr = [];
    [[home, true], [away, false]].forEach(function (fo) {
      rs3.forEach(function (ro) {
        var s1 = 0;
        for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) if (i + j > 0 && ro[1](i, j)) s1 += g[i][j] * (fo[1] ? i : j) / (i + j);
        fr.push([fo[0] + ' marque en premier et ' + (ro[0] === 'Match nul' ? 'match nul' : ro[0] + ' gagne'), s1]);
      });
    });
    exs('Équipe qui marque le 1er but et résultat', fr);
    exs('Quelle équipe va marquer ?', [['Aucune équipe', gsum(g, function (i, j) { return i + j === 0; })], ['Seulement ' + home, gsum(g, function (i, j) { return i > 0 && j === 0; })],
      ['Seulement ' + away, gsum(g, function (i, j) { return j > 0 && i === 0; })], ['Les deux équipes', b]]);
    [[home, function (i, j) { return i; }, function (i, j) { return j; }], [away, function (i, j) { return j; }, function (i, j) { return i; }]].forEach(function (t) {
      var own = t[1], opp = t[2], cs = gsum(g, function (i, j) { return opp(i, j) === 0; }), wn = gsum(g, function (i, j) { return own(i, j) > opp(i, j) && opp(i, j) === 0; });
      exs(t[0] + ' garde sa cage inviolée', [['Oui', cs], ['Non', 1 - cs]], 'Cage inviolée (oui/non)');
      exs(t[0] + ' gagne sans concéder de but', [['Oui', wn], ['Non', 1 - wn]], 'Gagne sans concéder (oui/non)');
    });

    // mi-temps (1re période indépendante de la 2e)
    [[home, 1, lh], [away, -1, la]].forEach(function (t) {
      var w1 = gsum(ht, function (i, j) { return t[1] * (i - j) > 0; }), w2 = gsum(sh, function (i, j) { return t[1] * (i - j) > 0; });
      exs(t[0] + ' gagne une des mi-temps', [['Oui', 1 - (1 - w1) * (1 - w2)], ['Non', (1 - w1) * (1 - w2)]], 'Gagne une mi-temps (oui/non)');
      exs(t[0] + ' gagne les deux mi-temps', [['Oui', w1 * w2], ['Non', 1 - w1 * w2]], 'Gagne les deux mi-temps (oui/non)');
      var sc2 = (1 - Math.exp(-s * t[2])) * (1 - Math.exp(-(1 - s) * t[2]));
      exs(t[0] + ' marque dans les deux mi-temps', [['Oui', sc2], ['Non', 1 - sc2]], 'Marque dans les deux mi-temps (oui/non)');
    });
    var pa = pmfArr(s * l, N), pb = pmfArr((1 - s) * l, N), m2a = 0, m2e = 0, m2b = 0;
    for (var ia = 0; ia < N; ia++) for (var ib = 0; ib < N; ib++) { var v = pa[ia] * pb[ib]; if (ia > ib) m2a += v; else if (ia === ib) m2e += v; else m2b += v; }
    exs('Mi-temps avec le plus de buts', [['1re mi-temps', m2a], ['Égalité', m2e], ['2de mi-temps', m2b]]);
    function hs(f) { return gsum(ht, f); }
    exs('Mi-temps - Double chance', [[home + ' ou nul', hs(function (i, j) { return i >= j; })], [away + ' ou nul', hs(function (i, j) { return i <= j; })], [home + ' ou ' + away, hs(function (i, j) { return i !== j; })]]);
    var bhy = hs(function (i, j) { return i > 0 && j > 0; });
    exs('Mi-temps - Les 2 équipes marquent', [['Oui', bhy], ['Non', 1 - bhy]]);
    exs('Mi-temps - Nombre de buts', [0.5, 1.5, 2.5].map(function (x) { return ['Plus de ' + fx(x) + ' buts', hs(function (i, j) { return i + j > x; })]; })
      .concat([0.5, 1.5, 2.5].map(function (x) { return ['Moins de ' + fx(x) + ' buts', hs(function (i, j) { return i + j < x; })]; })));
    [[home, function (i, j) { return i; }], [away, function (i, j) { return j; }]].forEach(function (t) {
      var own = t[1];
      exs('Mi-temps - Nombre de buts de ' + t[0], [0.5, 1.5].map(function (x) { return [t[0] + ' plus de ' + fx(x), hs(function (i, j) { return own(i, j) > x; })]; })
        .concat([0.5, 1.5].map(function (x) { return [t[0] + ' moins de ' + fx(x), hs(function (i, j) { return own(i, j) < x; })]; })), "Mi-temps - Buts d'une équipe");
    });
    exs('Mi-temps - Nombre exact de buts', [0, 1, 2].map(function (k) { return [k + ' but' + S(k), hs(function (i, j) { return i + j === k; })]; }).concat([['3 buts ou plus', hs(function (i, j) { return i + j >= 3; })]]));
    exs('Mi-temps - Nombre de buts (intervalle)', [['0 but', hs(function (i, j) { return i + j === 0; })], ['1-2 buts', hs(function (i, j) { return i + j >= 1 && i + j <= 2; })],
      ['1-3 buts', hs(function (i, j) { return i + j >= 1 && i + j <= 3; })], ['2-3 buts', hs(function (i, j) { return i + j >= 2 && i + j <= 3; })], ['4 buts ou plus', hs(function (i, j) { return i + j >= 4; })]]);
    var hcells = [[1, 0], [0, 0], [0, 1], [2, 0], [1, 1], [0, 2], [2, 1], [2, 2], [1, 2]], hsum = 0;
    var hitems = hcells.map(function (c) { hsum += ht[c[0]][c[1]]; return [c[0] + '-' + c[1], ht[c[0]][c[1]]]; });
    hitems.push(['Autre', 1 - hsum]);
    exs('Mi-temps - Score exact', hitems);
    var hw = hs(function (i, j) { return i > j; }), haw = hs(function (i, j) { return i < j; });
    if (hw + haw > 0) exs('Mi-temps - Vainqueur (remboursé si match nul)', [[home, hw / (hw + haw)], [away, haw / (hw + haw)]]);
    [[home, function (i, j) { return j; }], [away, function (i, j) { return i; }]].forEach(function (t) {
      var c0 = hs(function (i, j) { return t[1](i, j) === 0; });
      exs('Mi-temps - ' + t[0] + ' garde sa cage inviolée ?', [['Oui', c0], ['Non', 1 - c0]], 'Mi-temps - Cage inviolée');
    });
    var hr3 = [[home, function (i, j) { return i > j; }], ['Match nul', function (i, j) { return i === j; }], [away, function (i, j) { return i < j; }]];
    var hg4 = [['moins de 0,5', function (i, j) { return i + j < 0.5; }], ['plus de 0,5', function (i, j) { return i + j > 0.5; }], ['moins de 1,5', function (i, j) { return i + j < 1.5; }], ['plus de 1,5', function (i, j) { return i + j > 1.5; }]];
    var hrg = [];
    hr3.forEach(function (ro) { hg4.forEach(function (go) { hrg.push([ro[0] + ' et ' + go[0], hs(function (i, j) { return ro[1](i, j) && go[1](i, j); })]); }); });
    exs('Mi-temps - Résultat et nombre de buts', hrg);
    var hdc = [[home + ' ou nul', function (i, j) { return i >= j; }], [away + ' ou nul', function (i, j) { return i <= j; }], [home + ' ou ' + away, function (i, j) { return i !== j; }]];
    var hdb = [];
    hdc.forEach(function (dc) {
      hdb.push([dc[0] + ' et oui', hs(function (i, j) { return dc[1](i, j) && i > 0 && j > 0; })]);
      hdb.push([dc[0] + ' et non', hs(function (i, j) { return dc[1](i, j) && !(i > 0 && j > 0); })]);
    });
    exs('Mi-temps - Double chance et les deux équipes marquent', hdb);
    // minute du 1er but : buts répartis uniformément dans chaque mi-temps
    function lamCum(t) { return s * l * Math.min(t, 45) / 45 + (1 - s) * l * Math.max(t - 45, 0) / 45; }
    function minutes(bounds) {
      return bounds.map(function (ab) { return [(ab[0] + 1) + '-' + ab[1], Math.exp(-lamCum(ab[0])) - Math.exp(-lamCum(ab[1]))]; }).concat([['Aucun but', Math.exp(-l)]]);
    }
    var b10 = [], b15 = [], a0;
    for (a0 = 0; a0 < 90; a0 += 10) b10.push([a0, a0 + 10]);
    for (a0 = 0; a0 < 90; a0 += 15) b15.push([a0, a0 + 15]);
    exs('Minute du 1er but (10 min)', minutes(b10));
    exs('Minute du 1er but (15 min)', minutes(b15));


    // --- tirs et tirs cadrés (championnats qui ont ces statistiques) : loi binomiale négative, équipes indépendantes
    function nbArr(mu) {
      var r = 25, a = new Array(80), p = Math.exp(r * Math.log(r / (r + mu)));
      for (var k = 0; k < 80; k++) { a[k] = p; p = p * (k + r) / (k + 1) * mu / (r + mu); }
      return a;
    }
    function arrSum(a, f) { var s2 = 0; for (var k = 0; k < 80; k++) if (f(k)) s2 += a[k]; return s2; }
    [['s', 'Nombre de tirs', 'tirs', 'Tirs - Résultat'], ['st', 'Nombre de tirs cadrés', 'tirs cadrés', 'Tirs cadrés - Résultat']].forEach(function (cfg) {
      if (!L[cfg[0]]) return;
      var mm = lam(L[cfg[0]], home, away), ph = nbArr(mm[0]), pa2 = nbArr(mm[1]), ptot = new Array(80), k, i;
      for (k = 0; k < 80; k++) { var s3 = 0; for (i = 0; i <= k; i++) s3 += ph[i] * pa2[k - i]; ptot[k] = s3; }
      var c0 = Math.floor(mm[0] + mm[1]) + 0.5, ln = [-3, -2, -1, 0, 1, 2, 3].map(function (d) { return c0 + d; });
      exs(cfg[1], ln.map(function (x) { return ['Plus de ' + fx(x) + ' ' + cfg[2], arrSum(ptot, function (k2) { return k2 > x; })]; })
        .concat(ln.map(function (x) { return ['Moins de ' + fx(x) + ' ' + cfg[2], arrSum(ptot, function (k2) { return k2 < x; })]; })));
      [[home, mm[0], ph], [away, mm[1], pa2]].forEach(function (t) {
        var c1 = Math.floor(t[1]) + 0.5, lt = [-2, -1, 0, 1, 2].map(function (d) { return c1 + d; });
        exs(cfg[1] + ' de ' + t[0], lt.map(function (x) { return [t[0] + ' plus de ' + fx(x), arrSum(t[2], function (k2) { return k2 > x; })]; })
          .concat(lt.map(function (x) { return [t[0] + ' moins de ' + fx(x), arrSum(t[2], function (k2) { return k2 < x; })]; })), cfg[1] + " d'une équipe");
      });
      var pg = 0, pe = 0;
      for (i = 0; i < 80; i++) for (var j2 = 0; j2 < 80; j2++) { if (i > j2) pg += ph[i] * pa2[j2]; else if (i === j2) pe += ph[i] * pa2[j2]; }
      exs(cfg[3], [[home, pg], ['Égalité', pe], [away, Math.max(0, 1 - pg - pe)]]);
    });

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
