/* Guide détaillé - mainpage.pl */
(function(){
  'use strict';
  if (window.__kohaGuideHomeLoadedV6) return;
  window.__kohaGuideHomeLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;
  const k = window.KOHA_GUIDES, s = k.stepAny;

  function modulesHtml(){
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;font-size:11px">
      <div><strong>🔄 Circulation</strong><br>Prêts, retours, renouvellements, réservations, transferts.</div>
      <div><strong>👤 Adhérents</strong><br>Inscription, droits, coordonnées, historique et compte.</div>
      <div><strong>🔎 Catalogue</strong><br>Recherche, notices, exemplaires, disponibilité.</div>
      <div><strong>✍️ Catalogage</strong><br>Création et modification des notices et exemplaires.</div>
      <div><strong>🧩 Autorités</strong><br>Formes contrôlées, variantes et liens avec les notices.</div>
      <div><strong>🛒 Acquisitions</strong><br>Suggestions, fournisseurs, commandes, réception, factures.</div>
      <div><strong>📰 Périodiques</strong><br>Abonnements, bulletinage, numérotation, réclamations.</div>
      <div><strong>📊 Rapports</strong><br>Exploitation et contrôle des données.</div>
      <div><strong>🧰 Outils</strong><br>Imports, inventaire, lots, journaux, traitements transversaux.</div>
      <div><strong>⚙️ Administration</strong><br>Paramètres structurants du SIGB.</div>
    </div>`;
  }

  k.register(function(ctx){
    if (!(ctx.path === '/' || ctx.path === '' || /\/mainpage\.pl$/.test(ctx.path))) return [];
    return k.compactSteps([
      s(['#logo'], 'Accueil Koha', 'Le logo ramène à l’accueil depuis presque tout le back-office. C’est votre point de retour quand vous avez navigué profondément dans un module.', 'bottom'),
      s(['#toplevelmenu', 'main'], 'Les grands modules de Koha', `Koha est un SIGB : plusieurs modules partagent les mêmes données et se répondent. Aucun module n’est complètement isolé.${modulesHtml()}`, 'bottom', 'Pour bien utiliser Koha, pensez toujours au niveau de donnée manipulé : notice bibliographique, exemplaire, autorité, adhérent ou transaction.'),
      s(['a[href*="/circ/"]', '#toplevelmenu'], 'Circulation', 'Module du quotidien : prêts, retours, renouvellements, réservations, transferts et situations liées à la disponibilité réelle des exemplaires.', 'bottom'),
      s(['a[href*="/members/"]', '#toplevelmenu'], 'Adhérents', 'Gère les personnes et collectivités utilisatrices : identité, catégorie, bibliothèque d’inscription, droits, coordonnées, historique et compte.', 'bottom'),
      s(['#catalog-search-link', 'a[href*="/catalogue/"]'], 'Catalogue / recherche', 'Permet de retrouver les notices et exemplaires. C’est le meilleur point de départ pour comprendre la différence entre description bibliographique et copie physique.', 'bottom'),
      s(['a[href*="/cataloguing/"]', '.biglinks-list'], 'Catalogage', 'Permet de créer ou modifier les notices bibliographiques et les exemplaires. Les actions sont structurantes : une modification de notice peut toucher toutes les copies rattachées.', 'bottom'),
      s(['a[href*="/authorities/"]', '.biglinks-list'], 'Autorités', 'Contrôle les formes utilisées pour auteurs, collectivités, sujets ou autres accès selon la configuration. Le but est d’éviter la dispersion des variantes et les doublons.', 'bottom'),
      s(['a[href*="/acqui/"]', '.biglinks-list'], 'Acquisitions', 'Suit le parcours économique et documentaire : suggestion éventuelle, commande, fournisseur, réception et facture.', 'bottom'),
      s(['a[href*="/serials/"]', '.biglinks-list'], 'Périodiques', 'Gère les abonnements et la réception régulière des fascicules : périodicité, numérotation, bulletinage et réclamations.', 'bottom'),
      s(['a[href*="/reports/"]', '.biglinks-list'], 'Rapports', 'Permet d’interroger les données pour produire listes, indicateurs, contrôles de qualité et statistiques. Un rapport n’a de sens que si l’on comprend la table et le niveau de donnée interrogés.', 'bottom'),
      s(['a[href*="/tools/"]', '.biglinks-list'], 'Outils', 'Regroupe des fonctions transversales : imports, traitements par lots, inventaire, journaux et opérations de maintenance documentaire.', 'bottom'),
      s(['a[href*="/admin/"]', '.biglinks-list'], 'Administration', 'Paramètres structurants : bibliothèques, catégories, types de document, valeurs autorisées, règles de circulation, préférences système et structures MARC.', 'bottom', null, 'Les modifications d’administration peuvent affecter tout le réseau. Elles doivent être documentées et testées.'),
      s(['#catalog-search-dropdown'], 'Recherche d’exemplaires', 'Utilisez-la quand le besoin porte d’abord sur une donnée locale : code-barres, cote, site, localisation, statut ou autre champ d’exemplaire.', 'bottom'),
      s(['#header_search'], 'Barre de recherche rapide', 'Elle permet de passer rapidement de l’accueil à une opération courante sans ouvrir d’abord le module complet.', 'bottom'),
      s(['#circ_search-tab'], 'Prêter', 'Saisissez ou scannez une carte adhérent pour ouvrir directement son écran de circulation.', 'bottom'),
      s(['#checkin_search-tab'], 'Rendre', 'Le retour fonctionne au niveau exemplaire : le code-barres identifie la copie précise qui revient.', 'bottom'),
      s(['#patron_search-tab'], 'Chercher un adhérent', 'Recherche un usager par nom, numéro de carte ou autres critères disponibles.', 'bottom'),
      s(['#catalog_search-tab'], 'Chercher dans le catalogue', 'Point d’entrée rapide pour une notice ou un exemplaire. Pour apprendre la méthode de recherche, lancez ensuite le guide sur la page de résultats.', 'bottom'),
      s(['#area-news'], 'Annonces', 'Zone d’information interne : procédures, actualités réseau et consignes opérationnelles.', 'left'),
      s(['#area-pending', '#suggestions_pending'], 'Travail en attente', 'Les compteurs signalent les tâches qui nécessitent une intervention : suggestions, réservations ou autres opérations selon votre configuration.', 'left'),
      s(['#IntranetmainUserblock'], 'Outils locaux du réseau', 'Ce bloc contient les outils propres à votre réseau, ajoutés autour de Koha standard.', 'top'),
      s(['#tutoriel'], 'Aide & formation', 'Une seule entrée regroupe désormais trois usages : lancer le guide de la page active, ouvrir le parcours complet de formation et activer le mode accompagnement avec ses aides contextuelles.', 'top')
    ]);
  });
})();
