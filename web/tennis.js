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
  function families(a, b, p, bo) {
    var sc = scoreProbs(setProb(p, bo), bo);
    function tot(f) { var s = 0; sc.forEach(function (t) { if (f(t[0], t[1])) s += t[2]; }); return s; }
    var F = [['Vainqueur du match', [[a, p], [b, 1 - p]], true, false],
      ['Handicap sets', [[a + ' -1,5 set', tot(function (x, y) { return x - y >= 2; })], [b + ' +1,5 set', tot(function (x, y) { return x - y < 2; })]], false, false],
      ['Handicap sets', [[b + ' -1,5 set', tot(function (x, y) { return y - x >= 2; })], [a + ' +1,5 set', tot(function (x, y) { return y - x < 2; })]], false, false]];
    (bo === 3 ? [2.5] : [3.5, 4.5]).forEach(function (ln) {
      F.push(['Total sets', [['Plus de ' + fx(ln) + ' sets', tot(function (x, y) { return x + y > ln; })], ['Moins de ' + fx(ln) + ' sets', tot(function (x, y) { return x + y < ln; })]], false, false]);
    });
    var cells = sc.slice().sort(function (u, v) { return v[2] - u[2]; }).slice(0, 3);
    F.push(['Score en sets', cells.map(function (t) { return [(t[0] > t[1] ? a : b) + ' ' + Math.max(t[0], t[1]) + '-' + Math.min(t[0], t[1]), t[2]]; }), false, true]);
    return F;
  }
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
  function won(rec, a, b, win, aS, bS) {
    var s = rec.s, m;
    if (rec.m === 'Vainqueur du match') return s === (win === 0 ? a : b);
    if (rec.m === 'Handicap sets') {
      var name = s.split(' ').slice(0, -2).join(' '), diff = name === a ? aS - bS : bS - aS;
      return s.indexOf('-1,5') >= 0 ? diff >= 2 : diff > -2;
    }
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
    var C = allKnown ? classify(families(raw.names[0], raw.names[1], p, bo)) : { safe: [], less: [] };
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
        it.picks = C.safe.map(function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.names[0], raw.names[1], raw.win, aS, bS), t: 0 }; })
          .concat(C.less.map(function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.names[0], raw.names[1], raw.win, aS, bS), t: 1 }; }));
      }
    }
    return it;
  }

  root.Tennis = {
    setModel: function (m) { M = m; if (m && m.safe) { SAFE = m.safe; LESS = m.less; } },
    ready: function () { return !!M; },
    parseEspn: parseEspn, build: build, paris: paris
  };
})(typeof window !== 'undefined' ? window : globalThis);
