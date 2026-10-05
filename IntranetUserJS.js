/* ============================================================
   PimpMyKoha — exemple de chargeur pour IntranetUserJS
   Mise à jour : 05/10/2026

   Copier ce code sans balises <script> dans IntranetUserJS.
   Adapter base à l’URL où le contenu de scripts/ est hébergé.
   Certaines ressources utilisent /public/koha-scripts/ en interne :
   conserver ce chemin ou adapter également leurs sous-chargeurs.
   Les paramètres locaux des fichiers publiés restent à configurer.

   Ordre conservé : socle avant modules, listes après 129/130,
   guides avant IntranetNav. Ne pas charger directement les runtimes
   066-067, 071, 075 ni les ressources guides/widgets/pages.
   018 utilise le nom présent dans le dépôt ; les appels absents
   restent en commentaire et ne sont pas exécutés.
   Le tableau de bord externe n’est pas inclus dans ce dépôt.
   ============================================================ */

(function () {
    'use strict';

    const base = 'https://koha.example.org/public/koha-scripts/';
    const REL = '20261005-publication';

    if (window.__kohaScripts_byScriptTag) return;
    window.__kohaScripts_byScriptTag = true;

    const files = [
        "000-pmk-config-firestore.js",
        "000-pmk-cover-resolver.js",
        "001-modification-entete-issuehistory.js",
        "002-verification-coordonnees.js",
        "003-ajout-bouton-imprimer-info.js",
        "004-calcul-duree-pret-detail.js",
        "005-style-holdings-table.js",
        "006-copy-patron-identifiers.js",
        "007-highlight-readingrec.js",
        "008-issuehistory-timeline.js",
        "009-4eme-de-couv.js",
        "010-boutons-recherche-externe.js",
        "011-moredetail-layout.js",
        "014-calcule-dates-reservations.js",
        "017-gestion-litiges-select.js",
        "018-element-formatting.js",
        "019-prix-search-links.js",
        "021-code-collection-search-results.js",
        "022-popup-deja-emprunte-circulation.js",
        // "024-hide-sidebar-small-window.js", // Absent du dépôt : appel conservé pour référence.
        "025-deplacer-grille-technique.js",
        // "026-highlight-dates-search-red.js", // Absent du dépôt : appel conservé pour référence.
        "027-genre-icons-detail.js",
        "028-transfer-buttons-holdings.js",
        "029-subscription-periodiques.js",
        "031-alert-vide-champ-modif-lot.js",
        "033-mod-table-exemplaires.js",
        "034-modif-dates-technique-detail.js",
        "035-resize-z3950.js",
        "036-clear-search-when-barcode.js",
        "038-tooltips-contextuels.js",
        "041+042-course-list-fields-labels.js",
        "043-format-phone-numbers.js",
        // "046-toggle-request-specific.js", // Absent du dépôt : appel conservé pour référence.
        "048-forbid-accents-batchmod.js",
        "049-astrological-sign.js",
        "050-line-counter.js",
        "051-alert-doc-retour-perdu.js",
        "052-modify-circulation-menu-links.js",
        "055-facets-drawer.js",
        "057-member-pages-utils.js",
        "060-grenouille.js",
        "062-guided-reports-toolss.js",
        "063-mis-en-page-catalogue.js",
        // "064-filter-buttons-search.js", // Absent du dépôt : appel conservé pour référence.
        "065-gen-callnum-links.js",
        "068-blinking-barcode.js",
        // "069-toggle-tech-section.js", // Absent du dépôt : appel conservé pour référence.
        "070-date-utils.js",
        "070-address-autocomplete-memberentry.js",
        "071-history-system-pmk-loader.js",
        "074-claims-filtering.js",
        "075-advanced-search-pmk-loader.js",
        "077-save-guarantor-tp4.js",
        "078-hide-print-overdues.js",
        "079-new-release-logos.js",
        // "080-move-exemplaires-duree.js", // Absent du dépôt : appel conservé pour référence.
        // "081-holdings-table-durations-detail.js", // Absent du dépôt : appel conservé pour référence.
        "081-084-6xx-suggestions.js",
        // "085-arborescence-top-button.js", // Absent du dépôt : appel conservé pour référence.
        "page-qr-code.js",
        // "087-reservations-mdb-arcs-info.js", // Absent du dépôt : appel conservé pour référence.
        "088-musicbrainz-coverart.js",
        // "089-renewal-column-enhancements.js", // Absent du dépôt : appel conservé pour référence.
        "097-extract-tree-content-page-114.js",
        "098-age-calculation-member-detail.js",
        "099-efficiency-indicators.js",
        // "100-koha-age-insertion-split.js", // Absent du dépôt : appel conservé pour référence.
        "101-koha-log.js",
        "102-batchmod-mediabus-buttons.js",
        "103-detail-reservations-summary-style.js",
        "106-scroll-buttons.js",
        // "107-detail-layout-tweaks.js", // Absent du dépôt : appel conservé pour référence.
        "109-helper-domaine.js",
        "110-exemplaire-helper.js",
        "111-internal-share.js",
        "112-responsive.js",
        "113-autocomplete-elestic.js",
        "114-renew-modif.js",
        // "115-copy-cb.js", // Absent du dépôt : appel conservé pour référence.
        "116-chrono-messages.js",
        "117-icons-menus.js",
        "118-mail-tel-obligatoire.js",
        "119-multi-transfert.js",
        "120-date-retrait-reservations.js",
        "123-badges-index-serch.js",
        "124-csp-enfant.js",
        "125-double_clic_resrvation.js",
        "126-masquer-btn-suggestion.js",
        "129-mise-en-forme-exemplaire.js",
        "130-mouvements-documents.js",
        "132-suggestions.js",
        "066-067-lists-manager-pmk-loader.js",
        "135-guides-training-pmk-loader.js",
        "134-intranetnav-menu.js",
        "136-xslt-assistant.js",
        "137-home-widgets.js",
        "138-pages-manager.js",
        "139-attendance-mediabus.js",
        "140-authorised-values-bulk-import.js",
        "141-modif-grille-par-lot.js",
        "142-bibliography-builder.js",
        "143-gestion-retards.js",
        "144-controle-doublons-adherents.js",
    ];

    function scriptUrl(file) {
        const separator = file.includes('?') ? '&' : '?';
        return base + file + separator + 'v=' + encodeURIComponent(REL);
    }

    files.slice(0, 6).forEach(function (file) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        link.href = scriptUrl(file);
        document.head.appendChild(link);
    });

    (function inject(index) {
        if (index >= files.length) return;

        const file = files[index];
        const script = document.createElement('script');
        script.src = scriptUrl(file);
        script.async = false;
        script.onload = function () { inject(index + 1); };
        script.onerror = function () {
            console.warn('PimpMyKoha : erreur de chargement', file);
            inject(index + 1);
        };
        document.head.appendChild(script);
    })(0);
})();
