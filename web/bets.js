/* Suivi de mes paris : saisie, résultats, bénéfice, retour sur mise, budget mensuel. Tout reste dans le navigateur de cet appareil (localStorage) ; sauvegarde par copier / coller. */
var Bets = (function () {
  var KEY = 'pf-bets', mem = { bets: [], budget: 0 };
  var SPORTS = [['foot', 'Football'], ['tennis', 'Tennis'], ['basket', 'Basket'], ['rugby', 'Rugby'], ['hand', 'Handball'], ['hockey', 'Hockey'], ['baseball', 'Baseball'],
    ['nfl', 'Foot US'], ['mma', 'MMA'], ['volley', 'Volley'], ['f1', 'Formule 1'], ['golf', 'Golf'], ['autre', 'Autre']];
  var SPN = {};
  SPORTS.forEach(function (s) { SPN[s[0]] = s[1]; });
  var ui = { period: 'all', sport: 'foot', kind: 'simple', io: '', ask: '', msg: '', pre: null, cat: '' };
  var CATS = ['Pronostic sûr', 'Moins sûr', 'Combiné', 'Autre'];

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var d = JSON.parse(raw); if (d && Array.isArray(d.bets)) mem = { bets: d.bets, budget: +d.budget || 0 }; }
    } catch (e) { /* stockage indisponible : on garde la mémoire de la page */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignoré */ } }
  load();

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { var x = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(x) ? x : NaN; }
  function eur(x, sign) { var r = Math.round(x * 100) / 100, s = Math.abs(r).toFixed(2).replace('.', ',') + ' €'; return (r < 0 ? '−' : sign && r > 0 ? '+' : '') + s; }
  function pc(x) { return Math.round(x * 100) + ' %'; }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dmy(s) { return s.slice(8) + '/' + s.slice(5, 7); }

  /* règlement automatique : un pari relié à un pronostic du site est gagné ou perdu dès que le match figure dans le journal des résultats */
  function legRes(l) { return Bets.resolver ? Bets.resolver(l.id, l.m, l.s) : null; }
  function settle() {
    var changed = false;
    mem.bets.forEach(function (b) {
      if (b.st !== 'p' || !b.legs || !b.legs.length) return;
      var r = b.legs.map(legRes);
      if (r.some(function (x) { return x === false; })) { b.st = 'l'; b.auto = true; changed = true; }
      else if (r.every(function (x) { return x === true; }) && b.legs.length >= (b.nLegs || b.legs.length)) { b.st = 'w'; b.auto = true; changed = true; }
    });
    if (changed) save();
  }
  function needsRes() { return mem.bets.some(function (b) { return b.st === 'p' && b.legs && b.legs.length; }); }
  function prefill(pre) { ui.pre = pre; ui.kind = pre.kind || 'simple'; ui.sport = pre.sport || (pre.kind === 'combine' ? 'foot' : ui.sport); ui.msg = ''; }
  function allCats() {
    var seen = {}, out = [];
    CATS.concat(mem.bets.map(function (b) { return b.cat || ''; })).forEach(function (c) { if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
    return out;
  }

  function inPeriod(b) {
    var now = new Date(), today = iso(now);
    if (ui.period === 'month') return b.d.slice(0, 7) === today.slice(0, 7);
    if (ui.period === '30') return b.d >= iso(new Date(now.getTime() - 30 * 864e5));
    return true;
  }
  function stats(list) {
    var s = { n: 0, w: 0, l: 0, v: 0, p: 0, staked: 0, ret: 0, pendStake: 0, sumImp: 0, sumOdds: 0 };
    list.forEach(function (b) {
      if (b.st === 'p') { s.p++; s.pendStake += b.stake; return; }
      if (b.st === 'v') { s.v++; return; }
      s.n++; s.staked += b.stake; s.sumImp += 1 / b.odds; s.sumOdds += b.odds;
      if (b.st === 'w') { s.w++; s.ret += b.stake * b.odds; } else s.l++;
    });
    s.profit = s.ret - s.staked;
    s.roi = s.staked ? s.profit / s.staked : 0;
    s.hit = s.n ? s.w / s.n : 0;
    s.need = s.n ? s.sumImp / s.n : 0;                  // réussite nécessaire pour être à l'équilibre (moyenne des probabilités impliquées par les cotes)
    s.avgOdds = s.n ? s.sumOdds / s.n : 0;
    return s;
  }
  function group(list, keyFn) {
    var g = {};
    list.forEach(function (b) { if (b.st === 'w' || b.st === 'l') (g[keyFn(b)] = g[keyFn(b)] || []).push(b); });
    return Object.keys(g).map(function (k) { var s = stats(g[k]); s.k = k; return s; }).sort(function (a, b) { return b.n - a.n; });
  }

  function chart(list) {
    var pts = list.filter(function (b) { return b.st === 'w' || b.st === 'l'; }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t; });
    if (pts.length < 2) return '';
    var cum = 0, ys = [0];
    pts.forEach(function (b) { cum += b.st === 'w' ? b.stake * (b.odds - 1) : -b.stake; ys.push(cum); });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), W = 320, H = 110, pad = 8;
    if (hi === lo) { hi += 1; lo -= 1; }
    var X = function (i) { return pad + (W - 2 * pad) * i / (ys.length - 1); }, Y = function (v) { return H - pad - (H - 2 * pad) * (v - lo) / (hi - lo); };
    var line = ys.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
    var col = cum >= 0 ? 'var(--green)' : 'var(--red)';
    return '<div class="sec"><span class="dot ' + (cum >= 0 ? 'g' : 'a') + '"></span>Bénéfice cumulé <small>' + pts.length + ' paris terminés</small></div><div class="fm bt-ch">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Courbe du bénéfice cumulé"><line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="4 4"/>' +
      '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + X(ys.length - 1).toFixed(1) + '" cy="' + Y(cum).toFixed(1) + '" r="3.6" fill="' + col + '"/></svg>' +
      '<div class="bt-ax"><span>' + eur(lo, false) + '</span><span>0</span><span>' + eur(hi, true) + '</span></div></div>';
  }

  function statusBtns(b) {
    if (b.st === 'p') {
      return '<div class="bt-act"><button data-bst="' + b.id + '|w" class="bt-b w">Gagné</button><button data-bst="' + b.id + '|l" class="bt-b l">Perdu</button><button data-bst="' + b.id + '|v" class="bt-b">Remboursé</button></div>';
    }
    return '';
  }
  function betRow(b) {
    var res = b.st === 'w' ? eur(b.stake * (b.odds - 1), true) : b.st === 'l' ? eur(-b.stake, true) : b.st === 'v' ? '0,00 €' : 'en attente';
    var cls = b.st === 'w' ? 'ok' : b.st === 'l' ? 'ko' : '';
    var ask = ui.ask === b.id;
    return '<div class="bt-row ' + cls + '"><div class="bt-top"><div class="bt-t"><b>' + esc(b.label || 'Pari') + '</b><small>' + dmy(b.d) + ' · ' + esc(SPN[b.sport] || 'Autre') + ' · ' +
      (b.kind === 'combine' ? 'combiné' : 'simple') + (b.cat ? ' · ' + esc(b.cat) : '') + ' · ' + eur(b.stake) + ' à ' + String(b.odds).replace('.', ',') + '</small>' +
      (b.p ? '<small class="bt-p">Notre pronostic : ' + pc(b.p) + (b.auto ? ' · résultat réglé automatiquement' : b.legs && b.legs.length && b.st === 'p' ? ' · réglage automatique dès la fin du match' : '') + '</small>' : '') + '</div><div class="bt-r ' + cls + '">' + res + '</div></div>' +
      statusBtns(b) +
      '<div class="bt-act">' + (b.st !== 'p' ? '<button data-bst="' + b.id + '|p" class="bt-b">Modifier le résultat</button>' : '') +
      (ask ? '<button data-bdel="' + b.id + '" class="bt-b l">Confirmer la suppression</button><button data-bask="" class="bt-b">Annuler</button>'
        : '<button data-bask="' + b.id + '" class="bt-b">Supprimer</button>') + '</div></div>';
  }

  function html() {
    settle();
    var now = new Date(), today = iso(now), list = mem.bets.filter(inPeriod), all = stats(list), h = '';
    var month = today.slice(0, 7), spent = mem.bets.filter(function (b) { return b.d.slice(0, 7) === month; }).reduce(function (s, b) { return s + (b.st === 'v' ? 0 : b.stake); }, 0);
    h += '<h2>Mes paris</h2><div class="srcnote">Ce suivi reste <b>sur cet appareil</b> (rien n’est envoyé nulle part). Pense à faire une sauvegarde en bas de page : si tu vides les données du navigateur, tout disparaît.</div>';
    h += '<div class="chips">' + [['all', 'Tout'], ['month', 'Ce mois'], ['30', '30 jours']].map(function (x) {
      return '<button class="chip' + (ui.period === x[0] ? ' on' : '') + '" data-bper="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';

    if (all.n) {
      var conf = all.profit >= 0 ? 'high' : 'low';
      h += '<div class="main ' + conf + '"><div class="k"><small>Bénéfice sur les paris terminés</small></div><div class="hero"><div><div class="hl">' + (all.profit >= 0 ? 'Gain' : 'Perte') + '</div><div class="hn">' + eur(all.profit, true) +
        '</div></div><div><div class="hl">Retour sur mise</div><div class="hn">' + (all.roi >= 0 ? '+' : '−') + pc(Math.abs(all.roi)) + '</div></div></div></div>';
      h += '<div class="fm bt-grid"><div><b>' + all.n + '</b><small>terminés</small></div><div><b>' + all.w + ' / ' + all.l + '</b><small>gagnés / perdus</small></div><div><b>' + eur(all.staked) +
        '</b><small>misé</small></div><div><b>' + String(all.avgOdds.toFixed(2)).replace('.', ',') + '</b><small>cote moyenne</small></div></div>';
      h += '<div class="srcnote">Avec tes cotes, il faut gagner environ <b>' + pc(all.need) + '</b> des paris pour être à l’équilibre. Tu en gagnes <b>' + pc(all.hit) + '</b> : ' +
        (all.hit >= all.need ? 'au-dessus du seuil sur cet échantillon' : 'en dessous du seuil') + (all.n < 50 ? ' (trop peu de paris, ' + all.n + ', pour en tirer une conclusion).' : '.') + '</div>';
    } else {
      h += '<div class="empty">Aucun pari terminé sur cette période. Ajoute tes paris ci-dessous, puis note le résultat quand ils sont joués.</div>';
    }
    if (all.p) h += '<div class="srcnote">' + all.p + ' pari' + (all.p > 1 ? 's' : '') + ' en attente, ' + eur(all.pendStake) + ' en jeu.</div>';

    // budget mensuel
    h += '<div class="sec"><span class="dot a"></span>Budget du mois <small>' + dmy(today) + '</small></div><div class="fm">';
    if (mem.budget > 0) {
      var ratio = spent / mem.budget;
      h += '<div class="bt-bud"><span>Misé ce mois : <b>' + eur(spent) + '</b> sur ' + eur(mem.budget) + '</span><div class="wb"><i class="' + (ratio > 1 ? 'lo' : 'ok') + '" style="width:' + Math.min(100, Math.round(ratio * 100)) + '%"></i></div></div>' +
        (ratio > 1 ? '<div class="bt-warn">Budget dépassé de ' + eur(spent - mem.budget) + '. C’est le moment de faire une pause.</div>' : ratio > 0.8 ? '<div class="bt-warn">Tu approches de ton budget du mois.</div>' : '');
    } else {
      h += '<div class="sub">Fixe un budget mensuel : le suivi te prévient quand tu t’en approches.</div>';
    }
    h += '<div class="bt-line"><input id="bt-budget" inputmode="decimal" placeholder="Budget par mois (€)" value="' + (mem.budget > 0 ? String(mem.budget).replace('.', ',') : '') + '"><button class="bt-b" data-bbud>Enregistrer</button></div></div>';

    // formulaire
    h += '<div class="sec"><span class="dot g"></span>Ajouter un pari</div><div class="fm bt-form">' +
      (ui.pre ? '<div class="srcnote">Pré-rempli depuis le site' + (ui.pre.p ? ' : notre probabilité est de <b>' + pc(ui.pre.p) + '</b> (cote juste ' + (1 / ui.pre.p).toFixed(2).replace('.', ',') + ')' : '') +
        '. Ajoute la <b>mise</b> et la <b>cote réelle vue sur Winamax</b>.</div>' : '') +
      '<label>Description<input id="bt-label" type="text" maxlength="120" placeholder="ex. PSG gagne, plus de 2,5 buts" value="' + (ui.pre ? esc(ui.pre.label) : '') + '"></label>' +
      '<div class="bt-2"><label>Mise (€)<input id="bt-stake" inputmode="decimal" placeholder="10"></label><label>Cote<input id="bt-odds" inputmode="decimal" placeholder="1,85"></label></div>' +
      '<div class="bt-imp" id="bt-imp"></div>' +
      '<div class="bt-2"><label>Sport<select id="bt-sport">' + SPORTS.map(function (s) { return '<option value="' + s[0] + '"' + (ui.sport === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>' +
      '<label>Type<select id="bt-kind"><option value="simple"' + (ui.kind === 'simple' ? ' selected' : '') + '>Simple</option><option value="combine"' + (ui.kind === 'combine' ? ' selected' : '') + '>Combiné</option></select></label></div>' +
      '<label>Catégorie<input id="bt-cat" type="text" maxlength="30" list="bt-cats" placeholder="ex. Pronostic sûr, Combiné, Test…" value="' + esc(ui.pre && ui.pre.cat ? ui.pre.cat : ui.cat) + '"></label>' +
      '<datalist id="bt-cats">' + allCats().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<label>Date<input id="bt-date" type="date" value="' + today + '"></label>' +
      (ui.msg ? '<div class="bt-warn">' + esc(ui.msg) + '</div>' : '') +
      '<button class="voir mid wide" data-badd>Ajouter ce pari</button></div>';

    // courbe et répartition
    h += chart(list);
    var bySport = group(list, function (b) { return SPN[b.sport] || 'Autre'; }), byKind = group(list, function (b) { return b.kind === 'combine' ? 'Combinés' : 'Simples'; }),
      byCat = group(list, function (b) { return b.cat ? 'Catégorie : ' + b.cat : ''; }).filter(function (s) { return s.k; });
    if (all.n && (bySport.length > 1 || byKind.length > 1 || byCat.length)) {
      h += '<div class="sec"><span class="dot a"></span>Par catégorie, sport et type <small>bénéfice</small></div><div class="fm">' +
        byCat.concat(bySport, byKind).map(function (s) {
          return '<div class="pr ' + (s.profit >= 0 ? 'ok' : 'ko') + '"><span class="pt">' + esc(s.k) + '<small class="sm">' + s.w + '/' + s.n + ' gagnés · ' + pc(s.hit) + '</small></span><span class="pp">' + eur(s.profit, true) + '</span></div>';
        }).join('') + '</div>';
    }

    // tes paris reliés à nos pronostics : ce que nous annoncions contre ce qui est arrivé
    var linked = list.filter(function (b) { return b.p && (b.st === 'w' || b.st === 'l'); });
    if (linked.length) {
      var lw = linked.filter(function (b) { return b.st === 'w'; }).length, lp = linked.reduce(function (s, b) { return s + b.p; }, 0) / linked.length;
      h += '<div class="srcnote">Sur tes <b>' + linked.length + '</b> paris reliés à un pronostic du site, nous annoncions en moyenne <b>' + pc(lp) + '</b> de réussite ; tu en as gagné <b>' + pc(lw / linked.length) + '</b>' +
        (linked.length < 30 ? ' (trop peu de paris pour conclure).' : '.') + '</div>';
    }
    // liste
    var shown = list.slice().sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : b.t - a.t; });
    h += '<div class="sec"><span class="dot g"></span>Historique <small>' + shown.length + ' pari' + (shown.length > 1 ? 's' : '') + '</small></div>';
    h += shown.length ? shown.map(betRow).join('') : '<div class="empty">Rien à afficher pour l’instant.</div>';

    // sauvegarde
    h += '<div class="sec"><span class="dot a"></span>Sauvegarde</div><div class="fm"><div class="sub">Copie tes paris pour les garder ailleurs, ou colle une sauvegarde pour les retrouver sur un autre appareil.</div>' +
      '<div class="bt-act"><button class="bt-b" data-bcopy>Copier mes paris</button><button class="bt-b" data-bimp>Importer</button></div>' +
      '<textarea id="bt-io" rows="3" placeholder="Colle ici une sauvegarde puis touche « Importer »">' + esc(ui.io) + '</textarea></div>';

    h += '<div class="sub">Un suivi honnête sert à voir ce que les paris te coûtent vraiment, pas à les justifier. Les bookmakers gardent une marge sur chaque pari : sur la durée, la plupart des parieurs perdent. ' +
      'Si le jeu te pèse, Joueurs Info Service (09 74 75 13 13, gratuit et anonyme) peut t’aider.</div>';
    return h;
  }

  function readForm() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    ui.sport = g('bt-sport') || ui.sport; ui.kind = g('bt-kind') || ui.kind;
    ui.cat = g('bt-cat').trim();
    return { cat: ui.cat, label: g('bt-label').trim(), stake: num(g('bt-stake')), odds: num(g('bt-odds')), sport: ui.sport, kind: ui.kind, d: g('bt-date') || iso(new Date()) };
  }
  function attach(root, rerender, go) {
    var again = function () { var y = window.scrollY; rerender(); window.scrollTo(0, y); };
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-bet],[data-bwin],[data-bper],[data-badd],[data-bst],[data-bask],[data-bdel],[data-bbud],[data-bcopy],[data-bimp]');
      if (!t) return;
      if (t.hasAttribute('data-bwin')) {                            // le lien s'ouvre ; on copie en plus le nom du match pour le chercher sur Winamax
        try { navigator.clipboard.writeText(t.getAttribute('data-bwin')); } catch (err) { /* ignoré */ }
        return;
      }
      if (t.hasAttribute('data-bet')) {
        var sp = t.getAttribute('data-bsp') || 'foot';
        var ref = t.getAttribute('data-bref'), mk = t.getAttribute('data-bm'), sl = t.getAttribute('data-bs');
        ui.pre = { label: t.getAttribute('data-bet'), p: +t.getAttribute('data-bp') || 0, cat: t.getAttribute('data-bcat') || '', legs: ref && mk && sl ? [{ id: ref, m: mk, s: sl }] : [] };
        ui.sport = SPN[sp] ? sp : 'foot'; ui.kind = 'simple'; ui.msg = '';
        if (go) go();
        return;
      }
      if (t.hasAttribute('data-bper')) { ui.period = t.getAttribute('data-bper'); again(); }
      else if (t.hasAttribute('data-badd')) {
        var f = readForm();
        if (!(f.stake > 0) || !(f.odds > 1)) { ui.msg = 'Indique une mise supérieure à 0 et une cote supérieure à 1 (ex. 1,85).'; again(); return; }
        ui.msg = '';
        var nb = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), d: f.d, label: f.label, sport: f.sport, kind: f.kind, cat: f.cat, stake: Math.round(f.stake * 100) / 100, odds: Math.round(f.odds * 100) / 100, st: 'p' };
        if (ui.pre) { if (ui.pre.p) nb.p = ui.pre.p; if (ui.pre.legs && ui.pre.legs.length) { nb.legs = ui.pre.legs; if (ui.pre.nLegs) nb.nLegs = ui.pre.nLegs; } }
        ui.pre = null;
        mem.bets.push(nb);
        save(); again();
      } else if (t.hasAttribute('data-bst')) {
        var p = t.getAttribute('data-bst').split('|');
        mem.bets.forEach(function (b) { if (b.id === p[0]) b.st = p[1]; });
        save(); again();
      } else if (t.hasAttribute('data-bask')) { ui.ask = t.getAttribute('data-bask'); again(); }
      else if (t.hasAttribute('data-bdel')) {
        var id = t.getAttribute('data-bdel');
        mem.bets = mem.bets.filter(function (b) { return b.id !== id; }); ui.ask = ''; save(); again();
      } else if (t.hasAttribute('data-bbud')) {
        var v = num((document.getElementById('bt-budget') || {}).value);
        mem.budget = v > 0 ? v : 0; save(); again();
      } else if (t.hasAttribute('data-bcopy')) {
        var txt = JSON.stringify(mem), ta = document.getElementById('bt-io');
        var done = function () { ui.io = txt; if (ta) { ta.value = txt; ta.select(); } };
        try { navigator.clipboard.writeText(txt).then(done, done); } catch (err) { done(); }
      } else if (t.hasAttribute('data-bimp')) {
        var raw = ((document.getElementById('bt-io') || {}).value || '').trim();
        try {
          var d = JSON.parse(raw), have = {};
          mem.bets.forEach(function (b) { have[b.id] = 1; });
          (d.bets || []).forEach(function (b) { if (b && b.id && !have[b.id] && b.stake > 0 && b.odds > 1) mem.bets.push(b); });
          if (d.budget > 0 && !mem.budget) mem.budget = +d.budget;
          ui.io = ''; ui.msg = ''; save(); again();
        } catch (err) { ui.msg = 'Sauvegarde illisible : colle le texte copié avec « Copier mes paris ».'; again(); }
      }
    });
    root.addEventListener('input', function (e) {
      if (e.target.id !== 'bt-odds' && e.target.id !== 'bt-stake') return;
      var o = num((document.getElementById('bt-odds') || {}).value), s = num((document.getElementById('bt-stake') || {}).value), box = document.getElementById('bt-imp');
      if (!box) return;
      box.textContent = o > 1 ? 'Cette cote suppose ' + pc(1 / o) + ' de chances de gagner' + (s > 0 ? ' · gain possible : ' + eur(s * (o - 1), true) : '') + '.' : '';
    });
  }
  return { html: html, attach: attach, needsRes: needsRes, prefill: prefill, resolver: null };
})();
