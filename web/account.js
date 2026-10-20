/* Compte et synchronisation : connexion par code reçu par email (Supabase Auth), puis sauvegarde de l'état de l'utilisateur (paris, plan) dans sa ligne pf_state.
   Aucune bibliothèque : on parle directement à l'API REST de Supabase. La clé « publishable » est publique par conception : seules les règles de sécurité de la base (RLS) comptent. */
var Account = (function () {
  'use strict';
  var API = 'https://wmwmuvkxdsvnrtcjqkyf.supabase.co', KEY = 'sb_publishable_1TGUOQGJrpdx3V3N19w0vQ_aO9ajrXO', LS = 'pf-auth';
  var S = null, role = null, last = 0, busy = false, msg = '';
  try { S = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { S = null; }
  function persist() { try { if (S) localStorage.setItem(LS, JSON.stringify(S)); else localStorage.removeItem(LS); } catch (e) { /* ignoré */ } }
  function jwtSub(t) { try { var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).sub; } catch (e) { return null; } }
  function call(path, opt, token) {
    opt = opt || {};
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    if (opt.prefer) h.Prefer = opt.prefer;
    return fetch(API + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) {
      return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; } return { ok: r.ok, status: r.status, body: j }; });
    });
  }
  function setSession(j, email) {
    S = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: email || (j.user && j.user.email) || (S && S.email) || '', uid: (j.user && j.user.id) || jwtSub(j.access_token) };
    persist();
  }
  function token() {                                               // jeton valable : renouvelé automatiquement quand il est sur le point d'expirer
    if (!S) return Promise.resolve(null);
    if (S.exp - 60000 > Date.now()) return Promise.resolve(S.access);
    return call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: S.refresh } }).then(function (r) {
      if (r.ok && r.body && r.body.access_token) { setSession(r.body, S.email); return S.access; }
      if (r.status === 400 || r.status === 401) { S = null; persist(); role = null; }          // session révoquée : il faudra se reconnecter
      return null;
    }).catch(function () { return null; });
  }
  function requestCode(email) {
    return call('/auth/v1/otp', { method: 'POST', body: { email: email, create_user: true } }).then(function (r) {
      if (r.ok) return null;
      if (r.status === 429) return 'Trop de demandes : patiente une minute avant de réessayer.';
      return 'L’envoi du code a échoué. Vérifie l’adresse email et réessaie.';
    }).catch(function () { return 'Pas de connexion : réessaie plus tard.'; });
  }
  function verify(email, code) {
    return call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: email, token: String(code).replace(/\s/g, '') } }).then(function (r) {
      if (r.ok && r.body && r.body.access_token) { setSession(r.body, email); return null; }
      if (r.status === 429) return 'Trop d’essais : patiente une minute.';
      return 'Ce code ne fonctionne pas : il est peut-être erroné ou expiré.';
    }).catch(function () { return 'Pas de connexion : réessaie plus tard.'; });
  }
  function signOut() {
    var t = S && S.access;
    S = null; role = null; persist();
    if (t) call('/auth/v1/logout', { method: 'POST' }, t).catch(function () { /* ignoré */ });
  }
  function loadRole() {
    return token().then(function (t) {
      if (!t) return null;
      return call('/rest/v1/pf_profiles?select=role', {}, t).then(function (r) { role = r.ok && r.body && r.body[0] ? r.body[0].role : 'free'; return role; });
    }).catch(function () { return role; });
  }
  function signUp(email, pass) {
    return call('/auth/v1/signup', { method: 'POST', body: { email: email, password: pass } }).then(function (r) {
      if (r.ok && r.body && r.body.access_token) { setSession(r.body, email); return { ok: true }; }
      if (r.ok) return { ok: false, info: 'Compte créé : confirme ton adresse avec l’email reçu, puis connecte-toi.' };
      var m = r.body && (r.body.msg || r.body.error_description || r.body.message) || '';
      if (r.status === 429) return { ok: false, info: 'Trop de demandes : patiente un peu.' };
      if (/already|registered/i.test(m)) return { ok: false, info: 'Cette adresse a déjà un compte : connecte-toi.' };
      if (/password/i.test(m)) return { ok: false, info: 'Mot de passe trop faible (8 caractères minimum).' };
      return { ok: false, info: 'Création impossible pour l’instant.' };
    }).catch(function () { return { ok: false, info: 'Pas de connexion : réessaie plus tard.' }; });
  }
  function signIn(email, pass) {
    return call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: pass } }).then(function (r) {
      if (r.ok && r.body && r.body.access_token) { setSession(r.body, email); return null; }
      if (r.status === 429) return 'Trop d’essais : patiente une minute.';
      if (r.body && /confirm/i.test(r.body.msg || r.body.error_description || '')) return 'Adresse non confirmée : clique sur le lien reçu par email.';
      return 'Email ou mot de passe incorrect.';
    }).catch(function () { return 'Pas de connexion : réessaie plus tard.'; });
  }
  function recover(email) {
    return call('/auth/v1/recover', { method: 'POST', body: { email: email } }).then(function (r) { return r.ok ? null : (r.status === 429 ? 'Trop de demandes : patiente une minute.' : 'Envoi impossible pour l’instant.'); }).catch(function () { return 'Pas de connexion : réessaie plus tard.'; });
  }
  function changePassword(pass) {
    return token().then(function (t) { return t ? call('/auth/v1/user', { method: 'PUT', body: { password: pass } }, t) : { ok: false }; }).then(function (r) { return r.ok ? null : 'Mot de passe refusé (8 caractères minimum).'; }).catch(function () { return 'Pas de connexion.'; });
  }
  function profile() {
    return token().then(function (t) { return t ? call('/rest/v1/pf_profiles?select=role,created_at', {}, t) : null; }).then(function (r) {
      if (r && r.ok && r.body && r.body[0]) { role = r.body[0].role; return r.body[0]; }
      if (r && r.ok) { role = 'free'; return { role: 'free' }; }
      return null;
    }).catch(function () { return null; });
  }
  function rpc(name, args) {
    return token().then(function (t) { if (!t) throw new Error('auth'); return call('/rest/v1/rpc/' + name, { method: 'POST', body: args || {} }, t); }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.body; });
  }
  function wipeState() {
    return token().then(function (t) { return t ? call('/rest/v1/pf_state?user_id=eq.' + S.uid, { method: 'DELETE' }, t) : null; });
  }
  function pull() {                                                // -> { data, updated } ou null (aucune sauvegarde) ; lève une erreur si le réseau échoue
    return token().then(function (t) {
      if (!t) throw new Error('auth');
      return call('/rest/v1/pf_state?select=data,updated_at', {}, t);
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.body && r.body[0] ? { data: r.body[0].data, updated: r.body[0].updated_at } : null;
    });
  }
  function push(data) {
    return token().then(function (t) {
      if (!t) throw new Error('auth');
      return call('/rest/v1/pf_state?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: S.uid, data: data, updated_at: new Date().toISOString() } }, t);
    }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return true; });
  }
  return {
    on: function () { return !!S; }, email: function () { return S ? S.email : ''; }, role: function () { return role; }, loadRole: loadRole, profile: profile,
    signUp: signUp, signIn: signIn, recover: recover, changePassword: changePassword, rpc: rpc, wipeState: wipeState,
    requestCode: requestCode, verify: verify, signOut: signOut, pull: pull, push: push,
    state: function () { return { last: last, busy: busy, msg: msg }; }, set: function (o) { if ('last' in o) last = o.last; if ('busy' in o) busy = o.busy; if ('msg' in o) msg = o.msg; }
  };
})();
if (typeof module !== 'undefined') module.exports = Account;
