/* Plan de mise : calculs purs (mises, paliers, simulation). Aucune stratégie de mise ne change l'espérance d'un pari :
   ce module sert à cadrer le risque (mise de départ, récupération limitée, arrêt) et à montrer ce que la stratégie donne VRAIMENT, par simulation. */
var Plan = (function () {
  'use strict';
  var MARGIN = 0.07;                                      // marge typique d'un bookmaker : cote = (1 - marge) / probabilité réelle
  var PROF = {
    pr: { key: 'pr', name: 'Prudent', f1: 0.15, steps: 2, recCap: 0.6, minPa: 0.80, minDuo: 0.66, txt: 'Mise de départ 15 % du capital, 1 seule récupération, limitée à 60 % du capital restant.' },
    eq: { key: 'eq', name: 'Équilibré', f1: 0.25, steps: 2, recCap: 1, minPa: 0.74, minDuo: 0.62, txt: 'Mise de départ 25 % du capital, 1 récupération qui peut engager tout le capital restant.' },
    au: { key: 'au', name: 'Audacieux', f1: 0.25, steps: 3, recCap: 1, minPa: 0.70, minDuo: 0.58, txt: 'Comme Équilibré, avec une 2e récupération possible. Perte totale bien plus probable.' },
    se: { key: 'se', name: 'Sécurisé', f1: 0.10, steps: 1, recCap: 0, minPa: 0.85, minDuo: 0.74, txt: 'Objectif atteint : mises de 10 %, paris très sûrs seulement, aucune récupération.' }
  };
  function floor05(x) { return Math.floor(x * 2 + 1e-9) / 2; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function profile(key, bank, goal) { return bank >= goal ? PROF.se : (PROF[key] || PROF.eq); }
  function stake1(cb, prof) { return Math.min(cb, Math.max(1, floor05(cb * prof.f1))); }
  function target(s1, o1) { return r2(0.5 * s1 * (o1 - 1)); }       // gain visé par le cycle : la moitié du gain de la 1re étape (on vise surtout à rentrer dans ses frais)
  function recStake(L, g, o, bank, prof) {                          // mise de l'étape suivante pour récupérer la perte L plus le gain visé g, plafonnée
    var need = (L + g) / Math.max(0.01, o - 1), cap = bank * prof.recCap, s = floor05(Math.min(need, cap, bank));
    return { stake: s, need: r2(need), full: s >= need - 1e-9, minOdds: bank >= 1 ? 1 + (L + g) / Math.max(1, floor05(Math.min(cap, bank))) : 0 };
  }
  function sim(o) {                                                  // { start, goal, prof, pa, margin, runs, maxCycles } -> { reach, ruin, avg }
    var runs = o.runs || 1500, maxC = o.maxCycles || 60, pa = o.pa, odd = Math.max(1.03, (1 - o.margin) / pa), reach = 0, ruin = 0, sum = 0, i, c, k;
    var seed = 12345;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }   // graine fixe : le même affichage à chaque ouverture
    for (i = 0; i < runs; i++) {
      var bank = o.start;
      for (c = 0; c < maxC; c++) {
        if (bank >= o.goal) { reach++; break; }
        if (bank < 1) { ruin++; break; }
        var pr = profile(o.prof, bank, o.goal), cb = bank, s = stake1(cb, pr), g = target(s, odd), L = 0, won = false;
        for (k = 0; k < pr.steps; k++) {
          if (k > 0) { var rs = recStake(L, g, odd, bank, pr); s = rs.stake; if (s < 1) break; }
          if (rnd() < pa) { bank = r2(bank + s * (odd - 1)); won = true; break; }
          bank = r2(bank - s); L += s;
        }
        if (!won && bank < 1) { ruin++; break; }
      }
      if (bank >= o.goal && c >= maxC) reach++;
      sum += Math.min(bank, o.goal * 3);
    }
    return { reach: reach / runs, ruin: ruin / runs, avg: sum / runs, odds: odd, runs: runs, maxCycles: maxC };
  }
  function poissonGrid(lh, la, n) {                                // grille des scores [domicile][extérieur] pour deux espérances de buts
    n = n || 11;
    function pm(l) { var a = [Math.exp(-l)], k; for (k = 1; k < n; k++) a.push(a[k - 1] * l / k); return a; }
    var a = pm(lh), b = pm(la), g = [], i, j;
    for (i = 0; i < n; i++) { g.push([]); for (j = 0; j < n; j++) g[i].push(a[i] * b[j]); }
    return g;
  }
  function fitLambdas(pH, pD, pA) {                                // espérances de buts qui redonnent les probabilités 1N2 du marché (recherche sur une grille)
    var best = null, e, lh, la, g, h, d, a, i, j;
    for (lh = 0.2; lh <= 4.6; lh += 0.1) for (la = 0.2; la <= 4.6; la += 0.1) {
      g = poissonGrid(lh, la, 11); h = d = a = 0;
      for (i = 0; i < 11; i++) for (j = 0; j < 11; j++) { if (i > j) h += g[i][j]; else if (i === j) d += g[i][j]; else a += g[i][j]; }
      e = (h - pH) * (h - pH) + (d - pD) * (d - pD) + (a - pA) * (a - pA);
      if (!best || e < best.e) best = { e: e, lh: lh, la: la };
    }
    return best;
  }
  return { poissonGrid: poissonGrid, fitLambdas: fitLambdas, PROF: PROF, MARGIN: MARGIN, floor05: floor05, r2: r2, profile: profile, stake1: stake1, target: target, recStake: recStake, sim: sim };
})();
if (typeof module !== 'undefined') module.exports = Plan;
