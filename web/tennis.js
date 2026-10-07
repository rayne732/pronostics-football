/* Tennis dans le navigateur : même calcul que tennis.py (Elo + marchés en sets), appliqué au calendrier ESPN récupéré en direct. */
(function (root) {
  'use strict';
  var M = null, SAFE = 0.70, LESS = 0.30;

  function norm(s) { return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); }
  function fx(x) { return String(x).replace('.', ','); }

  function tdName(full, tour) {
    if (M[tour].p[full]) return full;                          // joueur connu sous son nom ESPN (absent de tennis-data)
    var toks = full.replace(/-/g, ' ').split(/\s+/).filter(Boolean), idx = M[tour].idx, tries = [], i;
    for (i = 1; i < toks.length; i++) tries.push(norm(toks.slice(i).join('')) + '|' + norm(toks[0]).slice(0, 1));
    if (toks.length >= 2) tries.push(norm(toks[0]) + '|' + norm(toks[toks.length - 1]).slice(0, 1));
    for (i = 0; i < tries.length; i++) if (idx[tries[i]]) return idx[tries[i]];
    return null;
  }
  function rating(tour, name, surf) {
    var p = M[tour].p[name];
    return p[0] + M.surf_w * ((p[2] && p[2][surf]) || 0);
  }
  function winProb(tour, a, b, surf) { return 1 / (1 + Math.pow(10, (rating(tour, b, surf) - rating(tour, a, surf)) / 400)); }

  function comb(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
  function scoreProbs(s, bo) {
    var w = (bo + 1) / 2, out = [];
    for (var j = 0; j < w; j++) {
      var c = comb(w - 1 + j, j);
      out.push([w, j, c * Math.pow(s, w) * Math.pow(1 - s, j)]);
      out.push([j, w, c * Math.pow(1 - s, w) * Math.pow(s, j)]);
    }
    return out;
  }
  function setProb(p, bo) {
    var lo = 0, hi = 1;
    for (var k = 0; k < 50; k++) {
      var mid = (lo + hi) / 2, pa = 0;
      scoreProbs(mid, bo).forEach(function (t) { if (t[0] > t[1]) pa += t[2]; });
      if (pa < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /* écart de jeux : modèle de Markov (point -> jeu -> set -> match), même calcul que tennis_games.py */
  var G_BASE = { ATP: 0.64, WTA: 0.565 }, G_TAU = { ATP: 0.05, WTA: 0.055 }, G_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5], G_CACHE = {};
  function gGame(p) { var q = 1 - p; return Math.pow(p, 4) * (1 + 4 * q + 10 * q * q) + 20 * Math.pow(p, 3) * Math.pow(q, 3) * p * p / (p * p + q * q); }
  function gComb(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
  function gTiebreak(pa, pb) {
    var x = (pa + (1 - pb)) / 2, y = 1 - x, win = 0, k;
    for (k = 0; k < 6; k++) win += gComb(6 + k, k) * Math.pow(x, 7) * Math.pow(y, k);
    return win + gComb(12, 6) * Math.pow(x * y, 6) * x * x / (x * x + y * y);
  }
  function gSet(sa, sb, aFirst) {
    var holdA = gGame(sa), holdB = gGame(sb), tb = aFirst ? gTiebreak(sa, sb) : 1 - gTiebreak(sb, sa), cur = { '0,0': 1 }, out = {}, n;
    for (n = 0; n < 12; n++) {
      var aServes = (n % 2 === 0) === aFirst, pw = aServes ? holdA : 1 - holdB, nxt = {};
      Object.keys(cur).forEach(function (key) {
        var ij = key.split(','), i = +ij[0], j = +ij[1], v = cur[key];
        [[i + 1, j, pw], [i, j + 1, 1 - pw]].forEach(function (t) {
          var w = v * t[2], ni = t[0], nj = t[1], k2 = ni + ',' + nj;
          if ((ni === 6 && nj <= 4) || (nj === 6 && ni <= 4) || (ni === 7 && nj === 5) || (nj === 7 && ni === 5)) out[k2] = (out[k2] || 0) + w;
          else nxt[k2] = (nxt[k2] || 0) + w;
        });
      });
      cur = nxt;
    }
    var v66 = cur['6,6'] || 0;
    out['7,6'] = (out['7,6'] || 0) + v66 * tb; out['6,7'] = (out['6,7'] || 0) + v66 * (1 - tb);
    return out;
  }
  function gMatch(sa, sb, bo) {
    var d1 = gSet(sa, sb, true), d2 = gSet(sa, sb, false), sd = [], need = (bo + 1) / 2 | 0, cur = { '0,0,0': 1 }, out = {}, r;
    Object.keys(d1).concat(Object.keys(d2)).filter(function (k, i, arr) { return arr.indexOf(k) === i; }).forEach(function (k) {
      var q = k.split(',');
      sd.push([+q[0], +q[1], 0.5 * (d1[k] || 0) + 0.5 * (d2[k] || 0)]);
    });
    for (r = 0; r < bo; r++) {
      var nxt = {};
      Object.keys(cur).forEach(function (key) {
        var t = key.split(','), x = +t[0], y = +t[1], df = +t[2], v = cur[key];
        sd.forEach(function (s) {
          var nx = x + (s[0] > s[1] ? 1 : 0), ny = y + (s[1] > s[0] ? 1 : 0), k2 = nx + ',' + ny + ',' + (df + s[0] - s[1]);
          if (nx === need || ny === need) out[k2] = (out[k2] || 0) + v * s[2]; else nxt[k2] = (nxt[k2] || 0) + v * s[2];
        });
      });
      cur = nxt;
    }
    return out;
  }
  function gMix(d, base, bo, tau) {
    var out = {};
    [[-tau, 0.25], [0, 0.5], [tau, 0.25]].forEach(function (z) {
      var m = gMatch(base + d + z[0], base - d - z[0], bo);
      Object.keys(m).forEach(function (k) { out[k] = (out[k] || 0) + z[1] * m[k]; });
    });
    return out;
  }
  function gFull(sa, sb, bo) {                                  // { 'jeuxA,jeuxB' : prob } sur tout le match
    var d1 = gSet(sa, sb, true), d2 = gSet(sa, sb, false), sd = [], need = (bo + 1) / 2 | 0, cur = { '0,0,0,0': 1 }, out = {}, r;
    Object.keys(d1).concat(Object.keys(d2)).filter(function (k, i, arr) { return arr.indexOf(k) === i; }).forEach(function (k) {
      var q = k.split(',');
      sd.push([+q[0], +q[1], 0.5 * (d1[k] || 0) + 0.5 * (d2[k] || 0)]);
    });
    for (r = 0; r < bo; r++) {
      var nxt = {};
      Object.keys(cur).forEach(function (key) {
        var t = key.split(','), x = +t[0], y = +t[1], ga = +t[2], gb = +t[3], v = cur[key];
        sd.forEach(function (st) {
          var nx = x + (st[0] > st[1] ? 1 : 0), ny = y + (st[1] > st[0] ? 1 : 0);
          if (nx === need || ny === need) { var k3 = (ga + st[0]) + ',' + (gb + st[1]); out[k3] = (out[k3] || 0) + v * st[2]; }
          else { var k2 = nx + ',' + ny + ',' + (ga + st[0]) + ',' + (gb + st[1]); nxt[k2] = (nxt[k2] || 0) + v * st[2]; }
        });
      });
      cur = nxt;
    }
    return out;
  }
  function gFirstBreak(sa, sb) {
    var ba = 1 - gGame(sa), bb = 1 - gGame(sb), den = 1 - (1 - ba) * (1 - bb), pa = 0.5 * ((1 - ba) * bb / den) + 0.5 * (bb / den);
    return [pa, 1 - pa];
  }
  function gAfter6(sa, sb) {
    var hA = gGame(sa), hB = gGame(sb), res = [0, 0, 0];
    [true, false].forEach(function (aFirst) {
      var cur = { 0: 1 };
      for (var n = 0; n < 6; n++) {
        var aServes = (n % 2 === 0) === aFirst, pw = aServes ? hA : 1 - hB, nxt = {};
        Object.keys(cur).forEach(function (k) { var d = +k; nxt[d + 1] = (nxt[d + 1] || 0) + cur[k] * pw; nxt[d - 1] = (nxt[d - 1] || 0) + cur[k] * (1 - pw); });
        cur = nxt;
      }
      Object.keys(cur).forEach(function (k) { res[+k > 0 ? 0 : +k === 0 ? 1 : 2] += 0.5 * cur[k]; });
    });
    return res;
  }
  function gExtras(p, bo, tour) {                               // même résultat que tennis_games.extras
    var key = Math.round(p * 200) + '|' + bo + '|' + tour;
    if (G_CACHE[key]) return G_CACHE[key];
    var pp = Math.min(Math.max(Math.round(p * 200) / 200, 0.02), 0.98), base = G_BASE[tour] || 0.6, tau = G_TAU[tour] || 0.06, lo = -0.25, hi = 0.25, i, m, d;
    for (i = 0; i < 22; i++) {
      d = (lo + hi) / 2; m = gMix(d, base, bo, tau);
      var pa = 0; Object.keys(m).forEach(function (k) { var t = k.split(','); if (+t[0] > +t[1]) pa += m[k]; });
      if (pa < pp) lo = d; else hi = d;
    }
    d = (lo + hi) / 2;
    var E = { diff: {}, ga: {}, gb: {}, fb: [0, 0], six: [0, 0, 0] };
    [[-tau, 0.25], [0, 0.5], [tau, 0.25]].forEach(function (z) {
      var sa = base + d + z[0], sb = base - d - z[0], w = z[1], f = gFull(sa, sb, bo);
      Object.keys(f).forEach(function (k) {
        var t = k.split(','), a2 = +t[0], b2 = +t[1];
        E.ga[a2] = (E.ga[a2] || 0) + w * f[k]; E.gb[b2] = (E.gb[b2] || 0) + w * f[k]; E.diff[a2 - b2] = (E.diff[a2 - b2] || 0) + w * f[k];
      });
      var fb = gFirstBreak(sa, sb), a6 = gAfter6(sa, sb);
      E.fb[0] += w * fb[0]; E.fb[1] += w * fb[1];
      for (var q = 0; q < 3; q++) E.six[q] += w * a6[q];
    });
    G_CACHE[key] = E;
    return E;
  }
  function gFamilies(a, b, p, bo, tour) {                       // familles issues du modèle de jeux : [nom, sélections]
    var E = gExtras(p, bo, tour), D = E.diff, out = [], hc = [];
    function P(f) { var s = 0; Object.keys(D).forEach(function (k) { if (f(+k)) s += D[k]; }); return s; }
    G_LINES.forEach(function (h) {
      var t = String(h).replace('.', ',');
      hc.push([a + ' -' + t + ' jeux', P(function (d) { return d > h; })], [b + ' +' + t + ' jeux', P(function (d) { return d < h; })],
        [b + ' -' + t + ' jeux', P(function (d) { return d < -h; })], [a + ' +' + t + ' jeux', P(function (d) { return d > -h; })]);
    });
    out.push(['Écart de jeux', hc]);
    out.push(['Premier joueur à réaliser un break', [[a, E.fb[0]], [b, E.fb[1]]]]);
    out.push(['Résultat après 6 jeux', [[a, E.six[0]], ['Match nul', E.six[1]], [b, E.six[2]]]]);
    [[a, E.ga], [b, E.gb]].forEach(function (w) {
      var G = w[1], mean = 0; Object.keys(G).forEach(function (k) { mean += +k * G[k]; });
      var c = Math.floor(mean) + 0.5, sels = [];
      for (var k = -4; k <= 4; k++) {
        var ln = c + k; if (ln <= 1) continue;
        var over = 0; Object.keys(G).forEach(function (g) { if (+g > ln) over += G[g]; });
        sels.push(['Plus de ' + fx(ln) + ' jeux', over], ['Moins de ' + fx(ln) + ' jeux', 1 - over]);
      }
      out.push(['Nombre de jeux de ' + w[0], sels]);
    });
    return out;
  }
  function families(a, b, p, bo, tour) {
    var sc = scoreProbs(setProb(p, bo), bo);
    function tot(f) { var s = 0; sc.forEach(function (t) { if (f(t[0], t[1])) s += t[2]; }); return s; }
    var F = [['Vainqueur du match', [[a, p], [b, 1 - p]], true, false],
      ['Handicap sets', [[a + ' -1,5 set', tot(function (x, y) { return x - y >= 2; })], [b + ' +1,5 set', tot(function (x, y) { return x - y < 2; })]], false, false],
      ['Handicap sets', [[b + ' -1,5 set', tot(function (x, y) { return y - x >= 2; })], [a + ' +1,5 set', tot(function (x, y) { return y - x < 2; })]], false, false]];
    (bo === 3 ? [2.5] : [3.5, 4.5]).forEach(function (ln) {
      F.push(['Total sets', [['Plus de ' + fx(ln) + ' sets', tot(function (x, y) { return x + y > ln; })], ['Moins de ' + fx(ln) + ' sets', tot(function (x, y) { return x + y < ln; })]], false, false]);
    });
    gFamilies(a, b, p, bo, tour || 'ATP').forEach(function (f) { F.push([f[0], f[1], false, false]); });
    var ns = []; sc.forEach(function (t) { var n = t[0] + t[1]; if (ns.indexOf(n) < 0) ns.push(n); }); ns.sort();
    F.push(['Nombre exact de sets', ns.map(function (n) { return [n + ' sets', tot(function (x, y) { return x + y === n; })]; }), false, false]);
    var cells = sc.slice().sort(function (u, v) { return v[2] - u[2]; }).slice(0, 3);
    F.push(['Score en sets', cells.map(function (t) { return [(t[0] > t[1] ? a : b) + ' ' + Math.max(t[0], t[1]) + '-' + Math.min(t[0], t[1]), t[2]]; }), false, true]);
    return F;
  }
  var UNSETTLED = ['Premier joueur à réaliser un break', 'Résultat après 6 jeux'];
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function classify(F) {
    var safe = [], less = [];
    F.forEach(function (f) {
      var items = f[1].slice().sort(function (u, v) { return v[1] - u[1]; });
      var rec = function (it) { return { m: f[0], s: it[0], p: r4(it[1]), v: f[2], sels: f[1].map(function (s) { return [s[0], r4(s[1])]; }) }; };
      if (f[3]) { less.push(rec(items[0])); return; }
      var ok = items.filter(function (x) { return x[1] >= SAFE; });
      if (ok.length) safe.push(rec(ok.reduce(function (u, v) { return v[1] < u[1] ? v : u; })));
      else if (items[0][1] >= LESS) less.push(rec(items[0]));
    });
    var by = function (u, v) { return v.p - u.p; };
    return { safe: safe.sort(by), less: less.sort(by) };
  }
  function won(rec, a, b, win, aS, bS, sets) {
    var s = rec.s, m;
    if (rec.m === 'Vainqueur du match') return s === (win === 0 ? a : b);
    if (rec.m === 'Handicap sets') {
      var name = s.split(' ').slice(0, -2).join(' '), diff = name === a ? aS - bS : bS - aS;
      return s.indexOf('-1,5') >= 0 ? diff >= 2 : diff > -2;
    }
    if (rec.m === 'Écart de jeux') {
      var gA = 0, gB = 0, parts = s.split(' '), tok = parts[parts.length - 2], who = parts.slice(0, -2).join(' '), val = parseFloat(tok.slice(1).replace(',', '.'));
      (sets || []).forEach(function (x) { var q = x.split('-'); gA += +q[0]; gB += +q[1]; });
      var df2 = who === a ? gA - gB : gB - gA;
      return tok.charAt(0) === '-' ? df2 > val : df2 > -val;
    }
    if (rec.m.indexOf('Nombre de jeux de ') === 0) {
      var who2 = rec.m.slice(18), g2 = 0, ln2 = parseFloat(s.match(/(\d+,\d)/)[1].replace(',', '.'));
      (sets || []).forEach(function (x) { g2 += +x.split('-')[who2 === a ? 0 : 1]; });
      return s.indexOf('Plus') === 0 ? g2 > ln2 : g2 < ln2;
    }
    if (rec.m === 'Nombre exact de sets') return aS + bS === parseInt(s, 10);
    if (rec.m === 'Total sets') {
      var n = aS + bS, ln = parseFloat(s.match(/(\d,\d)/)[1].replace(',', '.'));
      return s.indexOf('Plus') === 0 ? n > ln : n < ln;
    }
    if (rec.m === 'Score en sets') {
      m = s.match(/^(.*) (\d)-(\d)$/);
      var who = m[1], x = +m[2], y = +m[3];
      return (who === a && aS === x && bS === y) || (who === b && bS === x && aS === y);
    }
    return false;
  }

  /* heure de Paris d'une date ISO UTC (« 2026-10-01T04:10Z ») */
  var fmt = null;
  function paris(iso) {
    if (!fmt) fmt = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    var o = {};
    fmt.formatToParts(new Date(iso.length === 16 ? iso + ':00Z' : iso)).forEach(function (p) { o[p.type] = p.value; });
    return { d: o.year + '-' + o.month + '-' + o.day, t: o.hour + ':' + o.minute };
  }
  function surfaceOf(raw) {
    var c = norm(raw.city), n = norm(raw.tn);
    if (c && M.surf.city[c]) return M.surf.city[c];
    var keys = Object.keys(M.surf.tn);
    for (var i = 0; i < keys.length; i++) if (n.indexOf(keys[i]) >= 0) return M.surf.tn[keys[i]];
    return 'Hard';
  }

  /* simples d'un flux ESPN -> matchs bruts */
  function parseEspn(json, seen) {
    var out = [];
    (json.events || []).forEach(function (ev) {
      (ev.groupings || []).forEach(function (g) {
        var gname = (g.grouping || {}).displayName || '';
        if (gname.indexOf('Singles') < 0) return;
        var tour = gname.indexOf('Men') >= 0 ? 'ATP' : 'WTA';
        g.competitions.forEach(function (c) {
          if (seen[c.id]) return;
          seen[c.id] = 1;
          var cs = (c.competitors || []);
          if (cs.length !== 2 || cs.some(function (x) { return !x.athlete; })) return;
          cs = cs.slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); });
          var state = c.status.type.state, when = paris(c.date), sets = [], win = null, flags;
          if (state === 'post') {
            var n = Math.max.apply(null, cs.map(function (x) { return (x.linescores || []).length; }));
            for (var i = 0; i < n; i++) {
              if (cs[0].linescores[i] && cs[1].linescores[i]) sets.push(Math.round(cs[0].linescores[i].value) + '-' + Math.round(cs[1].linescores[i].value));
            }
            cs.forEach(function (x, k) { if (x.winner) win = k; });
          }
          flags = cs.map(function (x) { var h = ((x.athlete.flag || {}).href || ''); var m = h.match(/\/(\w+)\.png/); return m ? m[1].toUpperCase() : ''; });
          var note = ((c.notes || [])[0] || {}).text || '';
          out.push({ id: c.id, tour: tour, tn: ev.name, city: ((ev.venue || {}).displayName || '').split(',')[0], major: !!ev.major && tour === 'ATP',
            round: (c.round || {}).displayName || '', d: when.d, t: when.t, state: state, names: cs.map(function (x) { return x.athlete.displayName; }), flags: flags,
            sets: sets, win: win, retired: /ret|w\/o|walkover|default/i.test(note), court: (c.venue || {}).court || '' });
        });
      });
    });
    return out;
  }

  /* un match brut -> même structure que tennis.py */
  function build(raw, base) {
    var tdn = raw.names.map(function (n) { return tdName(n, raw.tour); });
    var known = tdn.map(function (n) { return !!n; }), allKnown = known[0] && known[1];
    var surf = surfaceOf(raw), bo = raw.major ? 5 : 3;
    var p = allKnown ? winProb(raw.tour, tdn[0], tdn[1], surf) : 0.5;
    var C = allKnown ? classify(families(raw.names[0], raw.names[1], p, bo, raw.tour)) : { safe: [], less: [] };
    if (base) { p = base.p; allKnown = base.known; C = { safe: base.safe, less: base.less }; }      // pronostic déjà calculé par le serveur : on le garde
    var it = { id: raw.id, tour: raw.tour, tn: raw.tn, city: raw.city, surf: surf, round: raw.round, bo: bo, date: raw.d, time: raw.t, state: raw.state,
      a: raw.names[0], b: raw.names[1], fa: raw.flags[0], fb: raw.flags[1], p: r4(p), known: allKnown, safe: C.safe, less: C.less,
      ra: tdn[0] ? Math.round(rating(raw.tour, tdn[0], surf)) : null, rb: tdn[1] ? Math.round(rating(raw.tour, tdn[1], surf)) : null, court: raw.court };
    if (base) { it.ra = base.ra; it.rb = base.rb; }
    if (raw.state === 'post') {
      it.sets = raw.sets; it.win = raw.win; it.retired = raw.retired;
      if (raw.win !== null && !raw.retired) {
        it.hit = (raw.win === 0) === (p > 0.5);
        var aS = raw.sets.filter(function (s) { var q = s.split('-'); return +q[0] > +q[1]; }).length, bS = raw.sets.length - aS;
        it.picks = C.safe.filter(function (r) { return UNSETTLED.indexOf(r.m) < 0; }).map(function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.names[0], raw.names[1], raw.win, aS, bS, raw.sets), t: 0 }; })
          .concat(C.less.filter(function (r) { return UNSETTLED.indexOf(r.m) < 0; }).map(function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.names[0], raw.names[1], raw.win, aS, bS, raw.sets), t: 1 }; }));
      }
    }
    return it;
  }

  root.Tennis = {
    setModel: function (m) { M = m; if (m && m.safe) { SAFE = m.safe; LESS = m.less; } },
    ready: function () { return !!M; },
    parseEspn: parseEspn, build: build, paris: paris, games: gFamilies
  };
})(typeof window !== 'undefined' ? window : globalThis);
