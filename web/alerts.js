/* Alertes sur mes favoris : le navigateur programme lui-même, chez ntfy.sh, une notification 45 minutes avant chaque match mis en favori (★).
   Le nom du sujet ntfy (le « mot de passe » de tes notifications) est saisi une fois et reste dans cet appareil : il n'est jamais publié sur le site. */
var Alerts = (function () {
  var TK = 'pf-ntfy', SK = 'pf-ntfy-sched', LEAD = 45 * 60 * 1000, MAXD = 3 * 864e5 - 3600e3, busy = false, note = '';

  function topic() { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } }
  function setTopic(t) { try { if (t) localStorage.setItem(TK, t); else localStorage.removeItem(TK); } catch (e) { /* ignoré */ } }
  function sched() { try { return JSON.parse(localStorage.getItem(SK) || '{}') || {}; } catch (e) { return {}; } }
  function saveSched(s) { try { localStorage.setItem(SK, JSON.stringify(s)); } catch (e) { /* ignoré */ } }

  function post(obj) {
    return fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify(obj) }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function cancel(id) {
    var t = topic();
    return t && id ? fetch('https://ntfy.sh/' + encodeURIComponent(t) + '/' + encodeURIComponent(id), { method: 'DELETE' }).catch(function () { /* déjà parti ou introuvable */ }) : Promise.resolve();
  }

  /* items : [{ id, ko (ms), title, msg }] = favoris actuels. Programme les nouveaux, annule ceux qui ne sont plus favoris ou dont l'heure a changé. */
  function sync(items) {
    var t = topic();
    if (!t || busy) return Promise.resolve();
    busy = true;
    var s = sched(), now = Date.now(), want = {}, jobs = [], url = location.origin + location.pathname;
    items.forEach(function (it) { want[it.id] = it; });
    Object.keys(s).forEach(function (id) {
      var it = want[id];
      if (!it || Math.abs(s[id].ts - (it.ko - LEAD)) > 5 * 60 * 1000) { jobs.push(cancel(s[id].mid)); delete s[id]; }
    });
    items.forEach(function (it) {
      var fire = it.ko - LEAD;
      if (s[it.id] || fire < now + 90 * 1000 || fire - now > MAXD) return;        // déjà programmé, trop tard, ou à plus de 3 jours (ntfy refuse) : on reverra à la prochaine ouverture
      jobs.push(post({ topic: t, title: it.title, message: it.msg, delay: String(Math.floor(fire / 1000)), tags: ['soccer', 'star'], priority: 4, click: url })
        .then(function (r) { s[it.id] = { mid: r.id, ts: fire }; }).catch(function () { note = 'Programmation impossible pour le moment (réseau ?).'; }));
    });
    return Promise.all(jobs).then(function () { saveSched(s); busy = false; }, function () { busy = false; });
  }

  function test() {
    var t = topic();
    if (!t) return Promise.reject(new Error('sujet manquant'));
    return post({ topic: t, title: 'Test des alertes', message: 'Si tu lis ceci, les alertes sur tes favoris fonctionneront.', tags: ['white_check_mark'] });
  }

  function status() {
    var n = Object.keys(sched()).length;
    return topic() ? (n ? n + ' alerte' + (n > 1 ? 's' : '') + ' programmée' + (n > 1 ? 's' : '') + ' (45 min avant le match).' : 'Aucune alerte programmée pour l’instant.') + (note ? ' ' + note : '') : '';
  }
  function clear() { var s = sched(); Object.keys(s).forEach(function (id) { cancel(s[id].mid); }); saveSched({}); setTopic(''); }

  return { topic: topic, setTopic: setTopic, sync: sync, test: test, status: status, clear: clear };
})();
