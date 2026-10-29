/* Test du moteur de marchés : node tests/engine_test.js
   Vérifie sur plusieurs rapports de force que toutes les probabilités sont valides et que les marchés « complets » totalisent 100 %. */
const fs = require('fs');
const path = require('path');
const root = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'web', 'engine.js'), 'utf8').replace(/\}\)\(typeof window[^;]*;?\s*$/, '})(window);'))(root);
const Engine = root.Engine;
if (!Engine) { console.error('Engine introuvable'); process.exit(1); }

const problems = [];
const bad = (msg) => problems.push(msg);

// championnat fictif : moyenne 1,3 but par équipe, avantage du domicile, deux équipes de niveaux différents
const mk = (att, def) => [att, def];
const L = { name: 'Test', teams: ['A', 'B', 'C', 'D'], ht: 0.45, g: { mu: Math.log(1.3), ha: 0.12, t: { A: mk(0.35, -0.3), B: mk(-0.35, 0.3), C: mk(0, 0), D: mk(0.1, -0.1) } } };
Engine.setData({ leagues: { T: L } });

// marchés dont les sélections forment une partition : la somme doit faire 1
const FULL = [/^Résultat du match$/, /^Résultat à la mi-temps$/, /^Nombre exact de buts$/, /^Score exact \(toutes les cases\)$/, /^Mi-temps - Score exact$/, /^Minute du 1er but/, /^Mi-temps avec le plus de buts$/,
  /^Mi-temps avec le \+ de buts - /, /^Les 2 équipes marquent et total de buts$/, /^Mi-temps - Les 2 équipes marquent \(1re MT/, /^Première équipe à marquer - /, /^Quelle équipe va marquer/, /^Nombre de buts \(intervalle\)$/,
  /^Mi-temps - Nombre exact de buts$/, /^Marge de victoire$/];
// marchés Oui / Non : les deux sélections totalisent 1
const YESNO = /(^Les deux équipes marquent$|^Les 2 équipes marquent ou|^Chaque équipe marque|dans chaque mi-temps$|garde sa cage inviolée)/;

[['A', 'B'], ['B', 'A'], ['C', 'D'], ['A', 'A'.replace('A', 'C')]].forEach(([h, a]) => {
  const M = Engine.families('T', h, a);
  M.fams.forEach((f) => {
    f.sels.forEach((s) => { if (!(typeof s[1] === 'number' && s[1] >= -1e-9 && s[1] <= 1 + 1e-9)) bad(`${h}-${a} ${f.name} / ${s[0]} : probabilité ${s[1]}`); });
    const sum = f.sels.reduce((x, s) => x + s[1], 0);
    if (FULL.some((r) => r.test(f.name)) && Math.abs(sum - 1) > 0.02) bad(`${h}-${a} ${f.name} : somme ${sum.toFixed(3)} au lieu de 1`);
    if (YESNO.test(f.name) && f.sels.length === 2 && Math.abs(sum - 1) > 1e-6) bad(`${h}-${a} ${f.name} : Oui + Non = ${sum.toFixed(3)}`);
  });
  const p = M.p1x2.reduce((x, y) => x + y, 0);
  if (Math.abs(p - 1) > 0.02) bad(`${h}-${a} résultat 1N2 : somme ${p.toFixed(3)}`);
  if (M.fams.length < 80) bad(`${h}-${a} : seulement ${M.fams.length} marchés (attendu 80 ou plus)`);
});

// cohérences : un favori net doit avoir plus de chances de gagner, plus de buts attendus => plus de « plus de 2,5 »
const get = (M, name) => M.fams.filter((f) => f.name === name)[0];
const m1 = Engine.families('T', 'A', 'B'), m2 = Engine.families('T', 'B', 'A');
if (!(get(m1, 'Résultat du match').sels[0][1] > get(m2, 'Résultat du match').sels[0][1])) bad('le favori à domicile devrait être plus probable que le même favori à l’extérieur');

if (problems.length) { console.error(problems.slice(0, 40).join('\n')); console.error(`${problems.length} problème(s)`); process.exit(1); }
console.log('moteur : tout est cohérent (' + m1.fams.length + ' marchés testés sur 4 matchs)');
