/*
 Nom du fichier : 142-bibliography-builder.js
 Module : PimpMyKoha — Bibliographies & publications
 Version : 0.2.6-preplugin
 Date : 2026-10-01

 Dépendances :
 - 000-pmk-config-firestore.js
 - gestionnaire de listes personnelles PMK existant
 - 000-pmk-cover-resolver.js recommandé (moteur transverse partagé avec 066-067)
 - aucune authentification Firebase requise par le module 142

 Objectifs V0.1 :
 - source : listes personnelles PMK notices/exemplaires ;
 - source : sélection d'une liste native Koha via la page des listes ;
 - source : paquets Koha (bundles) depuis « Gérer le paquet » ;
 - source : panier Koha ;
 - source : réserves de cours Koha (course_reserves/course-details.pl), y compris réserves notice/exemplaire ;
 - récupération de toutes les réserves même quand le tableau est paginé par DataTables ;
 - injection paquet robuste malgré l'enveloppe DataTables et le chargement asynchrone ;
 - résolution centralisée des couvertures pour listes PMK, listes Koha et paquets ;
 - sélection dynamique du contenu publié : notices et exemplaires masquables/réaffichables sans modifier la source ;
 - rendu : notice / exemplaire / notice + exemplaires ;
 - 9 modèles prédéfinis immuables et duplicables ;
 - modèles personnels stockés dans le même projet Firestore et sous le même profil logique que les listes PMK ;
 - aucun écran, compte, e-mail, mot de passe ou état de connexion Firebase n'est créé par le module 142 ;
 - éditeur de blocs réordonnables ;
 - données bibliographiques étendues + exemplaires ;
 - codes-barres exemplaires fiabilisés (barcode/external_id) ;
 - récupération exemplaires corrigée (_per_page + fallback public) ;
 - champs item.* utilisables aussi en mode notice + exemplaires ;
 - bibliothèque étendue de blocs bibliographiques et exemplaires ;
 - bloc détails exemplaires + tableau détaillé ;
 - bloc code-barres exemplaire scannable sur papier via le service natif Koha ;
 - résumé métier lu directement en UNIMARC 330$a ;
 - enrichissement MARCXML avec accès générique biblio.marc.TAG.souszone ;
 - habillage de blocs type Word : flux, flottant gauche/droite, pleine largeur, en ligne ;
 - alignement justifié disponible sur les blocs texte ;
 - 9 modèles prédéfinis, dont un modèle dédié aux codes-barres scannables ;
 - QR natif Koha corrigé via /cgi-bin/koha/svc/barcode ;
 - masquage global des numéros de notices ;
 - filtres simples, tri, regroupement ;
 - aperçu HTML A4 ;
 - impression / PDF via navigateur ;
 - export/import JSON des modèles.
 - lien cliquable vers la notice Koha, utilisable en ligne et dans les PDF.
 - interface de configuration restylée en thème vert Koha, sections mieux séparées et plus contrastées.
 - couvertures résolues uniquement via Koha : HTML notice, MARC/856, fournisseurs configurés et endpoint Electre Koha ;
 - réutilisation prioritaire du moteur transverse window.PMKCoverResolver, avec fallback interne historique si absent ;
 - suppression des fallbacks directs Google Books / Open Library / Amazon codés dans le module.
*/
(function (window, document) {
    'use strict';

    if (window.__PMK142_BIBLIOGRAPHY_BUILDER__) return;
    window.__PMK142_BIBLIOGRAPHY_BUILDER__ = true;

    const MODULE_ID = 'bibliography-builder';
    const VERSION = '0.2.5-preplugin';
    const PAGE_PARAM = 'bibliography-builder';
    const PAGE_URL = '/cgi-bin/koha/mainpage.pl?pmk_page=' + PAGE_PARAM;
    const SESSION_SOURCE_KEY = 'pmk142-session-source';
    const ROOT_ID = 'pmk142-root';
    const STYLE_ID = 'pmk142-style';

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        injectPersonalListsButton: true,
        injectKohaListsButton: true,
        injectBundleButton: true,
        injectBasketButton: true,
        injectCourseReservesButton: true,
        defaultTemplate: 'builtin-illustrated',
        defaultMode: 'notice-items',
        defaultPageSize: 'A4',
        defaultOrientation: 'portrait'
    });

    const FIELD_CATALOG = [
        // Notice — champs principaux
        { key: 'biblio.title', label: 'Titre', scope: 'biblio' },
        { key: 'biblio.subtitle', label: 'Sous-titre', scope: 'biblio' },
        { key: 'biblio.author', label: 'Auteur / responsabilité principale', scope: 'biblio' },
        { key: 'biblio.editor', label: 'Éditeur (API)', scope: 'biblio' },
        { key: 'biblio.publisher', label: 'Éditeur (210$c / 214$c)', scope: 'biblio' },
        { key: 'biblio.publication_year', label: 'Année / date d’édition (210$d / 214$d)', scope: 'biblio' },
        { key: 'biblio.summary', label: 'Résumé (330$a)', scope: 'biblio' },
        { key: 'biblio.collection', label: 'Collection (225$a)', scope: 'biblio' },
        { key: 'biblio.isbn', label: 'ISBN (010$a)', scope: 'biblio' },
        { key: 'biblio.public_audience', label: 'Public (999$q)', scope: 'biblio' },
        { key: 'biblio.sublocation_local', label: 'Sous-localisation locale (999$y)', scope: 'biblio' },
        { key: 'biblio.medium', label: 'Support / medium', scope: 'biblio' },
        { key: 'biblio.part_number', label: 'Numéro de partie', scope: 'biblio' },
        { key: 'biblio.part_name', label: 'Nom de partie', scope: 'biblio' },
        { key: 'biblio.uniform_title', label: 'Titre uniforme', scope: 'biblio' },
        { key: 'biblio.series_title', label: 'Titre de série / collection', scope: 'biblio' },
        { key: 'biblio.copyright_date', label: 'Date de publication / copyright', scope: 'biblio' },
        { key: 'biblio.abstract', label: 'Abstract API (si présent)', scope: 'biblio' },
        { key: 'biblio.notes', label: 'Notes', scope: 'biblio' },
        { key: 'biblio.creation_date', label: 'Date de création de la notice', scope: 'biblio' },
        { key: 'biblio.last_modified', label: 'Dernière modification de la notice', scope: 'biblio' },
        { key: 'biblio.framework_id', label: 'Grille / framework', scope: 'biblio' },
        { key: 'biblio.biblionumber', label: 'N° notice', scope: 'biblio' },
        { key: 'biblio.link', label: 'Lien catalogue', scope: 'biblio' },

        // Exemplaire
        { key: 'item.barcode', label: 'Code-barres exemplaire', scope: 'item' },
        { key: 'item.item_id', label: 'N° exemplaire', scope: 'item' },
        { key: 'item.callnumber', label: 'Cote', scope: 'item' },
        { key: 'item.home_library_id', label: 'Site propriétaire', scope: 'item' },
        { key: 'item.holding_library_id', label: 'Site actuel', scope: 'item' },
        { key: 'item.location', label: 'Localisation', scope: 'item' },
        { key: 'item.permanent_location', label: 'Localisation permanente', scope: 'item' },
        { key: 'item.item_type_id', label: 'Type de document', scope: 'item' },
        { key: 'item.not_for_loan_status', label: 'Statut / exclusion du prêt', scope: 'item' },
        { key: 'item.lost_status', label: 'Perdu', scope: 'item' },
        { key: 'item.damaged_status', label: 'Endommagé', scope: 'item' },
        { key: 'item.withdrawn', label: 'Retiré des collections', scope: 'item' },
        { key: 'item.acquisition_date', label: 'Date d’acquisition', scope: 'item' },
        { key: 'item.purchase_price', label: 'Prix d’achat', scope: 'item' },
        { key: 'item.replacement_price', label: 'Prix de remplacement', scope: 'item' },
        { key: 'item.last_checkout_date', label: 'Dernier prêt', scope: 'item' },
        { key: 'item.last_seen_date', label: 'Dernière vue', scope: 'item' }
    ];

    const BUILTIN_TEMPLATES = Object.freeze([
        {
            id: 'builtin-classic',
            builtin: true,
            name: 'Bibliographie classique',
            description: 'Présentation sobre et complète, une colonne, avec résumé UNIMARC.',
            mode: 'notice',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 1, gap: 8, margin: 14 },
            card: { border: false, padding: 5, breakInside: true },
            blocks: [
                block('field', 'biblio.title', 'Titre', {
                    size: 18, weight: 800, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.subtitle', 'Sous-titre', {
                    size: 11, italic: true, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 11, weight: 650, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 10, prefix: 'Éditeur : ', wrapMode: 'inline', blockWidth: 48
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 10, prefix: 'Année : ', wrapMode: 'inline', blockWidth: 42
                }),
                block('field', 'biblio.collection', 'Collection', {
                    size: 9.5, prefix: 'Collection : ', wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.isbn', 'ISBN', {
                    size: 9, prefix: 'ISBN : ', muted: true, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.summary', 'Résumé (330$a)', {
                    size: 9.5, align: 'justify', wrapMode: 'full', blockWidth: 100, wrapGap: 2
                }),
                block('field', 'biblio.biblionumber', 'N° notice', {
                    size: 8, muted: true, prefix: 'Notice : ', wrapMode: 'full', blockWidth: 100
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-illustrated',
            builtin: true,
            name: 'Nouveautés illustrées',
            description: 'Couverture à gauche avec texte habillé, résumé et exemplaires.',
            mode: 'notice-items',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 2, gap: 8, margin: 12 },
            card: { border: true, padding: 7, breakInside: true },
            blocks: [
                block('cover', 'biblio.cover', 'Couverture', {
                    width: 92, height: 132,
                    wrapMode: 'float-left', blockWidth: 32, wrapGap: 2.5
                }),
                block('field', 'biblio.title', 'Titre', {
                    size: 15, weight: 800, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 10, weight: 650, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 9, prefix: 'Éditeur : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 9, prefix: 'Année : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.summary', 'Résumé (330$a)', {
                    size: 8.5, align: 'justify', wrapMode: 'normal', blockWidth: 100
                }),
                block('items', 'items', 'Exemplaires', {
                    size: 8,
                    showBarcode: true,
                    showCallnumber: true,
                    showHomeLibrary: true,
                    showHoldingLibrary: true,
                    showLocation: true,
                    showItemType: true,
                    showStatus: true,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true,
                    wrapGap: 2
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-favorite',
            builtin: true,
            name: 'Sélection / Coup de cœur',
            description: 'Présentation éditoriale avec couverture, résumé, QR catalogue et disponibilité.',
            mode: 'notice-items',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 2, gap: 10, margin: 13 },
            card: { border: true, padding: 8, breakInside: true },
            blocks: [
                block('badge', '', 'Coup de cœur', {
                    size: 9, text: 'Coup de cœur',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('cover', 'biblio.cover', 'Couverture', {
                    width: 120, height: 175,
                    wrapMode: 'float-left', blockWidth: 38, wrapGap: 3
                }),
                block('field', 'biblio.title', 'Titre', {
                    size: 17, weight: 850, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 11, weight: 650, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 9, prefix: 'Éditeur : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 9, prefix: 'Année : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.summary', 'Résumé (330$a)', {
                    size: 9.5, align: 'justify', wrapMode: 'normal', blockWidth: 100
                }),
                block('qrcode', 'biblio.link', 'QR catalogue', {
                    size: 82, align: 'center',
                    wrapMode: 'inline', blockWidth: 28, clearBefore: true, wrapGap: 2
                }),
                block('items', 'items', 'Disponibilité / exemplaires', {
                    size: 8,
                    showBarcode: false,
                    showCallnumber: true,
                    showHomeLibrary: true,
                    showHoldingLibrary: true,
                    showLocation: true,
                    showItemType: false,
                    showStatus: true,
                    wrapMode: 'inline',
                    blockWidth: 66,
                    wrapGap: 2
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-compact',
            builtin: true,
            name: 'Catalogue compact',
            description: 'Maximum de références par page avec données éditoriales essentielles.',
            mode: 'notice',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 3, gap: 5, margin: 10 },
            card: { border: false, padding: 3, breakInside: true },
            blocks: [
                block('field', 'biblio.title', 'Titre', {
                    size: 10.5, weight: 750, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 8.5, weight: 650, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 7.5, prefix: 'Éd. : ', muted: true, wrapMode: 'inline', blockWidth: 62
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 7.5, prefix: '', muted: true, wrapMode: 'inline', blockWidth: 28
                }),
                block('field', 'biblio.collection', 'Collection', {
                    size: 7.5, prefix: 'Coll. : ', muted: true, wrapMode: 'full', blockWidth: 100
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-exhibition',
            builtin: true,
            name: 'Catalogue d’exposition',
            description: 'Présentation visuelle avec grand visuel, résumé justifié et QR catalogue.',
            mode: 'notice',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 2, gap: 12, margin: 14 },
            card: { border: false, padding: 8, breakInside: true },
            blocks: [
                block('cover', 'biblio.cover', 'Couverture', {
                    width: 150, height: 210, align: 'center',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.title', 'Titre', {
                    size: 19, weight: 850, align: 'center',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 11, align: 'center',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 9, prefix: 'Éditeur : ', align: 'center',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 9, prefix: 'Année : ', align: 'center',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.summary', 'Résumé (330$a)', {
                    size: 9.5, align: 'justify',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('qrcode', 'biblio.link', 'QR catalogue', {
                    size: 90, align: 'center',
                    wrapMode: 'full', blockWidth: 100
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-items',
            builtin: true,
            name: 'Liste d’exemplaires',
            description: 'Une fiche par exemplaire avec localisation détaillée et code-barres scannable.',
            mode: 'item',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 2, gap: 7, margin: 12 },
            card: { border: true, padding: 7, breakInside: true },
            blocks: [
                block('field', 'biblio.title', 'Titre', {
                    size: 13, weight: 800, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 9, weight: 650, wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'item.callnumber', 'Cote', {
                    size: 10, weight: 700, prefix: 'Cote : ',
                    wrapMode: 'inline', blockWidth: 48
                }),
                block('field', 'item.item_type_id', 'Type', {
                    size: 8, prefix: 'Type : ',
                    wrapMode: 'inline', blockWidth: 45
                }),
                block('field', 'item.home_library_id', 'Site propriétaire', {
                    size: 8.5, prefix: 'Site propriétaire : ',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'item.holding_library_id', 'Site actuel', {
                    size: 8.5, prefix: 'Site actuel : ',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'item.location', 'Localisation', {
                    size: 8.5, prefix: 'Localisation : ',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('field', 'item.not_for_loan_status', 'Statut', {
                    size: 8.5, prefix: 'Statut : ',
                    wrapMode: 'full', blockWidth: 100
                }),
                block('barcode-image', 'item.barcode', 'Code-barres exemplaire scannable', {
                    barcodeType: 'Code39',
                    barcodeHeight: 48,
                    imageWidth: 190,
                    showText: true,
                    align: 'center',
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true,
                    wrapGap: 2
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-by-library',
            builtin: true,
            name: 'Nouveautés par bibliothèque',
            description: 'Exemplaires regroupés par site avec informations de notice et détails de localisation.',
            mode: 'item',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 2, gap: 7, margin: 12 },
            card: { border: true, padding: 6, breakInside: true },
            groupBy: 'item.home_library_id',
            blocks: [
                block('cover', 'biblio.cover', 'Couverture', {
                    width: 70, height: 100,
                    wrapMode: 'float-left', blockWidth: 27, wrapGap: 2
                }),
                block('field', 'biblio.title', 'Titre', {
                    size: 13, weight: 800, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 9, weight: 650, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 8, prefix: 'Éditeur : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 8, prefix: 'Année : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('items', 'items', 'Détails exemplaire', {
                    size: 8,
                    showBarcode: true,
                    showCallnumber: true,
                    showHomeLibrary: false,
                    showHoldingLibrary: true,
                    showLocation: true,
                    showItemType: true,
                    showStatus: true,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true,
                    wrapGap: 2
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-thematic',
            builtin: true,
            name: 'Bibliographie thématique',
            description: 'Rendu éditorial avec couverture habillée, résumé UNIMARC, collection et QR.',
            mode: 'notice-items',
            showBiblionumber: false,
            page: { size: 'A4', orientation: 'portrait', columns: 2, gap: 9, margin: 13 },
            card: { border: false, padding: 6, breakInside: true },
            coverPage: true,
            blocks: [
                block('cover', 'biblio.cover', 'Couverture', {
                    width: 95, height: 135,
                    wrapMode: 'float-left', blockWidth: 30, wrapGap: 2.5
                }),
                block('field', 'biblio.title', 'Titre', {
                    size: 15, weight: 820, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.author', 'Auteur', {
                    size: 10, weight: 650, wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publisher', 'Éditeur', {
                    size: 8.5, prefix: 'Éditeur : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.publication_year', 'Année', {
                    size: 8.5, prefix: 'Année : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.collection', 'Collection', {
                    size: 8.5, prefix: 'Collection : ', wrapMode: 'normal', blockWidth: 100
                }),
                block('field', 'biblio.summary', 'Résumé (330$a)', {
                    size: 9, align: 'justify', wrapMode: 'normal', blockWidth: 100
                }),
                block('qrcode', 'biblio.link', 'QR catalogue', {
                    size: 76, align: 'center',
                    wrapMode: 'inline', blockWidth: 25,
                    clearBefore: true, wrapGap: 2
                }),
                block('items', 'items', 'Exemplaires', {
                    size: 7.5,
                    showBarcode: false,
                    showCallnumber: true,
                    showHomeLibrary: true,
                    showHoldingLibrary: true,
                    showLocation: true,
                    showItemType: false,
                    showStatus: true,
                    wrapMode: 'inline',
                    blockWidth: 70,
                    wrapGap: 2
                })
            ,
                block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 8.5,
                    weight: 650,
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: true
                })]
        },
        {
            id: 'builtin-scannable-barcodes',
            builtin: true,
            name: 'Codes-barres scannables',
            description: 'Nom de la liste en titre, puis uniquement les codes-barres exemplaires scannables.',
            mode: 'item',
            showBiblionumber: false,
            useSourceNameAsTitle: true,
            page: {
                size: 'A4',
                orientation: 'portrait',
                columns: 3,
                gap: 6,
                margin: 10
            },
            card: {
                border: false,
                padding: 5,
                breakInside: true
            },
            blocks: [
                block('barcode-image', 'item.barcode', 'Code-barres exemplaire scannable', {
                    barcodeType: 'Code39',
                    barcodeHeight: 50,
                    imageWidth: 190,
                    showText: true,
                    align: 'center',
                    wrapMode: 'full',
                    blockWidth: 100,
                    clearBefore: false,
                    wrapGap: 2
                })
            ]
        }
    ]);

    let config = { ...DEFAULT_CONFIG };
    let registered = false;

    // Cache commun à toutes les sources de création.
    const coverResolutionCache = new Map();
    const detailHtmlCache = new Map();
    let current = {
        source: null,
        list: null,
        entries: [],
        records: [],
        templates: [],
        selectedTemplateId: '',
        workingTemplate: null,
        title: '',
        mode: DEFAULT_CONFIG.defaultMode,
        selectedBlockId: '',
        loading: false,
        error: '',
        filterText: '',
        groupBy: '',
        sortBy: 'biblio.title',
        allItemsForItemLists: false,
        showBiblionumber: true,
        bundleHostItem: null,
        includeBundleHost: false,
        hiddenBiblios: new Set(),
        hiddenItems: new Set(),
        contentManagerSearch: ''
    };

    function uid(prefix) {
        return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
    }

    function block(type, field, label, style) {
        return {
            id: uid('block'),
            type,
            field: field || '',
            label: label || '',
            hiddenWhenEmpty: true,
            style: {
                size: 10,
                weight: 400,
                italic: false,
                muted: false,
                align: 'left',
                prefix: '',
                suffix: '',
                width: 90,
                height: 130,
                ...style
            }
        };
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clean(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getPath(obj, path) {
        if (!path) return '';
        return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
    }

    function asText(value) {
        if (value == null) return '';
        if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' • ');
        if (typeof value === 'object') return '';
        return clean(value);
    }

    function query() {
        return new URLSearchParams(window.location.search);
    }

    function isBuilderPage() {
        return query().get('pmk_page') === PAGE_PARAM;
    }

    function isKohaNativeListPage() {
        return /\/virtualshelves\/shelves\.pl$/.test(window.location.pathname);
    }

    function isCatalogueDetailPage() {
        return /\/cgi-bin\/koha\/catalogue\/detail\.pl$/.test(window.location.pathname);
    }

    function isKohaBasketPage() {
        return /\/cgi-bin\/koha\/basket\/basket\.pl$/.test(window.location.pathname)
            || document.body?.id === 'cart_basket';
    }

    function isCourseReservesDetailPage() {
        return /\/cgi-bin\/koha\/course_reserves\/course-details\.pl$/.test(window.location.pathname)
            || document.body?.id === 'courses_course_details';
    }

    function pmkReady() {
        return !!window.PMKPersonalLists;
    }

    async function listsApi() {
        if (!pmkReady()) {
            for (let i = 0; i < 120 && !pmkReady(); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        return window.PMKPersonalLists || null;
    }

    async function storageContext() {
        const api = await listsApi();
        if (!api) return null;

        /*
         * IMPORTANT :
         * le 142 ne crée PAS de connexion Firebase et ne charge PAS Firebase Auth.
         * Il réutilise seulement le contexte Firestore déjà ouvert par le système PMK.
         */

        try {
            if (typeof api.getStorageContext === 'function') {
                const ctx = await api.getStorageContext();
                if (ctx) return ctx;
            }
        } catch (_) {}

        try {
            if (typeof api.getFirestoreContext === 'function') {
                const ctx = await api.getFirestoreContext();
                if (ctx) return ctx;
            }
        } catch (_) {}

        if (window.PMKConfig && typeof window.PMKConfig.getStorageContext === 'function') {
            try {
                const ctx = await window.PMKConfig.getStorageContext();
                if (ctx) return ctx;
            } catch (_) {}
        }

        return null;
    }

    function normalizeProfileId(value) {
        const id = clean(value);
        return id && id.length <= 160 ? id : '';
    }

    async function resolveActiveProfile() {
        const api = await listsApi();

        /*
         * Le profil est uniquement le profil logique déjà choisi/utilisé
         * par le gestionnaire de listes PMK.
         *
         * Aucun fallback vers un UID, un compte ou une adresse e-mail.
         */

        if (api) {
            try {
                if (typeof api.getProfile === 'function') {
                    const profile = await api.getProfile();
                    const id = normalizeProfileId(
                        profile?.id ||
                        profile?.profileId ||
                        profile?.canonicalName
                    );
                    if (id) return {
                        id,
                        displayName: clean(profile?.displayName || profile?.name || ''),
                        canonicalName: clean(profile?.canonicalName || id)
                    };
                }
            } catch (_) {}

            try {
                if (typeof api.getProfileId === 'function') {
                    const id = normalizeProfileId(await api.getProfileId());
                    if (id) return { id, displayName: '', canonicalName: id };
                }
            } catch (_) {}

            try {
                if (typeof api.getState === 'function') {
                    const state = await api.getState();
                    const profile = state?.profile || null;
                    const id = normalizeProfileId(
                        state?.profileId ||
                        profile?.id ||
                        profile?.profileId ||
                        profile?.canonicalName
                    );
                    if (id) return {
                        id,
                        displayName: clean(profile?.displayName || profile?.name || ''),
                        canonicalName: clean(profile?.canonicalName || id)
                    };
                }
            } catch (_) {}
        }

        const ctx = await storageContext();
        const profile = ctx?.profile || null;
        const id = normalizeProfileId(
            ctx?.profileId ||
            profile?.id ||
            profile?.profileId ||
            profile?.canonicalName
        );

        if (id) {
            return {
                id,
                displayName: clean(profile?.displayName || profile?.name || ''),
                canonicalName: clean(profile?.canonicalName || id)
            };
        }

        return null;
    }

    async function templatesCollection() {
        const ctx = await storageContext();
        const profile = await resolveActiveProfile();

        if (!ctx?.db || !ctx?.firestoreMod) {
            throw new Error(
                'Le stockage Firestore PMK n’est pas disponible. ' +
                'Le module 142 ne crée volontairement aucune connexion séparée.'
            );
        }

        if (!profile?.id) {
            throw new Error(
                'Aucun profil logique PMK actif n’a pu être identifié. ' +
                'Le 142 n’ouvrira pas de connexion : il attend le profil déjà utilisé par les listes personnelles.'
            );
        }

        return {
            ctx,
            profile,
            ref: ctx.firestoreMod.collection(
                ctx.db,
                'profiles',
                profile.id,
                'bibliographyTemplates'
            )
        };
    }

    async function loadUserTemplates() {
        try {
            const col = await templatesCollection();
            if (!col) return [];
            const snap = await col.ctx.firestoreMod.getDocs(col.ref);
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data(), builtin: false }));
        } catch (error) {
            console.warn('[PMK142] Modèles personnels indisponibles', error);
            return [];
        }
    }

    async function saveUserTemplate(template, forcedName) {
        const col = await templatesCollection();
        if (!col) throw new Error('Connexion Firestore des listes PMK indisponible.');

        const copy = clone(template);
        delete copy.builtin;
        copy.name = clean(forcedName || copy.name || 'Mon modèle').slice(0, 100);
        copy.version = 1;
        copy.updatedAtIso = new Date().toISOString();

        const data = {
            ...copy,
            createdAt: copy.createdAt || col.ctx.firestoreMod.serverTimestamp(),
            updatedAt: col.ctx.firestoreMod.serverTimestamp()
        };

        let id = copy.id && !String(copy.id).startsWith('builtin-') ? copy.id : '';
        if (id) {
            await col.ctx.firestoreMod.setDoc(col.ctx.firestoreMod.doc(col.ref, id), data, { merge: true });
            return id;
        }
        const ref = await col.ctx.firestoreMod.addDoc(col.ref, data);
        return ref.id;
    }

    async function deleteUserTemplate(id) {
        if (!id || String(id).startsWith('builtin-')) return;
        const col = await templatesCollection();
        if (!col) throw new Error('Connexion Firestore indisponible.');
        await col.ctx.firestoreMod.deleteDoc(col.ctx.firestoreMod.doc(col.ref, id));
    }

    function normalizeStoredNotice(raw) {
        const biblionumber = clean(raw?.biblionumber || raw?.biblioNumber);
        return {
            biblionumber,
            title: clean(raw?.title) || (biblionumber ? 'Notice #' + biblionumber : 'Notice'),
            subtitle: clean(raw?.subtitle),
            author: clean(raw?.author),
            editor: clean(raw?.editor),
            medium: clean(raw?.medium),
            part_number: clean(raw?.part_number || raw?.partnumber),
            part_name: clean(raw?.part_name || raw?.partname),
            uniform_title: clean(raw?.uniform_title || raw?.unititle),
            series_title: clean(raw?.series_title || raw?.seriestitle),
            copyright_date: clean(raw?.copyright_date || raw?.copyrightdate),
            abstract: clean(raw?.abstract),
            notes: clean(raw?.notes),
            creation_date: clean(raw?.creation_date || raw?.datecreated),
            last_modified: clean(raw?.last_modified || raw?.timestamp),
            framework_id: clean(raw?.framework_id || raw?.frameworkcode),
            link: clean(raw?.link) || (biblionumber ? '/cgi-bin/koha/catalogue/detail.pl?biblionumber=' + encodeURIComponent(biblionumber) : ''),
            cover: clean(raw?.imgSrc || raw?.cover || raw?.image),
            coverCandidates: Array.isArray(raw?.coverCandidates) ? raw.coverCandidates : [],
            raw: raw || {}
        };
    }

    function normalizeStoredItem(raw) {
        return {
            item_id: clean(raw?.itemNumber || raw?.itemnumber || raw?.item_id),
            barcode: clean(raw?.codeBarre || raw?.barcode || raw?.external_id),
            home_library_id: clean(raw?.site || raw?.homebranch || raw?.home_library_id),
            holding_library_id: clean(raw?.holdingbranch || raw?.holding_library_id),
            callnumber: clean(raw?.cote || raw?.itemcallnumber || raw?.callnumber),
            item_type_id: clean(raw?.type || raw?.itype || raw?.item_type_id),
            location: clean(raw?.location),
            permanent_location: clean(raw?.permanent_location),
            not_for_loan_status: raw?.not_for_loan_status ?? raw?.notforloan ?? '',
            acquisition_date: clean(raw?.acquisition_date || raw?.dateaccessioned),
            purchase_price: raw?.purchase_price ?? raw?.price ?? '',
            replacement_price: raw?.replacement_price ?? raw?.replacementprice ?? '',
            lost_status: raw?.lost_status ?? raw?.itemlost ?? '',
            damaged_status: raw?.damaged_status ?? raw?.damaged ?? '',
            withdrawn: raw?.withdrawn ?? raw?.wthdrawn ?? '',
            last_checkout_date: clean(raw?.last_checkout_date || raw?.datelastborrowed),
            last_seen_date: clean(raw?.last_seen_date || raw?.datelastseen),
            biblionumber: clean(raw?.biblionumber || raw?.biblioNumber || raw?.biblio_id),
            title: clean(raw?.title || raw?.biblio?.title),
            subtitle: clean(raw?.subtitle || raw?.biblio?.subtitle),
            raw: raw || {}
        };
    }

    function normalizeApiItem(raw, bib) {
        return {
            item_id: clean(raw?.item_id || raw?.itemnumber),
            // Koha REST récent expose le code-barres sous external_id.
            // On garde aussi barcode pour compatibilité avec les versions / réponses plus anciennes.
            barcode: clean(raw?.barcode || raw?.external_id),
            home_library_id: clean(raw?.home_library_id || raw?.homebranch),
            holding_library_id: clean(raw?.holding_library_id || raw?.holdingbranch),
            callnumber: clean(raw?.callnumber || raw?.itemcallnumber),
            item_type_id: clean(raw?.item_type_id || raw?.itype),
            location: clean(raw?.location),
            permanent_location: clean(raw?.permanent_location),
            not_for_loan_status: raw?.not_for_loan_status ?? raw?.notforloan ?? '',
            lost_status: raw?.lost_status ?? raw?.itemlost ?? '',
            damaged_status: raw?.damaged_status ?? raw?.damaged ?? '',
            withdrawn: raw?.withdrawn ?? raw?.wthdrawn ?? '',
            acquisition_date: clean(raw?.acquisition_date || raw?.dateaccessioned),
            purchase_price: raw?.purchase_price ?? raw?.price ?? '',
            replacement_price: raw?.replacement_price ?? raw?.replacementprice ?? '',
            last_checkout_date: clean(raw?.last_checkout_date || raw?.datelastborrowed),
            last_seen_date: clean(raw?.last_seen_date || raw?.datelastseen),
            biblionumber: clean(raw?.biblio_id || raw?.biblionumber || bib),
            raw
        };
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status + ' — ' + url);
        return await response.json();
    }

    function absoluteUrl(value) {
        const url = clean(value);
        if (!url) return '';
        try {
            return new URL(url, window.location.origin).href;
        } catch (_) {
            return url;
        }
    }

    function normalizeIsbn(value) {
        const source = Array.isArray(value) ? value[0] : value;
        const first = clean(source).split(/[\s,;]+/)[0] || '';
        return first.replace(/[^0-9Xx]/g, '').toUpperCase();
    }

    function isbnValues(value) {
        const source = Array.isArray(value) ? value : [value];
        const out = [];

        source.forEach(entry => {
            String(entry || '')
                .split(/[\s,;|]+/)
                .map(part => normalizeIsbn(part))
                .filter(Boolean)
                .forEach(isbn => {
                    if (!out.includes(isbn)) out.push(isbn);
                });
        });

        return out;
    }

    function isbn13to10(value) {
        const isbn = normalizeIsbn(value);

        if (/^\d{9}[\dX]$/.test(isbn)) {
            return isbn;
        }

        if (!/^978\d{10}$/.test(isbn)) return '';

        const core = isbn.slice(3, 12);
        let sum = 0;

        for (let i = 0; i < 9; i += 1) {
            sum += (10 - i) * Number(core[i]);
        }

        const check = (11 - (sum % 11)) % 11;
        return core + (check === 10 ? 'X' : String(check));
    }

    function electreIsbn10Candidates(biblio, marc) {
        const values = [
            ...isbnValues(biblio?.isbn),
            ...isbnValues(marcValue(marc || {}, '010', 'a'))
        ];

        const out = [];
        values.forEach(value => {
            const isbn10 = isbn13to10(value);
            if (isbn10 && !out.includes(isbn10)) out.push(isbn10);
        });

        return out;
    }

    function uniqueCoverCandidates(values) {
        const out = [];
        const seen = new Set();

        (values || []).flat(Infinity).forEach(value => {
            const url = absoluteUrl(value);
            if (!url) return;

            const lowered = url.toLowerCase();
            if (
                lowered.includes('/img/spinner')
                || lowered.includes('favicon')
                || lowered.includes('blank.gif')
                || lowered.includes('transparent')
                || lowered === 'about:blank'
            ) return;

            if (seen.has(url)) return;
            seen.add(url);
            out.push(url);
        });

        return out;
    }

    async function fetchDetailHtml(biblionumber) {
        const id = clean(biblionumber);
        if (!id) return '';

        if (detailHtmlCache.has(id)) {
            return await detailHtmlCache.get(id);
        }

        const promise = (async () => {
            const response = await fetch(
                '/cgi-bin/koha/catalogue/detail.pl?biblionumber=' + encodeURIComponent(id),
                {
                    credentials: 'same-origin',
                    headers: { Accept: 'text/html,application/xhtml+xml' }
                }
            );

            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' — fiche notice ' + id);
            }

            return await response.text();
        })();

        detailHtmlCache.set(id, promise);

        try {
            return await promise;
        } catch (error) {
            detailHtmlCache.delete(id);
            throw error;
        }
    }

    function imgCandidateUrls(img) {
        if (!img) return [];

        const urls = [
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-lazy-src')
        ];

        const srcset = clean(img.getAttribute('srcset'));
        if (srcset) {
            srcset.split(',').forEach(part => {
                const url = clean(part.trim().split(/\s+/)[0]);
                if (url) urls.push(url);
            });
        }

        return uniqueCoverCandidates(urls);
    }

    function extractKohaCoverCandidatesFromHtml(htmlText) {
        if (!htmlText) return [];

        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        const urls = [];

        /*
         * Tout ce qui suit provient du HTML produit par Koha :
         * - couvertures locales ;
         * - Amazon/Syndetics/CustomCoverImages si Koha les a activés ;
         * - éventuels fournisseurs/plugins ayant déjà injecté une URL statique ;
         * - fallback 856 rendu par les XSLT Dracénie (.imgcouv/.imgcouvlist).
         */
        [
            '#biblio-cover-slider .cover-image img',
            '.bookcoverimg .cover-image img',
            '#biblio-cover-slider img',
            '.bookcoverimg img',
            '#custom-img',
            '.imgcouv',
            '.imgcouvlist',
            '.thumbimg'
        ].forEach(selector => {
            doc.querySelectorAll(selector).forEach(img => {
                urls.push(...imgCandidateUrls(img));

                // Pour les couvertures locales Koha, ajoute aussi l'image pleine taille.
                const link = img.closest('a[href]')?.getAttribute('href');
                if (link && /\/catalogue\/image\.pl\?/i.test(link)) {
                    urls.push(link);
                }
            });
        });

        return uniqueCoverCandidates(urls);
    }

    function extractLiveKohaCoverCandidates(biblionumber) {
        const bibId = clean(biblionumber);
        if (!bibId) return [];

        const currentBib = clean(
            new URL(window.location.href).searchParams.get('biblionumber')
        );

        if (!isCatalogueDetailPage() || currentBib !== bibId) return [];

        const urls = [];

        document.querySelectorAll(
            '#biblio-cover-slider img, .bookcoverimg img, .imgcouv, .imgcouvlist, .thumbimg'
        ).forEach(img => {
            urls.push(...imgCandidateUrls(img));
        });

        return uniqueCoverCandidates(urls);
    }

    function marc856CoverCandidates(marc) {
        const raw = marcValue(marc || {}, '856', 'u');
        const values = Array.isArray(raw) ? raw : [raw];

        /*
         * On garde les URL 856 en dernier recours.
         * Si l'URL pointe vers une page HTML plutôt qu'une image, l'événement
         * error du <img> fera simplement passer au candidat suivant.
         */
        return uniqueCoverCandidates(
            values
                .map(value => clean(value))
                .filter(value => /^https?:\/\//i.test(value) || value.startsWith('/'))
        );
    }

    async function fetchElectreCoverViaKoha(biblio, marc) {
        const candidates = electreIsbn10Candidates(biblio, marc);
        if (!candidates.length) return '';

        for (const isbn10 of candidates) {
            const url = '/api/v1/contrib/electre/image'
                + '?isbn10=' + encodeURIComponent(isbn10)
                + '&side=staff'
                + '&result_page=true';

            try {
                const response = await fetch(url, {
                    credentials: 'same-origin',
                    headers: { Accept: 'text/plain, application/json;q=0.9, */*;q=0.8' }
                });

                /*
                 * 404/403 signifie simplement que l'endpoint n'est pas disponible
                 * ou qu'aucune image n'est fournie. On continue sans casser le 142.
                 */
                if (!response.ok) continue;

                let value = clean(await response.text());
                value = value.replace(/^"(.*)"$/s, '$1').trim();

                if (value && value !== 'null' && value !== 'undefined') {
                    return absoluteUrl(value);
                }
            } catch (error) {
                console.warn('[PMK142] Electre via Koha indisponible pour', isbn10, error);
            }
        }

        return '';
    }

    async function resolveCoverCandidates(biblio, marc) {
        // Moteur commun PMK : si disponible, le 142 partage exactement la même
        // résolution et le même cache que les listes personnelles 066-067.
        const sharedResolver = window.PMKCoverResolver;
        if (sharedResolver && typeof sharedResolver.resolveCandidates === 'function') {
            try {
                return await sharedResolver.resolveCandidates({
                    ...(biblio || {}),
                    imgSrc: clean(biblio?.cover),
                    cover: clean(biblio?.cover),
                    coverCandidates: Array.isArray(biblio?.coverCandidates) ? biblio.coverCandidates : []
                }, { marc: marc || biblio?.marc || {} });
            } catch (error) {
                console.warn('[PMK142] Moteur transverse couvertures indisponible, fallback interne', error);
            }
        }

        const bibId = clean(biblio?.biblionumber);
        const isbn = normalizeIsbn(
            biblio?.isbn || firstMarcValue(marc || {}, [['010', 'a']])
        );
        const cacheKey = bibId || ('isbn:' + isbn);

        if (cacheKey && coverResolutionCache.has(cacheKey)) {
            return await coverResolutionCache.get(cacheKey);
        }

        const promise = (async () => {
            const sourceCandidates = uniqueCoverCandidates([
                biblio?.cover,
                ...(Array.isArray(biblio?.coverCandidates) ? biblio.coverCandidates : [])
            ]);

            const liveCandidates = extractLiveKohaCoverCandidates(bibId);

            let detailCandidates = [];
            if (bibId) {
                try {
                    detailCandidates = extractKohaCoverCandidatesFromHtml(
                        await fetchDetailHtml(bibId)
                    );
                } catch (error) {
                    console.warn('[PMK142] Couvertures fiche Koha indisponibles', bibId, error);
                }
            }

            /*
             * Electre est interrogé UNIQUEMENT via l'endpoint Koha déjà installé.
             * Aucun token, domaine fournisseur ou paramétrage externe n'est stocké
             * dans le module 142.
             */
            const electreCandidate = await fetchElectreCoverViaKoha(biblio, marc);

            const marc856Candidates = marc856CoverCandidates(marc);

            /*
             * Priorité :
             * 1. DOM Koha déjà rendu dynamiquement (si on est sur la notice) ;
             * 2. HTML de detail.pl et fournisseurs activés par Koha ;
             * 3. Electre via endpoint Koha ;
             * 4. couverture déjà transmise par la source ;
             * 5. 856 de la notice en dernier recours.
             *
             * Aucun appel direct à Google Books, Open Library ou Amazon n'est
             * construit par le 142. Si Amazon/Syndetics/etc. apparaissent ici,
             * c'est uniquement parce que Koha les a lui-même rendus dans detail.pl.
             */
            return uniqueCoverCandidates([
                liveCandidates,
                detailCandidates,
                electreCandidate,
                sourceCandidates,
                marc856Candidates
            ]);
        })();

        if (cacheKey) coverResolutionCache.set(cacheKey, promise);

        try {
            return await promise;
        } catch (error) {
            if (cacheKey) coverResolutionCache.delete(cacheKey);
            console.warn('[PMK142] Résolution couverture Koha impossible', cacheKey, error);
            return uniqueCoverCandidates([biblio?.cover, marc856CoverCandidates(marc)]);
        }
    }

    function activateCoverFallbacks(container) {
        if (!container) return;

        container.querySelectorAll('img.pmk142-cover[data-cover-candidates]').forEach(img => {
            if (img.dataset.coverFallbackBound === '1') return;
            img.dataset.coverFallbackBound = '1';

            let candidates = [];
            try {
                candidates = JSON.parse(img.dataset.coverCandidates || '[]');
            } catch (_) {}

            candidates = uniqueCoverCandidates(candidates);
            let index = Math.max(0, candidates.indexOf(img.src));

            function tryNext() {
                index += 1;
                if (index >= candidates.length) {
                    img.style.display = 'none';
                    return;
                }
                img.src = candidates[index];
            }

            img.addEventListener('error', tryNext);

            // Certaines sources renvoient une image vide/minuscule plutôt qu'une 404.
            img.addEventListener('load', () => {
                if (
                    img.naturalWidth > 0 &&
                    img.naturalHeight > 0 &&
                    (img.naturalWidth < 20 || img.naturalHeight < 20)
                ) {
                    tryNext();
                }
            });
        });
    }

    async function fetchMarcXml(url) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/marcxml+xml' }
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ' — ' + url);
        }

        const xml = await response.text();
        if (!xml || !/<(?:\w+:)?record\b/i.test(xml)) {
            throw new Error('Réponse MARCXML invalide — ' + url);
        }
        return xml;
    }

    function addMarcValue(target, tag, code, value) {
        const cleanValue = clean(value);
        if (!cleanValue) return;

        if (!target[tag]) target[tag] = {};
        const previous = target[tag][code];

        if (previous == null || previous === '') {
            target[tag][code] = cleanValue;
        } else if (Array.isArray(previous)) {
            if (!previous.includes(cleanValue)) previous.push(cleanValue);
        } else if (previous !== cleanValue) {
            target[tag][code] = [previous, cleanValue];
        }
    }

    function parseMarcXml(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');

        if (doc.querySelector('parsererror')) {
            throw new Error('MARCXML illisible.');
        }

        const marc = {};
        const fields = Array.from(doc.getElementsByTagNameNS('*', 'datafield'));

        fields.forEach(field => {
            const tag = clean(field.getAttribute('tag'));
            if (!tag) return;

            Array.from(field.getElementsByTagNameNS('*', 'subfield')).forEach(subfield => {
                const code = clean(subfield.getAttribute('code'));
                if (!code) return;
                addMarcValue(marc, tag, code, subfield.textContent);
            });
        });

        return marc;
    }

    function marcValue(marc, tag, code) {
        return marc?.[String(tag)]?.[String(code)] ?? '';
    }

    function firstMarcValue(marc, candidates) {
        for (const [tag, code] of candidates) {
            const value = marcValue(marc, tag, code);
            if (Array.isArray(value)) {
                const first = value.find(Boolean);
                if (first) return first;
            } else if (clean(value)) {
                return clean(value);
            }
        }
        return '';
    }

    async function fetchMarcForBiblio(biblionumber) {
        if (!biblionumber) return {};

        const id = encodeURIComponent(biblionumber);
        const candidates = [
            '/api/v1/biblios/' + id,
            '/api/v1/public/biblios/' + id
        ];

        for (const url of candidates) {
            try {
                return parseMarcXml(await fetchMarcXml(url));
            } catch (error) {
                console.warn('[PMK142] MARCXML indisponible', url, error);
            }
        }

        return {};
    }

    async function fetchItemsForBiblio(biblionumber) {
        if (!biblionumber) return [];

        const id = encodeURIComponent(biblionumber);
        const candidates = [
            '/api/v1/biblios/' + id + '/items?_per_page=200',
            '/api/v1/public/biblios/' + id + '/items?_per_page=200'
        ];

        for (const url of candidates) {
            try {
                const data = await fetchJson(url);
                const rows = Array.isArray(data) ? data : (data?.items || []);
                if (rows.length) {
                    return rows.map(item => normalizeApiItem(item, biblionumber));
                }
            } catch (error) {
                console.warn('[PMK142] Essai API exemplaires échoué', url, error);
            }
        }

        return [];
    }

    async function fetchItemById(itemId, fallbackBiblionumber) {
        const id = clean(itemId);
        if (!id) return null;

        try {
            const raw = await fetchJson('/api/v1/items/' + encodeURIComponent(id));
            return normalizeApiItem(raw, fallbackBiblionumber);
        } catch (error) {
            console.warn('[PMK142] API exemplaire indisponible pour', id, error);
            return null;
        }
    }

    async function fetchBundleItems(bundleItemId) {
        const id = clean(bundleItemId);
        if (!id) return [];

        const perPage = 100;
        const out = [];

        for (let page = 1; page <= 100; page += 1) {
            const url = '/api/v1/items/' + encodeURIComponent(id)
                + '/bundled_items?_per_page=' + perPage
                + '&_page=' + page;

            const rows = await fetchJson(url);
            const batch = Array.isArray(rows) ? rows : (rows?.items || []);

            if (!batch.length) break;
            out.push(...batch);

            if (batch.length < perPage) break;
        }

        return out;
    }

    async function fetchBundleHostItem(bundleItemId) {
        const id = clean(bundleItemId);
        if (!id) return null;

        try {
            return await fetchJson('/api/v1/items/' + encodeURIComponent(id));
        } catch (error) {
            console.warn('[PMK142] Exemplaire hôte du paquet indisponible', id, error);
            return null;
        }
    }

    function bundleSourceName(bundleItemId, hostItem) {
        const pageTitle = clean(document.querySelector('h1')?.textContent)
            .replace(/^Détails pour\\s*/i, '')
            .replace(/^Details for\\s*/i, '');

        const barcode = clean(hostItem?.external_id || hostItem?.barcode);
        const suffix = barcode || ('exemplaire ' + bundleItemId);

        return pageTitle
            ? 'Paquet — ' + pageTitle + ' — ' + suffix
            : 'Paquet — ' + suffix;
    }

    async function openBundleBibliography(bundleItemId, button) {
        const itemId = clean(bundleItemId);
        if (!itemId) return;

        const originalHtml = button?.innerHTML || '';

        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Chargement…';
        }

        try {
            const [items, hostItem] = await Promise.all([
                fetchBundleItems(itemId),
                fetchBundleHostItem(itemId)
            ]);

            if (!items.length) {
                alert('Ce paquet ne contient actuellement aucun exemplaire.');
                return;
            }

            const payload = {
                kind: 'koha-bundle',
                type: 'item',
                name: bundleSourceName(itemId, hostItem),
                bundleItemId: itemId,
                hostItem: hostItem || null,
                entries: items
            };

            sessionStorage.setItem(SESSION_SOURCE_KEY, JSON.stringify(payload));
            window.location.href = PAGE_URL + '&source=session&bundle=' + encodeURIComponent(itemId);
        } catch (error) {
            console.error('[PMK142] Impossible de charger le paquet', error);
            alert('Impossible de charger le contenu du paquet. Vérifiez vos droits sur l’API Koha.');
        } finally {
            if (button && document.contains(button)) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        }
    }

    function findBundleScope(table) {
        if (!table) return null;

        return table.closest('td.bundle')
            || table.closest('tr.bundle')
            || table.closest('.bundle')
            || table.closest('td')
            || table.parentElement;
    }

    function hasBundleBibliographyButton(scope, bundleItemId) {
        if (!scope || !bundleItemId) return false;

        return Array.from(
            scope.querySelectorAll('.pmk142-bundle-bibliography[data-bundle-item]')
        ).some(button => clean(button.dataset.bundleItem) === clean(bundleItemId));
    }

    function findOrCreateBundleToolbar(table, bundleItemId) {
        const scope = findBundleScope(table);
        if (!scope) return null;

        let toolbar = scope.querySelector('.btn-toolbar');

        if (toolbar) {
            return toolbar;
        }

        /*
         * DataTables peut avoir déjà enveloppé table.tbundle dans plusieurs
         * conteneurs. Si la barre native Koha n'est plus accessible dans le
         * sous-arbre immédiat, on crée une barre PMK juste au-dessus du
         * wrapper du tableau.
         */
        const wrapper =
            table.closest('.dt-container')
            || table.closest('.dataTables_wrapper')
            || table;

        toolbar = document.createElement('div');
        toolbar.className = 'btn-toolbar pmk142-bundle-toolbar';
        toolbar.dataset.bundleItem = bundleItemId;
        toolbar.setAttribute('role', 'toolbar');
        toolbar.style.marginBottom = '8px';

        wrapper.parentNode?.insertBefore(toolbar, wrapper);

        return toolbar;
    }

    function injectBundleBibliographyButtons() {
        if (!config.enabled || !config.injectBundleButton || !isCatalogueDetailPage()) return;

        document.querySelectorAll('table.tbundle[data-itemnumber]').forEach(table => {
            const bundleItemId = clean(table.dataset.itemnumber);
            if (!bundleItemId) return;

            const scope = findBundleScope(table);
            if (!scope) return;

            if (hasBundleBibliographyButton(scope, bundleItemId)) return;

            const toolbar = findOrCreateBundleToolbar(table, bundleItemId);
            if (!toolbar) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-default pmk142-bundle-bibliography';
            button.dataset.bundleItem = bundleItemId;
            button.innerHTML =
                '<i class="fa-solid fa-file-lines" aria-hidden="true"></i> ' +
                'Créer une bibliographie';
            button.title = 'Créer une bibliographie à partir des exemplaires de ce paquet';

            button.addEventListener('click', () => openBundleBibliography(bundleItemId, button));
            toolbar.appendChild(button);
        });
    }

    let bundleInjectionTimer = null;

    function scheduleBundleBibliographyInjection() {
        if (!isCatalogueDetailPage()) return;

        if (bundleInjectionTimer) {
            window.clearTimeout(bundleInjectionTimer);
        }

        bundleInjectionTimer = window.setTimeout(() => {
            bundleInjectionTimer = null;
            injectBundleBibliographyButtons();

            /*
             * Le contenu du paquet est construit puis transformé en DataTable
             * de façon asynchrone par Koha. On refait quelques passes courtes
             * pour couvrir ces différentes étapes sans polling permanent.
             */
            [120, 350, 800, 1500].forEach(delay => {
                window.setTimeout(injectBundleBibliographyButtons, delay);
            });
        }, 0);
    }

    function installBundleOpenHook() {
        if (!isCatalogueDetailPage()) return;
        if (window.__PMK142_BUNDLE_OPEN_HOOK__) return;
        window.__PMK142_BUNDLE_OPEN_HOOK__ = true;

        document.addEventListener('click', event => {
            if (!event.target.closest(
                '#holdings_table tbody button.details-control, ' +
                '#otherholdings_table tbody button.details-control'
            )) return;

            scheduleBundleBibliographyInjection();
        }, true);
    }

    async function enrichNotice(biblio) {
        if (!biblio?.biblionumber) return biblio;

        let raw = null;
        let marc = {};

        const [jsonResult, marcResult] = await Promise.allSettled([
            fetchJson('/api/v1/biblios/' + encodeURIComponent(biblio.biblionumber)),
            fetchMarcForBiblio(biblio.biblionumber)
        ]);

        if (jsonResult.status === 'fulfilled') raw = jsonResult.value;
        if (marcResult.status === 'fulfilled') marc = marcResult.value || {};

        const summary330 = firstMarcValue(marc, [['330', 'a']]);
        const publisher = firstMarcValue(marc, [['214', 'c'], ['210', 'c']]);
        const publicationYear = firstMarcValue(marc, [['214', 'd'], ['210', 'd']]);
        const collection = firstMarcValue(marc, [['225', 'a']]);
        const isbn = firstMarcValue(marc, [['010', 'a']]);
        const publicAudience = firstMarcValue(marc, [['999', 'q']]);
        const sublocationLocal = firstMarcValue(marc, [['999', 'y']]);

        const enriched = {
            ...biblio,
            title: clean(raw?.title) || biblio.title,
            subtitle: clean(raw?.subtitle) || biblio.subtitle,
            author: clean(raw?.author) || biblio.author,
            editor: clean(raw?.editor) || biblio.editor,
            publisher: publisher || biblio.publisher || '',
            publication_year: publicationYear || biblio.publication_year || '',
            summary: summary330 || biblio.summary || '',
            collection: collection || biblio.collection || '',
            isbn: isbn || biblio.isbn || '',
            public_audience: publicAudience || biblio.public_audience || '',
            sublocation_local: sublocationLocal || biblio.sublocation_local || '',
            medium: clean(raw?.medium) || biblio.medium,
            part_number: clean(raw?.part_number || raw?.partnumber) || biblio.part_number,
            part_name: clean(raw?.part_name || raw?.partname) || biblio.part_name,
            uniform_title: clean(raw?.uniform_title || raw?.unititle) || biblio.uniform_title,
            series_title: clean(raw?.series_title || raw?.seriestitle) || biblio.series_title,
            copyright_date: clean(raw?.copyright_date || raw?.copyrightdate) || biblio.copyright_date,
            abstract: clean(raw?.abstract) || biblio.abstract,
            notes: clean(raw?.notes) || biblio.notes,
            creation_date: clean(raw?.creation_date || raw?.datecreated) || biblio.creation_date,
            last_modified: clean(raw?.last_modified || raw?.timestamp) || biblio.last_modified,
            framework_id: clean(raw?.framework_id || raw?.frameworkcode) || biblio.framework_id,
            marc,
            api: raw,
            raw: { ...(biblio.raw || {}), api: raw, marc }
        };

        const coverCandidates = await resolveCoverCandidates(enriched, marc);
        enriched.coverCandidates = coverCandidates;
        enriched.cover = coverCandidates[0] || clean(biblio.cover);

        return enriched;
    }

    async function buildRecordsFromPmk(list, entries, mode, allItemsForItemLists) {
        const listType = list?.type || 'notice';

        if (listType === 'notice') {
            const notices = entries.map(normalizeStoredNotice);
            const out = [];
            for (const biblio of notices) {
                const enriched = await enrichNotice(biblio);
                const items = mode === 'notice' ? [] : await fetchItemsForBiblio(biblio.biblionumber);
                if (mode === 'item') {
                    if (items.length) items.forEach(item => out.push({ biblio: enriched, item, items: [item] }));
                    else out.push({ biblio: enriched, item: null, items: [] });
                } else {
                    out.push({ biblio: enriched, item: null, items });
                }
            }
            return out;
        }

        const selectedItems = entries.map(normalizeStoredItem);
        const grouped = new Map();
        selectedItems.forEach(item => {
            const key = item.biblionumber || ('item:' + item.item_id);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(item);
        });

        const out = [];
        for (const [bib, group] of grouped.entries()) {
            const first = group[0];
            const biblio = await enrichNotice(normalizeStoredNotice({
                biblionumber: first.biblionumber,
                title: first.title,
                subtitle: first.subtitle
            }));

            let items = group;
            if (allItemsForItemLists && first.biblionumber) {
                const fetched = await fetchItemsForBiblio(first.biblionumber);
                if (fetched.length) items = fetched;
            }

            if (mode === 'item') {
                items.forEach(item => out.push({ biblio, item, items: [item] }));
            } else {
                out.push({ biblio, item: null, items });
            }
        }
        return out;
    }

    async function buildRecordsFromCourseReserves(entries, mode, allItemsForCourse) {
        const grouped = new Map();

        (entries || []).forEach(raw => {
            const bib = clean(raw?.biblionumber || raw?.biblioNumber || raw?.biblio_id);
            if (!bib) return;

            if (!grouped.has(bib)) grouped.set(bib, []);
            grouped.get(bib).push(raw);
        });

        const out = [];

        for (const [bib, group] of grouped.entries()) {
            const first = group[0] || {};
            const biblio = await enrichNotice(normalizeStoredNotice({
                biblionumber: bib,
                title: first.title,
                subtitle: first.subtitle,
                author: first.author,
                link: first.link
            }));

            if (mode === 'notice') {
                out.push({ biblio, item: null, items: [] });
                continue;
            }

            const hasBiblioLevelReserve = group.some(entry =>
                !clean(entry?.item_id || entry?.itemnumber || entry?.itemNumber)
            );

            const selectedItems = [];
            for (const entry of group) {
                const itemId = clean(entry?.item_id || entry?.itemnumber || entry?.itemNumber);
                if (!itemId) continue;

                const fetched = await fetchItemById(itemId, bib);
                const normalized = fetched || normalizeStoredItem(entry);

                if (
                    normalized?.item_id &&
                    !selectedItems.some(item => itemVisibilityKey(item) === itemVisibilityKey(normalized))
                ) {
                    selectedItems.push(normalized);
                }
            }

            let items = selectedItems;

            /*
             * Une réserve au niveau notice porte sur la notice entière :
             * dans les modes qui affichent les exemplaires, on récupère donc
             * les exemplaires de la notice. L'option "tous les exemplaires"
             * permet aussi d'élargir volontairement une réserve item-level.
             */
            if ((hasBiblioLevelReserve || allItemsForCourse) && bib) {
                const fetched = await fetchItemsForBiblio(bib);
                if (fetched.length) items = fetched;
            }

            if (mode === 'item') {
                if (items.length) {
                    items.forEach(item => out.push({ biblio, item, items: [item] }));
                } else {
                    out.push({ biblio, item: null, items: [] });
                }
            } else {
                out.push({ biblio, item: null, items });
            }
        }

        return out;
    }

    function collectNativeKohaListEntries() {
        const seen = new Set();
        const notices = [];

        document.querySelectorAll(
            'input[name="biblionumber"], input.selection[name="biblionumber"], a[href*="detail.pl?biblionumber="]'
        ).forEach(node => {
            let id = '';
            if (node.matches('input')) id = clean(node.value);
            else {
                try { id = new URL(node.href, window.location.origin).searchParams.get('biblionumber') || ''; }
                catch (_) {}
            }
            if (!/^\d+$/.test(id) || seen.has(id)) return;
            seen.add(id);

            const row = node.closest('tr') || node.closest('.bibliocol') || node.parentElement;
            const titleLink = row?.querySelector('a[href*="detail.pl?biblionumber="]') || (node.matches('a') ? node : null);
            const coverImg =
                row?.querySelector('.cover-image img[src]') ||
                row?.querySelector('.bookcoverimg img[src]') ||
                row?.querySelector('img[src*="cover"]') ||
                row?.querySelector('img[src*="image.pl"]');

            notices.push({
                biblionumber: id,
                title: clean(titleLink?.textContent) || 'Notice #' + id,
                link: titleLink?.href || '/cgi-bin/koha/catalogue/detail.pl?biblionumber=' + id,
                imgSrc: coverImg?.src || coverImg?.getAttribute('src') || ''
            });
        });
        return notices;
    }

    function injectKohaNativeListButton() {
        if (!config.enabled || !config.injectKohaListsButton || !isKohaNativeListPage()) return;
        if (document.getElementById('pmk142-koha-list-button')) return;

        const anchor =
            document.querySelector('.btn-toolbar') ||
            document.querySelector('#toolbar') ||
            document.querySelector('main .row') ||
            document.querySelector('#main');

        if (!anchor) return;

        const button = document.createElement('button');
        button.id = 'pmk142-koha-list-button';
        button.type = 'button';
        button.className = 'btn btn-default';
        button.innerHTML = '<i class="fa-solid fa-file-lines" aria-hidden="true"></i> Créer une bibliographie';

        button.addEventListener('click', () => {
            const entries = collectNativeKohaListEntries();
            if (!entries.length) {
                alert('Aucune notice n’a pu être identifiée dans cette liste Koha.');
                return;
            }
            sessionStorage.setItem(SESSION_SOURCE_KEY, JSON.stringify({
                kind: 'koha-native',
                type: 'notice',
                name: clean(document.querySelector('h1')?.textContent) || 'Liste Koha',
                entries
            }));
            window.location.href = PAGE_URL + '&source=session';
        });

        anchor.appendChild(button);
    }

    function collectKohaBasketEntries() {
        const seen = new Set();
        const entries = [];

        document.querySelectorAll('input.select_record[value]').forEach(input => {
            const bib = clean(input.value);
            if (!/^\d+$/.test(bib) || seen.has(bib)) return;
            seen.add(bib);

            const scope =
                input.closest('tr')
                || input.closest('h3')?.parentElement
                || input.parentElement;

            const titleLink =
                scope?.querySelector('a[href*="/catalogue/detail.pl?biblionumber="]')
                || document.querySelector(
                    'a[href*="/catalogue/detail.pl?biblionumber=' + CSS.escape(bib) + '"]'
                );

            const coverImg =
                scope?.querySelector('.cover-image img[src]')
                || scope?.querySelector('img[src*="cover"]')
                || scope?.querySelector('img[src*="image.pl"]');

            entries.push({
                biblionumber: bib,
                title: clean(titleLink?.textContent) || 'Notice #' + bib,
                link: titleLink?.href || '/cgi-bin/koha/catalogue/detail.pl?biblionumber=' + bib,
                imgSrc: coverImg?.src || coverImg?.getAttribute('src') || ''
            });
        });

        /*
         * Secours : dans une présentation atypique du panier, les liens
         * vers detail.pl permettent quand même de récupérer les notices.
         */
        if (!entries.length) {
            document.querySelectorAll('a[href*="/catalogue/detail.pl?biblionumber="]').forEach(link => {
                try {
                    const bib = clean(
                        new URL(link.href, window.location.origin)
                            .searchParams.get('biblionumber')
                    );
                    if (!/^\d+$/.test(bib) || seen.has(bib)) return;
                    seen.add(bib);
                    entries.push({
                        biblionumber: bib,
                        title: clean(link.textContent) || 'Notice #' + bib,
                        link: link.href
                    });
                } catch (_) {}
            });
        }

        return entries;
    }

    function injectKohaBasketButton() {
        if (!config.enabled || !config.injectBasketButton || !isKohaBasketPage()) return;
        if (document.getElementById('pmk142-basket-button')) return;

        const toolbar =
            document.querySelector('#toolbar.btn-toolbar')
            || document.querySelector('#toolbar')
            || document.querySelector('.btn-toolbar');

        if (!toolbar) return;

        const button = document.createElement('button');
        button.id = 'pmk142-basket-button';
        button.type = 'button';
        button.className = 'btn btn-default';
        button.innerHTML =
            '<i class="fa-solid fa-file-lines" aria-hidden="true"></i> ' +
            'Créer une bibliographie';
        button.title = 'Créer une bibliographie avec le contenu du panier Koha';

        button.addEventListener('click', () => {
            const entries = collectKohaBasketEntries();

            if (!entries.length) {
                alert('Aucune notice n’a pu être identifiée dans le panier Koha.');
                return;
            }

            sessionStorage.setItem(SESSION_SOURCE_KEY, JSON.stringify({
                kind: 'koha-basket',
                type: 'notice',
                name: 'Panier Koha',
                entries
            }));

            /*
             * Le panier Koha est souvent ouvert dans une fenêtre dédiée.
             * On garde cette même fenêtre pour conserver son sessionStorage.
             */
            window.location.href = PAGE_URL + '&source=session';
        });

        toolbar.appendChild(button);
    }

    function courseReserveRows(table) {
        if (!table) return [];

        /*
         * course-details.pl transforme le tableau en DataTable. En cas de
         * pagination, les lignes des autres pages peuvent être détachées du
         * DOM : on demande donc toutes les lignes à l'API DataTables quand
         * elle est disponible.
         */
        try {
            if (
                window.jQuery
                && window.jQuery.fn?.dataTable?.isDataTable
                && window.jQuery.fn.dataTable.isDataTable(table)
            ) {
                const api = window.jQuery(table).DataTable();
                const nodes = api.rows().nodes().toArray();
                if (nodes.length) return nodes;
            }
        } catch (error) {
            console.warn('[PMK142] Lecture DataTables réserve de cours impossible', error);
        }

        return Array.from(table.querySelectorAll('tbody tr'));
    }

    function collectCourseReserveEntries() {
        const table = document.getElementById('course_reserves_table');
        if (!table) return [];

        const entries = [];
        const seen = new Set();

        courseReserveRows(table).forEach(row => {
            const detailLink = row.querySelector(
                'a[href*="/catalogue/detail.pl?biblionumber="]'
            );
            if (!detailLink) return;

            let bib = '';
            try {
                bib = clean(
                    new URL(detailLink.href, window.location.origin)
                        .searchParams.get('biblionumber')
                );
            } catch (_) {}

            if (!/^\d+$/.test(bib)) return;

            const itemLink = row.querySelector(
                'a[href*="/catalogue/moredetail.pl?itemnumber="]'
            );

            let itemId = '';
            let barcode = '';

            if (itemLink) {
                try {
                    itemId = clean(
                        new URL(itemLink.href, window.location.origin)
                            .searchParams.get('itemnumber')
                    );
                } catch (_) {}
                barcode = clean(itemLink.textContent);
            }

            const key = bib + '|' + (itemId || 'biblio');
            if (seen.has(key)) return;
            seen.add(key);

            entries.push({
                entryType: itemId ? 'item' : 'notice',
                biblionumber: bib,
                item_id: itemId,
                barcode,
                title: clean(detailLink.textContent) || 'Notice #' + bib,
                author: clean(row.cells?.[1]?.textContent),
                link: detailLink.href
            });
        });

        return entries;
    }

    function courseSourceName() {
        const h1 = clean(document.querySelector('h1')?.textContent);
        if (!h1) return 'Réserve de cours';

        return h1
            .replace(/^Course details for\s*/i, '')
            .replace(/^Détails du cours\s*/i, '')
            .replace(/^Détails pour le cours\s*/i, '')
            .trim() || 'Réserve de cours';
    }

    function findOrCreateCourseToolbar() {
        let toolbar = document.querySelector('#toolbar');

        if (toolbar) return toolbar;

        const table = document.getElementById('course_reserves_table');
        if (!table) return null;

        toolbar = document.createElement('div');
        toolbar.id = 'pmk142-course-toolbar';
        toolbar.className = 'btn-toolbar';
        toolbar.style.marginBottom = '12px';

        const section = table.closest('.page-section') || table.parentElement;
        section?.parentNode?.insertBefore(toolbar, section);

        return toolbar;
    }

    function injectCourseReservesButton() {
        if (
            !config.enabled
            || !config.injectCourseReservesButton
            || !isCourseReservesDetailPage()
        ) return;

        if (document.getElementById('pmk142-course-reserves-button')) return;

        const entries = collectCourseReserveEntries();
        if (!entries.length) return;

        const toolbar = findOrCreateCourseToolbar();
        if (!toolbar) return;

        const button = document.createElement('button');
        button.id = 'pmk142-course-reserves-button';
        button.type = 'button';
        button.className = 'btn btn-default';
        button.innerHTML =
            '<i class="fa-solid fa-file-lines" aria-hidden="true"></i> ' +
            'Créer une bibliographie';
        button.title = 'Créer une bibliographie à partir des réserves de ce cours';

        button.addEventListener('click', () => {
            const currentEntries = collectCourseReserveEntries();

            if (!currentEntries.length) {
                alert('Aucune réserve n’a pu être identifiée pour ce cours.');
                return;
            }

            sessionStorage.setItem(SESSION_SOURCE_KEY, JSON.stringify({
                kind: 'koha-course-reserves',
                type: 'mixed',
                name: courseSourceName(),
                courseId: query().get('course_id') || '',
                entries: currentEntries
            }));

            window.location.href = PAGE_URL + '&source=session';
        });

        toolbar.appendChild(button);
    }

    async function openActivePmkList(type) {
        const api = await listsApi();
        if (!api) return;
        const list = await api.getActiveList(type);
        if (!list) {
            alert('Aucune liste active.');
            return;
        }
        window.location.href = PAGE_URL +
            '&source=pmk&list=' + encodeURIComponent(list.id) +
            '&type=' + encodeURIComponent(list.type || type);
    }

    function injectPersonalListButtons() {
        if (!config.enabled || !config.injectPersonalListsButton) return;
        const panel = document.getElementById('kx-temp-lists-panel');
        if (!panel) return;

        ['notices', 'items'].forEach(tab => {
            const pane = panel.querySelector('[data-pane="' + tab + '"]');
            const actions = pane?.querySelector('.kx-tl-actions');
            if (!actions || actions.querySelector('.pmk142-open-builder')) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kx-tl-action is-wide pmk142-open-builder';
            button.innerHTML = '<i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>Créer une bibliographie</span>';
            button.addEventListener('click', () => openActivePmkList(tab === 'items' ? 'item' : 'notice'));
            actions.appendChild(button);
        });
    }

    function installIntegrationObserver() {
        const observer = new MutationObserver(() => {
            injectPersonalListButtons();
            injectKohaNativeListButton();
            injectKohaBasketButton();
            injectCourseReservesButton();
            scheduleBundleBibliographyInjection();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        installBundleOpenHook();
    }

    function installStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ROOT_ID} {
                position: fixed;
                inset: 0;
                z-index: 11000;
                display: flex;
                flex-direction: column;
                background: #e8efe9;
                color: #26352d;
                font-family: inherit;
            }
            #${ROOT_ID} * { box-sizing: border-box; }
            #${ROOT_ID} button,
            #${ROOT_ID} input,
            #${ROOT_ID} select,
            #${ROOT_ID} textarea { font: inherit; }
            #${ROOT_ID} .pmk142-topbar {
                display: flex;
                align-items: center;
                gap: 10px;
                min-height: 58px;
                padding: 9px 14px;
                background: linear-gradient(135deg, #315f46 0%, #487a57 100%);
                color: #fff;
                border-bottom: 1px solid #234c37;
                box-shadow: 0 2px 10px rgba(35,76,55,.28);
            }
            #${ROOT_ID} .pmk142-title { flex: 1; min-width: 0; }
            #${ROOT_ID} .pmk142-title strong { display:block; font-size:16px; }
            #${ROOT_ID} .pmk142-title small { color:#d8e2ea; }
            #${ROOT_ID} .pmk142-topbar button {
                border: 1px solid rgba(255,255,255,.34);
                border-radius: 7px;
                background: rgba(255,255,255,.12);
                color: #fff;
                padding: 7px 10px;
                cursor: pointer;
            }
            #${ROOT_ID} .pmk142-layout {
                flex: 1;
                min-height: 0;
                display: grid;
                grid-template-columns: 300px minmax(420px, 1fr) 330px;
                gap: 0;
            }
            #${ROOT_ID} .pmk142-panel {
                min-height: 0;
                overflow: auto;
                background: #f2f6f3;
                border-right: 1px solid #afc2b4;
                padding: 12px;
            }
            #${ROOT_ID} .pmk142-panel-right {
                border-right: 0;
                border-left: 1px solid #afc2b4;
            }
            #${ROOT_ID} .pmk142-preview-wrap {
                min-width: 0;
                min-height: 0;
                overflow: auto;
                padding: 22px;
                background: #dde7df;
            }
            #${ROOT_ID} .pmk142-section {
                margin-bottom: 12px;
                padding: 12px;
                border: 1px solid #b8c9bd;
                border-left: 4px solid #5f8f6a;
                border-radius: 9px;
                background: #ffffff;
                box-shadow: 0 1px 3px rgba(47,83,59,.08);
            }
            #${ROOT_ID} .pmk142-section:nth-child(even) {
                background: #f9fbf9;
            }
            #${ROOT_ID} .pmk142-section h3 {
                margin: -12px -12px 11px -12px;
                padding: 8px 10px;
                border-bottom: 1px solid #bfd0c3;
                border-radius: 8px 8px 0 0;
                background: #dfece2;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: .045em;
                color: #315f46;
                font-weight: 800;
            }
            #${ROOT_ID} label {
                display:block;
                margin:8px 0 4px;
                font-size:11px;
                font-weight:750;
                color:#405d49;
            }
            #${ROOT_ID} input[type="text"],
            #${ROOT_ID} input[type="number"],
            #${ROOT_ID} select,
            #${ROOT_ID} textarea {
                width:100%;
                padding:7px 8px;
                border:1px solid #aabfaf;
                border-radius:6px;
                background:#fff;
                color:#26352d;
                box-shadow: inset 0 1px 1px rgba(42,74,51,.04);
            }
            #${ROOT_ID} input[type="text"]:focus,
            #${ROOT_ID} input[type="number"]:focus,
            #${ROOT_ID} select:focus,
            #${ROOT_ID} textarea:focus {
                border-color:#4f7f59;
                outline:2px solid rgba(79,127,89,.16);
                outline-offset:0;
            }
            #${ROOT_ID} .pmk142-topbar button:hover {
                background:rgba(255,255,255,.22);
                border-color:rgba(255,255,255,.5);
            }
            #${ROOT_ID} .pmk142-panel .pmk142-section + .pmk142-section {
                margin-top:14px;
            }
            #${ROOT_ID} .pmk142-panel-right .pmk142-section {
                border-left-color:#467653;
            }
            #${ROOT_ID} .pmk142-panel-right .pmk142-section h3 {
                background:#d8e8dc;
                color:#2f5f43;
            }

            #${ROOT_ID} .pmk142-row { display:flex; gap:6px; align-items:center; }
            #${ROOT_ID} .pmk142-row > * { min-width:0; }
            #${ROOT_ID} .pmk142-btn {
                border:1px solid #9fb5a4;
                border-radius:6px;
                background:#f7faf8;
                color:#315f46;
                padding:6px 8px;
                cursor:pointer;
            }
            #${ROOT_ID} .pmk142-btn:hover {
                background:#e4efe6;
                border-color:#789b80;
            }
            #${ROOT_ID} .pmk142-btn-primary {
                background:#4f7f59;
                color:#fff;
                border-color:#416c4b;
            }
            #${ROOT_ID} .pmk142-btn-primary:hover {
                background:#426f4c;
                border-color:#355c3e;
            }
            #${ROOT_ID} .pmk142-btn-danger { color:#9d2525; }
            #${ROOT_ID} .pmk142-muted {
                color:#687a6e;
                font-size:11px;
                line-height:1.35;
            }
            #${ROOT_ID} .pmk142-source-summary {
                padding:8px 9px;
                border:1px solid #afc2b4;
                border-radius:7px;
                background:#edf5ef;
                line-height:1.35;
            }
            #${ROOT_ID} .pmk142-source-summary strong {
                display:block;
                margin-bottom:2px;
            }
            .pmk142-bundle-toolbar {
                display:flex;
                flex-wrap:wrap;
                gap:5px;
                align-items:center;
            }
            #${ROOT_ID} .pmk142-block-list { display:flex; flex-direction:column; gap:5px; }
            #${ROOT_ID} .pmk142-block {
                display:flex;
                align-items:center;
                gap:6px;
                padding:7px;
                border:1px solid #b6c8ba;
                border-radius:7px;
                background:#f7faf8;
                cursor:grab;
                box-shadow:0 1px 2px rgba(44,76,53,.05);
            }
            #${ROOT_ID} .pmk142-block:hover {
                border-color:#7fa087;
                background:#edf5ef;
            }
            #${ROOT_ID} .pmk142-block.is-selected {
                border-color:#4f7f59;
                background:#dcebdd;
                box-shadow:0 0 0 2px rgba(79,127,89,.14);
            }
            #${ROOT_ID} .pmk142-block .grab { color:#82909c; }
            #${ROOT_ID} .pmk142-block .name { flex:1; min-width:0; font-size:11px; }
            #${ROOT_ID} .pmk142-a4 {
                margin: 0 auto;
                background:#fff;
                border:1px solid #c5d1c8;
                box-shadow:0 6px 30px rgba(42,75,51,.18);
                min-height:297mm;
                width:210mm;
                padding:12mm;
            }
            #${ROOT_ID} .pmk142-a4.landscape {
                width:297mm;
                min-height:210mm;
            }
            #${ROOT_ID} .pmk142-doc-title {
                margin:0 0 8mm;
                padding-bottom:3mm;
                border-bottom:2px solid #d7e2da;
                font-size:24px;
                font-weight:850;
                line-height:1.1;
                color:#26352d;
            }
            #${ROOT_ID} .pmk142-grid { display:grid; align-items:start; }
            #${ROOT_ID} .pmk142-card {
                min-width:0;
                break-inside:avoid;
                page-break-inside:avoid;
                overflow:visible;
            }
            #${ROOT_ID} .pmk142-card::after {
                content:"";
                display:block;
                clear:both;
            }
            #${ROOT_ID} .pmk142-block-wrap {
                max-width:100%;
                box-sizing:border-box;
            }
            #${ROOT_ID} .pmk142-card.has-border { border:1px solid #d8dfe4; border-radius:6px; }
            #${ROOT_ID} .pmk142-cover {
                display:block;
                max-width:100%;
                object-fit:cover;
                background:#f2f4f5;
                border:1px solid #e0e4e7;
                margin-bottom:5px;
            }
            #${ROOT_ID} .pmk142-field { overflow-wrap:anywhere; }
            #${ROOT_ID} .pmk142-notice-link a,
            #${ROOT_ID} .pmk142-catalogue-link a {
                color:#0b62a4;
                text-decoration:underline;
                text-underline-offset:2px;
            }
            #${ROOT_ID} .pmk142-notice-link-print-url {
                display:none;
                overflow-wrap:anywhere;
                font-size:.85em;
            }
            #${ROOT_ID} .pmk142-field-label { font-weight:700; }
            #${ROOT_ID} .pmk142-items { margin-top:5px; border-top:1px solid #e3e7ea; padding-top:4px; }
            #${ROOT_ID} .pmk142-itemline { margin:2px 0; }
            #${ROOT_ID} .pmk142-items-table-wrap { overflow-x:auto; }
            #${ROOT_ID} .pmk142-items-table {
                width:100%;
                border-collapse:collapse;
                table-layout:auto;
            }
            #${ROOT_ID} .pmk142-items-table th,
            #${ROOT_ID} .pmk142-items-table td {
                padding:3px 4px;
                border:1px solid #dfe4e7;
                text-align:left;
                vertical-align:top;
                overflow-wrap:anywhere;
            }
            #${ROOT_ID} .pmk142-items-table th {
                background:#f4f6f7;
                font-weight:750;
            }
            #${ROOT_ID} .pmk142-badge {
                display:inline-block;
                padding:3px 7px;
                border-radius:999px;
                background:#edf4e8;
                color:#3d642d;
                font-weight:750;
            }
            #${ROOT_ID} .pmk142-group-title {
                grid-column:1/-1;
                margin:8mm 0 3mm;
                padding-bottom:2mm;
                border-bottom:2px solid #485f70;
                font-size:18px;
                font-weight:850;
            }
            #${ROOT_ID} .pmk142-status {
                position:absolute;
                inset:58px 0 0;
                z-index:3;
                display:flex;
                align-items:center;
                justify-content:center;
                background:rgba(232,239,233,.92);
                color:#315f46;
                font-size:14px;
                font-weight:750;
            }
            #${ROOT_ID} .pmk142-status[hidden] { display:none; }

            #${ROOT_ID} .pmk142-content-modal {
                position:absolute;
                inset:0;
                z-index:20;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:24px;
                background:rgba(31,61,43,.58);
            }
            #${ROOT_ID} .pmk142-content-modal[hidden] { display:none; }
            #${ROOT_ID} .pmk142-content-dialog {
                width:min(980px, 96vw);
                max-height:90vh;
                display:flex;
                flex-direction:column;
                background:#fff;
                border-radius:10px;
                box-shadow:0 18px 60px rgba(0,0,0,.28);
                overflow:hidden;
            }
            #${ROOT_ID} .pmk142-content-header,
            #${ROOT_ID} .pmk142-content-footer {
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                padding:12px 14px;
                border-bottom:1px solid #bed0c2;
            }
            #${ROOT_ID} .pmk142-content-footer {
                border-top:1px solid #e1e6ea;
                border-bottom:0;
            }
            #${ROOT_ID} .pmk142-content-header strong {
                font-size:15px;
            }
            #${ROOT_ID} .pmk142-content-tools {
                display:grid;
                grid-template-columns:minmax(220px,1fr) auto auto;
                gap:7px;
                padding:10px 14px;
                border-bottom:1px solid #e1e6ea;
                background:#edf4ef;
            }
            #${ROOT_ID} .pmk142-content-list {
                flex:1;
                overflow:auto;
                padding:10px 14px 18px;
            }
            #${ROOT_ID} .pmk142-content-biblio {
                margin-bottom:8px;
                border:1px solid #b7c9bb;
                border-radius:8px;
                overflow:hidden;
            }
            #${ROOT_ID} .pmk142-content-biblio-label {
                display:flex;
                align-items:flex-start;
                gap:8px;
                margin:0;
                padding:9px 10px;
                background:#e4efe7;
                color:#315f46;
                cursor:pointer;
            }
            #${ROOT_ID} .pmk142-content-biblio-label > span {
                display:flex;
                flex-wrap:wrap;
                gap:4px 10px;
                align-items:baseline;
            }
            #${ROOT_ID} .pmk142-content-biblio-label small {
                color:#687a6e;
                font-weight:400;
            }
            #${ROOT_ID} .pmk142-content-items {
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(270px,1fr));
                gap:1px;
                background:#c7d7ca;
            }
            #${ROOT_ID} .pmk142-content-items label {
                display:flex;
                align-items:flex-start;
                gap:7px;
                margin:0;
                padding:7px 10px;
                background:#fff;
                color:#3f5746;
                font-weight:400;
                cursor:pointer;
            }
            #${ROOT_ID} .pmk142-content-items input,
            #${ROOT_ID} .pmk142-content-biblio-label input {
                width:auto;
                margin-top:2px;
            }
            @media (max-width: 1200px) {
                #${ROOT_ID} .pmk142-layout { grid-template-columns:260px minmax(380px,1fr); }
                #${ROOT_ID} .pmk142-panel-right { display:none; }
            }
            @media print {
                #${ROOT_ID} .pmk142-print-mode-hide { display:none !important; }
                #${ROOT_ID} .pmk142-print-mode-url a { display:none !important; }
                #${ROOT_ID} .pmk142-print-mode-url .pmk142-notice-link-print-url { display:inline !important; }
                body > *:not(#${ROOT_ID}) { display:none !important; }
                #${ROOT_ID} { position:static; display:block; background:#fff; }
                #${ROOT_ID} .pmk142-topbar,
                #${ROOT_ID} .pmk142-panel,
                #${ROOT_ID} .pmk142-panel-right,
                #${ROOT_ID} .pmk142-status { display:none !important; }
                #${ROOT_ID} .pmk142-layout { display:block; }
                #${ROOT_ID} .pmk142-preview-wrap { padding:0; overflow:visible; }
                #${ROOT_ID} .pmk142-a4 { box-shadow:none; border:0; margin:0; width:auto; min-height:0; padding:0; }
                #${ROOT_ID} .pmk142-doc-title { color:#000; border-bottom-color:#ddd; }
            }
        `;
        document.head.appendChild(style);
    }

    const BLOCK_LIBRARY = Object.freeze([
        // Structure
        { value: 'special:text', group: 'Structure', label: 'Texte libre' },
        { value: 'special:badge', group: 'Structure', label: 'Badge' },
        { value: 'special:separator', group: 'Structure', label: 'Séparateur' },
        { value: 'special:cover', group: 'Structure', label: 'Couverture' },
        { value: 'special:qrcode', group: 'Structure', label: 'QR code catalogue' },
        { value: 'special:notice-link', group: 'Structure', label: 'Lien vers la notice' },

        // Bibliographie
        { value: 'field:biblio.title', group: 'Bibliographie', label: 'Titre' },
        { value: 'field:biblio.subtitle', group: 'Bibliographie', label: 'Sous-titre' },
        { value: 'field:biblio.author', group: 'Bibliographie', label: 'Auteur / responsabilité' },
        { value: 'field:biblio.publisher', group: 'Bibliographie', label: 'Éditeur (210$c / 214$c)' },
        { value: 'field:biblio.publication_year', group: 'Bibliographie', label: 'Année / date d’édition (210$d / 214$d)' },
        { value: 'field:biblio.collection', group: 'Bibliographie', label: 'Collection (225$a)' },
        { value: 'field:biblio.isbn', group: 'Bibliographie', label: 'ISBN (010$a)' },
        { value: 'field:biblio.summary', group: 'Bibliographie', label: 'Résumé (330$a)' },
        { value: 'field:biblio.public_audience', group: 'Bibliographie', label: 'Public (999$q)' },
        { value: 'field:biblio.sublocation_local', group: 'Bibliographie', label: 'Sous-localisation (999$y)' },
        { value: 'field:biblio.series_title', group: 'Bibliographie', label: 'Série (API)' },
        { value: 'field:biblio.notes', group: 'Bibliographie', label: 'Notes' },
        { value: 'field:biblio.medium', group: 'Bibliographie', label: 'Support / medium' },
        { value: 'field:biblio.part_number', group: 'Bibliographie', label: 'Numéro de partie' },
        { value: 'field:biblio.part_name', group: 'Bibliographie', label: 'Nom de partie' },
        { value: 'field:biblio.uniform_title', group: 'Bibliographie', label: 'Titre uniforme' },
        { value: 'field:biblio.biblionumber', group: 'Bibliographie', label: 'N° notice' },
        { value: 'field:biblio.link', group: 'Bibliographie', label: 'Lien catalogue' },

        // Exemplaires
        { value: 'field:item.barcode', group: 'Exemplaires', label: 'Code-barres exemplaire — texte' },
        { value: 'special:item-barcode-image', group: 'Exemplaires', label: 'Code-barres exemplaire — scannable' },
        { value: 'field:item.callnumber', group: 'Exemplaires', label: 'Cote' },
        { value: 'field:item.home_library_id', group: 'Exemplaires', label: 'Site propriétaire' },
        { value: 'field:item.holding_library_id', group: 'Exemplaires', label: 'Site actuel' },
        { value: 'field:item.location', group: 'Exemplaires', label: 'Localisation' },
        { value: 'field:item.permanent_location', group: 'Exemplaires', label: 'Localisation permanente' },
        { value: 'field:item.item_type_id', group: 'Exemplaires', label: 'Type de document' },
        { value: 'field:item.not_for_loan_status', group: 'Exemplaires', label: 'Statut / exclusion du prêt' },
        { value: 'field:item.acquisition_date', group: 'Exemplaires', label: 'Date d’acquisition' },
        { value: 'field:item.purchase_price', group: 'Exemplaires', label: 'Prix d’achat' },
        { value: 'field:item.replacement_price', group: 'Exemplaires', label: 'Prix de remplacement' },
        { value: 'field:item.last_checkout_date', group: 'Exemplaires', label: 'Dernier prêt' },
        { value: 'field:item.last_seen_date', group: 'Exemplaires', label: 'Dernière vue' },
        { value: 'special:items', group: 'Exemplaires', label: 'Détails exemplaires — compact' },
        { value: 'special:items-table', group: 'Exemplaires', label: 'Tableau détaillé des exemplaires' }
    ]);

    function blockLibraryOptionsHtml() {
        const groups = new Map();

        BLOCK_LIBRARY.forEach(entry => {
            if (!groups.has(entry.group)) groups.set(entry.group, []);
            groups.get(entry.group).push(entry);
        });

        return [...groups.entries()].map(([group, entries]) => `
            <optgroup label="${esc(group)}">
                ${entries.map(entry => `<option value="${esc(entry.value)}">${esc(entry.label)}</option>`).join('')}
            </optgroup>
        `).join('');
    }

    function fieldLabel(field) {
        return FIELD_CATALOG.find(entry => entry.key === field)?.label || field || 'Champ';
    }

    function defaultFieldStyle(field) {
        const style = { size: 10 };

        if (field === 'biblio.title') Object.assign(style, { size: 16, weight: 800 });
        if (field === 'biblio.author') Object.assign(style, { size: 10, weight: 650 });
        if (field === 'biblio.summary' || field === 'biblio.abstract') Object.assign(style, { size: 9 });
        if (field === 'biblio.publication_year' || field === 'biblio.copyright_date') Object.assign(style, { prefix: 'Année : ' });
        if (field === 'biblio.publisher' || field === 'biblio.editor') Object.assign(style, { prefix: 'Éditeur : ' });
        if (field === 'biblio.collection' || field === 'biblio.series_title') Object.assign(style, { prefix: 'Collection : ' });
        if (field === 'biblio.isbn') Object.assign(style, { prefix: 'ISBN : ' });
        if (field === 'biblio.public_audience') Object.assign(style, { prefix: 'Public : ' });
        if (field === 'item.barcode') Object.assign(style, { prefix: 'Code-barres : ', weight: 700 });
        if (field === 'item.callnumber') Object.assign(style, { prefix: 'Cote : ', weight: 700 });
        if (field === 'item.home_library_id') Object.assign(style, { prefix: 'Site propriétaire : ' });
        if (field === 'item.holding_library_id') Object.assign(style, { prefix: 'Site actuel : ' });
        if (field === 'item.location') Object.assign(style, { prefix: 'Localisation : ' });
        if (field === 'item.item_type_id') Object.assign(style, { prefix: 'Type : ' });
        if (field === 'item.not_for_loan_status') Object.assign(style, { prefix: 'Statut : ' });

        return style;
    }

    function createBlockFromLibrary(value) {
        const [kind, payload] = String(value || '').split(':', 2);

        if (kind === 'field') {
            return block('field', payload, fieldLabel(payload), defaultFieldStyle(payload));
        }

        if (kind === 'special') {
            if (payload === 'cover') return block('cover', 'biblio.cover', 'Couverture', { width: 90, height: 130 });
            if (payload === 'text') return block('text', '', 'Texte libre', { text: 'Votre texte' });
            if (payload === 'badge') return block('badge', '', 'Badge', { text: 'Sélection' });
            if (payload === 'separator') return block('separator', '', 'Séparateur');
            if (payload === 'qrcode') return block('qrcode', 'biblio.link', 'QR code catalogue', { size: 78 });
            if (payload === 'notice-link') {
                return block('notice-link', 'biblio.link', 'Lien vers la notice', {
                    text: 'Voir la notice',
                    newTab: true,
                    showIcon: true,
                    printMode: 'link',
                    size: 9,
                    weight: 650,
                    align: 'left',
                    wrapMode: 'normal',
                    blockWidth: 100
                });
            }
            if (payload === 'item-barcode-image') {
                return block('barcode-image', 'item.barcode', 'Code-barres exemplaire scannable', {
                    barcodeType: 'Code39',
                    barcodeHeight: 50,
                    imageWidth: 190,
                    showText: true,
                    align: 'left',
                    gap: 6
                });
            }
            if (payload === 'items') {
                return block('items', 'items', 'Détails exemplaires', {
                    size: 8,
                    showBarcode: true,
                    showCallnumber: true,
                    showHomeLibrary: true,
                    showHoldingLibrary: true,
                    showLocation: true,
                    showItemType: true,
                    showStatus: true
                });
            }
            if (payload === 'items-table') {
                return block('items-table', 'items', 'Tableau détaillé des exemplaires', {
                    size: 7.5,
                    showBarcode: true,
                    showCallnumber: true,
                    showHomeLibrary: true,
                    showHoldingLibrary: true,
                    showLocation: true,
                    showItemType: true,
                    showStatus: true,
                    showAcquisitionDate: false
                });
            }
        }

        return block('field', 'biblio.title', 'Titre', defaultFieldStyle('biblio.title'));
    }

    function templateOptionsHtml() {
        const all = [...BUILTIN_TEMPLATES, ...current.templates];
        return all.map(t => '<option value="' + esc(t.id) + '"' +
            (t.id === current.selectedTemplateId ? ' selected' : '') + '>' +
            esc((t.builtin ? '' : 'Personnel — ') + t.name) + '</option>').join('');
    }

    function sourceListOptionsHtml(lists) {
        return lists.map(list =>
            '<option value="' + esc(list.id) + '"' + (current.list?.id === list.id ? ' selected' : '') + '>' +
            esc((list.type === 'item' ? 'Exemplaires — ' : 'Notices — ') + (list.name || 'Liste')) +
            '</option>'
        ).join('');
    }

    async function renderBuilder() {
        installStyles();
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }

        root.innerHTML = `
            <div class="pmk142-topbar">
                <button type="button" data-action="close">← Koha</button>
                <div class="pmk142-title">
                    <strong>Bibliographies & publications</strong>
                </div>
                <button type="button" data-action="save-template"><i class="fa-solid fa-floppy-disk"></i> Enregistrer le modèle</button>
                <button type="button" data-action="print"><i class="fa-solid fa-print"></i> Imprimer / PDF</button>
            </div>
            <div class="pmk142-layout">
                <aside class="pmk142-panel" data-zone="left"></aside>
                <main class="pmk142-preview-wrap">
                    <div class="pmk142-a4" data-zone="preview"></div>
                </main>
                <aside class="pmk142-panel pmk142-panel-right" data-zone="right"></aside>
            </div>
            <div class="pmk142-status" data-zone="status" hidden></div>
            <div class="pmk142-content-modal" data-zone="content-manager" hidden></div>
        `;

        root.addEventListener('click', handleRootClick);
        root.addEventListener('change', handleRootChange);
        root.addEventListener('input', handleRootInput);

        await refreshLeftPanel();
        refreshRightPanel();
        renderPreview();
    }

    function setStatus(message) {
        const el = document.querySelector('#' + ROOT_ID + ' [data-zone="status"]');
        if (!el) return;
        el.hidden = !message;
        el.textContent = message || '';
    }

    async function refreshLeftPanel() {
        const zone = document.querySelector('#' + ROOT_ID + ' [data-zone="left"]');
        if (!zone) return;

        const api = await listsApi();
        const lists = api ? await api.getLists() : [];

        const isSessionSource = [
            'koha-native',
            'koha-bundle',
            'koha-basket',
            'koha-course-reserves'
        ].includes(current.source?.kind);

        const sourceKindLabel = {
            'koha-native': 'Liste Koha',
            'koha-bundle': 'Paquet Koha',
            'koha-basket': 'Panier Koha',
            'koha-course-reserves': 'Réserve de cours'
        }[current.source?.kind] || 'Source Koha';

        const sourceControlHtml = isSessionSource
            ? `
                <div class="pmk142-source-summary">
                    <strong>${esc(sourceKindLabel)}</strong>
                    <div>${esc(current.list?.name || current.source?.name || '')}</div>
                    <div class="pmk142-muted">${current.entries.length} entrée(s) chargée(s)</div>
                </div>
            `
            : `
                <label>Liste</label>
                <select data-control="source-list">
                    ${sourceListOptionsHtml(lists)}
                </select>
                <div class="pmk142-muted">${current.entries.length} entrée(s) chargée(s)</div>
            `;

        zone.innerHTML = `
            <div class="pmk142-section">
                <h3>Source</h3>
                ${sourceControlHtml}

                <label>Mode de rendu</label>
                <select data-control="mode">
                    <option value="notice"${current.mode === 'notice' ? ' selected' : ''}>Une fiche par notice</option>
                    <option value="item"${current.mode === 'item' ? ' selected' : ''}>Une fiche par exemplaire</option>
                    <option value="notice-items"${current.mode === 'notice-items' ? ' selected' : ''}>Notice + exemplaires</option>
                </select>

                ${current.source?.kind === 'koha-bundle' ? `
                    <div class="pmk142-muted" style="margin-top:8px">
                        Par défaut, seuls les exemplaires réellement présents dans le paquet sont utilisés.
                    </div>
                    <label style="font-weight:600">
                        <input type="checkbox" data-control="include-bundle-host"${current.includeBundleHost ? ' checked' : ''}>
                        Inclure aussi l’exemplaire « paquet » lui-même
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-control="all-items"${current.allItemsForItemLists ? ' checked' : ''}>
                        Récupérer tous les exemplaires des notices concernées
                    </label>
                ` : current.source?.kind === 'koha-course-reserves' ? `
                    <div class="pmk142-muted" style="margin-top:8px">
                        Les réserves au niveau exemplaire restent limitées aux exemplaires réservés.
                        Les réserves au niveau notice utilisent les exemplaires de la notice dans les modes qui en ont besoin.
                    </div>
                    <label style="font-weight:600">
                        <input type="checkbox" data-control="all-items"${current.allItemsForItemLists ? ' checked' : ''}>
                        Élargir toutes les réserves aux exemplaires des notices concernées
                    </label>
                ` : current.list?.type === 'item' ? `
                    <label style="font-weight:600">
                        <input type="checkbox" data-control="all-items"${current.allItemsForItemLists ? ' checked' : ''}>
                        Pour une liste d’exemplaires, récupérer tous les exemplaires des notices
                    </label>
                ` : ''}
            </div>

            <div class="pmk142-section">
                <h3>Contenu publié</h3>
                ${(() => {
                    const stats = contentVisibilityStats();
                    return `
                        <div class="pmk142-muted" style="margin-bottom:7px">
                            ${stats.visibleBiblios}/${stats.totalBiblios} notice(s) affichée(s)
                            ${stats.totalItems ? ` • ${stats.visibleItems}/${stats.totalItems} exemplaire(s)` : ''}
                        </div>
                    `;
                })()}
                <button type="button" class="pmk142-btn" style="width:100%" data-action="open-content-manager">
                    <i class="fa-solid fa-eye" aria-hidden="true"></i>
                    Choisir les documents / exemplaires
                </button>
            </div>

            <div class="pmk142-section">
                <h3>Document</h3>
                <label>Titre de la publication</label>
                <input type="text" data-control="doc-title" value="${esc(current.title)}">

                <label style="font-weight:600">
                    <input type="checkbox" data-control="show-biblionumber"${current.showBiblionumber ? ' checked' : ''}>
                    Afficher les numéros de notices
                </label>
                <div class="pmk142-muted">Décochez pour masquer tous les blocs « N° notice » du rendu, sans modifier le modèle.</div>

                <label>Modèle</label>
                <select data-control="template">${templateOptionsHtml()}</select>

                <div class="pmk142-row" style="margin-top:6px">
                    <button class="pmk142-btn" type="button" data-action="duplicate-template">Dupliquer</button>
                    <button class="pmk142-btn" type="button" data-action="export-template">Exporter</button>
                    <button class="pmk142-btn" type="button" data-action="import-template">Importer</button>
                    <input type="file" data-control="import-file" accept=".json,application/json" hidden>
                </div>

                ${!String(current.selectedTemplateId).startsWith('builtin-') ? `
                    <button class="pmk142-btn pmk142-btn-danger" style="margin-top:6px;width:100%" type="button" data-action="delete-template">
                        Supprimer mon modèle
                    </button>` : ''}
            </div>

            <div class="pmk142-section">
                <h3>Mise en page</h3>
                <div class="pmk142-row">
                    <div style="flex:1">
                        <label>Colonnes</label>
                        <input type="number" min="1" max="4" data-control="columns" value="${Number(current.workingTemplate?.page?.columns || 1)}">
                    </div>
                    <div style="flex:1">
                        <label>Marge (mm)</label>
                        <input type="number" min="0" max="35" data-control="margin" value="${Number(current.workingTemplate?.page?.margin || 12)}">
                    </div>
                </div>
                <label>Orientation</label>
                <select data-control="orientation">
                    <option value="portrait"${current.workingTemplate?.page?.orientation !== 'landscape' ? ' selected' : ''}>Portrait</option>
                    <option value="landscape"${current.workingTemplate?.page?.orientation === 'landscape' ? ' selected' : ''}>Paysage</option>
                </select>
            </div>

            <div class="pmk142-section">
                <h3>Organisation</h3>
                <label>Tri</label>
                <select data-control="sort-by">
                    ${FIELD_CATALOG.map(f => `<option value="${esc(f.key)}"${current.sortBy === f.key ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}
                </select>
                <label>Regrouper par</label>
                <select data-control="group-by">
                    <option value="">Aucun regroupement</option>
                    ${FIELD_CATALOG.map(f => `<option value="${esc(f.key)}"${current.groupBy === f.key ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}
                </select>
                <label>Filtre texte</label>
                <input type="text" data-control="filter-text" placeholder="Titre, auteur, cote, code-barres…" value="${esc(current.filterText)}">
            </div>

            <div class="pmk142-section">
                <h3>Blocs</h3>
                <div class="pmk142-block-list" data-zone="blocks"></div>
                <div class="pmk142-row" style="margin-top:7px">
                    <select data-control="add-block-kind" style="flex:1">
                        ${blockLibraryOptionsHtml()}
                    </select>
                    <button type="button" class="pmk142-btn" data-action="add-block">Ajouter</button>
                </div>
            </div>
        `;

        renderBlocks();
    }

    function renderBlocks() {
        const zone = document.querySelector('#' + ROOT_ID + ' [data-zone="blocks"]');
        if (!zone || !current.workingTemplate) return;
        zone.innerHTML = '';

        current.workingTemplate.blocks.forEach((b, index) => {
            const el = document.createElement('div');
            el.className = 'pmk142-block' + (current.selectedBlockId === b.id ? ' is-selected' : '');
            el.draggable = true;
            el.dataset.blockId = b.id;
            el.innerHTML = `
                <span class="grab">⋮⋮</span>
                <span class="name">${esc(b.label || b.type)}<br><small>${esc(b.field || b.type)}</small></span>
                <button class="pmk142-btn" type="button" data-action="remove-block" data-block-id="${esc(b.id)}">×</button>
            `;
            el.addEventListener('click', evt => {
                if (evt.target.closest('button')) return;
                current.selectedBlockId = b.id;
                renderBlocks();
                refreshRightPanel();
            });
            el.addEventListener('dragstart', evt => {
                evt.dataTransfer.setData('text/plain', b.id);
                evt.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragover', evt => evt.preventDefault());
            el.addEventListener('drop', evt => {
                evt.preventDefault();
                const sourceId = evt.dataTransfer.getData('text/plain');
                reorderBlock(sourceId, b.id);
            });
            zone.appendChild(el);
        });
    }

    function reorderBlock(sourceId, targetId) {
        const blocks = current.workingTemplate.blocks;
        const from = blocks.findIndex(b => b.id === sourceId);
        const to = blocks.findIndex(b => b.id === targetId);
        if (from < 0 || to < 0 || from === to) return;
        const [moved] = blocks.splice(from, 1);
        blocks.splice(to, 0, moved);
        renderBlocks();
        renderPreview();
    }

    function refreshRightPanel() {
        const zone = document.querySelector('#' + ROOT_ID + ' [data-zone="right"]');
        if (!zone) return;

        const b = current.workingTemplate?.blocks?.find(block => block.id === current.selectedBlockId);
        if (!b) {
            zone.innerHTML = `
                <div class="pmk142-section">
                    <h3>Propriétés</h3>
                    <p class="pmk142-muted">Sélectionnez un bloc à gauche pour modifier son contenu et son style.</p>
                </div>
                <div class="pmk142-section">
                    <h3>Données disponibles</h3>
                    <p class="pmk142-muted">Les champs bibliographiques et exemplaires peuvent être mélangés. Un champ absent est simplement masqué si « masquer si vide » est actif.</p>
                </div>
            `;
            return;
        }

        zone.innerHTML = `
            <div class="pmk142-section">
                <h3>${esc(b.label || b.type)}</h3>

                <label>Libellé interne</label>
                <input type="text" data-block-control="label" value="${esc(b.label || '')}">

                ${['field', 'qrcode'].includes(b.type) ? `
                    <label>Champ</label>
                    <select data-block-control="field">
                        <option value="biblio.link"${b.field === 'biblio.link' ? ' selected' : ''}>Lien catalogue</option>
                        ${FIELD_CATALOG.map(f => `<option value="${esc(f.key)}"${b.field === f.key ? ' selected' : ''}>${esc(f.label)} — ${esc(f.key)}</option>`).join('')}
                    </select>
                    <label>Chemin libre</label>
                    <input type="text" data-block-control="field-free" value="${esc(b.field || '')}" placeholder="ex. biblio.api.xxx ou item.raw.xxx">
                ` : ''}

                ${['text', 'badge'].includes(b.type) ? `
                    <label>Texte</label>
                    <textarea rows="3" data-style-control="text">${esc(b.style?.text || '')}</textarea>
                ` : ''}

                <div class="pmk142-row">
                    <div style="flex:1">
                        <label>Taille</label>
                        <input type="number" min="6" max="48" data-style-control="size" value="${Number(b.style?.size || 10)}">
                    </div>
                    <div style="flex:1">
                        <label>Graisse</label>
                        <select data-style-control="weight">
                            <option value="400"${Number(b.style?.weight || 400) === 400 ? ' selected' : ''}>Normal</option>
                            <option value="650"${Number(b.style?.weight || 400) === 650 ? ' selected' : ''}>Semi-gras</option>
                            <option value="800"${Number(b.style?.weight || 400) >= 800 ? ' selected' : ''}>Gras</option>
                        </select>
                    </div>
                </div>

                <label>Alignement</label>
                <select data-style-control="align">
                    <option value="left"${!b.style?.align || b.style?.align === 'left' ? ' selected' : ''}>Gauche</option>
                    <option value="center"${b.style?.align === 'center' ? ' selected' : ''}>Centre</option>
                    <option value="right"${b.style?.align === 'right' ? ' selected' : ''}>Droite</option>
                    <option value="justify"${b.style?.align === 'justify' ? ' selected' : ''}>Justifié</option>
                </select>

                ${b.type === 'field' ? `
                    <label>Préfixe</label>
                    <input type="text" data-style-control="prefix" value="${esc(b.style?.prefix || '')}">
                    <label>Suffixe</label>
                    <input type="text" data-style-control="suffix" value="${esc(b.style?.suffix || '')}">
                ` : ''}

                ${b.type === 'cover' ? `
                    <div class="pmk142-row">
                        <div style="flex:1"><label>Largeur px</label><input type="number" data-style-control="width" value="${Number(b.style?.width || 90)}"></div>
                        <div style="flex:1"><label>Hauteur px</label><input type="number" data-style-control="height" value="${Number(b.style?.height || 130)}"></div>
                    </div>
                ` : ''}

                ${b.type === 'notice-link' ? `
                    <label>Texte du lien</label>
                    <input type="text" data-style-control="text" value="${esc(b.style?.text || 'Voir la notice')}">

                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="newTab"${b.style?.newTab !== false ? ' checked' : ''}>
                        Ouvrir dans un nouvel onglet
                    </label>

                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showIcon"${b.style?.showIcon !== false ? ' checked' : ''}>
                        Afficher l’icône
                    </label>

                    <label>À l’impression / PDF</label>
                    <select data-style-control="printMode">
                        <option value="link"${(b.style?.printMode || 'link') === 'link' ? ' selected' : ''}>Conserver le lien cliquable</option>
                        <option value="url"${b.style?.printMode === 'url' ? ' selected' : ''}>Afficher l’URL complète</option>
                        <option value="hide"${b.style?.printMode === 'hide' ? ' selected' : ''}>Masquer à l’impression</option>
                    </select>
                ` : ''}

                ${b.type === 'barcode-image' ? `
                    <label>Type de code-barres</label>
                    <select data-style-control="barcodeType">
                        <option value="Code39"${(b.style?.barcodeType || 'Code39') === 'Code39' ? ' selected' : ''}>Code39 — recommandé</option>
                        <option value="EAN13"${b.style?.barcodeType === 'EAN13' ? ' selected' : ''}>EAN13</option>
                        <option value="EAN8"${b.style?.barcodeType === 'EAN8' ? ' selected' : ''}>EAN8</option>
                        <option value="UPCA"${b.style?.barcodeType === 'UPCA' ? ' selected' : ''}>UPCA</option>
                        <option value="UPCE"${b.style?.barcodeType === 'UPCE' ? ' selected' : ''}>UPCE</option>
                        <option value="NW7"${b.style?.barcodeType === 'NW7' ? ' selected' : ''}>NW7</option>
                        <option value="ITF"${b.style?.barcodeType === 'ITF' ? ' selected' : ''}>ITF</option>
                        <option value="Matrix2of5"${b.style?.barcodeType === 'Matrix2of5' ? ' selected' : ''}>Matrix 2 of 5</option>
                        <option value="Industrial2of5"${b.style?.barcodeType === 'Industrial2of5' ? ' selected' : ''}>Industrial 2 of 5</option>
                        <option value="IATA2of5"${b.style?.barcodeType === 'IATA2of5' ? ' selected' : ''}>IATA 2 of 5</option>
                        <option value="COOP2of5"${b.style?.barcodeType === 'COOP2of5' ? ' selected' : ''}>COOP 2 of 5</option>
                    </select>

                    <div class="pmk142-row">
                        <div style="flex:1">
                            <label>Hauteur (px)</label>
                            <input type="number" min="20" max="180" data-style-control="barcodeHeight" value="${Number(b.style?.barcodeHeight || 50)}">
                        </div>
                        <div style="flex:1">
                            <label>Largeur affichée (px)</label>
                            <input type="number" min="80" max="420" data-style-control="imageWidth" value="${Number(b.style?.imageWidth || 190)}">
                        </div>
                    </div>

                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showText"${b.style?.showText !== false ? ' checked' : ''}>
                        Afficher le numéro sous le code-barres
                    </label>
                    <div class="pmk142-muted">
                        Code39 accepte facilement les codes-barres alphanumériques et reste le choix recommandé par défaut.
                    </div>
                ` : ''}

                ${['items', 'items-table'].includes(b.type) ? `
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showBarcode"${b.style?.showBarcode !== false ? ' checked' : ''}>
                        Afficher le code-barres
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showCallnumber"${b.style?.showCallnumber !== false ? ' checked' : ''}>
                        Afficher la cote
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showHomeLibrary"${b.style?.showHomeLibrary !== false ? ' checked' : ''}>
                        Afficher le site propriétaire
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showHoldingLibrary"${b.style?.showHoldingLibrary !== false ? ' checked' : ''}>
                        Afficher le site actuel
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showLocation"${b.style?.showLocation !== false ? ' checked' : ''}>
                        Afficher la localisation
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showItemType"${b.style?.showItemType !== false ? ' checked' : ''}>
                        Afficher le type de document
                    </label>
                    <label style="font-weight:600">
                        <input type="checkbox" data-style-control="showStatus"${b.style?.showStatus !== false ? ' checked' : ''}>
                        Afficher le statut
                    </label>
                    ${b.type === 'items-table' ? `
                        <label style="font-weight:600">
                            <input type="checkbox" data-style-control="showAcquisitionDate"${b.style?.showAcquisitionDate ? ' checked' : ''}>
                            Afficher la date d’acquisition
                        </label>
                    ` : ''}
                ` : ''}

                <hr style="border:0;border-top:1px solid #e3e8ec;margin:12px 0">
                <label>Habillage / positionnement</label>
                <select data-style-control="wrapMode">
                    <option value="normal"${!b.style?.wrapMode || b.style?.wrapMode === 'normal' ? ' selected' : ''}>Dans le flux</option>
                    <option value="float-left"${b.style?.wrapMode === 'float-left' ? ' selected' : ''}>Flottant à gauche — texte à droite</option>
                    <option value="float-right"${b.style?.wrapMode === 'float-right' ? ' selected' : ''}>Flottant à droite — texte à gauche</option>
                    <option value="full"${b.style?.wrapMode === 'full' ? ' selected' : ''}>Pleine largeur — texte au-dessus/dessous</option>
                    <option value="inline"${b.style?.wrapMode === 'inline' ? ' selected' : ''}>En ligne / côte à côte</option>
                </select>

                <div class="pmk142-row">
                    <div style="flex:1">
                        <label>Largeur du bloc (%)</label>
                        <input type="number" min="10" max="100" data-style-control="blockWidth" value="${Number(b.style?.blockWidth || 100)}">
                    </div>
                    <div style="flex:1">
                        <label>Espace autour (mm)</label>
                        <input type="number" min="0" max="20" step="0.5" data-style-control="wrapGap" value="${Number(b.style?.wrapGap ?? 2)}">
                    </div>
                </div>

                <label style="font-weight:600">
                    <input type="checkbox" data-style-control="clearBefore"${b.style?.clearBefore ? ' checked' : ''}>
                    Revenir sous les éléments flottants avant ce bloc
                </label>

                <label style="font-weight:600">
                    <input type="checkbox" data-block-control="hiddenWhenEmpty"${b.hiddenWhenEmpty !== false ? ' checked' : ''}>
                    Masquer si vide
                </label>
                <label style="font-weight:600">
                    <input type="checkbox" data-style-control="italic"${b.style?.italic ? ' checked' : ''}>
                    Italique
                </label>
                <label style="font-weight:600">
                    <input type="checkbox" data-style-control="muted"${b.style?.muted ? ' checked' : ''}>
                    Couleur secondaire
                </label>
            </div>
        `;
    }

    function biblioVisibilityKey(biblio) {
        if (!biblio) return '';
        return clean(
            biblio.biblionumber
            || biblio.biblio_id
            || biblio.link
            || [biblio.title, biblio.author].filter(Boolean).join('|')
        );
    }

    function itemVisibilityKey(item) {
        if (!item) return '';
        return clean(
            item.item_id
            || item.itemNumber
            || item.itemnumber
            || item.barcode
            || item.external_id
            || [
                item.biblionumber,
                item.callnumber,
                item.home_library_id
            ].filter(Boolean).join('|')
        );
    }

    function resetContentVisibility() {
        current.hiddenBiblios = new Set();
        current.hiddenItems = new Set();
        current.contentManagerSearch = '';
    }

    function isBiblioVisible(biblio) {
        const key = biblioVisibilityKey(biblio);
        return !key || !current.hiddenBiblios.has(key);
    }

    function isItemVisible(item) {
        const key = itemVisibilityKey(item);
        return !key || !current.hiddenItems.has(key);
    }

    function filteredRecordForPublication(record) {
        if (!record || !isBiblioVisible(record.biblio)) return null;

        if (record.item && !isItemVisible(record.item)) return null;

        const visibleItems = (record.items || []).filter(isItemVisible);

        return {
            ...record,
            items: visibleItems,
            item: record.item && isItemVisible(record.item) ? record.item : null
        };
    }

    function contentGroups() {
        const groups = new Map();

        (current.records || []).forEach(record => {
            const biblio = record.biblio || {};
            const key = biblioVisibilityKey(biblio) || uid('anonymous-bib');

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    biblio,
                    items: []
                });
            }

            const group = groups.get(key);
            const candidates = record.item
                ? [record.item]
                : (record.items || []);

            candidates.forEach(item => {
                const itemKey = itemVisibilityKey(item);
                if (!itemKey) return;
                if (!group.items.some(existing => itemVisibilityKey(existing) === itemKey)) {
                    group.items.push(item);
                }
            });
        });

        return [...groups.values()];
    }

    function contentVisibilityStats() {
        const groups = contentGroups();
        const totalBiblios = groups.length;
        const visibleBiblios = groups.filter(group => isBiblioVisible(group.biblio)).length;

        const allItems = groups.flatMap(group => group.items);
        const totalItems = allItems.length;
        const visibleItems = allItems.filter(isItemVisible).length;

        return { totalBiblios, visibleBiblios, totalItems, visibleItems };
    }

    function renderContentManager() {
        const modal = document.querySelector('#' + ROOT_ID + ' [data-zone="content-manager"]');
        if (!modal) return;

        const groups = contentGroups();
        const q = clean(current.contentManagerSearch).toLocaleLowerCase('fr');

        const visibleGroups = q
            ? groups.filter(group => {
                const haystack = [
                    group.biblio?.title,
                    group.biblio?.subtitle,
                    group.biblio?.author,
                    group.biblio?.biblionumber,
                    ...group.items.flatMap(item => [
                        item.barcode,
                        item.callnumber,
                        item.home_library_id,
                        item.holding_library_id,
                        item.location
                    ])
                ].filter(Boolean).join(' ').toLocaleLowerCase('fr');

                return haystack.includes(q);
            })
            : groups;

        const stats = contentVisibilityStats();

        modal.innerHTML = `
            <div class="pmk142-content-dialog" role="dialog" aria-modal="true" aria-label="Choisir le contenu publié">
                <div class="pmk142-content-header">
                    <div>
                        <strong>Choisir le contenu publié</strong>
                        <div class="pmk142-muted">
                            ${stats.visibleBiblios}/${stats.totalBiblios} notice(s) affichée(s)
                            ${stats.totalItems ? ` • ${stats.visibleItems}/${stats.totalItems} exemplaire(s) affiché(s)` : ''}
                        </div>
                    </div>
                    <button type="button" class="pmk142-btn" data-action="close-content-manager">×</button>
                </div>

                <div class="pmk142-content-tools">
                    <input type="text"
                           data-control="content-manager-search"
                           placeholder="Rechercher un titre, auteur, code-barres, cote…"
                           value="${esc(current.contentManagerSearch)}">
                    <button type="button" class="pmk142-btn" data-action="content-show-all">Tout afficher</button>
                    <button type="button" class="pmk142-btn" data-action="content-hide-all">Tout masquer</button>
                </div>

                <div class="pmk142-content-list">
                    ${visibleGroups.map(group => {
                        const bibChecked = isBiblioVisible(group.biblio);
                        return `
                            <section class="pmk142-content-biblio">
                                <label class="pmk142-content-biblio-label">
                                    <input type="checkbox"
                                           data-content-biblio="${esc(group.key)}"
                                           ${bibChecked ? 'checked' : ''}>
                                    <span>
                                        <strong>${esc(group.biblio?.title || 'Sans titre')}</strong>
                                        ${group.biblio?.author ? `<small>${esc(group.biblio.author)}</small>` : ''}
                                        ${group.biblio?.biblionumber ? `<small>Notice ${esc(group.biblio.biblionumber)}</small>` : ''}
                                    </span>
                                </label>

                                ${group.items.length ? `
                                    <div class="pmk142-content-items">
                                        ${group.items.map(item => {
                                            const itemKey = itemVisibilityKey(item);
                                            return `
                                                <label>
                                                    <input type="checkbox"
                                                           data-content-item="${esc(itemKey)}"
                                                           ${isItemVisible(item) ? 'checked' : ''}>
                                                    <span>
                                                        ${esc(item.barcode || 'Sans code-barres')}
                                                        ${item.callnumber ? ` • ${esc(item.callnumber)}` : ''}
                                                        ${item.home_library_id ? ` • ${esc(item.home_library_id)}` : ''}
                                                        ${item.location ? ` • ${esc(item.location)}` : ''}
                                                    </span>
                                                </label>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : ''}
                            </section>
                        `;
                    }).join('') || '<div class="pmk142-muted">Aucun résultat.</div>'}
                </div>

                <div class="pmk142-content-footer">
                    <span class="pmk142-muted">Les éléments masqués ne sont pas supprimés de la liste source.</span>
                    <button type="button" class="pmk142-btn pmk142-btn-primary" data-action="close-content-manager">Terminé</button>
                </div>
            </div>
        `;
    }

    function openContentManager() {
        const modal = document.querySelector('#' + ROOT_ID + ' [data-zone="content-manager"]');
        if (!modal) return;
        modal.hidden = false;
        renderContentManager();
    }

    function closeContentManager() {
        const modal = document.querySelector('#' + ROOT_ID + ' [data-zone="content-manager"]');
        if (modal) modal.hidden = true;
    }

    function recordsForPreview() {
        let rows = (current.records || [])
            .map(filteredRecordForPublication)
            .filter(Boolean);

        const q = clean(current.filterText).toLocaleLowerCase('fr');

        if (q) {
            rows = rows.filter(record => {
                const text = [
                    record.biblio?.title,
                    record.biblio?.subtitle,
                    record.biblio?.author,
                    record.biblio?.editor,
                    record.item?.barcode,
                    record.item?.callnumber,
                    record.item?.home_library_id,
                    ...(record.items || []).flatMap(i => [
                        i.barcode,
                        i.callnumber,
                        i.home_library_id,
                        i.holding_library_id,
                        i.location,
                        i.item_type_id,
                        i.not_for_loan_status
                    ])
                ].filter(value => value !== '' && value != null).join(' ').toLocaleLowerCase('fr');
                return text.includes(q);
            });
        }

        const sortKey = current.sortBy;
        rows.sort((a, b) => asText(resolveField(a, sortKey)).localeCompare(asText(resolveField(b, sortKey)), 'fr', { numeric: true, sensitivity: 'base' }));
        return rows;
    }

    function resolveField(record, field) {
        if (!record || !field) return '';

        if (field.startsWith('biblio.')) {
            return getPath(record.biblio, field.slice(7));
        }

        if (field.startsWith('item.')) {
            const itemPath = field.slice(5);

            if (record.item) {
                return getPath(record.item, itemPath);
            }

            /*
             * En mode « notice + exemplaires », record.item est volontairement
             * vide. Pour qu'un bloc individuel « Code-barres », « Cote », etc.
             * reste utilisable, on agrège les valeurs de tous les exemplaires.
             */
            const values = (record.items || [])
                .map(item => asText(getPath(item, itemPath)))
                .filter(Boolean);

            return [...new Set(values)];
        }

        return getPath(record, field);
    }

    function isNoticeNumberField(field) {
        const value = clean(field).toLowerCase();
        return value === 'biblio.biblionumber'
            || value === 'biblio.biblio_id'
            || value === 'biblio.api.biblionumber'
            || value === 'biblio.api.biblio_id';
    }

    function renderBlockHtml(b, record) {
        const st = b.style || {};

        if (!current.showBiblionumber && b.type === 'field' && isNoticeNumberField(b.field)) {
            return '';
        }
        const common = `font-size:${Number(st.size || 10)}px;font-weight:${Number(st.weight || 400)};font-style:${st.italic ? 'italic' : 'normal'};text-align:${esc(st.align || 'left')};color:${st.muted ? '#6f7d88' : 'inherit'};margin:2px 0;`;

        if (b.type === 'separator') {
            return '<hr style="border:0;border-top:1px solid #dfe4e7;margin:5px 0">';
        }

        if (b.type === 'text') {
            const value = clean(st.text);
            if (!value && b.hiddenWhenEmpty !== false) return '';
            return `<div class="pmk142-field" style="${common}">${esc(value)}</div>`;
        }

        if (b.type === 'badge') {
            const value = clean(st.text || b.label);
            if (!value && b.hiddenWhenEmpty !== false) return '';
            return `<div style="text-align:${esc(st.align || 'left')};margin:3px 0"><span class="pmk142-badge" style="font-size:${Number(st.size || 9)}px">${esc(value)}</span></div>`;
        }

        if (b.type === 'cover') {
            const candidates = uniqueCoverCandidates([
                record.biblio?.cover,
                ...(record.biblio?.coverCandidates || [])
            ]);
            const src = candidates[0] || '';

            if (!src && b.hiddenWhenEmpty !== false) return '';
            if (!src) return '';

            return `<img
                class="pmk142-cover"
                src="${esc(src)}"
                data-cover-candidates="${esc(JSON.stringify(candidates))}"
                alt="Couverture"
                loading="eager"
                style="width:${Number(st.width || 90)}px;height:${Number(st.height || 130)}px;margin-left:${st.align === 'center' ? 'auto' : '0'};margin-right:${st.align === 'center' ? 'auto' : '0'}"
            >`;
        }

        if (b.type === 'items') {
            const items = record.items || (record.item ? [record.item] : []);
            if (!items.length && b.hiddenWhenEmpty !== false) return '';

            return `<div class="pmk142-items" style="${common}">
                ${items.map(item => {
                    const bits = [];

                    if (st.showBarcode !== false && item.barcode) {
                        bits.push('CB : ' + item.barcode);
                    }

                    if (st.showCallnumber !== false && item.callnumber) {
                        bits.push('Cote : ' + item.callnumber);
                    }

                    if (st.showHomeLibrary !== false && item.home_library_id) {
                        bits.push('Site propriétaire : ' + item.home_library_id);
                    }

                    if (
                        st.showHoldingLibrary !== false &&
                        item.holding_library_id
                    ) {
                        bits.push('Site actuel : ' + item.holding_library_id);
                    }

                    if (st.showLocation !== false && item.location) {
                        bits.push('Localisation : ' + item.location);
                    }

                    if (st.showItemType !== false && item.item_type_id) {
                        bits.push('Type : ' + item.item_type_id);
                    }

                    if (
                        st.showStatus !== false &&
                        item.not_for_loan_status !== '' &&
                        item.not_for_loan_status != null
                    ) {
                        bits.push('Statut : ' + item.not_for_loan_status);
                    }

                    return '<div class="pmk142-itemline">' + esc(bits.join(' • ')) + '</div>';
                }).join('')}
            </div>`;
        }

        if (b.type === 'items-table') {
            const items = record.items || (record.item ? [record.item] : []);
            if (!items.length && b.hiddenWhenEmpty !== false) return '';

            const columns = [
                st.showBarcode !== false ? ['Code-barres', 'barcode'] : null,
                st.showCallnumber !== false ? ['Cote', 'callnumber'] : null,
                st.showHomeLibrary !== false ? ['Site propriétaire', 'home_library_id'] : null,
                st.showHoldingLibrary !== false ? ['Site actuel', 'holding_library_id'] : null,
                st.showLocation !== false ? ['Localisation', 'location'] : null,
                st.showItemType !== false ? ['Type', 'item_type_id'] : null,
                st.showStatus !== false ? ['Statut', 'not_for_loan_status'] : null,
                st.showAcquisitionDate ? ['Acquisition', 'acquisition_date'] : null
            ].filter(Boolean);

            if (!columns.length) return '';

            return `
                <div class="pmk142-items pmk142-items-table-wrap" style="${common}">
                    <table class="pmk142-items-table">
                        <thead>
                            <tr>${columns.map(([label]) => `<th>${esc(label)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    ${columns.map(([, key]) => `<td>${esc(asText(item[key]))}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (b.type === 'notice-link') {
            let href = asText(resolveField(record, b.field || 'biblio.link'));

            if (!href && record.biblio?.biblionumber) {
                href = '/cgi-bin/koha/catalogue/detail.pl?biblionumber='
                    + encodeURIComponent(record.biblio.biblionumber);
            }

            if (!href && b.hiddenWhenEmpty !== false) return '';
            if (!href) return '';

            const absoluteHref = absoluteUrl(href);
            const label = clean(st.text) || 'Voir la notice';
            const target = st.newTab !== false
                ? ' target="_blank" rel="noopener noreferrer"'
                : '';
            const icon = st.showIcon !== false
                ? '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> '
                : '';
            const printMode = clean(st.printMode) || 'link';

            return `
                <div class="pmk142-notice-link pmk142-print-mode-${esc(printMode)}"
                     data-print-url="${esc(absoluteHref)}"
                     style="${common}">
                    <a href="${esc(absoluteHref)}"${target}>${icon}${esc(label)}</a>
                    <span class="pmk142-notice-link-print-url">${esc(absoluteHref)}</span>
                </div>
            `;
        }

        if (b.type === 'barcode-image') {
            let barcodes = [];

            if (record.item?.barcode) {
                barcodes = [record.item.barcode];
            } else {
                barcodes = (record.items || [])
                    .map(item => clean(item?.barcode))
                    .filter(Boolean);
            }

            barcodes = [...new Set(barcodes)];

            if (!barcodes.length && b.hiddenWhenEmpty !== false) return '';
            if (!barcodes.length) return '';

            const barcodeType = clean(st.barcodeType) || 'Code39';
            const barcodeHeight = Math.max(20, Math.min(180, Number(st.barcodeHeight || 50)));
            const imageWidth = Math.max(80, Math.min(420, Number(st.imageWidth || 190)));
            const showText = st.showText !== false;
            const gap = Math.max(2, Number(st.gap || 6));

            return `
                <div class="pmk142-barcode-images"
                     style="display:flex;flex-wrap:wrap;gap:${gap}px;justify-content:${
                         st.align === 'center' ? 'center' : st.align === 'right' ? 'flex-end' : 'flex-start'
                     };margin:5px 0">
                    ${barcodes.map(value => {
                        const url = '/cgi-bin/koha/svc/barcode'
                            + '?barcode=' + encodeURIComponent(value)
                            + '&type=' + encodeURIComponent(barcodeType)
                            + '&height=' + encodeURIComponent(barcodeHeight)
                            + (showText ? '' : '&notext=1');

                        return `
                            <div class="pmk142-barcode-image" style="max-width:100%;break-inside:avoid">
                                <img src="${esc(url)}"
                                     alt="Code-barres ${esc(value)}"
                                     loading="eager"
                                     style="display:block;width:${imageWidth}px;max-width:100%;height:auto;object-fit:contain">
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        if (b.type === 'qrcode') {
            const value = asText(resolveField(record, b.field || 'biblio.link'));
            if (!value && b.hiddenWhenEmpty !== false) return '';
            if (!value) return '';

            let target = value;
            try {
                target = new URL(value, window.location.origin).href;
            } catch (_) {}

            const moduleSize = target.length <= 180 ? 5 :
                target.length <= 350 ? 6 :
                target.length <= 600 ? 7 :
                target.length <= 900 ? 8 :
                target.length <= 1400 ? 9 : 10;

            const url = '/cgi-bin/koha/svc/barcode'
                + '?type=QRcode'
                + '&barcode=' + encodeURIComponent(target)
                + '&modulesize=' + encodeURIComponent(moduleSize)
                + '&notext=1';

            const displaySize = Math.max(60, Number(st.size || 90));

            return `<div class="pmk142-qr" style="text-align:${esc(st.align || 'left')};margin:5px 0">
                <img src="${esc(url)}" alt="QR code vers le catalogue" loading="eager"
                     style="width:${displaySize}px;height:${displaySize}px;object-fit:contain">
            </div>`;
        }

        const value = asText(resolveField(record, b.field));
        if (!value && b.hiddenWhenEmpty !== false) return '';

        if (b.field === 'biblio.link' && value) {
            const href = absoluteUrl(value);
            const label = clean(st.prefix) || 'Voir la notice';
            return `<div class="pmk142-field pmk142-catalogue-link" style="${common}">
                <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>
                ${st.suffix ? esc(st.suffix) : ''}
            </div>`;
        }

        return `<div class="pmk142-field" style="${common}">${esc(st.prefix || '')}${esc(value)}${esc(st.suffix || '')}</div>`;
    }

    function applyBlockLayout(b, html) {
        if (!html) return '';

        const st = b.style || {};
        const mode = st.wrapMode || 'normal';
        const width = Math.max(10, Math.min(100, Number(st.blockWidth || 100)));
        const gap = Math.max(0, Math.min(20, Number(st.wrapGap ?? 2)));

        const css = [];

        if (st.clearBefore) css.push('clear:both');

        if (mode === 'float-left') {
            css.push('float:left');
            css.push('width:' + width + '%');
            css.push('margin:0 ' + gap + 'mm ' + gap + 'mm 0');
        } else if (mode === 'float-right') {
            css.push('float:right');
            css.push('width:' + width + '%');
            css.push('margin:0 0 ' + gap + 'mm ' + gap + 'mm');
        } else if (mode === 'full') {
            css.push('display:block');
            css.push('width:100%');
            css.push('clear:both');
            css.push('margin:' + gap + 'mm 0');
        } else if (mode === 'inline') {
            css.push('display:inline-block');
            css.push('width:' + width + '%');
            css.push('vertical-align:top');
            css.push('margin:0 ' + gap + 'mm ' + gap + 'mm 0');
        } else {
            css.push('display:block');
            css.push('width:' + width + '%');
        }

        return `<div class="pmk142-block-wrap pmk142-wrap-${esc(mode)}" style="${css.join(';')}">${html}</div>`;
    }

    function renderRecordCard(record) {
        const t = current.workingTemplate || {};
        const cardStyle = t.card || {};
        return `<article class="pmk142-card${cardStyle.border ? ' has-border' : ''}" style="padding:${Number(cardStyle.padding || 4)}px">
            ${(t.blocks || []).map(b => applyBlockLayout(b, renderBlockHtml(b, record))).join('')}
        </article>`;
    }

    function renderPreview() {
        const zone = document.querySelector('#' + ROOT_ID + ' [data-zone="preview"]');
        if (!zone || !current.workingTemplate) return;

        const page = current.workingTemplate.page || {};
        zone.classList.toggle('landscape', page.orientation === 'landscape');
        zone.style.padding = Number(page.margin ?? 12) + 'mm';

        const rows = recordsForPreview();
        const cols = Math.max(1, Math.min(4, Number(page.columns || 1)));
        const gap = Number(page.gap || 8);

        const groupBy = current.groupBy || current.workingTemplate.groupBy || '';
        let body = '';

        if (groupBy) {
            const groups = new Map();
            rows.forEach(record => {
                const key = asText(resolveField(record, groupBy)) || 'Sans valeur';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(record);
            });
            body = [...groups.entries()].map(([name, records]) =>
                `<section style="display:contents">
                    <div class="pmk142-group-title">${esc(name)}</div>
                    ${records.map(renderRecordCard).join('')}
                </section>`
            ).join('');
        } else {
            body = rows.map(renderRecordCard).join('');
        }

        zone.innerHTML = `
            <h1 class="pmk142-doc-title">${esc(current.title || current.list?.name || 'Bibliographie')}</h1>
            <div class="pmk142-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${gap}mm">
                ${body || '<div class="pmk142-muted">Aucun résultat à afficher.</div>'}
            </div>
        `;

        activateCoverFallbacks(zone);
    }

    function selectedBlock() {
        return current.workingTemplate?.blocks?.find(b => b.id === current.selectedBlockId) || null;
    }

    async function applySelectedTemplate(id, rebuild = true) {
        const template = [...BUILTIN_TEMPLATES, ...current.templates].find(t => t.id === id);
        if (!template) return;

        current.selectedTemplateId = id;
        current.workingTemplate = clone(template);
        current.workingTemplate.blocks = (current.workingTemplate.blocks || []).map(b => ({ ...b, id: uid('block') }));
        current.selectedBlockId = current.workingTemplate.blocks[0]?.id || '';

        if (template.mode) current.mode = template.mode;
        if (template.useSourceNameAsTitle) {
            current.title = clean(
                current.list?.name
                || current.source?.name
                || 'Bibliographie'
            );
        }
        current.showBiblionumber = template.showBiblionumber !== false;
        if (template.groupBy && !current.groupBy) current.groupBy = template.groupBy;

        if (rebuild) await rebuildRecords();
        await refreshLeftPanel();
        refreshRightPanel();
        renderPreview();
    }

    function effectiveSourceEntries() {
        const entries = [...(current.entries || [])];

        if (
            current.source?.kind === 'koha-bundle'
            && current.includeBundleHost
            && current.bundleHostItem
        ) {
            const hostId = clean(
                current.bundleHostItem.item_id
                || current.bundleHostItem.itemnumber
                || current.bundleHostItem.itemNumber
            );

            const alreadyPresent = entries.some(entry =>
                clean(entry?.item_id || entry?.itemnumber || entry?.itemNumber) === hostId
            );

            if (!alreadyPresent) entries.unshift(current.bundleHostItem);
        }

        return entries;
    }

    async function rebuildRecords() {
        if (!current.list) return;
        setStatus('Préparation des données bibliographiques et exemplaires…');
        try {
            if (current.source?.kind === 'koha-course-reserves') {
                current.records = await buildRecordsFromCourseReserves(
                    effectiveSourceEntries(),
                    current.mode,
                    current.allItemsForItemLists
                );
            } else {
                current.records = await buildRecordsFromPmk(
                    current.list,
                    effectiveSourceEntries(),
                    current.mode,
                    current.allItemsForItemLists
                );
            }
            current.error = '';
        } catch (error) {
            current.error = error?.message || String(error);
            console.error('[PMK142]', error);
        } finally {
            setStatus('');
            renderPreview();
        }
    }

    async function selectPmkList(listId) {
        const api = await listsApi();
        if (!api || !listId) return;
        setStatus('Chargement de la liste…');
        try {
            const list = await api.getList(listId);
            const entries = await api.getEntries(listId);
            resetContentVisibility();
            current.source = { kind: 'pmk', type: list?.type || 'notice', name: list?.name || '' };
            current.list = list;
            current.entries = entries;
            current.bundleHostItem = null;
            current.includeBundleHost = false;
            current.title = current.title || list?.name || 'Bibliographie';
            await rebuildRecords();
        } finally {
            setStatus('');
        }
    }

    async function loadInitialSource() {
        const params = query();
        const source = params.get('source');

        if (source === 'session') {
            try {
                const payload = JSON.parse(sessionStorage.getItem(SESSION_SOURCE_KEY) || 'null');

                if (payload?.entries?.length) {
                    const kind = payload.kind || 'koha-native';
                    const type = ['item', 'mixed'].includes(payload.type)
                        ? payload.type
                        : 'notice';

                    const sessionId = kind === 'koha-bundle'
                        ? 'session-bundle-' + clean(payload.bundleItemId || 'bundle')
                        : kind === 'koha-basket'
                            ? 'session-basket'
                            : kind === 'koha-course-reserves'
                                ? 'session-course-' + clean(payload.courseId || 'course')
                                : 'session-koha';

                    const fallbackName = kind === 'koha-bundle'
                        ? 'Paquet Koha'
                        : kind === 'koha-basket'
                            ? 'Panier Koha'
                            : kind === 'koha-course-reserves'
                                ? 'Réserve de cours'
                                : 'Liste Koha';

                    resetContentVisibility();
                    current.source = payload;
                    current.list = {
                        id: sessionId,
                        name: payload.name || fallbackName,
                        type
                    };
                    current.entries = payload.entries;
                    current.bundleHostItem = payload.hostItem || null;
                    current.includeBundleHost = false;
                    current.allItemsForItemLists = false;
                    current.title = current.list.name;

                    await rebuildRecords();
                    return;
                }
            } catch (error) {
                console.warn('[PMK142] Source de session illisible', error);
            }
        }

        const api = await listsApi();
        if (!api) throw new Error('Gestionnaire de listes PMK indisponible.');

        const listId = params.get('list');
        if (listId) {
            await selectPmkList(listId);
            return;
        }

        const lists = await api.getLists();
        if (lists.length) await selectPmkList(lists[0].id);
    }

    async function loadTemplatesAndPreset() {
        current.templates = await loadUserTemplates();
        const wanted = query().get('template') || config.defaultTemplate || DEFAULT_CONFIG.defaultTemplate;
        const exists = [...BUILTIN_TEMPLATES, ...current.templates].some(t => t.id === wanted);
        current.selectedTemplateId = exists ? wanted : BUILTIN_TEMPLATES[0].id;
        const template = [...BUILTIN_TEMPLATES, ...current.templates].find(t => t.id === current.selectedTemplateId);
        current.workingTemplate = clone(template);
        current.workingTemplate.blocks = (current.workingTemplate.blocks || []).map(b => ({ ...b, id: uid('block') }));
        current.mode = template?.mode || config.defaultMode;
        current.showBiblionumber = template?.showBiblionumber !== false;
        current.groupBy = template?.groupBy || '';
        current.selectedBlockId = current.workingTemplate.blocks[0]?.id || '';
    }

    async function duplicateCurrentTemplate() {
        const name = prompt('Nom du nouveau modèle :', 'Copie de ' + (current.workingTemplate?.name || 'modèle'));
        if (name == null || !clean(name)) return;

        const copy = clone(current.workingTemplate);
        copy.id = '';
        copy.name = clean(name);
        copy.builtin = false;

        setStatus('Enregistrement du modèle…');
        try {
            const id = await saveUserTemplate(copy, copy.name);
            current.templates = await loadUserTemplates();
            await applySelectedTemplate(id, false);
        } catch (error) {
            alert(error?.message || error);
        } finally {
            setStatus('');
        }
    }

    async function saveCurrentTemplate() {
        if (!current.workingTemplate) return;
        let name = current.workingTemplate.name || 'Mon modèle';

        if (String(current.selectedTemplateId).startsWith('builtin-')) {
            const proposed = prompt('Les modèles PMK sont protégés. Nom de votre copie personnalisée :', 'Copie de ' + name);
            if (proposed == null || !clean(proposed)) return;
            name = clean(proposed);
            current.workingTemplate.id = '';
            current.workingTemplate.builtin = false;
        }

        current.workingTemplate.name = name;
        current.workingTemplate.mode = current.mode;
        current.workingTemplate.groupBy = current.groupBy;
        current.workingTemplate.showBiblionumber = current.showBiblionumber;

        setStatus('Enregistrement du modèle…');
        try {
            const id = await saveUserTemplate(current.workingTemplate, name);
            current.templates = await loadUserTemplates();
            current.selectedTemplateId = id;
            current.workingTemplate.id = id;
            alert('Modèle enregistré.');
            await refreshLeftPanel();
        } catch (error) {
            alert(error?.message || error);
        } finally {
            setStatus('');
        }
    }

    function exportCurrentTemplate() {
        if (!current.workingTemplate) return;
        const data = clone(current.workingTemplate);
        data.exportedBy = 'PimpMyKoha 142';
        data.exportedAt = new Date().toISOString();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (clean(data.name || 'modele-bibliographie').replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'modele') + '.pmk-biblio.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    async function importTemplateFile(file) {
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (!Array.isArray(data.blocks) || !data.name) throw new Error('Ce fichier ne ressemble pas à un modèle PMK de bibliographie.');
            data.id = '';
            data.builtin = false;
            data.name = clean(data.name) + ' (importé)';
            const id = await saveUserTemplate(data, data.name);
            current.templates = await loadUserTemplates();
            await applySelectedTemplate(id, false);
        } catch (error) {
            alert(error?.message || error);
        }
    }

    async function handleRootClick(event) {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;

        if (action === 'open-content-manager') {
            openContentManager();
            return;
        }
        if (action === 'close-content-manager') {
            closeContentManager();
            await refreshLeftPanel();
            renderPreview();
            return;
        }
        if (action === 'content-show-all') {
            current.hiddenBiblios.clear();
            current.hiddenItems.clear();
            renderContentManager();
            renderPreview();
            await refreshLeftPanel();
            return;
        }
        if (action === 'content-hide-all') {
            contentGroups().forEach(group => {
                if (group.key) current.hiddenBiblios.add(group.key);
                group.items.forEach(item => {
                    const itemKey = itemVisibilityKey(item);
                    if (itemKey) current.hiddenItems.add(itemKey);
                });
            });
            renderContentManager();
            renderPreview();
            await refreshLeftPanel();
            return;
        }

        if (action === 'close') {
            history.back();
            return;
        }
        if (action === 'print') {
            window.print();
            return;
        }
        if (action === 'duplicate-template') {
            await duplicateCurrentTemplate();
            return;
        }
        if (action === 'save-template') {
            await saveCurrentTemplate();
            return;
        }
        if (action === 'export-template') {
            exportCurrentTemplate();
            return;
        }
        if (action === 'import-template') {
            document.querySelector('#' + ROOT_ID + ' [data-control="import-file"]')?.click();
            return;
        }
        if (action === 'delete-template') {
            if (!confirm('Supprimer ce modèle personnel ?')) return;
            await deleteUserTemplate(current.selectedTemplateId);
            current.templates = await loadUserTemplates();
            await applySelectedTemplate(config.defaultTemplate || BUILTIN_TEMPLATES[0].id, false);
            return;
        }
        if (action === 'add-block') {
            const choice = document.querySelector('#' + ROOT_ID + ' [data-control="add-block-kind"]')?.value || 'field:biblio.title';
            const b = createBlockFromLibrary(choice);
            current.workingTemplate.blocks.push(b);
            current.selectedBlockId = b.id;
            renderBlocks();
            refreshRightPanel();
            renderPreview();
            return;
        }
        if (action === 'remove-block') {
            const id = actionEl.dataset.blockId;
            current.workingTemplate.blocks = current.workingTemplate.blocks.filter(b => b.id !== id);
            if (current.selectedBlockId === id) current.selectedBlockId = current.workingTemplate.blocks[0]?.id || '';
            renderBlocks();
            refreshRightPanel();
            renderPreview();
        }
    }

    async function handleRootChange(event) {
        if (event.target.matches('[data-content-biblio]')) {
            const key = clean(event.target.dataset.contentBiblio);
            if (key) {
                if (event.target.checked) current.hiddenBiblios.delete(key);
                else current.hiddenBiblios.add(key);
            }
            renderContentManager();
            renderPreview();
            return;
        }

        if (event.target.matches('[data-content-item]')) {
            const key = clean(event.target.dataset.contentItem);
            if (key) {
                if (event.target.checked) current.hiddenItems.delete(key);
                else current.hiddenItems.add(key);
            }
            renderContentManager();
            renderPreview();
            return;
        }

        const control = event.target.dataset.control;
        if (control === 'source-list') {
            await selectPmkList(event.target.value);
            await refreshLeftPanel();
            return;
        }
        if (control === 'mode') {
            current.mode = event.target.value;
            await rebuildRecords();
            return;
        }
        if (control === 'show-biblionumber') {
            current.showBiblionumber = !!event.target.checked;
            renderPreview();
            return;
        }
        if (control === 'all-items') {
            current.allItemsForItemLists = !!event.target.checked;
            await rebuildRecords();
            return;
        }
        if (control === 'include-bundle-host') {
            current.includeBundleHost = !!event.target.checked;
            await rebuildRecords();
            return;
        }
        if (control === 'template') {
            await applySelectedTemplate(event.target.value);
            return;
        }
        if (control === 'columns') {
            current.workingTemplate.page.columns = Math.max(1, Math.min(4, Number(event.target.value || 1)));
            renderPreview();
            return;
        }
        if (control === 'margin') {
            current.workingTemplate.page.margin = Math.max(0, Math.min(35, Number(event.target.value || 0)));
            renderPreview();
            return;
        }
        if (control === 'orientation') {
            current.workingTemplate.page.orientation = event.target.value;
            renderPreview();
            return;
        }
        if (control === 'sort-by') {
            current.sortBy = event.target.value;
            renderPreview();
            return;
        }
        if (control === 'group-by') {
            current.groupBy = event.target.value;
            renderPreview();
            return;
        }
        if (control === 'import-file') {
            await importTemplateFile(event.target.files?.[0]);
            event.target.value = '';
            return;
        }

        const block = selectedBlock();
        if (!block) return;

        if (event.target.dataset.blockControl) {
            const key = event.target.dataset.blockControl;
            if (key === 'hiddenWhenEmpty') block.hiddenWhenEmpty = !!event.target.checked;
            else if (key === 'field-free') block.field = event.target.value;
            else block[key] = event.target.value;
            renderBlocks();
            renderPreview();
            return;
        }

        if (event.target.dataset.styleControl) {
            const key = event.target.dataset.styleControl;
            let value = event.target.type === 'checkbox' ? !!event.target.checked : event.target.value;
            if (['size', 'weight', 'width', 'height', 'barcodeHeight', 'imageWidth', 'gap', 'blockWidth', 'wrapGap'].includes(key)) value = Number(value || 0);
            block.style[key] = value;
            renderPreview();
        }
    }

    function handleRootInput(event) {
        const control = event.target.dataset.control;

        if (control === 'content-manager-search') {
            current.contentManagerSearch = event.target.value;
            renderContentManager();
            const input = document.querySelector(
                '#' + ROOT_ID + ' [data-control="content-manager-search"]'
            );
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
            return;
        }
        if (control === 'doc-title') {
            current.title = event.target.value;
            renderPreview();
            return;
        }
        if (control === 'filter-text') {
            current.filterText = event.target.value;
            renderPreview();
            return;
        }

        const block = selectedBlock();
        if (!block) return;

        if (event.target.dataset.blockControl) {
            const key = event.target.dataset.blockControl;
            if (key === 'field-free') block.field = event.target.value;
            else block[key] = event.target.value;
            renderBlocks();
            renderPreview();
            return;
        }

        if (event.target.dataset.styleControl) {
            const key = event.target.dataset.styleControl;
            let value = event.target.type === 'checkbox' ? !!event.target.checked : event.target.value;
            if (['size', 'weight', 'width', 'height', 'barcodeHeight', 'imageWidth', 'gap', 'blockWidth', 'wrapGap'].includes(key)) value = Number(value || 0);
            block.style[key] = value;
            renderPreview();
        }
    }

    async function initBuilderPage() {
        installStyles();
        await loadTemplatesAndPreset();
        await renderBuilder();
        setStatus('Chargement de la source…');
        try {
            await loadInitialSource();
            await refreshLeftPanel();
            refreshRightPanel();
            renderPreview();
        } catch (error) {
            console.error('[PMK142]', error);
            alert(error?.message || String(error));
        } finally {
            setStatus('');
        }
    }

    function registerWithPMK() {
        if (!window.PMKConfig || registered) return false;
        registered = true;

        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: 'Bibliographies & publications', en: 'Bibliographies & publications' },
            description: {
                fr: 'Crée des bibliographies et publications personnalisées à partir des listes PMK, listes Koha, paniers, paquets et réserves de cours, par notices ou exemplaires. Les modèles personnels sont stockés sous le profil logique PMK actif, sans authentification supplémentaire.',
                en: 'Creates customizable bibliographies and publications from PMK lists, Koha lists, carts, bundles and course reserves, using bibliographic records or items.'
            },
            category: { fr: 'Outils', en: 'Tools' },
            defaults: DEFAULT_CONFIG,
            schema: [
                { key: 'injectPersonalListsButton', type: 'boolean', label: { fr: 'Ajouter le bouton dans les listes PMK', en: 'Add button to PMK lists' } },
                { key: 'injectKohaListsButton', type: 'boolean', label: { fr: 'Ajouter le bouton dans les listes Koha', en: 'Add button to Koha lists' } },
                { key: 'injectBundleButton', type: 'boolean', label: { fr: 'Ajouter le bouton dans les paquets Koha', en: 'Add button to Koha bundles' } },
                { key: 'injectBasketButton', type: 'boolean', label: { fr: 'Ajouter le bouton dans le panier Koha', en: 'Add button to Koha cart' } },
                { key: 'injectCourseReservesButton', type: 'boolean', label: { fr: 'Ajouter le bouton dans les réserves de cours', en: 'Add button to course reserves' } }
            ]
        });

        window.PMKConfig.getConfig(MODULE_ID).then(value => {
            config = { ...DEFAULT_CONFIG, ...(value || {}) };
            if (config.enabled !== false) {
                injectPersonalListButtons();
                injectKohaNativeListButton();
                injectKohaBasketButton();
                injectCourseReservesButton();
                scheduleBundleBibliographyInjection();
                if (isBuilderPage()) initBuilderPage();
            }
        }).catch(() => {
            config = { ...DEFAULT_CONFIG };
            if (isBuilderPage()) initBuilderPage();
        });

        if (typeof window.PMKConfig.subscribe === 'function') {
            window.PMKConfig.subscribe(MODULE_ID, value => {
                config = { ...DEFAULT_CONFIG, ...(value || {}) };
                if (config.enabled !== false) {
                    injectPersonalListButtons();
                    injectKohaNativeListButton();
                    injectKohaBasketButton();
                    injectCourseReservesButton();
                    scheduleBundleBibliographyInjection();
                }
            });
        }
        return true;
    }

    function boot() {
        installIntegrationObserver();

        if (registerWithPMK()) return;
        window.addEventListener('pmk:config-ready', registerWithPMK, { once: true });

        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            if (registerWithPMK() || tries >= 120) {
                clearInterval(timer);
                if (!registered) {
                    config = { ...DEFAULT_CONFIG };
                    injectPersonalListButtons();
                    injectKohaNativeListButton();
                    injectKohaBasketButton();
                    injectCourseReservesButton();
                    scheduleBundleBibliographyInjection();
                    if (isBuilderPage()) initBuilderPage();
                }
            }
        }, 50);
    }

    window.PMKBibliography = {
        version: VERSION,
        moduleId: MODULE_ID,
        authentication: 'none',
        open: function (options) {
            const params = new URLSearchParams();
            params.set('pmk_page', PAGE_PARAM);
            if (options?.source) params.set('source', options.source);
            if (options?.listId) params.set('list', options.listId);
            if (options?.type) params.set('type', options.type);
            if (options?.template) params.set('template', options.template);
            window.location.href = '/cgi-bin/koha/mainpage.pl?' + params.toString();
        },
        builtins: () => clone(BUILTIN_TEMPLATES),
        getActiveProfile: resolveActiveProfile,
        openBundle: openBundleBibliography,
        collectBasket: collectKohaBasketEntries,
        collectCourseReserves: collectCourseReserveEntries,
        resolveCovers: async biblionumber => {
            const id = clean(biblionumber);
            if (!id) return [];
            const marc = await fetchMarcForBiblio(id);
            const biblio = await enrichNotice(normalizeStoredNotice({ biblionumber: id }));
            return clone(biblio.coverCandidates || []);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

})(window, document);
