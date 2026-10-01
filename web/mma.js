/* MMA (UFC) dans le navigateur : même calcul que mma.py (notes Elo + fréquences d'arrêt par round), appliqué en direct au calendrier ESPN. */
(function (root) {
  'use strict';
  var M = null, SAFE = 0.70, LESS = 0.30;

  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function getJson(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function days(now, parisFn, from, to) {
    var out = [];
    for (var i = from; i <= to; i++) out.push(parisFn(new Date(now.getTime() + i * 864e5).toISOString()).d.replace(/-/g, ''));
    return out;
  }
  function closeness(p) { var c = Math.abs(p - 0.5); return c < 0.1 ? 0 : c < 0.22 ? 1 : 2; }
  function recRating(s) {
    var m = /^(\d+)-(\d+)/.exec(s || '');
    if (!m) return 1500;
    var w = +m[1], l = +m[2];
    return 1500 + 250 * (w - l) / (w + l + 4);
  }

  function families(a, b, p, rounds) {
    var r = M.rates[(rounds >= 5 ? 5 : 3) + '|' + closeness(p)].slice();
    if (rounds < 5) { r[3] = 0; r[4] = 0; var s = r[0] + r[1] + r[2] + r[3] + r[4] + r[5]; r = r.map(function (x) { return x / s; }); }
    var dec = r[5];
    var F = [['Vainqueur du combat', [[a, p], [b, 1 - p]], true, false],
      ['Le combat va à la décision', [['Oui', dec], ['Non', 1 - dec]], false, false],
      ['Plus / moins de 1,5 round', [['Plus de 1,5 round', 1 - r[0]], ['Moins de 1,5 round', r[0]]], false, false]];
    if (rounds >= 3) F.push(['Plus / moins de 2,5 rounds', [['Plus de 2,5 rounds', 1 - r[0] - r[1]], ['Moins de 2,5 rounds', r[0] + r[1]]], false, false]);
    F.push(['Méthode de victoire', [[a + ' par décision', p * dec], [a + ' par arrêt', p * (1 - dec)], [b + ' par décision', (1 - p) * dec], [b + ' par arrêt', (1 - p) * (1 - dec)]], false, true]);
    return F;
  }
  function classify(F) {
    var safe = [], less = [];
    F.forEach(function (f) {
      var items = f[1].slice().sort(function (u, v) { return v[1] - u[1]; });
      var rec = function (it) { return { m: f[0], s: it[0], p: r4(it[1]), v: true, sels: f[1].map(function (s) { return [s[0], r4(s[1])]; }) }; };
      if (f[3]) { less.push(rec(items[0])); return; }
      var ok = items.filter(function (x) { return x[1] >= SAFE; });
      if (ok.length) safe.push(rec(ok.reduce(function (u, v) { return v[1] < u[1] ? v : u; })));
      else if (items[0][1] >= LESS) less.push(rec(items[0]));
    });
    var by = function (u, v) { return v.p - u.p; };
    return { safe: safe.sort(by), less: less.sort(by) };
  }
  function won(rec, a, b, win, period, dec) {
    var s = rec.s, m = rec.m;
    if (m === 'Vainqueur du combat') return s === (win === 0 ? a : b);
    if (m === 'Le combat va à la décision') return (s === 'Oui') === !!dec;
    if (m.indexOf('Plus / moins de 1,5') === 0) { var o1 = !!dec || period > 1; return s.indexOf('Plus') === 0 ? o1 : !o1; }
    if (m.indexOf('Plus / moins de 2,5') === 0) { var o2 = !!dec || period > 2; return s.indexOf('Plus') === 0 ? o2 : !o2; }
    return s === (win === 0 ? a : b) + ' par ' + (dec ? 'décision' : 'arrêt');
  }

  function build(raw, base, parisFn) {
    var w = parisFn(raw.d), na = M.n[raw.a] || 0, nb = M.n[raw.b] || 0, known = na >= M.min && nb >= M.min;
    var ra = M.r[raw.a] !== undefined ? M.r[raw.a] : recRating(raw.ra), rb = M.r[raw.b] !== undefined ? M.r[raw.b] : recRating(raw.rb);
    var p = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    if (!known) p = 0.5 + (p - 0.5) * 0.5;
    var C = known ? classify(families(raw.a, raw.b, p, raw.rounds)) : { safe: [], less: [] };
    if (base) { p = base.p; known = base.known; C = { safe: base.safe, less: base.less }; }
    var it = { id: String(raw.id), date: w.d, time: w.t, state: raw.state, home: raw.a, away: raw.b, p: r4(p), known: known,
      label: raw.cls ? raw.cls + ' · ' + (raw.ord >= raw.n - 5 ? 'carte principale' : 'préliminaires') + ' · ' + raw.rounds + ' rounds' : '', ev: raw.ev, ord: raw.ord, rounds: raw.rounds, rec: [raw.ra, raw.rb], safe: C.safe, less: C.less };
    if (raw.state === 'post' && raw.win >= 0) {
      var dec = (raw.period >= raw.rounds && raw.clock >= 299) || raw.dec ? 1 : 0, who = raw.win === 0 ? raw.a : raw.b;
      it.res = who + ' · ' + (dec ? 'décision' : 'arrêt, round ' + raw.period);
      it.hit = known ? (p > 0.5) === (raw.win === 0) : null;
      if (known) {
        var mk = function (t) { return function (r) { return { m: r.m, s: r.s, p: r.p, h: won(r, raw.a, raw.b, raw.win, raw.period, dec), t: t }; }; };
        it.picks = C.safe.map(mk(0)).concat(C.less.map(mk(1)));
      }
    }
    return it;
  }
  function parse(json) {
    var out = [];
    (json.events || []).forEach(function (ev) {
      var comps = ev.competitions || [];
      comps.forEach(function (c, i) {
        var cs = (c.competitors || []).slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); });
        if (cs.length !== 2 || cs.some(function (x) { return !x.athlete; })) return;
        var rec = function (x) { return ((x.records || [{}])[0] || {}).summary || ''; }, st = c.status || {};
        var win = -1; cs.forEach(function (x, k) { if (x.winner) win = k; });
        out.push({ id: c.id, d: c.date.slice(0, 16), a: cs[0].athlete.displayName, b: cs[1].athlete.displayName, state: st.type.state, win: win, period: st.period || 0, clock: st.clock || 0,
          rounds: ((c.format || {}).regulation || {}).periods || 3, dec: cs.some(function (x) { return x.linescores && x.linescores.length; }), cls: (c.type || {}).abbreviation || '', ev: ev.name,
          ord: i, n: comps.length, ra: rec(cs[0]), rb: rec(cs[1]) });
      });
    });
    return out.filter(function (r) { return !/TBA/i.test(r.a + r.b); });
  }
  function fetchRaw(now, parisFn) {
    return Promise.all(days(now, parisFn, -1, 5).map(function (ymd) {
      return getJson('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=' + ymd).then(parse).catch(function () { return []; });
    })).then(function (r) { return [].concat.apply([], r); });
  }

  root.Mma = { init: function (d) { M = d.model; SAFE = M.safe; LESS = M.less; }, fetchRaw: fetchRaw, build: build, parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
