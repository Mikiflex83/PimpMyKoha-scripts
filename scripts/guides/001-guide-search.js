/* Guide très détaillé - catalogue/search.pl */
(function(){
  'use strict';
  if (window.__kohaGuideSearchLoadedV6) return;
  window.__kohaGuideSearchLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;
  const k = window.KOHA_GUIDES;
  const s = k.stepAny;

  function funnel(){
    return `<div class="kg-funnel">
      <div class="f1">1 · Besoin documentaire : titre, auteur, sujet, document physique…</div><span class="kg-funnel-arrow">↓</span>
      <div class="f2">2 · Recherche assez large</div><span class="kg-funnel-arrow">↓</span>
      <div class="f3">3 · Index adapté</div><span class="kg-funnel-arrow">↓</span>
      <div class="f4">4 · Facettes / limites / tri</div><span class="kg-funnel-arrow">↓</span>
      <div class="f5">5 · Notice puis exemplaire précis</div>
    </div>`;
  }

  k.register(function(ctx){
    if (!/\/catalogue\/search\.pl$/.test(ctx.path)) return [];

    const hasResults = !!k.firstVisible(['#bookbag_form tbody tr[id^="row"]', '.kx-notice-card', '.searchresults', '#searchresults']);
    const steps = [
      s(['h1', '#advsearch h1', 'main h2', '#bookbag_form'], 'La recherche professionnelle', `Une bonne recherche ne consiste pas à tout préciser dès le départ. On part d’un besoin, on choisit un point d’entrée, puis on resserre progressivement.${funnel()}`, 'bottom', 'Méthode recommandée : commencez assez large pour ne pas perdre de résultats pertinents, puis utilisez les outils de Koha pour réduire le bruit.'),
      s(['#header_search', '#catalog_search', 'form[action*="catalogue/search.pl"]'], 'Recherche rapide', 'C’est le point d’entrée courant : titre, auteur, ISBN/EAN, terme significatif, cote… Pour une vérification simple, elle est souvent plus efficace qu’un formulaire très contraint.', 'bottom', 'Évitez de saisir trop de mots d’un coup : chaque terme supplémentaire peut réduire fortement le nombre de résultats.'),
      s(['select[name="idx"]', '#masthead_search select', 'select[name^="idx"]'], 'Choisir le bon index', 'L’index indique à Koha <strong>où chercher</strong>. Mot-clé explore largement ; titre, auteur, sujet, ISBN ou cote sont plus ciblés. Plus vous êtes certain de la nature de la donnée, plus un index précis est pertinent.', 'right', '<strong>Exemples :</strong> ISBN/EAN pour une édition ; auteur pour une personne ; titre pour une œuvre ; cote pour retrouver un classement ; sujet pour une recherche thématique.'),
      s(['input[name="q"]', '#search-form input[type="text"]', 'input[name^="q"]'], 'Le terme recherché', 'Saisissez une valeur suffisamment discriminante mais pas inutilement longue. Pour un identifiant ou une cote, utilisez la forme réellement stockée dans le catalogue.', 'bottom', 'En cas de zéro résultat : retirez d’abord un mot secondaire, une limite ou un filtre avant de conclure que le document n’existe pas.'),
      s(['#advancedSearch', '.advanced-search-link', 'a[href*="search.pl?advsearch=1"]'], 'Passer à la recherche avancée', 'Utilisez-la lorsque la recherche simple produit trop de bruit, quand plusieurs critères doivent être combinés ou lorsqu’une limite documentaire est indispensable.', 'top')
    ];

    if (!hasResults) {
      steps.push(
        s(['#advsearch', '#advanced-search', 'form[name="advsearch"]', 'main form[action*="search.pl"]'], 'Construire la requête', 'Chaque ligne ajoute un critère. Commencez par le critère le plus informatif, puis ajoutez un second critère seulement si nécessaire.', 'bottom', 'Exemple : Auteur = Musso + Titre = vie. Il est souvent inutile d’ajouter immédiatement site + année + type + langue.'),
        s(['select[name^="idx"]', '.search-term-row select'], 'Un index par critère', 'Chaque ligne peut interroger un index différent. Cela permet de distinguer clairement un nom d’auteur, un mot du titre et un sujet.', 'right'),
        s(['select[name^="op"]', '.operator'], 'ET, OU, SAUF', '<strong>ET</strong> exige les deux conditions et resserre. <strong>OU</strong> accepte l’une ou l’autre et élargit. <strong>SAUF</strong> retire un ensemble.', 'right', 'Pour comprendre une requête complexe, lisez-la comme une phrase logique avant de la lancer.', 'SAUF est puissant mais peut éliminer des notices pertinentes si l’indexation est incomplète ou hétérogène.'),
        s(['#advsearch-itemtypes', '.itemtypes', 'input[name="itype"]'], 'Limiter par type de document', 'Le type de document est une limite utile lorsque le support ou la catégorie documentaire fait partie du besoin. Ne l’utilisez pas seulement pour “réduire le nombre” si le support n’est pas réellement un critère.', 'top'),
        s(['select[name="branch_group_limit"]', 'select[name="limit-yr"]', '.search_limits', '#advsearch-subtypes'], 'Limites bibliographiques et locales', 'Année, langue, public, contenu, localisation, disponibilité ou bibliothèque peuvent réduire le périmètre. Une limite agit comme un filtre supplémentaire ; elle ne remplace pas le choix d’un bon index.', 'top'),
        s(['select[name="sort_by"]', '#sort_by'], 'Préparer le tri', 'Le tri ne change pas les documents trouvés : il change seulement leur ordre d’affichage. Selon le besoin, utilisez pertinence, titre, auteur, cote, date ou popularité.', 'top', 'Pour un travail de collection, un tri par cote ou date peut être plus opérationnel qu’un tri par pertinence.'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Lancer puis observer', 'Validez, puis regardez le nombre de résultats avant de modifier la requête. Une recherche professionnelle se construit souvent en deux temps : <strong>chercher</strong>, puis <strong>affiner</strong>.', 'top')
      );
      return k.compactSteps(steps);
    }

    steps.push(
      s(['#searchresults', '.searchresults', '#bookbag_form'], 'Première lecture du résultat', 'Regardez d’abord le volume de résultats. Quelques résultats permettent une lecture directe ; plusieurs centaines imposent généralement une facette, un index plus précis ou une limite.', 'top'),
      s(['.results_summary', '#numresults', '.searchresults > p:first-child'], 'Nombre de résultats et requête', 'Cette information permet d’évaluer immédiatement si la recherche est trop large ou trop étroite. Avant de relancer une nouvelle requête, essayez d’exploiter les filtres disponibles.', 'bottom'),
      s(['select[name="sort_by"]', '#sort_by', '.sort_by select', '.searchresults select'], 'Trier les résultats', 'Le tri organise la même liste sans modifier la requête. Utilisez la pertinence pour l’exploration, la date pour les nouveautés, le titre/auteur pour contrôler une série de résultats, ou la cote pour une logique de rayon.', 'left'),
      s(['#search-facets', '.search-facets', '.facets', '#facetcontainer', '.search_filters'], 'Les facettes : filtrer après la première recherche', 'Les facettes sont l’un des outils les plus efficaces de Koha. Elles permettent de garder la requête initiale et de la resserrer par disponibilité, auteur, type, localisation, sujet, collection, bibliothèque, langue ou autres catégories disponibles.', 'right', '<strong>Bon réflexe :</strong> faites d’abord une recherche assez large, puis utilisez les facettes. Cela évite de reconstruire une requête trop restrictive.'),
      s(['#search-facets a', '.search-facets a', '.facets a', '#facetcontainer a'], 'Appliquer une facette', 'Un clic ajoute une contrainte à la recherche courante. Observez ensuite le nouveau nombre de résultats. Plusieurs facettes peuvent parfois être combinées.', 'right', 'Gardez à l’esprit qu’une facette dépend des données réellement présentes et indexées dans le catalogue.'),
      s(['#search-facets .remove', '.search-facets .active', '.facets .active', 'a[href*="limit="]'], 'Retirer ou modifier un filtre', 'Si le résultat devient trop étroit, retirez d’abord le dernier filtre ajouté plutôt que de repartir de zéro.', 'right'),
      s(['.save-search-filter', '#save_search_filter', 'button[data-bs-target*="filter"]', 'a[href*="search_filters"]'], 'Filtres de recherche enregistrés', 'Lorsque cette fonctionnalité est activée, une recherche utile et récurrente peut être sauvegardée comme filtre. C’est intéressant pour des contrôles professionnels récurrents.', 'bottom'),
      s(['.kx-notice-card', 'td.kx-notice-cell'], 'Une ligne = une notice bibliographique', 'Le résultat principal représente la notice bibliographique, c’est-à-dire la description commune d’une édition ou manifestation. Les exemplaires rattachés sont affichés à côté.', 'right'),
      s(['.titlemikaresult a', '.titlebibresult a'], 'Ouvrir la notice', 'Le titre est le passage vers le détail complet : zones bibliographiques, exemplaires, acquisitions, historique et outils de catalogage.', 'bottom'),
      s(['.kx-biblio-line.kx-notice-meta-author a', 'li[title="Zone : 700"] a'], 'Rebond par auteur', 'Un lien d’auteur permet de relancer immédiatement une recherche sur cet auteur. C’est un <strong>rebond documentaire</strong> : on part d’une notice connue pour explorer un ensemble lié.', 'bottom', 'Même logique pour les sujets, collections, séries et autres accès cliquables.'),
      s(['.kx-notice-meta-series a', 'li[title="Zone : 225"] a', 'li[title="Zone : 461"] a'], 'Rebond par collection ou série', 'Très utile pour retrouver les autres volumes ou titres liés à une collection/série sans ressaisir le terme.', 'bottom'),
      s(['.kx-biblio-line a[href*="su"]', '.kx-notice-meta-fold a[href*="su"]'], 'Rebond par sujet / indexation', 'Utilisez les sujets comme portes d’entrée vers des documents de contenu proche. C’est souvent plus précis qu’une nouvelle recherche en texte libre.', 'bottom'),
      s(['.kxri-panel'], 'Passer de la notice aux exemplaires', `Une fois la bonne notice trouvée, on descend vers le document physique.${funnel()}`, 'left', 'C’est le passage essentiel : une recherche bibliographique identifie d’abord la bonne notice, puis les données d’exemplaire permettent de localiser une copie.'),
      s(['.kxri-item'], 'Carte exemplaire', 'Chaque carte correspond à une copie précise. Lisez ensemble site, localisation, cote, statut et code-barres.', 'left'),
      s(['.kxri-library'], 'Bibliothèque actuelle', 'C’est le site où Koha considère actuellement l’exemplaire. Pour trouver physiquement le document, cette donnée est souvent plus importante que la bibliothèque de rattachement.', 'left'),
      s(['.kxri-location'], 'Localisation', 'Elle indique une zone ou un secteur interne : Romans, Jeunesse, DVD, Réserve… Elle réduit le périmètre à l’intérieur du site.', 'left'),
      s(['.kxri-callnumber'], 'Cote', 'La cote est le principal repère de rangement. Après le site et la localisation, elle permet d’aller vers le rayon puis la place théorique du document.', 'left'),
      s(['.kxri-status'], 'Statut avant déplacement', 'Avant de chercher en rayon, vérifiez que l’exemplaire est réellement disponible. En prêt, transfert, réservation ou statut particulier, la cote seule ne suffit pas.', 'left'),
      s(['.kxri-barcode-line'], 'Code-barres = confirmation finale', 'Le code-barres identifie une copie unique. Il sert à confirmer que le document trouvé en rayon est bien l’exemplaire attendu et à l’utiliser dans circulation, transferts, rapports ou traitements par lots.', 'left'),
      s(['.kxri-callnumber a', 'a[href*="idx=callnum"]'], 'Rebond par cote', 'Le lien de cote permet de rechercher d’autres documents classés de façon identique ou proche. C’est un rebond particulièrement utile pour le travail en rayon et l’analyse d’un segment de collection.', 'top'),
      s(['.kxri-toggle-details'], 'Détails de l’exemplaire', 'Utilisez-les lorsque les informations visibles ne suffisent pas : numéro d’exemplaire, bibliothèque de rattachement, dates, collection, dernier emprunt, etc.', 'top'),
      s(['#historique'], 'Historique des recherches', 'Votre historique local permet de revenir sur une recherche sans la reconstruire. C’est particulièrement utile lors d’un travail comparatif ou d’une succession de contrôles.', 'top'),
      s(['#sidebar5'], 'Mettre de côté pendant la recherche', 'Conservez temporairement des notices ou exemplaires intéressants sans perdre votre recherche. Vous pouvez ensuite copier/exporter les identifiants pour un rapport ou un traitement.', 'top')
    );

    return k.compactSteps(steps);
  });
})();
