/* Bookmakers : on choisit ceux qu'on utilise ; la fiche match n'affiche que les marchés qu'ils proposent.
   Winamax = catalogue relevé sur tes captures. Betclic = estimation (aucune capture reçue) : chaque marché peut être coché / décoché à la main. */
var Books = (function () {
  var KEY = 'pf-books';
  var LIST = [['wam', 'Winamax', 'W', 'https://www.winamax.fr/paris-sportifs'], ['btc', 'Betclic', 'B', 'https://www.betclic.fr/']];
  var BTC_NO = /MyMatch|multichance|Dernier but|Minute du 1er but|tirs/i;               // marchés vus chez Winamax dont Betclic n'a pas (à ma connaissance) l'équivalent
  var S = { on: { wam: true, btc: true }, ov: { wam: {}, btc: {} } }, seen = {};

  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.on) { S.on = { wam: !!raw.on.wam, btc: !!raw.on.btc }; S.ov = { wam: (raw.ov && raw.ov.wam) || {}, btc: (raw.ov && raw.ov.btc) || {} }; }
  } catch (e) { /* stockage indisponible : réglage par défaut */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function active() {                                          // aucun coché = tous (on ne cache jamais tout)
    var a = LIST.filter(function (b) { return S.on[b[0]]; });
    return a.length ? a : LIST;
  }
  function offers(id, f) {
    var k = f.kind || f.name;
    if (S.ov[id] && S.ov[id][k] !== undefined) return !!S.ov[id][k];
    return id === 'btc' ? !BTC_NO.test(f.name + ' ' + k) : true;
  }
  function has(f) {                                            // le marché est-il proposé par au moins un bookmaker actif ?
    seen[f.kind || f.name] = f;
    return active().some(function (b) { return offers(b[0], f); });
  }
  function tags(f) {                                           // quels bookmakers actifs le proposent (affiché seulement si plusieurs actifs)
    var a = active();
    if (a.length < 2) return '';
    var ok = a.filter(function (b) { return offers(b[0], f); });
    return ok.length === a.length ? '' : ok.map(function (b) { return '<span class="bk bk-' + b[0] + '">' + b[2] + '</span>'; }).join('');
  }
  function toggle(id) { S.on[id] = !S.on[id]; save(); }
  function toggleKind(id, kind) {
    var f = seen[kind]; if (!f) return;
    S.ov[id][kind] = !offers(id, f); save();
  }
  function single() { var a = active(); return a.length === 1 ? a[0][0] : ''; }
  function name(id) { var b = LIST.filter(function (x) { return x[0] === id; })[0]; return b ? b[1] : ''; }
  function links(match) {
    return active().map(function (b) {
      return '<a class="bt-b" data-bwin="' + esc(match) + '" href="' + b[3] + '" target="_blank" rel="noopener">Cote sur ' + b[1] + ' ↗</a>';
    }).join('');
  }
  function bar(open) {
    var h = '<div class="bkbar"><span class="bkl">Bookmakers</span>' + LIST.map(function (b) {
      return '<button class="chip' + (S.on[b[0]] ? ' on' : '') + '" data-bk="' + b[0] + '" aria-pressed="' + (S.on[b[0]] ? 'true' : 'false') + '">' + b[1] + '</button>';
    }).join('') + '<button class="chip" data-bkopen aria-expanded="' + (open ? 'true' : 'false') + '">Marchés ' + (open ? '▴' : '▾') + '</button></div>';
    if (!open) return h;
    var keys = Object.keys(seen).sort(function (a, b) { return a < b ? -1 : 1; });
    h += '<div class="fm bkpanel"><div class="sub">Coche les marchés que chaque appli propose. <b>Winamax</b> : d’après tes captures. <b>Betclic</b> : estimation, à corriger selon ce que tu vois dans ton appli ' +
      '(les marchés vus plus tard apparaissent ici après l’ouverture d’une fiche match).</div>';
    h += '<div class="bkrow bkhead"><span>Marché</span><span>W</span><span>B</span></div>';
    keys.forEach(function (k) {
      var f = seen[k];
      h += '<div class="bkrow"><span>' + esc(k) + '</span>' + LIST.map(function (b) {
        return '<button class="bkc' + (offers(b[0], f) ? ' on' : '') + '" data-bkk="' + b[0] + '|' + esc(k) + '" aria-label="' + esc(b[1] + ' : ' + k) + '">' + (offers(b[0], f) ? '✓' : '') + '</button>';
      }).join('') + '</div>';
    });
    return h + '</div>';
  }
  return { has: has, tags: tags, toggle: toggle, toggleKind: toggleKind, single: single, name: name, links: links, bar: bar, active: active, list: LIST };
})();
