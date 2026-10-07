/* Interface : accueil par dates, fiche match, analyse libre, fiabilité. Les marchés viennent de Engine (engine.js). */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('data').textContent);
  Engine.setData(D);
  var SAFE = D.safeMin, app = document.getElementById('app'), nav = document.getElementById('nav');
  var CONF = { high: 'Haute confiance', mid: 'Confiance moyenne', low: 'Match ouvert' };
  var WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var st = { sport: 'foot', tab: 'home', day: 'all', filter: 'all', q: '', sort: 'time', tn: { day: 'all', tour: 'all', unk: false }, detail: null, dtab: 'pred', pushed: false, scroll: 0,
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
    today: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>',
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
    bets: '<rect x="3.5" y="6" width="17" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/><path d="M7 9.5v.01M17 14.5v.01"/>',
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
    var k = /Résultat à la mi|Mi-temps/.test(name) ? 'clock' : /^Résultat du match|^Vainqueur/.test(name) ? 'trophy' : /Double/.test(name) ? 'dice' :
      /Les deux/.test(name) ? 'users' : /Total buts|^Buts de/.test(name) ? 'ball' : /Total sets|Total points/.test(name) ? 'bars' : /Pair/.test(name) ? 'sliders' : /Tranche/.test(name) ? 'bars' :
      /Handicap/.test(name) ? 'scale' : /Victoire/.test(name) ? 'shield' : /Score exact|Score en sets/.test(name) ? 'target' : /Premier but/.test(name) ? 'flag' :
      /Corners/.test(name) ? 'corner' : 'ball';
    return svg(IC[k]);
  }

  /* ------------------------------------------------------------ écussons aux couleurs des clubs (pas les logos officiels) */
  // [couleur principale, couleur secondaire, motif : s = uni, v = rayures, h = moitié, b = bandeau]
  var TC = {
    'Athletico-PR': ['#c8102e', '#16161a', 'v'], 'Atletico-MG': ['#16161a', '#f4f4f4', 'v'], 'Bahia': ['#1a4fb8', '#d42027', 'b'],
    'Botafogo RJ': ['#16161a', '#f4f4f4', 'v'], 'Bragantino': ['#d42027', '#f4f4f4', 's'], 'Chapecoense-SC': ['#0a8a3c', '#f4f4f4', 's'],
    'Corinthians': ['#16161a', '#f4f4f4', 's'], 'Coritiba': ['#0a8a3c', '#f4f4f4', 's'], 'Cruzeiro': ['#1a4fb8', '#f4f4f4', 's'],
    'Flamengo RJ': ['#d42027', '#16161a', 'b'], 'Fluminense': ['#0a7a3a', '#8c1d2c', 'v'], 'Gremio': ['#1a8ad8', '#16161a', 'v'],
    'Internacional': ['#d42027', '#f4f4f4', 's'], 'Mirassol': ['#f7d117', '#0a8a3c', 's'], 'Palmeiras': ['#0a7a3a', '#f4f4f4', 's'],
    'Remo': ['#1a3a8a', '#f4f4f4', 'v'], 'Santos': ['#f4f4f4', '#16161a', 's'], 'Sao Paulo': ['#d42027', '#16161a', 'b'],
    'Vasco': ['#16161a', '#f4f4f4', 'b'], 'Vitoria': ['#d42027', '#16161a', 'v'],
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
  var PFLAG = {};                                         // drapeaux des joueurs de tennis (code pays ESPN)
  function logoUrl(p) { return p.indexOf('http') === 0 ? p : 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + p + '&w=96&h=96'; }
  function crest(name, big) {
    var lg = (D.logos && D.logos[name]) || PFLAG[name];
    if (lg) return '<span class="crl' + (big ? ' big' : '') + '"><img src="' + logoUrl(lg) + '" alt="" loading="lazy" onerror="this.parentNode.className+=\' nolg\'">' + crestSvg(name, big) + '</span>';
    return crestSvg(name, big);
  }
  function crestSvg(name, big) {
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

  var LMETA = { BRA: ['Brésil', '#1fa84f', '\uD83C\uDDE7\uD83C\uDDF7'], F1: ['France', '#2f6bdc', '🇫🇷'], E0: ['Angleterre', '#7c45e0', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
                SP1: ['Espagne', '#e2522f', '🇪🇸'], D1: ['Allemagne', '#d6383a', '🇩🇪'],
                I1: ['Italie', '#1d9d8f', '🇮🇹'], E1: ['Angleterre', '#8a5bd0', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
                F2: ['France', '#3b7ae0', '🇫🇷'], D2: ['Allemagne', '#c9444a', '🇩🇪'], I2: ['Italie', '#2aa597', '🇮🇹'], SP2: ['Espagne', '#d9703c', '🇪🇸'], N1: ['Pays-Bas', '#e08a2f', '🇳🇱'], B1: ['Belgique', '#c2a12c', '🇧🇪'], P1: ['Portugal', '#2f9e5a', '🇵🇹'], T1: ['Turquie', '#d6383a', '🇹🇷'], G1: ['Grèce', '#3a86c8', '🇬🇷'], SC0: ['Écosse', '#3a5fc8', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'], USA: ['États-Unis', '#4a5fb8', '🇺🇸'], MEX: ['Mexique', '#2f8f5a', '🇲🇽'], ARG: ['Argentine', '#5aa9d6', '🇦🇷'], JPN: ['Japon', '#d64a6a', '🇯🇵'], NOR: ['Norvège', '#c0392b', '🇳🇴'], SWE: ['Suède', '#3a7bc8', '🇸🇪'], DNK: ['Danemark', '#c8453a', '🇩🇰'], POL: ['Pologne', '#c94a5a', '🇵🇱'], ROU: ['Roumanie', '#d0a02c', '🇷🇴'], SWZ: ['Suisse', '#d64040', '🇨🇭'], FIN: ['Finlande', '#3a74b8', '🇫🇮'], IRL: ['Irlande', '#2f9a63', '🇮🇪'] };
  function lmeta(div) { if (LMETA[div]) return LMETA[div]; var l = D.leagues[div] || {}; return [l.ctry || '', '#4f8cff', l.flag || '']; }
  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
    '<circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".6"/><circle cx="16" cy="16" r="2.6" fill="var(--amber)"/></svg>';

  (function () {                                       // la fiche match ne montre que les marchés proposés par les bookmakers activés (books.js)
    var raw = Engine.families;
    Engine.families = function () { var M = raw.apply(Engine, arguments); M.fams = M.fams.filter(Books.has); return M; };
  })();
  D.ext = (D.ext || []).filter(function (e) { return e.date >= parisToday(); });      // on n'affiche pas la liste d'hier tant que celle d'aujourd'hui n'est pas arrivée
  D.ext.forEach(function (e, i) { e.i = i; e.fav = Math.max.apply(null, e.p); e.favIdx = e.p.indexOf(e.fav); e.conf = confOf(e.fav); });
  D.fixtures.forEach(function (f, i) {                // confiance de chaque match : probabilité du favori (1X2, validé)
    var M = Engine.families(f.div, f.home, f.away, f.ov);
    f.i = i; f.p = M.p1x2; f.fav = Math.max.apply(null, f.p); f.favIdx = f.p.indexOf(f.fav); f.conf = confOf(f.fav);
    f.key = norm(f.home + ' ' + f.away + ' ' + cpName(f));
  });
  function cpName(f) { return f.cp || D.leagues[f.div].name; }                  // vraie compétition (Ligue des Nations, qualifications…) pour les championnats regroupés
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
    return '<div class="fcard ' + f.conf + '"><div class="lg">' + esc(cpName(f)) + ' · ' + dm(f.date) + (f.time ? ' · ' + f.time : '') +
      '<span class="cd">' + svg(IC.clock) + countdown(f) + '</span></div>' +
      '<div class="duel"><div class="s' + (f.favIdx === 0 && f.fav >= 0.5 ? ' fv' : '') + '">' + crest(f.home, true) + '<b>' + esc(f.home) + '</b></div><span class="vsp">VS</span>' +
      '<div class="s' + (f.favIdx === 2 && f.fav >= 0.5 ? ' fv' : '') + '">' + crest(f.away, true) + '<b>' + esc(f.away) + '</b></div></div>' + miniBar(f.p) +
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
      var lm = lmeta(div);
      h += '<div class="lgh"><span class="lb" style="--lc:' + lm[1] + '">' + lm[2] + '</span><div class="ln">' + esc(D.leagues[div].name) +
        '<small>' + lm[0] + '</small></div><span class="cnt">' + sub.length + '</span></div>';
      h += sub.map(function (f) { return row(f, st.day === 'all'); }).join('');
    });
    return h;
  }
  var SPORTS = [['foot', '⚽', 'Football'], ['tennis', '🎾', 'Tennis'], ['basket', '🏀', 'Basketball'], ['baseball', '⚾', 'Baseball'], ['nfl', '🏈', 'Football américain'],
    ['f1', '🏁', 'Formule 1'], ['golf', '⛳', 'Golf'], ['handball', '🤾', 'Handball'], ['hockey', '🏒', 'Hockey sur glace'], ['mma', '🥋', 'MMA'],
    ['rugby15', '🏉', 'Rugby à XV'], ['volley', '🏐', 'Volley-ball']];
  function sportsBar() {
    return '<div class="sports">' + SPORTS.map(function (x) {
      return '<button class="sp' + (st.sport === x[0] ? ' on' : '') + '" data-sport="' + x[0] + '"><span class="se">' + x[1] + '</span>' + esc(x[2]) + '</button>';
    }).join('') + '</div>';
  }
  function soonHTML() {
    var x = SPORTS.filter(function (y) { return y[0] === st.sport; })[0];
    return brand() + sportsBar() + '<div class="empty"><div class="soon">' + x[1] + '</div><b>' + esc(x[2]) + ' : bientôt disponible.</b><br>' +
      'Chaque sport demande son propre modèle et son propre test de fiabilité avant d’afficher des pronostics. Je ne publie pas de probabilités non vérifiées. ' +
      'Le <b>tennis</b> est le prochain sur la liste.</div>';
  }
  function brand() {
    var dark = curTheme() === 'dark', S = spOf(st.sport), key = S ? S.cfg.key : st.sport === 'tennis' ? 'tennis' : st.sport === 'f1' ? 'f1' : st.sport === 'golf' ? 'golf' : null;
    var title = S ? S.cfg.title : st.sport === 'tennis' ? 'tennis' : st.sport === 'f1' ? 'Formule 1' : st.sport === 'golf' ? 'golf' : 'football', gen = key && D[key] && D[key].generated ? D[key].generated : D.generated;
    return '<div class="brand"><div class="logo">' + LOGO + '</div><div class="bt"><h1>Pronostics ' + title + '</h1><small>Mis à jour le ' + esc(gen) + '</small></div>' +
      '<button class="ibtn" data-toggle-theme aria-label="Changer de thème">' + svg(dark ? IC.sun : IC.moon) + '</button></div>' +
      (st.sport === 'foot' && !S ? Books.bar(st.bkopen) : '');
  }
  function pastDates() {                                    // dates des matchs terminés récents (la plus récente d'abord)
    var seen = {}, out = [];
    D.recent.forEach(function (m) { if (!seen[m.date]) { seen[m.date] = 1; out.push(m.date); } });
    return out.sort().reverse();
  }
  function pastLabel(d) {
    var y = new Date(); y.setDate(y.getDate() - 1);
    var ys = y.getFullYear() + '-' + ('0' + (y.getMonth() + 1)).slice(-2) + '-' + ('0' + y.getDate()).slice(-2);
    return d === ys ? 'Hier' : WD[parseD(d).getDay()];
  }
  function pickRow(p) {
    return '<div class="pr ' + (p.h ? 'ok' : 'ko') + '"><span class="mk2">' + svg(p.h ? IC.check : IC.x) + '</span><span class="pt">' + esc(p.s) +
      (p.v ? '' : ' <span class="warn" title="Marché non validé par backtest">⚠</span>') + '</span><span class="pp">' + pct(p.p) + '</span></div>';
  }
  function resCard(m) {
    var sc = m.res.split('-'), safe = m.picks.filter(function (p) { return p.t === 0; }), less = m.picks.filter(function (p) { return p.t !== 0; });
    var sw = safe.filter(function (p) { return p.h; }).length, lw = less.filter(function (p) { return p.h; }).length;
    var lm = lmeta(m.div), gh = +sc[0], ga = +sc[1], out = !safe.length ? 'none' : sw === safe.length ? 'ok' : sw === 0 ? 'ko' : 'mix';
    var dots = safe.map(function (p) { return '<i class="rd-' + (p.h ? 'ok' : 'ko') + '"></i>'; }).join('');
    return '<div class="rc rc-' + out + '"><div class="rh"><span class="lgchip">' + lm[2] + ' ' + esc(D.leagues[m.div].name) + '</span>' +
      (safe.length ? '<span class="rbadge rb-' + out + '">' + (out === 'ok' ? '✓' : out === 'ko' ? '✗' : '≈') + ' ' + sw + '/' + safe.length + ' sûrs<span class="rdots">' + dots + '</span></span>' : '') + '<small>' + esc(m.time || '') + '</small></div>' +
      '<div class="rsc"><div class="s' + (gh > ga ? ' win' : gh < ga ? ' lose' : '') + '">' + crest(m.home, true) + '<b>' + esc(m.home) + '</b></div><div class="score"><span class="' + (gh > ga ? 'w' : '') + '">' + esc(sc[0] || '?') + '</span><i>–</i><span class="' + (ga > gh ? 'w' : '') + '">' + esc(sc[1] || '?') + '</span>' +
      '</div><div class="s' + (ga > gh ? ' win' : ga < gh ? ' lose' : '') + '">' + crest(m.away, true) + '<b>' + esc(m.away) + '</b></div></div>' +
      '<div class="sec sm"><span class="dot g"></span>Pronostics sûrs <small>' + sw + ' / ' + safe.length + ' gagnés</small></div>' +
      (safe.map(pickRow).join('') || '<div class="sub">Aucun pronostic sûr sur ce match.</div>') +
      (less.length ? '<details class="rd"><summary>Moins sûrs <small>' + lw + ' / ' + less.length + ' gagnés</small></summary>' + less.map(pickRow).join('') + '</details>' : '') + '</div>';
  }
  function pastHTML(d) {
    var ms = D.recent.filter(function (m) { return m.date === d; });
    if (!ms.length) return '<div class="empty">Aucun résultat pour cette date.</div>';
    var cs = [0, 0], cl = [0, 0];
    ms.forEach(function (m) { m.picks.forEach(function (p) { var k = p.t === 0 ? cs : cl; k[0]++; if (p.h) k[1]++; }); });
    var sp = cs[0] ? cs[1] / cs[0] : 0, conf = sp >= 0.7 ? 'high' : sp >= 0.5 ? 'mid' : 'low';
    var h = '<div class="main ' + conf + '"><div class="k"><small>Bilan du ' + dm(d) + '</small></div><div class="hero"><div><div class="hl">Pronostics sûrs gagnés</div><div class="hn">' +
      cs[1] + ' / ' + cs[0] + '</div></div>' + (cs[0] ? gauge(sp, conf) : '') + '</div>' +
      line('Moins sûrs gagnés', cl[1] + ' / ' + cl[0]) + line('Matchs terminés', String(ms.length)) + '</div>';
    h += '<div class="sub">« Sûr » veut dire probabilité annoncée d’au moins 70 %, soit environ 3 sur 4 attendus. Un jour isolé ne prouve rien dans un sens ou dans l’autre : ' +
      'le modèle se juge sur des centaines de pronostics (onglet Fiabilité).</div>';
    D.order.forEach(function (div) {
      var sub = ms.filter(function (m) { return m.div === div; });
      if (!sub.length) return;
      var lm = lmeta(div);
      h += '<div class="lgh"><span class="lb" style="--lc:' + lm[1] + '">' + lm[2] + '</span><div class="ln">' + esc(D.leagues[div].name) + '<small>' + lm[0] +
        '</small></div><span class="cnt">' + sub.length + '</span></div>' + sub.map(resCard).join('');
    });
    return h;
  }
  function isoDate(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function mondayOf(ds) { var d = parseD(ds); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function streakInfo() {                                   // jours de matchs consécutifs où au moins 70 % des pronostics sûrs sont passés
    var rows = D.daily.filter(function (r) { return r.sn > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var run = 0, best = 0;
    rows.forEach(function (r) { if (r.sw / r.sn >= SAFE) { run++; if (run > best) best = run; } else run = 0; });
    return { cur: run, best: best, days: rows.length };
  }
  function weekHTML() {
    var today = D.today || isoDate(new Date()), mon = mondayOf(today), label = 'Cette semaine';
    var lo = isoDate(mon), hi = today;                      // jusqu'à hier : les résultats du jour ne sont pas encore connus
    var rows = D.daily.filter(function (r) { return r.date >= lo && r.date < hi; });
    if (!rows.length) {
      var pm = new Date(mon); pm.setDate(pm.getDate() - 7);
      lo = isoDate(pm); hi = isoDate(mon); label = 'Semaine dernière';
      rows = D.daily.filter(function (r) { return r.date >= lo && r.date < hi; });
    }
    var t = { ms: 0, sn: 0, sw: 0, ln: 0, lw: 0 };
    rows.forEach(function (r) { t.ms += r.ms; t.sn += r.sn; t.sw += r.sw; t.ln += r.ln; t.lw += r.lw; });
    var sp = t.sn ? t.sw / t.sn : 0, conf = sp >= SAFE ? 'high' : sp >= 0.5 ? 'mid' : 'low';
    var h = '';
    if (rows.length) {
      h += '<div class="main ' + conf + '"><div class="k"><small>' + label + '</small></div><div class="hero"><div><div class="hl">Pronostics sûrs gagnés</div><div class="hn">' +
        t.sw + ' / ' + t.sn + '</div></div>' + gauge(sp, conf) + '</div>' +
        line('Moins sûrs gagnés', t.lw + ' / ' + t.ln) + line('Matchs terminés', String(t.ms)) + line('Jours de matchs', String(rows.length)) + '</div>';
      h += '<div class="sec"><span class="dot g"></span>Jour par jour <small>trait = seuil de ' + Math.round(SAFE * 100) + ' %</small></div><div class="wkbox">' +
        rows.map(function (r) {
          var p = r.sn ? r.sw / r.sn : 0;
          return '<div class="wd"><span class="wl">' + WD[parseD(r.date).getDay()] + ' ' + dm(r.date) + '</span><div class="wb"><i class="' + (p >= SAFE ? 'ok' : 'lo') +
            '" style="width:' + Math.round(p * 100) + '%"></i><u style="left:' + Math.round(SAFE * 100) + '%"></u></div><span class="wp">' + pct(p) + ' <small>' + r.sw + '/' + r.sn + '</small></span></div>';
        }).join('') + '</div>';
    } else {
      h += '<div class="empty">Pas encore de résultat pour ' + label.toLowerCase() + '. Les pronostics sont vérifiés le lendemain de chaque match.</div>';
    }
    var s = streakInfo();
    h += '<div class="sec"><span class="dot a"></span>Série en cours</div><div class="streak ' + (s.cur ? 'on' : '') + '"><div class="sv">' + s.cur + '</div><div class="st"><b>' +
      (s.cur ? (s.cur > 1 ? 'jours de suite' : 'jour') + ' à ' + Math.round(SAFE * 100) + ' % ou plus' : 'Pas de série en cours') + '</b><span>' +
      (s.cur ? 'de pronostics sûrs gagnés, en jours de matchs consécutifs.' : 'Le dernier jour de matchs est passé sous ' + Math.round(SAFE * 100) + ' %.') +
      '</span><small>Record : ' + s.best + ' · sur ' + s.days + ' jour' + (s.days > 1 ? 's' : '') + ' de matchs suivis</small></div></div>';
    h += '<div class="sub" style="margin-top:12px">Un jour isolé ne dit pas grand-chose : le modèle annonce environ 78 % de réussite sur les pronostics sûrs, donc une journée à 60 % ou à 90 % peut arriver par hasard. ' +
      'La série et la semaine servent surtout à suivre la tendance.</div>';
    return h;
  }
  function extRow(e) {
    var fn = [e.home, 'Nul', e.away][e.favIdx];
    return '<div class="mrow ' + e.conf + ' ext"><div class="tm">' + esc(e.time) + '<small>' + countdown(e) + '</small></div>' +
      '<div class="tt">' + tn(e.home) + tn(e.away) + '</div>' +
      '<div class="act"><span class="cfp ' + e.conf + '">' + pct(e.fav) + ' · ' + esc(fn) + '</span>' +
      '<button class="voir ' + e.conf + '" data-openext="' + e.i + '">Voir' + svg(IC.chev) + '</button></div>' + miniBar(e.p) + '</div>';
  }
  function extHTML() {
    var h = '<div class="srcnote"><b>Autres compétitions du jour</b> (équipes nationales, coupes, amicaux…). Ces prédictions viennent d’<b>API-Football</b>, un modèle différent du nôtre : ' +
      'elles ne sont <b>pas testées</b> par nos backtests et restent indicatives.</div>';
    var groups = [], idx = {};
    D.ext.forEach(function (e) {
      var k = e.lg + '|' + e.country;
      if (!(k in idx)) { idx[k] = groups.length; groups.push({ lg: e.lg, country: e.country, items: [] }); }
      groups[idx[k]].items.push(e);
    });
    groups.forEach(function (g) {
      h += '<div class="lgh"><span class="lb" style="--lc:#5a93ff">' + svg(IC.trophy) + '</span><div class="ln">' + esc(g.lg) + '<small>' + esc(g.country) +
        '</small></div><span class="cnt">' + g.items.length + '</span></div>' + g.items.map(extRow).join('');
    });
    return h;
  }
  function extPage(i) {
    var e = D.ext[i], names = [e.home, 'Match nul', e.away], mx = e.fav, conf = e.conf, p = e.p;
    var h = '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<div class="who"><span class="lgchip">' + esc(e.lg) + '</span><small>' + dm(e.date) + ' · ' + esc(e.time) + ' · ' + countdown(e) + '</small></div></div>' +
      vsBlock({ home: e.home, away: e.away });
    h += '<div class="srcnote">Source : <b>API-Football</b> (modèle différent du nôtre, non testé). À prendre comme une indication, pas comme un pronostic validé.</div>';
    h += '<div class="main ' + conf + '"><div class="k"><small>Prédiction API-Football</small><span class="badge ' + conf + '">' + confIcon(conf) + CONF[conf] + '</span></div>' +
      '<div class="hero"><div><div class="hl">Résultat le plus probable</div><div class="hn">' + esc(names[e.favIdx]) + '</div></div>' + gauge(mx, conf) + '</div>' +
      (e.advice ? line('Conseil', e.advice) : '') + (e.uo ? line('Buts', e.uo) : '') +
      '<div class="b3"><i class="h" style="width:' + p[0] * 100 + '%"></i><i class="d" style="width:' + p[1] * 100 + '%"></i><i class="a" style="width:' + p[2] * 100 + '%"></i></div>' +
      '<div class="l3"><span class="h">1 · ' + pct(p[0]) + '</span><span class="d">X · ' + pct(p[1]) + '</span><span class="a">2 · ' + pct(p[2]) + '</span></div></div>';
    var labels = { form: 'Forme', att: 'Attaque', def: 'Défense', h2h: 'Confrontations', total: 'Indice global' }, rows = '';
    Object.keys(labels).forEach(function (k) {
      var c = e.cmp[k]; if (c && c[0] !== null && c[1] !== null) rows += cmpRow(labels[k], c[0] * 100, c[1] * 100, function (x) { return Math.round(x) + '%'; });
    });
    if (rows) h += '<div class="sec"><span class="dot g"></span>Comparatif <small>source API-Football</small></div><div class="cmpbox"><div class="cmph"><span class="tn">' + crest(e.home) +
      '<em>' + esc(e.home) + '</em></span><span class="tn r"><em>' + esc(e.away) + '</em>' + crest(e.away) + '</span></div>' + rows + '</div>';
    if (e.h2h && e.h2h.length) h += '<div class="fm"><h4>Dernières confrontations</h4>' + e.h2h.map(function (m) {
      return '<div class="ml"><span>' + esc(m[0].slice(8) + '/' + m[0].slice(5, 7) + '/' + m[0].slice(2, 4)) + '</span><span>' + esc(m[1]) + '</span></div>'; }).join('') + '</div>';
    return h;
  }


  /* ------------------------------------------------------------ bilan global : résultats vus par cet appareil, tous sports */
  var LEDGER = { v: 2, s: {}, k: [], t: 0 };
  try { var rawL = JSON.parse(localStorage.getItem('pf-ledger') || 'null'); if (rawL && rawL.v === 2) LEDGER = rawL; } catch (e) { /* ignoré */ }
  function ledgerSave() { try { localStorage.setItem('pf-ledger', JSON.stringify(LEDGER)); } catch (e) { /* stockage indisponible */ } }
  function pickKey(sid, q, home, away) {                  // « famille · sélection sans nom d'équipe », propre à chaque sport
    var sel = String(q.s).split(home).join('').split(away).join('').replace(/^[\s-]+|[\s-]+$/g, '');
    return sid + '|' + q.m + (sel ? ' · ' + sel : '');
  }
  function ledgerRecord(sid, items) {
    var cut = isoDate(new Date(Date.now() - 45 * 864e5)), box = LEDGER.s[sid] || (LEDGER.s[sid] = {}), changed = false;
    items.forEach(function (m) {
      if (m.state !== 'post' || m.hit == null || m.date < cut) return;
      var sw = 0, sn = 0, lw = 0, ln = 0, picks = [], home = m.home || m.a, away = m.away || m.b;
      (m.picks || []).forEach(function (q) {
        if (q.t === 0) { sn++; if (q.h) sw++; } else { ln++; if (q.h) lw++; }
        if (q.p >= 0.5) {
          var k = pickKey(sid, q, home, away), i = LEDGER.k.indexOf(k);
          if (i < 0) { i = LEDGER.k.length; LEDGER.k.push(k); }
          picks.push([i, q.h ? 1 : 0, Math.round(q.p * 100)]);
        }
      });
      var row = [m.date, sw, sn, lw, ln, m.hit ? 1 : 0, picks], old = box[m.id];
      if (!old || JSON.stringify(old) !== JSON.stringify(row)) { box[m.id] = row; changed = true; }
    });
    Object.keys(box).forEach(function (k) { if (box[k][0] < cut) { delete box[k]; changed = true; } });
    if (changed) ledgerSave();
  }
  var BILAN_SPORTS = [['tennis', '🎾', 'Tennis'], ['basket', '🏀', 'Basket'], ['rugby15', '🏉', 'Rugby à XV'], ['handball', '🤾', 'Handball'], ['hockey', '🏒', 'Hockey'],
    ['baseball', '⚾', 'Baseball'], ['nfl', '🏈', 'Football américain'], ['mma', '🥋', 'MMA'], ['volley', '🏐', 'Volley-ball']];
  var bilanBusy = false, bilanMsg = '';
  function bilanRefreshAll(done) {                        // charge chaque sport, récupère les derniers résultats et les enregistre
    if (bilanBusy) return;
    bilanBusy = true;
    var ids = BILAN_SPORTS.map(function (x) { return x[0]; }), i = 0;
    function next() {
      if (i >= ids.length) { bilanBusy = false; bilanMsg = ''; LEDGER.t = Date.now(); ledgerSave(); if (done) done(); return; }
      var sid = ids[i++], S = spOf(sid), key = S ? S.cfg.key : sid;
      bilanMsg = 'Mise à jour… ' + i + '/' + ids.length;
      if (st.tab === 'info' && !st.detail) render();
      loadLazy(key, function () {
        var fin = function () { setTimeout(next, 150); };
        if (S) { spInit(S); spLive(S, fin); }
        else { setTM(D.tennis.matches || []); liveTennis(fin); }
      });
    }
    next();
  }
  var SPORT_ICON = { foot: '⚽', tennis: '🎾', basket: '🏀', rugby15: '🏉', handball: '🤾', hockey: '🏒', baseball: '⚾', nfl: '🏈', mma: '🥋', volley: '🏐' };
  function diagRows(lo, minN) {                           // pronostics regroupés par type de sélection, tous sports
    var agg = {};
    var add = function (k, n, w, sp) { var a = agg[k] || (agg[k] = { n: 0, w: 0, p: 0 }); a.n += n; a.w += w; a.p += sp; };
    (D.mk || []).forEach(function (r) { if (r[0] >= lo) add('foot|' + r[1], r[2], r[3], r[4]); });
    Object.keys(LEDGER.s).forEach(function (sid) {
      var box = LEDGER.s[sid];
      Object.keys(box).forEach(function (id) {
        var r = box[id];
        if (r[0] < lo) return;
        (r[6] || []).forEach(function (q) { add(LEDGER.k[q[0]], 1, q[1], q[2] / 100); });
      });
    });
    return Object.keys(agg).filter(function (k) { return agg[k].n >= minN; }).map(function (k) {
      var a = agg[k], sid = k.split('|')[0], lbl = k.slice(sid.length + 1);
      return { label: (SPORT_ICON[sid] || '') + ' ' + lbl, n: a.n, rate: a.w / a.n, said: a.p / a.n, w: a.w };
    });
  }
  function diagLine(r) {
    var gap = r.rate - r.said;
    return '<div class="pr ' + (gap >= 0 ? 'ok' : r.rate < 0.5 ? 'ko' : '') + '"><span class="pt">' + esc(r.label) + '<small class="sm">annoncé ' + pct(r.said) + ' · ' + r.w + '/' + r.n + '</small></span><span class="pp">' + pct(r.rate) + '</span></div>';
  }
  function diagHTML(lo7) {
    var h = '', all = diagRows(isoDate(new Date(Date.now() - 45 * 864e5)), 1);
    var week = diagRows(lo7, 5).sort(function (a, b) { return b.rate - a.rate || b.n - a.n; });
    var long = diagRows(isoDate(new Date(Date.now() - 45 * 864e5)), 15);
    var best = long.slice().sort(function (a, b) { return b.rate - a.rate || b.n - a.n; }).filter(function (r) { return r.rate >= 0.7; }).slice(0, 6);
    var weak = long.slice().sort(function (a, b) { return (a.rate - a.said) - (b.rate - b.said); }).filter(function (r) { return r.rate - r.said < -0.05; }).slice(0, 4);
    var nAll = all.reduce(function (s0, r) { return s0 + r.n; }, 0), wAll = all.reduce(function (s0, r) { return s0 + r.w; }, 0), pAll = all.reduce(function (s0, r) { return s0 + r.said * r.n; }, 0);
    h += '<h2>Diagnostic : est-ce que ça marche ?</h2>';
    if (nAll < 30) return h + '<div class="empty">Pas encore assez de pronostics vérifiés (' + nAll + '). Le diagnostic apparaît après quelques jours de résultats.</div>';
    h += '<div class="srcnote">Sur <b>' + nAll + ' pronostics vérifiés</b> (45 derniers jours, tous sports) : annoncés en moyenne à <b>' + pct(pAll / nAll) + '</b>, réussis à <b>' + pct(wAll / nAll) + '</b>. ' +
      (wAll / nAll >= pAll / nAll - 0.03 ? 'Le modèle tient ses promesses.' : 'Le modèle est un peu trop optimiste.') + '</div>';
    if (week.length) h += '<div class="sec"><span class="dot g"></span>Cette semaine <small>types de pronostics avec au moins 5 résultats</small></div><div class="fm">' + week.slice(0, 8).map(diagLine).join('') + '</div>';
    if (best.length) h += '<div class="sec"><span class="dot g"></span>Ce qui marche le mieux <small>45 jours, au moins 15 résultats</small></div><div class="fm">' + best.map(diagLine).join('') + '</div>';
    if (weak.length) h += '<div class="sec"><span class="dot a"></span>À surveiller <small>réussite sous l’annonce</small></div><div class="fm">' + weak.map(diagLine).join('') + '</div>';
    return h;
  }
  function cmpHTML() {
    var rows = (D.cmp || []).filter(function (r) { return r[2] >= 30; });
    if (!rows.length) return '';
    var h = '<h2>Par compétition</h2><div class="srcnote">Pronostics sûrs rejoués sur la dernière saison (le modèle ne voit que le passé) : <b>annoncé</b> contre <b>réussi</b>. ' +
      'Triés du moins bon au meilleur écart ; vert = le modèle tient ou dépasse sa promesse. Le football ajoute entre parenthèses le suivi réel du site.</div><div class="fm">';
    rows.forEach(function (r) {
      var gap = r[4] - r[3];
      h += '<div class="pr ' + (gap >= -0.01 ? 'ok' : gap < -0.06 ? 'ko' : '') + '"><span class="pt">' + r[0] + ' ' + esc(r[1]) + '<small class="sm">annoncé ' + pct(r[3]) + ' · ' + r[2] + ' pronostics' +
        (r[5] >= 10 ? ' · réel ' + pct(r[6]) + ' sur ' + r[5] : '') + '</small></span><span class="pp">' + pct(r[4]) + '</span></div>';
    });
    return h + '</div>';
  }
  function xaccHTML() {
    var rows = D.xacc || [];
    if (!rows.length) return '';
    var h = '<h2>Compétitions hors modèle : fiabilité mesurée</h2><div class="srcnote">Chaque match terminé est enregistré avec la probabilité du marché d’avant-match (cotes ESPN) et la prédiction d’API-Football. ' +
      'Colonne « favori juste » : part des matchs où le favori annoncé a bien gagné (un nul compte comme raté). La mesure grandit chaque jour.</div><div class="fm">';
    rows.forEach(function (r) {
      var gap = r[3] - r[2];
      h += '<div class="pr ' + (gap >= -0.02 ? 'ok' : gap < -0.08 ? 'ko' : '') + '"><span class="pt">' + esc(r[0]) + '<small class="sm">' + r[1] + ' matchs · favori annoncé à ' + pct(r[2]) + '</small></span><span class="pp">' + pct(r[3]) + '</span></div>';
    });
    return h + '</div>';
  }
  function bilanHTML() {
    var today = D.today || isoDate(new Date()), lo = isoDate(new Date(Date.now() - 6 * 864e5)), rows = [], tot = { sw: 0, sn: 0, lw: 0, ln: 0, m: 0, h: 0 }, perDay = {};
    var add = function (d, sw, sn, lw, ln) { var o = perDay[d] || (perDay[d] = { sw: 0, sn: 0 }); o.sw += sw; o.sn += sn; };
    var fb = (D.daily || []).filter(function (r) { return r.date >= lo && r.date < today; });
    if (fb.length) {
      var f = { sw: 0, sn: 0, lw: 0, ln: 0, m: 0, h: 0 };
      fb.forEach(function (r) { f.sw += r.sw; f.sn += r.sn; f.lw += r.lw; f.ln += r.ln; f.m += r.ms; add(r.date, r.sw, r.sn); });
      rows.push(['⚽', 'Football', f, true]);
    }
    BILAN_SPORTS.forEach(function (sp) {
      var box = LEDGER.s[sp[0]] || {}, o = { sw: 0, sn: 0, lw: 0, ln: 0, m: 0, h: 0 };
      Object.keys(box).forEach(function (k) {
        var r = box[k];
        if (r[0] < lo) return;
        o.sw += r[1]; o.sn += r[2]; o.lw += r[3]; o.ln += r[4]; o.m++; o.h += r[5]; add(r[0], r[1], r[2]);
      });
      if (o.m) rows.push([sp[1], sp[2], o, false]);
    });
    rows.forEach(function (r) { var o = r[2]; tot.sw += o.sw; tot.sn += o.sn; tot.lw += o.lw; tot.ln += o.ln; tot.m += o.m; tot.h += o.h; });
    var h = '<h2>Bilan des 7 derniers jours · tous sports</h2>';
    if (!rows.length) {
      h += '<div class="empty">Pas encore de résultat enregistré. Touche « Actualiser » : le site va chercher les derniers résultats de chaque sport et les compare à nos pronostics.</div>';
    } else {
      var sp = tot.sn ? tot.sw / tot.sn : 0, conf = sp >= SAFE ? 'high' : sp >= 0.5 ? 'mid' : 'low';
      h += '<div class="main ' + conf + '"><div class="k"><small>Tous sports confondus</small></div><div class="hero"><div><div class="hl">Pronostics sûrs gagnés</div><div class="hn">' + tot.sw + ' / ' + tot.sn +
        '</div></div>' + gauge(sp, conf) + '</div>' + line('Moins sûrs gagnés', tot.lw + ' / ' + tot.ln) + line('Matchs et combats jugés', String(tot.m)) + '</div>';
      h += '<div class="sec"><span class="dot g"></span>Par sport</div><div class="wkbox">' + rows.map(function (r) {
        var o = r[2], pp = o.sn ? o.sw / o.sn : 0;
        return '<div class="wd"><span class="wl">' + r[0] + ' ' + esc(r[1]) + '</span><div class="wb"><i class="' + (pp >= SAFE ? 'ok' : 'lo') + '" style="width:' + Math.round(pp * 100) + '%"></i><u style="left:' + Math.round(SAFE * 100) + '%"></u></div>' +
          '<span class="wp">' + (o.sn ? pct(pp) : '–') + ' <small>' + o.sw + '/' + o.sn + (r[3] || !o.m ? '' : ' · vainqueur ' + o.h + '/' + o.m) + '</small></span></div>'; }).join('') + '</div>';
      var days = Object.keys(perDay).sort();
      if (days.length > 1) h += '<div class="sec"><span class="dot a"></span>Jour par jour</div><div class="wkbox">' + days.map(function (d) {
        var o = perDay[d], pp = o.sn ? o.sw / o.sn : 0;
        return '<div class="wd"><span class="wl">' + WD[parseD(d).getDay()] + ' ' + dm(d) + '</span><div class="wb"><i class="' + (pp >= SAFE ? 'ok' : 'lo') + '" style="width:' + Math.round(pp * 100) + '%"></i><u style="left:' + Math.round(SAFE * 100) + '%"></u></div><span class="wp">' + pct(pp) + ' <small>' + o.sw + '/' + o.sn + '</small></span></div>'; }).join('') + '</div>';
    }
    h += diagHTML(lo);
    h += cmpHTML();
    h += xaccHTML();
    h += '<button class="voir mid wide" data-bilan style="margin:12px 0"' + (bilanBusy ? ' disabled' : '') + '>' + (bilanBusy ? esc(bilanMsg || 'Mise à jour…') : 'Actualiser les résultats de tous les sports') + '</button>';
    h += '<div class="sub">Le football vient du suivi du site (vérifié chaque jour). Les autres sports sont comptés à partir des résultats que <b>cet appareil</b> a pu récupérer en direct : seuls les jours où le site a été ouvert (ou actualisé ici) sont comptés. ' +
      'Un jour ou un sport isolé ne dit pas grand-chose : le modèle annonce environ 75 % de réussite sur les pronostics sûrs.</div>';
    return h;
  }

  /* ------------------------------------------------------------ tennis */
  D.tennis = D.tennis || {};
  var TM = [];
  function setTM(list) {
    TM = list;
    TM.forEach(function (m, i) {
      if (m.fa) PFLAG[m.a] = 'countries/500/' + m.fa.toLowerCase() + '.png';
      if (m.fb) PFLAG[m.b] = 'countries/500/' + m.fb.toLowerCase() + '.png';
      m.i = i; m.fav = Math.max(m.p, 1 - m.p); m.favIdx = m.p >= 0.5 ? 0 : 1; m.conf = m.known ? confOf(m.fav) : 'low'; m.favName = m.favIdx ? m.b : m.a;
      m.key = norm(m.a + ' ' + m.b + ' ' + m.tn);
    });
    ledgerRecord('tennis', TM);
  }
  var tnBusy = false;
  function liveTennis(cb) {                                   // calendrier et résultats ESPN en direct, pronostics calculés dans le navigateur
    if (tnBusy || !D.tennis.model || !window.Tennis || !window.fetch) { if (cb) cb(); return; }
    tnBusy = true;
    Tennis.setModel(D.tennis.model);
    Promise.all(['atp', 'wta'].map(function (f) {
      return fetch('https://site.api.espn.com/apis/site/v2/sports/tennis/' + f + '/scoreboard').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    })).then(function (res) {
      var seen = {}, raws = [], srv = {}, now = new Date(), y = new Date(now.getTime() - 864e5), e = new Date(now.getTime() + 5 * 864e5);
      var lo = Tennis.paris(y.toISOString()).d, hi = Tennis.paris(e.toISOString()).d;
      res.forEach(function (j) { raws = raws.concat(Tennis.parseEspn(j, seen)); });
      TM.forEach(function (m) { srv[m.id] = m; });
      var list = raws.filter(function (r) { return r.d >= lo && r.d <= hi; }).map(function (r) { return Tennis.build(r, srv[r.id]); });
      if (!list.length) return;
      list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
      setTM(list);
      var p = Tennis.paris(now.toISOString());
      D.tennis.generated = p.d.slice(8) + '/' + p.d.slice(5, 7) + '/' + p.d.slice(0, 4) + ' à ' + p.t + ' (direct)';
      if (st.sport === 'tennis' && !st.detail && st.tab === 'home') { var y0 = window.scrollY; render(); window.scrollTo(0, y0); }
    }).catch(function () { /* pas de réseau ou source bloquée : on garde les données de la dernière mise à jour */ })
      .then(function () { tnBusy = false; if (cb) cb(); });
  }
  setInterval(function () { if (st.sport === 'tennis' && document.visibilityState === 'visible') liveTennis(); }, 180000);
  var SURF = { Hard: 'Dur', Clay: 'Terre', Grass: 'Gazon', Carpet: 'Moquette' };
  function last(n) { return n.split(' ').slice(-1)[0]; }
  function tnPlayer(name, flag) { return '<span class="tn">' + crest(name) + '<em>' + esc(name) + '</em>' + (flag ? '<small class="fl">' + esc(flag) + '</small>' : '') + '</span>'; }
  function tnState(m) {
    if (m.state === 'post') return m.retired ? 'Abandon' : 'Terminé';
    if (m.state === 'in') return 'En cours';
    return countdown({ date: m.date, time: m.time });
  }
  function tnRow(m) {
    var res = '';
    if (m.state === 'post') {
      res = '<div class="tres">' + esc((m.sets || []).join('  ')) + (m.win != null ? ' · <b>' + esc(m.win ? m.b : m.a) + '</b>' : '') + '</div>';
    }
    var tag = m.state === 'post' && m.hit != null ? '<span class="cfp ' + (m.hit ? 'high' : 'low') + '">' + svg(m.hit ? IC.check : IC.x) + (m.hit ? 'Bien vu' : 'Raté') + '</span>' :
      m.known ? '<span class="cfp ' + m.conf + '">' + pct(m.fav) + ' · ' + esc(last(m.favName)) + '</span>' : '<span class="cfp low">Peu d’historique</span>';
    return '<div class="mrow ' + m.conf + '"><div class="tm">' + esc(m.time) + '<small>' + (m.state === 'pre' ? dm(m.date) : tnState(m)) + '</small></div>' +
      '<div class="tt">' + tnPlayer(m.a, m.fa) + tnPlayer(m.b, m.fb) + res + '</div>' +
      '<div class="act">' + tag + '<button class="voir ' + m.conf + '" data-tnopen="' + m.i + '">Voir' + svg(IC.chev) + '</button></div>' +
      '<div class="mb"><i class="h" style="width:' + m.p * 100 + '%"></i><i class="a" style="width:' + (1 - m.p) * 100 + '%"></i></div></div>';
  }
  function tnGroups(list) {
    var h = '', seen = {}, order = [];
    list.forEach(function (m) { var k = m.tour + '|' + m.tn; if (!seen[k]) { seen[k] = []; order.push(k); } seen[k].push(m); });
    order.forEach(function (k) {
      var g = seen[k], m0 = g[0];
      h += '<div class="lgh"><span class="lb" style="--lc:' + (m0.tour === 'ATP' ? '#2f6bdc' : '#d6479a') + '">🎾</span><div class="ln">' + esc(m0.tn) +
        '<small>' + m0.tour + ' · ' + esc(SURF[m0.surf] || m0.surf) + (m0.city ? ' · ' + esc(m0.city) : '') + '</small></div><span class="cnt">' + g.length + '</span></div>' + g.map(tnRow).join('');
    });
    return h;
  }
  function tnBilan(list) {
    var done = list.filter(function (m) { return m.state === 'post' && m.hit != null && m.known; });
    var ok = done.filter(function (m) { return m.hit; }).length, sp = 0, sw = 0;
    done.forEach(function (m) { (m.picks || []).forEach(function (p) { if (p.t === 0) { sp++; if (p.h) sw++; } }); });
    return { n: done.length, ok: ok, sp: sp, sw: sw };
  }
  function tennisHTML() {
    var h = brand() + sportsBar();
    if (!TM.length) return h + '<div class="empty">Calendrier tennis indisponible pour le moment. Réessaie un peu plus tard.</div>';
    var T = st.tn, q = norm(st.q.trim());
    var base = TM.filter(function (m) { return (T.tour === 'all' || m.tour === T.tour) && (!q || m.key.indexOf(q) >= 0); });
    var known = base.filter(function (m) { return m.known; }), nUnk = base.length - known.length;
    var shown = T.unk ? base : known;
    var upc = shown.filter(function (m) { return m.state !== 'post'; }), res = shown.filter(function (m) { return m.state === 'post'; });
    var days = [];
    upc.forEach(function (m) { if (days.indexOf(m.date) < 0) days.push(m.date); });
    var b = tnBilan(known), nHigh = known.filter(function (m) { return m.state !== 'post' && m.conf === 'high'; }).length;
    h += '<div class="pulse"><div><b>' + known.filter(function (m) { return m.state !== 'post'; }).length + '</b><span>matchs à venir</span></div><div class="hi"><b>' + nHigh +
      '</b><span>haute confiance</span></div><div><b>' + (b.n ? b.ok + '/' + b.n : '–') + '</b><span>vainqueurs justes</span></div></div>';
    h += '<div class="chips">';
    if (res.length) h += '<button class="chip past' + (T.day === 'res' ? ' on' : '') + '" data-tnday="res">Résultats<b>' + svg(IC.check) + ' ' + res.length + '</b></button>';
    h += '<button class="chip' + (T.day === 'all' ? ' on' : '') + '" data-tnday="all">À venir<b>' + upc.length + ' matchs</b></button>';
    days.forEach(function (d) { h += '<button class="chip' + (T.day === d ? ' on' : '') + '" data-tnday="' + d + '">' + WD[parseD(d).getDay()] + '<b>' + dm(d) + '</b></button>'; });
    h += '</div><div class="tools"><label class="search">' + svg(IC.search) + '<input id="q" type="search" placeholder="Chercher un joueur" autocomplete="off" value="' + esc(st.q) + '"></label></div>';
    h += '<div class="chips">' + [['all', 'Tous'], ['ATP', 'ATP'], ['WTA', 'WTA']].map(function (x) {
      return '<button class="chip pill' + (T.tour === x[0] ? ' on' : '') + '" data-tntour="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
      (nUnk ? '<button class="chip pill' + (T.unk ? ' on' : '') + '" data-tnunk>+ ' + nUnk + ' sans historique</button>' : '') + '</div>';
    if (T.day === 'res') {
      h += '<div class="srcnote"><b>Hier et aujourd’hui</b> : ' + (b.n ? 'vainqueur correct ' + b.ok + '/' + b.n + (b.sp ? ' · pronostics sûrs gagnés ' + b.sw + '/' + b.sp : '') + '. ' : '') +
        'Chaque pronostic est calculé avec les données d’avant le match.</div>';
      return h + (res.length ? tnGroups(res) : '<div class="empty">Aucun résultat pour ce filtre.</div>');
    }
    var list = upc.filter(function (m) { return T.day === 'all' || m.date === T.day; });
    if (!list.length) return h + '<div class="empty">Aucun match à venir pour ce filtre.</div>';
    var top = list.filter(function (m) { return m.known && m.state === 'pre'; }).sort(function (x, y) { return y.fav - x.fav; }).slice(0, 6);
    if (top.length) h += '<div class="stitle">Les sélections les plus fortes</div><div class="car">' + top.map(function (m) {
      return '<div class="fcard ' + m.conf + '"><div class="lg">' + esc(m.tn) + ' · ' + dm(m.date) + ' · ' + esc(m.time) + '<span class="cd">' + svg(IC.clock) + tnState(m) + '</span></div>' +
        '<div class="duel"><div class="s">' + crest(m.a, true) + '<b>' + esc(m.a) + '</b></div><span class="vsp">VS</span><div class="s">' + crest(m.b, true) + '<b>' + esc(m.b) + '</b></div></div>' +
        '<div class="cfp ' + m.conf + '">' + confIcon(m.conf) + CONF[m.conf] + '</div><div class="pf">' + esc(m.favName) + ' <b>' + pct(m.fav) + '</b></div>' +
        '<button class="voir wide ' + m.conf + '" data-tnopen="' + m.i + '">Voir le pronostic ' + svg(IC.chev) + '</button></div>'; }).join('') + '</div>';
    return h + tnGroups(list) + tnFoot();
  }
  function tnFoot() {
    var bt = D.tennis.bt || {};
    if (!bt.n) return '';
    var rows = (bt.bins || []).map(function (x) {
      return '<tr><td>' + Math.round(x.lo * 100) + '–' + Math.round(x.hi * 100) + ' %</td><td>' + x.n + '</td><td>' + pct(x.said) + '</td><td><b>' + pct(x.real) + '</b></td></tr>'; }).join('');
    return '<div class="sec"><span class="dot g"></span>Fiabilité du modèle tennis</div><div class="fm"><div class="sub">Test sur ' + bt.n.toLocaleString('fr-FR') +
      ' matchs (du ' + dm(bt.since) + '/' + bt.since.slice(0, 4) + ' au ' + dm(bt.until) + '/' + bt.until.slice(0, 4) + '), chaque pronostic calculé sans connaître le match. ' +
      'Vainqueur juste : <b>' + pct(bt.acc) + '</b>. Les cotes des bookmakers sans marge font un peu mieux : <b>' + pct(bt.acc_bk) + '</b> sur leurs ' + bt.n_bk.toLocaleString('fr-FR') + ' matchs. ' +
      'Notre modèle reste donc <b>moins bon que les bookmakers</b> : à prendre comme une indication.</div>' +
      '<table class="tbl"><thead><tr><th>Confiance</th><th>Matchs</th><th>Annoncé</th><th>Réel</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function tnPage(i) {
    var m = TM.filter(function (x) { return x.id === st.detail.id; })[0] || TM[i], d = { div: 'TEN', home: m.a, away: m.b, ref: 'tennis|' + m.id }, conf = m.conf, p = [m.p, 1 - m.p];
    var h = '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<div class="who"><span class="lgchip">🎾 ' + esc(m.tn) + '</span><small>' + esc(m.round) + ' · ' + dm(m.date) + ' · ' + esc(m.time) + ' · ' + tnState(m) + '</small></div></div>' + vsBlock(d);
    if (m.state === 'post') {
      h += '<div class="main ' + (m.hit ? 'high' : 'low') + '"><div class="k"><small>Résultat</small></div><div class="hero"><div><div class="hl">' + esc((m.sets || []).join('  ')) + '</div><div class="hn">' +
        esc(m.win != null ? (m.win ? m.b : m.a) : '–') + '</div></div></div>' + (m.hit != null ? line('Notre pronostic', (m.hit ? '✓ ' : '✗ ') + m.favName + ' · ' + pct(m.fav)) : '') + '</div>';
      if (m.picks && m.picks.length) h += '<div class="sec"><span class="dot g"></span>Nos pronostics sur ce match</div><div class="fm">' + m.picks.map(pickRow).join('') + '</div>';
      return h;
    }
    h += '<div class="main ' + conf + '"><div class="k"><small>Pronostic principal</small><span class="badge ' + conf + '">' + confIcon(conf) + CONF[conf] + '</span></div>' +
      '<div class="hero"><div><div class="hl">Vainqueur du match</div><div class="hn">' + esc(m.favName) + '</div></div>' + gauge(m.fav, conf) + '</div>' +
      line('Surface', (SURF[m.surf] || m.surf) + (m.city ? ' · ' + m.city : '')) + line('Format', 'Au meilleur des ' + m.bo + ' sets') +
      (m.ra && m.rb ? line('Notes Elo (surface)', m.ra + ' – ' + m.rb) : '') +
      '<div class="b3"><i class="h" style="width:' + p[0] * 100 + '%"></i><i class="a" style="width:' + p[1] * 100 + '%"></i></div>' +
      '<div class="l3"><span class="h">' + esc(last(m.a)) + ' · ' + pct(p[0]) + '</span><span class="a">' + esc(last(m.b)) + ' · ' + pct(p[1]) + '</span></div></div>';
    if (!m.known) return h + '<div class="sub warn">Pas assez d’historique sur ce joueur (qualifié, invité ou circuit inférieur) : estimation très peu fiable, aucun pronostic sûr proposé.</div>';
    var wrap = function (r) { return { m: r.m, s: r.s, p: r.p, v: r.v, f: { sels: r.sels } }; };
    h += '<div class="sec"><span class="dot g"></span>Pronostics sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
      (m.safe.length ? m.safe.map(wrap).map(mkRow('g', d)).join('') : '<div class="empty">Aucun pronostic n’atteint ce seuil.</div>');
    return h + '<div class="sec"><span class="dot a"></span>Moins sûrs</div>' + m.less.map(wrap).map(mkRow('a', d)).join('');
  }


  /* ------------------------------------------------------------ chargement à la demande des données d'un sport */
  var LZ = {};
  function isLoaded(key) { return !D.lazy || !D.lazy[key] || !!D['_ok_' + key]; }
  function loadLazy(key, cb) {
    if (isLoaded(key)) { if (cb) cb(); return; }
    if (!LZ[key]) LZ[key] = fetch(D.lazy[key]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { D[key] = j; D['_ok_' + key] = true; });
    LZ[key].then(function () { if (cb) cb(); }, function () { LZ[key] = null; if (cb) cb(true); });
  }
  function skel(n) { var h = '<div class="skel" aria-label="Chargement">'; for (var i = 0; i < (n || 4); i++) h += '<div class="sk-card"><i class="sk sk-t"></i><div class="sk-r"><i class="sk sk-c"></i><i class="sk sk-l"></i></div><div class="sk-r"><i class="sk sk-c"></i><i class="sk sk-l"></i></div></div>'; return h + '</div>'; }
  function loadingHTML() { return brand() + sportsBar() + skel(4); }

  /* ------------------------------------------------------------ sports d'équipe : même interface pour tous */
  var SPORT_CFG = {
    basket: { key: 'basket', icon: '🏀', title: 'basket', lib: 'Basket', unit: 'points', dec: 0, gap: true,
      leagues: { NBA: ['NBA', '#e2522f'], EL: ['EuroLeague', '#2f6bdc'] },
      empty: 'Aucun match de basket (NBA, EuroLeague) dans la période. Réessaie un peu plus tard.',
      note: function (list) { return list.some(function (m) { return m.pre; }) ? 'NBA : la saison régulière n’a pas encore commencé, ce sont des matchs de <b>présaison</b> (équipes remaniées, pas de pronostic sûr).' : ''; },
      preMsg: 'Match de présaison : effectifs remaniés et temps de jeu des titulaires limité, estimation peu fiable, aucun pronostic sûr proposé.' },
    rugby15: { key: 'rugby', icon: '🏉', title: 'rugby', lib: 'Rugby', unit: 'points', dec: 0, gap: true, three: true,
      leagues: { T14: ['Top 14', '#2f6bdc'], PRM: ['Premiership', '#d6383a'], URC: ['URC', '#1fa84f'] },
      empty: 'Aucun match de rugby (Top 14, Premiership, URC) dans la période. Réessaie un peu plus tard.' },
    handball: { key: 'handball', icon: '🤾', title: 'handball', lib: null, unit: 'points', dec: 0, gap: true, three: true,
      leaguesFn: function (d) { var o = {}; Object.keys(d.names || {}).forEach(function (k) { o[k] = [d.names[k], '#d6479a']; }); return o; },
      empty: 'Aucun match de handball dans la période. Réessaie un peu plus tard.',
      note: function (list, d) { return 'Calendrier limité à <b>hier, aujourd’hui et demain</b> (offre gratuite de la source de données). Les notes des équipes datent de <b>juin ' + (d.last || '').slice(0, 4) + '</b> : le modèle n’a pas vu la saison en cours. Le test ci-dessous mesure exactement cette situation.'; },
      btNote: ' (modèle figé un an plus tôt)' },
    hockey: { key: 'hockey', icon: '🏒', title: 'hockey', lib: 'Hockey', unit: 'buts', dec: 1, three: true, single: ['NHL', '#2f6bdc'],
      empty: 'Aucun match de hockey sur glace (NHL) dans la période. Réessaie un peu plus tard.',
      note: function () { return 'Hockey : les résultats sont <b>très ouverts</b> (le vainqueur est trouvé à peine plus d’une fois sur deux). Les marchés de buts sont plus fiables que le vainqueur.'; },
      lines: function (m) { return line('Buts attendus (temps réglementaire)', m.lh.toFixed(1) + ' – ' + m.la.toFixed(1)) + line('Total attendu', (m.lh + m.la).toFixed(1) + ' buts'); },
      preMsg: 'Match de présaison : effectifs remaniés, estimation peu fiable, aucun pronostic sûr proposé.' },
    baseball: { key: 'baseball', icon: '⚾', title: 'baseball', lib: 'Baseball', unit: 'points', dec: 1, single: ['MLB', '#d6383a'],
      empty: 'Aucun match de baseball (MLB) dans la période. Réessaie un peu plus tard.',
      note: function () { return 'MLB : la saison régulière est terminée, ce sont les <b>séries éliminatoires</b>. Le baseball est très ouvert : le vainqueur est trouvé un peu plus d’une fois sur deux, les marchés de points sont plus fiables.'; } },
    nfl: { key: 'nfl', icon: '🏈', title: 'football américain', lib: 'Nfl', unit: 'points', dec: 0, gap: true, single: ['NFL', '#2f6bdc'],
      empty: 'Aucun match de football américain (NFL) dans la période. Réessaie un peu plus tard.',
      note: function () { return 'NFL : peu de matchs par équipe (17 par saison), les notes évoluent vite. Blessures et météo ne sont pas pris en compte.'; } }
  };
  SPORT_CFG.mma = { key: 'mma', icon: '🥋', title: 'MMA', lib: 'Mma', single: ['UFC', '#d6383a'], dec: 0, unit: '',
    empty: 'Aucune soirée UFC dans la période. Réessaie un peu plus tard.',
    groupKey: function (m) { return m.ev; },
    lines: function (m) { return line('Format', m.rounds + ' rounds') + (m.rec && m.rec[0] ? line('Bilans (V-D-N)', m.rec[0] + ' · ' + m.rec[1]) : ''); },
    note: function () { return 'MMA : un combat peut basculer sur un coup. Le modèle se base sur les résultats UFC passés (notes Elo) et ne voit ni blessures, ni styles, ni pesée.'; } };
  SPORT_CFG.volley = { key: 'volley', icon: '🏐', title: 'volley-ball', lib: null, dec: 0, unit: '',
    leaguesFn: function (d) { var o = {}; Object.keys(d.names || {}).forEach(function (k) { o[k] = [d.names[k], '#d6479a']; }); return o; },
    empty: 'Aucun match de volley-ball dans la période. Réessaie un peu plus tard.',
    lines: function (m) { return line('Format', 'Au meilleur des 5 sets'); },
    note: function (list, d) { return 'Calendrier limité à <b>hier, aujourd’hui et demain</b> (offre gratuite de la source de données). Les notes des équipes datent de <b>' + (d.last || '').slice(0, 4) + '</b> : le modèle n’a pas vu la saison en cours. Le test ci-dessous mesure cette situation.'; },
    btNote: ' (modèle figé un an plus tôt)' };
  var SP = {};
  function spOf(sid) {
    var c = SPORT_CFG[sid];
    if (!c) return null;
    return SP[sid] || (SP[sid] = { sid: sid, cfg: c, items: [], busy: false, inited: false, ui: { day: 'all', lg: 'all' } });
  }
  function spData(S) { return D[S.cfg.key] || {}; }
  function spLeagues(S) { var c = S.cfg; if (c.single) { var o = {}; o[c.single[0]] = c.single; return o; } return c.leaguesFn ? c.leaguesFn(spData(S)) : c.leagues; }
  function spSet(S, list) {
    var L = spLeagues(S), first = Object.keys(L)[0];
    S.items = list;
    list.forEach(function (m, i) {
      if (!m.lg) m.lg = first;
      m.i = i; m.p3 = Array.isArray(m.p) ? m.p : [m.p, 0, 1 - m.p];
      m.fav = Math.max(m.p3[0], m.p3[2]); m.favIdx = m.p3[0] >= m.p3[2] ? 0 : 2; m.conf = m.known ? confOf(m.fav) : 'low'; m.favName = m.favIdx ? m.away : m.home;
      m.key = norm(m.home + ' ' + m.away + ' ' + (L[m.lg] ? L[m.lg][0] : ''));
    });
    ledgerRecord(S.sid, list);
  }
  function spInit(S) {
    if (S.inited) return;
    S.inited = true;
    var d = spData(S);
    spSet(S, d.matches || []);
    if (S.cfg.lib && window[S.cfg.lib] && d.model) window[S.cfg.lib].init(d);
  }
  function spLive(S, cb) {                                      // calendrier et scores en direct (si la source autorise le navigateur)
    var lib = S.cfg.lib && window[S.cfg.lib], d = spData(S);
    if (S.busy || !lib || !d.model || !window.Tennis || !window.fetch) { if (cb) cb(); return; }
    S.busy = true;
    var now = new Date(), P = Tennis.paris;
    var lo = P(new Date(now.getTime() - 864e5).toISOString()).d, hi = P(new Date(now.getTime() + 5 * 864e5).toISOString()).d;
    lib.fetchRaw(now, P).then(function (raws) {
      var srv = {}, seen = {}, list = [];
      S.items.forEach(function (m) { srv[m.id] = m; });
      raws.forEach(function (r) {
        var k = (r.lg || '') + r.id;
        if (seen[k]) return;
        seen[k] = 1;
        var it = lib.build(r, srv[String(r.id)], P);
        if (it.date >= lo && it.date <= hi) list.push(it);
      });
      if (!list.length) return;
      list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
      spSet(S, list);
      var p = P(now.toISOString());
      d.generated = p.d.slice(8) + '/' + p.d.slice(5, 7) + '/' + p.d.slice(0, 4) + ' à ' + p.t + ' (direct)';
      if (st.sport === S.sid && !st.detail && st.tab === 'home') { var y0 = window.scrollY; render(); window.scrollTo(0, y0); }
    }).catch(function () { /* on garde les données de la dernière mise à jour */ }).then(function () { S.busy = false; if (cb) cb(); });
  }
  setInterval(function () { var S = spOf(st.sport); if (S && document.visibilityState === 'visible') spLive(S); }, 180000);
  function spWinner(m) { return m.hs > m.as_ ? m.home : m.as_ > m.hs ? m.away : 'Match nul'; }
  function spState(m) { return m.state === 'post' ? 'Terminé' : m.state === 'in' ? 'En cours' : countdown({ date: m.date, time: m.time }); }
  function spRow(S, m) {
    var post = m.state === 'post' && (m.hs != null || !!m.res);
    var res = post ? (m.res ? '<div class="tres"><b>' + esc(m.res) + '</b></div>' : '<div class="tres">' + m.hs + ' – ' + m.as_ + ' · <b>' + esc(spWinner(m)) + '</b>' + (m.ot ? ' (prolong.)' : '') + '</div>') : '';
    var tag = post && m.hit != null ? '<span class="cfp ' + (m.hit ? 'high' : 'low') + '">' + svg(m.hit ? IC.check : IC.x) + (m.hit ? 'Bien vu' : 'Raté') + '</span>' :
      m.known ? '<span class="cfp ' + m.conf + '">' + pct(m.fav) + ' · ' + esc(last(m.favName)) + '</span>' : '<span class="cfp low">' + (m.pre ? 'Présaison' : 'Peu d’historique') + '</span>';
    return '<div class="mrow ' + m.conf + '"><div class="tm">' + esc(m.time) + '<small>' + (m.state === 'pre' ? dm(m.date) : spState(m)) + '</small></div>' +
      '<div class="tt">' + tn(m.home) + tn(m.away) + res + '</div>' +
      '<div class="act">' + tag + '<button class="voir ' + m.conf + '" data-spopen="' + S.sid + '|' + m.i + '">Voir' + svg(IC.chev) + '</button></div>' + miniBar(m.p3) + '</div>';
  }
  function spGroups(S, list) {
    var h = '', L = spLeagues(S);
    if (S.cfg.groupKey) {                                   // regroupement par événement (MMA : une soirée = un groupe)
      var seen = {}, order = [];
      list.forEach(function (m) { var k = S.cfg.groupKey(m); if (!seen[k]) { seen[k] = []; order.push(k); } seen[k].push(m); });
      order.forEach(function (k) { h += '<div class="lgh"><span class="lb" style="--lc:' + Object.values(L)[0][1] + '">' + S.cfg.icon + '</span><div class="ln">' + esc(k) + '<small>' + dm(seen[k][0].date) + '</small></div><span class="cnt">' + seen[k].length + '</span></div>' + seen[k].map(function (m) { return spRow(S, m); }).join(''); });
      return h;
    }
    Object.keys(L).forEach(function (lg) {
      var g = list.filter(function (m) { return String(m.lg) === lg; });
      if (!g.length) return;
      h += '<div class="lgh"><span class="lb" style="--lc:' + L[lg][1] + '">' + S.cfg.icon + '</span><div class="ln">' + esc(L[lg][0]) + '<small>' + esc(g[0].label || '') + '</small></div><span class="cnt">' + g.length + '</span></div>' + g.map(function (m) { return spRow(S, m); }).join('');
    });
    return h;
  }
  function spFoot(S) {
    var d = spData(S), bt = d.bt || {}, L = spLeagues(S), h = '';
    var block = function (name, b) {
      var rows = (b.bins || []).map(function (x) {
        return '<tr><td>' + Math.round(x.lo * 100) + '–' + Math.round(x.hi * 100) + ' %</td><td>' + x.n + '</td><td>' + pct(x.said) + '</td><td><b>' + pct(x.real) + '</b></td></tr>'; }).join('');
      return '<div class="fm"><h4>' + esc(name) + ' · test sur ' + b.n.toLocaleString('fr-FR') + ' matchs' + (S.cfg.btNote || '') + '</h4><div class="sub">Vainqueur juste : <b>' + pct(b.acc) +
        '</b>. Pronostics sûrs (tous marchés) : annoncés <b>' + pct(b.said) + '</b>, réalisés <b>' + pct(b.real) + '</b> sur ' + b.n_safe.toLocaleString('fr-FR') + ' sélections.</div>' +
        '<table class="tbl"><thead><tr><th>Confiance</th><th>Matchs</th><th>Annoncé</th><th>Réel</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    };
    if (bt.n) h = block(Object.keys(L).length === 1 ? L[Object.keys(L)[0]][0] : S.cfg.title, bt);
    else Object.keys(L).forEach(function (lg) { var b = bt[lg]; if (b && b.n) h += block(L[lg][0], b); });
    return h ? '<div class="sec"><span class="dot g"></span>Fiabilité du modèle ' + esc(S.cfg.title) + '</div>' + h : '';
  }
  function spHome(S) {
    var c = S.cfg, d = spData(S), L = spLeagues(S), keys = Object.keys(L), h = brand() + sportsBar();
    if (!S.items.length) return h + '<div class="empty">' + c.empty + '</div>';
    var T = S.ui, q = norm(st.q.trim());
    var base = S.items.filter(function (m) { return (T.lg === 'all' || String(m.lg) === T.lg) && (!q || m.key.indexOf(q) >= 0); });
    var upc = base.filter(function (m) { return m.state !== 'post'; }), res = base.filter(function (m) { return m.state === 'post'; });
    var days = [];
    upc.forEach(function (m) { if (days.indexOf(m.date) < 0) days.push(m.date); });
    var done = res.filter(function (m) { return m.hit != null; }), ok = done.filter(function (m) { return m.hit; }).length, sp = 0, sw = 0;
    done.forEach(function (m) { (m.picks || []).forEach(function (p) { if (p.t === 0) { sp++; if (p.h) sw++; } }); });
    var nHigh = upc.filter(function (m) { return m.conf === 'high'; }).length, id = S.sid;
    h += '<div class="pulse"><div><b>' + upc.length + '</b><span>matchs à venir</span></div><div class="hi"><b>' + nHigh + '</b><span>haute confiance</span></div><div><b>' +
      (done.length ? ok + '/' + done.length : '–') + '</b><span>vainqueurs justes</span></div></div>';
    h += '<div class="chips">';
    if (res.length) h += '<button class="chip past' + (T.day === 'res' ? ' on' : '') + '" data-spday="' + id + '|res">Résultats<b>' + svg(IC.check) + ' ' + res.length + '</b></button>';
    h += '<button class="chip' + (T.day === 'all' ? ' on' : '') + '" data-spday="' + id + '|all">À venir<b>' + upc.length + ' matchs</b></button>';
    days.forEach(function (x) { h += '<button class="chip' + (T.day === x ? ' on' : '') + '" data-spday="' + id + '|' + x + '">' + WD[parseD(x).getDay()] + '<b>' + dm(x) + '</b></button>'; });
    h += '</div><div class="tools"><label class="search">' + svg(IC.search) + '<input id="q" type="search" placeholder="Chercher une équipe" autocomplete="off" value="' + esc(st.q) + '"></label></div>';
    if (keys.length > 1) h += '<div class="chips">' + [['all', 'Tous']].concat(keys.map(function (k) { return [k, L[k][0]]; })).map(function (x) {
      return '<button class="chip pill' + (T.lg === x[0] ? ' on' : '') + '" data-splg="' + id + '|' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
    if (T.day === 'res') {
      h += '<div class="srcnote"><b>Résultats récents</b> : ' + (done.length ? 'vainqueur correct ' + ok + '/' + done.length + (sp ? ' · pronostics sûrs gagnés ' + sw + '/' + sp : '') + '. ' : '') +
        'Chaque pronostic est calculé avec les données d’avant le match.</div>';
      return h + (res.length ? spGroups(S, res) : '<div class="empty">Aucun résultat pour ce filtre.</div>');
    }
    var list = upc.filter(function (m) { return T.day === 'all' || m.date === T.day; });
    if (!list.length) return h + '<div class="empty">Aucun match à venir pour ce filtre.</div>';
    var note = c.note ? c.note(list, d) : '';
    return h + (note ? '<div class="srcnote">' + note + '</div>' : '') + spGroups(S, list) + spFoot(S);
  }
  function spLines(S, m) {
    var c = S.cfg;
    if (c.lines) return c.lines(m);
    var f = function (x) { return c.dec ? x.toFixed(c.dec) : String(Math.round(x)); };
    return line(c.dec ? 'Points attendus' : 'Score attendu', f(m.lh) + ' – ' + f(m.la)) + line('Total attendu', f(m.lh + m.la) + ' ' + c.unit) +
      (c.gap ? line('Écart attendu', f(Math.abs(m.lh - m.la)) + ' ' + c.unit + ' pour ' + (m.lh >= m.la ? m.home : m.away)) : '');
  }
  function spPage(S, ref) {
    var c = S.cfg, L = spLeagues(S), m = S.items.filter(function (x) { return x.id === ref.id; })[0] || S.items[ref.i], d = { div: S.sid, home: m.home, away: m.away, ref: c.key + '|' + m.id }, conf = m.conf, p = m.p3;
    var h = '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<div class="who"><span class="lgchip">' + c.icon + ' ' + esc(L[m.lg] ? L[m.lg][0] : c.title) + '</span><small>' + (m.label ? esc(m.label) + ' · ' : '') + dm(m.date) + ' · ' + esc(m.time) + ' · ' + spState(m) + '</small></div></div>' + vsBlock(d);
    if (m.state === 'post' && (m.hs != null || m.res)) {
      h += '<div class="main ' + (m.hit ? 'high' : 'low') + '"><div class="k"><small>Résultat</small></div><div class="hero"><div><div class="hl">' + (m.res ? esc(m.res.split(' · ')[1] || '') : m.hs + ' – ' + m.as_) + '</div><div class="hn">' +
        esc(m.res ? m.res.split(' · ')[0] : spWinner(m) + (m.ot ? ' (prolong.)' : '')) + '</div></div></div>' + (m.hit != null ? line('Notre pronostic', (m.hit ? '✓ ' : '✗ ') + m.favName + ' · ' + pct(m.fav)) : '') + spLines(S, m) + '</div>';
      if (m.picks && m.picks.length) h += '<div class="sec"><span class="dot g"></span>Nos pronostics sur ce match</div><div class="fm">' + m.picks.map(pickRow).join('') + '</div>';
      return h;
    }
    h += '<div class="main ' + conf + '"><div class="k"><small>Pronostic principal</small><span class="badge ' + conf + '">' + confIcon(conf) + CONF[conf] + '</span></div>' +
      '<div class="hero"><div><div class="hl">' + (c.three ? 'Résultat du match' : 'Vainqueur du match') + '</div><div class="hn">' + esc(m.favName) + '</div></div>' + gauge(m.fav, conf) + '</div>' + spLines(S, m) +
      '<div class="b3"><i class="h" style="width:' + p[0] * 100 + '%"></i><i class="d" style="width:' + p[1] * 100 + '%"></i><i class="a" style="width:' + p[2] * 100 + '%"></i></div>' +
      '<div class="l3"><span class="h">' + (c.three ? '1 · ' : esc(last(m.home)) + ' · ') + pct(p[0]) + '</span>' + (c.three ? '<span class="d">X · ' + pct(p[1]) + '</span>' : '') +
      '<span class="a">' + (c.three ? '2 · ' : esc(last(m.away)) + ' · ') + pct(p[2]) + '</span></div></div>';
    if (m.pre) return h + '<div class="sub warn">' + (c.preMsg || 'Match de présaison : estimation peu fiable, aucun pronostic sûr proposé.') + '</div>';
    if (!m.known) return h + '<div class="sub warn">Pas d’historique sur une des équipes : estimation peu fiable.</div>';
    var wrap = function (r) { return { m: r.m, s: r.s, p: r.p, v: r.v, f: { sels: r.sels } }; };
    h += '<div class="sec"><span class="dot g"></span>Pronostics sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
      (m.safe.length ? m.safe.map(wrap).map(mkRow('g', d)).join('') : '<div class="empty">Aucun pronostic n’atteint ce seuil.</div>');
    return h + '<div class="sec"><span class="dot a"></span>Moins sûrs</div>' + m.less.map(wrap).map(mkRow('a', d)).join('');
  }


  /* ------------------------------------------------------------ golf */
  var GM = { win: 'Vainqueur du tournoi', top5: 'Top 5', top10: 'Top 10', top20: 'Top 20', cut: 'Passe le cut' };
  function gScore(x) { return x === 0 ? 'E' : (x > 0 ? '+' : '−') + Math.abs(x); }
  function gState(ev) {
    return ev.state === 'in' ? 'En cours · tour ' + ev.round : 'À venir · du ' + dm(ev.start) + ' au ' + dm(ev.end);
  }
  function gPicks(ev) {
    var safe = [], less = [], nCut = 0;
    ev.players.forEach(function (pl) {
      ['win', 'top5', 'top10', 'top20'].forEach(function (k) {
        var r = { m: GM[k], s: pl.n, p: pl[k] };
        if (pl[k] >= SAFE) safe.push(r); else if (pl[k] >= 0.3 && k !== 'top20') less.push(r);
      });
      if (pl.cut >= SAFE && ev.state === 'pre' && pl.known) nCut++;
    });
    var by = function (a, b) { return b.p - a.p; };
    return { safe: safe.sort(by).slice(0, 14), less: less.sort(by).slice(0, 10), nCut: nCut };
  }
  function gRow(r) { return '<div class="pr"><span class="pt">' + esc(r.s) + '<small class="sm">' + esc(r.m) + '</small></span><span class="pp">' + pct(r.p) + '</span></div>'; }
  function golfHTML() {
    var h = brand() + sportsBar(), G = D.golf;
    if (!G.events || !G.events.length) return h + '<div class="empty">Aucun tournoi de golf (PGA, DP World Tour, LPGA) cette semaine.</div>';
    G.events.forEach(function (ev) {
      var P = gPicks(ev), top = ev.players.slice(0, 15);
      h += '<div class="main mid"><div class="k"><small>' + esc(ev.tour) + '</small><span class="badge mid">' + gState(ev) + '</span></div><div class="hero"><div><div class="hl">' + ev.n + ' joueurs</div><div class="hn">' + esc(ev.name) + '</div></div></div>' +
        (ev.state === 'in' ? line('Cut', ev.cut_known ? 'passé' : 'à venir (65 premiers et ex æquo)') : line('Cut', 'après 2 tours (65 premiers et ex æquo)')) + '</div>';
      h += '<div class="sec"><span class="dot g"></span>Pronostics sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
        (P.safe.length ? '<div class="fm">' + P.safe.map(gRow).join('') + (P.nCut ? '<div class="sub">+ ' + P.nCut + ' joueurs ont au moins 70 % de passer le cut.</div>' : '') + '</div>' :
          '<div class="empty">Aucun pronostic n’atteint ce seuil : au golf même le favori gagne rarement.</div>');
      h += '<div class="sec"><span class="dot a"></span>Moins sûrs</div><div class="fm">' + P.less.map(gRow).join('') + '</div>';
      h += '<div class="sec"><span class="dot g"></span>Favoris</div><div class="fm f1t"><div class="f1h"><span>Joueur</span><span>Victoire</span><span>Top 5</span><span>Top 10</span><span>Top 20</span></div>' +
        top.map(function (d) {
          return '<div class="f1r"><span class="f1n">' + esc(d.n) + '<small>' + (ev.state === 'in' ? gScore(d.cur) + (d.out ? ' · éliminé' : d.h ? ' · trou ' + d.h : '') : (d.known ? '' : 'peu connu')) + '</small></span>' +
            f1Bar(d.win, 'g') + f1Bar(d.top5, 'g') + f1Bar(d.top10, 'a') + f1Bar(d.top20, 'a') + '</div>'; }).join('') + '</div>';
    });
    (G.last || []).forEach(function (l) {
      var w = l.results[0];
      h += '<div class="sec"><span class="dot g"></span>Dernier tournoi ' + esc(l.tour) + '</div><div class="srcnote"><b>' + esc(l.name) + '</b> (' + dm(l.date) + ') : vainqueur <b>' + esc(w.n) + '</b>, que nous donnions à ' + pct(w.win) +
        ' avant le tournoi. Notre top 10 contenait <b>' + l.top10_hits + ' des 10</b> premiers.</div>';
    });
    var bt = G.bt;
    if (bt && bt.events) {
      h += '<div class="sec"><span class="dot g"></span>Fiabilité du modèle golf</div><div class="fm"><div class="sub">Test sur <b>' + bt.events + ' tournois</b> depuis 2025, pronostics faits avant le premier tour.</div>' +
        '<table class="tbl"><thead><tr><th>Marché</th><th>Sûrs</th><th>Annoncé</th><th>Réel</th></tr></thead><tbody>' + Object.keys(GM).map(function (k) {
          var m = bt.markets[k]; return '<tr><td>' + GM[k] + '</td><td>' + m.n_safe + '</td><td>' + (m.said != null ? pct(m.said) : '–') + '</td><td><b>' + (m.real != null ? pct(m.real) : '–') + '</b></td></tr>'; }).join('') + '</tbody></table></div>';
    }
    return h + '<div class="srcnote">Le golf est très aléatoire. Les probabilités sont recalculées toutes les 2 h avec le score du tournoi en cours.</div>';
  }


  /* ------------------------------------------------------------ aujourd'hui : les meilleurs pronostics, tous sports */
  var TODAY = { ts: 0, busy: false, step: 0, total: 0 };
  function parisToday() { return window.Tennis ? Tennis.paris(new Date().toISOString()).d : isoDate(new Date()); }
  function todayLoad() {                                  // charge chaque sport, récupère ses matchs en direct, puis redessine l'onglet
    if (TODAY.busy || Date.now() - TODAY.ts < 3 * 60 * 1000) return;
    TODAY.busy = true; TODAY.step = 0;
    var jobs = [['tennis', null], ['golf', null]].concat(Object.keys(SPORT_CFG).map(function (sid) { return [SPORT_CFG[sid].key, spOf(sid)]; }));
    TODAY.total = jobs.length;
    var left = jobs.length;
    var finish = function () {
      TODAY.step++; left--;
      if (st.tab === 'today' && !st.detail) render();
      if (left <= 0) { TODAY.busy = false; TODAY.ts = Date.now(); asSync(); if (st.tab === 'today' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } }
    };
    jobs.forEach(function (j) {
      loadLazy(j[0], function (err) {
        if (err) { finish(); return; }
        if (j[1]) { spInit(j[1]); spLive(j[1], finish); }
        else if (j[0] === 'golf') finish();
        else { setTM(D.tennis.matches || []); liveTennis(finish); }
      });
    });
  }
  function todayRows() {
    var T = parisToday(), picks = [], favs2 = [], counts = [];
    // football : marchés calculés par le moteur du navigateur
    var nf = 0;
    D.fixtures.forEach(function (f) {
      if (f.date !== T) return;
      nf++;
      var C = Engine.classify(Engine.families(f.div, f.home, f.away, f.ov).fams), ref = 'data-open="' + f.i + '"';
      C.safe.slice(0, 2).forEach(function (r) { picks.push({ icon: '⚽', match: f.home + ' – ' + f.away, time: f.time, pick: r.m + ' : ' + r.s, p: r.p, v: r.v, ref: ref, bid: f.id, bm: r.m, bs: r.s }); });
      if (f.conf === 'high') favs2.push({ icon: '⚽', match: f.home + ' – ' + f.away, time: f.time, pick: favName(f), p: f.fav, ref: ref });
    });
    if (nf) counts.push(['⚽', 'Football', nf]);
    var add = function (icon, name, items, refOf, keyOf) {
      var n = 0, nk = 0;
      items.forEach(function (m) {
        if (m.date !== T || m.state === 'post') return;
        n++;
        if (!m.known) return;
        nk++;
        var home = m.home || m.a, away = m.away || m.b, ref = refOf(m);
        (m.safe || []).slice(0, 2).forEach(function (r) { picks.push({ icon: icon, match: home + ' – ' + away, time: m.time, pick: r.m + ' : ' + r.s, p: r.p, v: r.v, ref: ref, bid: keyOf + '|' + m.id, bm: r.m, bs: r.s }); });
        if (m.conf === 'high') favs2.push({ icon: icon, match: home + ' – ' + away, time: m.time, pick: m.favName, p: m.fav, ref: ref });
      });
      if (n) counts.push([icon, name, n, nk]);
    };
    add('🎾', 'Tennis', TM, function (m) { return 'data-tnopen="' + m.i + '"'; }, 'tennis');
    Object.keys(SPORT_CFG).forEach(function (sid) {
      var S = spOf(sid);
      if (S.inited) add(S.cfg.icon, S.cfg.title.charAt(0).toUpperCase() + S.cfg.title.slice(1), S.items, function (m) { return 'data-spopen="' + sid + '|' + m.i + '"'; }, S.cfg.key);
    });
    // Formule 1 : course du jour
    var N = D.f1 && D.f1.next;
    if (N && N.date && window.Tennis) {
      var rw = Tennis.paris(N.date + 'T' + (N.time || '12:00:00Z').replace('Z', '').slice(0, 5));
      if (rw.d === T) {
        counts.push(['🏁', 'Formule 1', 1, 1, 'course']);
        f1Picks(N).safe.slice().sort(function (a, b) { return b.p - a.p; }).slice(0, 2).forEach(function (r) { picks.push({ icon: '🏁', match: N.name, time: rw.t, pick: r.m + ' : ' + r.s, p: r.p, ref: 'data-gosport="f1"' }); });
      }
    }
    // golf : tournois en cours ou qui commencent aujourd'hui
    var ge = ((D.golf && D.golf.events) || []).filter(function (ev) { return ev.state === 'in' || ev.start === T; });
    if (ge.length) {
      counts.push(['⛳', 'Golf', ge.length, ge.length, 'tournoi']);
      ge.forEach(function (ev) { gPicks(ev).safe.slice(0, 1).forEach(function (r) { picks.push({ icon: '⛳', match: ev.name, time: '', pick: r.s + ' : ' + r.m, p: r.p, ref: 'data-gosport="golf"' }); }); });
    }
    var by = function (a, b) { return b.p - a.p; };
    return { picks: picks.sort(by), favs: favs2.sort(by), counts: counts, T: T };
  }
  function todayRow(r) {
    return '<div class="mrow high" style="grid-template-columns:44px 1fr auto"><div class="tm">' + esc(r.time || '–') + '</div><div class="tt"><b style="font-weight:600">' + r.icon + ' ' + esc(r.match) + '</b>' +
      '<div class="tres" style="color:var(--ink)">' + esc(r.pick) + '</div></div><div class="act"><span class="cfp high">' + pct(r.p) + '</span><button class="voir high" ' + r.ref + '>Voir' + svg(IC.chev) + '</button></div></div>';
  }
  /* combinés du jour : sélections de matchs différents, de la plus probable à la moins probable ; on affiche la vraie probabilité et la cote minimale à exiger */
  var COMBOS = [];
  function todayCombos(picks) {
    var seen = {}, pool = [];
    picks.slice().sort(function (a, b) { return b.p - a.p; }).forEach(function (r) {
      if (!r.bid || seen[r.match]) return;
      seen[r.match] = 1; pool.push(r);
    });
    var out = [];
    [['Prudent', 2], ['Équilibré', 3], ['Audacieux', 4]].forEach(function (x) {
      if (pool.length < x[1]) return;
      var legs = pool.slice(0, x[1]), P = legs.reduce(function (p, r) { return p * r.p; }, 1);
      out.push({ name: x[0], legs: legs, P: P });
    });
    return out;
  }
  function comboHTML(R) {
    COMBOS = todayCombos(R.picks);
    if (!COMBOS.length) return '';
    var h = '<div class="sec"><span class="dot a"></span>Combinés du jour <small>indicatif · matchs différents</small></div>' +
      '<div class="srcnote">Un combiné n’est gagné que si <b>toutes</b> ses sélections passent : sa probabilité est le produit des leurs. ' +
      'Les bookmakers prennent une marge sur chaque sélection, donc la cote affichée sur Winamax sera souvent <b>plus basse</b> que la cote juste ci-dessous : ' +
      'ne joue un combiné que si la cote proposée est <b>au moins</b> égale à la cote minimale. Aucun combiné ne garantit un gain.</div>';
    COMBOS.forEach(function (c, i) {
      h += '<div class="fm"><h4>' + c.name + '<span class="pp">' + pct(c.P) + ' de réussite</span></h4>' +
        c.legs.map(function (r) { return '<div class="pr"><span class="pt">' + r.icon + ' ' + esc(r.match) + '<small class="sm">' + esc(r.pick) + '</small></span><span class="pp">' + pct(r.p) + '</span></div>'; }).join('') +
        line('Cote juste', (1 / c.P).toFixed(2)) + line('Cote minimale à exiger', (1 / c.P).toFixed(2) + ' ou plus') +
        '<button class="bt-b" style="margin-top:10px" data-bcombo="' + i + '">€ Noter ce combiné dans Mes paris</button></div>';
    });
    return h;
  }
  /* ------------------------------------------------------------ assistant : mises conseillées selon ton profil, ta mise de base et ton budget */
  var AS = { prof: 'eq', unit: 10, daily: 0, alert: false };
  try { var rawA = JSON.parse(localStorage.getItem('pf-assist') || 'null'); if (rawA) AS = { prof: rawA.prof || 'eq', unit: +rawA.unit || 10, daily: +rawA.daily || 0, alert: !!rawA.alert }; } catch (e) { /* réglage par défaut */ }
  function asSave() { try { localStorage.setItem('pf-assist', JSON.stringify(AS)); } catch (e) { /* ignoré */ } }
  var AS_PROF = { pr: { name: 'Prudent', min: 0.85, max: 3, combo: 0 }, eq: { name: 'Équilibré', min: 0.78, max: 4, combo: 2 }, au: { name: 'Audacieux', min: 0.70, max: 6, combo: 3 } };
  var AS_SPORT = { '⚽': 'foot', '🎾': 'tennis', '🏀': 'basket', '🏉': 'rugby', '🤾': 'hand', '🏒': 'hockey', '⚾': 'baseball', '🏈': 'nfl', '🥊': 'mma', '🏐': 'volley', '🏁': 'f1', '⛳': 'golf' };
  var AS_OPEN = false;                                    // réglages de l'assistant dépliés ?
  var AS_CAP = 0.93;                                      // au-delà, la cote est trop basse (≈ 1,07) pour que le pari ait un intérêt
  var AS_HAIR = 0.03;                                     // marge de prudence retirée à chaque probabilité (nos pronostics « sûrs » sont en moyenne à 2-3 points au-dessus du réel)
  function asStake(x) { return Math.max(1, Math.round(x * 2) / 2); }
  function eur2(x) { return String(Math.round(x * 100) / 100).replace('.', ',') + ' €'; }
  function assistantPlan(R) {
    var pf = AS_PROF[AS.prof], mi = Bets.monthInfo(), plan = { items: [], combo: null, notes: [], stop: false, total: 0, mi: mi };
    var mult = 1, remaining = Infinity;
    if (mi.budget > 0) {
      var ratio = mi.spent / mi.budget; remaining = mi.budget - mi.spent;
      if (ratio >= 1) { plan.stop = true; plan.notes.push('Ton budget du mois (' + eur2(mi.budget) + ') est atteint : pas de conseil aujourd’hui. C’est la bonne décision.'); return plan; }
      if (ratio >= 0.8) { mult = 0.5; plan.notes.push('Tu as déjà misé ' + Math.round(ratio * 100) + ' % de ton budget du mois : je divise les mises par deux.'); }
    }
    var budget = Math.min(AS.daily > 0 ? AS.daily : AS.unit * 3, remaining);
    var seen = {}, pool = [];
    R.picks.forEach(function (r) {
      if (!r.bid) return;
      if (r.time && kickoff({ date: R.T, time: r.time }) < Date.now()) return;           // match déjà commencé
      if (AS.prof === 'pr' && !r.v) return;                                                 // profil prudent : marchés validés par backtest seulement
      var pa = r.p - AS_HAIR - (r.v ? 0 : 0.02);                                            // marché non validé : 2 points de prudence en plus
      if (pa < pf.min || r.p > AS_CAP) return;
      if (!seen[r.match] || pa > seen[r.match].pa) seen[r.match] = { r: r, pa: pa };
    });
    Object.keys(seen).forEach(function (k) { pool.push(seen[k]); });
    pool.sort(function (a, b) { return b.pa - a.pa; });
    pool.slice(0, pf.max).forEach(function (x) {
      var f = x.pa >= 0.88 ? 1 : x.pa >= 0.82 ? 0.5 : x.pa >= 0.74 ? 0.3 : 0.2, stake = asStake(AS.unit * f * mult);
      if (plan.total + stake > budget + 1e-9) { if (budget - plan.total < 1) return; stake = asStake(budget - plan.total); }
      plan.total += stake;
      plan.items.push({ r: x.r, pa: x.pa, stake: stake, tag: x.pa >= 0.88 ? 'Très sûr' : x.pa >= 0.82 ? 'Sûr' : 'Correct' });
    });
    if (pf.combo >= 2 && pool.length >= pf.combo && plan.total + 1 <= budget) {
      var legs = pool.slice(0, pf.combo).map(function (x) { return x.r; }), P = legs.reduce(function (t, r) { return t * (r.p - AS_HAIR); }, 1), cs = asStake(AS.unit * 0.3 * mult);
      cs = Math.min(cs, Math.max(1, Math.floor((budget - plan.total) * 2) / 2));
      if (plan.total + cs <= budget + 1e-9) { plan.combo = { legs: legs, P: P, stake: cs }; plan.total += cs; }
    }
    return plan;
  }
  function asItems(R, plan) {                              // alertes ntfy des paris conseillés : une notification 45 min avant chaque match
    if (!AS.alert || !plan || plan.stop) return [];
    return plan.items.filter(function (it) { return it.r.time; }).map(function (it) {
      return { id: 'as|' + it.r.bid, ko: kickoff({ date: R.T, time: it.r.time }), tags: ['moneybag'], title: 'Pari conseillé dans 45 min : ' + it.r.match,
        msg: it.r.pick + ' · mise conseillée ' + eur2(it.stake) + ' · cote minimale ' + (1 / it.pa).toFixed(2).replace('.', ',') };
    });
  }
  function asSync() {                                       // appelé quand la liste du jour est complète (tous les sports chargés)
    if (!AS.alert || !Alerts.topic() || TODAY.busy) return;
    var R = todayRows();
    Alerts.sync(favItems().concat(asItems(R, assistantPlan(R))));
  }
  function assistantHTML(R) {
    var plan = assistantPlan(R), pf = AS_PROF[AS.prof], mi = plan.mi;
    var h = '<div class="sec"><span class="dot g"></span>Mon assistant <small>mises conseillées pour aujourd’hui</small></div><div class="fm as-box">';
    h += '<div class="as-bar"><button class="chip pill' + (AS_OPEN ? ' on' : '') + '" data-as="open|' + (AS_OPEN ? 0 : 1) + '">⚙ ' + pf.name + ' · ' + AS.unit + ' €' + (AS.daily > 0 ? ' · ' + String(AS.daily).replace('.', ',') + ' €/jour' : '') + ' ' + (AS_OPEN ? '▴' : '▾') + '</button>' +
      '<button class="chip pill' + (AS.alert && Alerts.topic() ? ' on' : '') + '" data-as="alert|' + (AS.alert ? 0 : 1) + '">🔔 Alerte</button></div>';
    if (AS_OPEN) {
      h += '<div class="as-set"><div class="sub">Ton profil</div><div class="chips">' + Object.keys(AS_PROF).map(function (k) {
        return '<button class="chip pill' + (AS.prof === k ? ' on' : '') + '" data-as="prof|' + k + '">' + AS_PROF[k].name + '</button>'; }).join('') + '</div>';
      h += '<div class="sub">Ta mise de base</div><div class="chips">' + [2, 5, 10, 20].map(function (u) {
        return '<button class="chip pill' + (AS.unit === u ? ' on' : '') + '" data-as="unit|' + u + '">' + u + ' €</button>'; }).join('') + '</div>';
      h += '<div class="bt-line"><input id="as-daily" inputmode="decimal" placeholder="Budget du jour (€), sinon ' + (AS.unit * 3) + ' €" value="' + (AS.daily > 0 ? String(AS.daily).replace('.', ',') : '') + '"><button class="bt-b" data-as="daily|">Enregistrer</button></div></div>';
    }
    if (mi.budget > 0) h += '<div class="sub">Ce mois-ci : misé <b>' + eur2(mi.spent) + '</b> sur ' + eur2(mi.budget) + (mi.n ? ' · résultat <b>' + (mi.profit >= 0 ? '+' : '−') + eur2(Math.abs(mi.profit)) + '</b> sur ' + mi.n + ' paris terminés' : '') + '.</div>';
    else h += '<div class="sub">Fixe un budget mensuel dans « Mes paris » : l’assistant s’y adapte.</div>';
    plan.notes.forEach(function (n) { h += '<div class="bt-warn">' + esc(n) + '</div>'; });
    var hasT = !!Alerts.topic();
    if (AS.alert && !hasT) h += '<div class="bt-warn">Pour recevoir les alertes, renseigne d’abord le nom de ton sujet ntfy dans l’onglet Favoris (section « Alertes »).</div>';
    else if (AS.alert) h += '<div class="sub">🔔 ' + esc(Alerts.status() || 'Alertes 45 min avant chaque pari conseillé.') + '</div>';
    if (!plan.stop) {
      if (!plan.items.length) h += '<div class="empty">Aucun pari ne passe le seuil « ' + pf.name + ' » (' + Math.round(pf.min * 100) + ' % après prudence) aujourd’hui. Ne rien jouer est aussi une bonne décision.</div>';
      plan.items.forEach(function (it) {
        var r = it.r, mn = 1 / it.pa;
        h += '<div class="as-row"><div class="as-top"><span class="as-tag as-' + (it.tag === 'Très sûr' ? 'a' : it.tag === 'Sûr' ? 'b' : 'c') + '">' + it.tag + '</span><b>' + r.icon + ' ' + esc(r.match) + '</b><small>' + esc(r.time || '') + '</small></div>' +
          '<div class="as-pick">' + esc(r.pick) + '</div>' +
          '<div class="as-nums"><span>Réussite estimée <b>' + pct(it.pa) + '</b></span><span>Mise conseillée <b>' + eur2(it.stake) + '</b></span><span>Cote minimale <b>' + mn.toFixed(2).replace('.', ',') + '</b></span></div>' +
          '<div class="bt-act"><button class="bt-b" data-bet="' + esc(r.match + ' : ' + r.pick) + '" data-bsp="' + (AS_SPORT[r.icon] || 'autre') + '" data-bp="' + it.pa.toFixed(4) + '" data-bm="' + esc(r.bm) + '" data-bs="' + esc(r.bs) + '" data-bref="' + esc(r.bid) + '" data-bcat="Assistant" data-bstake="' + it.stake + '">€ Noter ce pari</button>' +
          '<button class="voir" ' + r.ref + '>Voir' + svg(IC.chev) + '</button></div></div>';
      });
      if (plan.combo) {
        COMBOS = [{ name: 'Assistant', legs: plan.combo.legs, P: plan.combo.P }];
        h += '<div class="as-row"><div class="as-top"><span class="as-tag as-c">Combiné</span><b>' + plan.combo.legs.length + ' sélections</b></div>' +
          plan.combo.legs.map(function (r) { return '<div class="as-pick">' + r.icon + ' ' + esc(r.match) + ' · ' + esc(r.pick) + '</div>'; }).join('') +
          '<div class="as-nums"><span>Réussite estimée <b>' + pct(plan.combo.P) + '</b></span><span>Mise conseillée <b>' + eur2(plan.combo.stake) + '</b></span><span>Cote minimale <b>' + (1 / plan.combo.P).toFixed(2).replace('.', ',') + '</b></span></div>' +
          '<div class="bt-act"><button class="bt-b" data-bcombo="0" data-bstake="' + plan.combo.stake + '">€ Noter ce combiné</button></div></div>';
      }
      if (plan.items.length) {
        var pAll = plan.items.reduce(function (t, it) { return t * it.pa; }, 1), exp = plan.items.reduce(function (t, it) { return t + it.pa; }, 0);
        h += '<div class="srcnote">Total conseillé : <b>' + eur2(plan.total) + '</b> sur ' + (plan.items.length + (plan.combo ? 1 : 0)) + ' paris. On s’attend à environ <b>' + exp.toFixed(1).replace('.', ',') + ' réussite' + (exp >= 2 ? 's' : '') + ' sur ' + plan.items.length + '</b> simples ; ' +
          'la probabilité que <b>tous</b> les simples passent est de ' + pct(pAll) + '. Plus la probabilité est haute, plus la cote est basse : le gain d’un pari très sûr reste petit.</div>';
      }
    }
    h += '<div class="srcnote"><b>Comment je décide.</b> Je ne garde, par match, que le pronostic le plus probable, après avoir retiré 3 points de prudence. Les marchés non validés par backtest perdent 2 points de plus (et sont exclus du profil prudent). Je laisse de côté les paris au-dessus de 93 % (cote trop basse pour valoir le coup) et les matchs déjà commencés. Mise : 100 % de ta mise de base à partir de 88 %, 50 % de 82 à 88 %, 30 % de 74 à 82 %. ' +
      '« Cote minimale » : en dessous, le bookmaker te paie moins que le vrai risque, ne joue pas. Ce sont des estimations, pas des certitudes : sur la durée, la marge des bookmakers fait perdre la plupart des parieurs, même avec de bons pronostics. ' +
      'Ne mise jamais d’argent dont tu as besoin. Joueurs Info Service : 09 74 75 13 13 (gratuit, anonyme).</div></div>';
    return h;
  }
  function todayHTML() {
    todayLoad();
    var R = todayRows(), h = '<div class="top"><h1>Aujourd’hui</h1></div><div class="sub">' + WD[parseD(R.T).getDay()] + ' ' + dm(R.T) + ' · tous sports confondus' +
      (TODAY.busy ? ' · chargement ' + TODAY.step + '/' + TODAY.total + '…' : '') + '</div>';
    if (R.counts.length) h += '<div class="chips">' + R.counts.map(function (c) { return '<span class="chip">' + c[0] + '<b>' + c[2] + ' ' + (c[4] || 'match') + (c[2] > 1 ? 's' : '') + '</b>' + (c[3] < c[2] ? '<small>' + (c[3] ? c[3] + ' avec pronostic' : 'sans pronostic') + '</small>' : '') + '</span>'; }).join('') + '</div>';
    if (!R.counts.length) return h + (TODAY.busy ? skel(4) : '<div class="empty">' + ( 'Aucun match avec pronostic aujourd’hui. Regarde l’onglet « Découvrir » pour les jours suivants.') + '</div>');
    h += assistantHTML(R);
    h += '<div class="sec"><span class="dot g"></span>Les pronostics les plus sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>';
    var seen = {}, shown = R.picks.filter(function (r) { var k = r.match; seen[k] = (seen[k] || 0) + 1; return seen[k] <= 2; }).slice(0, 15);
    h += shown.length ? shown.map(todayRow).join('') : '<div class="empty">Aucun pronostic sûr aujourd’hui.</div>';
    h += comboHTML(R);
    var seenF = {};
    var fv = R.favs.filter(function (r) { if (seenF[r.match]) return false; seenF[r.match] = 1; return true; }).slice(0, 10);
    if (fv.length) h += '<div class="sec"><span class="dot a"></span>Les favoris les plus nets <small>vainqueur à haute confiance</small></div>' + fv.map(todayRow).join('');
    return h + '<div class="sub" style="margin-top:14px">Les pronostics sûrs d’un même sport restent des estimations : environ 75 % de réussite en moyenne, jamais une certitude. Analyse indicative, pas un conseil de pari.</div>';
  }

  /* ------------------------------------------------------------ Formule 1 */
  D.f1 = D.f1 || {};
  var F1M = { win: 'Vainqueur du GP', pod: 'Podium', top6: 'Top 6', top10: 'Top 10 (points)' };
  function f1Date(iso, t) {
    if (!iso) return '';
    var d = iso.split('-'), when = t ? Tennis.paris(iso + 'T' + t.replace('Z', '').slice(0, 5)) : { d: iso, t: '' };
    return WD[parseD(when.d).getDay()] + ' ' + dm(when.d) + (when.t ? ' · ' + when.t : '');
  }
  function f1Bar(p, cls) { return '<div class="f1b ' + cls + '"><i style="width:' + Math.round(p * 100) + '%"></i><b>' + Math.round(p * 100) + '%</b></div>'; }
  function f1Picks(N) {
    var safe = [], less = [];
    N.drivers.forEach(function (d) {
      ['win', 'pod', 'top6', 'top10'].forEach(function (k) {
        var r = { m: F1M[k], s: d.n + ' (' + d.cn + ')', p: d[k] };
        if (d[k] >= SAFE) safe.push(r); else if (d[k] >= 0.3 && k !== 'top10') less.push(r);
      });
    });
    (N.duels || []).forEach(function (u) {
      var a = u.p >= 0.5, p = a ? u.p : 1 - u.p, r = { m: 'Duel ' + u.team, s: (a ? u.a : u.b) + ' devant ' + (a ? u.b : u.a), p: p };
      if (p >= SAFE) safe.push(r); else if (p >= 0.3) less.push(r);
    });
    // un seul pronostic sûr par pilote et marché imbriqué : on garde le plus « large » (top 10 > top 6 > podium) pour ne pas répéter
    var by = function (a, b) { return b.p - a.p; };
    return { safe: safe.sort(by), less: less.sort(by).slice(0, 12) };
  }
  function f1Row(r) { return '<div class="pr"><span class="pt">' + esc(r.s) + '<small class="sm">' + esc(r.m) + '</small></span><span class="pp">' + pct(r.p) + '</span></div>'; }
  function f1HTML() {
    var h = brand() + sportsBar(), N = D.f1.next, L = D.f1.last;
    if (!N && !L) return h + '<div class="empty">Données Formule 1 indisponibles pour le moment. Réessaie un peu plus tard.</div>';
    if (N) {
      var sess = N.sessions || {}, sl = [];
      if (sess.Qualifying) sl.push('Qualifications ' + f1Date(sess.Qualifying.date, sess.Qualifying.time));
      if (sess.Sprint) sl.push('Sprint ' + f1Date(sess.Sprint.date, sess.Sprint.time));
      sl.push('Course ' + f1Date(N.date, N.time));
      h += '<div class="main mid"><div class="k"><small>Prochain Grand Prix · manche ' + esc(N.round) + '</small><span class="badge mid">' + (N.use_grid ? 'Grille connue' : 'Avant les qualifications') + '</span></div>' +
        '<div class="hero"><div><div class="hl">' + esc(N.circuit) + '</div><div class="hn">' + esc(N.name) + '</div></div></div>' + sl.map(function (x) { return line(x.split(' ')[0], x.split(' ').slice(1).join(' ')); }).join('') + '</div>';
      h += '<div class="srcnote">' + (N.use_grid ? 'Les qualifications sont terminées : la <b>place sur la grille</b> est prise en compte.' : 'Avant les qualifications : prédiction fondée sur le niveau des pilotes et des voitures. Elle sera <b>affinée dès que la grille sera connue</b> (le site se met à jour toutes les 2 h).') + '</div>';
      var P = f1Picks(N);
      h += '<div class="sec"><span class="dot g"></span>Pronostics sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
        (P.safe.length ? '<div class="fm">' + P.safe.map(f1Row).join('') + '</div>' : '<div class="empty">Aucun pronostic n’atteint ce seuil (grille encore très ouverte).</div>');
      h += '<div class="sec"><span class="dot a"></span>Moins sûrs</div><div class="fm">' + P.less.map(f1Row).join('') + '</div>';
      if (N.pole && N.pole.length) h += '<div class="sec"><span class="dot g"></span>Pole position <small>favoris</small></div><div class="fm">' + N.pole.map(function (x) {
        return '<div class="pr"><span class="pt">' + esc(x.n) + '</span><span class="pp">' + pct(x.p) + '</span></div>'; }).join('') + '</div>';
      h += '<div class="sec"><span class="dot g"></span>Toutes les probabilités</div><div class="fm f1t"><div class="f1h"><span>Pilote</span><span>Victoire</span><span>Podium</span><span>Top 6</span><span>Top 10</span></div>' +
        N.drivers.map(function (d) {
          return '<div class="f1r"><span class="f1n">' + esc(d.n) + '<small>' + esc(d.cn) + (d.grid ? ' · grille ' + d.grid : '') + '</small></span>' + f1Bar(d.win, 'g') + f1Bar(d.pod, 'g') + f1Bar(d.top6, 'a') + f1Bar(d.top10, 'a') + '</div>'; }).join('') + '</div>';
    } else {
      h += '<div class="empty">Pas de Grand Prix cette semaine.</div>';
    }
    if (L) {
      var top3 = L.results.slice().sort(function (a, b) { return b.pod - a.pod; }).slice(0, 3).map(function (x) { return x.n; });
      var real3 = L.results.filter(function (x) { return x.pos <= 3; });
      var okn = real3.filter(function (x) { return top3.indexOf(x.n) >= 0; }).length;
      h += '<div class="sec"><span class="dot g"></span>Dernier Grand Prix : ' + esc(L.name) + ' <small>' + dm(L.date) + '</small></div><div class="srcnote">Notre top 3 (pronostic fait avec la grille, sans connaître la course) : <b>' +
        okn + ' sur 3</b> bons pilotes sur le podium.</div><div class="fm">' + L.results.slice(0, 10).map(function (x) {
          var ok = x.pos <= 3 && x.pod >= 0.3;
          return '<div class="pr ' + (x.pos <= 3 ? (x.pod >= 0.3 ? 'ok' : 'ko') : '') + '"><span class="pt">' + x.pos + '. ' + esc(x.n) + '<small class="sm">grille ' + (x.grid || '–') + '</small></span><span class="pp">podium ' + pct(x.pod) + '</span></div>'; }).join('') + '</div>';
    }
    var bt = D.f1.bt;
    if (bt && bt.races) {
      h += '<div class="sec"><span class="dot g"></span>Fiabilité du modèle F1</div><div class="fm"><div class="sub">Test sur <b>' + bt.races + ' Grands Prix</b> depuis 2025, chaque pronostic fait avec la grille mais sans connaître la course. ' +
        'Le vainqueur est le favori du modèle dans <b>' + pct(bt.top1) + '</b> des courses.</div><table class="tbl"><thead><tr><th>Marché</th><th>Sûrs</th><th>Annoncé</th><th>Réel</th></tr></thead><tbody>' +
        Object.keys(F1M).map(function (k) { var m = bt.markets[k]; return '<tr><td>' + F1M[k] + '</td><td>' + m.n_safe + '</td><td>' + (m.said != null ? pct(m.said) : '–') + '</td><td><b>' + (m.real != null ? pct(m.real) : '–') + '</b></td></tr>'; }).join('') +
        '</tbody></table></div>';
    }
    return h;
  }

  /* ------------------------------------------------------------ compétitions : un championnat ou une coupe = une page avec tous ses matchs */
  var FR_COMP = { 'Friendlies': 'Matchs amicaux', 'Friendlies Clubs': 'Amicaux de clubs', 'UEFA Nations League': 'Ligue des Nations', 'FA Cup': 'FA Cup', 'Copa del Rey': 'Coupe du Roi',
    'World Cup': 'Coupe du Monde', 'UEFA Champions League': 'Ligue des Champions', 'UEFA Europa League': 'Ligue Europa', 'UEFA Europa Conference League': 'Ligue Conférence',
    'DFB Pokal': 'Coupe d’Allemagne', 'Coppa Italia': 'Coupe d’Italie', 'League Cup': 'Coupe de la Ligue', 'Segunda División': 'La Liga 2', 'Liga Profesional Argentina': 'Primera División' };
  var FR_CTRY = { 'World': 'Monde', 'Wales': 'Pays de Galles', 'Scotland': 'Écosse', 'Northern-Ireland': 'Irlande du Nord', 'England': 'Angleterre', 'Spain': 'Espagne', 'Germany': 'Allemagne',
    'Italy': 'Italie', 'Argentina': 'Argentine', 'Brazil': 'Brésil', 'Netherlands': 'Pays-Bas', 'Belgium': 'Belgique', 'Turkey': 'Turquie', 'Greece': 'Grèce', 'USA': 'États-Unis',
    'Mexico': 'Mexique', 'Japan': 'Japon', 'Norway': 'Norvège', 'Sweden': 'Suède', 'Denmark': 'Danemark', 'Poland': 'Pologne', 'Romania': 'Roumanie', 'Switzerland': 'Suisse',
    'Finland': 'Finlande', 'Ireland': 'Irlande', 'Saudi-Arabia': 'Arabie saoudite', 'Australia': 'Australie', 'South-Korea': 'Corée du Sud', 'Morocco': 'Maroc', 'Austria': 'Autriche',
    'Czech-Republic': 'Tchéquie', 'Croatia': 'Croatie', 'Hungary': 'Hongrie', 'Serbia': 'Serbie', 'Bulgaria': 'Bulgarie', 'Slovakia': 'Slovaquie', 'Belarus': 'Biélorussie',
    'Colombia': 'Colombie', 'Ecuador': 'Équateur', 'Estonia': 'Estonie', 'Canada': 'Canada' };
  // championnats que notre modèle couvre : leurs matchs « API-Football » ne sont pas listés une deuxième fois
  var EXT_DIV = { 'France|Ligue 1': 'F1', 'France|Ligue 2': 'F2', 'England|Premier League': 'E0', 'England|Championship': 'E1', 'Spain|La Liga': 'SP1', 'Spain|Segunda División': 'SP2',
    'Germany|Bundesliga': 'D1', 'Germany|2. Bundesliga': 'D2', 'Italy|Serie A': 'I1', 'Italy|Serie B': 'I2', 'Netherlands|Eredivisie': 'N1', 'Belgium|Jupiler Pro League': 'B1',
    'Portugal|Primeira Liga': 'P1', 'Turkey|Süper Lig': 'T1', 'Greece|Super League 1': 'G1', 'Scotland|Premiership': 'SC0', 'USA|Major League Soccer': 'USA', 'Mexico|Liga MX': 'MEX',
    'Argentina|Liga Profesional Argentina': 'ARG', 'Japan|J1 League': 'JPN', 'Norway|Eliteserien': 'NOR', 'Sweden|Allsvenskan': 'SWE', 'Denmark|Superliga': 'DNK', 'Poland|Ekstraklasa': 'POL',
    'Romania|Liga I': 'ROU', 'Switzerland|Super League': 'SWZ', 'Finland|Veikkausliiga': 'FIN', 'Ireland|Premier Division': 'IRL', 'Brazil|Serie A': 'BRA' };
  var INTL = /^(fifa|uefa|concacaf|conmebol|caf|afc|global|club)\./;
  var CAL_REQ = false;
  function normT(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function sameTeam(a, b) { a = normT(a); b = normT(b); return !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0); }
  function extFor(c) {           // prédiction API-Football du même match (même jour, une équipe en commun)
    var hit = D.ext.filter(function (e) { return e.date === c.date && (sameTeam(e.home, c.home) || sameTeam(e.away, c.away)); });
    return hit.length ? hit[0] : null;
  }
  function calGroups() {
    var T = parisToday(), g = {}, order = [];
    (D.cal || []).forEach(function (c) {
      if (!g[c.s]) { g[c.s] = { key: 'S|' + c.s, s: c.s, name: c.fr, sub: c.cfr, w: c.w, items: [], n: 0 }; order.push(c.s); }
      g[c.s].items.push(c);
      if (c.date >= T) g[c.s].n++;
    });
    return order.map(function (s) { return g[s]; }).filter(function (x) { return x.n > 0; });
  }
  function apiOnlyGroups() {      // matchs d'API-Football qui ne figurent ni dans notre modèle ni dans le calendrier ESPN
    var idx = {}, out = [];
    D.ext.forEach(function (e) {
      var dv = EXT_DIV[e.country + '|' + e.lg];
      if (dv && D.leagues[dv] && D.fixtures.some(function (f) { return f.div === dv; })) return;
      if ((D.cal || []).some(function (c) { return c.date === e.date && (sameTeam(e.home, c.home) || sameTeam(e.away, c.away)); })) return;
      var k = 'X|' + e.lg + '|' + e.country;
      if (!(k in idx)) { idx[k] = out.length; out.push({ key: k, name: FR_COMP[e.lg] || e.lg, sub: FR_CTRY[e.country] || e.country, n: 0 }); }
      out[idx[k]].n++;
    });
    return out;
  }
  function competitions() {
    var L = [], I = [], O = [], F = [];
    D.order.forEach(function (div) {
      var fl = D.fixtures.filter(function (f) { return f.div === div; });
      if (!fl.length) return;
      var lm = lmeta(div), sub = {};
      fl.forEach(function (f) { if (f.cp) { (sub[f.cp] = sub[f.cp] || { n: 0, cc: f.cc }).n++; } });
      if (Object.keys(sub).length) Object.keys(sub).forEach(function (cp) { I.push({ key: 'L|' + div + '|' + cp, name: cp, sub: (sub[cp].cc || lm[0]) + ' · notre modèle', flag: lm[2], n: sub[cp].n, s: '' }); });
      else L.push({ key: 'L|' + div, name: D.leagues[div].name, sub: lm[0], flag: lm[2], n: fl.length });
    });
    calGroups().forEach(function (g) { (INTL.test(g.s + '.') ? I : g.w ? F : O).push(g); });
    var cmp = function (a, b) { return a.sub < b.sub ? -1 : a.sub > b.sub ? 1 : a.name < b.name ? -1 : 1; };
    I.sort(function (a, b) { return b.n - a.n; });
    var X = apiOnlyGroups().sort(cmp);
    return { L: L, I: I, O: O.sort(cmp), F: F.sort(cmp), X: X, total: L.length + I.length + O.length + F.length + X.length };
  }
  function compRow(c) {
    return '<button class="comp" data-day="comp:' + esc(c.key) + '"><span class="cf">' + (c.flag || svg(IC.trophy)) + '</span><span class="cn">' + esc(c.name) + '<small>' + esc(c.sub) + '</small></span><span class="cnt">' + c.n + '</span>' + svg(IC.chev) + '</button>';
  }
  function compMatch(q, c) { return !q || normT(c.name + ' ' + c.sub).indexOf(normT(q)) >= 0; }
  function compListHTML() {
    var C = competitions(), q = st.cq || '', h = '', any = false;
    var sec = function (title, small, list, dot) {
      list = list.filter(function (c) { return compMatch(q, c); });
      if (!list.length) return;
      any = true;
      h += '<div class="sec"><span class="dot ' + dot + '"></span>' + title + ' <small>' + small + '</small></div>' + list.map(compRow).join('');
    };
    sec('Championnats avec notre modèle', 'pronostics complets', C.L, 'g');
    sec('Sélections et compétitions internationales', 'amicaux, Ligues des Nations, coupes d’Europe…', C.I, 'a');
    sec('Championnats et coupes des autres pays', 'affiche et cotes quand elles existent', C.O, 'a');
    sec('Football féminin', '', C.F, 'a');
    sec('Autres matchs du jour', 'prédictions API-Football', C.X, 'a');
    return any ? h : '<div class="empty">Aucune compétition ne correspond à « ' + esc(q) + ' ».</div>';
  }
  function compsHTML() {
    var C = competitions(), h = '<div class="srcnote">Choisis une compétition pour voir <b>tous ses matchs</b> (<b>' + C.total + '</b> compétitions ont des matchs dans les prochains jours ; la liste change chaque jour). ' +
      'Hors de notre modèle, tu as l’affiche, le score et, quand elles existent, les probabilités déduites des cotes.</div>';
    h += '<div class="tools"><label class="search">' + svg(IC.search) + '<input id="cq" type="search" placeholder="Chercher une compétition ou un pays" autocomplete="off" value="' + esc(st.cq || '') + '"></label></div>';
    if (!isLoaded('cal')) h += skel(3);
    return h + '<div id="clist">' + compListHTML() + '</div>';
  }
  function calRow(c) {
    var x = extFor(c), p = c.p, fav = p ? p.indexOf(Math.max.apply(null, p)) : -1, fn = p ? [c.home, 'Nul', c.away][fav] : '', right, left = esc(c.time);
    if (c.st === 'post') { right = '<span class="cfp high">Terminé · ' + c.hs + ' – ' + c.as_ + '</span>'; left += '<small>fini</small>'; }
    else if (c.st === 'in') { right = '<span class="cfp mid">En cours · ' + c.hs + ' – ' + c.as_ + '</span>'; left += '<small>live</small>'; }
    else right = p ? '<span class="cfp low">' + pct(p[fav]) + ' · ' + esc(fn) + '</span>' : '<span class="cfp low">cotes indisponibles</span>';
    var api = x && c.st === 'pre' ? '<div class="apil">API-Football : ' + esc([x.home, 'Nul', x.away][x.favIdx]) + ' ' + pct(x.fav) + ' <button class="bt-b" data-openext="' + x.i + '">Voir</button></div>' : '';
    return '<div class="mrow low ext"><div class="tm">' + left + '</div><div class="tt">' + tn(c.home) + tn(c.away) + '</div><div class="act">' + right + '</div>' + (p && c.st === 'pre' ? miniBar(p) : '') + api + '</div>';
  }
  function dayLabel(d) { var T = parisToday(); return d === T ? 'Aujourd’hui · ' + dm(d) : d === isoDate(new Date(parseD(T).getTime() - 864e5)) ? 'Hier · ' + dm(d) : WD[parseD(d).getDay()] + ' ' + dm(d); }
  function compHTML(key) {
    var p = key.split('|'), h = '<button class="chip pill" data-day="comps" style="margin-bottom:10px">‹ Toutes les compétitions</button>';
    if (p[0] === 'L') {
      var div = p[1], list = D.fixtures.filter(function (f) { return f.div === div && (!p[2] || f.cp === p[2]); }).sort(function (a, b) { return kickoff(a) - kickoff(b); }), lm = lmeta(div);
      h += '<div class="lgh"><span class="lb" style="--lc:' + lm[1] + '">' + lm[2] + '</span><div class="ln">' + esc(p[2] || D.leagues[div].name) + '<small>' + esc((list[0] && list[0].cc) || lm[0]) + ' · notre modèle</small></div><span class="cnt">' + list.length + '</span></div>';
      if (!list.length) return h + '<div class="empty">Aucun match à venir pour cette compétition dans les prochains jours.</div>';
      var cur = '';
      list.forEach(function (f) {
        if (f.date !== cur) { cur = f.date; h += '<div class="cdl">' + WD[parseD(f.date).getDay()] + ' ' + dm(f.date) + '</div>'; }
        h += row(f, false);
      });
      return h;
    }
    if (p[0] === 'S') {
      var g = calGroups().filter(function (x) { return x.s === p[1]; })[0] || ((D.cal || []).some(function (c) { return c.s === p[1]; }) ? { name: p[1], sub: '', items: (D.cal || []).filter(function (c) { return c.s === p[1]; }) } : null);
      if (!g) return h + '<div class="empty">Cette compétition n’a plus de match dans les prochains jours.</div>';
      h += '<div class="srcnote">Hors de notre modèle : l’<b>affiche</b>, le <b>score</b> et, quand elles existent, les <b>probabilités déduites des cotes</b> (sans marge). Pas de pronostic « sûr » ici. Les résultats sont enregistrés pour mesurer la fiabilité des cotes (onglet Fiabilité).</div>';
      h += '<div class="lgh"><span class="lb" style="--lc:#5a93ff">' + svg(IC.trophy) + '</span><div class="ln">' + esc(g.name) + '<small>' + esc(g.sub) + '</small></div><span class="cnt">' + g.items.length + '</span></div>';
      var items = g.items.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : 1; }), cd = '';
      items.forEach(function (c) {
        if (c.date !== cd) { cd = c.date; h += '<div class="cdl">' + dayLabel(c.date) + '</div>'; }
        h += calRow(c);
      });
      return h;
    }
    var xs = D.ext.filter(function (e) { return e.lg === p[1] && e.country === p[2]; });
    h += '<div class="srcnote">Prédictions d’<b>API-Football</b> (modèle différent du nôtre, non testé). Seuls les matchs du jour sont disponibles.</div>';
    h += '<div class="lgh"><span class="lb" style="--lc:#5a93ff">' + svg(IC.trophy) + '</span><div class="ln">' + esc(FR_COMP[p[1]] || p[1]) + '<small>' + esc(FR_CTRY[p[2]] || p[2]) + '</small></div><span class="cnt">' + xs.length + '</span></div>';
    return h + (xs.length ? xs.map(extRow).join('') : '<div class="empty">Aucun match aujourd’hui pour cette compétition.</div>');
  }
  var YOUTH = /(^|\s)U-?(1[5-9]|2[0-3])($|\s)/;
  function youthHTML() {                      // matchs de jeunes (U15 à U23) : calendrier ESPN + amicaux API-Football, sous la liste des matchs
    var rows = [], seen = [];
    (D.cal || []).forEach(function (c) { if (c.date >= parisToday() && (YOUTH.test(c.home) || YOUTH.test(c.away))) { rows.push({ d: c.date, t: c.time, h: calRow(c) }); seen.push(c); } });
    D.ext.forEach(function (e) {
      if (!(YOUTH.test(e.home) || YOUTH.test(e.away))) return;
      if (seen.some(function (c) { return c.date === e.date && (sameTeam(e.home, c.home) || sameTeam(e.away, c.away)); })) return;
      rows.push({ d: e.date, t: e.time, h: extRow(e) });
    });
    if (st.day !== 'all' && /^\d{4}-/.test(st.day)) rows = rows.filter(function (r) { return r.d === st.day; });      // pastille d'un jour : seulement ce jour-là
    if (!rows.length) return '';
    rows.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    var h = '<div class="sec"><span class="dot a"></span>Matchs de jeunes <small>' + rows.length + ' · U15 à U23, hors de notre modèle</small></div>', cur = '';
    rows.forEach(function (r) {
      if (r.d !== cur) { cur = r.d; h += '<div class="cdl">' + dayLabel(r.d) + '</div>'; }
      h += r.h;
    });
    return h;
  }
  function homeHTML() {
    if (!isLoaded('cal') && !CAL_REQ) { CAL_REQ = true; loadLazy('cal', function () { if (st.tab === 'home' && st.sport === 'foot' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } }); }
    var fx = D.fixtures, days = [], past = pastDates();
    fx.forEach(function (f) { if (days.indexOf(f.date) < 0) days.push(f.date); });
    days.sort();
    var h = brand() + sportsBar(), inPast = st.day.indexOf('past:') === 0 || st.day === 'week' || st.day === 'ext' || st.day === 'comps' || st.day.indexOf('comp:') === 0;
    var ext = fx.length > 0 && Math.min.apply(null, fx.map(function (f) { return +kickoff(f); })) - Date.now() > 7 * 864e5;
    if (!fx.length && !past.length && !D.daily.length && !D.ext.length && !(D.cal || []).length && isLoaded('cal')) {
      return h + '<div class="empty">Aucun match à venir dans les 5 prochains jours pour les championnats suivis. ' +
        'Utilise l’onglet <b>Analyser</b> pour étudier n’importe quelle affiche.</div>';
    }
    if (fx.length && !inPast) {
      var nHigh = fx.filter(function (f) { return f.conf === 'high'; }).length;
      var avg = fx.reduce(function (s, f) { return s + f.fav; }, 0) / fx.length;
      h += '<div class="pulse"><div><b data-n="' + fx.length + '">' + fx.length + '</b><span>' + 'matchs à venir' + '</span></div><div class="hi"><b data-n="' + nHigh + '">' + nHigh +
        '</b><span>haute confiance</span></div><div><b data-n="' + Math.round(avg * 100) + '" data-s="%">' + pct(avg) + '</b><span>favori en moyenne</span></div></div>';
    }
    h += '<div class="chips">';
    if (D.daily.length) h += '<button class="chip past' + (st.day === 'week' ? ' on' : '') + '" data-day="week">Bilan<b>' + svg(IC.check) + ' semaine</b></button>';
    past.forEach(function (d) {
      h += '<button class="chip past' + (st.day === 'past:' + d ? ' on' : '') + '" data-day="past:' + d + '">' + pastLabel(d) + '<b>' + svg(IC.check) + ' ' + dm(d) + '</b></button>';
    });
    if (fx.length) {
      h += '<button class="chip' + (st.day === 'all' ? ' on' : '') + '" data-day="all">' + (ext ? 'À venir' : 'Prochains jours') + '<b>' + fx.length + ' matchs</b></button>';
      days.forEach(function (d) {
        h += '<button class="chip' + (st.day === d ? ' on' : '') + '" data-day="' + d + '">' + WD[parseD(d).getDay()] + '<b>' + dm(d) + '</b></button>';
      });
    }
    if (D.ext.length) h += '<button class="chip' + (st.day === 'ext' ? ' on' : '') + '" data-day="ext">Autres matchs<b>' + D.ext.length + ' aujourd’hui</b></button>';
    var nc = competitions().total;
    if (nc) h += '<button class="chip' + (st.day === 'comps' || st.day.indexOf('comp:') === 0 ? ' on' : '') + '" data-day="comps">Compétitions<b>' + nc + '</b></button>';
    h += '</div>';
    if (inPast) return h + (st.day === 'ext' ? extHTML() : st.day === 'week' ? weekHTML() : st.day === 'comps' ? compsHTML() : st.day.indexOf('comp:') === 0 ? compHTML(st.day.slice(5)) : pastHTML(st.day.slice(5)));
    if (!fx.length) return h + '<div class="empty">Aucun match à venir dans les prochains jours. Les résultats d’hier sont dans les pastilles ci-dessus.</div>';
    if (ext) h += '<div class="sub">Pas de match dans les 7 prochains jours (trêve ?). Voici les prochaines rencontres.</div>';
    var top = fx.slice().sort(function (a, b) { return b.fav - a.fav; }).slice(0, 6);
    h += '<div class="stitle">Les sélections les plus fortes</div><div class="car">' + top.map(fcard).join('') + '</div>';
    h += '<div class="tools"><label class="search">' + svg(IC.search) + '<input id="q" type="search" placeholder="Chercher une équipe" autocomplete="off" value="' + esc(st.q) + '"></label>' +
      '<button class="sortb" data-sort>' + svg(IC.sort) + (st.sort === 'conf' ? 'Confiance' : 'Heure') + '</button></div>';
    h += '<div class="chips">' + [['all', 'Tous'], ['high', 'Haute confiance'], ['fav', '★ Favoris']].map(function (x) {
      return '<button class="chip pill' + (st.filter === x[0] ? ' on' : '') + '" data-filter="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    return h + '<div id="list">' + listHTML() + '</div>' + (st.filter === 'all' && !st.q ? youthHTML() : '');
  }

  var ALMSG = '';
  function favItems() {
    return D.fixtures.filter(function (f) { return favs[f.id]; }).map(function (f) {
      return { id: f.id, ko: +kickoff(f), title: 'Dans 45 min : ' + f.home + ' – ' + f.away, msg: cpName(f) + ' · ' + favName(f) + ' ' + pct(f.fav) };
    });
  }
  function alertsPanel() {
    var t = Alerts.topic();
    return '<div class="sec"><span class="dot a"></span>Alertes sur mes favoris</div><div class="fm"><div class="sub">Reçois une notification <b>45 minutes avant</b> chaque match mis en favori (★). ' +
      'Colle ici le nom de ton sujet ntfy, celui auquel ton téléphone est abonné dans l’appli ntfy : il reste <b>sur cet appareil</b> et n’est jamais publié.</div>' +
      '<div class="bt-line"><input id="al-topic" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nom du sujet ntfy" value="' + esc(t) + '">' +
      '<button class="bt-b" data-alsave>' + (t ? 'Mettre à jour' : 'Activer') + '</button></div>' +
      (t ? '<div class="sub" style="margin-top:8px">' + esc(Alerts.status()) + '</div><div class="bt-act"><button class="bt-b" data-altest>Envoyer une notification test</button><button class="bt-b l" data-aloff>Désactiver</button></div>' : '') +
      (ALMSG ? '<div class="bt-warn">' + esc(ALMSG) + '</div>' : '') + '</div>';
  }
  function favsHTML() {
    var list = D.fixtures.filter(function (f) { return favs[f.id]; });
    var h = '<div class="top"><h1>Mes favoris</h1></div>';
    if (!list.length) {
      return h + '<div class="empty">Aucun favori pour l’instant. Touche l’étoile ☆ à côté d’un match dans l’onglet Découvrir pour le retrouver ici.</div>' + alertsPanel();
    }
    list.sort(function (a, b) { return kickoff(a) - kickoff(b); });
    return h + '<div class="sub">' + list.length + ' match' + (list.length > 1 ? 's' : '') + ' suivi' + (list.length > 1 ? 's' : '') + ', dans l’ordre des coups d’envoi.</div>' +
      list.map(function (f) { return '<div class="cdl">' + esc(cpName(f)) + ' · ' + countdown(f) + '</div>' + row(f, true); }).join('') + alertsPanel();
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
      '<button class="voir mid wide" data-bcomb style="margin-top:12px">€ Noter ce combiné dans Mes paris</button>' +
      '<button class="voir low wide" data-clear style="margin-top:12px">Vider le combiné</button>';
  }

  /* ------------------------------------------------------------ fiche match */
  function line(a, b) { return '<div class="mline"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>'; }
  var BETSP = { handball: 'hand', rugby15: 'rugby', TEN: 'tennis' };
  function betSport(d) { return d && d.div && !D.leagues[d.div] ? (BETSP[d.div] || d.div) : 'foot'; }
  function betRef(d) { return d.ref || (d.fi != null && D.fixtures[d.fi] ? D.fixtures[d.fi].id : ''); }
  function alt(s, best, d, m, cls) {
    var p = s[1], k = tkKey(d, m, s[0]), on = inTicket(k);
    return '<div class="alt' + (best ? ' best' : '') + '"><span>' + esc(s[0]) + '</span><span class="p">' + pct(p) + '</span>' +
      '<span class="acts"><button class="add bet" data-bet="' + esc(d.home + ' – ' + d.away + ' : ' + s[0]) + '" data-bsp="' + betSport(d) + '" data-bp="' + p.toFixed(4) + '" data-bm="' + esc(m) + '" data-bs="' + esc(s[0]) + '" data-bref="' + esc(betRef(d)) + '" data-bcat="' + (cls === 'g' ? 'Pronostic sûr' : 'Moins sûr') + '" aria-label="Noter ce pari dans Mes paris">€</button>' +
      '<button class="add' + (on ? ' on' : '') + '" data-add="' + esc(k) + '" data-p="' + p.toFixed(4) + '" data-mt="' + esc(d.home + ' – ' + d.away) +
      '" data-m="' + esc(m) + '" data-s="' + esc(s[0]) + '" data-bref="' + esc(betRef(d)) + '" aria-label="' + (on ? 'Retirer du combiné' : 'Ajouter au combiné') + '">' + svg(on ? IC.check : IC.plus) + '</button></span>' +
      '<span class="c">' + (p > 0.005 ? 'cote juste ' + (1 / p).toFixed(2) : 'très improbable') + '</span>' +
      '<div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div></div>';
  }
  function mkRow(cls, d) {
    return function (x) {
      return '<details class="mk"><summary><span class="mi ' + cls + '">' + mkIcon(x.m) + '</span><span class="mt">' + esc(x.m) +
        (x.v ? '' : ' <span class="warn" title="Marché non validé par backtest">⚠</span>') + Books.tags(x.f) +
        '</span><span class="pk ' + cls + '">' + esc(x.s) + ' · ' + pct(x.p) + '</span></summary><div class="alts">' +
        x.f.sels.map(function (s) { return alt(s, s[0] === x.s, d, x.m, cls); }).join('') + '</div></details>';
    };
  }
  /* haute confiance : pour chaque marché, la sélection la plus « payante » qui reste entre 85 % et 97 % (au-delà, la cote est trop basse pour valoir le coup) */
  function highConfHTML(M, d) {
    var byKind = {};
    M.fams.forEach(function (f) {
      if (f.lottery) return;
      var ok = f.sels.filter(function (x) { return x[1] >= 0.85 && x[1] < 0.97; });
      if (!ok.length) return;
      var c = { m: f.name, s: ok.reduce(function (a, b) { return b[1] < a[1] ? b : a; }) };       // la plus « payante » du marché
      if (!byKind[f.kind] || c.s[1] < byKind[f.kind].s[1]) byKind[f.kind] = c;                    // un seul marché par famille (handicaps, écarts, buts d'équipe…)
    });
    var best = Object.keys(byKind).map(function (k) { return byKind[k]; });
    best.sort(function (a, b) { return b.s[1] - a.s[1]; });
    if (!best.length) return '';
    return '<div class="sec hc"><span class="dot g"></span>Haute confiance de ce match <small>85 % à 97 %</small></div><div class="fm hcbox">' +
      best.slice(0, 8).map(function (x) {
        return '<div class="hcm">' + esc(x.m) + '</div>' + alt(x.s, true, d, x.m, 'g');
      }).join('') + '<div class="sub">Au-delà de 97 %, la cote est trop basse pour être intéressante : ces sélections sont masquées ici.</div></div>';
  }
  function predHTML(d, f) {
    var M = Engine.families(d.div, d.home, d.away, f && f.ov), C = Engine.classify(M.fams), p = M.p1x2;
    var mx = Math.max.apply(null, p), fi = p.indexOf(mx), conf = confOf(mx), names = [d.home, 'Match nul', d.away];
    var tg = M.over25 >= 0.5 ? ['Plus de 2,5', M.over25] : ['Moins de 2,5', 1 - M.over25];
    var bt = M.btts >= 0.5 ? ['Oui', M.btts] : ['Non', 1 - M.btts];
    var h = '<div class="main ' + conf + '"><div class="k"><small>Pronostic principal</small><span class="badge ' + conf + '">' + confIcon(conf) + CONF[conf] + '</span></div>' +
      '<div class="hero"><div><div class="hl">Résultat du match</div><div class="hn">' + esc(names[fi]) + '</div></div>' + gauge(mx, conf) + '</div>' +
      line('Nombre de buts', tg[0] + ' · ' + pct(tg[1])) +
      line('Les deux équipes marquent', bt[0] + ' · ' + pct(bt[1])) +
      '<div class="b3"><i class="h" style="width:' + p[0] * 100 + '%"></i><i class="d" style="width:' + p[1] * 100 + '%"></i><i class="a" style="width:' + p[2] * 100 + '%"></i></div>' +
      '<div class="l3"><span class="h">1 · ' + pct(p[0]) + '</span><span class="d">X · ' + pct(p[1]) + '</span><span class="a">2 · ' + pct(p[2]) + '</span></div></div>';
    h += '<div class="sub">Buts attendus ' + M.lh.toFixed(2) + ' – ' + M.la.toFixed(2) + (M.corners ? ' · corners ~' + M.corners.toFixed(1) : '') +
      (f && f.ov ? '<br>Buts attendus <b>mélangés avec les cotes du marché</b> (80 % marché, 20 % modèle) : le test montre des probabilités plus justes.' : '') + (f && f.mk ? '<br>Bookmaker (1X2, sans marge) : ' + pct(f.mk[0]) + ' / ' + pct(f.mk[1]) + ' / ' + pct(f.mk[2]) : '') + '</div>';
    var unk = [d.home, d.away].filter(function (t) { return !Engine.known(d.div, t); });
    if (unk.length) h += '<div class="sub warn">Pas d’historique pour ' + esc(unk.join(', ')) + ' : estimation peu fiable.</div>';
    h += highConfHTML(M, d);
    h += compareHTML(M, d) + heatHTML(M, d);
    h += '<div class="sec"><span class="dot g"></span>Pronostics sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
      (C.safe.length ? C.safe.map(mkRow('g', d)).join('') : '<div class="empty">Aucun pronostic n’atteint ce seuil.</div>');
    h += '<div class="sec"><span class="dot a"></span>Moins sûrs</div>' + C.less.map(mkRow('a', d)).join('');
    var ex = M.fams.filter(function (f) { return f.extra; }).map(function (f) {
      var top = f.sels.slice().sort(function (a, b) { return b[1] - a[1]; })[0];
      return { m: f.name, s: top[0], p: top[1], v: false, f: f };
    });
    if (ex.length) h += '<div class="sec"><span class="dot b"></span>Autres marchés <small>handicaps, écarts, combinaisons, mi-temps, minute du 1er but… · hors décompte des pronostics sûrs</small></div>' + ex.map(mkRow('b', d)).join('');
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
    var rows = cmpRow('Buts attendus', M.lh, M.la, f2) + (M.corners ? cmpRow('Corners attendus', M.ch, M.ca, f1) : '') +
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
    var lm = lmeta(d.div);
    var l1 = D.logos && D.logos[d.home], l2 = D.logos && D.logos[d.away];
    return '<div class="vs' + (l1 || l2 ? ' wm' : '') + '" style="' + (l1 ? '--l1:url(\'' + esc(logoUrl(l1)) + '\');' : '') + (l2 ? '--l2:url(\'' + esc(logoUrl(l2)) + '\')' : '') + '"><div class="side">' + crest(d.home, true) + '<b>' + esc(d.home) + '</b></div><div class="mid"><span class="vsp">VS</span></div>' +
      '<div class="side">' + crest(d.away, true) + '<b>' + esc(d.away) + '</b></div></div>' +
      '<div class="betbar"><button class="bt-b sm pri" data-bet="' + esc(d.home + ' – ' + d.away) + '" data-bsp="' + betSport(d) + '">€ Noter un pari</button>' +
      Books.links(d.home + ' – ' + d.away) + '</div>';
  }
  function detailPage(d) {
    var f = d.fi != null ? D.fixtures[d.fi] : null, lm = lmeta(d.div);
    return '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<div class="who"><span class="lgchip">' + lm[2] + ' ' + esc(f ? cpName(f) : D.leagues[d.div].name) + '</span><small>' +
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
  function navCount(today) {                                  // petite pastille sur l'onglet : matchs de foot du jour / favoris à venir
    var T = parisToday();
    return today ? D.fixtures.filter(function (f) { return f.date === T; }).length : D.fixtures.filter(function (f) { return favs[f.id]; }).length;
  }
  function decorate() {                                       // détails après chaque affichage : points « en direct », « terminé »
    var els = app.querySelectorAll('.cd, .tm small');
    for (var i = 0; i < els.length; i++) {
      var t = els[i].textContent.trim();
      if (t === 'En cours') els[i].classList.add('live'); else if (t === 'Terminé') els[i].classList.add('done');
    }
  }
  function renderNav() {
    var items = [['today', 'Aujourd’hui'], ['home', 'Découvrir'], ['fav', 'Favoris'], ['an', 'Analyser'], ['bets', 'Mes paris'], ['info', 'Fiabilité']];
    nav.innerHTML = '<div class="in">' + items.map(function (x) {
      var nb = x[0] === 'today' ? navCount(true) : x[0] === 'fav' ? navCount(false) : 0;
      return '<button data-tab="' + x[0] + '" class="' + (!st.detail && st.tab === x[0] ? 'on' : '') + '">' + svg(IC[x[0]]) + (nb ? '<i class="nb">' + nb + '</i>' : '') + '<span>' + x[1] + '</span></button>';
    }).join('') + '</div>';
  }
  function sportHTML() {
    var sp = st.sport, S = spOf(sp), key = S ? S.cfg.key : sp;
    if (sp === 'foot') return homeHTML();
    if (!SPORTS.some(function (x) { return x[0] === sp; }) || (!S && sp !== 'tennis' && sp !== 'f1' && sp !== 'golf')) return soonHTML();
    if (!isLoaded(key)) return loadingHTML();
    if (S) { spInit(S); return spHome(S); }
    return sp === 'tennis' ? tennisHTML() : sp === 'golf' ? golfHTML() : f1HTML();
  }
  function render() {
    if (st.detail) app.innerHTML = st.detail.sp ? spPage(spOf(st.detail.sp), st.detail) : st.detail.tn != null ? tnPage(st.detail.tn) : st.detail.ext != null ? extPage(st.detail.ext) : detailPage(st.detail);
    else if (st.tab === 'home') app.innerHTML = sportHTML();
    else if (st.tab === 'today') app.innerHTML = todayHTML();
    else if (st.tab === 'an') app.innerHTML = anHTML();
    else if (st.tab === 'fav') app.innerHTML = favsHTML();
    else if (st.tab === 'bets') {
      app.innerHTML = Bets.html();
      if (Bets.needsRes() && !isLoaded('res')) loadLazy('res', function () { if (st.tab === 'bets' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });
    }
    else if (st.tab === 'ticket') app.innerHTML = ticketHTML();
    else app.innerHTML = '<div id="info">' + bilanHTML() + document.getElementById('info-html').innerHTML + '</div>';
    renderNav();
    decorate();
    var fab = document.getElementById('fab');
    if (!fab) { fab = document.createElement('button'); fab.id = 'fab'; fab.setAttribute('data-ticket', ''); document.body.appendChild(fab); }
    fab.className = 'fab' + (ticket.length && st.tab !== 'ticket' ? '' : ' hide');
    fab.innerHTML = svg(IC.ticket) + '<span>Combiné · ' + ticket.length + ' · ' + pct(ticketProb()) + '</span>';
    if (!st.detail && st.tab === 'home') countUp();
  }
  function closeDetail() { st.detail = null; render(); window.scrollTo(0, st.scroll); }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-openext],[data-bilan],[data-spopen],[data-spday],[data-splg],[data-tnopen],[data-tnday],[data-tntour],[data-tnunk],[data-sport],[data-day],[data-filter],[data-fav],[data-back],[data-dtab],[data-sort],[data-toggle-theme],[data-bk],[data-bkopen],[data-bkk],[data-share],[data-add],[data-rm],[data-clear],[data-bcomb],[data-gosport],[data-bcombo],[data-as],[data-alsave],[data-altest],[data-aloff]');
    if (!t) return;
    if (t.hasAttribute('data-bilan')) {
      bilanRefreshAll(function () { if (st.tab === 'info' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });
      render();
    } else if (t.hasAttribute('data-sport')) {
      st.sport = t.getAttribute('data-sport');
      var S = spOf(st.sport), key = S ? S.cfg.key : st.sport;
      render();
      loadLazy(key, function (err) {
        if (st.sport !== t.getAttribute('data-sport')) return;
        if (!err && st.sport === 'tennis') setTM(D.tennis.matches || []);
        render();
        if (S) spLive(S); else if (st.sport === 'tennis') liveTennis();
      });
      var on = app.querySelector('.sp.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else if (t.hasAttribute('data-spopen')) {
      var a = t.getAttribute('data-spopen').split('|'), SS = spOf(a[0]);
      st.scroll = window.scrollY; st.detail = { sp: a[0], i: +a[1], id: SS.items[+a[1]].id };
      try { history.pushState({ d: 1 }, ''); st.pushed = true; } catch (err) { st.pushed = false; }
      render(); window.scrollTo(0, 0);
    } else if (t.hasAttribute('data-spday')) { var b = t.getAttribute('data-spday').split('|'); spOf(b[0]).ui.day = b[1]; render();
    } else if (t.hasAttribute('data-splg')) { var c = t.getAttribute('data-splg').split('|'); spOf(c[0]).ui.lg = c[1]; render();
    } else if (t.hasAttribute('data-tnopen')) {
      st.scroll = window.scrollY; st.detail = { tn: +t.getAttribute('data-tnopen'), id: TM[+t.getAttribute('data-tnopen')].id };
      try { history.pushState({ d: 1 }, ''); st.pushed = true; } catch (err) { st.pushed = false; }
      render(); window.scrollTo(0, 0);
    } else if (t.hasAttribute('data-tnday')) { st.tn.day = t.getAttribute('data-tnday'); render();
    } else if (t.hasAttribute('data-tntour')) { st.tn.tour = t.getAttribute('data-tntour'); render();
    } else if (t.hasAttribute('data-tnunk')) { st.tn.unk = !st.tn.unk; render();
    } else if (t.hasAttribute('data-openext')) {
      st.scroll = window.scrollY; st.detail = { ext: +t.getAttribute('data-openext') };
      try { history.pushState({ d: 1 }, ''); st.pushed = true; } catch (err) { st.pushed = false; }
      render(); window.scrollTo(0, 0);
    } else if (t.hasAttribute('data-open')) {
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
    else if (t.hasAttribute('data-bk')) { Books.toggle(t.getAttribute('data-bk')); var yb = window.scrollY; render(); window.scrollTo(0, yb); }
    else if (t.hasAttribute('data-bkopen')) { st.bkopen = !st.bkopen; var yo = window.scrollY; render(); window.scrollTo(0, yo); }
    else if (t.hasAttribute('data-bkk')) { var bk = t.getAttribute('data-bkk').split('|'); Books.toggleKind(bk[0], bk.slice(1).join('|')); var yk = window.scrollY; render(); window.scrollTo(0, yk); }
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
      else ticket.push({ k: key, p: +t.getAttribute('data-p'), mt: t.getAttribute('data-mt'), m: t.getAttribute('data-m'), s: t.getAttribute('data-s'), r: t.getAttribute('data-bref') || '' });
      saveTicket();
      var y = window.scrollY; render(); window.scrollTo(0, y);
    }
    else if (t.hasAttribute('data-rm')) { ticket.splice(+t.getAttribute('data-rm'), 1); saveTicket(); render(); }
    else if (t.hasAttribute('data-alsave')) {
      var tp = ((document.getElementById('al-topic') || {}).value || '').trim();
      if (!tp) { ALMSG = 'Indique le nom de ton sujet ntfy.'; render(); return; }
      Alerts.setTopic(tp); ALMSG = '';
      Alerts.sync(favItems(), true).then(function () { if (st.tab === 'fav' && !st.detail) render(); });
      render();
    }
    else if (t.hasAttribute('data-altest')) {
      ALMSG = 'Envoi du test…'; render();
      Alerts.test().then(function () { ALMSG = 'Notification test envoyée : regarde ton téléphone.'; }, function () { ALMSG = 'Envoi impossible (réseau ?).'; }).then(function () { if (st.tab === 'fav' && !st.detail) render(); });
    }
    else if (t.hasAttribute('data-aloff')) { Alerts.clear(); ALMSG = 'Alertes désactivées.'; render(); }
    else if (t.hasAttribute('data-as')) {
      var ap = t.getAttribute('data-as').split('|');
      if (ap[0] === 'open') AS_OPEN = ap[1] === '1';
      else if (ap[0] === 'prof') AS.prof = ap[1];
      else if (ap[0] === 'unit') AS.unit = +ap[1];
      else if (ap[0] === 'alert') AS.alert = ap[1] === '1';
      else if (ap[0] === 'daily') { var dv = parseFloat(String((document.getElementById('as-daily') || {}).value || '').replace(',', '.')); AS.daily = dv > 0 ? dv : 0; }
      asSave(); var ya = window.scrollY; render(); window.scrollTo(0, ya); asSync();
    }
    else if (t.hasAttribute('data-bcombo')) {
      var cb = COMBOS[+t.getAttribute('data-bcombo')];
      Bets.prefill({ label: cb.legs.map(function (r) { return r.match + ' : ' + r.pick; }).join(' + '), p: cb.P, kind: 'combine', cat: 'Combiné du jour',
        legs: cb.legs.map(function (r) { return { id: r.bid, m: r.bm, s: r.bs }; }), nLegs: cb.legs.length, stake: +t.getAttribute('data-bstake') || 0 });
      st.tab = 'bets'; st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0);
    }
    else if (t.hasAttribute('data-gosport')) {
      var gs = t.getAttribute('data-gosport');
      st.tab = 'home'; st.sport = gs; st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0);
      loadLazy(gs, function () { if (st.sport === gs && st.tab === 'home' && !st.detail) render(); });
    }
    else if (t.hasAttribute('data-bcomb')) {
      Bets.prefill({ label: ticket.map(function (x) { return x.mt + ' : ' + x.s; }).join(' + '), p: ticketProb(), kind: 'combine', cat: 'Combiné',
        legs: ticket.filter(function (x) { return x.r; }).map(function (x) { var ps = x.r; return { id: ps, m: x.m, s: x.s }; }), nLegs: ticket.length });
      st.tab = 'bets'; st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0);
    }
    else if (t.hasAttribute('data-clear')) { ticket = []; saveTicket(); render(); }
    else if (t.hasAttribute('data-share')) { copyText(shareText(st.detail, st.detail.fi != null ? D.fixtures[st.detail.fi] : null)); }
    else if (t.hasAttribute('data-dtab')) { st.dtab = t.getAttribute('data-dtab'); render(); }
    else if (t.hasAttribute('data-fav')) {
      var g = D.fixtures[+t.getAttribute('data-fav')];
      if (favs[g.id]) delete favs[g.id]; else favs[g.id] = 1;
      saveFavs(); render();
      Alerts.sync(favItems(), true).then(function () { if (st.tab === 'fav' && !st.detail) render(); });
    }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    st.q = e.target.value;
    var box = document.getElementById('list');
    if (box) box.innerHTML = listHTML();                 // on ne refait que la liste pour garder le clavier ouvert
  });
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'cq') return;
    st.cq = e.target.value;
    var box = document.getElementById('clist');
    if (box) box.innerHTML = compListHTML();
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
  Bets.resolver = function (id, m, sel) {
    if (!isLoaded('res') || !D.res) return null;
    var r = D.res.m && D.res.m[id], i;
    if (r) for (i = 0; i < r.length; i++) if (r[i][0] === m && r[i][1] === sel) return r[i][2] === 1;
    r = D.res.a && D.res.a[id];                       // football : toutes les sélections des fiches match (pas seulement nos pronostics)
    if (r) for (i = 0; i < r.length; i++) if (r[i][0] === m && r[i][1] === sel) return r[i][2] === 1;
    return null;
  };
  app.classList.add('anim'); setTimeout(function () { app.classList.remove('anim'); }, 1100);
  loadLazy('logos', function (err) { if (!err && !st.detail) { var yl = window.scrollY; render(); window.scrollTo(0, yl); } });          // logos des équipes : affichés dès qu'ils sont arrivés
  Alerts.sync(favItems(), true);                                              // programme les alertes des favoris (si le sujet ntfy est renseigné)
  if (AS.alert && Alerts.topic()) todayLoad();                                  // charge les matchs du jour pour programmer les alertes de l'assistant
  Bets.attach(app, render, function () { st.tab = 'bets'; st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0); });
  window.addEventListener('popstate', function () { if (st.detail) { st.pushed = false; closeDetail(); } });

  render();
  if (Date.now() - (LEDGER.t || 0) > 3 * 3600 * 1000) setTimeout(function () { bilanRefreshAll(function () { if (st.tab === 'info' && !st.detail) render(); }); }, 4000);
  loadLazy('hist', function () { if (st.detail && st.detail.fi != null) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });   // historique pour l'onglet « Forme », chargé en arrière-plan
})();
