/* Guide détaillé - reports/guided_reports.pl */
(function(){
  'use strict';
  if (window.__kohaGuideReportsLoadedV6) return;
  window.__kohaGuideReportsLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;
  const k = window.KOHA_GUIDES, s = k.stepAny;

  k.register(function(ctx){
    if (!/\/reports\/guided_reports\.pl$/.test(ctx.path)) return [];
    const hasResults = !!k.firstVisible(['.pages + table', '.report_results', '#report_results', 'main table.dataTable']);
    const steps = [
      s(['main h1', 'h1'], 'Rapports SQL Koha', 'Les rapports permettent d’interroger les données du SIGB sans modifier la base. La qualité du résultat dépend entièrement du SQL et des paramètres saisis.', 'bottom'),
      s(['#toolbar', '.btn-toolbar'], 'Actions du rapport', 'Selon l’état de la page, vous pouvez créer, modifier, exécuter, dupliquer ou gérer les rapports enregistrés.', 'bottom'),
      s(['textarea[name="sql"]', '#sql'], 'Requête SQL', 'Le SQL définit les données interrogées. Sur une installation hébergée, privilégiez des requêtes ciblées, filtrées et raisonnables pour éviter les lectures inutilement lourdes.', 'bottom', 'Pour un rapport de production, documentez les paramètres et le périmètre directement dans le nom ou les notes du rapport.'),
      s(['textarea[name="sql_params"]'], 'Paramètres', 'Les paramètres permettent de fournir des listes ou valeurs au rapport sans modifier son SQL. Votre compteur de lignes est utile pour vérifier rapidement le volume transmis.', 'bottom'),
      s(['input[name="name"]', '#reportname'], 'Nom du rapport', 'Utilisez un nom métier explicite : objet, périmètre et éventuellement site ou période. Un bon intitulé évite la multiplication de rapports quasi identiques.', 'right')
    ];

    if (hasResults) steps.push(
      s(['.pages + table', '.report_results', '#report_results', 'main table.dataTable'], 'Résultats', 'Chaque ligne correspond au résultat de la requête. Avant d’exploiter un chiffre, contrôlez le périmètre temporel, les exclusions et la granularité : notice, exemplaire, prêt, adhérent, etc.', 'top'),
      s(['#grt-btn-toggle'], 'Outils de lecture', 'Affiche ou masque les outils complémentaires ajoutés à vos rapports : filtres, recherche et gestion des colonnes.', 'bottom'),
      s(['#grt-columns-toggle'], 'Colonnes', 'Masquez temporairement les colonnes secondaires afin de concentrer la lecture ou préparer une copie/export plus lisible.', 'bottom'),
      s(['.grt-general-search', '.dt-search input'], 'Recherche dans les résultats', 'Filtre le tableau déjà chargé. Ce filtre ne relance pas le SQL et ne change donc pas le périmètre interrogé côté serveur.', 'bottom'),
      s(['.dt-buttons', '.export_controls'], 'Export', 'Exportez les résultats lorsque vous devez les retravailler hors Koha. Vérifiez les colonnes visibles et le volume avant export.', 'bottom'),
      s(['.grt-reset'], 'Réinitialiser l’affichage', 'Supprime les filtres d’interface et rétablit l’affichage des colonnes sans réexécuter le rapport.', 'bottom')
    );

    return k.compactSteps(steps);
  });
})();
