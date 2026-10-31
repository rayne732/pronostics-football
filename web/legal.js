/* Pages légales : mentions légales, conditions générales (utilisation et vente), confidentialité, jeu responsable.
   Tout ce qui est propre à ton activité est dans CFG ci-dessous : remplis-le AVANT d'ouvrir les paiements. Les textes sont des modèles à faire relire par un professionnel. */
var Legal = (function () {
  'use strict';
  var CFG = {
    editeur: '[À COMPLÉTER : nom et prénom]',
    statut: 'Entrepreneur individuel (micro-entreprise)',
    siret: '[À COMPLÉTER : numéro SIRET]',
    adresse: '[À COMPLÉTER : adresse postale]',
    contact: '[À COMPLÉTER : adresse e-mail de contact]',
    tva: 'TVA non applicable, article 293 B du CGI',                     // à adapter si tu es assujetti à la TVA
    mediateur: '[À COMPLÉTER : nom, site et adresse du médiateur de la consommation]',
    site: 'Pronostics',
    maj: '31/10/2026'
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mark(v) { return /À COMPLÉTER/.test(v) ? '<span class="lgtodo">' + esc(v) + '</span>' : esc(v); }
  function ul(a) { return '<ul>' + a.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function sec(t, body) { return '<h3>' + esc(t) + '</h3>' + body; }

  var PAGES = {
    mentions: ['Mentions légales', function () {
      return sec('Éditeur du site', '<p>' + mark(CFG.editeur) + ', ' + esc(CFG.statut) + '.<br>SIRET : ' + mark(CFG.siret) + '<br>Adresse : ' + mark(CFG.adresse) + '<br>Contact : ' + mark(CFG.contact) + '<br>Directeur de la publication : ' + mark(CFG.editeur) + '<br>' + esc(CFG.tva) + '.</p>') +
        sec('Hébergement et prestataires', ul([
          'Site hébergé par <b>GitHub, Inc.</b> (GitHub Pages), 88 Colin P. Kelly Jr Street, San Francisco, CA 94107, États-Unis.',
          'Comptes et données synchronisées : <b>Supabase</b> (base de données hébergée dans l’Union européenne).',
          'Paiements : <b>Stripe Payments Europe, Ltd.</b>, Dublin, Irlande. Nous ne voyons ni ne conservons jamais ton numéro de carte.'])) +
        sec('Nature du service', '<p>' + esc(CFG.site) + ' publie des <b>estimations statistiques</b> sur des événements sportifs. Ce n’est ni un opérateur de jeux d’argent, ni un site de paris, ni un conseil financier. Aucun pari n’est pris ici.</p>') +
        sec('Propriété intellectuelle', '<p>Les noms, logos et écussons des équipes, ligues et compétitions appartiennent à leurs propriétaires et ne sont utilisés que pour identifier les rencontres. Les résultats et les calendriers proviennent de sources publiques tierces ; leur exactitude n’est pas garantie.</p>') +
        sec('Médiation', '<p>En cas de litige de consommation non résolu avec nous, tu peux saisir gratuitement le médiateur : ' + mark(CFG.mediateur) + '. Plateforme européenne de règlement en ligne des litiges : ec.europa.eu/consumers/odr.</p>');
    }],
    cgu: ['Conditions générales (utilisation et vente)', function () {
      return '<p class="lgmeta">Dernière mise à jour : ' + esc(CFG.maj) + '</p>' +
        sec('1. Objet', '<p>Les présentes conditions encadrent l’utilisation de ' + esc(CFG.site) + ' (le « Service ») et la vente des abonnements Premium et Suprême. Les utiliser, créer un compte ou s’abonner vaut acceptation.</p>') +
        sec('2. Le Service, en clair', '<p>Le Service fournit des <b>estimations probabilistes</b> calculées par un modèle statistique. Elles peuvent être fausses. <b>Aucun gain n’est garanti</b> et nos propres tests montrent que le modèle ne bat pas durablement les marges des bookmakers. Le Service ne prend aucun pari et ne remplace pas ton jugement.</p>') +
        sec('3. Compte et âge', '<p>Le Service est réservé aux <b>personnes majeures (18 ans et plus)</b>. Tu fournis une adresse e-mail valide et tu protèges ton accès. Un compte est personnel. Tu peux supprimer ton compte à tout moment depuis « Mon compte » ; tes données sont alors effacées.</p>') +
        sec('4. Offres', ul([
          '<b>Gratuit</b> : liste des matchs et des probabilités, 1 fiche match détaillée par jour, 1 clé combo par jour, partage limité à 3 pronostics par jour.',
          '<b>Premium</b> : fiches détaillées de tous les matchs, partage illimité, plans de mise et alertes, 1 clé combo par jour.',
          '<b>Suprême</b> : tout Premium, plus des clés combo illimitées.',
          'Le contenu des offres peut évoluer ; une baisse importante du contenu d’une offre payante ouvre droit à résiliation et remboursement du temps restant.'])) +
        sec('5. Prix, essai et paiement', '<p>Les prix sont affichés en euros TTC sur la page Offres. ' + esc(CFG.tva) + '. Le paiement est réalisé par carte via Stripe. Un <b>essai gratuit de 3 jours</b> est proposé à la première souscription : sans résiliation avant la fin de l’essai, l’abonnement est facturé puis <b>renouvelé automatiquement</b> à chaque période (semaine, mois ou année) au même prix.</p>') +
        sec('6. Résiliation et remboursement', '<p>Tu résilies à tout moment, en quelques clics, depuis « Mon compte » (portail client). La résiliation prend effet à la fin de la période déjà payée, sans nouveau prélèvement. <b>Remboursement intégral sur simple demande pendant 14 jours</b> après un paiement, à l’adresse de contact. Toute hausse de prix ne s’applique qu’au renouvellement suivant, avec un préavis d’au moins 30 jours par e-mail.</p>') +
        sec('7. Clés combo et parrainage', '<p>Les clés sont des jetons <b>sans valeur monétaire</b> : elles ne s’échangent pas, ne se vendent pas et ne sont pas remboursables en argent. Une clé est rendue si le combo échoue. Le parrainage donne 3 clés au parrain et 1 clé au filleul à la création d’un compte avec le lien ; il est limité à 10 amis par personne. Les comptes créés pour obtenir des clés sans usage réel peuvent être supprimés.</p>') +
        sec('8. Responsabilité', '<p>Le Service est fourni « en l’état », sans garantie de disponibilité continue ni d’exactitude des données. Nous ne sommes pas responsables des décisions de pari prises à partir du Service ni des pertes qui en résultent, dans la limite permise par la loi. Rien dans ces conditions ne limite les droits que la loi reconnaît aux consommateurs.</p>') +
        sec('9. Données personnelles', '<p>Voir la page « Confidentialité ».</p>') +
        sec('10. Droit applicable', '<p>Droit français. Pour toute réclamation, écris-nous d’abord (' + mark(CFG.contact) + ') ; à défaut d’accord, le médiateur indiqué dans les mentions légales peut être saisi, puis les tribunaux compétents.</p>') +
        sec('11. Modifications', '<p>Nous pouvons modifier ces conditions ; les changements importants sont annoncés dans l’application ou par e-mail et ne s’appliquent aux abonnements en cours qu’au renouvellement suivant.</p>');
    }],
    privacy: ['Confidentialité (RGPD)', function () {
      return '<p class="lgmeta">Dernière mise à jour : ' + esc(CFG.maj) + '</p>' +
        sec('Responsable du traitement', '<p>' + mark(CFG.editeur) + ' (' + mark(CFG.contact) + ').</p>') +
        sec('Ce que nous collectons', ul([
          '<b>Compte</b> : adresse e-mail, mot de passe (stocké sous forme chiffrée par Supabase), niveau d’accès, date de création.',
          '<b>Données que tu crées</b> : paris notés, plan de mise, pronostics partagés et abonnements dans la communauté, favoris, clés bonus de parrainage. Elles sont aussi gardées dans ton navigateur.',
          '<b>Paiement</b> : l’identifiant client et l’état de ton abonnement. Les données de carte sont traitées uniquement par Stripe.',
          '<b>Techniques</b> : ton adresse IP est vue par les services appelés depuis ton navigateur (hébergeur du site, ESPN pour les scores, FlagCDN pour les drapeaux, Supabase si tu es connecté).'])) +
        sec('Pourquoi', '<p>Fournir le Service et ton compte (exécution du contrat), traiter les paiements et prévenir la fraude (obligation légale et intérêt légitime), t’envoyer les e-mails de connexion et, si tu les actives, des alertes de matchs (consentement).</p>') +
        sec('Ce que nous ne faisons pas', '<p>Pas de publicité ciblée, pas de revente de données, pas de traceur publicitaire ni de mesure d’audience. Le stockage local de ton navigateur ne sert qu’au fonctionnement (réglages, favoris, session).</p>') +
        sec('Durée de conservation', '<p>Tant que ton compte existe, puis suppression à ta demande (bouton « Supprimer mon compte »). Les factures sont conservées le temps exigé par la loi comptable.</p>') +
        sec('Tes droits', '<p>Accès, rectification, effacement, portabilité (copie de tes paris), limitation et opposition : écris à ' + mark(CFG.contact) + '. Tu peux aussi saisir la CNIL (cnil.fr).</p>') +
        sec('Destinataires et transferts', '<p>Supabase (hébergement des données dans l’UE), Stripe (paiement), GitHub (hébergement du site). Certains prestataires peuvent traiter des données hors UE avec les garanties prévues par le RGPD.</p>');
    }],
    jeu: ['Jeu responsable', function () {
      return '<div class="lgwarn">Les paris sportifs sont <b>interdits aux mineurs</b> et comportent des risques : endettement, isolement, dépendance. Jouer comporte des risques : pour être aidé, appelez le <b>09 74 75 13 13</b> (appel non surtaxé).</div>' +
        sec('Ce que ce site est, et n’est pas', '<p>' + esc(CFG.site) + ' calcule des probabilités. Il ne prend pas de paris, n’est pas un opérateur agréé et ne t’encourage pas à parier. <b>Aucun pari n’est sûr.</b> Les bookmakers prélèvent une marge d’environ 5 à 7 % sur chaque pari : à long terme, la plupart des joueurs perdent.</p>') +
        sec('Quelques règles simples', ul([
          'Ne mise que l’argent que tu peux perdre sans conséquence sur ton quotidien.',
          'Fixe-toi un budget (mois et jour) à l’avance, et arrête-toi quand il est atteint. L’application t’aide avec le budget de « Mes paris » et le plan de mise.',
          'Ne cherche jamais à te « refaire » après une perte.',
          'Ne parie pas sous l’émotion, la fatigue ou l’alcool.',
          'Fais des pauses. Si tu t’inquiètes de ta pratique ou de celle d’un proche, parles-en.'])) +
        sec('Où trouver de l’aide', ul([
          '<b>Joueurs Info Service</b> : 09 74 75 13 13 (7 j/7, appel non surtaxé), joueurs-info-service.fr',
          '<b>Interdiction volontaire de jeux</b> auprès de l’ANJ (Autorité nationale des jeux) : anj.fr'])) ;
    }]
  };
  function page(kind) {
    var p = PAGES[kind] || PAGES.cgu;
    return '<div class="lgp"><h2>' + esc(p[0]) + '</h2>' + p[1]() + '<p class="lgfoot">Ces textes sont un modèle fourni de bonne foi. Ils ne remplacent pas l’avis d’un professionnel du droit.</p></div>';
  }
  function titles() { return Object.keys(PAGES).map(function (k) { return [k, PAGES[k][0]]; }); }
  function todo() { return Object.keys(CFG).filter(function (k) { return /À COMPLÉTER/.test(CFG[k]); }); }
  return { page: page, titles: titles, todo: todo, CFG: CFG };
})();
