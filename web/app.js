/* Interface : accueil par dates, fiche match, analyse libre, fiabilité. Les marchés viennent de Engine (engine.js). */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('data').textContent);
  Engine.setData(D);
  var SAFE = D.safeMin, app = document.getElementById('app'), nav = document.getElementById('nav');
  var CONF = { high: 'Haute confiance', mid: 'Confiance moyenne', low: 'Match ouvert' };
  var WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var st = { sport: 'foot', tab: 'home', day: 'all', filter: 'all', status: 'all', closed: {}, group: true, plSport: 'all', plSort: 'p', q: '', sort: 'time', tn: { day: 'all', tour: 'all', unk: false }, detail: null, dtab: 'pred', pushed: false, scroll: 0,
             an: { div: D.order[0], h: 0, a: 1 } };
  var favs = {};
  try { favs = JSON.parse(localStorage.getItem('pf-fav') || '{}'); } catch (e) { favs = {}; }
  var ticket = [];
  try { ticket = JSON.parse(localStorage.getItem('pf-ticket') || '[]'); } catch (e) { ticket = []; }
  function saveTicket() { try { localStorage.setItem('pf-ticket', JSON.stringify(ticket)); } catch (e) { /* ignoré */ } }
  function tkKey(d, m, sel) { return d.div + '|' + d.home + '|' + d.away + '|' + m + '|' + sel; }
  function inTicket(k) { return ticket.some(function (t) { return t.k === k; }); }
  function saveFavs() { try { localStorage.setItem('pf-fav', JSON.stringify(favs)); } catch (e) { /* stockage indisponible */ } }
  var DENS = 'comfort';                                    // affichage des listes : « comfort » ou « compact »
  try { DENS = localStorage.getItem('pf-dens') || 'comfort'; } catch (e) { /* ignoré */ }
  var THEME = '';                                         // '', 'dark', 'light' ou 'auto' (clair le jour, sombre la nuit)
  try { THEME = localStorage.getItem('pf-theme') || ''; } catch (e) { /* ignoré */ }
  function applyTheme() {
    var t = THEME === 'auto' ? (new Date().getHours() >= 8 && new Date().getHours() < 20 ? 'light' : 'dark') : THEME;
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme();
  setInterval(function () { if (THEME === 'auto') applyTheme(); }, 5 * 60 * 1000);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function parseD(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dm(s) { return s.slice(8) + '/' + s.slice(5, 7); }
  function dmNum(n) { var s = String(n); return s.slice(6) + '/' + s.slice(4, 6) + '/' + s.slice(2, 4); }
  function confOf(mx) { return mx >= 0.6 ? 'high' : mx >= 0.45 ? 'mid' : 'low'; }
  /* recherche tolérante : sans accents ni majuscules, par morceaux de mot, avec fautes de frappe et noms français courants (Grenade -> Granada) */
  var ALIAS = { grenade: 'granada', seville: 'sevilla', cologne: 'koln', munich: 'munchen', naples: 'napoli', turin: 'torino', rome: 'roma', lisbonne: 'lisboa', majorque: 'mallorca',
    vienne: 'wien', moscou: 'moskva', prague: 'praha', varsovie: 'warszawa', copenhague: 'kobenhavn', bale: 'basel', berne: 'bern', geneve: 'geneva', belgrade: 'beograd', athenes: 'athens',
    bruxelles: 'brussels', anvers: 'antwerp', gand: 'gent', bruges: 'brugge', francfort: 'frankfurt', nuremberg: 'nurnberg', hanovre: 'hannover', stockholm: 'stockholm', helsinki: 'helsinki',
    islande: 'iceland', croatie: 'croatia', serbie: 'serbia', coree: 'korea', algerie: 'algeria', maroc: 'morocco', tunisie: 'tunisia', egypte: 'egypt', bresil: 'brazil', allemagne: 'germany',
    espagne: 'spain', italie: 'italy', angleterre: 'england', ecosse: 'scotland', suisse: 'switzerland', autriche: 'austria', pologne: 'poland', turquie: 'turkey', grece: 'greece',
    belgique: 'belgium', pays: 'netherlands', hollande: 'netherlands', suede: 'sweden', norvege: 'norway', danemark: 'denmark', finlande: 'finland', irlande: 'ireland', mexique: 'mexico', kiev: 'kyiv', kyev: 'kyiv', louhansk: 'luhansk', lougansk: 'luhansk', kharkov: 'kharkiv', lvov: 'lviv', odessa: 'odesa', dniepr: 'dnipro',
    zaporojie: 'zaporizhzhia', chakhtar: 'shakhtar', tchernomorets: 'chornomorets', bereg: 'bereh', moscou: 'moskva', saint: 'st', petersbourg: 'petersburg', tbilissi: 'tbilisi', bakou: 'baku', erevan: 'yerevan', nicosie: 'nicosia', sofia: 'sofia', bucarest: 'bucuresti', budapest: 'budapest', belgrade: 'beograd' };
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function toks(t) { return norm(t).split(/[^a-z0-9]+/).filter(Boolean); }
  function fuzzy(q, text, tt) {                              // chaque mot cherché doit ressembler à un mot du texte
    var qs = toks(q);
    if (!qs.length) return true;
    var ts = tt || toks(text);
    return qs.every(function (w) {
      var alt = ALIAS[w];
      return ts.some(function (t) {
        if (t.indexOf(w) === 0 || (w.length >= 3 && t.indexOf(w) >= 0) || (alt && t.indexOf(alt) >= 0)) return true;
        if (w.length < 4) return false;
        var mx = w.length >= 7 ? 2 : 1;
        return lev(w, t, mx) <= mx || lev(w, t.slice(0, w.length), mx) <= mx;
      });
    });
  }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function curTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /* ------------------------------------------------------------ icônes */
  function svg(path, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var IC = {
    plan: '<path d="M4 17l5-6 4 3 7-8"/><path d="M15 6h5v5"/>',
    ticket: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4v2.5h6V4M9 13l2 2 4-4.2M9 18h6"/>',
    today: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M10 9v6" stroke-dasharray="1.5 2"/><path d="M14 11.5l1 1 2-2.4"/>',
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
    auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
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
  function lgPath(k) { if (!k || !D.logos) return null; if (String(k).indexOf('x:') === 0) k = k.slice(2); return D.logos['@' + k] || null; }
  function lgIcon(k, fallback) { var p = lgPath(k); return p ? '<span class="lbf">' + fallback + '</span><img class="lbi" src="' + logoUrl(p) + '" alt="" loading="lazy" onerror="this.remove()">' : fallback; }
  function compKey(key) { var a = String(key).split('|'); return a[0] === 'L' ? a[1] : a[0] === 'S' ? a[1] : null; }
  function logoUrl(p) { if (p.indexOf('leaguelogos/') === 0) return 'https://a.espncdn.com/combiner/i?img=/i/' + p + '&w=96&h=96'; return p.indexOf('http') === 0 ? p : 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + p + '&w=96&h=96'; }
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
  function nm(name) { return (D.full && D.full[name]) || name; }                       // nom complet du club quand on le connaît (« HJK Helsinki » pour « HJK »)
  function tn(name) { return '<span class="tn">' + crest(name) + '<em>' + esc(nm(name)) + '</em>' + formDots(name) + '</span>'; }
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
    f.key = norm(f.home + ' ' + f.away + ' ' + ((D.full && D.full[f.home]) || '') + ' ' + ((D.full && D.full[f.away]) || '') + ' ' + cpName(f));
  });
  function cpName(f) { return f.cp || D.leagues[f.div].name; }                  // vraie compétition (Ligue des Nations, qualifications…) pour les championnats regroupés
  function favName(f) { return [f.home, 'Match nul', f.away][f.favIdx]; }
  function kickoff(f) {
    var p = f.date.split('-'), t = (f.time || '00:00').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]);
  }
  /* scores en direct (football) : flux mondial d'ESPN lu depuis le téléphone, relié à nos matchs par le logo de chaque équipe */
  var LIVE = {}, LIVE_BUSY = false;
  function espLogo(t) { var u = (t && t.logo) || '', P = 'https://a.espncdn.com/i/teamlogos/'; return u.indexOf(P) === 0 ? u.slice(P.length) : ''; }
  function liveFoot(cb) {
    if (LIVE_BUSY) return;
    LIVE_BUSY = true;
    var T = parisToday(), days = [T], now = new Date();
    if (now.getHours() < 9) days.push(isoDate(new Date(parseD(T).getTime() - 864e5)));       // ESPN classe les matchs par jour américain : la nuit, ceux d'hier soir sont encore en cours
    Promise.all(days.map(function (d) {
      return fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?limit=1000&dates=' + d.replace(/-/g, '')).then(function (r) { return r.json(); }).catch(function () { return { events: [] }; });
    })).then(function (rs) {
      var list = [];
      rs.forEach(function (r) {
        (r.events || []).forEach(function (e) {
          try {
            var c = e.competitions[0].competitors, h = c.filter(function (x) { return x.homeAway === 'home'; })[0], a = c.filter(function (x) { return x.homeAway === 'away'; })[0], s = e.status.type.state;
            if (s === 'pre') return;
            list.push({ h: h.team.displayName, a: a.team.displayName, hl: espLogo(h.team), al: espLogo(a.team), hs: parseInt(h.score, 10), as: parseInt(a.score, 10), st: s, clock: e.status.type.shortDetail || e.status.displayClock || '' });
          } catch (x) { /* événement illisible : ignoré */ }
        });
      });
      var L = D.logos || {};
      D.fixtures.forEach(function (f) {
        if (f.date !== T && days.length < 2) return;
        var hit = list.filter(function (v) { return (L[f.home] && L[f.home] === v.hl && L[f.away] && L[f.away] === v.al) || (sameTeam(f.home, v.h) && sameTeam(f.away, v.a)); })[0];
        if (hit && isFinite(hit.hs) && isFinite(hit.as)) LIVE[f.id] = { st: hit.st, hs: hit.hs, as: hit.as, clock: hit.clock };
      });
      LIVE_BUSY = false;
      if (cb) cb();
    }, function () { LIVE_BUSY = false; });
  }
  function liveWanted() {                                   // y a-t-il un match de foot en cours ou sur le point de commencer ?
    var T = parisToday(), nowMs = Date.now();
    return D.fixtures.some(function (f) { if (f.date !== T && f.date !== isoDate(new Date(parseD(T).getTime() - 864e5))) return false; var d = nowMs - kickoff(f); return d > -10 * 60000 && d < 3.5 * 3600000 || (LIVE[f.id] && LIVE[f.id].st === 'in'); });
  }
  function liveTick() {
    if (document.visibilityState !== 'visible' || !liveWanted()) return;
    liveFoot(function () {
      var ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;      // on ne redessine pas pendant une saisie
      var y0 = window.scrollY; render(); window.scrollTo(0, y0);
    });
  }
  function countdown(f) {                                   // « Dans 2 j 5 h », « Dans 3 h 20 », « En direct · 1-0 · 67' »
    var LV = f.id && LIVE[f.id];
    if (LV) return LV.st === 'in' ? 'En direct · ' + LV.hs + '-' + LV.as + ' · ' + LV.clock : 'Terminé · ' + LV.hs + '-' + LV.as;
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
      '<div class="duel"><div class="s' + (f.favIdx === 0 && f.fav >= 0.5 ? ' fv' : '') + '">' + crest(f.home, true) + '<b>' + esc(nm(f.home)) + '</b>' + formDots(f.home) + '</div><span class="vsp">VS</span>' +
      '<div class="s' + (f.favIdx === 2 && f.fav >= 0.5 ? ' fv' : '') + '">' + crest(f.away, true) + '<b>' + esc(nm(f.away)) + '</b>' + formDots(f.away) + '</div></div>' + miniBar(f.p) +
      '<div class="cfp ' + f.conf + '">' + confIcon(f.conf) + CONF[f.conf] + '</div>' +
      '<div class="pf">' + esc(favName(f)) + ' <b>' + pct(f.fav) + '</b></div>' +
      '<button class="voir wide ' + f.conf + '" data-open="' + f.i + '">Voir le pronostic ' + svg(IC.chev) + '</button></div>';
  }
  var CMP = [];                                             // matchs choisis pour la comparaison (indices dans D.fixtures)
  function cmpData(i) {
    var f = D.fixtures[i], M = Engine.families(f.div, f.home, f.away, f.ov), C = Engine.classify(M.fams), best = C.safe[0] || null, fam = function (name) { return M.fams.filter(function (x) { return x.name === name; })[0]; };
    var tg = fam('Total buts (plus)'), o25 = tg ? tg.sels.filter(function (s) { return /2,5/.test(s[0]); })[0] : null, bt = fam('Les deux équipes marquent'), by = bt ? bt.sels.filter(function (s) { return s[0] === 'Oui'; })[0] : null;
    return { f: f, M: M, C: C, best: best, o25: o25 ? o25[1] : null, btts: by ? by[1] : null };
  }
  function cmpPage(ids) {
    var A = cmpData(ids[0]), B = cmpData(ids[1]);
    function cell(a, b, fmt, higher) {                     // une ligne : la meilleure valeur est mise en avant
      var wa = higher && a > b + 1e-9, wb = higher && b > a + 1e-9;
      return '<div class="cv ' + (wa ? 'win' : '') + '">' + fmt(a) + '</div><div class="cv ' + (wb ? 'win' : '') + '">' + fmt(b) + '</div>';
    }
    function head(X) { var f = X.f; return '<div class="cph"><div class="cpl">' + esc(cpName(f)) + ' · ' + dm(f.date) + ' ' + esc(f.time || '') + '</div><div class="cpt">' + crest(f.home) + crest(f.away) + '</div><b>' + esc(nm(f.home)) + ' – ' + esc(nm(f.away)) + '</b></div>'; }
    var rows = [['Confiance du pronostic', cell(A.f.fav, B.f.fav, pct, true)], ['Favori', '<div class="cv">' + esc(favName(A.f)) + '</div><div class="cv">' + esc(favName(B.f)) + '</div>'],
      ['Buts attendus', cell(A.M.lh + A.M.la, B.M.lh + B.M.la, function (x) { return x.toFixed(2); }, false)], ['Plus de 2,5 buts', cell(A.o25 || 0, B.o25 || 0, pct, false)],
      ['Les deux équipes marquent', cell(A.btts || 0, B.btts || 0, pct, false)], ['Pronostics sûrs', cell(A.C.safe.length, B.C.safe.length, String, true)],
      ['Meilleur pronostic sûr', '<div class="cv ' + (A.best && B.best && A.best.p > B.best.p ? 'win' : '') + '">' + (A.best ? esc(A.best.s) + '<small>' + esc(A.best.m) + ' · ' + pct(A.best.p) + '</small>' : '–') + '</div><div class="cv ' + (A.best && B.best && B.best.p > A.best.p ? 'win' : '') + '">' + (B.best ? esc(B.best.s) + '<small>' + esc(B.best.m) + ' · ' + pct(B.best.p) + '</small>' : '–') + '</div>']];
    var wA = (A.best ? A.best.p : 0) >= (B.best ? B.best.p : 0), W = wA ? A : B, verdict = W.best ? '<b>' + esc(W.f.home + ' – ' + W.f.away) + '</b> : « ' + esc(W.best.s) + ' » à ' + pct(W.best.p) + ' (' + esc(W.best.m) + ').' : 'Aucun des deux n’a de pronostic sûr.';
    return '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button><div class="who"><span class="lgchip">⇄ Comparaison</span><small>2 matchs côte à côte</small></div></div>' +
      '<div class="cpg"><div class="cph0"></div>' + head(A) + head(B) + '</div>' +
      rows.map(function (r) { return '<div class="cpr"><div class="cpk">' + r[0] + '</div><div class="cpv">' + r[1] + '</div></div>'; }).join('') +
      '<div class="main high cpv-verdict"><div class="k"><small>Le plus sûr des deux</small></div><div class="sub" style="margin:6px 0 0">' + verdict + '</div></div>' +
      '<div class="sub" style="margin-top:12px">Les pourcentages sont des estimations de notre modèle ; « le plus sûr » compare seulement le meilleur pronostic de chaque match.</div>';
  }
  function ring(p, conf) {                                  // petit anneau de confiance
    var r = 8, c = 2 * Math.PI * r;
    return '<svg class="rg ' + conf + '" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="' + r + '" class="rgt"/><circle cx="11" cy="11" r="' + r + '" class="rgv" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 11 11)"/></svg>';
  }
  function formDots(team) {                                 // 5 derniers résultats : V / N / D
    var f = D.form && D.form[team];
    return f ? '<span class="f5" title="Forme récente : ' + f.split('').map(function (c) { return c === 'V' ? 'victoire' : c === 'N' ? 'nul' : 'défaite'; }).join(', ') + '">' + f.split('').map(function (c) { return '<i class="' + c + '"></i>'; }).join('') + '</span>' : '';
  }
  function lgTag(f, on) {                                   // nom du championnat au-dessus des équipes quand la liste n'est pas groupée
    if (!on) return '';
    var lm = lmeta(f.div);
    return '<span class="rlg"><b>' + esc(lm[2]) + '</b>' + esc(D.leagues[f.div].name) + '</span>';
  }
  function fscore(f) {                                      // score connu d'un match (en direct, ou terminé d'après le journal des résultats)
    var LV = f.id && LIVE[f.id];
    if (LV) return { h: LV.hs, a: LV.as, live: LV.st === 'in', clock: LV.clock };
    var sc = isLoaded('res') && D.res && D.res.s && D.res.s[f.id];
    return sc ? { h: sc[0], a: sc[1], live: false } : null;
  }
  function mainHit(f) { return Bets.resolver ? Bets.resolver(f.id, 'Résultat du match', favName(f)) : null; }
  var RES_REQ = false;
  function ensureRes() {
    if (RES_REQ || isLoaded('res')) return;
    RES_REQ = true;
    loadLazy('res', function () { if (st.tab === 'home' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } else if (st.detail) render(); });
  }
  function tnS(name, n, lv) { return '<span class="tnr">' + tn(name) + '<b class="scn' + (lv ? ' lv' : '') + '">' + n + '</b></span>'; }
  function row(f, multi, showLg) {
    var on = !!favs[f.id], cs = CMP.indexOf(f.i) >= 0, fs = fstate(f), sc = fs === 'soon' ? null : fscore(f), hit = fs === 'done' && sc && !sc.live ? mainHit(f) : null;
    if (fs === 'live' || fs === 'done') {
      var lv = fs === 'live', verdict = lv ? '<span class="cfp livechip"><i></i>EN DIRECT</span>' :
        hit === true ? '<span class="cfp rv ok">' + svg(IC.check) + 'Pronostic réussi</span>' : hit === false ? '<span class="cfp rv ko">' + svg(IC.x) + 'Raté</span>' : '<span class="cfp rv">Terminé</span>';
      return '<div class="mrow ' + f.conf + (lv ? ' islive' : hit === true ? ' rok' : hit === false ? ' rko' : ' rdone') + '"><div class="tm' + (lv ? ' lvt' : '') + '">' + (lv ? esc(sc && sc.clock ? sc.clock : 'En cours') : 'FIN') + '<small>' + (f.time || '') + (multi ? ' · ' + dm(f.date) : '') + '</small>' +
        '<button class="star' + (on ? ' on' : '') + '" data-fav="' + f.i + '" aria-label="Favori">' + (on ? '★' : '☆') + '</button></div>' +
        '<div class="tt">' + lgTag(f, showLg) + (sc ? tnS(f.home, sc.h, lv) + tnS(f.away, sc.a, lv) : tn(f.home) + tn(f.away)) + '</div>' +
        '<div class="act">' + verdict + '<button class="voir ' + (lv ? 'mid' : hit === true ? 'high' : hit === false ? 'low' : f.conf) + '" data-open="' + f.i + '">' + (lv ? 'Live' : sc ? 'Bilan' : 'Voir') + svg(IC.chev) + '</button></div></div>';
    }
    return '<div class="mrow ' + f.conf + '"><div class="tm">' + (f.time || '–') + (multi ? '<small>' + dm(f.date) + '</small>' : '') +
      '<button class="star' + (on ? ' on' : '') + '" data-fav="' + f.i + '" aria-label="Favori">' + (on ? '★' : '☆') + '</button>' +
      '<button class="cmpb' + (cs ? ' on' : '') + '" data-cmp="' + f.i + '" aria-label="Comparer ce match" title="Comparer">⇄</button></div>' +
      '<div class="tt">' + lgTag(f, showLg) + tn(f.home) + tn(f.away) + '</div>' +
      '<div class="act"><span class="cfp ' + f.conf + '">' + ring(f.fav, f.conf) + pct(f.fav) + '<span class="cl"> · ' + CONF[f.conf] + '</span></span>' +
      '<button class="voir ' + f.conf + '" data-open="' + f.i + '">' + (f.conf === 'low' ? '' : confIcon(f.conf)) + 'Voir' + svg(IC.chev) + '</button></div>' + miniBar(f.p) + '</div>';
  }
  function fstate(f) {                                      // 'live' (en cours), 'done' (terminé) ou 'soon' (à venir)
    var LV = f.id && LIVE[f.id];
    if (LV) return LV.st === 'in' ? 'live' : LV.st === 'post' ? 'done' : 'soon';
    var ms = kickoff(f) - new Date();
    return ms < -2 * 3600 * 1000 ? 'done' : ms < 0 ? 'live' : 'soon';
  }
  function statusBar() {
    var n = { soon: 0, live: 0, done: 0 };
    D.fixtures.forEach(function (f) { n[fstate(f)]++; });
    if (!st.group && isLoaded('cal')) { var T0 = parisToday(); (D.cal || []).forEach(function (c) { if (c.date >= T0) n[cstate(c)]++; }); }
    return '<div class="seg3">' + [['all', 'Tous', ''], ['soon', 'À venir', n.soon], ['live', '<i class="ld"></i>Direct', n.live], ['done', 'Finis', n.done]].map(function (x) {
      return '<button data-status="' + x[0] + '" class="' + (st.status === x[0] ? 'on' : '') + '">' + x[1] + (x[2] !== '' && x[2] > 0 ? '<b>' + (x[2] > 99 ? '99+' : x[2]) + '</b>' : '') + '</button>';
    }).join('') + '</div>';
  }
  try { if (localStorage.getItem('pf-grp') === '0') st.group = false; } catch (e) { /* ignoré */ }
  function filtered() {
    var q = st.q.trim();
    return D.fixtures.filter(function (f) {
      return (st.day === 'all' || f.date === st.day) && (st.status === 'all' || fstate(f) === st.status) &&
        (st.filter === 'all' || (st.filter === 'high' && f.conf === 'high') || (st.filter === 'fav' && favs[f.id])) &&
        (!q || fuzzy(q, f.key, f.kt || (f.kt = toks(f.key))));
    });
  }
  function otherHTML(onlyExt) {                                    // matchs des championnats hors modèle (calendrier ESPN / TheSportsDB / API-Football) : ceux du jour, ou ceux qui ressemblent à la recherche
    var q = st.q.trim(), T = parisToday(), day = st.day === 'all' || !/^\d{4}-/.test(st.day) ? T : st.day, items;
    if (!isLoaded('cal')) return '';
    var from = isoDate(new Date(parseD(T).getTime() - 864e5));
    if (q) {
      items = onlyExt ? [] : (D.cal || []).filter(function (c) { return c.date >= from && fuzzy(q, c.home + ' ' + c.away + ' ' + c.fr + ' ' + c.cfr); });
      D.ext.forEach(function (e) {
        if (!fuzzy(q, e.home + ' ' + e.away + ' ' + e.lg + ' ' + e.country)) return;
        if (items.some(function (c) { return c.date === T && sameTeam(c.home, e.home) && sameTeam(c.away, e.away); })) return;
        items.push({ ext: e, s: 'ext|' + e.lg, fr: e.lg, cfr: e.country, date: T, time: e.time, home: e.home, away: e.away });
      });
      items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
      items = items.slice(0, 60);
    } else items = (D.cal || []).filter(function (c) { return c.date === day; }).sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
    if (!items.length) return '';
    var h = '<div class="sec" id="oth"><span class="dot b"></span>' + (q ? 'Autres championnats <small>' + items.length + ' match' + (items.length > 1 ? 's' : '') + ' trouvé' + (items.length > 1 ? 's' : '') + '</small>' : 'Autres championnats <small>' + dayLabel(day) + ' · sans pronostic détaillé</small>') + '</div>', cur = '', last = '';
    if (q) {
      items.forEach(function (c) {
        if (c.date !== cur) { cur = c.date; h += '<div class="cdl">' + dayLabel(c.date) + '</div>'; }
        h += '<div class="rlg2">' + esc(c.fr) + ' · ' + esc(c.cfr) + '</div>' + (c.ext ? extRow(c.ext) : calRow(c));
      });
      return h;
    }
    var groups = [], gi = {};
    items.forEach(function (c) { if (!(c.s in gi)) { gi[c.s] = groups.length; groups.push({ s: c.s, fr: c.fr, cfr: c.cfr, list: [] }); } groups[gi[c.s]].list.push(c); });
    groups.sort(function (a, b) { return a.cfr < b.cfr ? -1 : a.cfr > b.cfr ? 1 : a.fr < b.fr ? -1 : 1; });
    st.opn = st.opn || {};
    groups.forEach(function (g) {
      var open = st.opn[g.s] !== undefined ? st.opn[g.s] : items.length <= 40;
      h += '<div class="lgh sm' + (open ? '' : ' shut') + '" data-ocg="' + esc(g.s) + '" role="button" aria-expanded="' + open + '"><span class="lb" style="--lc:#5a93ff">' + svg(IC.trophy) + '</span><div class="ln">' + esc(g.fr) + '<small>' + esc(g.cfr) + '</small></div><span class="cnt">' + g.list.length + '</span><span class="chv">' + svg(IC.chev) + '</span></div>';
      if (open) h += g.list.map(calRow).join('');
    });
    return h;
  }
  function calKick(c) { var p = c.date.split('-'), t = (c.time || '00:00').split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]); }
  function cstate(c) {
    if (c.st === 'post') return 'done';
    if (c.st === 'in') return 'live';
    var ms = calKick(c) - new Date();
    return ms < -2 * 3600 * 1000 ? 'done' : ms < 0 ? 'live' : 'soon';
  }
  function flatHTML(list) {                                 // tous les matchs (modélisés + autres championnats) dans l'ordre d'arrivée, sans regroupement
    var q = st.q.trim(), T = parisToday(), multi = st.day === 'all', arr = [];
    if (list.some(function (f) { return fstate(f) === 'done'; })) ensureRes();
    list.forEach(function (f) { arr.push({ t: +kickoff(f), c: f.fav, h: row(f, multi, true) }); });
    if (isLoaded('cal') && st.filter === 'all') {
      (D.cal || []).forEach(function (c) {
        if (st.day === 'all' ? c.date < T : c.date !== st.day) return;
        if (st.status !== 'all' && cstate(c) !== st.status) return;
        if (q && !fuzzy(q, c.home + ' ' + c.away + ' ' + c.fr + ' ' + c.cfr)) return;
        arr.push({ t: +calKick(c), c: -1, h: calRow(c, true) });
      });
    }
    arr.sort(st.sort === 'conf' ? function (a, b) { return b.c - a.c || a.t - b.t; } : function (a, b) { return a.t - b.t; });
    var more = q ? otherHTML(true) : '';
    if (!arr.length) return (more ? '' : '<div class="empty">Aucun match pour ce filtre.</div>') + more;
    return '<div class="flat">' + arr.slice(0, 400).map(function (x) { return x.h; }).join('') + '</div>' + more;
  }
  function listHTML() {
    if (!st.group) return flatHTML(filtered());
    var list = filtered(), more = otherHTML();
    if (!list.length) return (more ? '' : '<div class="empty">Aucun match pour ce filtre.</div>') + more;
    if (list.some(function (f) { return fstate(f) === 'done'; })) ensureRes();
    var h = '';
    if (!st.group) {                                         // liste à plat, dans l'ordre d'arrivée des matchs (ou de confiance)
      var flat = list.slice().sort(st.sort === 'conf' ? function (a, b) { return b.fav - a.fav; } : function (a, b) { return kickoff(a) - kickoff(b); });
      return '<div class="flat">' + flat.map(function (f) { return row(f, st.day === 'all', true); }).join('') + '</div>' + more;
    }
    D.order.forEach(function (div) {
      var sub = list.filter(function (f) { return f.div === div; });
      if (!sub.length) return;
      if (st.sort === 'conf') sub = sub.slice().sort(function (a, b) { return b.fav - a.fav; });
      var lm = lmeta(div);
      var shut = !!st.closed[div];
      h += '<div class="lgh' + (shut ? ' shut' : '') + '" data-lgc="' + esc(div) + '" role="button" aria-expanded="' + !shut + '"><span class="lb" style="--lc:' + lm[1] + '">' + lgIcon(div, lm[2]) + '</span><div class="ln">' + esc(D.leagues[div].name) +
        '<small>' + lm[0] + '</small></div><span class="cnt">' + sub.length + '</span><span class="chv">' + svg(IC.chev) + '</span></div>';
      if (!shut) h += sub.map(function (f) { return row(f, st.day === 'all'); }).join('');
    });
    return h + more;
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
      '<button class="ibtn" data-toggle-theme aria-label="Thème : ' + (THEME === 'auto' ? 'automatique (clair de 8 h à 20 h)' : dark ? 'sombre' : 'clair') + '. Toucher pour changer" title="' + (THEME === 'auto' ? 'Thème automatique' : dark ? 'Thème sombre' : 'Thème clair') + '">' + (THEME === 'auto' ? svg(IC.auto) : svg(dark ? IC.sun : IC.moon)) + (THEME === 'auto' ? '<i class="ibadge">A</i>' : '') + '</button></div>' +
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
      h += '<div class="lgh"><span class="lb" style="--lc:' + lm[1] + '">' + lgIcon(div, lm[2]) + '</span><div class="ln">' + esc(D.leagues[div].name) + '<small>' + lm[0] +
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
  /* marchés des autres sports : trois onglets internes (Résumé, Sûrs, Moins sûrs) au lieu d'une liste unique interminable */
  function sportTabs(d, safe, less) {
    var wrap = function (r) { return { m: r.m, s: r.s, p: r.p, v: r.v, f: { sels: r.sels } }; }, tab = st.ptab === 'safe' || st.ptab === 'less' ? st.ptab : 'sum';
    var all = safe.concat(less).sort(function (a, b) { return b.p - a.p; });
    var bar = '<div class="ptabs">' + [['sum', 'Résumé', 0], ['safe', 'Sûrs', safe.length], ['less', 'Moins sûrs', less.length]].map(function (c) {
      return '<button data-ptab="' + c[0] + '" class="' + (tab === c[0] ? 'on' : '') + '">' + c[1] + (c[2] ? '<b>' + c[2] + '</b>' : '') + '</button>'; }).join('') + '</div>';
    var h = bar;
    if (tab === 'safe') h += safe.length ? safe.map(wrap).map(mkRow('g', d)).join('') : '<div class="empty">Aucun pronostic n’atteint le seuil de ' + Math.round(SAFE * 100) + ' %.</div>';
    else if (tab === 'less') h += less.map(wrap).map(mkRow('a', d)).join('');
    else h += '<div class="sec"><span class="dot g"></span>Les paris les plus probables <small>' + Math.min(6, all.length) + ' sur ' + all.length + '</small></div>' + all.slice(0, 6).map(wrap).map(function (x) { return mkRow(x.p >= SAFE ? 'g' : 'a', d)(x); }).join('') +
      '<div class="sub">Tous les marchés sont dans les onglets « Sûrs » et « Moins sûrs ». Touche un marché pour voir toutes les sélections et leur cote juste.</div>';
    return h;
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
    return h + sportTabs(d, m.safe, m.less);
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
    return h + sportTabs(d, m.safe, m.less);
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
          return '<div class="f1r"><span class="f1n">' + (d.fl ? '<img class="pfl" src="' + logoUrl(d.fl) + '" alt="" loading="lazy" onerror="this.remove()"> ' : '') + esc(d.n) + '<small>' + (ev.state === 'in' ? gScore(d.cur) + (d.out ? ' · éliminé' : d.h ? ' · trou ' + d.h : '') : (d.known ? '' : 'peu connu')) + '</small></span>' +
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
      if ((st.tab === 'today' || st.tab === 'plan') && !st.detail) render();
      if (left <= 0) { TODAY.busy = false; TODAY.ts = Date.now(); asSync(); if ((st.tab === 'today' || st.tab === 'plan') && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } }
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
      C.safe.slice(0, 2).forEach(function (r) { picks.push({ icon: '⚽', match: nm(f.home) + ' – ' + nm(f.away), time: f.time, pick: r.m + ' : ' + r.s, p: r.p, v: r.v, div: f.div, ref: ref, bid: f.id, bm: r.m, bs: r.s }); });
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
  function asHair(r) {                                    // jamais moins de 3 points ; davantage si ce championnat a montré un écart annoncé - réel (au moins 100 pronostics) : écart + 1,5 point
    var g = r && r.div && D.gaps ? D.gaps[r.div] : null;
    return g == null ? AS_HAIR : Math.min(0.08, Math.max(AS_HAIR, g + 0.015));
  }
  function asStake(x) { return Math.max(1, Math.round(x * 2) / 2); }
  function eur2(x) { return String(Math.round(x * 100) / 100).replace('.', ',') + ' €'; }
  var ASREC = {};                                          // plan de l'assistant gardé par jour : { date: { id pari: {...} } } (sert au bilan)
  try { ASREC = JSON.parse(localStorage.getItem('pf-asrec') || '{}') || {}; } catch (e) { ASREC = {}; }
  function asRecSave() {
    var keys = Object.keys(ASREC).sort(); while (keys.length > 30) delete ASREC[keys.shift()];
    try { localStorage.setItem('pf-asrec', JSON.stringify(ASREC)); } catch (e) { /* ignoré */ }
  }
  function asRemember(R, plan) {                           // on retient tout ce que l'assistant a conseillé dans la journée (la liste s'allonge tant que des matchs ne sont pas commencés)
    if (!plan || plan.stop || !plan.items.length) return;
    var day = ASREC[R.T] || (ASREC[R.T] = {}), ch = false;
    plan.items.forEach(function (it) {
      var k = it.r.bid;
      if (!day[k]) { day[k] = { match: it.r.match, pick: it.r.pick, m: it.r.bm, s: it.r.bs, pa: it.pa, stake: it.stake, icon: it.r.icon }; ch = true; }
    });
    if (ch) asRecSave();
  }
  function asVerdict(pa, stake, o) {                       // la cote vue chez le bookmaker est-elle assez haute pour le vrai risque ?
    if (!(o > 1)) return '';
    var ev = pa * o - 1, mn = 1 / pa, mnT = mn.toFixed(2).replace('.', ',');
    if (o >= mn) {
      return '<b class="as-ok">✅ Cote suffisante</b> (minimum ' + mnT + '). Si le pari passe : <b>+' + eur2(stake * (o - 1)) + '</b>. Espérance : <b>' + (ev >= 0 ? '+' : '−') + eur2(Math.abs(ev * stake)) + '</b> sur ' + eur2(stake) + '.' +
        (ev > 0.25 ? '<br><span class="as-warn">⚠ Un avantage aussi grand vient le plus souvent d’une erreur de notre estimation (onglet Fiabilité) : prudence.</span>' : '');
    }
    return '<b class="as-ko">❌ Cote trop basse</b> : il te faut au moins ' + mnT + '. Espérance : <b>−' + eur2(Math.abs(ev * stake)) + '</b> sur ' + eur2(stake) + '. <b>Passe ton tour.</b>';
  }
  function asOddsBox(id, pa, stake, saved) {
    return '<div class="as-odds"><label>Cote vue chez le bookmaker<input inputmode="decimal" autocomplete="off" placeholder="ex. ' + (1 / pa * 1.08).toFixed(2).replace('.', ',') + '" value="' + (saved ? String(saved).replace('.', ',') : '') +
      '" data-asodds="' + esc(id) + '" data-pa="' + pa.toFixed(4) + '" data-stake="' + stake + '"></label><div class="as-verdict" data-asv="' + esc(id) + '">' + (saved ? asVerdict(pa, stake, saved) : '') + '</div></div>';
  }
  function asBilanHTML(R) {
    var days = Object.keys(ASREC).filter(function (d) { return d < R.T || true; }).sort().reverse().slice(0, 7), tot = { n: 0, w: 0, pa: 0 }, rows = '', pend = false, profit = 0, withOdds = 0;
    days.forEach(function (d) {
      var items = Object.keys(ASREC[d]).map(function (k) { var it = ASREC[d][k]; it.id = k; return it; }), n = 0, w = 0, lines = '';
      items.forEach(function (it) {
        var r = Bets.resolver(it.id, it.m, it.s);
        if (r === null) pend = true; else { n++; if (r) w++; tot.n++; tot.pa += it.pa; if (r) tot.w++; if (it.o > 1) { withOdds++; profit += r ? it.stake * (it.o - 1) : -it.stake; } }
        lines += '<div class="pr ' + (r === null ? '' : r ? 'ok' : 'ko') + '"><span class="mk2">' + (r === null ? '·' : svg(r ? IC.check : IC.x)) + '</span><span class="pt">' + esc(it.match) + '<small class="sm">' + esc(it.pick) + ' · mise ' + eur2(it.stake) + '</small></span><span class="pp">' + pct(it.pa) + '</span></div>';
      });
      if (items.length) rows += '<details class="rd"><summary>' + (d === R.T ? 'Aujourd’hui' : WD[parseD(d).getDay()] + ' ' + dm(d)) + ' <small>' + (n ? w + ' / ' + n + ' gagnés' : 'en attente') + (n < items.length ? ' · ' + (items.length - n) + ' à venir' : '') + '</small></summary>' + lines + '</details>';
    });
    if (pend && !isLoaded('res')) loadLazy('res', function () { if (st.tab === 'today' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });
    if (!rows) return '';
    var h = '<div class="sec"><span class="dot a"></span>Bilan de l’assistant <small>7 derniers jours</small></div><div class="fm">';
    if (tot.n) h += '<div class="sub">Sur <b>' + tot.n + '</b> paris conseillés et terminés : <b>' + tot.w + ' gagnés (' + pct(tot.w / tot.n) + ')</b>, pour <b>' + pct(tot.pa / tot.n) + '</b> annoncés.' +
      (withOdds ? ' Avec les cotes que tu as saisies (' + withOdds + ' paris) : <b>' + (profit >= 0 ? '+' : '−') + eur2(Math.abs(profit)) + '</b>.' : ' Saisis la cote vue sur le bookmaker pour voir ton gain en euros.') + '</div>';
    return h + rows + '</div>';
  }
  function assistantPlan(R) {
    var pf = AS_PROF[AS.prof], mi = Bets.monthInfo(), plan = { items: [], combo: null, notes: [], stop: false, total: 0, mi: mi, budget: 0 };
    var mult = 1, remaining = Infinity;
    if (mi.budget > 0) {
      var ratio = mi.spent / mi.budget; remaining = mi.budget - mi.spent;
      if (ratio >= 1) { plan.stop = true; plan.notes.push('Ton budget du mois (' + eur2(mi.budget) + ') est atteint : pas de conseil aujourd’hui. C’est la bonne décision.'); return plan; }
      if (ratio >= 0.8) { mult = 0.5; plan.notes.push('Tu as déjà misé ' + Math.round(ratio * 100) + ' % de ton budget du mois : je divise les mises par deux.'); }
    }
    var budget = Math.min(AS.daily > 0 ? AS.daily : AS.unit * 3, remaining); plan.budget = budget;
    var seen = {}, pool = [];
    R.picks.forEach(function (r) {
      if (!r.bid) return;
      if (r.time && kickoff({ date: R.T, time: r.time }) < Date.now()) return;           // match déjà commencé
      if (AS.prof === 'pr' && !r.v) return;                                                 // profil prudent : marchés validés par backtest seulement
      var pa = r.p - asHair(r) - (r.v ? 0 : 0.02);                                            // marché non validé : 2 points de prudence en plus
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
      var legs = pool.slice(0, pf.combo).map(function (x) { return x.r; }), P = legs.reduce(function (t, r) { return t * (r.p - asHair(r)); }, 1), cs = asStake(AS.unit * 0.3 * mult);
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
  /* plans de paris : un pari sûr, un combiné de 2 et un combiné de 3, avec la mise adaptée à ta mise de base */
  var PLAN_DEF = [
    { key: 'sur', name: 'Pari sûr', tag: 'Prudent', cls: 'a', n: 1, min: 0.82, f: 1, why: 'Un seul pari : le plus probable de la journée.' },
    { key: 'duo', name: 'Combiné de 2', tag: 'Équilibré', cls: 'b', n: 2, min: 0.78, f: 0.6, why: 'Deux matchs différents : les deux doivent passer.' },
    { key: 'trio', name: 'Combiné de 3', tag: 'Audacieux', cls: 'c', n: 3, min: 0.74, f: 0.4, why: 'Trois matchs différents : plus de gain possible, moins de chances.' }];
  function planPool(R, min) {
    var seen = {}, pool = [];
    R.picks.forEach(function (r) {
      if (!r.bid) return;
      if (r.time && kickoff({ date: R.T, time: r.time }) < Date.now()) return;
      var pa = r.p - asHair(r) - (r.v ? 0 : 0.02);
      if (pa < min || r.p > AS_CAP) return;
      if (!seen[r.match] || pa > seen[r.match].pa) seen[r.match] = { r: r, pa: pa };
    });
    Object.keys(seen).forEach(function (k) { pool.push(seen[k]); });
    return pool.sort(function (a, b) { return b.pa - a.pa; });
  }
  function plansHTML(R) {
    var mi = Bets.monthInfo(), h = '<div class="sec"><span class="dot g"></span>Plans du jour <small>mise de base ' + AS.unit + ' €</small></div>';
    if (mi.budget > 0 && mi.spent >= mi.budget) return h + '<div class="bt-warn">Ton budget du mois (' + eur2(mi.budget) + ') est atteint : pas de plan aujourd’hui. C’est la bonne décision.</div>';
    COMBOS = [];
    PLAN_DEF.forEach(function (pd) {
      var pool = planPool(R, pd.min), legs = pool.slice(0, pd.n);
      if (legs.length < pd.n) {
        h += '<div class="plan p-' + pd.cls + ' none"><div class="plh"><span class="as-tag as-' + pd.cls + '">' + pd.tag + '</span><b>' + pd.name + '</b></div><div class="sub">Pas assez de paris au-dessus de ' + Math.round(pd.min * 100) + ' % aujourd’hui pour ce plan.</div></div>';
        return;
      }
      var P = legs.reduce(function (t, x) { return t * x.pa; }, 1), stake = asStake(AS.unit * pd.f), mn = 1 / P, mnT = mn.toFixed(2).replace('.', ',');
      var gainMin = stake * (mn - 1), id = 'plan|' + pd.key, actions;
      if (pd.n === 1) {
        var r = legs[0].r;
        actions = '<button class="bt-b pri" data-bet="' + esc(r.match + ' : ' + r.pick) + '" data-bsp="' + (AS_SPORT[r.icon] || 'autre') + '" data-bp="' + legs[0].pa.toFixed(4) + '" data-bm="' + esc(r.bm) + '" data-bs="' + esc(r.bs) + '" data-bref="' + esc(r.bid) + '" data-bcat="Plan" data-bstake="' + stake + '">€ Noter ce pari</button>';
      } else {
        COMBOS.push({ name: pd.name, legs: legs.map(function (x) { return x.r; }), P: P });
        actions = '<button class="bt-b pri" data-bcombo="' + (COMBOS.length - 1) + '" data-bstake="' + stake + '">€ Noter ce combiné</button>';
      }
      h += '<div class="plan p-' + pd.cls + '"><div class="plh"><span class="as-tag as-' + pd.cls + '">' + pd.tag + '</span><b>' + pd.name + '</b><span class="stk2">' + eur2(stake) + '</span></div><div class="sub">' + pd.why + '</div>' +
        legs.map(function (x) {
          return '<div class="pleg"><span class="pi">' + x.r.icon + '</span><div class="pm"><b>' + esc(x.r.match) + '</b><small>' + (x.r.time ? '⏰ ' + esc(x.r.time) + ' · ' : '') + esc(x.r.pick) + '</small></div><span class="pp">' + pct(x.pa) + '</span></div>';
        }).join('') +
        '<div class="t1n"><span>Réussite<b>' + pct(P) + '</b></span><span class="stk">Mise<b>' + eur2(stake) + '</b></span><span>Cote min.<b>' + mnT + '</b></span></div>' +
        '<div class="plg">À partir de la cote <b>' + mnT + '</b>, le gain est de <b>+' + eur2(gainMin) + '</b> si tout passe. En dessous, ne joue pas.</div>' +
        asOddsBox(id, P, stake, 0) + '<div class="bt-act">' + actions + '</div></div>';
    });
    return h + '<div class="srcnote">Les probabilités sont celles de notre modèle, diminuées d’une marge de prudence. Un combiné ne gagne que si <b>toutes</b> ses sélections passent. La cote affichée chez le bookmaker doit être au moins égale à la cote minimale, sinon le pari n’est pas rentable sur la durée. Aucun plan ne garantit un gain.</div>';
  }
  function topPickHTML(R) {                                 // une seule chose à jouer aujourd'hui
    var plan = assistantPlan(R), pf = AS_PROF[AS.prof];
    if (plan.stop) return '';
    var it = plan.items[0];
    if (!it) return '<div class="top1 none"><div class="t1k">Le pari du jour</div><div class="t1m">Aujourd’hui, mieux vaut ne rien jouer.</div><div class="sub">Aucun pari ne passe ton seuil (profil ' + pf.name + '). Passer son tour fait aussi partie du jeu raisonnable.</div></div>';
    var r = it.r, mn = 1 / it.pa, saved = (ASREC[R.T] && ASREC[R.T][r.bid] && ASREC[R.T][r.bid].o) || 0;
    return '<div class="top1"><div class="t1k">Le pari du jour <span class="as-tag as-' + (it.tag === 'Très sûr' ? 'a' : it.tag === 'Sûr' ? 'b' : 'c') + '">' + it.tag + '</span></div>' +
      '<div class="t1m">' + r.icon + ' ' + esc(r.match) + '<small>' + esc(r.time || '') + '</small></div><div class="t1p">' + esc(r.pick) + '</div>' +
      '<div class="t1n"><span>Réussite estimée<b>' + pct(it.pa) + '</b></span><span>Mise conseillée<b>' + eur2(it.stake) + '</b></span><span>Cote minimale<b>' + mn.toFixed(2).replace('.', ',') + '</b></span></div>' +
      asOddsBox('top|' + r.bid, it.pa, it.stake, saved) +
      '<div class="bt-act"><button class="bt-b pri" data-bet="' + esc(r.match + ' : ' + r.pick) + '" data-bsp="' + (AS_SPORT[r.icon] || 'autre') + '" data-bp="' + it.pa.toFixed(4) + '" data-bm="' + esc(r.bm) + '" data-bs="' + esc(r.bs) + '" data-bref="' + esc(r.bid) + '" data-bcat="Assistant" data-bstake="' + it.stake + '"' + (saved ? ' data-bodds="' + saved + '"' : '') + '>€ Noter ce pari</button>' +
      '<button class="voir" ' + r.ref + '>Voir le match' + svg(IC.chev) + '</button></div></div>';
  }
  function assistantHTML(R) {
    var plan = assistantPlan(R), pf = AS_PROF[AS.prof], mi = plan.mi;
    asRemember(R, plan);
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
    if (!plan.stop) {
      var nb = plan.items.length + (plan.combo ? 1 : 0), usedD = plan.budget > 0 ? Math.min(1, plan.total / plan.budget) : 0;
      h += '<div class="asum"><span><small>À miser</small><b>' + eur2(plan.total) + '</b></span><span><small>Paris</small><b>' + nb + '</b></span><span><small>Budget du jour</small><b>' + eur2(plan.budget) + '</b></span></div>' +
        '<div class="meter" title="Part du budget du jour utilisée"><i style="width:' + Math.round(usedD * 100) + '%"></i></div>';
    }
    if (mi.budget > 0) {
      var rm = Math.min(1, mi.spent / mi.budget);
      h += '<div class="mlab"><span>Budget du mois</span><b>' + eur2(mi.spent) + ' / ' + eur2(mi.budget) + '</b></div><div class="meter' + (rm >= 0.8 ? ' hot' : '') + '"><i style="width:' + Math.round(rm * 100) + '%"></i></div>' +
        (mi.n ? '<div class="sub">Résultat du mois : <b class="' + (mi.profit >= 0 ? 'as-ok' : 'as-ko') + '">' + (mi.profit >= 0 ? '+' : '−') + eur2(Math.abs(mi.profit)) + '</b> sur ' + mi.n + ' paris terminés.</div>' : '');
    } else h += '<div class="sub">Fixe un budget mensuel dans « Mes paris » : l’assistant s’y adapte.</div>';
    plan.notes.forEach(function (n) { h += '<div class="bt-warn">' + esc(n) + '</div>'; });
    var hasT = !!Alerts.topic();
    if (AS.alert && !hasT) h += '<div class="bt-warn">Pour recevoir les alertes, renseigne d’abord le nom de ton sujet ntfy dans l’onglet Favoris (section « Alertes »).</div>';
    else if (AS.alert) h += '<div class="sub">🔔 ' + esc(Alerts.status() || 'Alertes 45 min avant chaque pari conseillé.') + '</div>';
    if (!plan.stop) {
      if (!plan.items.length) h += '<div class="empty">Aucun pari ne passe le seuil « ' + pf.name + ' » (' + Math.round(pf.min * 100) + ' % après prudence) aujourd’hui. Ne rien jouer est aussi une bonne décision.</div>';
      plan.items.forEach(function (it) {
        var r = it.r, mn = 1 / it.pa;
        h += '<div class="as-row asc"><div class="as-top"><span class="as-tag as-' + (it.tag === 'Très sûr' ? 'a' : it.tag === 'Sûr' ? 'b' : 'c') + '">' + it.tag + '</span><small>' + (r.time ? '⏰ ' + esc(r.time) : '') + '</small></div>' +
          '<div class="asm">' + r.icon + ' ' + esc(r.match) + '</div>' +
          '<div class="as-pick">' + esc(r.pick) + '</div>' +
          '<div class="t1n"><span>Réussite<b>' + pct(it.pa) + '</b></span><span class="stk">Mise<b>' + eur2(it.stake) + '</b></span><span>Cote min.<b>' + mn.toFixed(2).replace('.', ',') + '</b></span></div>' +
          asOddsBox(r.bid, it.pa, it.stake, (ASREC[R.T] && ASREC[R.T][r.bid] && ASREC[R.T][r.bid].o) || 0) +
          '<div class="bt-act"><button class="bt-b" data-bet="' + esc(r.match + ' : ' + r.pick) + '" data-bsp="' + (AS_SPORT[r.icon] || 'autre') + '" data-bp="' + it.pa.toFixed(4) + '" data-bm="' + esc(r.bm) + '" data-bs="' + esc(r.bs) + '" data-bref="' + esc(r.bid) + '" data-bcat="Assistant" data-bstake="' + it.stake + '"' + (ASREC[R.T] && ASREC[R.T][r.bid] && ASREC[R.T][r.bid].o ? ' data-bodds="' + ASREC[R.T][r.bid].o + '"' : '') + '>€ Noter ce pari</button>' +
          '<button class="voir" ' + r.ref + '>Voir' + svg(IC.chev) + '</button></div></div>';
      });
      if (plan.combo) {
        COMBOS = [{ name: 'Assistant', legs: plan.combo.legs, P: plan.combo.P }];
        h += '<div class="as-row asc"><div class="as-top"><span class="as-tag as-c">Combiné</span><small>' + plan.combo.legs.length + ' sélections</small></div>' +
          plan.combo.legs.map(function (r) { return '<div class="as-leg"><span>' + r.icon + ' ' + esc(r.match) + '</span><b>' + esc(r.pick) + '</b></div>'; }).join('') +
          '<div class="t1n"><span>Réussite<b>' + pct(plan.combo.P) + '</b></span><span class="stk">Mise<b>' + eur2(plan.combo.stake) + '</b></span><span>Cote min.<b>' + (1 / plan.combo.P).toFixed(2).replace('.', ',') + '</b></span></div>' +
          asOddsBox('combo', plan.combo.P, plan.combo.stake, 0) + '<div class="bt-act"><button class="bt-b" data-bcombo="0" data-bstake="' + plan.combo.stake + '">€ Noter ce combiné</button></div></div>';
      }
      if (plan.items.length) {
        var pAll = plan.items.reduce(function (t, it) { return t * it.pa; }, 1), exp = plan.items.reduce(function (t, it) { return t + it.pa; }, 0);
        h += '<div class="srcnote">Total conseillé : <b>' + eur2(plan.total) + '</b> sur ' + (plan.items.length + (plan.combo ? 1 : 0)) + ' paris. On s’attend à environ <b>' + exp.toFixed(1).replace('.', ',') + ' réussite' + (exp >= 2 ? 's' : '') + ' sur ' + plan.items.length + '</b> simples ; ' +
          'la probabilité que <b>tous</b> les simples passent est de ' + pct(pAll) + '. Plus la probabilité est haute, plus la cote est basse : le gain d’un pari très sûr reste petit.</div>';
      }
    }
    h += asBilanHTML(R);
    h += '<div class="srcnote"><b>Comment je décide.</b> Je ne garde, par match, que le pronostic le plus probable, après avoir retiré une marge de prudence (au moins 3 points, davantage si ce championnat a montré un écart entre l’annoncé et le réel). Les marchés non validés par backtest perdent 2 points de plus (et sont exclus du profil prudent). Je laisse de côté les paris au-dessus de 93 % (cote trop basse pour valoir le coup) et les matchs déjà commencés. Mise : 100 % de ta mise de base à partir de 88 %, 50 % de 82 à 88 %, 30 % de 74 à 82 %. ' +
      '« Cote minimale » : en dessous, le bookmaker te paie moins que le vrai risque, ne joue pas. Ce sont des estimations, pas des certitudes : sur la durée, la marge des bookmakers fait perdre la plupart des parieurs, même avec de bons pronostics. ' +
      'Ne mise jamais d’argent dont tu as besoin. Joueurs Info Service : 09 74 75 13 13 (gratuit, anonyme).</div></div>';
    return h;
  }
  function todayHTML() {
    todayLoad();
    var R0 = todayRows(), R = R0, h = '<div class="top"><h1>Plans du jour</h1></div><div class="sub">' + WD[parseD(R0.T).getDay()] + ' ' + dm(R.T) + ' · tous sports confondus' +
      (TODAY.busy ? ' · chargement ' + TODAY.step + '/' + TODAY.total + '…' : '') + '</div>';
    if (R.counts.length) {
      var okSp = R.counts.some(function (c) { return c[0] === st.plSport; });
      if (!okSp) st.plSport = 'all';
      h += '<div class="chips sprow"><button class="chip' + (st.plSport === 'all' ? ' on' : '') + '" data-plsp="all">Tous<b>' + R.counts.reduce(function (t, c) { return t + c[2]; }, 0) + '</b></button>' + R.counts.map(function (c) {
        return '<button class="chip' + (st.plSport === c[0] ? ' on' : '') + '" data-plsp="' + c[0] + '">' + c[0] + '<b>' + c[2] + ' ' + (c[4] || 'match') + (c[2] > 1 ? 's' : '') + '</b>' + (c[3] < c[2] ? '<small>' + (c[3] ? c[3] + ' avec pronostic' : 'sans pronostic') + '</small>' : '') + '</button>'; }).join('') + '</div>';
      if (st.plSport !== 'all') R = { picks: R0.picks.filter(function (r) { return r.icon === st.plSport; }), favs: R0.favs.filter(function (r) { return r.icon === st.plSport; }), counts: R0.counts, T: R0.T };
    }
    if (!R.counts.length) return h + (TODAY.busy ? skel(4) : '<div class="empty">' + ( 'Aucun match avec pronostic aujourd’hui. Regarde l’onglet « Découvrir » pour les jours suivants.') + '</div>');
    h += plansHTML(R);
    h += assistantHTML(R);
    h += '<div class="sec"><span class="dot g"></span>Les pronostics les plus sûrs <small>probabilité ≥ ' + Math.round(SAFE * 100) + ' %</small></div>' +
      '<div class="chips"><button class="chip pill' + (st.plSort === 'p' ? ' on' : '') + '" data-plsort="p">Les plus probables</button><button class="chip pill' + (st.plSort === 't' ? ' on' : '') + '" data-plsort="t">Par heure</button></div>';
    var seen = {}, shown = (st.plSort === 't' ? R.picks.slice().sort(function (a, b) { return (a.time || '99:99') < (b.time || '99:99') ? -1 : (a.time || '99:99') > (b.time || '99:99') ? 1 : b.p - a.p; }) : R.picks).filter(function (r) { var k = r.match; seen[k] = (seen[k] || 0) + 1; return seen[k] <= 2; }).slice(0, 15);
    h += shown.length ? shown.map(todayRow).join('') : '<div class="empty">Aucun pronostic sûr aujourd’hui.</div>';
    var seenF = {};
    var fv = R.favs.filter(function (r) { if (seenF[r.match]) return false; seenF[r.match] = 1; return true; }).slice(0, 10);
    if (fv.length) h += '<div class="sec"><span class="dot a"></span>Les favoris les plus nets <small>vainqueur à haute confiance</small></div>' + fv.map(todayRow).join('');
    return h + '<div class="sub" style="margin-top:14px">Les pronostics sûrs d’un même sport restent des estimations : environ 75 % de réussite en moyenne, jamais une certitude. Analyse indicative, pas un conseil de pari.</div>';
  }

  /* ------------------------------------------------------------ Formule 1 */
  D.f1 = D.f1 || {};
  var F1COL = { mercedes: '#27f4d2', ferrari: '#e8002d', red_bull: '#3671c6', mclaren: '#ff8000', aston_martin: '#229971', alpine: '#ff87bc', williams: '#64c4ff', rb: '#6692ff', haas: '#b6babd', audi: '#d6c8a4', sauber: '#52e252', cadillac: '#c9a227' };
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
          return '<div class="f1r"><span class="f1n"><i class="tdot" style="background:' + (F1COL[d.c] || 'var(--mute)') + '"></i>' + esc(d.n) + '<small>' + esc(d.cn) + (d.grid ? ' · grille ' + d.grid : '') + '</small></span>' + f1Bar(d.win, 'g') + f1Bar(d.pod, 'g') + f1Bar(d.top6, 'a') + f1Bar(d.top10, 'a') + '</div>'; }).join('') + '</div>';
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
    'Colombia': 'Colombie', 'Ecuador': 'Équateur', 'Estonia': 'Estonie', 'Canada': 'Canada', 'Iceland': 'Islande' };
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
    return '<button class="comp" data-day="comp:' + esc(c.key) + '"><span class="cf">' + lgIcon(compKey(c.key), c.flag || svg(IC.trophy)) + '</span><span class="cn">' + esc(c.name) + '<small>' + esc(c.sub) + '</small></span><span class="cnt">' + c.n + '</span>' + svg(IC.chev) + '</button>';
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
  function calRow(c, flat) {
    var x = extFor(c), p = c.p, fav = p ? p.indexOf(Math.max.apply(null, p)) : -1, fn = p ? [c.home, 'Nul', c.away][fav] : '', right, left = esc(c.time) + (flat ? '<small>' + dm(c.date) + '</small>' : '');
    if (c.st === 'post') { right = '<span class="cfp high">Terminé · ' + c.hs + ' – ' + c.as_ + '</span>'; left += '<small>fini</small>'; }
    else if (c.st === 'in') { right = '<span class="cfp mid">En cours · ' + c.hs + ' – ' + c.as_ + '</span>'; left += '<small>live</small>'; }
    else right = p ? '<span class="cfp low' + (c.q ? ' apx' : '') + '">' + (c.q ? '≈ ' : '') + pct(p[fav]) + ' · ' + esc(fn) + '</span>' : '<span class="cfp low nop">Pas de pronostic</span>';
    var apx = c.q && c.st === 'pre' ? '<div class="apil apx">Estimation approximative d’après les ' + c.n + ' résultats vus dans ce championnat : peu fiable, à ne pas suivre seule.</div>' : '';
    var api = x && c.st === 'pre' ? '<div class="apil">API-Football : ' + esc([x.home, 'Nul', x.away][x.favIdx]) + ' ' + pct(x.fav) + ' <button class="bt-b" data-openext="' + x.i + '">Voir</button></div>' : '';
    return '<div class="mrow low ext"><div class="tm">' + left + '</div><div class="tt">' + (flat ? '<span class="rlg"><b>' + esc(c.cfr) + '</b>' + esc(c.fr) + '</span>' : '') + tn(c.home) + tn(c.away) + '</div><div class="act">' + right + '</div>' + (p && c.st === 'pre' ? miniBar(p) : '') + apx + api + '</div>';
  }
  function dayLabel(d) { var T = parisToday(); return d === T ? 'Aujourd’hui · ' + dm(d) : d === isoDate(new Date(parseD(T).getTime() - 864e5)) ? 'Hier · ' + dm(d) : WD[parseD(d).getDay()] + ' ' + dm(d); }
  function compHTML(key) {
    var p = key.split('|'), h = '<button class="chip pill" data-day="comps" style="margin-bottom:10px">‹ Toutes les compétitions</button>';
    if (p[0] === 'L') {
      var div = p[1], list = D.fixtures.filter(function (f) { return f.div === div && (!p[2] || f.cp === p[2]); }).sort(function (a, b) { return kickoff(a) - kickoff(b); }), lm = lmeta(div);
      h += '<div class="lgh"><span class="lb" style="--lc:' + lm[1] + '">' + lgIcon(div, lm[2]) + '</span><div class="ln">' + esc(p[2] || D.leagues[div].name) + '<small>' + esc((list[0] && list[0].cc) || lm[0]) + ' · notre modèle</small></div><span class="cnt">' + list.length + '</span></div>';
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
      h += '<div class="lgh"><span class="lb" style="--lc:#5a93ff">' + lgIcon(g.s, svg(IC.trophy)) + '</span><div class="ln">' + esc(g.name) + '<small>' + esc(g.sub) + '</small></div><span class="cnt">' + g.items.length + '</span></div>';
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
      var nLive = D.fixtures.filter(function (f) { return fstate(f) === 'live'; }).length;
      h += '<div class="banner"><i class="bdot"></i><span>Pronostics prêts · <b data-n="' + D.fixtures.length + '">' + D.fixtures.length + '</b> matchs</span>' + (nLive ? '<button class="bpill" data-status="live"><i></i>EN DIRECT ' + nLive + '</button>' : '') + '</div>';
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
    var nOth = st.group && isLoaded('cal') && st.q.trim() === '' ? (D.cal || []).filter(function (c) { return c.date === parisToday(); }).length : 0;
    h += statusBar() + (nOth ? '<button class="jump" data-jump="oth">↓ Autres championnats du jour<b>' + nOth + '</b></button>' : '') + '<label class="grpsw"><input type="checkbox" data-grp' + (st.group ? ' checked' : '') + '><span class="bx"></span>Classer par championnat<small>' + (st.group ? 'décoche pour voir les matchs dans l’ordre d’arrivée' : 'ordre d’arrivée des matchs') + '</small></label><div class="tools"><label class="search">' + svg(IC.search) + '<input id="q" type="search" placeholder="Chercher une équipe" autocomplete="off" value="' + esc(st.q) + '"></label>' +
      '<button class="sortb" data-sort>' + svg(IC.sort) + (st.sort === 'conf' ? 'Confiance' : 'Heure') + '</button>' +
      '<button class="sortb" data-dens aria-label="Affichage compact ou confortable">' + (DENS === 'compact' ? '▤' : '▦') + '</button></div>';
    h += '<div class="chips">' + [['all', 'Tous'], ['high', 'Haute confiance'], ['fav', '★ Favoris']].map(function (x) {
      return '<button class="chip pill' + (st.filter === x[0] ? ' on' : '') + '" data-filter="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    return h + '<div id="list">' + listHTML() + '</div>' + (st.filter === 'all' && st.status === 'all' && !st.q ? youthHTML() : '');
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
  /* ------------------------------------------------------------ ticket : tu notes tes paris, l'appli calcule les chances et te dit quoi garder ou enlever */
  function tkNum(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return x > 1 ? x : 0; }
  function tkSplit(k) { var a = k.split('|'); return { div: a[0], home: a[1], away: a[2], m: a[3], s: a.slice(4).join('|') }; }
  function tkFix(div, home, away) { return D.fixtures.filter(function (f) { return f.div === div && f.home === home && f.away === away; })[0] || null; }
  function tkEvent(M, d, m, sel) {                          // événement « sur la grille de scores » d'une sélection, pour calculer exactement les paris d'un même match
    var x, mm;
    if (m === 'Résultat du match') return sel === d.home ? function (i, j) { return i > j; } : sel === 'Match nul' ? function (i, j) { return i === j; } : sel === d.away ? function (i, j) { return i < j; } : null;
    if (m === 'Double chance') return sel === d.home + ' ou nul' ? function (i, j) { return i >= j; } : sel === d.away + ' ou nul' ? function (i, j) { return i <= j; } : sel === d.home + ' ou ' + d.away ? function (i, j) { return i !== j; } : null;
    if (m === 'Les deux équipes marquent') return sel === 'Oui' ? function (i, j) { return i > 0 && j > 0; } : sel === 'Non' ? function (i, j) { return !(i > 0 && j > 0); } : null;
    if (m === 'Total buts (plus)' && (mm = /^Plus de ([\d,]+) buts$/.exec(sel))) { x = +mm[1].replace(',', '.'); return function (i, j) { return i + j > x; }; }
    if (m === 'Total buts (moins)' && (mm = /^Moins de ([\d,]+) buts$/.exec(sel))) { x = +mm[1].replace(',', '.'); return function (i, j) { return i + j < x; }; }
    [[d.home, 0], [d.away, 1]].forEach(function (t) {
      var pl = new RegExp('^' + t[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (plus|moins) de ([\\d,]+)$'), r = pl.exec(sel);
      if (r && m === 'Buts de ' + t[0] + ' (' + r[1] + ')') { var y = +r[2].replace(',', '.'), more = r[1] === 'plus', k = t[1]; x = function (i, j) { var g = k ? j : i; return more ? g > y : g < y; }; }
    });
    return typeof x === 'function' ? x : null;
  }
  function tkJoint(list) {                                  // probabilité que toutes les sélections passent ; exacte pour plusieurs paris d'un même match quand on sait les écrire sur la grille
    var groups = {}, order = [], P = 1;
    list.forEach(function (t) { var g = t.k.split('|').slice(0, 3).join('|'); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(t); });
    order.forEach(function (g) {
      var L = groups[g], pg;
      if (L.length === 1) { P *= L[0].p; return; }
      var d0 = tkSplit(L[0].k), f = tkFix(d0.div, d0.home, d0.away), evs = null;
      try {
        var M = Engine.families(d0.div, d0.home, d0.away, f && f.ov);
        evs = L.map(function (t) { var q = tkSplit(t.k); return tkEvent(M, { home: q.home, away: q.away }, q.m, q.s); });
        if (evs.every(function (e) { return e; })) {
          pg = 0; for (var a = 0; a < M.grid.length; a++) for (var b = 0; b < M.grid[a].length; b++) if (evs.every(function (e) { return e(a, b); })) pg += M.grid[a][b];
          P *= pg; return;
        }
      } catch (e) { /* repli : produit */ }
      pg = L.reduce(function (t, x) { return t * x.p; }, 1); P *= Math.min(pg, Math.min.apply(null, L.map(function (x) { return x.p; })));
    });
    return P;
  }
  function ticketProb() { return tkJoint(ticket); }
  function tkLab(t) { return t.s === 'Oui' || t.s === 'Non' ? t.m.replace('Les deux équipes marquent', 'Les 2 marquent') + ' : ' + t.s : t.s; }
  function tkGrade(p) { return p >= 0.8 ? ['Solide', 'high'] : p >= 0.65 ? ['Correct', 'mid'] : p >= 0.5 ? ['Risqué', 'low'] : ['Très risqué', 'bad']; }
  function tkMatches(q) {
    var out = D.fixtures.filter(function (f) { return fstate(f) !== 'done' && (!q.trim() || fuzzy(q, f.key, f.kt || (f.kt = toks(f.key)))); });
    return out.sort(function (a, b) { return kickoff(a) - kickoff(b); }).slice(0, 8);
  }
  function tkQuick(M, d) {                                  // choix rapides d'un match : [étiquette, marché, sélection, probabilité]
    var by = {}, out = [];
    M.fams.forEach(function (f) { by[f.name] = f; });
    function pick(fam, sel, label) { var f = by[fam], it = f && f.sels.filter(function (x) { return x[0] === sel; })[0]; if (it) out.push([label, fam, sel, it[1]]); }
    pick('Résultat du match', d.home, 'Victoire ' + nm(d.home)); pick('Résultat du match', 'Match nul', 'Match nul'); pick('Résultat du match', d.away, 'Victoire ' + nm(d.away));
    pick('Double chance', d.home + ' ou nul', nm(d.home) + ' ou nul'); pick('Double chance', d.away + ' ou nul', nm(d.away) + ' ou nul');
    [0.5, 1.5, 2.5, 3.5].forEach(function (x) { pick('Total buts (plus)', 'Plus de ' + String(x).replace('.', ',') + ' buts', '+' + String(x).replace('.', ',') + ' buts'); });
    [1.5, 2.5, 3.5, 4.5].forEach(function (x) { pick('Total buts (moins)', 'Moins de ' + String(x).replace('.', ',') + ' buts', '−' + String(x).replace('.', ',') + ' buts'); });
    pick('Les deux équipes marquent', 'Oui', 'Les 2 marquent'); pick('Les deux équipes marquent', 'Non', 'Les 2 ne marquent pas');
    [d.home, d.away].forEach(function (t) { pick('Buts de ' + t + ' (plus)', t + ' plus de 0,5', nm(t) + ' marque'); pick('Buts de ' + t + ' (plus)', t + ' plus de 1,5', nm(t) + ' +1,5 buts'); });
    return out;
  }
  function tkPicker() {
    var h = '<div class="tkpick"><label class="search">' + svg(IC.search) + '<input id="tkq" type="search" autocomplete="off" placeholder="Ajouter un pari : équipe ou match (ex. Portugal)" value="' + esc(st.tkq || '') + '"></label><div id="tkres">' + tkResults() + '</div></div>';
    return h;
  }
  function tkResults() {
    var f = st.tkf != null ? D.fixtures[st.tkf] : null, q = st.tkq || '', h = '';
    if (!f || (q.trim() && !fuzzy(q, f.key, f.kt || (f.kt = toks(f.key))))) f = null;
    if (!f) {
      var ms = tkMatches(q);
      if (!ms.length) return '<div class="sub">' + (q.trim() ? 'Aucun match à venir ne ressemble à « ' + esc(q) + ' ».' : 'Aucun match à venir pour le moment.') + '</div>';
      return '<div class="tkms">' + ms.map(function (m) { return '<button data-tkm="' + m.i + '"><b>' + esc(nm(m.home)) + ' – ' + esc(nm(m.away)) + '</b><small>' + dm(m.date) + ' · ' + esc(m.time) + ' · ' + esc(D.leagues[m.div].name) + '</small></button>'; }).join('') + '</div>';
    }
    var d = { div: f.div, home: f.home, away: f.away }, M = Engine.families(d.div, d.home, d.away, f.ov), qk = tkQuick(M, d);
    h += '<div class="tkmh"><b>' + esc(nm(f.home)) + ' – ' + esc(nm(f.away)) + '</b><button data-tkm="-1" class="lnk">changer de match</button></div><div class="tkq">' +
      qk.map(function (x) {
        var on = inTicket(tkKey(d, x[1], x[2]));
        return '<button class="tkc2' + (on ? ' on' : '') + '" data-tkadd="' + esc(x[1] + '||' + x[2]) + '"><span>' + esc(x[0]) + '</span><small>' + pct(x[3]) + '</small></button>';
      }).join('') + '</div><details class="tkall"><summary>Tous les marchés de ce match (' + M.fams.length + ')</summary>' +
      M.fams.map(function (fam) {
        return '<div class="tkfam"><b>' + esc(fam.name) + '</b><div class="tkq">' + fam.sels.map(function (x) {
          var on = inTicket(tkKey(d, fam.name, x[0]));
          return '<button class="tkc2' + (on ? ' on' : '') + '" data-tkadd="' + esc(fam.name + '||' + x[0]) + '"><span>' + esc(x[0]) + '</span><small>' + pct(x[1]) + '</small></button>';
        }).join('') + '</div></div>';
      }).join('') + '</details>';
    return h;
  }
  function tkAnalysis() {
    var n = ticket.length, P = tkJoint(ticket), odds = ticket.map(function (t) { return tkNum(t.o); }), allOdds = odds.every(function (o) { return o > 1; }), prodOdds = allOdds ? odds.reduce(function (a, b) { return a * b; }, 1) : 0;
    var total = tkNum(st.tkTotal) || prodOdds, stake = tkNum(st.tkStake) > 0 ? +String(st.tkStake).replace(',', '.') : AS.unit, g = tkGrade(P);
    var h = '<div class="tkan ' + g[1] + '"><div class="tkv"><div class="tkvr">' + gaugeBig(P) + '</div><div><small>Chances que tout passe</small><b data-n="' + Math.round(P * 100) + '" data-s="%">' + pct(P) + '</b><span class="tkg ' + g[1] + '">' + g[0] + '</span></div></div>' +
      '<div class="tkmeta"><span>Cote juste<b>' + (P > 0.0005 ? (1 / P).toFixed(2).replace('.', ',') : '—') + '</b></span><span>' + n + ' sélection' + (n > 1 ? 's' : '') + '<b>' + pct(Math.pow(P, 1 / n)) + ' en moy.</b></span></div>';
    // cote et mise
    h += '<div class="tkbet"><label>Cote du combiné<input data-tktotal inputmode="decimal" placeholder="' + (prodOdds ? prodOdds.toFixed(2).replace('.', ',') : 'ex. 3,40') + '" value="' + esc(st.tkTotal || '') + '"></label>' +
      '<label>Mise (€)<input data-tkstake inputmode="decimal" placeholder="' + AS.unit + '" value="' + esc(st.tkStake || '') + '"></label></div>';
    if (total > 1) {
      var ev = P * total - 1;
      h += '<div class="as-verdict">' + asVerdict(P, stake, total) + '</div>';
    } else h += '<div class="sub">Saisis la cote du combiné (ou la cote de chaque sélection) pour savoir si elle est à la hauteur du risque.</div>';
    h += '</div>';
    if (n < 2) return h + '<div class="sub">Ajoute au moins une deuxième sélection pour que je te dise laquelle enlever.</div>';
    // sélection par sélection : que se passe-t-il si on l'enlève ?
    var legs = ticket.map(function (t, i) {
      var rest = ticket.filter(function (x, k) { return k !== i; }), pw = tkJoint(rest), cond = pw > 0 ? Math.min(1, P / pw) : t.p, o = tkNum(t.o);
      return { i: i, t: t, pw: pw, cond: cond, gain: pw - P, o: o };
    });
    legs.sort(function (a, b) { return a.cond - b.cond; });
    h += '<div class="sec"><span class="dot a"></span>Sélection par sélection <small>de la plus fragile à la plus solide</small></div><div class="tkadv">' + legs.map(function (l) {
      var gr = l.cond >= 0.8 ? ['À garder', 'ok'] : l.cond >= 0.6 ? ['À surveiller', 'mid'] : ['À enlever', 'ko'];
      return '<div class="tka ' + gr[1] + '"><div class="tkah"><span class="tkt">' + esc(tkLab(l.t)) + '</span><span class="tkb2">' + gr[0] + '</span></div><div class="tkam">' + esc(l.t.mt) + ' · ' + esc(l.t.m) + '</div>' +
        '<div class="tkan2">Chance de passer : <b>' + pct(l.cond) + '</b> · sans elle, le ticket passe de <b>' + pct(P) + '</b> à <b>' + pct(l.pw) + '</b> (' + (l.gain >= 0 ? '+' : '') + Math.round(l.gain * 100) + ' pts) · cote juste ' + (l.pw > 0.0005 ? (1 / l.pw).toFixed(2).replace('.', ',') : '—') + '</div></div>';
    }).join('') + '</div>';
    // version conseillée
    var keep = legs.filter(function (l) { return l.cond >= 0.6; }).map(function (l) { return l.t; });
    if (!keep.length) keep = [legs[legs.length - 1].t];
    if (keep.length < n) {
      var Pk = tkJoint(keep);
      h += '<div class="tkrec"><b>Version conseillée</b><div>' + keep.map(function (t) { return esc(tkLab(t)); }).join(' + ') + '</div><div class="tkn3">' + pct(Pk) + ' de chances (au lieu de ' + pct(P) + ') · cote juste ' + (Pk > 0.0005 ? (1 / Pk).toFixed(2).replace('.', ',') : '—') +
        '. Tu enlèves : ' + ticket.filter(function (t) { return keep.indexOf(t) < 0; }).map(function (t) { return esc(tkLab(t)); }).join(', ') + '.</div></div>';
    } else h += '<div class="tkrec ok"><b>Ticket cohérent</b><div class="tkn3">Aucune sélection n’est vraiment fragile par rapport aux autres.</div></div>';
    // meilleur sous-ensemble selon la valeur, si toutes les cotes sont connues
    if (allOdds && n <= 10) {
      var best = null;
      for (var mask = 1; mask < (1 << n); mask++) {
        var sub = ticket.filter(function (t, k) { return mask & (1 << k); }), ps = tkJoint(sub), os = sub.reduce(function (a, t) { return a * tkNum(t.o); }, 1), e2 = ps * os - 1;
        if (!best || e2 > best.e) best = { e: e2, sub: sub, p: ps, o: os };
      }
      h += '<div class="tkrec"><b>Meilleure valeur avec tes cotes</b><div>' + best.sub.map(function (t) { return esc(tkLab(t)); }).join(' + ') + '</div><div class="tkn3">' + pct(best.p) + ' de chances · cote ' + best.o.toFixed(2).replace('.', ',') + ' · espérance ' + (best.e >= 0 ? '+' : '−') + Math.abs(Math.round(best.e * 100)) + ' % de la mise (marge du bookmaker incluse).</div></div>';
    }
    return h;
  }
  function gaugeBig(P) {
    var r = 30, c = 2 * Math.PI * r;
    return '<svg class="tkring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="' + r + '" class="bt0"/><circle cx="36" cy="36" r="' + r + '" class="bt1" stroke-dasharray="' + (c * Math.min(1, P)).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 36 36)"/></svg>';
  }
  function ticketHTML() {
    var h = '<div class="top"><h1>Mon ticket</h1></div><div class="sub">Note tes paris : je calcule tes chances et je te dis quoi garder ou enlever.</div>' + tkPicker();
    if (!ticket.length) return h + '<div class="empty">Ton ticket est vide. Cherche une équipe ci-dessus, choisis un match, puis touche les paris que tu veux jouer (victoire, +1,5 buts, les deux marquent…).</div>';
    h += '<div class="sec"><span class="dot g"></span>Mes sélections <small>' + ticket.length + '</small></div>' + ticket.map(function (t, i) {
      var gr = tkGrade(t.p);
      return '<div class="tkrow2"><div class="tkr1"><div class="tkr2"><b>' + esc(tkLab(t)) + '</b><small>' + esc(t.mt) + ' · ' + esc(t.m) + '</small></div><span class="tkg ' + gr[1] + '">' + pct(t.p) + '</span>' +
        '<button class="rm" data-rm="' + i + '" aria-label="Retirer">' + svg(IC.x) + '</button></div><label class="tko">Cote<input data-tkodds="' + i + '" inputmode="decimal" placeholder="1,50" value="' + (t.o ? String(t.o).replace('.', ',') : '') + '"></label></div>';
    }).join('');
    h += tkAnalysis();
    return h + '<div class="tkbtns"><button class="voir mid wide" data-bcomb>€ Noter ce ticket dans Mes paris</button><button class="voir low wide" data-clear>Vider le ticket</button></div>';
  }

  /* ------------------------------------------------------------ stratégie : plan de mise avec récupération limitée, arrêt automatique et simulation honnête */
  var PL = null;
  try { PL = JSON.parse(localStorage.getItem('pf-plan') || 'null'); } catch (e) { PL = null; }
  var PLD = { start: 20, goal: 100, prof: 'pr' };                  // brouillon de l'écran de départ
  var PLODDS = {}, PLC = [];                                       // cotes saisies (par clé de pari) ; liste des paris proposés affichés (pour les boutons)
  function plSave() { try { localStorage.setItem('pf-plan', JSON.stringify(PL)); } catch (e) { /* ignoré */ } }
  function plNum(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return x > 0 ? x : 0; }
  function plKey(c) { return c.legs.map(function (l) { return l.id + '|' + l.m + '|' + l.s; }).join('+'); }
  function plProf() { return PL ? Plan.profile(PL.prof, PL.bank, PL.goal) : Plan.PROF.pr; }
  function plPa(r) { return r.p - asHair(r) - (r.v ? 0 : 0.02); }
  function plCands(R, prof, T) {                                   // paris proposables : un par match, pas encore commencés, pas déjà écartés ; singles puis combinés de 2
    var skip = (PL.skip && PL.skip[T]) || {}, used = {}, seen = {}, pool = [], out = [];
    if (PL.cyc) PL.cyc.steps.forEach(function (s) { s.legs.forEach(function (l) { used[l.match] = 1; }); });
    R.picks.forEach(function (r) {
      if (!r.bid || used[r.match] || r.p > AS_CAP) return;
      if (r.time && kickoff({ date: T, time: r.time }) < Date.now() + 5 * 60000) return;
      var pa = plPa(r);
      if (pa < prof.minDuo - 0.04) return;
      var k = r.bid + '|' + r.bm + '|' + r.bs;
      if (skip[k]) return;
      if (!seen[r.match] || pa > seen[r.match].pa) seen[r.match] = { r: r, pa: pa, k: k };
    });
    Object.keys(seen).forEach(function (m) { pool.push(seen[m]); });
    pool.sort(function (a, b) { return b.pa - a.pa; });
    function leg(x) { return { id: x.r.bid, m: x.r.bm, s: x.r.bs, match: x.r.match, pick: x.r.pick, icon: x.r.icon, time: x.r.time, ref: x.r.ref }; }
    pool.filter(function (x) { return x.pa >= prof.minPa; }).slice(0, 5).forEach(function (x) { out.push({ legs: [leg(x)], pa: x.pa, icon: x.r.icon }); });
    var top = pool.slice(0, 8), best = null, bestX = null;
    for (var i = 0; i < top.length; i++) for (var j = i + 1; j < top.length; j++) {
      var pp = top[i].pa * top[j].pa;
      if (pp < prof.minDuo) continue;
      if (!best || pp > best.pa) best = { legs: [leg(top[i]), leg(top[j])], pa: pp, icon: top[i].r.icon + top[j].r.icon };
      if (top[i].r.icon !== top[j].r.icon && (!bestX || pp > bestX.pa)) bestX = { legs: [leg(top[i]), leg(top[j])], pa: pp, icon: top[i].r.icon + top[j].r.icon };
    }
    if (best && prof.steps > 0) out.push(best);
    if (bestX && (!best || plKey(bestX) !== plKey(best))) out.push(bestX);
    out.forEach(function (c) { c.key = plKey(c); c.duo = c.legs.length > 1; });
    return out;
  }
  function plSettle(won) {                                         // règle l'étape en attente, met à jour le capital, clôt le cycle si c'est fini
    var cy = PL.cyc, s = cy && cy.steps[cy.steps.length - 1];
    if (!s || s.res !== null) return;
    s.res = won;
    PL.bank = Plan.r2(PL.bank + (won ? s.stake * (s.o - 1) : -s.stake));
    var T = parisToday();
    if (won || cy.steps.length >= cy.max || PL.bank < 1) {
      PL.hist.unshift({ day: T, net: Plan.r2(PL.bank - cy.cb), n: cy.steps.length, ok: !!won });
      if (PL.hist.length > 40) PL.hist.length = 40;
      if (!won) PL.pause = T;
      PL.cyc = null;
    }
    plSave();
  }
  function plAuto() {                                              // règle tout seul l'étape en attente quand les résultats des matchs sont connus
    var cy = PL && PL.cyc, s = cy && cy.steps[cy.steps.length - 1];
    if (!s || s.res !== null) return;
    if (!Bets.resolver) return;
    var rs = s.legs.map(function (l) { return Bets.resolver(l.id, l.m, l.s); });
    if (rs.some(function (x) { return x === false; })) plSettle(false);
    else if (rs.every(function (x) { return x === true; })) plSettle(true);
    else if (!isLoaded('res')) loadLazy('res', function () { if (st.tab === 'plan' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });
  }
  function plSimHTML(start, goal, profKey, pa) {
    var a = Plan.sim({ start: start, goal: goal, prof: profKey, pa: pa, margin: Plan.MARGIN }), b = Plan.sim({ start: start, goal: goal, prof: profKey, pa: pa, margin: 0 });
    function n(x) { return String(Math.round(x * 1000) / 10).replace('.', ',') + ' %'; }
    return '<div class="plsim"><b>Ce que dit le calcul</b><div class="pltxt">' + a.runs + ' parcours simulés, ' + a.maxCycles + ' cycles maximum, paris à <b>' + pct(pa) + '</b> de chances réelles (cote ≈ ' + a.odds.toFixed(2).replace('.', ',') + ' avec la marge habituelle d’un bookmaker de 7 %).</div>' +
      '<div class="plgrid"><span>Atteindre ' + goal + ' €<b>' + n(a.reach) + '</b><small>sans marge : ' + n(b.reach) + '</small></span><span>Tout perdre<b class="ko">' + n(a.ruin) + '</b><small>sans marge : ' + n(b.ruin) + '</small></span>' +
      '<span>Capital moyen à la fin<b>' + eur2(a.avg) + '</b><small>sans marge : ' + eur2(b.avg) + '</small></span></div>' +
      '<div class="pltxt">Même avec des cotes sans aucune marge, les chances d’atteindre l’objectif plafonnent autour de <b>' + pct(Math.min(1, start / goal)) + '</b> (capital ÷ objectif) : on ne peut pas faire mieux avec des paris équitables, quelle que soit la façon de miser. ' +
      'Récupérer ses pertes en doublant la mise ne rend pas un pari plus rentable : ça transforme beaucoup de petits gains en une grosse perte rare.</div></div>';
  }
  function plAvgPa(R, prof, T) {
    var c = plCands(R, prof, T).filter(function (x) { return !x.duo; });
    return c.length ? Math.max(0.7, Math.min(0.9, c.reduce(function (t, x) { return t + x.pa; }, 0) / c.length)) : 0.78;
  }
  function plSetup(R) {
    var T = parisToday(), pa = 0.78, prof = Plan.PROF[PLD.prof];
    if (R) { PL = { skip: {} }; pa = plAvgPa(R, prof, T); PL = null; }
    var h = '<div class="sec"><span class="dot g"></span>Mon plan</div><div class="tkan"><div class="tkbet">' +
      '<label>Capital de départ (€)<input data-plcap inputmode="decimal" value="' + PLD.start + '"></label><label>Objectif (€)<input data-plgoal inputmode="decimal" value="' + PLD.goal + '"></label></div>' +
      '<div class="chips">' + ['pr', 'eq', 'au'].map(function (k) { return '<button class="chip pill' + (PLD.prof === k ? ' on' : '') + '" data-plprof="' + k + '">' + Plan.PROF[k].name + '</button>'; }).join('') + '</div>' +
      '<div class="sub">' + esc(prof.txt) + '</div>' +
      '<div class="pltxt">Le principe : une série (un « cycle ») démarre par un pari sûr. S’il passe, le cycle est gagné. S’il perd, je te propose un 2e pari, avec la mise qui permet de récupérer la perte, dans la limite de ton capital. ' +
      'Si le cycle rate, on s’arrête pour la journée. Dès que l’objectif est atteint, je passe en mode sécurisé et je te conseille de retirer ton capital de départ. Si tu perds la moitié de ton capital, je te dis de t’arrêter.</div></div>' +
      (PLD.start >= 5 && PLD.goal > PLD.start ? plSimHTML(PLD.start, PLD.goal, PLD.prof, pa) : '<div class="bt-warn">Le capital doit être d’au moins 5 € et l’objectif supérieur au capital.</div>') +
      '<div class="tkbtns"><button class="voir mid wide" data-plstart>Démarrer ce plan</button></div>';
    return h;
  }
  function plCandHTML(c, i, stakeInfo) {
    var pa = c.pa, oe = (1 - Plan.MARGIN) / pa, o = plNum(PLODDS[c.key]), valid = o >= 1 / pa, stake = stakeInfo.fixed || stakeInfo.fn(o > 1 ? o : oe);
    var legs = c.legs.map(function (l) { return '<div class="plleg"><span>' + l.icon + ' ' + esc(l.match) + '</span><small>' + esc(l.time || '') + ' · ' + esc(l.pick) + '</small></div>'; }).join('');
    return '<div class="plc"><div class="plch"><span class="tkg high">' + pct(pa) + '</span><b>' + (c.duo ? 'Combiné de 2' : 'Pari simple') + '</b></div>' + legs +
      '<div class="plmeta"><span>Cote habituelle<b>≈ ' + oe.toFixed(2).replace('.', ',') + '</b></span><span>Cote minimale<b>' + (1 / pa).toFixed(2).replace('.', ',') + '</b></span><span>Mise<b>' + eur2(stake) + '</b></span></div>' +
      '<div class="as-odds"><label>Cote vue chez ton bookmaker<input data-plodds="' + esc(c.key) + '" inputmode="decimal" autocomplete="off" placeholder="ex. ' + oe.toFixed(2).replace('.', ',') + '" value="' + (o ? String(o).replace('.', ',') : '') + '"></label>' +
      (o > 1 ? '<div class="as-verdict">' + asVerdict(pa, stake, o) + '</div>' : '<div class="sub">Dis-moi la cote que tu vois : je te dis si ça vaut le coup, et la mise exacte.</div>') + '</div>' +
      '<div class="plbtns"><button class="voir ' + (valid ? 'mid' : 'low') + '" data-plgo="' + i + '"' + (valid && stake >= 1 ? '' : ' disabled') + '>Je mise</button><button class="voir low" data-plskip="' + i + '">Pas chez mon bookmaker</button>' +
      c.legs.map(function (l) { return l.ref ? '<button class="voir low" ' + l.ref + '>Voir ' + esc(l.match.split(' – ')[0]) + '</button>' : ''; }).join('') + '</div></div>';
  }
  function planTabHTML() {
    todayLoad();
    var T = parisToday(), R = todayRows(), h = '<div class="top"><h1>Stratégie</h1></div><div class="sub">Un plan de mise pour avancer par petits paliers, tous sports confondus' + (TODAY.busy ? ' · chargement ' + TODAY.step + '/' + TODAY.total + '…' : '') + '</div>';
    h += '<div class="bt-warn">Aucune stratégie ne bat les cotes sur la durée : la marge du bookmaker fait perdre en moyenne ~7 % de chaque euro misé. Ce plan cadre le risque, il ne le supprime pas. Ne mise que de l’argent que tu peux perdre. Joueurs Info Service : 09 74 75 13 13.</div>';
    if (!PL) return h + plSetup(R);
    PL.skip = PL.skip || {}; PL.hist = PL.hist || [];
    plAuto();
    var prof = plProf(), cy = PL.cyc, sec = prof.key === 'se', prog = Math.max(0, Math.min(1, (PL.bank - PL.start) / Math.max(1, PL.goal - PL.start))), net = Plan.r2(PL.bank - PL.start);
    h += '<div class="tkan"><div class="tkmeta"><span>Capital<b>' + eur2(PL.bank) + '</b></span><span>Départ<b>' + eur2(PL.start) + '</b></span><span>Objectif<b>' + eur2(PL.goal) + '</b></span></div>' +
      '<div class="bar"><i style="width:' + Math.round(prog * 100) + '%"></i></div><div class="sub">' + (net >= 0 ? '+' : '−') + eur2(Math.abs(net)) + ' depuis le début · profil <b>' + esc(prof.name) + '</b></div></div>';
    if (PL.bank < 1) return h + '<div class="bt-warn"><b>Capital épuisé.</b> Le plan est terminé. C’est une perte que le plan avait annoncée dans ses chances ci-dessous.</div>' + plSimHTML(PL.start, PL.goal, PL.prof, 0.78) + plFoot();
    if (PL.bank >= PL.goal) {
      var wd = Math.min(PL.start, PL.bank - 1);
      h += '<div class="tkrec"><b>Objectif atteint</b><div>Retire ton capital de départ (' + eur2(wd) + ') et joue avec le reste.</div><div class="tkn3">Ainsi, même si la suite tourne mal, tu ne perds plus que des gains. Je passe en mode sécurisé : mises de 10 %, paris très sûrs, aucune récupération.</div>' +
        '<div class="tkbtns"><button class="voir mid wide" data-plwd="' + wd + '">J’ai retiré ' + eur2(wd) + '</button></div></div>';
    }
    if (PL.bank < PL.start * 0.5 && !PL.ack) {
      return h + '<div class="bt-warn"><b>Arrête-toi ici.</b> Tu as perdu plus de la moitié de ton capital de départ : c’est la limite que ce plan s’était fixée. Continuer à jouer pour « se refaire » est exactement ce qui fait perdre le plus.</div>' +
        '<div class="tkbtns"><button class="voir low wide" data-plack>Je continue quand même (déconseillé)</button></div>' + plFoot();
    }
    // étape en cours
    if (cy) {
      h += '<div class="sec"><span class="dot a"></span>Cycle en cours <small>capital au départ du cycle : ' + eur2(cy.cb) + '</small></div>';
      cy.steps.forEach(function (s, i) {
        var last = i === cy.steps.length - 1, st2 = s.res === true ? ['Gagné', 'ok'] : s.res === false ? ['Perdu', 'ko'] : ['En attente', 'mid'];
        h += '<div class="tka ' + st2[1] + '"><div class="tkah"><span class="tkt">Étape ' + (i + 1) + ' · mise ' + eur2(s.stake) + ' à ' + String(s.o).replace('.', ',') + '</span><span class="tkb2">' + st2[0] + '</span></div>' +
          s.legs.map(function (l) { return '<div class="tkam">' + l.icon + ' ' + esc(l.match) + ' · ' + esc(l.pick) + '</div>'; }).join('') +
          '<div class="tkan2">' + (s.res === null ? 'Si ça passe : <b>+' + eur2(s.stake * (s.o - 1)) + '</b>. Le résultat se règle tout seul quand le match est fini ; sinon, tu peux le saisir :' : s.res ? 'Gain : +' + eur2(s.stake * (s.o - 1)) : 'Perte : −' + eur2(s.stake)) + '</div>' +
          (s.res === null && last ? '<div class="plbtns"><button class="voir mid" data-plres="1">Gagné</button><button class="voir low" data-plres="0">Perdu</button></div>' : '') + '</div>';
      });
      if (cy.steps[cy.steps.length - 1].res === null) return h + plFoot();
    } else if (PL.pause === T) {
      return h + '<div class="tkrec"><b>Pause jusqu’à demain</b><div class="tkn3">Le dernier cycle a échoué. Le plan s’arrête là pour aujourd’hui : c’est précisément le moment où l’on a envie de tout rejouer pour se refaire. Reviens demain.</div></div>' + plFoot();
    } else if (((PL.days || {})[T] || 0) >= 2) {
      return h + '<div class="tkrec"><b>Assez pour aujourd’hui</b><div class="tkn3">Deux cycles par jour au maximum. Reviens demain.</div></div>' + plFoot();
    }
    // proposition de la prochaine étape
    var k = cy ? cy.steps.length : 0, cb = cy ? cy.cb : PL.bank, L = cy ? Plan.r2(cy.cb - PL.bank) : 0, info;
    if (k === 0) {
      var s1 = Plan.stake1(cb, prof);
      info = { fixed: s1 };
      h += '<div class="sec"><span class="dot g"></span>Étape 1 <small>mise ' + eur2(s1) + ' (' + Math.round(prof.f1 * 100) + ' % du capital)</small></div>';
    } else {
      var g = cy.g, bank = PL.bank;
      info = { fn: function (o) { return Plan.recStake(L, g, o, bank, plProf()).stake; } };
      var rs0 = Plan.recStake(L, g, 1.3, bank, plProf());
      h += '<div class="sec"><span class="dot a"></span>Étape ' + (k + 1) + ' : récupérer <small>perte à rattraper ' + eur2(L) + ' · gain visé +' + eur2(g) + '</small></div>' +
        '<div class="sub">La mise dépend de la cote : plus elle est basse, plus il faut miser pour récupérer. Elle est plafonnée à ' + Math.round(plProf().recCap * 100) + ' % de ton capital restant (' + eur2(bank) + '). ' +
        (rs0.full ? '' : 'Avec une cote de 1,30 tu ne récupérerais pas tout : il faudrait une cote d’au moins <b>' + rs0.minOdds.toFixed(2).replace('.', ',') + '</b> pour tout rattraper avec ce que tu as.') + '</div>';
    }
    PLC = plCands(R, prof, T);
    if (!PLC.length) h += TODAY.busy ? skel(3) : '<div class="tkrec"><b>Rien d’assez sûr pour l’instant</b><div class="tkn3">Aucun pari ne passe le seuil de ce plan (' + pct(prof.minPa) + ' de chances réelles, marge de prudence retirée). Ne joue pas : mieux vaut ne rien miser que miser sur du moyen. Reviens plus tard dans la journée.</div></div>';
    else h += PLC.map(function (c, i) { return plCandHTML(c, i, info); }).join('');
    if (cy) h += '<div class="tkbtns"><button class="voir low wide" data-plend>J’arrête ce cycle (je garde ma perte)</button></div>';
    var pa0 = PLC.length ? PLC.filter(function (c) { return !c.duo; }).concat(PLC)[0].pa : 0.78;
    return h + plSimHTML(PL.start, PL.goal, PL.prof, Math.max(0.6, Math.min(0.9, pa0))) + plFoot();
  }
  function plFoot() {
    var H = PL.hist || [], w = H.filter(function (x) { return x.ok; }).length;
    var h = H.length ? '<div class="sec"><span class="dot b"></span>Mes cycles <small>' + w + ' gagnés sur ' + H.length + '</small></div>' + H.slice(0, 8).map(function (x) {
      return '<div class="pr ' + (x.ok ? 'ok' : 'ko') + '"><span class="pt">' + dm(x.day) + ' · ' + x.n + ' étape' + (x.n > 1 ? 's' : '') + '</span><span class="pp">' + (x.net >= 0 ? '+' : '−') + eur2(Math.abs(x.net)) + '</span></div>';
    }).join('') : '';
    return h + '<div class="tkbtns"><button class="voir low wide" data-plreset>Recommencer un plan</button></div>';
  }
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-plprof],[data-plstart],[data-plgo],[data-plskip],[data-plres],[data-plend],[data-plreset],[data-plwd],[data-plack]');
    if (!t) return;
    var T = parisToday(), y = window.scrollY, c, cy;
    if (t.hasAttribute('data-plprof')) { PLD.prof = t.getAttribute('data-plprof'); }
    else if (t.hasAttribute('data-plstart')) {
      if (!(PLD.start >= 5 && PLD.goal > PLD.start)) return;
      PL = { on: 1, start: PLD.start, bank: PLD.start, goal: PLD.goal, prof: PLD.prof, cyc: null, hist: [], skip: {}, days: {}, pause: '' }; plSave();
    }
    else if (t.hasAttribute('data-plgo')) {
      c = PLC[+t.getAttribute('data-plgo')];
      var o = c && plNum(PLODDS[c.key]);
      if (!c || !(o >= 1 / c.pa) || t.disabled) return;
      var prof = plProf();
      if (!PL.cyc) { PL.cyc = { cb: PL.bank, max: prof.steps, g: 0, steps: [] }; PL.days = PL.days || {}; PL.days[T] = (PL.days[T] || 0) + 1; }
      cy = PL.cyc;
      var stake = cy.steps.length ? Plan.recStake(Plan.r2(cy.cb - PL.bank), cy.g, o, PL.bank, prof).stake : Plan.stake1(cy.cb, prof);
      if (stake < 1) return;
      if (!cy.steps.length) cy.g = Plan.target(stake, o);
      cy.steps.push({ legs: c.legs.map(function (l) { return { id: l.id, m: l.m, s: l.s, match: l.match, pick: l.pick, icon: l.icon }; }), pa: c.pa, o: o, stake: stake, res: null, t: Date.now() });
      plSave();
    }
    else if (t.hasAttribute('data-plskip')) {
      c = PLC[+t.getAttribute('data-plskip')];
      if (c) { PL.skip[T] = PL.skip[T] || {}; c.legs.forEach(function (l) { PL.skip[T][l.id + '|' + l.m + '|' + l.s] = 1; }); plSave(); }
    }
    else if (t.hasAttribute('data-plres')) plSettle(t.getAttribute('data-plres') === '1');
    else if (t.hasAttribute('data-plend')) {
      cy = PL.cyc;
      if (cy && cy.steps.length && cy.steps[cy.steps.length - 1].res !== null) { PL.hist.unshift({ day: T, net: Plan.r2(PL.bank - cy.cb), n: cy.steps.length, ok: false }); PL.pause = T; PL.cyc = null; plSave(); }
    }
    else if (t.hasAttribute('data-plwd')) { PL.bank = Plan.r2(PL.bank - plNum(t.getAttribute('data-plwd'))); PL.start = Math.min(PL.start, PL.bank); PL.goal = Math.max(PL.goal, PL.bank * 2); plSave(); }
    else if (t.hasAttribute('data-plack')) { PL.ack = 1; plSave(); }
    else if (t.hasAttribute('data-plreset')) { if (!window.confirm || window.confirm('Effacer ce plan et recommencer ?')) { PL = null; try { localStorage.removeItem('pf-plan'); } catch (err) { /* ignoré */ } } }
    render(); window.scrollTo(0, y);
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.hasAttribute) return;
    if (t.hasAttribute('data-plodds')) PLODDS[t.getAttribute('data-plodds')] = t.value;
    else if (t.hasAttribute('data-plcap')) PLD.start = plNum(t.value);
    else if (t.hasAttribute('data-plgoal')) PLD.goal = plNum(t.value);
    else return;
    var yy = window.scrollY; render(); window.scrollTo(0, yy);
  });

  /* ------------------------------------------------------------ fiche match */
  function line(a, b) { return '<div class="mline"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>'; }
  var BETSP = { handball: 'hand', rugby15: 'rugby', TEN: 'tennis' };
  function betSport(d) { return d && d.div && !D.leagues[d.div] ? (BETSP[d.div] || d.div) : 'foot'; }
  function betRef(d) { return d.ref || (d.fi != null && D.fixtures[d.fi] ? D.fixtures[d.fi].id : ''); }
  function alt(s, best, d, m, cls) {
    var p = s[1], k = tkKey(d, m, s[0]), on = inTicket(k);
    var rr = Bets.resolver ? Bets.resolver(betRef(d), m, s[0]) : null;
    return '<div class="alt' + (best ? ' best' : '') + (rr === true ? ' won' : rr === false ? ' lost' : '') + '"><span>' + esc(s[0]) + (rr === true ? ' <b class="rm ok">✓</b>' : rr === false ? ' <b class="rm ko">✗</b>' : '') + '</span><span class="p">' + pct(p) + '</span>' +
      '<span class="acts"><button class="add bet" data-bet="' + esc(d.home + ' – ' + d.away + ' : ' + s[0]) + '" data-bsp="' + betSport(d) + '" data-bp="' + p.toFixed(4) + '" data-bm="' + esc(m) + '" data-bs="' + esc(s[0]) + '" data-bref="' + esc(betRef(d)) + '" data-bcat="' + (cls === 'g' ? 'Pronostic sûr' : 'Moins sûr') + '" aria-label="Noter ce pari dans Mes paris">€</button>' +
      '<button class="add' + (on ? ' on' : '') + '" data-add="' + esc(k) + '" data-p="' + p.toFixed(4) + '" data-mt="' + esc(d.home + ' – ' + d.away) +
      '" data-m="' + esc(m) + '" data-s="' + esc(s[0]) + '" data-bref="' + esc(betRef(d)) + '" aria-label="' + (on ? 'Retirer du combiné' : 'Ajouter au combiné') + '">' + svg(on ? IC.check : IC.plus) + '</button></span>' +
      '<span class="c">' + (p > 0.005 ? 'cote juste ' + (1 / p).toFixed(2) : 'très improbable') + '</span>' +
      '<div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div></div>';
  }
  function mkRow(cls, d) {
    return function (x) {
      var rx = Bets.resolver ? Bets.resolver(betRef(d), x.m, x.s) : null;
      return '<details class="mk' + (rx === true ? ' won' : rx === false ? ' lost' : '') + '"><summary><span class="mi ' + cls + '">' + mkIcon(x.m) + '</span><span class="mt">' + esc(x.m) +
        (x.v ? '' : ' <span class="warn" title="Marché non validé par backtest">⚠</span>') + Books.tags(x.f) +
        '</span><span class="pk ' + cls + '">' + esc(x.s) + ' · ' + pct(x.p) + (rx === true ? ' ✓' : rx === false ? ' ✗' : '') + '</span></summary><div class="alts">' +
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
  function nearHalf(fam) { return fam.sels.reduce(function (a, b) { return Math.abs(b[1] - 0.5) < Math.abs(a[1] - 0.5) ? b : a; }); }
  function topSel(fam) { return fam.sels.reduce(function (a, b) { return b[1] > a[1] ? b : a; }); }
  function overviewHTML(M, d) {                             // marchés principaux dans l'ordre habituel, une seule sélection mise en avant
    var by = {}; M.fams.forEach(function (x) { by[x.name] = x; });
    var rows = [], over = M.over25 >= 0.5;
    function add(fam, sel, label) {
      if (!fam) return;
      var s0 = sel || topSel(fam);
      rows.push({ m: label || fam.name, s: s0[0], p: s0[1], v: fam.validated, f: fam });
    }
    add(by['Résultat du match']);
    add(by['Double chance']);
    add(by['Les deux équipes marquent']);
    add(by['Premier but']);
    add(by['Résultat à la mi-temps']);
    add(by['Score exact']);
    var gf = by[over ? 'Total buts (plus)' : 'Total buts (moins)'];
    if (gf) add(gf, gf.sels.filter(function (x) { return x[0].indexOf('2,5') >= 0; })[0], gf.name);
    [d.home, d.away].forEach(function (t) { var tf = by['Buts de ' + t + (over ? ' (plus)' : ' (moins)')] || by['Buts de ' + t + ' (plus)']; if (tf) add(tf, nearHalf(tf)); });
    var cf = by['Corners (plus)'];
    if (cf) add(cf, nearHalf(cf));
    return '<div class="sec"><span class="dot g"></span>Les marchés principaux <small>touche pour voir toutes les sélections</small></div><div class="ovw">' +
      rows.slice(0, 6).map(function (x) { return mkRow(x.p >= 0.62 ? 'g' : 'a', d)(x); }).join('') + '</div><div class="sub">Les autres marchés sont dans les onglets ci-dessus : Résultat, Buts, Mi-temps, Stats, Combinés.</div>';
  }
  function htftHTML(M, d) {
    var fam = M.fams.filter(function (x) { return x.name === 'Mi-temps / Fin de match'; })[0];
    if (!fam || fam.sels.length !== 9) return '';
    var ps = fam.sels.map(function (x) { return x[1]; }), sorted = ps.slice().sort(function (a, b) { return b - a; }),
      eq = '<span class="eqs">=</span>';
    function head(i) { return '<div class="hh">' + (i === 0 ? crest(d.home) + '<small>' + esc(initials(nm(d.home))) + '</small>' : i === 1 ? eq + '<small>Nul</small>' : crest(d.away) + '<small>' + esc(initials(nm(d.away))) + '</small>') + '</div>'; }
    var h = '<div class="sec"><span class="dot a"></span>Mi-temps / Fin de match <small>lignes : mi-temps · colonnes : fin</small></div><div class="htft"><div class="hh hc0">MT / FT</div>' + head(0) + head(1) + head(2);
    for (var a = 0; a < 3; a++) {
      h += head(a);
      for (var c = 0; c < 3; c++) {
        var v = ps[a * 3 + c], rank = v === sorted[0] ? ' r1' : v === sorted[1] ? ' r2' : '';
        h += '<div class="hc' + rank + '"><b>' + (['1', 'N', '2'][a]) + '/' + (['1', 'N', '2'][c]) + '</b><span>' + (v * 100).toFixed(1).replace('.', ',') + ' %</span></div>';
      }
    }
    return h + '</div>';
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
    h += predTabs(M, C, d);
    return h;
  }
  /* fiche match : un onglet interne par famille de marchés (plus de page interminable) */
  var PCATS = [['sum', 'Résumé'], ['res', 'Résultat'], ['goals', 'Buts'], ['ht', 'Mi-temps'], ['stats', 'Stats'], ['combo', 'Combinés']];
  function mCat(name) {
    if (/Résultat et|Combiné|1er but et|multichance|MyMatch/.test(name)) return 'combo';
    if (/mi-temps|Mi-temps/.test(name)) return 'ht';
    if (/Corner|Tirs|tirs|Carton/.test(name)) return 'stats';
    if (/^Résultat du match|^Double chance|Vainqueur|Handicap|Marge|gagne par|Écart|sans (encaisser|concéder)/.test(name)) return 'res';
    return 'goals';
  }
  function pickFor(fam) {                                   // la sélection la plus parlante d'un marché : la plus probable pour 1X2, la plus proche de 50 % pour les lignes de buts
    var multi = fam.sels.length >= 4 && /plus|moins|corners|tirs|buts/i.test(fam.name);
    return multi ? nearHalf(fam) : topSel(fam);
  }
  function famRow(d) {
    return function (fam) {
      var s0 = pickFor(fam), x = { m: fam.name, s: s0[0], p: s0[1], v: fam.validated, f: fam };
      return mkRow(s0[1] >= SAFE ? 'g' : s0[1] >= 0.5 ? 'a' : 'b', d)(x);
    };
  }
  function hcCards(M, d) {                                  // « haute confiance » : cartes à faire défiler, une par marché
    var byKind = {};
    M.fams.forEach(function (f) {
      if (f.lottery) return;
      var ok = f.sels.filter(function (x) { return x[1] >= 0.85 && x[1] < 0.97; });
      if (!ok.length) return;
      var c = { m: f.name, s: ok.reduce(function (a, b) { return b[1] < a[1] ? b : a; }) };
      if (!byKind[f.kind] || c.s[1] < byKind[f.kind].s[1]) byKind[f.kind] = c;
    });
    var best = Object.keys(byKind).map(function (k) { return byKind[k]; }).sort(function (a, b) { return b.s[1] - a.s[1]; }).slice(0, 10);
    if (!best.length) return '';
    return '<div class="sec hc"><span class="dot g"></span>Haute confiance <small>85 à 97 % · fais défiler →</small></div><div class="hcrow">' + best.map(function (x) {
      var pr = x.s[1];
      return '<div class="hcc"><small>' + esc(x.m) + '</small><b>' + esc(x.s[0]) + '</b><span class="hp">' + pct(pr) + '</span><em>cote juste ' + (1 / pr).toFixed(2) + '</em>' +
        '<button class="add bet" data-bet="' + esc(d.home + ' – ' + d.away + ' : ' + x.s[0]) + '" data-bsp="' + betSport(d) + '" data-bp="' + pr.toFixed(4) + '" data-bm="' + esc(x.m) + '" data-bs="' + esc(x.s[0]) + '" data-bref="' + esc(betRef(d)) + '" data-bcat="Pronostic sûr" aria-label="Noter ce pari">€</button></div>';
    }).join('') + '</div>';
  }
  function predTabs(M, C, d) {
    var tab = st.ptab || 'sum', cats = { res: [], goals: [], ht: [], stats: [], combo: [] };
    M.fams.forEach(function (fam) { cats[mCat(fam.name)].push(fam); });
    var n = function (k) { return cats[k] ? cats[k].length : 0; };
    if (tab !== 'sum' && !n(tab)) tab = 'sum';
    var bar = '<div class="ptabs">' + PCATS.filter(function (c) { return c[0] === 'sum' || n(c[0]); }).map(function (c) {
      return '<button data-ptab="' + c[0] + '" class="' + (tab === c[0] ? 'on' : '') + '">' + c[1] + (c[0] !== 'sum' && n(c[0]) ? '<b>' + n(c[0]) + '</b>' : '') + '</button>'; }).join('') + '</div>';
    var h = bar;
    if (tab === 'sum') {
      h += hcCards(M, d) + overviewHTML(M, d);
    } else if (tab === 'goals') {
      h += heatHTML(M, d) + '<div class="sec"><span class="dot g"></span>Marchés de buts</div>' + cats.goals.map(famRow(d)).join('');
    } else if (tab === 'ht') {
      h += htftHTML(M, d) + '<div class="sec"><span class="dot a"></span>Mi-temps</div>' + cats.ht.map(famRow(d)).join('');
    } else if (tab === 'res') {
      h += '<div class="sec"><span class="dot g"></span>Résultat, handicaps et écarts</div>' + cats.res.map(famRow(d)).join('') + compareHTML(M, d);
    } else {
      h += '<div class="sec"><span class="dot ' + (tab === 'stats' ? 'b' : 'a') + '"></span>' + (tab === 'stats' ? 'Corners, tirs et cartons' : 'Combinés et scores') + '</div>' +
        (cats[tab].length ? cats[tab].map(famRow(d)).join('') : '<div class="empty">Aucun marché dans cette catégorie pour ce match.</div>');
    }
    return h + '<div class="sub" style="margin-top:12px">Touche un marché pour voir toutes les sélections et leur cote juste. ⚠ = marché non validé par backtest (voir l’onglet Fiabilité).</div>';
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
  function loadImg(url) {                                   // logo pour l'image de partage (ESPN autorise l'usage dans un canvas) ; null si indisponible
    return new Promise(function (res) {
      var im = new Image(), done = false, fin = function (v) { if (!done) { done = true; res(v); } };
      im.crossOrigin = 'anonymous'; im.onload = function () { fin(im); }; im.onerror = function () { fin(null); }; setTimeout(function () { fin(null); }, 2500); im.src = url;
    });
  }
  function shareImage(d, f) {
    var M = Engine.families(d.div, d.home, d.away, f && f.ov), C = Engine.classify(M.fams), p = M.p1x2, mx = Math.max.apply(null, p), fi = p.indexOf(mx), conf = confOf(mx);
    var l1 = D.logos && D.logos[d.home], l2 = D.logos && D.logos[d.away];
    Promise.all([l1 ? loadImg(logoUrl(l1)) : null, l2 ? loadImg(logoUrl(l2)) : null]).then(function (ims) {
      var W = 1080, H = 1350, cv = document.createElement('canvas'), x;
      cv.width = W; cv.height = H; x = cv.getContext('2d');
      var col = { high: '#33d686', mid: '#f7b03d', low: '#5a93ff' }[conf], g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#070b18'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      var rg = x.createRadialGradient(W / 2, 330, 40, W / 2, 330, 620); rg.addColorStop(0, col + '40'); rg.addColorStop(1, 'transparent'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
      x.textAlign = 'center'; x.fillStyle = '#8b96b6'; x.font = '600 34px Poppins, system-ui, sans-serif';
      x.fillText((f ? cpName(f) : D.leagues[d.div].name) + (f ? ' · ' + dm(f.date) + (f.time ? ' · ' + f.time : '') : ''), W / 2, 96);
      [[ims[0], 270, nm(d.home)], [ims[1], 810, nm(d.away)]].forEach(function (t) {
        if (t[0]) { var r = Math.min(220 / t[0].width, 220 / t[0].height); x.drawImage(t[0], t[1] - t[0].width * r / 2, 330 - t[0].height * r / 2, t[0].width * r, t[0].height * r); }
        else { x.fillStyle = '#182042'; x.beginPath(); x.arc(t[1], 330, 100, 0, 6.2832); x.fill(); x.fillStyle = '#f1f4fc'; x.font = '700 64px Poppins, sans-serif'; x.fillText(initials(t[2]), t[1], 352); }
        x.fillStyle = '#f1f4fc'; x.font = '700 46px Poppins, system-ui, sans-serif';
        var words = t[2].split(' '), line = '', y = 520, lines = [];
        words.forEach(function (w) { if (x.measureText(line + ' ' + w).width > 440 && line) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; });
        lines.push(line); lines.slice(0, 2).forEach(function (l, i) { x.fillText(l, t[1], y + i * 56); });
      });
      x.fillStyle = col; x.font = '700 40px Poppins, sans-serif'; x.fillText('VS', W / 2, 345);
      x.fillStyle = '#8b96b6'; x.font = '600 30px Poppins, sans-serif'; x.fillText('PRONOSTIC PRINCIPAL', W / 2, 700);
      x.fillStyle = '#f1f4fc'; x.font = '700 76px Poppins, sans-serif'; x.fillText([d.home, 'Match nul', d.away][fi], W / 2, 790);
      x.fillStyle = col; x.font = '800 150px Poppins, sans-serif'; x.fillText(pct(mx), W / 2, 950);
      x.font = '600 34px Poppins, sans-serif'; x.fillText(CONF[conf], W / 2, 1010);
      var bx = 120, bw = W - 240, cw = [p[0], p[1], p[2]], cx = bx, cc = ['#33d686', '#8b96b6', '#f4665e'];
      cw.forEach(function (v, i) { x.fillStyle = cc[i]; x.fillRect(cx, 1060, bw * v - 4, 22); cx += bw * v; });
      x.fillStyle = '#f1f4fc'; x.font = '600 32px Poppins, sans-serif'; x.textAlign = 'left'; x.fillText('1 · ' + pct(p[0]), bx, 1136); x.textAlign = 'center'; x.fillText('X · ' + pct(p[1]), W / 2, 1136); x.textAlign = 'right'; x.fillText('2 · ' + pct(p[2]), W - bx, 1136);
      x.textAlign = 'center'; x.fillStyle = '#8b96b6'; x.font = '500 28px Poppins, sans-serif';
      x.fillText('Buts attendus ' + M.lh.toFixed(2) + ' – ' + M.la.toFixed(2) + (C.safe[0] ? ' · ' + C.safe[0].s + ' ' + pct(C.safe[0].p) : ''), W / 2, 1200);
      x.font = '500 24px Poppins, sans-serif'; x.fillText('Estimation statistique, pas un conseil de pari · 18+ · Joueurs Info Service 09 74 75 13 13', W / 2, 1290);
      cv.toBlob(function (b) {
        if (!b) { toast('Image impossible'); return; }
        var file = new File([b], 'pronostic.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: d.home + ' – ' + d.away }).catch(function () { /* partage annulé */ });
        else { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'pronostic.png'; document.body.appendChild(a); a.click(); a.remove(); toast('Image enregistrée'); }
      }, 'image/png');
    });
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
    [].forEach.call(app.querySelectorAll('b[data-n]'), function (el) {
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
  function h2hRow(r) {
    return '<div class="h2r"><span class="dd">' + dmNum(r[1]) + '</span><span class="tt1">' + crest(r[2]) + '<em>' + esc(nm(r[2])) + '</em></span><span class="sc">' + r[4] + ' - ' + r[5] + '</span><span class="tt2"><em>' + esc(nm(r[3])) + '</em>' + crest(r[3]) + '</span></div>';
  }
  function h2hTotals(d, hh) {
    var w = 0, n = 0, l = 0;
    hh.forEach(function (r) { var a = r[2] === d.home ? r[4] : r[5], b = r[2] === d.home ? r[5] : r[4]; if (a > b) w++; else if (a === b) n++; else l++; });
    var t = hh.length || 1;
    return '<div class="h2t"><div class="h2k">Résultats totaux <small>' + hh.length + ' match' + (hh.length > 1 ? 's' : '') + '</small></div><div class="h2b"><div><b class="w">' + w + '</b>' + crest(d.home) + '<small>' + Math.round(w / t * 100) + ' %</small></div>' +
      '<div><b class="n">' + n + '</b><span class="eqs">=</span><small>' + Math.round(n / t * 100) + ' %</small></div><div><b class="l">' + l + '</b>' + crest(d.away) + '<small>' + Math.round(l / t * 100) + ' %</small></div></div>' +
      '<div class="b3"><i class="h" style="width:' + w / t * 100 + '%"></i><i class="d" style="width:' + n / t * 100 + '%"></i><i class="a" style="width:' + l / t * 100 + '%"></i></div></div>';
  }
  function formHTML(d) {
    var hh = h2h(d.div, d.home, d.away, 5);
    return (hh.length ? h2hTotals(d, hh) : '') + formBlock(d.div, d.home) + formBlock(d.div, d.away) +
      '<div class="fm"><h4>Confrontations directes</h4>' + (hh.length ? hh.map(h2hRow).join('') : '<div class="sub">Aucune confrontation dans les données (depuis 2021/22).</div>') + '</div>';
  }
  function bilanTab(d, f) {
    var sc = fscore(f), M = Engine.families(d.div, d.home, d.away, f.ov), C = Engine.classify(M.fams);
    function pOf(m, sel) { var fam = M.fams.filter(function (x) { return x.name === m; })[0], it = fam && fam.sels.filter(function (x) { return x[0] === sel; })[0]; return it ? it[1] : null; }
    var ann = (D.res && D.res.m && D.res.m[f.id]) || null;                              // pronostics réellement annoncés avant le match
    function mk(arr) { return arr.map(function (x) { return { m: x.m, s: x.s, p: x.p, r: Bets.resolver(f.id, x.m, x.s) }; }); }
    var safe, less, extra = [];
    if (ann) {
      var all = ann.map(function (a) { return { m: a[0], s: a[1], p: pOf(a[0], a[1]), r: a[2] === 1 }; });
      safe = all.filter(function (x) { return x.p != null && x.p >= Engine.SAFE; }); less = all.filter(function (x) { return !(x.p != null && x.p >= Engine.SAFE); });
    } else { safe = mk(C.safe); less = mk(C.less); }
    M.fams.filter(function (x) { return x.extra; }).forEach(function (x) { var top = x.sels.slice().sort(function (a, b) { return b[1] - a[1]; })[0]; extra.push({ m: x.name, s: top[0], p: top[1], r: Bets.resolver(f.id, x.name, top[0]) }); });
    var every = safe.concat(less).concat(extra), ok = every.filter(function (x) { return x.r === true; }).length, tot = every.filter(function (x) { return x.r !== null; }).length, ko = tot - ok, flt = st.bf || 'all';
    var main = Bets.resolver(f.id, 'Résultat du match', favName(f)), fav = favName(f), pc = tot ? ok / tot : 0, C2 = 2 * Math.PI * 34;
    function ringBig() {
      return '<div class="bring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" class="bt0"/><circle cx="40" cy="40" r="34" class="bt1" stroke-dasharray="' + (C2 * pc).toFixed(1) + ' ' + C2.toFixed(1) + '" transform="rotate(-90 40 40)"/></svg><div><b>' + ok + '<i>/' + tot + '</i></b><small>justes</small></div></div>';
    }
    var res = sc.h > sc.a ? nm(d.home) : sc.h < sc.a ? nm(d.away) : 'Match nul', g = sc.h + sc.a;
    var facts = [['Résultat', res], ['Total de buts', g + ' but' + (g > 1 ? 's' : '')], ['Les deux équipes marquent', sc.h > 0 && sc.a > 0 ? 'Oui' : 'Non']];
    var h = '<div class="bhero"><div class="bhk"><span class="bdone">TERMINÉ</span><span>' + esc(cpName(f)) + ' · ' + dm(f.date) + '</span></div>' +
      '<div class="bhm"><div class="bhs">' + crest(d.home, true) + '<b>' + esc(nm(d.home)) + '</b></div><div class="bhc"><span class="bhn' + (sc.h > sc.a ? ' w' : '') + '">' + sc.h + '</span><span class="bhd">–</span><span class="bhn' + (sc.a > sc.h ? ' w' : '') + '">' + sc.a + '</span></div><div class="bhs">' + crest(d.away, true) + '<b>' + esc(nm(d.away)) + '</b></div></div>' +
      '<div class="bfacts">' + facts.map(function (x) { return '<span><small>' + x[0] + '</small><b>' + esc(x[1]) + '</b></span>'; }).join('') + '</div></div>';
    if (main !== null) h += '<div class="bmain ' + (main ? 'ok' : 'ko') + '"><span class="bmi">' + svg(main ? IC.check : IC.x) + '</span><div><small>Pronostic principal</small><b>' + esc(fav) + '</b></div><span class="bmv">' + (main ? 'Réussi' : 'Raté') + '</span></div>';
    if (tot) h += '<div class="bscore">' + ringBig() + '<div class="bstat"><div class="bsr ok"><span>' + svg(IC.check) + '</span><b>' + ok + '</b> pronostic' + (ok > 1 ? 's' : '') + ' juste' + (ok > 1 ? 's' : '') + '</div><div class="bsr ko"><span>' + svg(IC.x) + '</span><b>' + ko + '</b> raté' + (ko > 1 ? 's' : '') + '</div><div class="bsp">' + Math.round(pc * 100) + ' % de réussite sur ce match</div></div></div>';
    h += '<div class="seg3 bseg">' + [['all', 'Tous', tot], ['ok', '✓ Justes', ok], ['ko', '✗ Ratés', ko]].map(function (x) {
      return '<button data-bf="' + x[0] + '" class="' + (flt === x[0] ? 'on' : '') + '">' + x[1] + '<b>' + x[2] + '</b></button>'; }).join('') + '</div>';
    function group(title, cls, list) {
      var l = list.filter(function (x) { return flt === 'all' || (flt === 'ok' && x.r === true) || (flt === 'ko' && x.r === false); });
      if (!l.length) return '';
      var gok = list.filter(function (x) { return x.r === true; }).length, gt = list.filter(function (x) { return x.r !== null; }).length;
      return '<div class="sec"><span class="dot ' + cls + '"></span>' + title + ' <small>' + gok + ' / ' + gt + ' justes</small></div><div class="bl">' +
        l.map(function (x) {
          return '<div class="br ' + (x.r === null ? 'na' : x.r ? 'ok' : 'ko') + '"><span class="bi">' + (x.r === null ? '·' : svg(x.r ? IC.check : IC.x)) + '</span><div class="bt"><b>' + esc(x.m) + '</b><span class="bsel">' + esc(x.s) + '</span></div>' +
            '<div class="bp">' + (x.p == null ? '' : '<b>' + pct(x.p) + '</b><i style="width:' + Math.round(x.p * 100) + '%"></i>') + '</div></div>';
        }).join('') + '</div>';
    }
    var body = group('Pronostics sûrs', 'g', safe) + group('Moins sûrs', 'a', less) + group('Autres marchés', 'b', extra);
    return h + (body || '<div class="empty">Aucun pronostic dans cette catégorie.</div>') + '<div class="sub">✓ = sélection gagnée, ✗ = perdue. Les paris « sûrs » sont ceux annoncés à 70 % et plus avant le match.</div>';
  }
  /* prédiction en direct : buts attendus réduits au temps restant, puis combinés au score actuel (loi de Poisson) */
  var LH = {};                                              // historique des probabilités vues pendant le match : { id: [[minute, p1, pn, p2], …] }
  try { var rawLH = JSON.parse(localStorage.getItem('pf-lh') || 'null'); if (rawLH && rawLH.d === parisToday()) LH = rawLH.h || {}; } catch (e) { LH = {}; }
  function lhSave() { try { localStorage.setItem('pf-lh', JSON.stringify({ d: parisToday(), h: LH })); } catch (e) { /* ignoré */ } }
  function liveMin(clock, f) {
    var c = String(clock || ''), m;
    if (/^(HT|Half|Mi-?temps)/i.test(c)) return 45;
    m = c.match(/(\d+)\s*['’]?\s*\+\s*(\d+)/); if (m) return +m[1] + +m[2];
    m = c.match(/(\d+)/); if (m) return +m[1];
    var e = (Date.now() - kickoff(f)) / 60000; return Math.max(1, Math.min(95, e > 50 ? e - 15 : e));       // repli : estimation d'après l'heure du coup d'envoi
  }
  function playedShare(m) { m = Math.max(0, Math.min(m, 95)); return m <= 45 ? 0.45 * m / 45 : m <= 90 ? 0.45 + 0.55 * (m - 45) / 45 : 1; }       // la 2de mi-temps compte un peu plus de buts
  function poisArr(l, n) { var a = [], p = Math.exp(-l); a.push(p); for (var k = 1; k < n; k++) { p = p * l / k; a.push(p); } return a; }
  function livePred(d, f) {
    var LV = LIVE[f.id], M = Engine.families(d.div, d.home, d.away, f.ov), m = liveMin(LV.clock, f), rem = Math.max(0.01, 1 - playedShare(m)),
      lh = M.lh * rem, la = M.la * rem, N = 11, a = poisArr(lh, N), b = poisArr(la, N), hs = LV.hs, as = LV.as, r = [0, 0, 0], tot = [], i, j, T = hs + as;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) { var pr = a[i] * b[j], df = hs + i - as - j; r[df > 0 ? 0 : df === 0 ? 1 : 2] += pr; }
    var sum = r[0] + r[1] + r[2]; r = r.map(function (x) { return x / sum; });
    for (var k = T; k < T + 4; k++) {
      var line = k + 0.5, over = 0;
      for (i = 0; i < N; i++) for (j = 0; j < N; j++) if (T + i + j > line) over += a[i] * b[j];
      tot.push([line, over / sum]);
    }
    var ph = hs > 0 ? 1 : 1 - Math.exp(-lh), pa = as > 0 ? 1 : 1 - Math.exp(-la), l = lh + la, nx = 1 - Math.exp(-l);
    return { m: m, p: r, tot: tot, btts: ph * pa, next: [lh / l * nx, la / l * nx, Math.exp(-l)], pre: M.p1x2, hs: hs, as: as, clock: LV.clock };
  }
  function liveRecord(f, lp) {
    var h = LH[f.id] || (LH[f.id] = [[0].concat(lp.pre)]), last = h[h.length - 1], mm = Math.round(lp.m);
    if (last[0] !== mm) { h.push([mm, lp.p[0], lp.p[1], lp.p[2]]); lhSave(); }
    else if (last[1] !== lp.p[0]) { h[h.length - 1] = [mm, lp.p[0], lp.p[1], lp.p[2]]; lhSave(); }
    return h;
  }
  function liveChart(h) {
    var W = 340, H = 190, L = 34, R = 14, Tp = 12, B = 26, mx = Math.max(90, h[h.length - 1][0]), cols = ['var(--green)', 'var(--amber)', 'var(--blue)'];
    function X(m) { return L + (W - L - R) * m / mx; }
    function Y(p) { return Tp + (H - Tp - B) * (1 - p); }
    var g = '';
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="lg"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end" class="lt">' + Math.round(v * 100) + '</text>'; });
    for (var m = 0; m <= mx; m += 15) g += '<text x="' + X(m) + '" y="' + (H - 8) + '" text-anchor="middle" class="lt">' + m + '\'</text>';
    for (var s0 = 1; s0 <= 3; s0++) {
      var pts = h.map(function (x) { return X(x[0]).toFixed(1) + ',' + Y(x[s0]).toFixed(1); }).join(' '), e = h[h.length - 1];
      g += '<polyline points="' + pts + '" fill="none" stroke="' + cols[s0 - 1] + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + X(e[0]).toFixed(1) + '" cy="' + Y(e[s0]).toFixed(1) + '" r="4.5" fill="var(--surface)" stroke="' + cols[s0 - 1] + '" stroke-width="2.4"/>';
    }
    return '<svg class="lvch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Évolution des probabilités minute par minute">' + g + '</svg>';
  }
  function liveHTML(d, f) {
    var LV = f && LIVE[f.id];
    if (!LV || LV.st !== 'in') return '<div class="empty">Pas de match en cours : cet onglet s’active pendant le match (score et minute en direct).</div>';
    var lp = livePred(d, f), h = liveRecord(f, lp), names = [nm(d.home), 'Match nul', nm(d.away)], cols = ['g', 'a', 'b'], mi = Math.round(lp.m),
      lab = /^(HT|Half)/i.test(String(lp.clock)) ? 'Mi-temps' : mi + '\'';
    var html = '<div class="lvs"><div class="lvl">' + esc(f ? cpName(f) : '') + '</div><div class="lvr"><b>' + lp.hs + '</b><span class="lvb"><i></i>LIVE · ' + lab + '</span><b>' + lp.as + '</b></div></div>' +
      '<div class="lvcard"><div class="lvk"><span class="lvt">Prédiction en direct</span><span class="lvd"><i></i>EN DIRECT</span></div>';
    lp.p.forEach(function (v, i) {
      var dl = Math.round((v - lp.pre[i]) * 100);
      html += '<div class="lvrow ' + cols[i] + '"><div class="lvn"><span>' + esc(names[i]) + '</span><b>' + (v * 100).toFixed(1).replace('.', ',') + ' %</b></div><div class="lvbar"><i style="width:' + Math.max(1, v * 100).toFixed(1) + '%"></i></div>' +
        '<small>Avant le match : ' + pct(lp.pre[i]) + (dl ? ' · <b class="' + (dl > 0 ? 'up' : 'dn') + '">' + (dl > 0 ? '▲ +' : '▼ ') + dl + ' pts</b>' : '') + '</small></div>';
    });
    html += '</div><div class="sec"><span class="dot g"></span>Marchés en direct <small>sur le temps restant</small></div><div class="lvm">' +
      lp.tot.map(function (t) { return line('Plus de ' + String(t[0]).replace('.', ',') + ' buts (total du match)', pct(t[1])); }).join('') +
      line('Les deux équipes marquent : oui', pct(lp.btts)) +
      line('Prochain but : ' + nm(d.home), pct(lp.next[0])) + line('Prochain but : ' + nm(d.away), pct(lp.next[1])) + line('Aucun but d’ici la fin', pct(lp.next[2])) +
      line(nm(d.home) + ' ou nul', pct(lp.p[0] + lp.p[1])) + line(nm(d.away) + ' ou nul', pct(lp.p[2] + lp.p[1])) + '</div>' +
      '<div class="sec"><span class="dot a"></span>Historique des prédictions <small>' + h.length + ' point' + (h.length > 1 ? 's' : '') + '</small></div><div class="lvbox"><div class="lvlg"><span class="g">' + esc(names[0]) + '</span><span class="a">Nul</span><span class="b">' + esc(names[2]) + '</span></div>' +
      liveChart(h) + (h.length < 4 ? '<div class="sub">L’historique se construit tant que l’appli reste ouverte : un point est ajouté à chaque mise à jour (environ toutes les 90 secondes).</div>' : '') + '</div>' +
      '<div class="srcnote">Estimation simple : on réduit les buts attendus avant-match au temps qui reste (la 2de mi-temps compte un peu plus de buts), puis on tient compte du score actuel. ' +
      'Elle ignore les cartons rouges, les remplacements et l’effet « l’équipe qui perd attaque davantage ». Les cotes des bookmakers en direct réagissent plus vite que cette page : vérifie toujours la cote avant de jouer.</div>';
    return html;
  }
  /* classement de la saison en cours, recalculé d'après les résultats connus (la saison commence après la dernière coupure de plus de 45 jours) */
  var TBL_REQ = false;
  function dayN(n) { var t = String(n); return Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)) / 864e5; }
  function tableHTML(d) {
    if (!isLoaded('hist')) {
      if (!TBL_REQ) { TBL_REQ = true; loadLazy('hist', function () { if (st.detail && st.dtab === 'table') { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } }); }
      return skel(6);
    }
    var rows = D.hist.filter(function (r) { return r[0] === d.div; }).sort(function (a, b) { return a[1] - b[1]; });
    if (!rows.length) return '<div class="empty">Pas de résultats pour ce championnat.</div>';
    var i0 = 0;
    for (var i = rows.length - 1; i > 0; i--) if (dayN(rows[i][1]) - dayN(rows[i - 1][1]) > 45) { i0 = i; break; }
    var T = {};
    function team(n) { return T[n] || (T[n] = { n: n, j: 0, v: 0, d: 0, l: 0, bp: 0, bc: 0, pts: 0 }); }
    rows.slice(i0).forEach(function (r) {
      var a = team(r[2]), b = team(r[3]), x = +r[4], y = +r[5];
      if (isNaN(x) || isNaN(y)) return;
      a.j++; b.j++; a.bp += x; a.bc += y; b.bp += y; b.bc += x;
      if (x > y) { a.v++; b.l++; a.pts += 3; } else if (x < y) { b.v++; a.l++; b.pts += 3; } else { a.d++; b.d++; a.pts++; b.pts++; }
    });
    var L = Object.keys(T).map(function (k) { return T[k]; }).sort(function (a, b) { return b.pts - a.pts || (b.bp - b.bc) - (a.bp - a.bc) || b.bp - a.bp; });
    var h = '<div class="tbl"><div class="tbh"><b>' + esc(D.leagues[d.div].name) + '</b><span><i class="k1"></i>' + esc(initials(nm(d.home))) + '<i class="k2"></i>' + esc(initials(nm(d.away))) + '</span></div>' +
      '<div class="tbr th"><span>#</span><span>Équipe</span><span>J</span><span>V</span><span>N</span><span>D</span><span>DB</span><span>Pts</span></div>';
    L.forEach(function (t, k) {
      var db = t.bp - t.bc, cl = t.n === d.home ? ' me1' : t.n === d.away ? ' me2' : '';
      h += '<div class="tbr' + cl + '"><span>' + (k + 1) + '</span><span class="tn">' + crest(t.n) + '<em>' + esc(nm(t.n)) + '</em></span><span>' + t.j + '</span><span>' + t.v + '</span><span>' + t.d + '</span><span>' + t.l + '</span>' +
        '<span class="' + (db > 0 ? 'up' : db < 0 ? 'dn' : '') + '">' + (db > 0 ? '+' : '') + db + '</span><span class="pt">' + t.pts + '</span></div>';
    });
    return h + '</div><div class="sub">Classement recalculé d’après les résultats connus de la saison en cours ' + (L.length ? '(' + L[0].j + ' matchs au plus par équipe)' : '') + ' : il ne tient pas compte des points retirés, des phases finales ni des barrages.</div>';
  }
  function detailBody(d, f) {
    var hasT = !!D.leagues[d.div], hasL = !!(f && LIVE[f.id] && LIVE[f.id].st === 'in'), fsc = f && fstate(f) === 'done' ? fscore(f) : null, hasB = !!(fsc && !fsc.live && isLoaded('res') && D.res && D.res.a && D.res.a[f.id]);
    if (f && fstate(f) === 'done') ensureRes();
    var dt = (st.dtab === 'table' && !hasT) || (st.dtab === 'live' && !hasL) || (st.dtab === 'bilan' && !hasB) ? 'pred' : st.dtab;
    return '<div class="tabs"><button data-dtab="pred" class="' + (dt === 'pred' ? 'on' : '') + '">Prédictions</button>' +
      (hasB ? '<button data-dtab="bilan" class="' + (dt === 'bilan' ? 'on' : '') + '">Bilan</button>' : '') +
      (hasL ? '<button data-dtab="live" class="' + (dt === 'live' ? 'on' : '') + '"><i class="tld"></i>Live</button>' : '') +
      '<button data-dtab="form" class="' + (dt === 'form' ? 'on' : '') + '">Forme &amp; H2H</button>' +
      (hasT ? '<button data-dtab="table" class="' + (dt === 'table' ? 'on' : '') + '">Classement</button>' : '') + '</div>' +
      (dt === 'pred' ? predHTML(d, f) : dt === 'bilan' ? bilanTab(d, f) : dt === 'live' ? liveHTML(d, f) : dt === 'table' ? tableHTML(d) : formHTML(d));
  }
  function vsMid(d) {
    var f = d.fi != null ? D.fixtures[d.fi] : null, fs = f ? fstate(f) : 'soon', sc = f && fs !== 'soon' ? fscore(f) : null;
    return sc ? '<span class="vsp sc' + (sc.live ? ' lv' : '') + '">' + sc.h + ' - ' + sc.a + '</span><small class="vst">' + (sc.live ? esc(sc.clock || 'En cours') : 'Terminé') + '</small>' : '<span class="vsp">VS</span>';
  }
  function vsBlock(d) {
    var lm = lmeta(d.div);
    var l1 = D.logos && D.logos[d.home], l2 = D.logos && D.logos[d.away];
    return '<div class="vs' + (l1 || l2 ? ' wm' : '') + '" style="' + (l1 ? '--l1:url(\'' + esc(logoUrl(l1)) + '\');' : '') + (l2 ? '--l2:url(\'' + esc(logoUrl(l2)) + '\')' : '') + '"><i class="pitch" aria-hidden="true"></i><div class="side">' + crest(d.home, true) + '<b>' + esc(nm(d.home)) + '</b>' + formDots(d.home) + '</div><div class="mid">' + vsMid(d) + '</div>' +
      '<div class="side">' + crest(d.away, true) + '<b>' + esc(nm(d.away)) + '</b>' + formDots(d.away) + '</div></div>' +
      '<div class="betbar"><button class="bt-b sm pri" data-bet="' + esc(d.home + ' – ' + d.away) + '" data-bsp="' + betSport(d) + '">€ Noter un pari</button>' +
      Books.links(d.home + ' – ' + d.away) + '</div>';
  }
  function detailPage(d) {
    var f = d.fi != null ? D.fixtures[d.fi] : null, lm = lmeta(d.div);
    return '<div class="dhead"><button class="back" data-back aria-label="Retour">' + svg('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<div class="who"><span class="lgchip">' + (lgPath(d.div) ? '<img class="lci" src="' + logoUrl(lgPath(d.div)) + '" alt="" onerror="this.remove()">' : lm[2] + ' ') + esc(f ? cpName(f) : D.leagues[d.div].name) + '</span><small class="dch">' +
      (f ? '<i>📅 ' + dm(f.date) + '</i>' + (f.time ? '<i>🕒 ' + f.time + '</i>' : '') + '<i>' + countdown(f) + '</i>' : '') + '</small></div>' +
      (f ? '<button class="ibtn' + (favs[f.id] ? ' on' : '') + '" data-fav="' + f.i + '" aria-label="Favori">' + (favs[f.id] ? '★' : '☆') + '</button>' : '') +
      '<button class="ibtn" data-shareimg aria-label="Partager en image" title="Partager en image">🖼</button><button class="ibtn" data-share aria-label="Copier le pronostic">' + svg(IC.share) + '</button></div>' +
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
      if (/^En (cours|direct)/.test(t)) els[i].classList.add('live'); else if (/^Terminé/.test(t)) els[i].classList.add('done');
    }
  }
  function renderNav() {
    var items = [['today', 'Plans'], ['home', 'Découvrir'], ['fav', 'Favoris'], ['an', 'Analyser'], ['plan', 'Stratégie'], ['bets', 'Mes paris'], ['info', 'Fiabilité']];
    nav.innerHTML = '<div class="in">' + items.map(function (x) {
      var nb = x[0] === 'today' ? navCount(true) : x[0] === 'fav' ? navCount(false) : x[0] === 'ticket' ? ticket.length : 0;
      return '<button data-tab="' + x[0] + '" class="' + (!st.detail && st.tab === x[0] ? 'on' : '') + '">' + svg(IC[x[0]]) + (nb ? '<i class="nb">' + nb + '</i>' : '') + '<span>' + x[1] + '</span></button>';
    }).join('') + '<i class="ind"></i></div>';
    var inn = nav.querySelector('.in'), on = nav.querySelector('button.on'), ind = nav.querySelector('.ind');
    if (!inn || !ind) return;
    var x = on ? on.offsetLeft + on.offsetWidth * 0.3 : -999, w = on ? on.offsetWidth * 0.4 : 0;
    if (NAVPOS && on) { ind.style.setProperty('--x', NAVPOS.x + 'px'); ind.style.setProperty('--w', NAVPOS.w + 'px'); void ind.offsetWidth; }
    ind.style.setProperty('--x', x + 'px'); ind.style.setProperty('--w', w + 'px');
    if (on) NAVPOS = { x: x, w: w };
  }
  function sportHTML() {
    var sp = st.sport, S = spOf(sp), key = S ? S.cfg.key : sp;
    if (sp === 'foot') return homeHTML();
    if (!SPORTS.some(function (x) { return x[0] === sp; }) || (!S && sp !== 'tennis' && sp !== 'f1' && sp !== 'golf')) return soonHTML();
    if (!isLoaded(key)) return loadingHTML();
    if (S) { spInit(S); return spHome(S); }
    return sp === 'tennis' ? tennisHTML() : sp === 'golf' ? golfHTML() : f1HTML();
  }
  var LASTSIG = '', ANIMT = 0, NAVPOS = null;
  function render() {
    var sig = [st.tab, st.sport, st.detail ? JSON.stringify(st.detail).slice(0, 90) : '', st.dtab, st.ptab, st.day, st.status, st.group, st.filter, st.plSport].join('|');
    if (st.detail) app.innerHTML = st.detail.cmp ? cmpPage(st.detail.cmp) : st.detail.sp ? spPage(spOf(st.detail.sp), st.detail) : st.detail.tn != null ? tnPage(st.detail.tn) : st.detail.ext != null ? extPage(st.detail.ext) : detailPage(st.detail);
    else if (st.tab === 'home') app.innerHTML = sportHTML();
    else if (st.tab === 'today') app.innerHTML = todayHTML();
    else if (st.tab === 'an') app.innerHTML = anHTML();
    else if (st.tab === 'fav') app.innerHTML = favsHTML();
    else if (st.tab === 'bets') {
      app.innerHTML = Bets.html();
      if (Bets.needsRes() && !isLoaded('res')) loadLazy('res', function () { if (st.tab === 'bets' && !st.detail) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });
    }
    else if (st.tab === 'ticket') app.innerHTML = ticketHTML();
    else if (st.tab === 'plan') app.innerHTML = planTabHTML();
    else app.innerHTML = '<div id="info">' + bilanHTML() + document.getElementById('info-html').innerHTML + '</div>';
    app.classList.toggle('dens-compact', DENS === 'compact');
    if (sig !== LASTSIG) { LASTSIG = sig; app.classList.remove('anim'); void app.offsetWidth; app.classList.add('anim'); clearTimeout(ANIMT); ANIMT = setTimeout(function () { app.classList.remove('anim'); }, 1600); }
    renderNav();
    decorate();
    var fab = document.getElementById('fab');
    if (!fab) { fab = document.createElement('button'); fab.id = 'fab'; fab.setAttribute('data-ticket', ''); document.body.appendChild(fab); }
    fab.className = 'fab' + (ticket.length && st.tab !== 'ticket' ? '' : ' hide');
    fab.innerHTML = svg(IC.ticket) + '<span>Combiné · ' + ticket.length + ' · ' + pct(ticketProb()) + '</span>';
    var cb2 = document.getElementById('cmpbar');
    if (!cb2) {
      cb2 = document.createElement('div'); cb2.id = 'cmpbar'; document.body.appendChild(cb2);
      cb2.addEventListener('click', function (e) {                       // la barre est hors de #app : son propre écouteur
        var t = e.target.closest('[data-cmpgo],[data-cmpclr]');
        if (!t) return;
        if (t.hasAttribute('data-cmpclr')) { CMP = []; var yd = window.scrollY; render(); window.scrollTo(0, yd); }
        else if (CMP.length === 2) { st.scroll = window.scrollY; st.detail = { cmp: CMP.slice() }; try { history.pushState({ d: 1 }, ''); st.pushed = true; } catch (err) { st.pushed = false; } render(); window.scrollTo(0, 0); }
      });
    }
    cb2.className = CMP.length && !st.detail ? '' : 'hide';
    cb2.innerHTML = '<span>⇄ ' + CMP.length + '/2 matchs</span>' + (CMP.length === 2 ? '<button class="bt-b pri" data-cmpgo>Comparer</button>' : '<small>Choisis un 2ᵉ match avec ⇄</small>') + '<button class="bt-b" data-cmpclr aria-label="Vider">✕</button>';
    countUp();
  }
  function closeDetail() { st.ptab = 'sum'; st.detail = null; render(); window.scrollTo(0, st.scroll); }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-openext],[data-bilan],[data-spopen],[data-spday],[data-splg],[data-tnopen],[data-tnday],[data-tntour],[data-tnunk],[data-sport],[data-day],[data-filter],[data-status],[data-ptab],[data-tkm],[data-tkadd],[data-bf],[data-plsp],[data-plsort],[data-ocg],[data-jump],[data-lgc],[data-fav],[data-back],[data-dtab],[data-sort],[data-toggle-theme],[data-bk],[data-bkopen],[data-bkk],[data-share],[data-add],[data-rm],[data-clear],[data-bcomb],[data-gosport],[data-bcombo],[data-as],[data-cmp],[data-dens],[data-shareimg],[data-alsave],[data-altest],[data-aloff]');
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
      st.scroll = window.scrollY; st.detail = { div: f.div, home: f.home, away: f.away, fi: f.i }; st.ptab = 'sum'; st.dtab = LIVE[f.id] && LIVE[f.id].st === 'in' ? 'live' : fstate(f) === 'done' && fscore(f) ? 'bilan' : 'pred';
      try { history.pushState({ d: 1 }, ''); st.pushed = true; } catch (err) { st.pushed = false; }
      render(); window.scrollTo(0, 0);
    } else if (t.hasAttribute('data-back')) {
      if (st.pushed) { st.pushed = false; try { history.back(); return; } catch (err) { /* repli ci-dessous */ } }
      closeDetail();
    } else if (t.hasAttribute('data-day')) { st.day = t.getAttribute('data-day'); render(); }
    else if (t.hasAttribute('data-filter')) { st.filter = t.getAttribute('data-filter'); render(); }
    else if (t.hasAttribute('data-jump')) { var jt = document.getElementById(t.getAttribute('data-jump')); if (jt) jt.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (t.hasAttribute('data-ocg')) { var ko = t.getAttribute('data-ocg'); st.opn = st.opn || {}; var cur0 = t.getAttribute('aria-expanded') === 'true'; st.opn[ko] = !cur0; var yo2 = window.scrollY; render(); window.scrollTo(0, yo2); }
    else if (t.hasAttribute('data-plsp')) { st.plSport = t.getAttribute('data-plsp'); var yp = window.scrollY; render(); window.scrollTo(0, yp); }
    else if (t.hasAttribute('data-plsort')) { st.plSort = t.getAttribute('data-plsort'); var yq2 = window.scrollY; render(); window.scrollTo(0, yq2); }
    else if (t.hasAttribute('data-ptab')) { st.ptab = t.getAttribute('data-ptab'); var yt = window.scrollY; render(); window.scrollTo(0, yt); }
    else if (t.hasAttribute('data-bf')) { st.bf = t.getAttribute('data-bf'); var yb2 = window.scrollY; render(); window.scrollTo(0, yb2); }
    else if (t.hasAttribute('data-status')) { st.status = t.getAttribute('data-status'); var ys = window.scrollY; render(); window.scrollTo(0, ys); }
    else if (t.hasAttribute('data-lgc')) { var kc = t.getAttribute('data-lgc'); st.closed[kc] = !st.closed[kc]; var yc2 = window.scrollY; render(); window.scrollTo(0, yc2); }
    else if (t.hasAttribute('data-sort')) { st.sort = st.sort === 'time' ? 'conf' : 'time'; render(); }
    else if (t.hasAttribute('data-bk')) { Books.toggle(t.getAttribute('data-bk')); var yb = window.scrollY; render(); window.scrollTo(0, yb); }
    else if (t.hasAttribute('data-bkopen')) { st.bkopen = !st.bkopen; var yo = window.scrollY; render(); window.scrollTo(0, yo); }
    else if (t.hasAttribute('data-bkk')) { var bk = t.getAttribute('data-bkk').split('|'); Books.toggleKind(bk[0], bk.slice(1).join('|')); var yk = window.scrollY; render(); window.scrollTo(0, yk); }
    else if (t.hasAttribute('data-toggle-theme')) {
      THEME = THEME === 'dark' ? 'light' : THEME === 'light' ? 'auto' : curTheme() === 'dark' && THEME !== 'auto' ? 'light' : 'dark';
      applyTheme();
      try { localStorage.setItem('pf-theme', THEME); } catch (err) { /* ignoré */ }
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
    else if (t.hasAttribute('data-tkm')) { var ti = +t.getAttribute('data-tkm'); st.tkf = ti >= 0 ? ti : null; var yk = window.scrollY; if (ti >= 0) st.tkq = ''; render(); window.scrollTo(0, yk); }
    else if (t.hasAttribute('data-tkadd')) {
      var pr = t.getAttribute('data-tkadd').split('||'), ff = st.tkf != null ? D.fixtures[st.tkf] : null;
      if (ff) {
        var dd = { div: ff.div, home: ff.home, away: ff.away }, kk = tkKey(dd, pr[0], pr[1]), at2 = -1;
        ticket.forEach(function (x, i2) { if (x.k === kk) at2 = i2; });
        if (at2 >= 0) ticket.splice(at2, 1);
        else {
          var MM = Engine.families(dd.div, dd.home, dd.away, ff.ov), fam = MM.fams.filter(function (x) { return x.name === pr[0]; })[0], it = fam && fam.sels.filter(function (x) { return x[0] === pr[1]; })[0];
          if (it) ticket.push({ k: kk, p: it[1], mt: nm(ff.home) + ' – ' + nm(ff.away), m: pr[0], s: pr[1], r: ff.id, o: 0 });
        }
        saveTicket(); var yk2 = window.scrollY; render(); window.scrollTo(0, yk2);
      }
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
    else if (t.hasAttribute('data-dens')) { DENS = DENS === 'compact' ? 'comfort' : 'compact'; try { localStorage.setItem('pf-dens', DENS); } catch (err) { /* ignoré */ } var yq = window.scrollY; render(); window.scrollTo(0, yq); }
    else if (t.hasAttribute('data-shareimg')) { shareImage(st.detail, st.detail.fi != null ? D.fixtures[st.detail.fi] : null); }
    else if (t.hasAttribute('data-cmp')) {
      var ci = +t.getAttribute('data-cmp'), at2 = CMP.indexOf(ci);
      if (at2 >= 0) CMP.splice(at2, 1); else { if (CMP.length >= 2) CMP.shift(); CMP.push(ci); }
      var yc = window.scrollY; render(); window.scrollTo(0, yc);
    }
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
        legs: cb.legs.map(function (r) { return { id: r.bid, m: r.bm, s: r.bs }; }), nLegs: cb.legs.length, stake: +t.getAttribute('data-bstake') || 0, odds: +t.getAttribute('data-bodds') || 0 });
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
    var t = e.target;
    if (!t.hasAttribute || !t.hasAttribute('data-asodds')) return;
    var id = t.getAttribute('data-asodds'), pa = +t.getAttribute('data-pa'), stake = +t.getAttribute('data-stake');
    var o = parseFloat(String(t.value).replace(',', '.')), box = app.querySelector('[data-asv="' + id + '"]');
    if (box) box.innerHTML = asVerdict(pa, stake, o);
    var rid = id.indexOf('top|') === 0 ? id.slice(4) : id, rec = ASREC[parisToday()] && ASREC[parisToday()][rid];
    if (rec) { rec.o = o > 1 ? Math.round(o * 100) / 100 : 0; asRecSave(); }
    var btn = t.closest('.as-row, .top1, .plan') && t.closest('.as-row, .top1, .plan').querySelector('[data-bet], [data-bcombo]');
    if (btn) { if (o > 1) btn.setAttribute('data-bodds', o); else btn.removeAttribute('data-bodds'); }
  });
  app.addEventListener('change', function (e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-grp')) return;
    st.group = e.target.checked;
    try { localStorage.setItem('pf-grp', st.group ? '1' : '0'); } catch (err) { /* ignoré */ }
    var yg = window.scrollY; render(); window.scrollTo(0, yg);
  });
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'tkq') return;
    st.tkq = e.target.value; st.tkf = null;
    var box = document.getElementById('tkres');
    if (box) box.innerHTML = tkResults();
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.hasAttribute) return;
    if (t.hasAttribute('data-tkodds')) { var o = tkNum(t.value); ticket[+t.getAttribute('data-tkodds')].o = o; saveTicket(); }
    else if (t.hasAttribute('data-tktotal')) st.tkTotal = t.value;
    else if (t.hasAttribute('data-tkstake')) st.tkStake = t.value;
    else return;
    var yy = window.scrollY; render(); window.scrollTo(0, yy);
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
  setTimeout(liveTick, 2500); setInterval(liveTick, 90000);                    // scores en direct : seulement quand un match est en cours
  loadLazy('logos', function (err) { if (!err && !st.detail) { var yl = window.scrollY; render(); window.scrollTo(0, yl); } });          // logos des équipes : affichés dès qu'ils sont arrivés
  Alerts.sync(favItems(), true);                                              // programme les alertes des favoris (si le sujet ntfy est renseigné)
  if (AS.alert && Alerts.topic()) todayLoad();                                  // charge les matchs du jour pour programmer les alertes de l'assistant
  Bets.attach(app, render, function () { st.tab = 'bets'; st.detail = null; st.pushed = false; render(); window.scrollTo(0, 0); });
  window.addEventListener('popstate', function () { if (st.detail) { st.pushed = false; closeDetail(); } });

  render();
  if (Date.now() - (LEDGER.t || 0) > 3 * 3600 * 1000) setTimeout(function () { bilanRefreshAll(function () { if (st.tab === 'info' && !st.detail) render(); }); }, 4000);
  loadLazy('hist', function () { if (st.detail && st.detail.fi != null) { var y0 = window.scrollY; render(); window.scrollTo(0, y0); } });   // historique pour l'onglet « Forme », chargé en arrière-plan
})();

/* confort d'usage : retour en haut, bandeau hors ligne, puce active toujours visible */
(function () {
  var top = document.createElement('button');
  top.className = 'totop'; top.type = 'button'; top.setAttribute('aria-label', 'Retour en haut'); top.textContent = '↑';
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  var off = document.createElement('div');
  off.className = 'offbar'; off.setAttribute('role', 'status'); off.textContent = 'Hors ligne : les données affichées sont celles de la dernière visite';
  document.body.appendChild(top); document.body.appendChild(off);
  var tick = false;
  window.addEventListener('scroll', function () {
    if (tick) return; tick = true;
    requestAnimationFrame(function () { tick = false; top.classList.toggle('show', window.scrollY > 700); });
  }, { passive: true });
  function net() { off.classList.toggle('show', navigator.onLine === false); }
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  var app = document.getElementById('app'), busy = false;
  function center() {
    busy = false;
    var els = app.querySelectorAll('.chips .chip.on');
    for (var i = 0; i < els.length; i++) {
      var c = els[i].parentNode, x = els[i].offsetLeft - (c.clientWidth - els[i].offsetWidth) / 2;
      if (Math.abs(c.scrollLeft - x) > 8) c.scrollLeft = x;
    }
  }
  if (app && window.MutationObserver) new MutationObserver(function () { if (!busy) { busy = true; requestAnimationFrame(center); } }).observe(app, { childList: true, subtree: true });
})();
