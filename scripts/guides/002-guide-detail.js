/* Guide très détaillé - catalogue/detail.pl */
(function(){
  'use strict';
  if (window.__kohaGuideDetailLoadedV6) return;
  window.__kohaGuideDetailLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;
  const k = window.KOHA_GUIDES, s = k.stepAny;

  function itemFunnel(){
    return `<div class="kg-funnel">
      <div class="f1">Bibliothèque actuelle : dans quel site chercher ?</div><span class="kg-funnel-arrow">↓</span>
      <div class="f2">Localisation : dans quel espace / secteur ?</div><span class="kg-funnel-arrow">↓</span>
      <div class="f3">Cote : dans quel rayon et à quelle place ?</div><span class="kg-funnel-arrow">↓</span>
      <div class="f4">Statut : le document doit-il être physiquement présent ?</div><span class="kg-funnel-arrow">↓</span>
      <div class="f5">Code-barres : est-ce bien la bonne copie ?</div>
    </div>`;
  }

  k.register(function(ctx){
    if (!/\/catalogue\/detail\.pl$/.test(ctx.path)) return [];
    return k.compactSteps([
      s(['#catalogue_detail_biblio .titlemika', '.titlemika', 'main h1'], 'Notice bibliographique', 'Vous êtes sur la fiche complète d’une notice bibliographique : la description commune de l’édition ou manifestation. Plusieurs exemplaires physiques peuvent être rattachés à cette même notice.', 'bottom', 'Règle fondamentale : une modification de notice concerne potentiellement toutes les copies rattachées ; une donnée propre à une copie se corrige au niveau exemplaire.'),
      s(['#toolbar'], 'Barre d’actions de la notice', 'Création, modification, export, listes et réservation sont regroupés ici. Vérifiez toujours si l’action porte sur la notice ou sur ses exemplaires.', 'bottom'),
      s(['#editbiblio', 'a[href*="addbiblio.pl?biblionumber="]'], 'Modifier la notice', 'Ouvre l’éditeur MARC. À utiliser pour corriger titre, responsabilités, édition, indexation, liens d’autorité et autres données bibliographiques.', 'bottom'),
      s(['#manageitems', 'a[href*="additem.pl?biblionumber="]'], 'Gérer les exemplaires', 'Ouvre les données locales de chaque copie : site, localisation, cote, code-barres, statut, collection et autres champs d’exemplaire.', 'bottom'),
      s(['#placehold'], 'Réserver', 'La réservation porte généralement sur la notice afin que le prochain exemplaire admissible puisse satisfaire la demande ; selon le contexte, un exemplaire précis peut aussi être ciblé.', 'bottom'),
      s(['#catalogue_detail_biblio'], 'Lire les données bibliographiques', 'Titre, auteurs, édition, collection, résumé, indexation et autres informations décrivent le document intellectuellement. Utilisez-les pour confirmer que vous êtes sur la bonne édition avant de descendre au niveau exemplaire.', 'right'),
      s(['.catalogue-info a[href*="search.pl"]', '#catalogue_detail_biblio a[href*="search.pl"]'], 'Rebonds documentaires', 'Les liens sur auteur, collection, sujet ou autres accès servent de rebonds : ils relancent une recherche sur la valeur contrôlée sans ressaisie.', 'bottom'),
      s(['.technique'], 'Informations techniques', 'Identifiants, dates, grille et raccourcis de recherche sont utiles pour le diagnostic, le catalogage et les contrôles de qualité.', 'left'),
      s(['#bibliodetails .nav-tabs', '#bibliodetails'], 'Onglets de la notice', 'Les onglets séparent exemplaires, description, acquisitions, problèmes et autres informations. Commencez par Exemplaires lorsqu’il s’agit de trouver une copie physique.', 'top'),
      s(['#holdings_table_wrapper', '#holdings_table'], 'Tableau des exemplaires', `Chaque ligne représente une copie réelle. Pour trouver physiquement un document, utilisez les données comme un entonnoir plutôt que de lire une seule colonne.${itemFunnel()}`, 'top', 'Le site + localisation + cote indiquent où chercher ; le statut indique si la copie devrait être présente ; le code-barres confirme l’exemplaire trouvé.'),
      s(['#holdings_table tbody tr'], 'Une ligne = un exemplaire', 'Lisez la ligne horizontalement : type, bibliothèque actuelle, bibliothèque de rattachement, localisation, cote, statut, dates, prêts et code-barres décrivent ensemble la situation de cette copie.', 'top'),
      s(['#holdings_holdingbranch', '#holdings_table [data-label="holdingbranch"]', '#holdings_table .location'], 'Bibliothèque actuelle', 'C’est le premier repère pour une recherche physique : où Koha situe actuellement la copie. Un exemplaire flottant ou transféré peut être ailleurs que dans sa bibliothèque de rattachement.', 'top', 'Pour aller chercher un document, privilégiez la bibliothèque actuelle ; pour comprendre son appartenance administrative, regardez la bibliothèque de rattachement.'),
      s(['#holdings_homebranch', '#holdings_table [data-label="homebranch"]', '#holdings_table .homebranch'], 'Bibliothèque de rattachement', 'Elle indique le site propriétaire ou de rattachement de l’exemplaire. Elle est importante pour les politiques de collection, certains rapports et certaines règles, mais elle ne dit pas toujours où se trouve physiquement la copie aujourd’hui.', 'top'),
      s(['#holdings_location', '#holdings_table [data-label="location"] .shelvingloc', '#holdings_table .shelvingloc'], 'Localisation', 'La localisation réduit la recherche à un espace interne : Romans, Jeunesse, DVD, Réserve, etc. C’est le deuxième étage de l’entonnoir après le site.', 'top'),
      s(['#holdings_itemcallnumber', '#holdings_table [data-label="itemcallnumber"]', '#holdings_table .itemcallnumber'], 'Cote', 'La cote est le repère de classement en rayon. Lisez-la selon les conventions locales du secteur concerné ; elle n’a de sens physique qu’une fois le bon site et la bonne localisation identifiés.', 'top', 'Une cote n’est pas un sujet : c’est d’abord une adresse documentaire organisée selon votre plan de classement.'),
      s(['#holdings_enumchron', '#holdings_table [data-label="enumchron"]'], 'Étage / numéro / chronologie', 'Selon vos usages, ce champ complète la cote avec un étage, numéro, volume ou information locale. Il peut être décisif pour les périodiques ou les collections en plusieurs parties.', 'top'),
      s(['#holdings_status', '#holdings_table .status'], 'Statut de circulation', 'Avant de vous déplacer, vérifiez si l’exemplaire devrait être présent : disponible, prêté, réservé, en transfert, exclu du prêt ou autre situation.', 'top', 'Un document “introuvable” peut simplement être en prêt ou en transfert. Le statut évite de chercher inutilement en rayon.'),
      s(['#holdings_lastseen', '#holdings_table .datelastseen'], 'Vu en dernier', 'Cette date aide à évaluer quand Koha a vu l’exemplaire pour la dernière fois. Une date ancienne peut être un indice lors d’une recherche d’exemplaire manquant, mais ce n’est pas une preuve de perte.', 'top'),
      s(['#holdings_issues', '#holdings_table .issues'], 'Prêts cumulés', 'Le nombre de prêts donne une mesure brute d’usage. Il doit être interprété avec l’âge de l’exemplaire, sa localisation et sa disponibilité récente.', 'top'),
      s(['#holdings_dateaccessioned', '#holdings_table .dateaccessioned'], 'Date d’acquisition', 'Elle situe l’ancienneté de la copie et permet de mettre en perspective son activité.', 'top'),
      s(['#holdings_datelastborrowed', '#holdings_table .datelastborrowed'], 'Dernier emprunt', 'Cette date permet de distinguer une copie historiquement active d’un exemplaire peu ou plus utilisé récemment.', 'top'),
      s(['#holdings_barcode', '#holdings_table [data-label="barcode"]'], 'Code-barres', 'Le code-barres est l’identifiant opérationnel unique de la copie. Une fois le document trouvé au bon emplacement, contrôlez-le pour confirmer que vous avez le bon exemplaire.', 'top', 'C’est aussi le meilleur identifiant à scanner pour prêt, retour, transfert, inventaire et recherche ciblée.'),
      s(['#holdings_actions', '#holdings_table td.actions'], 'Actions de l’exemplaire', 'Modifier, mouvements, historique de prêt et mise de côté portent uniquement sur la ligne concernée.', 'left'),
      s(['.dim-item-btn'], 'Mouvements de l’exemplaire', 'Si la localisation actuelle semble incohérente, consultez les mouvements pour comprendre prêts, retours et transferts successifs.', 'left'),
      s(['.dim-history-btn'], 'Historique de prêt', 'Le préfiltrage par code-barres isole l’histoire de cette copie dans la timeline.', 'left'),
      s(['#sidebar5'], 'Mettre de côté', 'Conservez une notice ou certains exemplaires pendant une recherche physique, un contrôle de rayon, un récolement ou un futur traitement par lot.', 'top')
    ]);
  });
})();
