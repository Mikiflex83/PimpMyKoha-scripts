/*
 Nom du fichier: guides/000b-guide-bibliotheconomie.js
 Version: 20260908-v6
 Description: Couche bibliothéconomique commune injectée avant les guides métier Intro.js.
*/
(function(){
  'use strict';
  if (window.__kohaGuideBibliotheconomieLoadedV6) return;
  window.__kohaGuideBibliotheconomieLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;

  const k = window.KOHA_GUIDES;
  const s = k.stepAny;
  const compact = k.compactSteps;
  const p = (ctx, re) => re.test(ctx.path || '');

  function t(selectors, title, body, note, warning, position){
    return s(selectors, 'Repère bibliothéconomique — ' + title, body, position || 'bottom', note || null, warning || null);
  }

  function titleTarget(){
    return ['main h1','h1','#catalogue_detail_biblio','.page-section h2','main'];
  }

  function noticeTheory(ctx){
    const st = [];
    if (p(ctx, /\/catalogue\/(search|detail|moredetail|issuehistory)\.pl$/) || p(ctx, /\/cataloguing\/addbiblio\.pl$/)) {
      st.push(
        t(['#catalogue_detail_biblio','.kx-notice-card','#bookbag_form','main h1','h1'], 'notice bibliographique', 'Une <strong>notice bibliographique</strong> décrit une ressource publiée : titre, responsabilité, édition, publication, description matérielle, collection, identifiants, notes et points d’accès. Elle décrit l’édition/manifestation cataloguée, <strong>pas l’exemplaire physique particulier</strong> posé dans une médiathèque.', 'Plusieurs exemplaires d’une même édition sont normalement rattachés à une même notice bibliographique.'),
        t(['#holdings_table','.kxri-panel','.items_table','main h1','h1'], 'notice d’exemplaire', 'Une <strong>notice d’exemplaire</strong> représente la copie physique ou locale réellement gérée par le réseau. Elle porte notamment le code-barres, le numéro d’exemplaire, la bibliothèque de rattachement, la bibliothèque actuelle, la cote, la localisation, les statuts et les dates de circulation.', 'Dans Koha, la notice bibliographique est le niveau « document publié » ; l’exemplaire est le niveau « copie possédée et circulante ».', 'Ne créez pas une nouvelle notice bibliographique simplement parce qu’un deuxième site possède un autre exemplaire du même document.'),
        t(['#holdings_barcode','.kxri-barcode','.barcode','a[href*="itemnumber="]','main h1','h1'], 'les identifiants ne désignent pas la même chose', '<strong>biblionumber</strong> identifie la notice dans Koha ; <strong>itemnumber</strong> identifie l’exemplaire dans Koha ; le <strong>code-barres</strong> est l’identifiant opérationnel de cet exemplaire ; ISBN/EAN identifient une publication commerciale et peuvent être communs à plusieurs exemplaires.', 'Pour les traitements par lots, choisissez toujours l’identifiant correspondant au niveau réellement visé : notice ou exemplaire.')
      );
    }
    return st;
  }

  function cataloguingTheory(ctx){
    const st = [];
    if (p(ctx, /\/cataloguing\/addbiblio\.pl$/)) {
      st.push(
        t(titleTarget(), 'cataloguer, c’est distinguer description et accès', 'La <strong>description bibliographique</strong> restitue les caractéristiques de la ressource ; les <strong>points d’accès</strong> permettent de la retrouver et de la regrouper : auteurs, collectivités, titres, sujets, genres/formes, etc.', 'Une bonne notice ne consiste pas à remplir le maximum de zones : elle doit être cohérente, identifiable, retrouvable et suffisamment précise pour distinguer les éditions.'),
        t(['#div-tag_200','#tag_200','#cataloguing_add_biblio'], 'décrire ce que l’on a effectivement en main', 'En catalogage courant, on décrit l’édition réellement traitée. Le titre, la mention de responsabilité, l’éditeur, la date, la pagination ou le support servent notamment à distinguer deux manifestations proches.', 'Une réimpression strictement identique peut relever de la même notice selon la politique du réseau ; une autre édition, un autre support ou une différence bibliographique significative peut justifier une autre notice.'),
        t(['#div-tag_700','#div-tag_701','#div-tag_702','.subfield_line[id*="700"]','main h1'], 'points d’accès contrôlés', 'Les auteurs, collectivités et certains sujets gagnent à être reliés à des <strong>autorités</strong>. Le but est d’éviter qu’une même personne soit dispersée sous plusieurs formes et de permettre une navigation cohérente dans le catalogue.', 'Dans Koha, la liaison à une autorité se matérialise notamment par l’identifiant d’autorité associé au champ MARC.'),
        t(['#div-tag_606','#div-tag_610','#div-tag_607','#div-tag_608','main h1'], 'indexation et classification ne sont pas la même chose', 'L’<strong>indexation</strong> exprime le contenu intellectuel ou la forme du document ; la <strong>classification/cote</strong> organise matériellement le fonds. Un même sujet peut se trouver sous plusieurs cotes, et une cote ne remplace pas une indexation matière.', null, 'Évitez de transformer une cote locale en pseudo-mot-clé bibliographique uniquement pour faciliter un rangement.'),
        t(['#savebtn','button[type="submit"]','main h1'], 'règle de contrôle avant enregistrement', 'Avant d’enregistrer : contrôlez l’identité de l’édition, les responsabilités principales, les identifiants, la publication, la description matérielle et les liens d’autorité utiles.', 'Le meilleur contrôle anti-doublon reste la comparaison bibliographique : titre + responsabilité + éditeur/date + support + identifiants, et pas un seul critère isolé.', 'Un ISBN identique est un indice fort, mais pas une preuve absolue : erreurs de saisie, ISBN réutilisé ou données fournisseurs imparfaites existent.')
      );
    }

    if (p(ctx, /\/cataloguing\/additem\.pl$/)) {
      st.push(
        t(titleTarget(), 'un exemplaire = une copie locale', 'L’exemplaire est l’unité sur laquelle portent le prêt, le retour, le transfert, le statut, le code-barres et la localisation physique. Deux copies du même livre sont donc deux exemplaires distincts, même si elles partagent la même notice bibliographique.'),
        t(['input[name="barcode"]','#barcode','input[id*="barcode"]','main h1'], 'code-barres et itemnumber', 'Le <strong>code-barres</strong> est destiné aux opérations quotidiennes et au scan. L’<strong>itemnumber</strong> est la clé technique interne de Koha. Ils identifient le même exemplaire mais n’ont pas le même usage.', 'Ne réutilisez jamais le code-barres d’un exemplaire supprimé comme simple raccourci de catalogage sans procédure réseau explicite.'),
        t(['select[name="homebranch"]','select[id*="homebranch"]','main h1'], 'bibliothèque de rattachement', 'La bibliothèque de rattachement exprime l’appartenance administrative de l’exemplaire. Elle peut rester stable même lorsque l’exemplaire circule ou séjourne temporairement dans une autre bibliothèque.'),
        t(['select[name="holdingbranch"]','select[id*="holdingbranch"]','main h1'], 'bibliothèque actuelle', 'La bibliothèque actuelle décrit où Koha considère l’exemplaire à l’instant présent. Elle peut évoluer avec les retours, transferts ou règles de circulation.', 'Dans un réseau, distinguer rattachement et localisation actuelle évite de confondre propriété du fonds et position physique.'),
        t(['input[name="itemcallnumber"]','input[id*="itemcallnumber"]','main h1'], 'la cote est une adresse documentaire', 'La cote sert d’abord à localiser et ordonner le document dans le fonds. Elle peut intégrer une classification, un code auteur, un public ou une règle locale, mais elle reste une donnée de gestion physique.', 'Une cote cohérente est lisible par les équipes et stable dans le temps ; elle ne remplace pas les métadonnées bibliographiques.'),
        t(['select[name="notforloan"]','select[id*="notforloan"]','main h1'], 'statut et disponibilité', 'Le statut d’exemplaire agit sur sa disponibilité et parfois sur sa circulation. Il décrit une situation de gestion : en traitement, exclu du prêt, perdu, retiré, etc.', null, 'Pour corriger un problème propre à une copie, modifiez l’exemplaire ; ne modifiez pas la notice bibliographique si les autres exemplaires ne sont pas concernés.')
      );
    }
    return st;
  }

  function searchTheory(ctx){
    if (!p(ctx, /\/catalogue\/(search|itemsearch)\.pl$/)) return [];
    return [
      t(['select[name="idx"]','#advsearch','#bookbag_form','main h1'], 'chercher par le bon niveau de donnée', 'Une recherche de <strong>notice</strong> répond à « quel document/quelle édition ? ». Une recherche d’<strong>exemplaire</strong> répond plutôt à « quelle copie, dans quel site, avec quelle cote ou quel statut ? ». Choisir le bon écran évite des résultats difficiles à interpréter.'),
      t(['select[name="idx"]','#advsearch'], 'index et vocabulaire contrôlé', 'Un index titre, auteur, sujet, ISBN ou cote n’interroge pas la même partie des métadonnées. Les recherches sur des accès contrôlés sont plus précises lorsqu’autorités et indexation sont correctement entretenues.', 'Le mot-clé est utile pour explorer ; un index précis est préférable pour contrôler une donnée connue.'),
      t(['.facets','.search_filters','#search-facets','main h1'], 'filtrer sans confondre description et collection', 'Les facettes et limites réduisent un ensemble de résultats selon des caractéristiques bibliographiques ou locales. Elles n’altèrent pas les notices : elles changent uniquement le périmètre de recherche.')
    ];
  }

  function authorityTheory(ctx){
    if (!(p(ctx, /\/authorities\//) || p(ctx, /\/cataloguing\/authorities\.pl$/))) return [];
    return [
      t(titleTarget(), 'qu’est-ce qu’une notice d’autorité ?', 'Une <strong>notice d’autorité</strong> ne décrit pas un document : elle décrit la forme contrôlée d’un point d’accès — personne, collectivité, titre, nom géographique, sujet ou autre entité selon le référentiel utilisé.', 'Elle permet de regrouper sous une même identité les notices bibliographiques qui emploient ce point d’accès.'),
      t(['table.dataTable','#authorities_searchresult','#authorities','main h1'], 'forme retenue et formes rejetées/variantes', 'La forme retenue sert d’accès normalisé. Les variantes permettent de retrouver la même entité sous d’autres graphies, pseudonymes ou formes historiques sans créer plusieurs identités concurrentes.'),
      t(['a[href*="authid="]','input[name="authid"]','main h1'], 'liaison notice ↔ autorité', 'Le bénéfice de l’autorité apparaît lorsque les champs bibliographiques sont réellement <strong>liés</strong> à elle. Une chaîne de caractères ressemblante mais non liée ne profite pas automatiquement des corrections ou fusions d’autorités.'),
      t(['button[type="submit"]','.btn-danger','.merge','main h1'], 'règle anti-doublon des autorités', 'Avant de créer une autorité, cherchez les formes proches, variantes et identifiants externes disponibles. Si deux autorités décrivent la même entité, la fusion est préférable à la coexistence de doublons.', null, 'Fusionner des autorités différentes est plus grave que conserver temporairement un doublon : vérifiez l’identité réelle avant fusion.')
    ];
  }

  function circulationTheory(ctx){
    const circ = p(ctx, /\/circ\/(circulation|returns|renew|branchtransfers|transferstoreceive|transfers_to_send|waitingreserves|pendingreserves|view_holdsqueue|holds|overdue)\.pl$/);
    const reserve = p(ctx, /\/reserve\/request\.pl$/);
    if (!circ && !reserve) return [];
    const st = [
      t(titleTarget(), 'la circulation porte sur l’exemplaire', 'Prêt, retour, renouvellement, transfert et statut s’appliquent à une <strong>copie précise</strong>. C’est pour cela que le code-barres et l’itemnumber sont centraux au comptoir, alors que la notice bibliographique regroupe les copies.'),
      t(['input[name="barcode"]','#barcode','.items_table','main h1'], 'scan et traçabilité', 'Le scan du code-barres sécurise l’identification de la copie et alimente l’historique des transactions. En cas d’anomalie, raisonnez d’abord au niveau de l’exemplaire avant de modifier la notice.')
    ];
    if (reserve || p(ctx, /holds|reserves|waitingreserves|pendingreserves|view_holdsqueue/)) {
      st.push(
        t(['#holds-table','form[action*="reserve"]','main h1'], 'réservation de notice ou réservation d’exemplaire', 'Une réservation au niveau <strong>notice</strong> demande généralement le prochain exemplaire éligible ; une réservation d’<strong>exemplaire</strong> cible une copie déterminée. Le second cas doit rester volontaire car il réduit les possibilités de satisfaction par le réseau.', 'Dans un réseau multi-sites, une réservation au niveau notice exploite mieux la mutualisation des exemplaires lorsque les règles le permettent.')
      );
    }
    if (p(ctx, /branchtransfers|transferstoreceive|transfers_to_send/)) {
      st.push(
        t(['#branch','select[name="tobranch"]','table','main h1'], 'transfert = changement de localisation opérationnelle', 'Le transfert organise le déplacement d’un exemplaire entre bibliothèques sans changer sa notice bibliographique ni nécessairement sa bibliothèque de rattachement.', 'Le transfert explique souvent pourquoi « bibliothèque actuelle » et « bibliothèque de rattachement » diffèrent.')
      );
    }
    return st;
  }

  function patronTheory(ctx){
    if (!p(ctx, /\/members\//)) return [];
    return [
      t(titleTarget(), 'la notice adhérent est une donnée de gestion, pas une donnée documentaire', 'Le dossier adhérent identifie une personne ou une collectivité utilisatrice du service. Il porte des droits, une catégorie, une bibliothèque d’inscription, des coordonnées et des transactions de circulation.', 'La qualité des données adhérent conditionne les notifications, statistiques, règles de circulation et recherches d’homonymes.'),
      t(['#categorycode','select[name="categorycode"]','.patroninfo','main h1'], 'la catégorie n’est pas qu’une étiquette', 'La catégorie peut piloter durée d’inscription, règles de prêt, quotas, tarification ou restrictions selon la configuration. Une mauvaise catégorie peut donc produire des comportements de circulation inattendus.'),
      t(['#table_readingrec','#issues-table','.timeline-container-wrapper','main h1'], 'confidentialité des historiques', 'Les historiques de prêt et données personnelles doivent être consultés uniquement lorsqu’un besoin professionnel le justifie et selon les règles du réseau.', 'Un historique de circulation est un outil de service et de diagnostic, pas une donnée à exploiter sans finalité professionnelle.')
    ];
  }

  function marcImportTheory(ctx){
    if (!(p(ctx, /\/tools\/(stage-marc-import|manage-marc-import|showdiffmarc)\.pl$/) || p(ctx, /\/admin\/(matching-rules|marc-overlay-rules|record_sources)\.pl$/))) return [];
    const st = [
      t(titleTarget(), 'MARC : structure des métadonnées', 'MARC encode une notice en zones, indicateurs et sous-zones. L’import ne « copie pas une fiche » visuelle : il injecte une structure de métadonnées que Koha interprète ensuite selon le format MARC, les grilles et les règles du système.', 'Un même fichier peut contenir des notices bibliographiques ou des autorités ; leur nature doit être connue avant traitement.'),
      t(['#uploadform','#processfile','#staged_records','main h1'], 'mise en réservoir = zone de contrôle', 'La <strong>mise en réservoir</strong> est une étape intermédiaire : les notices entrantes sont analysées et préparées avant l’import définitif. C’est le bon moment pour contrôler encodage, transformations, concordances et exemplaires.', 'Séparer préparation et import permet de vérifier le lot sans modifier immédiatement le catalogue.'),
      t(['#matcher','select[name*="matcher"]','#matching_rules','main h1'], 'concordance = recherche d’un candidat existant', 'Une règle de concordance calcule si une notice entrante semble correspondre à une notice déjà présente. Elle réduit les doublons mais ne remplace pas le jugement bibliographique lorsqu’un recouvrement est envisagé.', 'Les identifiants normalisés sont utiles, mais une bonne concordance croise idéalement plusieurs informations lorsque le flux le permet.', 'Un ISBN identique ne suffit pas à garantir que deux notices doivent être recouvertes.'),
      t(['#overlay_action','#marc_overlay_rules','table','main h1'], 'recouvrement MARC', 'Le <strong>recouvrement</strong> remplace tout ou partie des métadonnées de la notice existante par celles de la notice entrante selon les règles configurées. Il doit préserver les données locales que le fournisseur ne connaît pas.', 'Pensez particulièrement aux zones locales, liens d’autorités, données d’acquisition et autres enrichissements propres au réseau.', 'Plus l’action est destructive, plus la règle de concordance et le contrôle humain doivent être exigeants.'),
      t(['#nomatch_action','#staged_records','main h1'], 'absence de concordance', 'Lorsqu’aucune notice existante n’est reconnue, la création d’une nouvelle notice est généralement le comportement attendu pour un flux d’acquisition. Mais l’absence de match peut aussi révéler une règle trop stricte ou des métadonnées de mauvaise qualité.'),
      t(['#items','#item_action','main h1'], 'notices et exemplaires dans un même flux', 'Un fichier bibliographique peut aussi transporter des données d’exemplaires selon le format et la configuration. Importer une notice et importer des exemplaires sont deux décisions distinctes : on peut vouloir enrichir les métadonnées sans créer de nouvelles copies, ou l’inverse selon le flux.')
    ];
    return st;
  }

  function acquisitionTheory(ctx){
    if (!(p(ctx, /\/acqui\//) || p(ctx, /\/suggestion\/suggestion\.pl$/))) return [];
    const st = [
      t(titleTarget(), 'chaîne documentaire : suggestion, commande, réception, exemplaire', 'Une <strong>suggestion d’achat</strong> exprime un besoin ; une <strong>commande</strong> engage une acquisition ; la <strong>réception</strong> constate l’arrivée ; l’<strong>exemplaire</strong> matérialise la copie intégrée au fonds. Ces objets sont liés mais ne sont pas interchangeables.'),
      t(['a[href*="biblio"]','.order_line','table','main h1'], 'notice provisoire et notice de catalogue', 'En acquisitions, une notice peut être créée très tôt pour permettre la commande. Elle peut donc être sommaire ou provisoire jusqu’à la réception et au catalogage définitif.', 'Avant de créer une notice de commande, recherchez toujours si l’édition existe déjà pour éviter de fragmenter les exemplaires entre doublons.'),
      t(['#quantity','input[name="quantity"]','table','main h1'], 'quantité commandée et nombre d’exemplaires', 'La quantité d’une ligne de commande représente ce qui est acheté ; les exemplaires représentent ce qui est effectivement intégré et géré localement. Une réception partielle peut donc créer un décalage temporaire entre les deux.')
    ];
    if (p(ctx, /\/suggestion\/suggestion\.pl$/)) {
      st.push(t(['#suggestion_form','table','main h1'], 'une suggestion n’est pas encore une notice de collection', 'La suggestion sert à instruire une demande avant décision. Son titre ou son ISBN peuvent être approximatifs : vérifiez la référence bibliographique avant commande ou création de notice définitive.'));
    }
    return st;
  }

  function serialTheory(ctx){
    if (!p(ctx, /\/serials\//)) return [];
    return [
      t(titleTarget(), 'ressource continue, abonnement et fascicule', 'Pour un périodique, la <strong>notice bibliographique</strong> décrit le titre de la ressource continue ; l’<strong>abonnement</strong> décrit la relation de gestion avec un fournisseur et une périodicité ; chaque <strong>fascicule</strong> correspond à une livraison attendue ou reçue.', 'Ces trois niveaux répondent à des besoins différents : décrire, gérer l’abonnement, suivre les numéros.'),
      t(['input[name*="number"]','.serials','table','main h1'], 'numérotation et chronologie', 'La numérotation/chronologie permet d’identifier précisément un fascicule : volume, numéro, année, date ou combinaison de ces éléments. Une régularité de saisie est indispensable pour le bulletinage et l’état de collection.'),
      t(['#subscription-detail','table','main h1'], 'état de collection', 'L’état de collection vise à dire ce que la bibliothèque possède réellement. Il ne doit pas être confondu avec la seule périodicité théorique de l’abonnement : numéros manquants, suppléments et interruptions doivent être traités explicitement.')
    ];
  }

  function reportsTheory(ctx){
    if (!p(ctx, /\/reports\/guided_reports\.pl$/)) return [];
    return [
      t(['textarea[name="sql"]','#sql','main h1'], 'granularité : notice, exemplaire, transaction', 'Avant d’écrire ou lire un rapport, déterminez l’<strong>unité comptée</strong>. Une ligne de notice, une ligne d’exemplaire, un prêt ou une réservation ne représentent pas la même chose.', 'Beaucoup d’erreurs de statistiques viennent d’une jointure qui transforme une notice en plusieurs lignes parce qu’elle possède plusieurs exemplaires ou plusieurs transactions.'),
      t(['.report_results','table.dataTable','main h1'], 'un chiffre n’a de sens qu’avec son périmètre', 'Toujours documenter : période, sites, statuts, documents supprimés ou non, niveau de comptage et éventuelles exclusions. Deux rapports portant le même titre peuvent donner des résultats différents s’ils ne comptent pas la même unité.')
    ];
  }

  function adminTheory(ctx){
    if (!p(ctx, /\/admin\//)) return [];
    const st = [];
    if (p(ctx, /preferences\.pl$/)) st.push(
      t(titleTarget(), 'préférence système = règle globale', 'Une préférence système modifie le comportement de Koha pour tout ou partie de l’installation. Elle n’est pas une préférence personnelle de l’agent.', 'Avant de changer une syspref, identifiez le module touché et testez un cas représentatif après modification.', 'Dans un réseau, une préférence globale peut avoir des effets dans toutes les médiathèques.')
    );
    if (p(ctx, /smart-rules\.pl$/)) st.push(
      t(titleTarget(), 'règle de circulation = combinaison de contextes', 'Les règles de circulation répondent à une combinaison : catégorie d’adhérent, type de document, bibliothèque et paramètres associés. Une règle plus spécifique peut prendre le pas sur une règle générale.', 'Documentez les exceptions : elles sont souvent la cause des différences de durée, quota ou renouvellement observées au comptoir.')
    );
    if (p(ctx, /authorised_values\.pl$/)) st.push(
      t(titleTarget(), 'valeur autorisée = vocabulaire local contrôlé', 'Une valeur autorisée limite la saisie à un vocabulaire défini par le réseau. Elle améliore la cohérence des données locales, les filtres et les statistiques.', 'Évitez les doublons sémantiques avec variantes de casse, accents ou abréviations si elles désignent le même concept.')
    );
    if (p(ctx, /itemtypes\.pl$/)) st.push(
      t(titleTarget(), 'type de document = catégorie de circulation et de présentation', 'Le type de document structure souvent l’affichage, les règles de circulation et certaines statistiques. Il ne doit pas devenir un fourre-tout pour des notions qui relèvent plutôt de la localisation, de la collection ou du public.')
    );
    if (p(ctx, /categories\.pl$/)) st.push(
      t(titleTarget(), 'catégorie d’adhérent = profil de droits', 'Une catégorie d’adhérent regroupe des usagers soumis à des règles communes. Elle doit correspondre à une réalité de service durable, pas à une exception ponctuelle pour une personne.')
    );
    if (p(ctx, /branches\.pl$/)) st.push(
      t(titleTarget(), 'bibliothèque = unité organisationnelle du réseau', 'Dans Koha, une bibliothèque intervient dans le rattachement des adhérents, des exemplaires, les règles de circulation, les transferts et les statistiques. Son code est une donnée structurante et doit rester stable.')
    );
    return st;
  }

  function batchTheory(ctx){
    if (!p(ctx, /\/tools\/(batchMod|batch_record_modification|batch_delete_records|inventory|import_borrowers|modborrowers)\.pl$/)) return [];
    return [
      t(titleTarget(), 'traitement par lot = puissance et risque', 'Un traitement par lot applique une décision à plusieurs enregistrements. Avant validation, vérifiez <strong>le niveau</strong> concerné (notice, exemplaire, adhérent), la sélection et le champ qui sera modifié.', 'Conservez si possible la liste d’identifiants utilisée : elle facilite le contrôle ou le retour arrière.', 'Une erreur de sélection se reproduit sur tout le lot ; contrôlez un petit échantillon avant une opération massive.'),
      t(['textarea','table.dataTable','input[name*="number"]','main h1'], 'identifiants stables', 'Pour une sélection technique, préférez biblionumber/itemnumber lorsque l’outil le demande ; pour un travail opérationnel de rayon, le code-barres est souvent le repère le plus sûr. Ne mélangez pas les niveaux dans une même liste.')
    ];
  }

  function inventoryTheory(ctx){
    if (!p(ctx, /\/tools\/inventory\.pl$/)) return [];
    return [
      t(titleTarget(), 'récolement : confronter catalogue et réalité physique', 'Le récolement compare les exemplaires enregistrés dans le SIGB avec ceux effectivement présents. Il sert à détecter absences, erreurs de localisation, statuts incohérents ou documents non vus depuis longtemps.', 'Une absence au récolement n’implique pas automatiquement une suppression : contrôlez prêts, transferts, réservations, réparations et autres situations avant décision.')
    ];
  }

  function homeTheory(ctx){
    if (!(ctx.path === '/' || ctx.path === '' || p(ctx, /\/mainpage\.pl$/) || p(ctx, /\/circ\/circulation-home\.pl$/))) return [];
    return [
      t(['#logo','main h1','h1'], 'un SIGB relie plusieurs niveaux de données', 'Koha articule principalement des <strong>notices bibliographiques</strong>, des <strong>exemplaires</strong>, des <strong>autorités</strong>, des <strong>adhérents</strong> et des <strong>transactions</strong>. Comprendre le niveau auquel on agit évite une grande partie des erreurs de catalogue et de circulation.', 'Règle pratique : demandez-vous toujours « suis-je en train de modifier la description du document, une copie physique, une identité contrôlée, un usager ou une transaction ? ».')
    ];
  }

  const provider = function(ctx){
    let st = [];
    st = st
      .concat(homeTheory(ctx))
      .concat(noticeTheory(ctx))
      .concat(searchTheory(ctx))
      .concat(cataloguingTheory(ctx))
      .concat(authorityTheory(ctx))
      .concat(circulationTheory(ctx))
      .concat(patronTheory(ctx))
      .concat(marcImportTheory(ctx))
      .concat(acquisitionTheory(ctx))
      .concat(serialTheory(ctx))
      .concat(reportsTheory(ctx))
      .concat(adminTheory(ctx))
      .concat(batchTheory(ctx))
      .concat(inventoryTheory(ctx));
    return compact(st);
  };

  if (typeof k.registerFirst === 'function') k.registerFirst(provider);
  else k.register(provider);
})();
