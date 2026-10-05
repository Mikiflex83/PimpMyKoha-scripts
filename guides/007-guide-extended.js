/*
 Nom du fichier: guides/007-guide-extended.js
 Version: 20260908-v6
 Description: Guides métier étendus pour les principales pages Koha non couvertes par 001-006.
 Principe: sélecteurs souples + uniquement les éléments réellement visibles.
*/
(function(){
  'use strict';
  if (window.__kohaGuideExtendedLoadedV6) return;
  window.__kohaGuideExtendedLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;

  const k = window.KOHA_GUIDES;
  const s = k.stepAny;
  const compact = k.compactSteps;

  function p(ctx, re){ return re.test(ctx.path || ''); }

  function commonEnd(){
    return [
      s(['#bottomActionBar'], 'Barre d’outils transversale', 'Historique récent, recherche avancée, guide et listes temporaires restent accessibles depuis cette barre lorsque la page l’affiche.', 'top'),
      s(['#tutoriel'], 'Relancer le guide', 'Le guide est recalculé à chaque lancement : si un tableau, une modale ou un bloc vient d’apparaître, de nouvelles étapes peuvent devenir disponibles.', 'top')
    ];
  }

  k.register(function(ctx){
    /* Pages déjà traitées par 001-006 */
    if (p(ctx, /\/catalogue\/(search|detail)\.pl$/) ||
        p(ctx, /\/reports\/guided_reports\.pl$/) ||
        p(ctx, /\/circ\/circulation-home\.pl$/) ||
        p(ctx, /\/tools\/stage-marc-import\.pl\/?$/) ||
        p(ctx, /\/mainpage\.pl$/) || ctx.path === '/' || ctx.path === '') return [];

    let st = [];

    /* =========================================================
       CIRCULATION — PRET
       ========================================================= */
    if (p(ctx, /\/circ\/circulation\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Prêt à un adhérent', 'Cet écran concentre la situation du compte et les opérations de prêt. Avant de scanner un document, lisez les alertes visibles et vérifiez que vous êtes sur la bonne fiche.', 'bottom'),
        s(['.patroninfo', '#patron_details'], 'Identité et coordonnées', 'Contrôlez l’identité, la catégorie, le site d’inscription et les coordonnées utiles. Votre interface ajoute des outils de vérification pour éviter de travailler sur un dossier obsolète.', 'right'),
        s(['#verification-coordonnees'], 'Vérification des coordonnées', 'Ce bloc local permet de confirmer les informations de contact. Il est particulièrement utile lorsque Koha signale une expiration ou lorsque les coordonnées n’ont pas été contrôlées récemment.', 'right'),
        s(['#patron_messages', '.messages', '.alert'], 'Messages du compte', 'Retards, restrictions, expiration, notes internes ou autres avertissements apparaissent ici. Distinguez les informations bloquantes des simples rappels avant de poursuivre.', 'bottom'),
        s(['input[name="barcode"]', '#barcode'], 'Scanner le document', 'Scannez le code-barres de l’exemplaire à prêter. Le scan est préférable à la saisie manuelle pour éviter les erreurs d’identifiant.', 'bottom'),
        s(['#circ_circulation_issue', '#issuebutton', 'button[type="submit"]'], 'Valider le prêt', 'Koha applique les règles de circulation : durée, quota, réservations, restrictions et éventuelles confirmations. Lisez toute modale avant de confirmer une dérogation.', 'right'),
        s(['#issues-table'], 'Prêts en cours', 'Le tableau récapitule les documents actuellement empruntés. Vérifiez échéance, renouvellements, statut et éventuelles réservations avant une prolongation.', 'top'),
        s(['#holds-table'], 'Réservations de l’adhérent', 'Liste les réservations en cours. Votre enrichissement indique aussi des éléments de navette permettant d’expliquer certains délais de mise à disposition.', 'top'),
        s(['#relatives-issues', '#guarantees'], 'Comptes liés', 'Selon la catégorie d’adhérent, Koha peut afficher des garants ou personnes liées. Vérifiez le bon compte avant toute opération sensible.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       CIRCULATION — RETOUR
       ========================================================= */
    if (p(ctx, /\/circ\/returns\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Retour des documents', 'Traitez les retours en flux en laissant Koha déterminer les actions nécessaires : remise en rayon, réservation, transfert ou signalement.', 'bottom'),
        s(['form#checkin-form', 'form[action*="returns.pl"]'], 'Formulaire de retour', 'Le retour doit être enregistré avant toute décision physique sur le document. Ne vous fiez pas uniquement à l’étiquette ou au site de rattachement.', 'bottom'),
        s(['input#barcode', 'input[name="barcode"]'], 'Code-barres', 'Scannez chaque exemplaire. Après chaque scan, lisez le message produit par Koha avant de poser le document sur la pile suivante.', 'bottom'),
        s(['select[name="branch"]', '#returnbranch'], 'Site de retour', 'Selon les droits et paramètres, cette valeur détermine le contexte du retour. Elle peut intervenir dans les transferts et dans l’historique de circulation.', 'right'),
        s(['#checkedintable', '#checkin_table', 'table.dataTable'], 'Retours enregistrés', 'Le tableau conserve la trace des documents traités dans la session. Utilisez-le pour vérifier statut, destination, adhérent précédent et messages associés.', 'top'),
        s(['.alert', '#messages'], 'Message après retour', 'Une réservation, un transfert, un document déclaré perdu ou une anomalie peut déclencher un message prioritaire. Ce message doit guider le traitement physique du document.', 'top'),
        s(['.modal.show', '.modal-dialog'], 'Confirmation ou action complémentaire', 'Certaines situations nécessitent une confirmation : transfert, réservation, perte, annulation ou autre exception. Lisez la destination et le motif avant de valider.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       RENOUVELLEMENT
       ========================================================= */
    if (p(ctx, /\/circ\/renew\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Renouveler un prêt', 'Le renouvellement prolonge une circulation existante. Il reste soumis aux règles de prêt, aux réservations et à la situation du compte.', 'bottom'),
        s(['input[name="barcode"]', '#barcode'], 'Identifier l’exemplaire', 'Scannez le code-barres du document à renouveler. Koha retrouve le prêt actif et vérifie sa renouvelabilité.', 'bottom'),
        s(['form[action*="renew.pl"]'], 'Validation', 'Validez uniquement après contrôle de l’échéance proposée et des éventuels messages de blocage.', 'bottom'),
        s(['table.dataTable', '#renewals'], 'Résultat du renouvellement', 'Le tableau ou message de résultat confirme la nouvelle date ou explique le refus : réservation, limite atteinte, restriction ou autre règle de circulation.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       TRANSFERTS
       ========================================================= */
    if (p(ctx, /\/circ\/branchtransfers\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Transferts entre bibliothèques', 'Enregistrez ici l’envoi d’exemplaires vers un autre site. Le transfert modifie la localisation opérationnelle attendue du document.', 'bottom'),
        s(['select[name="tobranchcd"]', '#tobranch'], 'Bibliothèque de destination', 'Choisissez le site qui doit recevoir les documents avant de scanner les codes-barres.', 'right'),
        s(['input[name="barcode"]', '#barcode'], 'Transfert unitaire', 'Scannez un exemplaire pour créer son transfert. Contrôlez immédiatement les messages de Koha, notamment si un autre transfert ou un prêt existe déjà.', 'bottom'),
        s(['#btp-tobranch'], 'Destination — transfert multiple', 'Votre outil local permet de traiter une liste d’exemplaires vers une même destination.', 'right'),
        s(['#btp-barcodes'], 'Liste de codes-barres', 'Collez un code-barres par ligne. Le traitement séquentiel limite la charge serveur tout en automatisant le flux.', 'bottom'),
        s(['#btp-skiploan'], 'Ignorer les exemplaires en prêt', 'Lorsque cette option est active, un exemplaire actuellement prêté n’est pas forcé dans un transfert incohérent.', 'right'),
        s(['#btp-skiptransfer'], 'Ignorer les transferts existants', 'Évite d’écraser ou de dupliquer un transfert déjà actif.', 'right'),
        s(['#btp-skipnfl'], 'Ignorer certains statuts', 'Permet d’écarter les exemplaires dont le statut rend le transfert inadapté selon votre workflow.', 'right'),
        s(['#btp-start'], 'Démarrer le lot', 'Lance le traitement de la liste. Surveillez la progression et laissez le script terminer proprement.', 'top'),
        s(['#btp-progress'], 'Progression', 'Indique l’état du traitement. Les codes ignorés ou en erreur restent identifiables pour contrôle ultérieur.', 'top'),
        s(['#btp-summary', '#btp-log'], 'Bilan détaillé', 'Le récapitulatif distingue réussites, ignorés et erreurs. Copiez les listes problématiques avant de quitter la page si un contrôle complémentaire est nécessaire.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/circ\/waitingreserves\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Réservations en attente de retrait', 'Cette page suit les documents déjà mis de côté pour les adhérents. Le travail consiste surtout à contrôler délais, communication et rangement physique.', 'bottom'),
        s(['.nav-tabs', '#holdswaiting'], 'Catégories de réservations', 'Koha peut distinguer les réservations en attente, arrivant à expiration ou dépassées. Utilisez les onglets pour prioriser le traitement.', 'bottom'),
        s(['table.dataTable', '#holdst'], 'Liste des réservations', 'Chaque ligne doit être lue comme un couple adhérent/document/site de retrait. Vérifiez la date limite avant tout retrait de la zone de réservations.', 'top'),
        s(['td[data-order]', '.expirationdate'], 'Dates de retrait', 'Votre script local améliore la lecture des dates. Les documents arrivant à échéance doivent être traités conformément à la procédure réseau.', 'top'),
        s(['.patron_phone'], 'Contact adhérent', 'Le téléphone peut être affiché directement pour faciliter une relance lorsque la procédure locale le prévoit.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/circ\/view_holdsqueue\.pl$/)) {
      st = [
        s(['main h1','h1'], 'File des réservations à traiter', 'Cette file indique les exemplaires à prélever pour satisfaire les réservations. Elle doit être utilisée avec le statut réel du document en rayon et les règles de transfert.', 'bottom'),
        s(['form', '.page-section'], 'Filtres de la file', 'Limitez la file au site ou aux critères utiles avant d’imprimer ou de préparer les documents.', 'bottom'),
        s(['table.dataTable', '#holdst'], 'Documents à prélever', 'Chaque ligne associe une réservation à un exemplaire ou à une notice selon le calcul Koha. Contrôlez cote, localisation, bibliothèque et destination.', 'top'),
        s(['a[href*="detail.pl"]'], 'Notice', 'Ouvrez la notice si l’identification du document est ambiguë ou si plusieurs exemplaires peuvent répondre à la réservation.', 'top'),
        s(['a[href*="moredetail.pl"]'], 'Exemplaire', 'Ouvrez l’exemplaire pour vérifier les données de gestion lorsque le document n’est pas trouvé à l’emplacement attendu.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/circ\/pendingreserves\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Réservations à traiter', 'Vue de suivi des réservations nécessitant encore une mise de côté ou une action réseau.', 'bottom'),
        s(['form', '.page-section'], 'Critères de calcul', 'Les paramètres de la page déterminent le périmètre présenté. Vérifiez dates et sites avant d’interpréter la liste.', 'bottom'),
        s(['table.dataTable'], 'Réservations', 'Lisez ensemble priorité, adhérent, notice, disponibilité et site. La présence d’un exemplaire disponible ne signifie pas toujours qu’il est immédiatement mobilisable.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/circ\/(transferstoreceive|transfers_to_send)\.pl$/)) {
      const receive = /transferstoreceive/.test(ctx.path);
      st = [
        s(['main h1','h1'], receive ? 'Transferts à recevoir' : 'Transferts à envoyer', receive ? 'Contrôlez les exemplaires annoncés comme arrivant sur votre site.' : 'Contrôlez les exemplaires qui doivent quitter votre site dans le cadre des navettes.', 'bottom'),
        s(['table.dataTable', 'main table'], 'Liste des transferts', 'Chaque ligne correspond à un mouvement attendu. Utilisez le code-barres et la destination comme références opérationnelles.', 'top'),
        s(['a[href*="moredetail.pl"]'], 'Fiche exemplaire', 'Ouvre les données complètes de l’exemplaire en cas d’écart entre la liste et la situation physique.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       RESERVATION D'UNE NOTICE
       ========================================================= */
    if (p(ctx, /\/reserve\/request\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Créer une réservation', 'Cette page associe un adhérent à une notice ou à un exemplaire et définit le lieu de retrait.', 'bottom'),
        s(['#patron', 'input[name="findborrower"]', '.patroninfo'], 'Adhérent', 'Vérifiez l’identité de l’adhérent avant de créer la réservation. Une homonymie ou un mauvais numéro de carte produit une réservation valide… mais pour la mauvaise personne.', 'bottom'),
        s(['#requestany', 'input[value="Any"]'], 'Prochain exemplaire disponible', 'Réservation au niveau de la notice : Koha choisira un exemplaire compatible selon les règles et disponibilités.', 'right'),
        s(['#pickup-next-avail', 'select[name="pickup"]'], 'Site de retrait', 'Choisissez le site où l’adhérent souhaite récupérer le document. Ce choix influence les transferts et la logistique réseau.', 'right'),
        s(['input[name="request"]:not([value="Any"])', '.request_specific'], 'Exemplaire spécifique', 'À utiliser uniquement lorsque le besoin porte réellement sur un exemplaire précis. Une réservation spécifique réduit les possibilités de satisfaction.', 'top'),
        s(['#holds', '#hold-request-form', 'form[action*="request.pl"]'], 'Validation de la réservation', 'Avant validation, contrôlez les réservations déjà présentes sur la notice et le compte afin d’éviter les doublons ou demandes incohérentes.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ADHERENTS — ACCUEIL / RECHERCHE
       ========================================================= */
    if (p(ctx, /\/members\/members-home\.pl$/) || p(ctx, /\/members\/member\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Recherche adhérents', 'Retrouvez une fiche usager avant une opération de circulation, une correction de compte ou un contrôle administratif.', 'bottom'),
        s(['#patron_search', 'form[action*="member.pl"]', 'input[name="searchmember"]'], 'Recherche', 'Recherchez par nom, numéro de carte ou autre identifiant disponible. En cas d’homonymie, vérifiez date de naissance, adresse ou site d’inscription avant d’ouvrir le dossier.', 'bottom'),
        s(['select[name="searchfield"]'], 'Champ recherché', 'Un champ précis réduit les résultats parasites. Utilisez le numéro de carte lorsqu’il est disponible.', 'right'),
        s(['table.dataTable', '#memberresultst'], 'Résultats', 'Comparez les données d’identification avant de sélectionner l’adhérent. Ne vous fiez pas uniquement au nom.', 'top'),
        s(['a[href*="moremember.pl"]'], 'Ouvrir la fiche', 'Accède au compte complet de l’adhérent : prêts, réservations, messages, coordonnées et historique selon vos droits.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ADHERENT — FICHE
       ========================================================= */
    if (p(ctx, /\/members\/moremember\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Fiche adhérent', 'Cette page synthétise l’identité, la situation administrative et l’activité de l’adhérent.', 'bottom'),
        s(['.patroninfo'], 'Coordonnées et identité', 'Contrôlez les coordonnées utiles, la catégorie et le site d’inscription. Votre interface ajoute plusieurs aides visuelles et raccourcis de copie.', 'right'),
        s(['#verification-coordonnees'], 'Contrôle des coordonnées', 'Validez les informations de contact selon votre procédure interne afin de fiabiliser les relances et communications.', 'right'),
        s(['#patron_messages', '.alert'], 'Alertes et messages', 'Les messages peuvent être informatifs ou bloquants. Lisez leur nature avant une dérogation ou une modification du compte.', 'bottom'),
        s(['#issues-table'], 'Prêts en cours', 'Liste des exemplaires actuellement empruntés avec échéances et possibilités de renouvellement.', 'top'),
        s(['#holds-table'], 'Réservations', 'Suivez les réservations, leur statut, site de retrait et progression. Votre installation ajoute l’estimation liée aux navettes lorsque pertinente.', 'top'),
        s(['a[href*="memberentry.pl"]'], 'Modifier l’adhérent', 'Ouvre le formulaire complet d’édition. Réservez cette action aux corrections réellement nécessaires et vérifiez les champs obligatoires.', 'top'),
        s(['a[href*="readingrec.pl"]'], 'Historique de prêt', 'Accède à l’historique de circulation du lecteur, enrichi chez vous d’une timeline et du lieu de retour.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ADHERENT — CREATION / MODIFICATION
       ========================================================= */
    if (p(ctx, /\/members\/memberentry\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Créer ou modifier un adhérent', 'Ce formulaire alimente les données d’identité, de contact, d’inscription et de circulation. Une donnée mal saisie peut ensuite impacter les avis, statistiques et recherches.', 'bottom'),
        s(['#surname'], 'Nom', 'Saisissez le nom conformément aux règles de saisie du réseau. Évitez les variantes inutiles qui compliquent les recherches et doublons.', 'right'),
        s(['#firstname'], 'Prénom', 'Le prénom complète l’identification et permet de distinguer les homonymes.', 'right'),
        s(['#dateofbirth'], 'Date de naissance', 'Donnée utile pour l’identification, les catégories et certaines statistiques. Contrôlez particulièrement le jour et l’année.', 'right'),
        s(['#address', '#address2'], 'Adresse', 'Commencez à saisir l’adresse : votre autocomplétion locale aide à normaliser les voies et limite les variations de forme.', 'right'),
        s(['#zipcode'], 'Code postal', 'Le code postal participe au contrôle territorial et à la cohérence avec la commune.', 'right'),
        s(['#city'], 'Commune', 'Vérifiez la commune proposée après autocomplétion. Évitez les variantes libres lorsque l’adresse peut être normalisée.', 'right'),
        s(['#phone'], 'Téléphone', 'Saisissez un numéro exploitable pour les relances ou réservations selon votre politique de contact.', 'right'),
        s(['#email'], 'Courriel', 'Adresse utilisée pour les notifications lorsque le canal e-mail est activé.', 'right'),
        s(['#cardnumber'], 'Numéro de carte', 'Identifiant principal de circulation. Votre script peut utiliser ses derniers chiffres pour préremplir certains champs selon vos règles locales.', 'right'),
        s(['#categorycode_entry', '#categorycode'], 'Catégorie', 'La catégorie détermine des droits et règles de circulation. Vérifiez qu’elle correspond bien au profil réel de l’adhérent.', 'right'),
        s(['#branchcode'], 'Bibliothèque d’inscription', 'Le site d’inscription est une donnée structurante pour le réseau et les statistiques.', 'right'),
        s(['#dateexpiry'], 'Date d’expiration', 'Vérifiez la durée d’inscription et les éventuelles règles de renouvellement du compte.', 'right'),
        s(['#messaging_prefs'], 'Préférences de messagerie', 'Déterminez les canaux et avis envoyés à l’adhérent. Une adresse ou un numéro absent rend le canal correspondant inopérant.', 'top'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Enregistrer', 'Relisez les champs essentiels avant validation : identité, carte, catégorie, site, coordonnées et expiration.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       HISTORIQUE DE PRET LECTEUR
       ========================================================= */
    if (p(ctx, /\/members\/readingrec\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Historique de prêt de l’adhérent', 'Cet écran présente les circulations passées. Il doit être utilisé dans le respect des règles de confidentialité et uniquement pour un besoin professionnel légitime.', 'bottom'),
        s(['#table_readingrec', 'table.dataTable'], 'Historique tabulaire', 'Chaque ligne correspond à une circulation. Votre affichage met en évidence certaines situations et ajoute le lieu de retour lorsqu’il peut être retrouvé.', 'top'),
        s(['.timeline-container-wrapper', '#krt-reader-timeline'], 'Timeline', 'La timeline permet une lecture chronologique globale. Le zoom « Tout » adapte la période aux données réellement trouvées.', 'top'),
        s(['input[placeholder*="titre" i]', 'input[placeholder*="code" i]', '.krt-filter input'], 'Filtrer l’historique', 'Filtrez par titre ou code-barres pour isoler un document ou une série de prêts sans perdre le contexte chronologique.', 'bottom'),
        s(['.koha-return-library'], 'Lieu de retour', 'Cette information indique le site où le retour a été enregistré lorsqu’il peut être déterminé à partir des données disponibles.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       HISTORIQUE DE PRET NOTICE
       ========================================================= */
    if (p(ctx, /\/catalogue\/issuehistory\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Historique de prêt de la notice', 'Cet écran rassemble les circulations des exemplaires rattachés à une notice bibliographique.', 'bottom'),
        s(['#table_issues', 'table.dataTable'], 'Historique tabulaire', 'Chaque ligne représente un prêt d’exemplaire. Le tableau reste la source précise pour code-barres, dates et lieux.', 'top'),
        s(['#krt-biblio-timeline', '.timeline-container-wrapper'], 'Timeline de circulation', 'Votre timeline visualise les prêts dans le temps et peut être préfiltrée depuis un exemplaire de la page détail ou des résultats de recherche.', 'top'),
        s(['input[placeholder*="titre" i]', 'input[placeholder*="code" i]', '.krt-filter input'], 'Filtre titre / code-barres', 'Utilisez le code-barres pour suivre un exemplaire précis ou le titre pour limiter l’affichage lorsque plusieurs expressions sont présentes.', 'bottom'),
        s(['.koha-return-library'], 'Lieu de retour', 'Le site de retour complète le lieu de prêt et aide à comprendre les mouvements réels dans le réseau.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       DETAIL EXEMPLAIRE
       ========================================================= */
    if (p(ctx, /\/catalogue\/moredetail\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Détail des exemplaires', 'Cette page expose les données techniques complètes des exemplaires rattachés à une notice.', 'bottom'),
        s(['.page-section', '#catalogue_detail_biblio'], 'Notice de rattachement', 'Repère bibliographique de l’exemplaire. Vérifiez toujours que vous travaillez sur la bonne notice avant une modification.', 'bottom'),
        s(['table', '.listgroup'], 'Données d’exemplaire', 'Retrouvez ici les informations de gestion : bibliothèques, localisation, cote, collection, statut, dates, prix, notes et identifiants.', 'top'),
        s(['a[href*="additem.pl"]'], 'Modifier', 'Ouvre l’éditeur de l’exemplaire correspondant.', 'top'),
        s(['a[href*="issuehistory.pl"]'], 'Historique', 'Permet de revenir à l’historique de circulation de la notice et de suivre l’activité du document.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       RECHERCHE D'EXEMPLAIRES
       ========================================================= */
    if (p(ctx, /\/catalogue\/itemsearch\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Recherche d’exemplaires', 'Utilisez cet écran lorsque la question porte sur une <strong>copie physique</strong> : code-barres, cote, site, localisation, statut, collection ou autre donnée locale.', 'bottom', 'Recherche catalogue = « quel document ? » ; recherche d’exemplaires = « quelle copie et où est-elle ? ». Les deux écrans sont complémentaires.'),
        s(['#itemsearchform', 'form[action*="itemsearch.pl"]'], 'Construire l’entonnoir', 'Commencez par le critère le plus structurant : site ou localisation pour un travail de rayon, code-barres pour une copie précise, cote pour un segment de collection.', 'bottom'),
        s(['input[name*="barcode"]', 'input[id*="barcode"]'], 'Code-barres', 'C’est le critère le plus précis pour retrouver une copie unique. À privilégier lorsqu’un document physique est déjà en main ou signalé.', 'right'),
        s(['select[name*="homebranch"]', 'select[id*="homebranch"]'], 'Bibliothèque de rattachement', 'Filtre sur l’appartenance administrative de l’exemplaire. Utile pour les collections d’un site, mais pas toujours pour savoir où se trouve la copie aujourd’hui.', 'right'),
        s(['select[name*="holdingbranch"]', 'select[id*="holdingbranch"]'], 'Bibliothèque actuelle', 'Filtre sur la localisation opérationnelle connue par Koha. Pour chercher physiquement un document, cette donnée est souvent la plus pertinente.', 'right'),
        s(['select[name*="location"]', 'select[id*="location"]'], 'Localisation', 'Réduit la recherche à un espace interne : Romans, Jeunesse, DVD, Réserve… Elle situe le secteur avant la cote.', 'right'),
        s(['input[name*="itemcallnumber"]', 'input[id*="itemcallnumber"]'], 'Cote', 'Utilisez la cote pour cibler un rayon, une classe ou une tranche de collection. Une cote seule peut exister dans plusieurs sites : combinez-la au site si nécessaire.', 'right'),
        s(['#item_search', 'table.dataTable'], 'Résultats exemplaires', 'Chaque ligne correspond à un exemplaire. Plusieurs lignes peuvent donc renvoyer à la même notice bibliographique.', 'top'),
        s(['th[data-colname="holdingbranch"]', '[data-label="holdingbranch"]'], 'Lire le site actuel', 'Commencez la lecture physique par la bibliothèque actuelle : elle indique où Koha situe la copie.', 'top'),
        s(['th[data-colname="location"]', '[data-label="location"]'], 'Puis la localisation', 'La localisation vous amène dans le bon espace ou secteur de la médiathèque.', 'top'),
        s(['th[data-colname="itemcallnumber"]', '[data-label="itemcallnumber"]'], 'Puis la cote', 'La cote permet de trouver le rayon et la place théorique. Elle doit être lue avec les conventions locales de classement.', 'top'),
        s(['th[data-colname="status"]', '[data-label="status"]'], 'Contrôler le statut', 'Avant de chercher longtemps en rayon, vérifiez que l’exemplaire est disponible et qu’aucun prêt, transfert ou statut particulier n’explique son absence.', 'top'),
        s(['th[data-colname="barcode"]', '[data-label="barcode"]'], 'Confirmer par le code-barres', 'Le code-barres confirme que la copie trouvée est bien celle attendue et permet ensuite prêt, retour, transfert, inventaire ou traitement par lot.', 'top'),
        s(['a[href*="detail.pl?biblionumber="]'], 'Revenir à la notice', 'Ouvrez la notice lorsque vous devez comprendre l’édition, l’auteur, la collection, l’indexation ou comparer plusieurs exemplaires rattachés au même document.', 'top'),
        s(['.btn-copy-biblionumbers'], 'Copier les numéros de notice', 'Votre outil local extrait les biblionumber présents dans les résultats pour les réutiliser dans un rapport ou un autre traitement.', 'bottom'),
        s(['#clear_all'], 'Réinitialiser', 'Effacez les critères quand vous changez complètement de question afin de ne pas conserver une limite oubliée.', 'bottom')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       CATALOGAGE NOTICE
       ========================================================= */
    if (p(ctx, /\/cataloguing\/addbiblio\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Éditeur de notice MARC', 'Vous modifiez ici la notice bibliographique structurée. Une saisie correcte garantit la recherche, l’affichage, les liens d’autorité et la qualité globale du catalogue.', 'bottom'),
        s(['#frameworkcode', 'select[name="frameworkcode"]'], 'Grille de catalogage', 'La grille détermine les zones, sous-zones, contraintes et comportements de saisie. Ne changez pas de grille sans comprendre l’impact sur la notice.', 'right'),
        s(['#tabs', '.nav-tabs'], 'Onglets MARC', 'Les zones sont réparties par blocs. Utilisez les onglets pour naviguer sans perdre les modifications en cours.', 'bottom'),
        s(['#tab0XX-tab'], 'Bloc 0XX', 'Identifiants et données codées selon votre grille UNIMARC : contrôlez notamment les identifiants normalisés et zones techniques nécessaires.', 'bottom'),
        s(['#tab2XX-tab'], 'Bloc 2XX', 'Titre, mention de responsabilité, édition et publication constituent le cœur de la description bibliographique.', 'bottom'),
        s(['#tab6XX-tab'], 'Bloc 6XX', 'Indexation matière, genre et accès thématiques. Vos scripts ajoutent des listes et suggestions pour normaliser plusieurs champs 6XX.', 'bottom'),
        s(['#tab7XX-tab'], 'Bloc 7XX', 'Accès auteurs et collectivités. Lorsque les autorités sont actives, privilégiez les liens contrôlés plutôt que des formes libres redondantes.', 'bottom'),
        s(['select.select2-hidden-accessible', '.select2-container'], 'Aides d’indexation', 'Vos enrichissements proposent des sélections structurées pour certains champs 6XX. Utilisez-les pour maintenir des valeurs homogènes dans le catalogue.', 'top'),
        s(['input[name*="tag_610"]', 'label.labelsubfield'], 'Indexation locale', 'Les champs locaux d’indexation doivent rester cohérents avec l’arborescence et les pratiques du réseau. Évitez les variantes lexicales inutiles.', 'top'),
        s(['#toolbar', '.btn-toolbar'], 'Enregistrer / actions', 'Avant sauvegarde, contrôlez au minimum titre, responsabilités, édition, indexation principale, liens d’autorité et données locales nécessaires au traitement des exemplaires.', 'bottom'),
        s(['button[type="submit"]', '#save'], 'Sauvegarder', 'Enregistrez lorsque le contrôle bibliographique est terminé. Si vous êtes en correction, évitez de modifier simultanément des zones sans rapport avec l’erreur traitée.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       CATALOGAGE EXEMPLAIRE
       ========================================================= */
    if (p(ctx, /\/cataloguing\/additem\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Gestion des exemplaires', 'Créez ou modifiez ici les données propres à chaque exemplaire. Ces valeurs pilotent la circulation, la localisation et une grande partie des statistiques de collection.', 'bottom'),
        s(['#edititem', '#additem'], 'Formulaire exemplaire', 'Le formulaire MARC d’exemplaire contient les champs de gestion. Vérifiez la notice de rattachement avant toute création.', 'bottom'),
        s(['#koha_items_assistant', '#koha_items_helper', '[id^="koha_items_"]'], 'Assistant exemplaires', 'Votre assistant local facilite la saisie homogène, l’application de valeurs mémorisées et certains traitements récurrents.', 'left'),
        s(['#koha_items_current_list'], 'Liste / contexte de l’assistant', 'Indique le contexte ou la mémorisation actuellement active dans l’assistant.', 'left'),
        s(['#koha_items_preset_controls'], 'Mémorisations', 'Enregistrez et réappliquez des ensembles de valeurs fréquentes. C’est utile pour limiter les écarts de saisie entre exemplaires d’un même type.', 'left'),
        s(['input[name*="barcode"]', 'label[for*="barcode"]'], 'Code-barres', 'Identifiant unique de circulation. Vérifiez qu’il correspond physiquement à l’étiquette du document.', 'right'),
        s(['select[name*="homebranch"]', 'label[for*="homebranch"]'], 'Bibliothèque de rattachement', 'Site propriétaire de l’exemplaire. Cette donnée ne doit pas être confondue avec la bibliothèque actuelle.', 'right'),
        s(['select[name*="holdingbranch"]', 'label[for*="holdingbranch"]'], 'Bibliothèque actuelle', 'Site dans lequel l’exemplaire est actuellement rattaché opérationnellement hors transfert.', 'right'),
        s(['input[name*="itemcallnumber"]', 'label[for*="itemcallnumber"]'], 'Cote', 'La cote doit être cohérente avec le plan de classement local et l’emplacement physique.', 'right'),
        s(['select[name*="location"]', 'label[for*="location"]'], 'Localisation', 'Décrit l’espace ou rayon de rangement. Une mauvaise localisation dégrade immédiatement la trouvabilité en rayon.', 'right'),
        s(['select[name*="itype"]', 'label[for*="itype"]'], 'Type de document', 'Le type d’exemplaire peut intervenir dans les règles de circulation et les statistiques. Vérifiez sa cohérence avec le document.', 'right'),
        s(['#itemst', 'table.dataTable'], 'Exemplaires existants', 'Le tableau permet de comparer la nouvelle saisie avec les exemplaires déjà présents sur la notice.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       Z39.50 / SRU
       ========================================================= */
    if (p(ctx, /\/cataloguing\/z3950_search\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Recherche Z39.50 / SRU', 'Interrogez des catalogues externes pour récupérer une notice. La notice importée doit toujours être relue et adaptée aux pratiques locales avant validation.', 'bottom'),
        s(['#z3950_search_targets', 'fieldset.rows'], 'Serveurs interrogés', 'Sélectionnez les sources pertinentes. Multiplier les serveurs peut augmenter le bruit et le temps de réponse.', 'bottom'),
        s(['input[name="isbn"]', 'input[name="title"]', 'input[type="text"]'], 'Critères externes', 'Un ISBN/EAN exact est souvent le meilleur point d’entrée. À défaut, combinez titre et auteur pour limiter les faux positifs.', 'bottom'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Lancer la recherche', 'Interroge les serveurs sélectionnés.', 'right'),
        s(['table.dataTable', '#resultst'], 'Résultats externes', 'Comparez édition, date, éditeur, pagination et identifiants avant de choisir une notice. Deux titres proches ne sont pas nécessairement la même manifestation.', 'top'),
        s(['a.previewMARC', 'a[href*="showmarc"]'], 'Prévisualiser le MARC', 'Contrôlez la structure MARC avant import, notamment si la source utilise des pratiques différentes de votre réseau.', 'top'),
        s(['a.import_record', 'button.import_record'], 'Importer', 'Récupère la notice dans l’éditeur Koha. Le travail n’est pas terminé : relisez et normalisez les zones avant sauvegarde.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       IMPORT MARC — GESTION DES LOTS
       ========================================================= */
    if (p(ctx, /\/tools\/manage-marc-import\.pl$/)) {
      const detail = !!k.firstVisible(['#staged-record-matching-rules']);
      st = [
        s(['main h1','h1'], 'Gérer les notices mises en réservoir', 'Deuxième phase de l’import MARC : contrôlez le lot préparé, les correspondances et les règles avant l’import effectif dans le catalogue.', 'bottom')
      ];

      if (!detail) {
        st.push(
          s(['main table.dataTable', '.page-section table'], 'Liste des lots', 'Chaque ligne correspond à un fichier mis en réservoir. Le statut indique s’il est seulement préparé, importé, annulé ou nettoyé.', 'top'),
          s(['a[href*="import_batch_id="]'], 'Ouvrir un lot', 'Cliquez sur le nom du fichier pour examiner ses paramètres, ses correspondances et ses notices avant import.', 'top'),
          s(['td.actions', '.batch_clean'], 'Nettoyer un lot', 'Le nettoyage retire les données de travail devenues inutiles selon l’état du lot. Ne l’utilisez pas tant qu’un contrôle ou une annulation peut encore être nécessaire.', 'left'),
          s(['.batch_delete'], 'Supprimer un lot nettoyé', 'Supprime définitivement le lot de la zone de staging lorsqu’il n’a plus d’utilité.', 'left', null, 'Cette opération concerne le lot de staging ; contrôlez son statut avant suppression.')
        );
        return compact(st.concat(commonEnd()));
      }

      st.push(
        s(['#staged-record-matching-rules'], 'Étape 1 — résumé du lot', 'Contrôlez le nom du fichier, le profil, le commentaire, le type, la date de mise en réservoir et surtout le <strong>statut</strong>. Ce résumé doit correspondre au fichier que vous avez l’intention d’importer.', 'bottom'),
        s(['#new_matcher_id'], 'Règle de concordance appliquée', 'Vous pouvez recalculer les correspondances avec une autre règle avant import. Cela permet de corriger un mauvais choix fait lors de la mise en réservoir.', 'right', 'Après modification, examinez de nouveau le nombre et la nature des notices correspondantes.'),
        s(['#overlay_action'], 'Action sur les correspondances', 'Définit ce que Koha fera des notices pour lesquelles une correspondance existe déjà dans le catalogue.', 'right', null, 'Un remplacement peut modifier une notice utilisée par plusieurs exemplaires : contrôlez les différences avant import.'),
        s(['#nomatch_action'], 'Action sans correspondance', 'Définit le traitement des notices nouvelles : création ou ignorance selon votre stratégie.', 'right'),
        s(['#item_action'], 'Traitement des exemplaires', 'Rappelle ou modifie la stratégie appliquée aux exemplaires intégrés dans le fichier bibliographique.', 'right'),
        s(['input[value*="Apply different matching rules"]', 'form input.btn-secondary[type="submit"]'], 'Recalculer les correspondances', 'Applique les nouvelles règles au lot. Cette action ne l’importe pas encore dans le catalogue.', 'top'),
        s(['#records-table'], 'Étape 2 — notices du lot', 'Examinez les notices préparées et leur statut de correspondance. Sur un lot important, contrôlez au minimum un échantillon des correspondances et toutes les situations atypiques.', 'top'),
        s(['#records-table th[data-colname="overlay_status"]'], 'Type de correspondance', 'Indique si une notice entrante a été rapprochée d’une notice existante et selon quel résultat.', 'top'),
        s(['#records-table th[data-colname="match_details"]'], 'Détails de correspondance', 'Permet d’identifier la notice candidate retenue. Un score élevé n’exonère pas d’un contrôle documentaire lorsque le remplacement est sensible.', 'top'),
        s(['#records-table th[data-colname="match_score_breakdown"]'], 'Score de concordance', 'Décompose le score produit par la règle. Utile pour comprendre pourquoi une notice a été considérée comme correspondante.', 'top'),
        s(['#records-table th[data-colname="diff"]'], 'Différences MARC', 'Ouvrez la comparaison pour visualiser précisément ce que le fichier entrant ajoutera, supprimera ou modifiera par rapport à la notice existante.', 'top'),
        s(['#frameworks'], 'Étape 3 — grille des nouvelles notices', 'Choisissez la grille MARC à utiliser pour les notices créées sans correspondance. La grille par défaut convient seulement si c’est bien celle attendue dans votre workflow.', 'right'),
        s(['#overlay_frameworks'], 'Grille des notices remplacées', 'Pour les remplacements, vous pouvez conserver la grille originale ou en imposer une autre. Conserver la grille d’origine évite souvent des changements de structure non souhaités.', 'right'),
        s(['#import_batch_form'], 'Étape 4 — import dans le catalogue', 'Vous êtes à l’étape décisive : ce formulaire va créer ou modifier réellement les notices et éventuellement les exemplaires selon les règles du lot.', 'top', 'Avant validation, contrôlez au moins : règle de concordance, actions match/no-match, exemplaires, grilles et un échantillon des différences.'),
        s(['#import_batch_form input[name="mainformsubmit"]'], 'Importer le lot', 'Lance l’import effectif dans le catalogue. Après traitement, vérifiez le statut du lot et contrôlez quelques notices dans le catalogue.', 'top', null, 'Ne cliquez pas plusieurs fois si le traitement est en cours : attendez le résultat du job.'),
        s(['#revert_batch_form'], 'Annuler un import', 'Si le lot a déjà été importé et que Koha autorise l’annulation, cette action permet de revenir sur l’import du lot.', 'top', 'Utilisez-la avec prudence, surtout si les notices ou exemplaires ont été modifiés manuellement depuis l’import.'),
        s(['#marcPreview'], 'Prévisualisation MARC', 'La modale permet d’examiner une notice du lot sans quitter l’écran de gestion.', 'top')
      );
      return compact(st.concat(commonEnd()));
    }

    if (p(ctx, /\/tools\/showdiffmarc\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Comparer deux notices MARC', 'Cette vue compare la notice actuellement dans le catalogue avec la notice entrante du lot. C’est l’un des contrôles les plus importants avant un remplacement.', 'bottom'),
        s(['#col1'], 'Notice originale', 'À gauche : état actuel de la notice du catalogue. Les éléments supprimés ou modifiés sont mis en évidence par le comparateur.', 'right'),
        s(['#col2'], 'Notice importée', 'À droite : notice entrante après les traitements appliqués au lot. Repérez les zones ajoutées, supprimées ou modifiées.', 'left'),
        s(['#col1 pre', '#col2 pre'], 'Lecture des différences', 'Ne vous limitez pas au titre : vérifiez responsabilités, édition, identifiants, indexation, zones locales et liens d’autorité qui pourraient être écrasés.', 'top', 'Pour une notice déjà enrichie localement, un remplacement fournisseur peut supprimer des zones utiles si la stratégie n’est pas préparée.'),
        s(['a[href*="manage-marc-import.pl?import_batch_id="]'], 'Retour au lot', 'Revenez au lot pour poursuivre le contrôle ou modifier la règle avant import.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       MODIFICATION D'EXEMPLAIRES PAR LOT
       ========================================================= */
    if (p(ctx, /\/tools\/batchMod\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Modification d’exemplaires par lot', 'Cet outil applique une même correction à plusieurs exemplaires. Il est très puissant : travaillez sur une liste contrôlée et ne renseignez que les champs à modifier.', 'bottom'),
        s(['#barcodelist'], 'Liste d’exemplaires', 'Collez les codes-barres, généralement un par ligne. Votre compteur de lignes permet de vérifier le volume attendu avant de poursuivre.', 'bottom'),
        s(['input[name="itemnumber"]', 'textarea[name="itemnumber"]'], 'Numéros d’exemplaire', 'Selon le point d’entrée, Koha peut recevoir directement des itemnumber. Vérifiez toujours que le nombre d’éléments correspond à votre sélection.', 'bottom'),
        s(['fieldset.rows'], 'Champs à modifier', 'Chaque champ possède un mécanisme d’activation/désactivation. Un champ laissé actif avec une valeur vide peut avoir un effet différent d’un champ explicitement ignoré.', 'top'),
        s(['input[name="disable_input"]'], 'Activer un champ', 'Votre script vous alerte lorsque la sélection d’un champ et sa valeur sont incohérentes. L’objectif est d’éviter un effacement accidentel.', 'right'),
        s(['#koha_items_assistant', '[id^="koha_items_"]'], 'Assistant exemplaires', 'Votre assistant local peut appliquer des valeurs mémorisées et faciliter les modifications répétitives de site, localisation, type ou autres champs.', 'left'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Valider le lot', 'Relisez la liste et chaque champ activé avant validation. Sur un gros lot, un contrôle par échantillon après traitement est recommandé.', 'top', null, 'Une modification par lot peut corriger rapidement des centaines d’exemplaires, mais une mauvaise valeur se propage tout aussi rapidement.')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       MODIFICATION / SUPPRESSION DE NOTICES PAR LOT
       ========================================================= */
    if (p(ctx, /\/tools\/batch_record_modification\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Modification de notices par lot', 'Applique un modèle de transformation MARC à plusieurs notices bibliographiques ou d’autorité.', 'bottom'),
        s(['textarea', 'input[name="record_id"]'], 'Liste des notices', 'Contrôlez la nature des identifiants transmis et le nombre de notices avant traitement.', 'bottom'),
        s(['select[name="recordtype"]'], 'Type de notices', 'Bibliographiques et autorités ne doivent pas être mélangées. Le modèle MARC doit correspondre au type de données traité.', 'right'),
        s(['select[name*="template"]'], 'Modèle de transformation', 'Choisissez le modèle qui effectue exactement les modifications attendues. Vérifiez ses actions avant de l’appliquer en masse.', 'right'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Lancer la modification', 'Validez uniquement après contrôle du périmètre et du modèle. Vérifiez ensuite un échantillon de notices modifiées.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/tools\/batch_delete_records\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Suppression de notices par lot', 'Outil destructif destiné à supprimer un ensemble identifié de notices bibliographiques ou d’autorité.', 'bottom'),
        s(['textarea', 'form'], 'Périmètre', 'Vérifiez deux fois la liste des identifiants et le type de notices avant toute suppression.', 'bottom'),
        s(['table.dataTable'], 'Contrôle préalable', 'Koha indique les notices pouvant ou non être supprimées. Examinez les blocages : exemplaires, dépendances ou autres liens.', 'top'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Supprimer', 'Ne validez qu’après contrôle du volume et de l’échantillon affiché.', 'top', null, 'Une suppression n’est pas une opération de nettoyage visuel : elle retire les données du catalogue et peut avoir des conséquences irréversibles selon les sauvegardes disponibles.')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       JOURNAUX
       ========================================================= */
    if (p(ctx, /\/tools\/viewlog\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Journaux Koha', 'Les logs permettent d’identifier qui a effectué une action et quand, selon les modules journalisés par Koha.', 'bottom'),
        s(['form', '.page-section'], 'Filtres de journal', 'Réduisez la période, le module, l’utilisateur ou l’objet recherché avant de lancer une recherche volumineuse.', 'bottom'),
        s(['table.dataTable'], 'Résultats du journal', 'Chaque ligne correspond à une action enregistrée. Utilisez l’horodatage, l’utilisateur et l’objet pour reconstruire le contexte.', 'top'),
        s(['.koha-log', '#koha-log'], 'Enrichissement local', 'Votre script de journal améliore la lecture et le filtrage de certaines opérations pour faciliter le diagnostic.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       SUGGESTIONS D'ACHAT
       ========================================================= */
    if (p(ctx, /\/suggestion\/suggestion\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Suggestions d’achat', 'Suivez les demandes d’acquisition, leur statut, le demandeur et les décisions prises.', 'bottom'),
        s(['form', '.filters'], 'Filtres', 'Filtrez par statut, site, date, demandeur ou responsable pour isoler le travail à traiter.', 'bottom'),
        s(['table.dataTable'], 'Liste des suggestions', 'Chaque ligne représente une proposition d’achat. Vérifiez titre, auteur, demandeur, site et statut avant décision.', 'top'),
        s(['a[href*="op=edit"]', 'button.edit'], 'Modifier une suggestion', 'Ouvre la fiche complète pour compléter les données, lier le demandeur, modifier le statut ou ajouter une réponse.', 'top'),
        s(['select[name*="STATUS"]', '#STATUS'], 'Statut', 'Le statut doit refléter la décision réelle : en attente, acceptée, commandée, disponible, rejetée… selon votre paramétrage.', 'right'),
        s(['input[name*="borrower"]', 'select[name*="borrower"]'], 'Lien avec l’adhérent', 'Une suggestion faite depuis une carte lecteur doit rester correctement liée au demandeur. Votre contrôle local empêche la validation lorsque ce lien manque sur le formulaire concerné.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       PERIODIQUES
       ========================================================= */
    if (p(ctx, /\/serials\/serials-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Périodiques', 'Point d’entrée pour les abonnements, le bulletinage, les réclamations et la recherche de titres suivis.', 'bottom'),
        s(['a[href*="serials-search.pl"]'], 'Rechercher un abonnement', 'Retrouvez un abonnement existant avant de créer un doublon.', 'right'),
        s(['a[href*="subscription-add.pl"]'], 'Nouvel abonnement', 'Crée un abonnement et sa périodicité. La qualité du paramétrage conditionne ensuite les fascicules attendus.', 'right'),
        s(['a[href*="claims.pl"]'], 'Réclamations', 'Suivi des fascicules attendus mais non reçus.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/serials\/serials-search\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Recherche d’abonnements', 'Retrouvez les périodiques suivis par titre, fournisseur, bibliothèque ou autres critères.', 'bottom'),
        s(['form', '#subscription_search'], 'Critères', 'Utilisez un critère suffisamment précis pour retrouver l’abonnement sans confondre des titres proches ou des abonnements multi-sites.', 'bottom'),
        s(['table.dataTable'], 'Abonnements', 'Chaque ligne représente un abonnement. Ouvrez le détail pour vérifier périodicité, fournisseur et réception.', 'top'),
        s(['a[href*="subscription-detail.pl"]'], 'Détail de l’abonnement', 'Accède au calendrier prévisionnel, aux fascicules et aux paramètres de suivi.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/serials\/subscription-detail\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Détail de l’abonnement', 'Vue centrale d’un abonnement de périodique : paramètres, périodicité, fascicules et historique de réception.', 'bottom'),
        s(['#subscription_info', '.subscription-details'], 'Paramètres de l’abonnement', 'Vérifiez fournisseur, bibliothèque, périodicité, dates de début/fin et modèle de numérotation.', 'bottom'),
        s(['table.dataTable', '#serialst'], 'Fascicules', 'Liste les numéros attendus, reçus, manquants ou réclamés. Les statuts doivent rester cohérents avec la situation physique.', 'top'),
        s(['#planning-navette', '.planning-navette'], 'Planning local', 'Votre script ajoute des informations de planning/navette utiles au suivi réseau lorsque la page le permet.', 'top'),
        s(['a[href*="serials-edit.pl"]'], 'Bulletiner / réceptionner', 'Ouvre l’écran de réception des fascicules.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/serials\/serials-edit\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Bulletinage', 'Enregistrez ici la réception réelle d’un ou plusieurs fascicules.', 'bottom'),
        s(['table tbody tr'], 'Fascicule', 'Chaque ligne correspond à un numéro attendu. Vérifiez numéro, date et statut avant validation.', 'top'),
        s(['#exemplaire-button-fill'], 'Remplir les champs exemplaire', 'Votre bouton local préremplit les données d’exemplaire associées au fascicule selon votre workflow.', 'bottom'),
        s(['#exemplaire-button-hs'], 'Ajouter un hors-série', 'Permet de gérer un numéro hors-série distinct du calendrier prévisionnel.', 'bottom'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Enregistrer le bulletinage', 'Validez après contrôle des numéros reçus et des éventuels exemplaires créés.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/serials\/claims\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Réclamations de périodiques', 'Identifiez les fascicules attendus qui nécessitent une relance fournisseur.', 'bottom'),
        s(['form', '.filters'], 'Filtres', 'Limitez par fournisseur, retard ou statut pour produire une liste réellement exploitable.', 'bottom'),
        s(['button'], 'Filtres rapides locaux', 'Votre interface ajoute des boutons pour isoler les retards ou les fascicules déjà réclamés.', 'bottom'),
        s(['table.dataTable'], 'Fascicules à réclamer', 'Contrôlez titre, numéro, date attendue, fournisseur et statut avant envoi d’une réclamation.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       PREFERENCES SYSTEME
       ========================================================= */
    if (p(ctx, /\/admin\/preferences\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Préférences système', 'Ces réglages modifient le comportement global de Koha. Une modification peut impacter tous les sites et tous les agents.', 'bottom'),
        s(['input[name="searchfield"]', '#searchfield'], 'Rechercher une préférence', 'Recherchez par nom exact lorsque vous connaissez la préférence. C’est plus sûr que parcourir de longues catégories.', 'bottom'),
        s(['.prefs-tab', '.nav-tabs'], 'Catégories', 'Les préférences sont regroupées par module. Certaines options dépendent les unes des autres : lisez toujours le texte complet avant modification.', 'bottom'),
        s(['.preference', 'fieldset.rows'], 'Une préférence', 'Repérez le nom technique, la valeur actuelle et la description. Notez la valeur d’origine avant un changement important.', 'top'),
        s(['button[type="submit"]', '.save-all'], 'Enregistrer', 'Sauvegarde les préférences modifiées. Testez ensuite le comportement sur une page réellement concernée.', 'top', null, 'Sur une installation en réseau, évitez les changements exploratoires en production sans savoir quelles fonctions dépendent de la préférence.')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       REGLES DE CIRCULATION
       ========================================================= */
    if (p(ctx, /\/admin\/smart-rules\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Règles de circulation', 'Les règles déterminent les durées de prêt, quotas, renouvellements, réservations et autres comportements selon bibliothèque, catégorie et type de document.', 'bottom'),
        s(['select[name="branch"]', '#branch'], 'Bibliothèque', 'Le niveau de bibliothèque détermine la portée de la règle. Une règle locale peut surcharger une règle générale.', 'right'),
        s(['table.dataTable', '#default-circulation-rules'], 'Matrice de règles', 'Lisez une règle comme une combinaison catégorie adhérent × type de document × bibliothèque. L’ordre de résolution des règles doit être compris avant toute modification.', 'top'),
        s(['select[name="categorycode"]'], 'Catégorie adhérent', 'Les catégories peuvent avoir des droits très différents. Évitez les règles trop générales si des exceptions métier existent.', 'right'),
        s(['select[name="itemtype"]'], 'Type de document', 'Le type d’exemplaire pilote souvent durée, quota et renouvellements.', 'right'),
        s(['button[type="submit"]'], 'Enregistrer la règle', 'Après modification, testez avec un cas réel ou de test correspondant exactement à la combinaison modifiée.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       VALEURS AUTORISEES
       ========================================================= */
    if (p(ctx, /\/admin\/authorised_values\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Valeurs autorisées', 'Ces listes normalisent de nombreux champs : localisation, collection, statuts, motifs et autres codes utilisés dans Koha.', 'bottom'),
        s(['select[name="searchfield"]', '#category'], 'Catégorie de valeurs', 'Choisissez la catégorie correspondant au champ métier à gérer. Une même valeur textuelle peut avoir un sens différent selon la catégorie.', 'right'),
        s(['table.dataTable'], 'Valeurs existantes', 'Contrôlez code, libellé et limitations par bibliothèque avant d’ajouter un doublon.', 'top'),
        s(['a[href*="op=add_form"]', 'button'], 'Ajouter / modifier', 'Le code technique doit rester stable lorsqu’il est déjà utilisé par des exemplaires ou des règles.', 'top', null, 'Renommer un libellé est généralement moins risqué que changer un code déjà référencé dans les données.')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       AUTORITES
       ========================================================= */
    if (p(ctx, /\/authorities\/authorities-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Recherche d’autorités', 'Recherchez les formes contrôlées avant de créer une nouvelle autorité. L’objectif est de limiter les doublons et d’améliorer les liens entre notices et autorités.', 'bottom'),
        s(['form', 'input[type="text"]'], 'Recherche', 'Utilisez le type d’autorité et une forme suffisamment précise. Testez les variantes avant de conclure à l’absence d’autorité.', 'bottom'),
        s(['select[name="authtypecode"]'], 'Type d’autorité', 'Personne, collectivité, nom géographique, titre uniforme, genre/forme… Le type doit correspondre à la zone bibliographique qui sera liée.', 'right'),
        s(['table.dataTable'], 'Résultats', 'Comparez forme retenue, variantes et nombre d’utilisations avant de choisir ou créer une autorité.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/authorities\/authorities\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Édition d’autorité', 'Modifiez ici une notice d’autorité. Les changements peuvent se répercuter sur les notices bibliographiques liées selon la configuration de Koha.', 'bottom'),
        s(['.nav-tabs', '#tabs'], 'Zones MARC d’autorité', 'La structure dépend du type d’autorité. Vérifiez forme retenue, variantes, identifiants et zones de relation.', 'bottom'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Enregistrer', 'Sauvegardez après contrôle de la forme et des liens. Évitez de créer une nouvelle autorité lorsque la correction d’une forme existante suffit.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/authorities\/detail\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Détail d’autorité', 'Cette fiche permet de contrôler la forme retenue, les variantes et l’usage de l’autorité dans le catalogue.', 'bottom'),
        s(['#authorities_detail', '.page-section'], 'Données d’autorité', 'Vérifiez identifiants, forme, dates et renvois avant toute fusion ou correction.', 'bottom'),
        s(['a[href*="merge.pl"]'], 'Fusionner', 'La fusion doit conserver la meilleure autorité comme pivot et reporter les liens bibliographiques vers elle.', 'top', null, 'Avant fusion, contrôlez les identifiants externes et les différences de forme pour éviter de fusionner des personnes ou entités homonymes.')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       LISTES KOHA
       ========================================================= */
    if (p(ctx, /\/virtualshelves\/shelves\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Listes Koha', 'Les listes Koha sont persistantes et partagées selon leurs droits, contrairement à vos listes temporaires locales qui servent de panier de travail rapide.', 'bottom'),
        s(['.nav-tabs', '.page-section'], 'Mes listes / listes publiques', 'Vérifiez la visibilité de la liste avant d’y ajouter des notices : une liste publique peut être consultée par d’autres utilisateurs selon les droits.', 'bottom'),
        s(['table.dataTable'], 'Contenu ou liste des listes', 'Les actions disponibles dépendent du mode : consulter, modifier, supprimer, partager ou ajouter des notices.', 'top'),
        s(['a[href*="op=add_form"]'], 'Nouvelle liste', 'Créez une liste persistante lorsqu’un ensemble de notices doit être conservé au-delà du travail courant ou partagé.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       MODELES DE TRANSFORMATION MARC
       ========================================================= */
    if (p(ctx, /\/tools\/marc_modification_templates\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Modèles de transformation MARC', 'Ces modèles automatisent des opérations sur les zones MARC : ajouter, mettre à jour, copier, déplacer ou supprimer des données.', 'bottom'),
        s(['select[name*="template"]', '#template_id'], 'Modèle', 'Sélectionnez un modèle existant avant de le modifier. Utilisez des noms métier explicites pour éviter une application accidentelle au mauvais flux.', 'right'),
        s(['table.dataTable', '.template_actions'], 'Actions du modèle', 'L’ordre des actions compte : une action peut dépendre du résultat de la précédente. Lisez toujours la séquence complète.', 'top'),
        s(['button', 'a[href*="add_action"]'], 'Ajouter une action', 'Définissez précisément zone, sous-zone, valeur, condition et action. Testez le modèle sur un petit lot avant utilisation massive.', 'top'),
        s(['input[name="name"]'], 'Nom du modèle', 'Le nom doit indiquer la source ou l’objectif : par exemple fournisseur, correction ou normalisation ciblée.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       INVENTAIRE / RECOLEMENT
       ========================================================= */
    if (p(ctx, /\/tools\/inventory\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Inventaire / récolement', 'Comparez les exemplaires attendus et les documents réellement contrôlés en rayon.', 'bottom'),
        s(['form', '.page-section'], 'Périmètre', 'Définissez bibliothèque, localisation, cote ou autres limites avant de lancer un inventaire. Un périmètre clair rend le résultat exploitable.', 'bottom'),
        s(['textarea', 'input[type="file"]'], 'Codes-barres contrôlés', 'Importez ou collez les codes-barres relevés selon votre méthode de récolement.', 'bottom'),
        s(['table.dataTable'], 'Résultats', 'Analysez présents, non vus, écarts de localisation et statuts. Ne concluez pas à un manquant avant de vérifier prêt, transfert, réservation ou rangement temporaire.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ACCUEIL OUTILS / CATALOGAGE / RAPPORTS
       ========================================================= */
    if (p(ctx, /\/tools\/tools-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Outils', 'Cet écran regroupe les traitements transversaux : lots, imports, inventaire, journaux, notices et autres outils selon vos permissions.', 'bottom'),
        s(['.tools_list', '.biglinks-list', '.page-section'], 'Familles d’outils', 'Choisissez l’outil en fonction de la donnée réellement manipulée : notices, exemplaires, adhérents, fichiers ou administration.', 'top'),
        s(['a[href*="stage-marc-import.pl"]'], 'Mettre des notices en réservoir', 'Première étape d’un import MARC.', 'right'),
        s(['a[href*="manage-marc-import.pl"]'], 'Gérer les lots MARC', 'Deuxième étape : contrôle puis import effectif des notices préparées.', 'right'),
        s(['a[href*="batchMod.pl"]'], 'Modifier des exemplaires par lot', 'Applique une correction structurée à une liste d’exemplaires.', 'right'),
        s(['a[href*="viewlog.pl"]'], 'Journaux', 'Retrouve les actions enregistrées par Koha pour audit ou diagnostic.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/cataloguing\/cataloging-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Catalogage', 'Point d’entrée des opérations sur notices, exemplaires et imports bibliographiques.', 'bottom'),
        s(['a[href*="addbiblio.pl"]'], 'Nouvelle notice', 'Crée une notice directement dans l’éditeur MARC.', 'right'),
        s(['a[href*="z3950_search.pl"]'], 'Catalogage par Z39.50/SRU', 'Recherche une notice externe à adapter ensuite aux pratiques locales.', 'right'),
        s(['a[href*="stage-marc-import.pl"]'], 'Import MARC', 'Démarre le workflow de mise en réservoir d’un fichier de notices.', 'right'),
        s(['a[href*="manage-marc-import.pl"]'], 'Lots en réservoir', 'Contrôle et importe les fichiers déjà préparés.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/reports\/reports-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Rapports', 'Point d’entrée des statistiques et rapports enregistrés.', 'bottom'),
        s(['a[href*="guided_reports.pl"]'], 'Rapports personnalisés', 'Accède aux rapports SQL enregistrés et à leur création.', 'right'),
        s(['.page-section', '.biglinks-list'], 'Rapports statistiques', 'Les rapports prédéfinis proposent des vues plus cadrées. Pour une analyse spécifique, utilisez un rapport SQL documenté.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ADMINISTRATION — ACCUEIL ET GRILLES MARC
       ========================================================= */
    if (p(ctx, /\/admin\/admin-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Administration', 'Les réglages de cette zone peuvent modifier le fonctionnement du réseau entier. Réservez les changements aux paramètres maîtrisés et documentez les décisions structurantes.', 'bottom'),
        s(['.page-section', '.biglinks-list'], 'Catégories d’administration', 'Circulation, catalogue, adhérents, acquisitions et paramètres système sont regroupés par domaine.', 'top'),
        s(['a[href*="preferences.pl"]'], 'Préférences système', 'Réglages globaux du comportement de Koha.', 'right'),
        s(['a[href*="smart-rules.pl"]'], 'Règles de circulation', 'Durées, quotas, renouvellements et réservations.', 'right'),
        s(['a[href*="authorised_values.pl"]'], 'Valeurs autorisées', 'Listes normalisées utilisées dans les formulaires et exemplaires.', 'right'),
        s(['a[href*="biblio_framework.pl"]'], 'Grilles MARC', 'Structure des formulaires de catalogage bibliographique.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/biblio_framework\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Grilles de catalogage MARC', 'Les grilles définissent les zones et sous-zones disponibles, obligatoires, répétables et liées aux champs Koha.', 'bottom'),
        s(['table.dataTable'], 'Grilles existantes', 'Travaillez sur une grille dédiée lorsque vous avez besoin d’adaptations. Évitez les modifications non maîtrisées de la grille par défaut.', 'top', null, 'Une erreur de structure MARC peut affecter la saisie de toutes les notices utilisant la grille.'),
        s(['a[href*="marctagstructure.pl"]'], 'Structure MARC', 'Ouvre la liste des zones de la grille sélectionnée.', 'right'),
        s(['a[href*="op=add_form"]'], 'Créer / dupliquer', 'Préférez souvent la duplication d’une grille existante avant des adaptations importantes.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/marctagstructure\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Zones d’une grille MARC', 'Chaque ligne correspond à une zone MARC de la grille sélectionnée.', 'bottom'),
        s(['table.dataTable'], 'Zones', 'Vérifiez libellé, répétabilité, contraintes et visibilité avant de modifier une zone.', 'top'),
        s(['a[href*="marc_subfields_structure.pl"]'], 'Sous-zones', 'Ouvre la configuration détaillée des sous-zones, liens Koha, valeurs autorisées et plugins.', 'right')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ACQUISITIONS — COUVERTURE DE BASE
       ========================================================= */
    if (p(ctx, /\/acqui\/acqui-home\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Acquisitions', 'Suivez fournisseurs, budgets, paniers, commandes et réceptions.', 'bottom'),
        s(['form', 'input[type="text"]'], 'Rechercher un fournisseur', 'Commencez par retrouver le fournisseur concerné avant d’ouvrir ou créer un panier.', 'bottom'),
        s(['.page-section', '.biglinks-list'], 'Accès aux budgets et commandes', 'Les actions disponibles dépendent de vos droits et du workflow d’acquisition du réseau.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/acqui\/basket\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Panier de commande', 'Le panier regroupe les lignes de commande adressées à un fournisseur dans un même contexte d’acquisition.', 'bottom'),
        s(['#toolbar', '.btn-toolbar'], 'Actions du panier', 'Ajout de commande, fermeture, export ou autres actions selon l’état du panier.', 'bottom'),
        s(['table.dataTable'], 'Lignes de commande', 'Contrôlez titre, quantité, prix, fonds budgétaire et statut avant fermeture ou transmission.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       COURS / RESERVES DE COURS
       ========================================================= */
    if (p(ctx, /\/course_reserves\/course\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Réserves de cours', 'Créez et gérez des listes de documents associées à un cours, une formation ou une période d’enseignement.', 'bottom'),
        s(['form[action*="mod_course.pl"]'], 'Paramètres du cours', 'Renseignez intitulé, responsable, dates et statut selon les besoins du service.', 'bottom'),
        s(['button[type="submit"]'], 'Enregistrer', 'Validez le cours avant d’y rattacher des documents.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/course_reserves\/course-details\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Détail d’une réserve de cours', 'Cette page associe un cours à des exemplaires ou notices et peut appliquer des valeurs temporaires pendant la période du cours.', 'bottom'),
        s(['table.dataTable'], 'Documents du cours', 'Chaque ligne représente un document rattaché. Contrôlez les valeurs temporaires et leur restauration prévue à la fin du cours.', 'top'),
        s(['a[href*="add_items.pl"]', 'button'], 'Ajouter un document', 'Ajoutez uniquement les exemplaires réellement concernés par le cours.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }


    /* =========================================================
       CIRCULATION — RETARDS ET NOTES DE PRET
       ========================================================= */
    if (p(ctx, /\/circ\/(overdue|branchoverdues)\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Prêts en retard', 'Cette vue sert au suivi des documents dont la date de retour est dépassée. Travaillez avec les règles et pratiques du réseau : un retard n’implique pas automatiquement la même action pour tous les publics.', 'bottom'),
        s(['form', '.page-section'], 'Périmètre et filtres', 'Affinez si possible par bibliothèque, catégorie, période ou autres critères afin d’obtenir une liste réellement exploitable.', 'bottom'),
        s(['table.dataTable', 'table'], 'Liste des retards', 'Contrôlez adhérent, document, échéance, durée du retard et éventuels blocages. Évitez les relances à partir d’une liste non filtrée ou ancienne.', 'top'),
        s(['.dt-buttons', '.table_controls'], 'Tri, colonnes et export', 'Les outils de tableau peuvent servir à préparer une liste de travail ou un export. Vérifiez toujours les colonnes exportées avant diffusion.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/circ\/checkout-notes\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Notes de prêt laissées par les adhérents', 'Cette page centralise les remarques déposées depuis l’OPAC sur des prêts en cours.', 'bottom'),
        s(['table.dataTable', 'table'], 'Notes à traiter', 'Lisez la note avec le contexte du document et de l’adhérent. Une remarque peut signaler un état matériel, une erreur ou une information nécessitant un suivi.', 'top'),
        s(['button', 'a.btn'], 'Traiter / marquer', 'Une fois la remarque prise en charge, utilisez l’action prévue par Koha afin qu’elle ne reste pas indéfiniment dans les éléments en attente.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ADHERENTS — COMPTE, RESTRICTIONS, MOT DE PASSE
       ========================================================= */
    if (p(ctx, /\/members\/boraccount\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Compte financier de l’adhérent', 'Cette page retrace les débits, crédits et règlements associés au compte. Chaque opération doit rester explicable à partir de son type, de sa date et de sa référence.', 'bottom'),
        s(['#patron_details', '.patroninfo'], 'Adhérent concerné', 'Vérifiez l’identité avant toute saisie financière, surtout lorsque plusieurs fiches ont été consultées successivement.', 'right'),
        s(['#account-fines', 'table.dataTable', 'table'], 'Mouvements du compte', 'Lisez montant initial, restant dû, statut et description. Une ligne ancienne peut déjà avoir été partiellement ou totalement réglée.', 'top'),
        s(['a[href*="pay.pl"]', 'button'], 'Paiement / ajustement', 'Utilisez les actions financières seulement lorsque le motif est identifié. Les annulations et crédits doivent être traçables.', 'top', null, 'Les opérations financières peuvent être auditées : évitez les corrections sans motif explicite.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/members\/pay\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Régler ou ajuster le compte', 'Sélectionnez les lignes réellement concernées et vérifiez le montant avant validation.', 'bottom'),
        s(['table', '.page-section'], 'Sommes à traiter', 'Distinguez les montants dus, déjà réglés et éventuellement annulables.', 'top'),
        s(['input[name*="amount"]', '#paid'], 'Montant', 'Contrôlez la valeur saisie et la devise. Une erreur de décimale devient une écriture comptable à corriger.', 'right'),
        s(['select[name*="payment_type"]', 'select'], 'Mode / type d’opération', 'Choisissez le type conforme à la pratique du réseau afin que les statistiques et journaux restent compréhensibles.', 'right'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Valider', 'Relisez le montant et le motif avant l’enregistrement définitif.', 'top', null, 'Cette action modifie le compte financier de l’adhérent.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/members\/member-flags\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Permissions du compte professionnel', 'Les permissions déterminent les modules et opérations accessibles. Appliquez le principe du besoin métier : ni droits manquants, ni droits excessifs.', 'bottom'),
        s(['form', '.page-section'], 'Arbre des permissions', 'Les droits principaux peuvent ouvrir des sous-permissions plus fines. Vérifiez les dépendances avant de modifier un profil.', 'bottom'),
        s(['input[type="checkbox"]'], 'Droits accordés', 'Une case peut autoriser des actions sensibles : suppression, administration, circulation ou données personnelles.', 'right'),
        s(['button[type="submit"]'], 'Enregistrer', 'Validez après relecture des changements et, si nécessaire, documentez pourquoi le niveau d’accès a été modifié.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/members\/member-password\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Identifiants de connexion', 'Cette page modifie les identifiants utilisés par l’adhérent pour accéder aux services autorisés.', 'bottom'),
        s(['input[name="userid"]', '#userid'], 'Identifiant', 'Vérifiez qu’il correspond bien à la fiche affichée et qu’il respecte vos règles locales.', 'right'),
        s(['input[type="password"]'], 'Mot de passe', 'Ne communiquez jamais un mot de passe par un canal non prévu. Si Koha impose des règles de complexité, elles s’appliquent lors de la validation.', 'right'),
        s(['button[type="submit"]'], 'Enregistrer', 'Validez seulement après confirmation de l’identité de l’adhérent lorsque le changement est demandé au comptoir.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       CATALOGUE — HISTORIQUE DE RECHERCHE / PREVISUALISATIONS
       ========================================================= */
    if (p(ctx, /\/catalogue\/search-history\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Historique des recherches Koha', 'Koha conserve ici certaines recherches effectuées pendant la session ou pour le compte connecté. C’est distinct de votre historique métier personnalisé dans la barre basse.', 'bottom'),
        s(['.nav-tabs'], 'Types d’historique', 'Selon la configuration, les recherches bibliographiques et d’autorités peuvent être séparées.', 'bottom'),
        s(['table.dataTable', 'table'], 'Recherches mémorisées', 'Relancez une requête lorsque vous souhaitez retrouver exactement la logique de recherche précédente.', 'top'),
        s(['button', 'a.btn'], 'Effacer', 'La suppression nettoie l’historique Koha concerné ; elle n’efface pas les données du catalogue.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/catalogue\/(showmarc|showelastic)\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Vue technique de la notice', 'Cette page expose la représentation technique d’une notice : MARC ou document indexé selon l’écran.', 'bottom'),
        s(['pre', 'table', '.page-section'], 'Contenu technique', 'Utilisez cette vue pour diagnostiquer une zone, une sous-zone ou une différence d’indexation. Elle n’est pas destinée à remplacer l’éditeur de notice.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       OUTILS — IMPORT ADHERENTS ET TRAITEMENTS DE MASSE
       ========================================================= */
    if (p(ctx, /\/tools\/import_borrowers\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Importer des adhérents', 'L’import d’adhérents est un traitement de masse. Vérifiez le fichier, les identifiants uniques et les valeurs par défaut avant lancement.', 'bottom'),
        s(['input[type="file"]'], 'Fichier d’import', 'Chargez le fichier structuré attendu par Koha. Conservez une copie de la source avant toute transformation.', 'right'),
        s(['select[name*="matchpoint"]', '#matchpoint'], 'Point de correspondance', 'Ce critère détermine comment Koha reconnaît un adhérent existant. Un mauvais choix peut créer des doublons ou mettre à jour la mauvaise fiche.', 'right', null, 'Vérifiez particulièrement cardnumber, userid ou tout identifiant utilisé comme clé de rapprochement.'),
        s(['select[name*="overwrite"]', 'input[name*="overwrite"]'], 'Mise à jour des fiches existantes', 'Choisissez avec prudence si les données entrantes doivent compléter ou remplacer des valeurs déjà présentes.', 'right'),
        s(['select[name*="branch"]', 'select[name*="category"]'], 'Valeurs par défaut', 'Les valeurs par défaut sont utiles lorsque le fichier ne fournit pas toutes les colonnes obligatoires. Assurez-vous qu’elles correspondent au public réellement importé.', 'right'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Lancer l’import', 'Avant validation, relisez le nombre de lignes, l’encodage et la stratégie de rapprochement.', 'top', null, 'Un import massif erroné est beaucoup plus coûteux à corriger qu’un contrôle préalable.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/tools\/modborrowers\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Modification d’adhérents par lot', 'Appliquez une même modification à plusieurs fiches seulement si le groupe a été constitué sur un critère fiable.', 'bottom'),
        s(['textarea', 'input[type="file"]', 'select'], 'Sélection des adhérents', 'Vérifiez le périmètre du lot avant de choisir les champs à modifier.', 'bottom'),
        s(['fieldset', '.page-section'], 'Champs à modifier', 'Ne renseignez que les valeurs qui doivent réellement être appliquées à tout le lot. Laisser un champ non sélectionné évite les écrasements involontaires.', 'top'),
        s(['button[type="submit"]'], 'Appliquer', 'Relisez le lot et les changements avant validation.', 'top', null, 'Une modification par lot peut toucher de nombreuses fiches en une seule opération.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/tools\/batch_extend_due_dates\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Modifier des dates de retour par lot', 'Cet outil agit sur des prêts existants. Définissez précisément la population concernée et la règle de nouvelle échéance.', 'bottom'),
        s(['form', '.page-section'], 'Critères de sélection', 'Limitez le traitement par bibliothèque, catégorie, date ou autre critère disponible avant de calculer les nouvelles échéances.', 'bottom'),
        s(['input[type="date"]', 'select'], 'Nouvelle règle de date', 'Contrôlez si la date est absolue ou calculée selon un décalage. Tenez compte des jours de fermeture et règles locales.', 'right'),
        s(['table.dataTable', 'table'], 'Aperçu des prêts', 'Lorsque Koha fournit une prévisualisation, vérifiez quelques lignes représentatives avant d’appliquer le lot.', 'top'),
        s(['button[type="submit"]'], 'Valider le lot', 'N’appliquez le traitement qu’après contrôle du périmètre et des nouvelles dates.', 'top', null, 'L’opération modifie des prêts en cours et peut avoir un impact sur les relances et réservations.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/tools\/cleanborrowers\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Nettoyage des adhérents', 'Cet outil traite des comptes anciens ou inactifs. Les critères doivent être conservateurs et compatibles avec vos obligations de conservation.', 'bottom'),
        s(['form', '.page-section'], 'Critères', 'Définissez précisément ancienneté, activité et catégories concernées. Faites d’abord un contrôle sur les volumes attendus.', 'bottom'),
        s(['button[type="submit"]'], 'Lancer', 'Avant toute suppression ou anonymisation, vérifiez le type exact d’action proposé par la page.', 'top', null, 'Suppression et anonymisation répondent à des finalités différentes et peuvent être irréversibles.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/tools\/export\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Exporter des données bibliographiques', 'Définissez le périmètre, le format et les éventuels filtres avant de produire un fichier destiné à un autre outil.', 'bottom'),
        s(['form', '.page-section'], 'Périmètre d’export', 'Bibliothèque, plage de notices, liste ou autres critères déterminent le contenu du fichier.', 'bottom'),
        s(['select[name*="format"]', 'input[name*="format"]'], 'Format', 'Choisissez un format compatible avec la destination : MARC, MARCXML ou autre option disponible.', 'right'),
        s(['button[type="submit"]'], 'Exporter', 'Lance la génération du fichier. Vérifiez ensuite le nombre de notices et, si nécessaire, ouvrez un échantillon avant transmission.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       JOBS EN ARRIERE-PLAN
       ========================================================= */
    if (p(ctx, /\/admin\/background_jobs\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Tâches en arrière-plan', 'Koha exécute ici certains traitements lourds : imports, lots et autres opérations asynchrones. Cette page permet de suivre leur état.', 'bottom'),
        s(['table.dataTable', 'table'], 'Liste des tâches', 'Contrôlez type, initiateur, date, progression et statut. Une tâche terminée avec erreur mérite une lecture du détail avant de relancer quoi que ce soit.', 'top'),
        s(['.progress', '[role="progressbar"]'], 'Progression', 'Une progression en cours signifie que le traitement n’est pas encore consolidé. Évitez de lancer un doublon du même lot.', 'top'),
        s(['pre', '.alert', '.job_detail'], 'Messages et résultat', 'Le détail peut signaler des notices ignorées, des erreurs ou le nombre d’objets traités.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       IMPORT MARC — CONFIGURATION DES REGLES
       ========================================================= */
    if (p(ctx, /\/admin\/matching-rules\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Règles de concordance MARC', 'Ces règles déterminent quand une notice entrante est considérée comme correspondant à une notice déjà présente. Elles sont utilisées lors de la mise en réservoir.', 'bottom'),
        s(['table.dataTable', 'table'], 'Règles existantes', 'Avant d’en créer une nouvelle, identifiez celles déjà utilisées par vos profils d’import.', 'top'),
        s(['input[name*="code"]', '#code'], 'Code de règle', 'Utilisez un identifiant stable et explicite : les profils d’import peuvent dépendre de cette règle.', 'right'),
        s(['input[name*="threshold"]', '#threshold'], 'Seuil de concordance', 'Le seuil est comparé au cumul des scores obtenus par les points de concordance. Une règle trop permissive augmente le risque de faux positifs.', 'right'),
        s(['select[name*="record_type"]'], 'Type de notice', 'Distinguez bibliographique et autorité. Une règle conçue pour l’un ne doit pas être appliquée aveuglément à l’autre.', 'right'),
        s(['.matchpoint', '#matchpoints', 'fieldset'], 'Points de concordance', 'Chaque point indique l’index, le champ MARC, éventuellement la sous-zone, la normalisation et le score attribué.', 'top'),
        s(['input[name*="search_index"]'], 'Index de recherche', 'L’index doit correspondre à une donnée effectivement indexée dans votre moteur de recherche Koha.', 'right'),
        s(['input[name*="score"]'], 'Score', 'Le total des scores atteignant le seuil transforme la notice en correspondance. Pensez la règle comme un système de preuves, pas comme une simple égalité.', 'right'),
        s(['button[type="submit"]'], 'Enregistrer la règle', 'Testez ensuite la règle sur un petit lot représentatif avant de l’utiliser sur un import important.', 'top', null, 'Une mauvaise règle de concordance peut provoquer des remplacements incorrects ou, à l’inverse, de nombreux doublons.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/marc-overlay-rules\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Règles de recouvrement MARC', 'Ces règles contrôlent quels champs peuvent être ajoutés, modifiés ou supprimés lors du recouvrement d’une notice.', 'bottom'),
        s(['table.dataTable', 'table'], 'Règles de recouvrement', 'Lisez-les dans l’ordre de priorité réellement appliqué par Koha et vérifiez la source concernée.', 'top'),
        s(['input', 'select'], 'Conditions et permissions', 'Une règle doit être assez précise pour protéger les zones locales tout en permettant les mises à jour attendues.', 'right'),
        s(['button[type="submit"]'], 'Enregistrer', 'Testez les changements sur un lot de faible volume avant un import massif.', 'top', null, 'Les règles de recouvrement peuvent protéger ou au contraire écraser des données locales selon leur configuration.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/record_sources\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Sources de notices', 'Les sources permettent d’indiquer l’origine des notices et, selon la configuration, de contrôler leur éditabilité.', 'bottom'),
        s(['table.dataTable', 'table'], 'Sources existantes', 'Utilisez des noms stables correspondant réellement aux flux documentaires du réseau.', 'top'),
        s(['input[name*="name"]'], 'Nom de la source', 'Le libellé doit permettre aux catalogueurs d’identifier immédiatement l’origine du record.', 'right'),
        s(['input[type="checkbox"]'], 'Édition autorisée', 'Si l’édition est bloquée, la correction doit normalement être faite dans le système source puis réimportée.', 'right'),
        s(['button[type="submit"]'], 'Enregistrer', 'Documentez toute source utilisée dans un flux d’import automatisé ou récurrent.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ADMINISTRATION — STRUCTURES METIER
       ========================================================= */
    if (p(ctx, /\/admin\/branches\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Bibliothèques et groupes', 'Les bibliothèques structurent circulation, rattachement des exemplaires, réservations, rapports et permissions. Les codes sont des identifiants structurants.', 'bottom'),
        s(['table.dataTable', 'table'], 'Bibliothèques', 'Vérifiez code, nom et groupes avant modification. Le code d’un site est souvent repris dans de nombreux rapports et scripts.', 'top'),
        s(['a[href*="op=add_form"]', 'button'], 'Créer / modifier', 'Ajoutez une structure uniquement lorsque son usage fonctionnel est défini.', 'right', null, 'Évitez de modifier un code de bibliothèque existant sans étude d’impact sur données, rapports et scripts locaux.')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/itemtypes\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Types de document', 'Les types de document interviennent dans l’affichage, les règles de circulation et de nombreux rapports.', 'bottom'),
        s(['table.dataTable', 'table'], 'Types existants', 'Vérifiez le code interne et le libellé. Le code est fréquemment utilisé dans les scripts et statistiques.', 'top'),
        s(['form', '.page-section'], 'Paramètres du type', 'Icône, prêt, renouvellement ou autres propriétés peuvent influer sur les usages selon votre configuration.', 'bottom'),
        s(['button[type="submit"]'], 'Enregistrer', 'Avant de modifier un type existant, mesurez son impact sur les exemplaires déjà rattachés.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/categories\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Catégories d’adhérents', 'Les catégories structurent inscriptions, durées de validité, règles de circulation, autorisations et statistiques.', 'bottom'),
        s(['table.dataTable', 'table'], 'Catégories', 'Le code interne est structurant. Les règles de circulation peuvent dépendre directement de cette valeur.', 'top'),
        s(['form', '.page-section'], 'Paramètres', 'Contrôlez type de catégorie, durée d’inscription, limites d’âge et autres valeurs avant validation.', 'bottom'),
        s(['button[type="submit"]'], 'Enregistrer', 'Une modification peut affecter de nombreux adhérents existants et les règles qui leur sont appliquées.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/admin\/columns_settings\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Configuration des colonnes', 'Cette page définit l’affichage par défaut de certains tableaux Koha : visibilité, ordre et éventuellement export.', 'bottom'),
        s(['table', '.page-section'], 'Colonnes configurables', 'Masquez uniquement les colonnes réellement inutiles. Certains scripts locaux peuvent s’appuyer sur des données présentes dans le DOM même si elles ne sont pas visibles.', 'top'),
        s(['button[type="submit"]'], 'Enregistrer', 'Testez ensuite la page concernée sur ordinateur et sur écran étroit.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       PERIODIQUES — CREATION / MODIFICATION D'ABONNEMENT
       ========================================================= */
    if (p(ctx, /\/serials\/subscription-add\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Créer ou modifier un abonnement', 'L’abonnement définit la périodicité attendue, la durée et la génération des numéros à bulletiner.', 'bottom'),
        s(['input[name="biblionumber"]', '#biblionumber'], 'Notice liée', 'Vérifiez que l’abonnement est rattaché à la bonne notice de périodique avant de poursuivre.', 'right'),
        s(['select[name*="vendor"]', '#aqbooksellerid'], 'Fournisseur', 'Le fournisseur est utile pour le suivi des réclamations et de l’acquisition lorsque votre workflow l’utilise.', 'right'),
        s(['input[name*="startdate"]', '#startdate'], 'Date de début', 'Cette date sert de point de départ au calcul prévisionnel.', 'right'),
        s(['select[name*="periodicity"]', '#periodicity'], 'Périodicité', 'Choisissez la fréquence réelle de parution. Une mauvaise périodicité produit un planning de réception incohérent.', 'right'),
        s(['#numberpattern', 'select[name*="numberpattern"]'], 'Modèle de numérotation', 'Le modèle construit volume, numéro, année ou autres éléments de chronologie attendus.', 'right'),
        s(['button[id*="test"]', '#testpattern'], 'Tester / calculer', 'Utilisez l’aperçu pour vérifier plusieurs numéros futurs avant d’enregistrer. Ton interface locale ajoute aussi un bouton de calcul lorsque nécessaire.', 'top'),
        s(['button[type="submit"]', 'input[type="submit"]'], 'Enregistrer l’abonnement', 'Validez seulement lorsque les premières parutions calculées correspondent au périodique réel.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       ACQUISITIONS — RECEPTION ET FACTURES
       ========================================================= */
    if (p(ctx, /\/acqui\/parcel\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Réception des commandes', 'Cette page transforme des lignes commandées en éléments reçus. Contrôlez fournisseur, facture et quantités physiques.', 'bottom'),
        s(['#invoice', '.page-section'], 'Contexte de réception', 'Vérifiez numéro de facture, date et fournisseur avant de réceptionner des lignes.', 'bottom'),
        s(['table.dataTable', 'table'], 'Commandes à réceptionner', 'Comparez quantité commandée, quantité reçue, prix et fonds avant validation.', 'top'),
        s(['input[type="checkbox"]', 'input[name*="quantity"]'], 'Sélection / quantité', 'Ne réceptionnez que les exemplaires réellement arrivés. Les reliquats doivent rester identifiables.', 'right'),
        s(['button[type="submit"]'], 'Réceptionner', 'Validez une fois les quantités et prix vérifiés.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    if (p(ctx, /\/acqui\/invoice\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Facture d’acquisition', 'La facture regroupe des réceptions et coûts associés. Elle participe au suivi budgétaire.', 'bottom'),
        s(['form', '.page-section'], 'Informations de facture', 'Contrôlez référence, fournisseur, date, frais et éventuels ajustements.', 'bottom'),
        s(['table.dataTable', 'table'], 'Lignes facturées', 'Vérifiez la cohérence entre commandes, quantités reçues et sommes facturées.', 'top'),
        s(['button[type="submit"]'], 'Enregistrer / clôturer', 'Ne clôturez qu’après contrôle complet selon votre circuit comptable.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    /* =========================================================
       SIGNALEMENTS / PROBLEMES CATALOGUE
       ========================================================= */
    if (p(ctx, /\/cataloguing\/concerns\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Problèmes signalés sur les notices', 'Cette file centralise les signalements nécessitant une correction ou une réponse côté catalogue.', 'bottom'),
        s(['table.dataTable', 'table'], 'Signalements', 'Lisez le message, la notice concernée, l’auteur du signalement et l’état avant intervention.', 'top'),
        s(['a[href*="detail.pl"]'], 'Ouvrir la notice', 'Contrôlez la notice dans son contexte avant de modifier les données.', 'right'),
        s(['button', 'a.btn'], 'Résoudre / mettre à jour', 'Une fois la correction effectuée, actualisez le statut du signalement afin de fermer la boucle de traitement.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }


    /* =========================================================
       PAGES PERSONNALISEES KOHA
       ========================================================= */
    if (p(ctx, /\/tools\/page\.pl$/)) {
      st = [
        s(['main h1','h1'], 'Page outil personnalisée', 'Cette page n’appartient pas forcément au Koha standard : elle peut héberger un outil métier propre au réseau.', 'bottom'),
        s(['main .page-section', 'main form', 'main table'], 'Zone fonctionnelle', 'Utilisez les libellés et aides propres à l’outil. Le guide générique met en évidence les principaux contrôles visibles sans supposer un fonctionnement qui n’existe pas.', 'top'),
        s(['button', 'a.btn'], 'Actions', 'Avant une action d’administration ou un traitement de masse, vérifiez le périmètre et les données affichées.', 'top')
      ].concat(commonEnd());
      return compact(st);
    }

    return [];
  });
})();
