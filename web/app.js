/* Interface : accueil par dates, fiche match, analyse libre, fiabilité. Les marchés viennent de Engine (engine.js). */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('data').textContent);
  Engine.setData(D);
  var SAFE = D.safeMin, app = document.getElementById('app'), nav = document.getElementById('nav');
  var CONF = { high: 'Haute confiance', mid: 'Confiance moyenne', low: 'Match ouvert' };
  var WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var st = { tab: 'home', day: 'all', filter: 'all', q: '', sort: 'time', detail: null, dtab: 'pred', pushed: false, scroll: 0,
             an: { div: D.order[0], h: 0, a: 1 } };
  var favs = {};
  try { favs = JSON.parse(localStorage.getItem('pf-fav') || '{}'); } catch (e) { favs = {}; }
  var ticket = [];
  try { ticket = JSON.parse(localStorage.getItem('pf-ticket') || '[]'); } catch (e) { ticket = []; }
  function saveTicket() { try { localStorage.setItem('pf-ticket', JSON.stringify(ticket)); } catch (e) { /* ignoré */ } }
  function tkKey(d, m, sel) { return d.div + '|' + d.home + '|' + d.away + '|' + m + '|' + sel; }
  function inTicket(k) { return ticket.some(function (t) { return t.k === k; }); }
  function saveFavs() { try { localStorage.setItem('pf-fav', JSON.stringify(favs)); } catch (e) { /* stockage indisponible */ } }
  try { var savedTheme = localStorage.getItem('pf-theme'); if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme); } catch (e) { /* ignoré */ }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function parseD(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dm(s) { return s.slice(8) + '/' + s.slice(5, 7); }
  function dmNum(n) { var s = String(n); return s.slice(6) + '/' + s.slice(4, 6) + '/' + s.slice(2, 4); }
  function confOf(mx) { return mx >= 0.6 ? 'high' : mx >= 0.45 ? 'mid' : 'low'; }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function curTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /* ------------------------------------------------------------ icônes */
  function svg(path, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var IC = {
    flame: '<path d="M12 3c1 3.5 4.5 5.2 4.5 9.6A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.4c0-1.7.8-2.9 1.8-3.9C9.4 10.9 10.7 11 11 9.6 11.3 7.6 10.6 5.3 12 3z"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    sort: '<path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    fav: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    ticket: '<path d="M4 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h16v-2a2 2 0 0 1 0-4v0a2 2 0 0 0 0-4V6H4z"/><path d="M13 6v12" stroke-dasharray="2 2.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    an: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    info: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
    users: '<circle cx="9" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.6"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15 15.2c3 0 6 1.6 6 4.8"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.2 2.3-1.2 3.7h-4L8.8 9.8zM12 7.5V3.6M15.2 9.8l3.7-1.2M14 13.5l2.3 3.2M10 13.5l-2.3 3.2M8.8 9.8L5.1 8.6"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    bars: '<path d="M5 20V12M12 20V5M19 20v-9"/>',
    scale: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z"/>',
    shield: '<path d="M12 3l7.5 2.8v5.7c0 4.6-3.2 7.6-7.5 9.5-4.3-1.9-7.5-4.9-7.5-9.5V5.8z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    flag: '<path d="M6 21V4M6 4h11l-2.2 4L17 12H6"/>',
    corner: '<path d="M6 21V3M6 4l11 4.5L6 13"/>'
  };
  function mkIcon(name) {
    var k = /Résultat à la mi|Mi-temps/.test(name) ? 'clock' : /^Résultat du match/.test(name) ? 'trophy' : /Double/.test(name) ? 'dice' :
      /Les deux/.test(name) ? 'users' : /Total buts|^Buts de/.test(name) ? 'ball' : /Pair/.test(name) ? 'sliders' : /Tranche/.test(name) ? 'bars' :
      /Handicap/.test(name) ? 'scale' : /Victoire/.test(name) ? 'shield' : /Score exact/.test(name) ? 'target' : /Premier but/.test(name) ? 'flag' :
      /Corners/.test(name) ? 'corner' : 'ball';
    return svg(IC[k]);
  }

  /* ------------------------------------------------------------ écussons aux couleurs des clubs (pas les logos officiels) */
  // [couleur principale, couleur secondaire, motif : s = uni, v = rayures, h = moitié, b = bandeau]
  var TC = {
    'Angers': ['#16161a', '#f4f4f4', 'v'], 'Auxerre': ['#1f5fbf', '#f4f4f4', 's'], 'Brest': ['#d42027', '#f4f4f4', 's'],
    'Le Havre': ['#5aa7e0', '#0c2a5a', 's'], 'Le Mans': ['#f2c200', '#d42027', 'v'], 'Lens': ['#e8b10d', '#d42027', 'v'],
    'Lille': ['#d42027', '#1a2a5c', 's'], 'Lorient': ['#f58220', '#16161a', 's'], 'Lyon': ['#1b3a8a', '#d42027', 'h'],
    'Marseille': ['#2aa6e0', '#f4f4f4', 's'], 'Monaco': ['#d42027', '#f4f4f4', 'h'], 'Nice': ['#d42027', '#16161a', 'v'],
    'Paris FC': ['#1a3a8a', '#f4f4f4', 's'], 'Paris SG': ['#0b2a66', '#d42027', 'b'], 'Rennes': ['#d42027', '#16161a', 's'],
    'Strasbourg': ['#1a6ed8', '#f4f4f4', 's'], 'Toulouse': ['#6d2a8c', '#f4f4f4', 's'], 'Troyes': ['#1a4fb8', '#f4f4f4', 's'],
    'Arsenal': ['#d42027', '#f4f4f4', 's'], 'Aston Villa': ['#7b1e3c', '#8ac3f0', 'h'], 'Bournemouth': ['#d42027', '#16161a', 'v'],
    'Brentford': ['#d42027', '#f4f4f4', 'v'], 'Brighton': ['#1a66c4', '#f4f4f4', 'v'], 'Chelsea': ['#0a3c8c', '#f4f4f4', 's'],
    'Coventry': ['#63b5e5', '#f4f4f4', 's'], 'Crystal Palace': ['#1b4fa0', '#d42027', 'v'], 'Everton': ['#1a3fa8', '#f4f4f4', 's'],
    'Fulham': ['#16161a', '#f4f4f4', 'b'], 'Hull': ['#f5a000', '#16161a', 'v'], 'Ipswich': ['#1a4fb8', '#f4f4f4', 's'],
    'Leeds': ['#1d428a', '#ffcc00', 's'], 'Liverpool': ['#c8102e', '#f4f4f4', 's'], 'Man City': ['#6cabdd', '#f4f4f4', 's'],
    'Man United': ['#da291c', '#fbe122', 's'], 'Newcastle': ['#16161a', '#f4f4f4', 'v'], "Nott'm Forest": ['#d42027', '#f4f4f4', 's'],
    'Sunderland': ['#d42027', '#f4f4f4', 'v'], 'Tottenham': ['#132257', '#f4f4f4', 's'],
    'Alaves': ['#1a4fb8', '#f4f4f4', 'v'], 'Ath Bilbao': ['#d42027', '#f4f4f4', 'v'], 'Ath Madrid': ['#d42027', '#1a3a8a', 'v'],
    'Barcelona': ['#a50044', '#004d98', 'v'], 'Betis': ['#0bb363', '#f4f4f4', 'v'], 'Celta': ['#8ac3f0', '#d42027', 's'],
    'Elche': ['#0a8a3c', '#f4f4f4', 's'], 'Espanol': ['#1a5fb8', '#f4f4f4', 'v'], 'Getafe': ['#1a4fb8', '#f4f4f4', 's'],
    'La Coruna': ['#1a4fb8', '#f4f4f4', 'v'], 'Levante': ['#1a3a8a', '#d42027', 'v'], 'Malaga': ['#1a6ed8', '#f4f4f4', 'v'],
    'Osasuna': ['#d42027', '#0a2a66', 's'], 'Real Madrid': ['#e9edf5', '#febe10', 's'], 'Santander': ['#0a8a3c', '#f4f4f4', 'v'],
    'Sevilla': ['#f1f1f1', '#d42027', 'b'], 'Sociedad': ['#1a5fb8', '#f4f4f4', 'v'], 'Valencia': ['#f4f4f4', '#ff8a00', 's'],
    'Vallecano': ['#f4f4f4', '#d42027', 'b'], 'Villarreal': ['#f7d117', '#0a4fa0', 's'],
    'Augsburg': ['#d42027', '#0a7a3a', 'v'], 'Bayern Munich': ['#dc052d', '#0066b2', 's'], 'Dortmund': ['#fde100', '#16161a', 's'],
    'Ein Frankfurt': ['#16161a', '#d42027', 'v'], 'Elversberg': ['#16161a', '#f4f4f4', 's'], 'FC Koln': ['#f4f4f4', '#d42027', 's'],
    'Freiburg': ['#d42027', '#16161a', 's'], 'Hamburg': ['#1a4fb8', '#f4f4f4', 's'], 'Hoffenheim': ['#1a66c4', '#f4f4f4', 's'],
    'Leverkusen': ['#e32221', '#16161a', 's'], "M'gladbach": ['#0a8a3c', '#16161a', 'v'], 'Mainz': ['#d42027', '#f4f4f4', 's'],
    'Paderborn': ['#1a4fb8', '#16161a', 'v'], 'RB Leipzig': ['#d42027', '#f4f4f4', 's'], 'Schalke 04': ['#004d9d', '#f4f4f4', 's'],
    'Stuttgart': ['#f4f4f4', '#d42027', 'b'], 'Union Berlin': ['#d42027', '#f4f4f4', 's'], 'Werder Bremen': ['#1d9a4a', '#f4f4f4', 's'],
    'Atalanta': ['#1a3a8a', '#16161a', 'v'], 'Bologna': ['#1a3a8a', '#d42027', 'v'], 'Cagliari': ['#a50a2a', '#0a2a66', 'v'],
    'Como': ['#1a4fb8', '#f4f4f4', 's'], 'Fiorentina': ['#6d2a8c', '#f4f4f4', 's'], 'Frosinone': ['#f7d117', '#1a4fb8', 's'],
    'Genoa': ['#a50a2a', '#0a2a66', 'h'], 'Inter': ['#0a2a66', '#16161a', 'v'], 'Juventus': ['#f4f4f4', '#16161a', 'v'],
    'Lazio': ['#8ac3f0', '#f4f4f4', 's'], 'Lecce': ['#f7d117', '#d42027', 'v'], 'Milan': ['#d42027', '#16161a', 'v'],
    'Monza': ['#d42027', '#f4f4f4', 's'], 'Napoli': ['#2aa6e0', '#f4f4f4', 's'], 'Parma': ['#f7d117', '#1a4fb8', 'v'],
    'Roma': ['#8c1d2c', '#f7a600', 's'], 'Sassuolo': ['#0a8a3c', '#16161a', 'v'], 'Torino': ['#7b1e3c', '#f4f4f4', 's'],
    'Udinese': ['#f4f4f4', '#16161a', 'v'], 'Venezia': ['#16161a', '#0a8a3c', 'h'],
    'Birmingham': ['#1a4fb8', '#f4f4f4', 's'], 'Blackburn': ['#1a6ed8', '#f4f4f4', 'h'], 'Bolton': ['#f4f4f4', '#1a3a8a', 's'],
    'Bristol City': ['#d42027', '#f4f4f4', 's'], 'Burnley': ['#7b1e3c', '#8ac3f0', 's'], 'Cardiff': ['#1a4fb8', '#f4f4f4', 's'],
    'Charlton': ['#d42027', '#f4f4f4', 's'], 'Derby': ['#f4f4f4', '#16161a', 's'], 'Lincoln': ['#d42027', '#f4f4f4', 'v'],
    'Middlesbrough': ['#d42027', '#f4f4f4', 's'], 'Millwall': ['#1a3a8a', '#f4f4f4', 's'], 'Norwich': ['#f7d117', '#0a8a3c', 's'],
    'Portsmouth': ['#1a4fb8', '#f4f4f4', 's'], 'Preston': ['#f4f4f4', '#1a3a8a', 's'], 'QPR': ['#1a66c4', '#f4f4f4', 'v'],
    'Sheffield United': ['#d42027', '#f4f4f4', 'v'], 'Southampton': ['#d42027', '#f4f4f4', 'v'], 'Stoke': ['#d42027', '#f4f4f4', 'v'],
    'Swansea': ['#f4f4f4', '#16161a', 's'], 'Watford': ['#f7d117', '#d42027', 's'], 'West Brom': ['#1a3a8a', '#f4f4f4', 'v'],
    'West Ham': ['#7b1e3c', '#1a9ad8', 's'], 'Wolves': ['#fdb913', '#16161a', 's'], 'Wrexham': ['#d42027', '#f4f4f4', 's']
  };
  var SKIP = { fc: 1, ac: 1, as: 1, sc: 1, cf: 1, afc: 1, rc: 1, de: 1 };
  function initials(name) {
    var words = name.replace(/[^A-Za-zÀ-ÿ0-9' ]/g, '').split(' ').filter(function (w) { return w && !SKIP[w.toLowerCase()]; });
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || name).slice(0, 2)).toUpperCase();
  }
  var cid = 0;
  function crest(name, big) {
    var t = TC[name];
    if (!t) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; t = ['hsl(' + h + ',52%,38%)', '#f4f4f4', 's']; }
    var c1 = t[0], c2 = t[1], p = t[2], id = 'cp' + (cid++), body = '';
    if (p === 'v') { for (var k = 0; k < 5; k++) body += '<rect x="' + (4 + k * 5.6) + '" y="0" width="5.7" height="44" fill="' + (k % 2 ? c2 : c1) + '"/>'; }
    else if (p === 'h') body = '<rect x="0" y="0" width="18" height="44" fill="' + c1 + '"/><rect x="18" y="0" width="18" height="44" fill="' + c2 + '"/>';
    else if (p === 'b') body = '<rect width="36" height="44" fill="' + c1 + '"/><rect x="0" y="15" width="36" height="9" fill="' + c2 + '"/>';
    else body = '<rect width="36" height="44" fill="' + c1 + '"/><rect width="36" height="7" fill="' + c2 + '" opacity=".92"/>';
    var shield = 'M4 3h28v19c0 9-7 15-14 18C11 37 4 31 4 22z';
    return '<svg class="cr' + (big ? ' big' : '') + '" viewBox="0 0 36 43" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + shield + '"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')">' + body + '<path d="M4 3h28v9H4z" fill="#fff" opacity=".12"/></g>' +
      '<path d="' + shield + '" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/>' +
      '<text x="18" y="25.5" text-anchor="middle" class="ci">' + esc(initials(name)) + '</text></svg>';
  }
  function tn(name) { return '<span class="tn">' + crest(name) + '<em>' + esc(name) + '</em></span>'; }
  function miniBar(p) {
    return '<div class="mb"><i class="h" style="width:' + p[0] * 100 + '%"></i><i class="d" style="width:' + p[1] * 100 + '%"></i><i class="a" style="width:' + p[2] * 100 + '%"></i></div>';
  }
  function gauge(p, conf) {
    var r = 26, c = 2 * Math.PI * r;
    return '<svg class="gauge ' + conf + '" viewBox="0 0 64 64" role="img" aria-label="' + pct(p) + '"><circle cx="32" cy="32" r="' + r + '" class="gt"/>' +
      '<circle cx="32" cy="32" r="' + r + '" class="gv" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
      '<text x="32" y="37" text-anchor="middle">' + Math.round(p * 100) + '%</text></svg>';
  }

  var LMETA = { F1: ['France', '#2f6bdc', '🇫🇷'], E0: ['Angleterre', '#7c45e0', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
                SP1: ['Espagne', '#e2522f', '🇪🇸'], D1: ['Allemagne', '#d6383a', '🇩🇪'],
                I1: ['Italie', '#1d9d8f', '🇮🇹'], E1: ['Angleterre', '#8a5bd0', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'] };
  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
    '<circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".6"/><circle cx="16" cy="16" r="2.6" fill="var(--amber)"/></svg>';

  D.fixtures.forEach(function (f, i) {                // confiance de chaque match : probabilité du favori (1X2, validé)
    var M = Engine.families(f.div, f.home, f.away);
    f.i = i; f.p = M.p1x2; f.fav = Math.max.apply(null, f.p); f.favIdx = f.p.indexOf(f.fav); f.conf = confOf(f.fav);
    f.key = norm(f.home + ' ' + f.away + ' ' + D.leagues[f.div].name);
  });
  function favName(f) { return [f.home, 'Match nul', f.away][f.favIdx]; }
  function kickoff(f) {
    var p = f.date.split('-'), t = (f.time || '00:00').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]);
  }
  function countdown(f) {                                   // « Dans 2 j 5 h », « Dans 3 h 20 », « En cours »
    var ms = kickoff(f) - new Date();
    if (ms < -2 * 3600 * 1000) return 'Terminé';
    if (ms < 0) return 'En cours';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    return d > 0 ? 'Dans ' + d + ' j ' + h + ' h' : h > 0 ? 'Dans ' + h + ' h ' + (mi < 10 ? '0' : '') + mi : 'Dans ' + mi + ' min';
  }

  /* ------------------------------------------------------------ accueil */
  function confIcon(conf) { return conf === 'high' ? svg(IC.flame) : conf === 'mid' ? svg(IC.bolt) : svg(IC.chev); }
  function fcard(f) {
    return '<div class="fcard ' + f.conf + '"><div class="lg">' + esc(D.leagues[f.div].name) + ' · ' + dm(f.date) + (f.time ? ' · ' + f.time : '') +
      '<span class="cd">' + svg(IC.clock) + countdown(f) + '</span></div>' +
      '<div class="duel"><div class="s">' + crest(f.home, true) + '<b>' + esc(f.home) + '</b></div><span class="vsp">VS</span>' +
      '<div class="s">' + crest(f.away, true) + '<b>' + esc(f.away) + '</b></div></div>' + miniBar(f.p) +
      '<div class="cfp ' + f.conf + '">' + confIcon(f.conf) + CONF[f.conf] + '</div>' +
      '<div class="pf">' + esc(favName(f)) + ' <b>' + pct(f.fav) + '</b></div>' +
      '<button class="voir wide ' + f.conf + '" data-open="' + f.i + '">Voir le pronostic ' + svg(IC.chev) + '</button></div>';
  }
  function row(f, multi) {
    var on = !!favs[f.id];
    return '<div class="mrow ' + f.conf + '"><div class="tm">' + (f.time || '–') + (multi ? '<small>' + dm(f.date) + '</small>' : '') +
      '<button class="star' + (on ? ' on' : '') + '" data-fav="' + f.i + '" aria-label="Favori">' + (on ? '★' : '☆') + '</button></div>' +
      '<div class="tt">' + tn(f.home) + tn(f.away) + '</div>' +
      '<div class="act"><span class="cfp ' + f.conf + '">' + pct(f.fav) + ' · ' + CONF[f.conf] + '</span>' +
      '<button class="voir ' + f.conf + '" data-open="' + f.i + '">' + (f.conf === 'low' ? '' : confIcon(f.conf)) + 'Voir' + svg(IC.chev) + '</button></div>' + miniBar(f.p) + '</div>';
  }
  function filtered() {
    var q = norm(st.q.trim());
    return D.fixtures.filter(function (f) {
      return (st.day === 'all' || f.date === st.day) &&
        (st.filter === 'all' || (st.filter === 'high' && f.conf === 'high') || (st.filter === 'fav' && favs[f.id])) &&
        (!q || f.key.indexOf(q) >= 0);
    });
  }
  function listHTML() {
    var list = filtered();
    if (!list.length) return '<div class="empty">Aucun match pour ce filtre.</div>';
    var h = '';
    D.order.forEach(function (div) {
      var sub = list.filter(function (f) { return f.div === div; });
      if (!sub.length) return;
      if (st.sort === 'conf') sub = sub.slice().sort(function (a, b) { return b.fav - a.fav; });
      var lm = LMETA[div] || ['', '#4f8cff', ''];
      h += '<div class="lgh"><span class="lb" style="--lc:' + lm[1] + '">' + lm[2] + '</span><div class="ln">' + esc(D.leagues[div].name) +
        '<small>' + lm[0] + '</small></div><span class="cnt">' + sub.length + '</span></div>';
      h += sub.map(function (f) { return row(f, st.day === 'all'); }).join('');
    });
    return h;
  }
  function brand() {
    var dark = curTheme() === 'dark';
    return '<div class="brand"><div class="logo">' + LOGO + '</div><div class="bt"><h1>Pronostics football</h1><small>Mis à jour le ' + esc(D.generated) + '</small></div>' +
      '<button class="ibtn" data-toggle-theme aria-label="Changer de thème">' + svg(dark ? IC.sun : IC.moon) + '</button></div>';
  }
  function homeHTML() {
    var fx = D.fixtures, days = [];
    fx.forEach(function (f) { if (days.indexOf(f.date) < 0) days.push(f.date); });
    days.sort();
    var h = brand();
    if (!fx.length) {
      return h + '<div class="empty">Aucun match à venir dans les prochains jours pour les championnats suivis. ' +
        'Utilise l’onglet <b>Analyser</b> pour étudier n’importe quelle affiche.</div>';
    }
    var nHigh = fx.filter(function (f) { return f.conf === 'high'; }).length;
    var avg = fx.reduce(function (s, f) { return s + f.fav; }, 0) / fx.length;
    h += '<div class="pulse"><div><b data-n="' + fx.length + '">' + fx.length + '</b><span>matchs analysés</span></div><div class="hi"><b data-n="' + nHigh + '">' + nHigh +
      '</b><span>haute confiance</span></div><div><b data-n="' + Math.round(avg * 100) + '" data-s="%">' + pct(avg) + '</b><span>favori en moyenne</span></div></div>';
    h += '<div class="chips"><button class="chip' + (st.day === 'all' ? ' on' : '') + '" data-day="all">Tous<b>' + fx.length + ' matchs</b></button>';
    days.forEach(function (d) {
      h += '<button class="chip' + (st.day === d ? ' on' : '') + '" data-day="' + d + '">' + WD[parseD(d).getDay()] + '<b>' + dm(d) + '</b></button>';
    });
    h += '</div>';
    var top = fx.slice().sort(function (a, b) { return b.fav - a.fav; }).slice(0, 6);
    h += '<div class="stitle">Les sélections les plus fortes</div><div class="car">' + top.map(fcard).join('') + '</div>';
    h += '<div class="tools"><label class="search">' + svg(IC.search) + '<input id="q" type="search" placeholder="Chercher une équipe" autocomplete="off" value="' + esc(st.q) + '"></label>' +
      '<button class="sortb" data-sort>' + svg(IC.sort) + (st.sort === 'conf' ? 'Confiance' : 'Heure') + '</button></div>';
    h += '<div class="chips">' + [['all', 'Tous'], ['high', 'Haute confiance'], ['fav', '★ Favoris']].map(function (x) {
      return '<button class="chip pill' + (st.filter === x[0] ? ' on' : '') + '" data-filter="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    return h + '<div id="list">' + listHTML() + '</div>';
  }

  function favsHTML() {
    var list = D.fixtures.filter(function (f) { return favs[f.id]; });
    var h = '<div class="top"><h1>Mes favoris</h1></div>';
    if (!list.length) {
      return h + '<div class="empty">Aucun favori pour l’instant. Touche l’étoile ☆ à côté d’un match dans l’onglet Découvrir pour le retrouver ici.</div>';
    }
    list.sort(function (a, b) { return kickoff(a) - kickoff(b); });
    return h + '<div class="sub">' + list.length + ' match' + (list.length > 1 ? 's' : '') + ' suivi' + (list.length > 1 ? 's' : '') + ', dans l’ordre des coups d’envoi.</div>' +
      list.map(function (f) { return '<div class="cdl">' + esc(D.leagues[f.div].name) + ' · ' + countdown(f) + '</div>' + row(f, true); }).join('');
  }
  function ticketProb() { return ticket.reduce(function (p, t) { return p * t.p; }, 1); }
  function ticketHTML() {
    var h = '<div class="top"><h1>Mon combiné</h1></div>';
    if (!ticket.length) {
      return h + '<div class="empty">Ton combiné est vide. Dans une fiche match, ouvre un marché et touche le <b>+</b> d’une sélection pour l’ajouter. ' +
        'Tu verras la probabilité réelle que <b>toutes</b> tes sélections passent.</div>';
    }
    var cum = 1, groups = {}, dup = 0;
    var rows = ticket.map(function (t, i) {
      cum *= t.p;
      var g = t.k.split('|').slice(0, 3).join('|');
      if (groups[g]) dup++; groups[g] = 1;
      return '<div class="tkrow"><div class="tkn">' + (i + 1) + '</div><div class="tkb"><div class="tkm">' + esc(t.mt) + '</div><div class="tks">' + esc(t.s) +
        ' <span class="tkp">' + pct(t.p) + '</span></div><div class="tkc"><i style="width:' + Math.max(2, Math.round(cum * 100)) + '%"></i></div>' +
        '<div class="tkd">Probabilité cumulée : ' + pct(cum) + '</div></div><button class="rm" data-rm="' + i + '" aria-label="Retirer">' + svg(IC.x) + '</button></div>';
    }).join('');
    var P = ticketProb(), avg = Math.pow(P, 1 / ticket.length);
    h += '<div class="main ' + (P >= 0.5 ? 'high' : P >= 0.25 ? 'mid' : 'low') + '"><div class="k"><small>Probabilité que tout passe</small></div>' +
      '<div class="hero"><div><div class="hl">' + ticket.length + ' sélection' + (ticket.length > 1 ? 's' : '') + '</div><div class="hn">' + pct(P) + '</div></div>' +
      gauge(Math.min(P, 1), P >= 0.5 ? 'high' : P >= 0.25 ? 'mid' : 'low') + '</div>' +
      line('Cote juste du combiné', P > 0.0005 ? (1 / P).toFixed(2) : '—') + line('Probabilité moyenne par sélection', pct(avg)) + '</div>';
    h += '<div class="sub">Même avec des sélections à ' + pct(avg) + ', la probabilité fond vite : à ' + (ticket.length + 1) + ' sélections il ne resterait que ' +
      pct(P * avg) + '. Un bookmaker applique sa marge à chaque sélection, donc la cote d’un combiné est encore moins favorable que la cote juste.</div>';
    if (dup) h += '<div class="sub warn">' + (dup + 1) + ' sélections viennent d’un même match : elles sont liées entre elles, donc le produit des probabilités n’est qu’une approximation.</div>';
    return h + '<div class="sec"><span class="dot g"></span>Sélections</div>' + rows +
      '<button class="voir low wide" data-clear style="margin-top:12px">Vider le combiné</button>';
  }

  /* ------------------------------------------------------------ fiche match */
  function line(a, b) { return '<div class="mline"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>'; }
  function alt(s, best, d, m) {
    var p = s[1], k = tkKey(d, m, s[0]), on = inTicket(k);
    return '<div class="alt' + (best ? ' best' : '') + '"><span>' + esc(s[0]) + '</span><span class="p">' + pct(p) + '</span>' +
      '<button class="add' + (on ? ' on' : '') + '" data-add="' + esc(k) + '" data-p="' + p.toFixed(4) + '" data-mt="' + esc(d.home + ' – ' + d.away) +
      '" data-m="' + esc(m) + '" data-s="' + esc(s[0]) + '" aria-label="' + (on ? 'Retirer du combiné' : 'Ajouter au combiné') + '">' + svg(on ? IC.check : IC.plus) + '</button>' +
      '<span class="c">' + (p > 0.005 ? 'cote juste ' + (1 / p).toFixed(2) : 'très improbable') + '</span>' +
      '<div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div></div>';
  }
  function mkRow(cls, d) {
    return function (x) {
      return '<details class="mk"><summary><span class="mi ' + cls + '">' + mkIcon(x.m) + '</span><span class="mt">' + esc(x.m) +
        (x.v ? '' : ' <span class="warn" title="Marché non validé par backtest">⚠</span>') +
        '</span><span class="pk ' + cls + '">' + esc(x.s) + ' · ' + pct(x.p) + '</span></summary><div class="alts">' +
        x.f.sels.map(function (s) { return alt(s, s[0] === x.s, d, x.m); }).join('') + '</div></details>';
    };
  }
  function predHTML(d, f) {
    var M = Engine.families(d.div, d.home, d.away), C = Engine.classify(M.fams), p = M.p1x2;
    var mx = Math.max.apply(null, p), fi = p.indexOf(mx), conf = confOf(mx), names = [d.home, 'Match nul', d.away];
    var tg = M.over25 >= 0.5 ? ['Plus de 2,5', M.over25] : ['Moins de 2,5', 1 - M.over25];
    var bt = M.btts >= 0.5 ? ['Oui', M.btts] : ['Non', 1 - M.btts];
    var h = '<div class="main ' + conf + '"><div class="k"><small>Pronostic principal</small><span class="badge ' + conf + '">' + confIcon(conf) + CONF[conf] + '</span></div>' +
      '<div class="hero"><div><div class="hl">Résultat du match</div><div class="hn">' + esc(names[fi]) + '</div></div>' + gauge(mx, conf) + '</div>' +
      line('Nombre de buts', tg[0] + ' · ' + pct(tg[1])) +
      line('Les deux équipes marquent', bt[0] + ' · ' + pct(bt[1])) +
      '<div class="b3"><i class="h" style="width:' + p[0] * 100 + '%"></i><i class="d" style="width:' + p[1] * 100 + '%"></i><i class="a" style="width:' + p[2] * 100 + '%"></i></div>' +
      '<div class="l3"><span class="h">1 · ' + pct(p[0]) + '</span><span class="d">X · ' + pct(p[1]) + '</span><span class="a">2 · ' + pct(p[2]) + '</span></div></div>';
    h += '<div class="sub">Buts attendus ' + M.lh.toFixed(2) + ' – ' + M.la.toFixed(2) + ' · corners ~' + M.corners.toFixed(1) +
      (f && f.mk ? '<br>Bookmaker (1X2, sans marge) : ' + pct(f.mk[0]) + ' / ' + pct(f.mk[1]) + ' / ' + pct(f.mk[2]) : '') + '</div>';
    var unk = [d.home, d.away].filter(function (t) { return !Engine.known(d.div, t); });
    if (unk.length) h += '<div class="sub warn">Pas d’historique pour ' + esc(unk.join(', ')) + ' : estimation peu fiable.</div>';
    h += compareHTML(M, d) + heatHTML(M, d);
    h += '<div class="sec"><span class="dot g"></span>Pronostics sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
      (C.safe.length ? C.safe.map(mkRow('g', d)).join('') : '<div class="empty">Aucun pronostic n’atteint ce seuil.</div>');
    h += '<div class="sec"><span class="dot a"></span>Moins sûrs</div>' + C.less.map(mkRow('a', d)).join('');
    h += '<div class="sub" style="margin-top:14px">Touche un marché pour voir toutes les sélections et leur cote juste. ' +
      '⚠ = marché non validé par backtest. Voir l’onglet Fiabilité.</div>';
    return h;
  }
  function pts5(div, team) {
    var ms = lastM(div, team, 5), s = 0;
    ms.forEach(function (r) { var gf = r[2] === team ? r[4] : r[5], ga = r[2] === team ? r[5] : r[4]; s += gf > ga ? 3 : gf === ga ? 1 : 0; });
    return ms.length ? s : null;
  }
  function cmpRow(label, a, b, fmt) {
    var tot = a + b, pa = tot > 0 ? Math.round(a / tot * 100) : 50;
    return '<div class="cmp"><div class="cv l">' + fmt(a) + '</div><div class="cm"><span>' + label + '</span><div class="cb"><i class="l" style="width:' + pa +
      '%"></i><i class="r" style="width:' + (100 - pa) + '%"></i></div></div><div class="cv r">' + fmt(b) + '</div></div>';
  }
  function compareHTML(M, d) {
    var t = D.leagues[d.div].g.t, ta = t[d.home] || [0, 0], tb = t[d.away] || [0, 0];
    var f2 = function (x) { return x.toFixed(2); }, f1 = function (x) { return x.toFixed(1); }, r0 = function (x) { return String(Math.round(x)); };
    var rows = cmpRow('Buts attendus', M.lh, M.la, f2) + cmpRow('Corners attendus', M.ch, M.ca, f1) +
      cmpRow('Attaque', 100 * Math.exp(ta[0]), 100 * Math.exp(tb[0]), r0) + cmpRow('Défense', 100 * Math.exp(ta[1]), 100 * Math.exp(tb[1]), r0);
    var fa = pts5(d.div, d.home), fb = pts5(d.div, d.away);
    if (fa !== null && fb !== null) rows += cmpRow('Forme (points sur 15)', fa, fb, r0);
    return '<div class="sec"><span class="dot g"></span>Comparatif <small>100 = moyenne du championnat</small></div><div class="cmpbox">' +
      '<div class="cmph"><span class="tn">' + crest(d.home) + '<em>' + esc(d.home) + '</em></span><span class="tn r"><em>' + esc(d.away) + '</em>' + crest(d.away) + '</span></div>' + rows + '</div>';
  }
  function heatHTML(M, d) {
    var g = M.grid, n = 6, max = 0, bi = 0, bj = 0, i, j;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (g[i][j] > max) { max = g[i][j]; bi = i; bj = j; }
    var h = '<div class="sec"><span class="dot a"></span>Scores les plus probables</div><div class="heatbox"><div class="hcap">Lignes : buts de ' + esc(d.home) +
      ' · colonnes : buts de ' + esc(d.away) + '</div><table class="heat"><tr><th></th>';
    for (j = 0; j < n; j++) h += '<th>' + j + '</th>';
    h += '</tr>';
    for (i = 0; i < n; i++) {
      h += '<tr><th>' + i + '</th>';
      for (j = 0; j < n; j++) {
        var p = g[i][j];
        h += '<td class="' + (i === bi && j === bj ? 'top' : '') + '" style="--i:' + (p / max).toFixed(3) + '">' + (p >= 0.02 ? Math.round(p * 100) + '%' : '·') + '</td>';
      }
      h += '</tr>';
    }
    return h + '</table><div class="hcap">Le plus probable : ' + bi + '-' + bj + ' (' + pct(max) + ')</div></div>';
  }
  function shareText(d, f) {
    var M = Engine.families(d.div, d.home, d.away), C = Engine.classify(M.fams), p = M.p1x2, mx = Math.max.apply(null, p), fi = p.indexOf(mx);
    var lines = [d.home + ' – ' + d.away + ' (' + D.leagues[d.div].name + (f ? ', ' + dm(f.date) + (f.time ? ' ' + f.time : '') : '') + ')',
      'Favori : ' + [d.home, 'Match nul', d.away][fi] + ' ' + pct(mx) + ' (' + CONF[confOf(mx)] + ')',
      'Buts attendus ' + M.lh.toFixed(2) + ' – ' + M.la.toFixed(2)];
    C.safe.slice(0, 4).forEach(function (x) { lines.push('✔ ' + x.s + ' (' + pct(x.p) + ')'); });
    lines.push('Analyse statistique indicative, pas un conseil de pari.');
    return lines.join('\n');
  }
  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 1500);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
  }
  function showSheet(text) {                              // repli : texte sélectionnable si le presse-papiers est refusé
    var el = document.createElement('div');
    el.className = 'sheet';
    el.innerHTML = '<div class="box"><b>Copie le texte ci-dessous</b><textarea readonly rows="7"></textarea><button class="voir high wide">Fermer</button></div>';
    el.querySelector('textarea').value = text;
    el.addEventListener('click', function (e) { if (e.target === el || e.target.tagName === 'BUTTON') document.body.removeChild(el); });
    document.body.appendChild(el);
    var ta = el.querySelector('textarea'); ta.focus(); ta.select();
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) toast('Pronostic copié'); else showSheet(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('Pronostic copié'); }, fallback);
    else fallback();
  }
  function countUp() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    [].forEach.call(document.querySelectorAll('.pulse b[data-n]'), function (el) {
      var end = +el.getAttribute('data-n'), suf = el.getAttribute('data-s') || '', t0 = performance.now();
      function step(t) {
        var k = Math.min(1, (t - t0) / 700);
        el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + suf;
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }
  function lastM(div, team, n) {
    var out = [];
    for (var i = D.hist.length - 1; i >= 0 && out.length < n; i--) {
      var r = D.hist[i];
      if (r[0] === div && (r[2] === team || r[3] === team)) out.push(r);
    }
    return out;
  }
  function h2h(div, a, b, n) {
    var out = [];
    for (var i = D.hist.length - 1; i >= 0 && out.length < n; i--) {
      var r = D.hist[i];
      if (r[0] === div && ((r[2] === a && r[3] === b) || (r[2] === b && r[3] === a))) out.push(r);
    }
    return out;
  }
  function matchLine(r) { return '<div class="ml"><span>' + dmNum(r[1]) + '</span><span>' + esc(r[2]) + ' ' + r[4] + '-' + r[5] + ' ' + esc(r[3]) + '</span></div>'; }
  function formBlock(div, team) {
    var ms = lastM(div, team, 5);
    if (!ms.length) return '<div class="fm"><h4>' + esc(team) + '</h4><div class="sub">Pas de matchs dans les données.</div></div>';
    var dots = ms.map(function (r) {
      var gf = r[2] === team ? r[4] : r[5], ga = r[2] === team ? r[5] : r[4];
      return '<i class="' + (gf > ga ? 'V' : gf === ga ? 'N' : 'D') + '">' + (gf > ga ? 'V' : gf === ga ? 'N' : 'D') + '</i>';
    }).join('');
    return '<div class="fm"><h4><span class="tn">' + crest(team) + '<em>' + esc(team) + '</em></span><span class="dots">' + dots + '</span></h4>' + ms.map(matchLine).join('') + '</div>';
  }
  function formHTML(d) {
    var hh = h2h(d.div, d.home, d.away, 5);
    return formBlock(d.div, d.home) + formBlock(d.div, d.away) +
      '<div class="fm"><h4>Confrontations directes</h4>' + (hh.length ? hh.map(matchLine).join('') : '<div class="sub">Aucune confrontation dans les données (depuis 2021/22).</div>') + '</div>';
  }
  function detailBody(d, f) {
    return '<div class="tabs"><button data-dtab="pred" class="' + (st.dtab === 'pred' ? 'on' : '') + '">Prédictions</button>' +
      '<button data-dtab="form" class="' + (st.dtab === 'form' ? 'on' : '') + '">Forme &amp; H2H</button></div>' +
      (st.dtab === 'pred' ? predHTML(d, f) : formHTML(d));
  }
  function vsBlock(d) {
    var lm = LMETA[d.div] || ['', '#4f8cff', ''];
    return '<div class="vs"><div class="side">' + crest(d.home, true) + '<b>' + esc(d.home) + '</b></div><div class="mid"><span class="vsp">VS</span></div>' +
      '<div class="side">' + crest(d.away, true) + '<b>' + esc(d.away) + '</b></div></div>';
  }
  function detailPage(d) {
    var f = d.fi != null ? D.fixtures[d.fi] : null, lm = LMETA[d.div] || ['', '#4f8cff', ''];
    return '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<div class="who"><span class="lgchip">' + lm[2] + ' ' + esc(D.leagues[d.div].name) + '</span><small>' +
      (f ? dm(f.date) + (f.time ? ' · ' + f.time : '') + ' · ' + countdown(f) : '') + '</small></div>' +
      '<button class="ibtn" data-share aria-label="Partager ce pronostic">' + svg(IC.share) + '</button></div>' +
      vsBlock(d) + detailBody(d, f);
  }

  /* ------------------------------------------------------------ analyse libre */
  function options(list, sel) { return list.map(function (t, i) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(''); }
  function anHTML() {
    var L = D.leagues[st.an.div], t = L.teams;
    var h = '<div class="top"><h1>Analyser un match</h1></div><div class="pick2">' +
      '<label class="full">Championnat<select id="an-div">' + options(D.order.map(function (k) { return D.leagues[k].name; }), D.order.indexOf(st.an.div)) + '</select></label>' +
      '<label>Domicile<select id="an-h">' + options(t, st.an.h) + '</select></label>' +
      '<label>Extérieur<select id="an-a">' + options(t, st.an.a) + '</select></label></div>';
    if (st.an.h === st.an.a) return h + '<div class="empty">Choisis deux équipes différentes.</div>';
    var dd = { div: st.an.div, home: t[st.an.h], away: t[st.an.a] };
    return h + vsBlock(dd) + detailBody(dd, null);
  }

  /* ------------------------------------------------------------ navigation */
  function renderNav() {
    var items = [['home', 'Découvrir'], ['fav', 'Favoris'], ['an', 'Analyser'], ['info', 'Fiabilité']];
    nav.innerHTML = '<div class="in">' + items.map(function (x) {
      return '<button data-tab="' + x[0] + '" class="' + (!st.detail && st.tab === x[0] ? 'on' : '') + '">' + svg(IC[x[0]]) + '<span>' + x[1] + '</span></button>';
    }).join('') + '</div>';
  }
  function render() {
    if (st.detail) app.innerHTML = detailPage(st.detail);
    else if (st.tab === 'home') app.innerHTML = homeHTML();
    else if (st.tab === 'an') app.innerHTML = anHTML();
    else if (st.tab === 'fav') app.innerHTML = favsHTML();
    else if (st.tab === 'ticket') app.innerHTML = ticketHTML();
    else app.innerHTML = '<div id="info">' + document.getElementById('info-html').innerHTML + '</div>';
    renderNav();
    var fab = document.getElementById('fab');
    if (!fab) { fab = document.createElement('button'); fab.id = 'fab'; fab.setAttribute('data-ticket', ''); document.body.appendChild(fab); }
    fab.className = 'fab' + (ticket.length && st.tab !== 'ticket' ? '' : ' hide');
    fab.innerHTML = svg(IC.ticket) + '<span>Combiné · ' + ticket.length + ' · ' + pct(ticketProb()) + '</span>';
    if (!st.detail && st.tab === 'home') countUp();
  }
  function closeDetail() { st.detail = null; render(); window.scrollTo(0, st.scroll); }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-day],[data-filter],[data-fav],[data-back],[data-dtab],[data-sort],[data-toggle-theme],[data-share],[data-add],[data-rm],[data-clear]');
    if (!t) return;
    if (t.hasAttribute('data-open')) {
      var f = D.fixtures[+t.getAttribute('data-open')];
      st.scroll = window.scrollY; st.detail = { div: f.div, home: f.home, away: f.away, fi: f.i }; st.dtab = 'pred';
      try { history.pushState({ d: 1 }, ''); st.pushed = true; } catch (err) { st.pushed = false; }
      render(); window.scrollTo(0, 0);
    } else if (t.hasAttribute('data-back')) {
      if (st.pushed) { st.pushed = false; try { history.back(); return; } catch (err) { /* repli ci-dessous */ } }
      closeDetail();
    } else if (t.hasAttribute('data-day')) { st.day = t.getAttribute('data-day'); render(); }
    else if (t.hasAttribute('data-filter')) { st.filter = t.getAttribute('data-filter'); render(); }
    else if (t.hasAttribute('data-sort')) { st.sort = st.sort === 'time' ? 'conf' : 'time'; render(); }
    else if (t.hasAttribute('data-toggle-theme')) {
      var next = curTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('pf-theme', next); } catch (err) { /* ignoré */ }
      render();
    }
    else if (t.hasAttribute('data-add')) {
      var key = t.getAttribute('data-add'), at = -1;
      ticket.forEach(function (x, i) { if (x.k === key) at = i; });
      if (at >= 0) ticket.splice(at, 1);
      else ticket.push({ k: key, p: +t.getAttribute('data-p'), mt: t.getAttribute('data-mt'), m: t.getAttribute('data-m'), s: t.getAttribute('data-s') });
      saveTicket();
      var y = window.scrollY; render(); window.scrollTo(0, y);
    }
    else if (t.hasAttribute('data-rm')) { ticket.splice(+t.getAttribute('data-rm'), 1); saveTicket(); render(); }
    else if (t.hasAttribute('data-clear')) { ticket = []; saveTicket(); render(); }
    else if (t.hasAttribute('data-share')) { copyText(shareText(st.detail, st.detail.fi != null ? D.fixtures[st.detail.fi] : null)); }
    else if (t.hasAttribute('data-dtab')) { st.dtab = t.getAttribute('data-dtab'); render(); }
    else if (t.hasAttribute('data-fav')) {
      var g = D.fixtures[+t.getAttribute('data-fav')];
      if (favs[g.id]) delete favs[g.id]; else favs[g.id] = 1;
      saveFavs(); render();
    }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    st.q = e.target.value;
    var box = document.getElementById('list');
    if (box) box.innerHTML = listHTML();                 // on ne refait que la liste pour garder le clavier ouvert
  });
  app.addEventListener('change', function (e) {
    var id = e.target.id, v = +e.target.value;
    if (id === 'an-div') { st.an = { div: D.order[v], h: 0, a: 1 }; }
    else if (id === 'an-h') st.an.h = v;
    else if (id === 'an-a') st.an.a = v;
    else return;
    render();
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-ticket]')) { st.tab = 'ticket'; st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0); }
  });
  nav.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]');
    if (!t) return;
    st.tab = t.getAttribute('data-tab'); st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0);
  });
  window.addEventListener('popstate', function () { if (st.detail) { st.pushed = false; closeDetail(); } });

  render();
})();
