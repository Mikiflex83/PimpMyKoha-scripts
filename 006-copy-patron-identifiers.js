/* ============================================================
   006-copy-patron-identifiers.js
   Module PMK : Actions de copie
   Version    : 4.1.0-preplugin
   Date       : 2026-09-20

   Fonction :
   - ajoute des actions de copie sur n'importe quelle page Koha ;
   - l'élément source est choisi avec le picker commun PMK ;
   - copie le texte, la valeur d'un champ ou un attribut HTML ;
   - copie la valeur complète, un préfixe ou un suffixe ;
   - action placée avant ou après l'élément (ou à l'intérieur) ;
   - rendu discret : icône/image sans apparence de bouton ;
   - couleur Font Awesome normale et au survol configurables ;
   - taille de l’action/icône configurable ;
   - taille et couleur du texte configurables, y compris au survol ;
   - icône facultative : Font Awesome, image ou aucune ;
   - texte facultatif et personnalisable FR/EN ;
   - compatible avec les anciens réglages 006 pages/actions ;
   - absorbe le script historique 056 (copie ISBN / EAN / titre sur search.pl et detail.pl) ;
   - absorbe le script historique 115 (copie groupée en tableaux : CB / biblionumbers) ;
   - propose un mode individuel et un mode groupé/tableau dans un seul moteur ;
   - peut utiliser un élément visuel déjà présent comme déclencheur sans ajouter un second bouton ;
   - aucun accès direct à Firebase : PMKConfig porte la configuration.
   ============================================================ */
(function () {
    "use strict";

    if (window.__PMK_006_COPY_ACTIONS__) return;
    window.__PMK_006_COPY_ACTIONS__ = true;

    const MODULE_ID = "copy-actions";
    const MODULE_VERSION = "4.1.0-preplugin";
    const BUILTIN_RULE_VERSION = 3;
    const STYLE_ID = "pmk-006-copy-actions-style";
    const CLUSTER_CLASS = "pmk-copy-actions";
    const BUTTON_CLASS = "pmk-copy-action";
    const FEEDBACK_CLASS = "pmk-copy-feedback";
    const TABLE_BUTTON_CLASS = "pmk-copy-table-action";

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function cleanText(value) {
        return String(value == null ? "" : value)
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizePath(value) {
        const raw = String(value || "").trim();
        if (!raw) return "/";
        try {
            if (/^https?:\/\//i.test(raw)) {
                const url = new URL(raw);
                return url.pathname || "/";
            }
        } catch (_) {}
        return (raw.split("?")[0] || "/").replace(/\/+$/, "") || "/";
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const lang = String(document.documentElement.lang || navigator.language || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "fr";
    }

    function i18n(fr, en) {
        return detectLanguage() === "en" ? en : fr;
    }

    function makeId() {
        return "copy-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    const CIRC_CARD_SELECTOR = [
        "label.circ_barcode .cardnumber",
        'h4 a[href*="/cgi-bin/koha/members/moremember.pl?borrowernumber="] .cardnumber',
        ".patroninfo h5 .cardnumber"
    ].join(", ");

    const BASE_DEFAULT_RULES = [
        {
            id: "legacy-moremember-username-full",
            enabled: true,
            label: "Identifiant lecteur — complet",
            pagePath: "/cgi-bin/koha/members/moremember.pl",
            selector: "#patron-username",
            targetName: "Identifiant utilisateur",
            matchMode: "first",
            valueSource: "text",
            attributeName: "",
            excludeSelector: ".label, .pmk-context-config, .pmk-copy-actions",
            trim: true,
            extractRegex: "",
            regexFlags: "",
            regexGroup: 0,
            transform: "full",
            length: 4,
            placement: "inside-end",
            visualType: "fa",
            iconClass: "fa fa-copy",
            imageUrl: "",
            showText: false,
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier l'identifiant",
            titleEn: "Copy username"
        },
        {
            id: "legacy-moremember-card-full",
            enabled: true,
            label: "Numéro de carte — complet",
            pagePath: "/cgi-bin/koha/members/moremember.pl",
            selector: "#patron-cardnumber",
            targetName: "Numéro de carte",
            matchMode: "first",
            valueSource: "text",
            attributeName: "",
            excludeSelector: ".label, .pmk-context-config, .pmk-copy-actions",
            trim: true,
            extractRegex: "",
            regexFlags: "",
            regexGroup: 0,
            transform: "full",
            length: 4,
            placement: "inside-end",
            visualType: "fa",
            iconClass: "fa fa-copy",
            imageUrl: "",
            showText: false,
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier le numéro de carte",
            titleEn: "Copy card number"
        },
        {
            id: "legacy-moremember-card-suffix4",
            enabled: true,
            label: "Numéro de carte — 4 derniers caractères",
            pagePath: "/cgi-bin/koha/members/moremember.pl",
            selector: "#patron-cardnumber",
            targetName: "Numéro de carte",
            matchMode: "first",
            valueSource: "text",
            attributeName: "",
            excludeSelector: ".label, .pmk-context-config, .pmk-copy-actions",
            trim: true,
            extractRegex: "",
            regexFlags: "",
            regexGroup: 0,
            transform: "suffix",
            length: 4,
            placement: "inside-end",
            visualType: "fa",
            iconClass: "fa fa-copy",
            imageUrl: "",
            showText: false,
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier les 4 derniers caractères",
            titleEn: "Copy last 4 characters"
        },
        {
            id: "legacy-circulation-card-full",
            enabled: true,
            label: "Numéro de carte au prêt — complet",
            pagePath: "/cgi-bin/koha/circ/circulation.pl",
            selector: CIRC_CARD_SELECTOR,
            targetName: "Numéro de carte",
            matchMode: "first",
            valueSource: "text",
            attributeName: "",
            excludeSelector: ".pmk-context-config, .pmk-copy-actions",
            trim: true,
            extractRegex: "^\\(?([^()]*)\\)?$",
            regexFlags: "",
            regexGroup: 1,
            transform: "full",
            length: 4,
            placement: "after",
            visualType: "fa",
            iconClass: "fa fa-copy",
            imageUrl: "",
            showText: false,
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier le numéro de carte",
            titleEn: "Copy card number"
        },
        {
            id: "legacy-circulation-card-suffix4",
            enabled: true,
            label: "Numéro de carte au prêt — 4 derniers caractères",
            pagePath: "/cgi-bin/koha/circ/circulation.pl",
            selector: CIRC_CARD_SELECTOR,
            targetName: "Numéro de carte",
            matchMode: "first",
            valueSource: "text",
            attributeName: "",
            excludeSelector: ".pmk-context-config, .pmk-copy-actions",
            trim: true,
            extractRegex: "^\\(?([^()]*)\\)?$",
            regexFlags: "",
            regexGroup: 1,
            transform: "suffix",
            length: 4,
            placement: "after",
            visualType: "fa",
            iconClass: "fa fa-copy",
            imageUrl: "",
            showText: false,
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier les 4 derniers caractères",
            titleEn: "Copy last 4 characters"
        }
    ];

    /*
     * Règles historiques du 056 intégrées directement au moteur commun.
     *
     * Le 056 ne créait pas ces pictogrammes : ils sont fournis par les mises en
     * page catalogue de la Dracénie. Le moteur "Actions de copie" se branche
     * donc sur ces déclencheurs existants, sans produire un second bouton.
     */
    const LEGACY_056_RULES = [
        {
            id: "legacy-056-search-isbn",
            enabled: true,
            label: "Résultats catalogue — copier ISBN",
            pagePath: "/cgi-bin/koha/catalogue/search.pl",
            actionMode: "existing-trigger",
            selector: ".isbn-result",
            targetName: "ISBN",
            triggerSelector: "span.copy-isbn-result",
            triggerName: "Action Copier ISBN",
            matchMode: "all",
            valueSource: "text",
            trim: true,
            transform: "full",
            titleFr: "Copier ISBN",
            titleEn: "Copy ISBN"
        },
        {
            id: "legacy-056-search-ean",
            enabled: true,
            label: "Résultats catalogue — copier EAN",
            pagePath: "/cgi-bin/koha/catalogue/search.pl",
            actionMode: "existing-trigger",
            selector: ".ean-result",
            targetName: "EAN",
            triggerSelector: "span.copy-ean-result",
            triggerName: "Action Copier EAN",
            matchMode: "all",
            valueSource: "text",
            trim: true,
            transform: "full",
            titleFr: "Copier EAN",
            titleEn: "Copy EAN"
        },
        {
            id: "legacy-056-search-title",
            enabled: true,
            label: "Résultats catalogue — copier le titre",
            pagePath: "/cgi-bin/koha/catalogue/search.pl",
            actionMode: "existing-trigger",
            selector: ".firstresult .titlebibresult",
            targetName: "Titre",
            triggerSelector: "img.copy-title-result",
            triggerName: "Action Copier le titre",
            matchMode: "all",
            valueSource: "text",
            trim: true,
            transform: "full",
            titleFr: "Copier le titre",
            titleEn: "Copy title"
        },
        {
            id: "legacy-056-detail-isbn",
            enabled: true,
            label: "Notice détaillée — copier ISBN",
            pagePath: "/cgi-bin/koha/catalogue/detail.pl",
            actionMode: "existing-trigger",
            selector: ".tech-isbn",
            targetName: "ISBN",
            triggerSelector: ".copy-isbn",
            triggerName: "Action Copier ISBN",
            matchMode: "first",
            valueSource: "text",
            trim: true,
            transform: "full",
            titleFr: "Copier ISBN",
            titleEn: "Copy ISBN"
        },
        {
            id: "legacy-056-detail-ean",
            enabled: true,
            label: "Notice détaillée — copier EAN",
            pagePath: "/cgi-bin/koha/catalogue/detail.pl",
            actionMode: "existing-trigger",
            selector: ".tech-ean",
            targetName: "EAN",
            triggerSelector: ".copy-ean",
            triggerName: "Action Copier EAN",
            matchMode: "first",
            valueSource: "text",
            trim: true,
            transform: "full",
            titleFr: "Copier EAN",
            titleEn: "Copy EAN"
        },
        {
            id: "legacy-056-detail-title",
            enabled: true,
            label: "Notice détaillée — copier le titre",
            pagePath: "/cgi-bin/koha/catalogue/detail.pl",
            actionMode: "existing-trigger",
            selector: ".titlemika",
            targetName: "Titre",
            triggerSelector: ".copy-title",
            triggerName: "Action Copier le titre",
            matchMode: "first",
            valueSource: "text",
            trim: true,
            transform: "full",
            titleFr: "Copier le titre",
            titleEn: "Copy title"
        }
    ];


    /*
     * Règles historiques du 115 intégrées au moteur commun.
     *
     * Le comportement visible historique est conservé :
     * - bouton dans la barre DataTables ;
     * - copie des valeurs actuellement affichées ;
     * - déduplication ;
     * - une valeur par ligne dans le presse-papiers.
     *
     * Les sélecteurs par libellé restent uniquement des fallbacks FR/EN :
     * une classe/structure stable est utilisée en priorité lorsqu'elle existe.
     */
    const LEGACY_115_TABLE_RULES = [
        {
            id: "legacy-115-returns-barcodes",
            legacyButtonId: "btn-copy-all-barcodes",
            enabled: true,
            label: "Retours — copier les codes-barres",
            pagePath: "/cgi-bin/koha/circ/returns.pl",
            tableSelector: "#checkedintable",
            tableName: "Table des retours",
            sourceMode: "column",
            columnHeaderSelector: "thead th.ci-barcode",
            columnHeaderLabels: "Code à barres;Code barre;Code-barres;Barcode",
            sourceSelector: "",
            valueSource: "text",
            attributeName: "",
            urlParam: "",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonContainerSelector: "",
            buttonPosition: "append",
            iconClass: "fa fa-lg fa-copy",
            buttonTextFr: "Copier les codes-barres",
            buttonTextEn: "Copy barcodes",
            titleFr: "Copier tous les codes-barres affichés",
            titleEn: "Copy all displayed barcodes",
            feedbackSuccessTextFr: "{count} code(s) à barres copié(s) !",
            feedbackSuccessTextEn: "{count} barcode(s) copied!",
            feedbackEmptyTextFr: "Aucun code-barres trouvé",
            feedbackEmptyTextEn: "No barcode found"
        },
        {
            id: "legacy-115-moremember-barcodes",
            legacyButtonId: "btn-copy-all-barcodes",
            enabled: true,
            label: "Fiche lecteur — copier les codes-barres des prêts",
            pagePath: "/cgi-bin/koha/members/moremember.pl",
            tableSelector: "#issues-table",
            tableName: "Prêts du lecteur",
            sourceMode: "selector",
            sourceSelector: '#issues-table tbody a[href*="/cgi-bin/koha/catalogue/moredetail.pl?biblionumber="]',
            sourceName: "Code-barres du prêt",
            valueSource: "text",
            attributeName: "",
            urlParam: "",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonContainerSelector: "",
            buttonPosition: "append",
            iconClass: "fa fa-lg fa-copy",
            buttonTextFr: "Copier les codes-barres",
            buttonTextEn: "Copy barcodes",
            titleFr: "Copier tous les codes-barres affichés",
            titleEn: "Copy all displayed barcodes",
            feedbackSuccessTextFr: "{count} code(s) à barres copié(s) !",
            feedbackSuccessTextEn: "{count} barcode(s) copied!",
            feedbackEmptyTextFr: "Aucun code-barres trouvé",
            feedbackEmptyTextEn: "No barcode found"
        },
        {
            id: "legacy-115-circulation-barcodes",
            legacyButtonId: "btn-copy-all-barcodes",
            enabled: true,
            label: "Prêt — copier les codes-barres des prêts",
            pagePath: "/cgi-bin/koha/circ/circulation.pl",
            tableSelector: "#issues-table",
            tableName: "Prêts du lecteur",
            sourceMode: "selector",
            sourceSelector: '#issues-table tbody a[href*="/cgi-bin/koha/catalogue/moredetail.pl?biblionumber="]',
            sourceName: "Code-barres du prêt",
            valueSource: "text",
            attributeName: "",
            urlParam: "",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonContainerSelector: "",
            buttonPosition: "append",
            iconClass: "fa fa-lg fa-copy",
            buttonTextFr: "Copier les codes-barres",
            buttonTextEn: "Copy barcodes",
            titleFr: "Copier tous les codes-barres affichés",
            titleEn: "Copy all displayed barcodes",
            feedbackSuccessTextFr: "{count} code(s) à barres copié(s) !",
            feedbackSuccessTextEn: "{count} barcode(s) copied!",
            feedbackEmptyTextFr: "Aucun code-barres trouvé",
            feedbackEmptyTextEn: "No barcode found"
        },
        {
            id: "legacy-115-batchmod-barcodes",
            legacyButtonId: "btn-copy-all-barcodes",
            enabled: true,
            label: "Modification par lot — copier les codes-barres",
            pagePath: "/cgi-bin/koha/tools/batchMod.pl",
            tableSelector: "#itemst",
            tableName: "Exemplaires de la modification par lot",
            sourceMode: "column",
            columnHeaderSelector: "",
            columnHeaderLabels: "Code barre;Code à barres;Code-barres;Barcode",
            sourceSelector: "",
            valueSource: "text",
            attributeName: "",
            urlParam: "",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonContainerSelector: "",
            buttonPosition: "append",
            iconClass: "fa fa-lg fa-copy",
            buttonTextFr: "Copier les codes-barres",
            buttonTextEn: "Copy barcodes",
            titleFr: "Copier tous les codes-barres affichés",
            titleEn: "Copy all displayed barcodes",
            feedbackSuccessTextFr: "{count} code(s) à barres copié(s) !",
            feedbackSuccessTextEn: "{count} barcode(s) copied!",
            feedbackEmptyTextFr: "Aucun code-barres trouvé",
            feedbackEmptyTextEn: "No barcode found"
        },
        {
            id: "legacy-115-itemsearch-biblionumbers",
            legacyButtonId: "btn-copy-all-barcodes",
            enabled: true,
            label: "Recherche exemplaires — copier les biblionumbers",
            pagePath: "/cgi-bin/koha/catalogue/itemsearch.pl",
            tableSelector: "#item_search",
            tableName: "Résultats de recherche exemplaires",
            sourceMode: "selector",
            sourceSelector: '#item_search tbody a[href*="biblionumber="]',
            sourceName: "Lien vers la notice",
            valueSource: "attribute",
            attributeName: "href",
            urlParam: "biblionumber",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonContainerSelector: "",
            buttonPosition: "append",
            iconClass: "fa fa-lg fa-copy",
            buttonTextFr: "Copier les biblionumbers",
            buttonTextEn: "Copy biblionumbers",
            titleFr: "Copier tous les biblionumbers affichés",
            titleEn: "Copy all displayed biblionumbers",
            feedbackSuccessTextFr: "{count} biblionumber(s) copié(s) !",
            feedbackSuccessTextEn: "{count} biblionumber(s) copied!",
            feedbackEmptyTextFr: "Aucun biblionumber trouvé",
            feedbackEmptyTextEn: "No biblionumber found"
        },
        {
            id: "legacy-115-itemsearch-barcodes",
            legacyButtonId: "btn-copy-itemsearch-barcodes",
            enabled: true,
            label: "Recherche exemplaires — copier les codes-barres",
            pagePath: "/cgi-bin/koha/catalogue/itemsearch.pl",
            tableSelector: "#item_search",
            tableName: "Résultats de recherche exemplaires",
            sourceMode: "column",
            columnHeaderSelector: "",
            columnHeaderLabels: "Code à barres;Code barre;Code-barres;Barcode",
            sourceSelector: "",
            valueSource: "text",
            attributeName: "",
            urlParam: "",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonContainerSelector: "",
            buttonPosition: "append",
            iconClass: "fa fa-lg fa-copy",
            buttonTextFr: "Copier les codes-barres",
            buttonTextEn: "Copy barcodes",
            titleFr: "Copier tous les codes-barres affichés",
            titleEn: "Copy all displayed barcodes",
            feedbackSuccessTextFr: "{count} code(s) à barres copié(s) !",
            feedbackSuccessTextEn: "{count} barcode(s) copied!",
            feedbackEmptyTextFr: "Aucun code-barres trouvé",
            feedbackEmptyTextEn: "No barcode found"
        }
    ];

    /*
     * Règle historique du 133 absorbée dans le moteur commun :
     * copie individuelle du code-barres dans le tableau des exemplaires de detail.pl.
     */
    const LEGACY_133_RULES = [
        {
            id: "legacy-133-detail-item-barcode",
            enabled: true,
            label: "Détail notice — copier le code-barres exemplaire",
            pagePath: "/cgi-bin/koha/catalogue/detail.pl",
            actionMode: "generated",
            selector: '#holdings_table td[data-label="barcode"] a',
            targetName: "Code-barres exemplaire",
            matchMode: "all",
            valueSource: "text",
            attributeName: "",
            excludeSelector: ".pmk-copy-actions",
            trim: true,
            extractRegex: "",
            regexFlags: "",
            regexGroup: 0,
            transform: "full",
            length: 4,
            placement: "after",
            visualType: "fa",
            iconClass: "fa-regular fa-copy",
            iconColor: "#6c757d",
            iconHoverColor: "#408540",
            actionSizePx: 14,
            imageUrl: "",
            showText: false,
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier le code-barres",
            titleEn: "Copy barcode",
            feedbackEnabled: true,
            feedbackSuccessTextFr: "✓ Copié",
            feedbackSuccessTextEn: "✓ Copied",
            feedbackSuccessColor: "#408540"
        }
    ];

    const DEFAULT_RULES = BASE_DEFAULT_RULES.concat(LEGACY_056_RULES, LEGACY_133_RULES);

    const DEFAULT_CONFIG = {
        enabled: true,
        observeDom: true,
        observeDelay: 120,
        builtInRuleVersion: 0,
        rules: clone(DEFAULT_RULES),
        tableRules: clone(LEGACY_115_TABLE_RULES)
    };

    const RULE_BASE = {
        id: "",
        enabled: true,
        label: "",
        pagePath: "",
        actionMode: "generated",
        selector: "",
        targetName: "",
        triggerSelector: "",
        triggerName: "",
        triggerMatchCount: null,
        matchMode: "all",
        valueSource: "text",
        attributeName: "",
        excludeSelector: "",
        trim: true,
        extractRegex: "",
        regexFlags: "",
        regexGroup: 0,
        transform: "full",
        length: 4,
        placement: "after",
        visualType: "fa",
        iconClass: "fa fa-copy",
        iconColor: "#6c757d",
        iconHoverColor: "#212529",
        actionSizePx: 16,
        imageUrl: "",
        showText: false,
        textSizePx: 13,
        textColor: "#495057",
        textHoverColor: "#212529",
        buttonTextFr: "Copier",
        buttonTextEn: "Copy",
        titleFr: "Copier",
        titleEn: "Copy",
        exampleValue: "",
        matchCount: null,

        // Feedback visuel générique — repris du rendu historique du 107.
        // Disponible pour toutes les actions actuelles et futures.
        feedbackEnabled: true,
        feedbackPlacement: "auto",
        feedbackDurationMs: 1700,
        feedbackSuccessTextFr: "✓ Copié",
        feedbackSuccessTextEn: "✓ Copied",
        feedbackErrorTextFr: "Échec de copie",
        feedbackErrorTextEn: "Copy failed",
        feedbackSuccessColor: "#2e7d32",
        feedbackErrorColor: "#dc3545",
        feedbackFontSize: "0.75em",
        feedbackFontWeight: "600",
        feedbackMargin: "0 0 0 5px",
        feedbackFade: true
    };

    const TABLE_RULE_BASE = {
        id: "",
        enabled: true,
        label: "",
        pagePath: "",
        tableSelector: "",
        tableName: "",
        tableMatchCount: null,
        sourceMode: "column",
        sourceSelector: "",
        sourceName: "",
        sourceMatchCount: null,
        columnHeaderSelector: "",
        columnHeaderLabels: "",
        columnIndexHint: null,
        valueSource: "text",
        attributeName: "",
        urlParam: "",
        excludeSelector: "",
        trim: true,
        extractRegex: "",
        regexFlags: "",
        regexGroup: 0,
        transform: "full",
        length: 4,
        scope: "visible",
        selectedRowSelector: "tr.selected",
        selectionCheckboxSelector: 'input[type="checkbox"]:checked',
        deduplicate: true,
        separator: "newline",
        customSeparator: "",
        resultOrder: "display",
        buttonStyle: "datatable",
        legacyButtonId: "",
        buttonExtraClass: "",
        buttonContainerSelector: "",
        buttonContainerName: "",
        buttonPosition: "append",
        iconClass: "fa fa-lg fa-copy",
        iconColor: "",
        showText: true,
        textColor: "",
        fontSizePx: 13,
        buttonTextFr: "Copier",
        buttonTextEn: "Copy",
        titleFr: "Copier les valeurs affichées",
        titleEn: "Copy displayed values",
        feedbackEnabled: true,
        feedbackDurationMs: 2000,
        feedbackSuccessTextFr: "{count} valeur(s) copiée(s) !",
        feedbackSuccessTextEn: "{count} value(s) copied!",
        feedbackEmptyTextFr: "Aucune valeur trouvée",
        feedbackEmptyTextEn: "No value found",
        feedbackErrorTextFr: "Erreur lors de la copie",
        feedbackErrorTextEn: "Copy failed",
        exampleValue: ""
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribe = null;
    let observers = [];
    let observerTimer = 0;
    let registered = false;
    let existingBindings = [];
    let tableLifecycleBindings = [];

    /*
     * Compatibilité avec les règles créées avant le picker commun 1.1 :
     * lorsqu'un agent avait cliqué sur le code-barres d'un exemplaire dans
     * detail.pl, l'ancien picker mémorisait l'URL exacte avec biblionumber et
     * itemnumber. La règle ne fonctionnait donc plus sur la notice suivante.
     *
     * Cette migration reste volontairement ciblée sur ce cas connu afin de ne
     * pas modifier des sélecteurs avancés saisis intentionnellement ailleurs.
     */
    function migrateLegacyDetailBarcodeSelector(selector, pagePath) {
        const raw = String(selector || "").trim();
        if (!raw || normalizePath(pagePath) !== "/cgi-bin/koha/catalogue/detail.pl") return raw;
        const decoded = raw.replace(/&amp;/g, "&");
        const match = decoded.match(/^a\[href=(['"])(\/cgi-bin\/koha\/catalogue\/moredetail\.pl\?[^'"]*itemnumber=[^'"]*)\1\]$/i);
        if (!match) return raw;
        return '#holdings_table tbody a[href*="/cgi-bin/koha/catalogue/moredetail.pl"][href*="itemnumber="]';
    }

    function mergeRule(raw, index) {
        const rule = Object.assign({}, RULE_BASE, raw || {});
        rule.id = String(rule.id || ("copy-rule-" + (index + 1)));
        rule.pagePath = String(rule.pagePath || window.location.pathname || "/");
        rule.actionMode = rule.actionMode === "existing-trigger" ? "existing-trigger" : "generated";
        rule.selector = migrateLegacyDetailBarcodeSelector(String(rule.selector || ""), rule.pagePath);
        rule.triggerSelector = String(rule.triggerSelector || "");
        rule.matchMode = ["all", "first"].includes(rule.matchMode) ? rule.matchMode : "all";
        rule.valueSource = ["text", "value", "attribute"].includes(rule.valueSource) ? rule.valueSource : "text";
        rule.transform = ["full", "prefix", "suffix"].includes(rule.transform) ? rule.transform : "full";
        rule.placement = ["before", "after", "inside-start", "inside-end"].includes(rule.placement) ? rule.placement : "after";
        rule.visualType = ["none", "fa", "image"].includes(rule.visualType) ? rule.visualType : "fa";
        rule.actionSizePx = Math.max(8, Math.min(64, Number(rule.actionSizePx) || 16));
        rule.textSizePx = Math.max(8, Math.min(40, Number(rule.textSizePx) || 13));
        rule.length = Math.max(1, Math.min(500, Number(rule.length) || 4));
        rule.regexGroup = Math.max(0, Number(rule.regexGroup) || 0);
        rule.feedbackPlacement = ["auto", "after-trigger", "parent-end", "floating"].includes(rule.feedbackPlacement)
            ? rule.feedbackPlacement : "auto";
        rule.feedbackDurationMs = Math.max(300, Math.min(10000, Number(rule.feedbackDurationMs) || 1700));
        rule.feedbackFontSize = cleanText(rule.feedbackFontSize) || "0.75em";
        rule.feedbackFontWeight = cleanText(rule.feedbackFontWeight) || "600";
        rule.feedbackMargin = cleanText(rule.feedbackMargin) || "0 0 0 5px";
        rule.feedbackFade = rule.feedbackFade !== false;
        return rule;
    }

    function mergeTableRule(raw, index) {
        const rule = Object.assign({}, TABLE_RULE_BASE, raw || {});
        rule.id = String(rule.id || ("copy-table-rule-" + (index + 1)));
        rule.pagePath = String(rule.pagePath || window.location.pathname || "/");
        rule.tableSelector = String(rule.tableSelector || "");
        rule.legacyButtonId = String(rule.legacyButtonId || "");
        rule.sourceMode = ["column", "selector"].includes(rule.sourceMode) ? rule.sourceMode : "column";
        rule.sourceSelector = String(rule.sourceSelector || "");
        rule.columnHeaderSelector = String(rule.columnHeaderSelector || "");
        rule.columnHeaderLabels = String(rule.columnHeaderLabels || "");
        rule.valueSource = ["text", "value", "attribute"].includes(rule.valueSource) ? rule.valueSource : "text";
        rule.scope = ["visible", "filtered", "selected", "loaded"].includes(rule.scope) ? rule.scope : "visible";
        rule.separator = ["newline", "comma", "semicolon", "tab", "space", "custom"].includes(rule.separator) ? rule.separator : "newline";
        rule.resultOrder = ["display", "alpha-asc", "alpha-desc", "numeric-asc", "numeric-desc"].includes(rule.resultOrder)
            ? rule.resultOrder : "display";
        rule.buttonStyle = ["datatable", "koha"].includes(rule.buttonStyle) ? rule.buttonStyle : "datatable";
        rule.buttonPosition = rule.buttonPosition === "prepend" ? "prepend" : "append";
        rule.fontSizePx = Math.max(8, Math.min(40, Number(rule.fontSizePx) || 13));
        rule.transform = ["full", "prefix", "suffix"].includes(rule.transform) ? rule.transform : "full";
        rule.length = Math.max(1, Math.min(500, Number(rule.length) || 4));
        rule.regexGroup = Math.max(0, Number(rule.regexGroup) || 0);
        rule.feedbackDurationMs = Math.max(300, Math.min(10000, Number(rule.feedbackDurationMs) || 2000));
        rule.deduplicate = rule.deduplicate !== false;
        if (rule.columnIndexHint !== null && rule.columnIndexHint !== undefined && rule.columnIndexHint !== "") {
            const parsed = Number(rule.columnIndexHint);
            rule.columnIndexHint = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
        } else {
            rule.columnIndexHint = null;
        }
        return rule;
    }

    function ensureUniqueTableRuleIds(rules) {
        const used = new Set();
        return (Array.isArray(rules) ? rules : []).map(function (rawRule, index) {
            const rule = mergeTableRule(rawRule, index);
            let candidate = cleanText(rule.id);
            if (!candidate || used.has(candidate)) {
                const base = candidate || "copy-table-rule";
                do {
                    candidate = base + "-" + makeId().replace(/^copy-/, "");
                } while (used.has(candidate));
                rule.id = candidate;
            }
            used.add(rule.id);
            return rule;
        });
    }

    function legacySelector(pageId, source) {
        if (pageId === "members.moremember" && source === "username") {
            return { selector: "#patron-username", targetName: "Identifiant utilisateur", excludeSelector: ".label, .pmk-context-config, .pmk-copy-actions", regex: "", group: 0 };
        }
        if (pageId === "members.moremember" && source === "cardnumber") {
            return { selector: "#patron-cardnumber", targetName: "Numéro de carte", excludeSelector: ".label, .pmk-context-config, .pmk-copy-actions", regex: "", group: 0 };
        }
        if (pageId === "circ.circulation" && source === "cardnumber") {
            return { selector: CIRC_CARD_SELECTOR, targetName: "Numéro de carte", excludeSelector: ".pmk-context-config, .pmk-copy-actions", regex: "^\\(?([^()]*)\\)?$", group: 1 };
        }
        return null;
    }

    function migrateLegacyPages(raw) {
        const rules = [];
        (raw.pages || []).forEach(function (page) {
            if (!page || page.enabled === false) return;
            (page.actions || []).forEach(function (action, actionIndex) {
                if (!action) return;
                const legacy = legacySelector(page.id, action.source);
                if (!legacy) return;
                rules.push(mergeRule({
                    id: String(action.id || (page.id + "-" + actionIndex)),
                    enabled: action.enabled !== false,
                    label: String(action.labelFr || action.labelEn || legacy.targetName),
                    pagePath: page.path || (page.id === "circ.circulation" ? "/cgi-bin/koha/circ/circulation.pl" : "/cgi-bin/koha/members/moremember.pl"),
                    selector: legacy.selector,
                    targetName: legacy.targetName,
                    matchMode: "first",
                    valueSource: "text",
                    excludeSelector: legacy.excludeSelector,
                    extractRegex: legacy.regex,
                    regexGroup: legacy.group,
                    transform: action.transform || "full",
                    length: action.length || 4,
                    placement: "after",
                    visualType: "fa",
                    iconClass: "fa fa-copy",
                    showText: false,
                    titleFr: String(action.labelFr || ""),
                    titleEn: String(action.labelEn || "")
                }, rules.length));
            });
        });
        return rules;
    }

    function ensureUniqueRuleIds(rules) {
        const used = new Set();
        return (Array.isArray(rules) ? rules : []).map(function (rawRule, index) {
            const rule = mergeRule(rawRule, index);
            let candidate = cleanText(rule.id);
            if (!candidate || used.has(candidate)) {
                const base = candidate || "copy-rule";
                do {
                    candidate = base + "-" + makeId().replace(/^copy-/, "");
                } while (used.has(candidate));
                rule.id = candidate;
            }
            used.add(rule.id);
            return rule;
        });
    }

    function normalizeConfig(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        let rules;
        const suppliedRules = Array.isArray(source.rules) ? source.rules : null;
        const defaultRulesInjected = suppliedRules && JSON.stringify(suppliedRules) === JSON.stringify(DEFAULT_RULES);
        if (Array.isArray(source.pages) && (!suppliedRules || defaultRulesInjected)) rules = migrateLegacyPages(source);
        else if (suppliedRules) rules = suppliedRules.map(mergeRule);
        else rules = clone(DEFAULT_RULES).map(mergeRule);

        let tableRules = Array.isArray(source.tableRules)
            ? source.tableRules.map(mergeTableRule)
            : [];

        /*
         * Migration des règles intégrées :
         * v1 = reprise du 056 (ISBN / EAN / titre) ;
         * v2 = reprise du 115 (copies groupées dans les tableaux) ;
         * v3 = reprise du 133 (copie du code-barres exemplaire sur detail.pl).
         *
         * Chaque palier ne s'exécute qu'une fois. Ainsi, une règle historique
         * supprimée volontairement après sa migration ne réapparaît pas lors
         * d'une version ultérieure.
         */
        const sourceBuiltInVersion = Math.max(0, Number(source.builtInRuleVersion) || 0);

        if (sourceBuiltInVersion < 1) {
            const existingIds = new Set(rules.map(function (rule) { return cleanText(rule && rule.id); }));
            LEGACY_056_RULES.forEach(function (rule) {
                if (!existingIds.has(rule.id)) {
                    rules.push(mergeRule(clone(rule), rules.length));
                    existingIds.add(rule.id);
                }
            });
        }

        if (sourceBuiltInVersion < 2) {
            const existingTableIds = new Set(tableRules.map(function (rule) { return cleanText(rule && rule.id); }));
            LEGACY_115_TABLE_RULES.forEach(function (rule) {
                if (!existingTableIds.has(rule.id)) {
                    tableRules.push(mergeTableRule(clone(rule), tableRules.length));
                    existingTableIds.add(rule.id);
                }
            });
        }

        if (sourceBuiltInVersion < 3) {
            const existingIds = new Set(rules.map(function (rule) { return cleanText(rule && rule.id); }));
            LEGACY_133_RULES.forEach(function (rule) {
                if (!existingIds.has(rule.id)) {
                    rules.push(mergeRule(clone(rule), rules.length));
                    existingIds.add(rule.id);
                }
            });
        }

        rules = ensureUniqueRuleIds(rules);
        tableRules = ensureUniqueTableRuleIds(tableRules);

        return {
            enabled: source.enabled !== false,
            observeDom: source.observeDom !== false,
            observeDelay: Math.max(25, Math.min(2000, Number(source.observeDelay) || 120)),
            builtInRuleVersion: BUILTIN_RULE_VERSION,
            rules: rules,
            tableRules: tableRules
        };
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .${CLUSTER_CLASS}{display:inline-flex;align-items:center;gap:.18rem;vertical-align:middle;margin:0 .16rem;white-space:nowrap}
            .${BUTTON_CLASS}{appearance:none!important;-webkit-appearance:none!important;display:inline-flex!important;align-items:center;justify-content:center;gap:.22rem;margin:0!important;padding:.05rem .10rem!important;min-width:var(--pmk-copy-action-size,16px);min-height:var(--pmk-copy-action-size,16px);border:0!important;background:transparent!important;box-shadow:none!important;text-decoration:none!important;color:var(--pmk-copy-icon-color,currentColor)!important;opacity:.72;line-height:1;cursor:pointer;vertical-align:middle}
            .${BUTTON_CLASS}:hover{background:transparent!important;box-shadow:none!important;color:var(--pmk-copy-icon-hover-color,var(--pmk-copy-icon-color,currentColor))!important;opacity:1}
            .${BUTTON_CLASS}:focus{background:transparent!important;box-shadow:none!important}
            .${BUTTON_CLASS}:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:.16rem;opacity:1}
            .${BUTTON_CLASS} i{display:inline-block;font-size:var(--pmk-copy-action-size,16px);transition:transform .14s ease,color .14s ease,opacity .14s ease}
            .${BUTTON_CLASS} img{display:block;width:var(--pmk-copy-action-size,16px);height:var(--pmk-copy-action-size,16px);max-width:none;max-height:none;object-fit:contain;transition:transform .14s ease,opacity .14s ease}
            .${BUTTON_CLASS}:hover i,.${BUTTON_CLASS}:hover img{transform:scale(1.12)}
            .${BUTTON_CLASS}:hover img{opacity:.88}
            .${BUTTON_CLASS} .pmk-copy-button-text{font-size:var(--pmk-copy-text-size,13px);font-weight:500;line-height:1.1;color:var(--pmk-copy-text-color,currentColor);transition:color .14s ease}
            .${BUTTON_CLASS}:hover .pmk-copy-button-text{color:var(--pmk-copy-text-hover-color,var(--pmk-copy-text-color,currentColor))}
            .${FEEDBACK_CLASS}{display:inline-block;font-size:.78em;font-weight:600;line-height:1.2;white-space:nowrap}
            .${FEEDBACK_CLASS}.is-ok{color:var(--bs-success,#198754)}
            .${FEEDBACK_CLASS}.is-error{color:var(--bs-danger,#dc3545)}
            .${FEEDBACK_CLASS}.is-standalone{position:fixed;top:1rem;right:1rem;z-index:1095;padding:.38rem .58rem;border:1px solid currentColor;border-radius:.38rem;background:var(--bs-body-bg,#fff);box-shadow:0 2px 9px rgba(0,0,0,.14)}
            .${TABLE_BUTTON_CLASS}{display:inline-flex!important;align-items:center!important;gap:.3rem!important}
            .${TABLE_BUTTON_CLASS} i{pointer-events:none}
            .pmk-copy-table-fallback-toolbar{display:flex;flex-wrap:wrap;gap:.35rem;margin:.35rem 0 .55rem}
            .pmk-copy-table-fallback-toolbar .${TABLE_BUTTON_CLASS}{margin:0}
            @keyframes pmkCopyFadeOut{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
        `;
        document.head.appendChild(style);
    }

    function safeQueryAll(selector) {
        if (!selector) return [];
        try { return Array.from(document.querySelectorAll(selector)); } catch (_) { return []; }
    }

    function extractValue(raw, rule) {
        let value = raw == null ? "" : String(raw);
        if (rule.trim !== false) value = value.trim();
        const pattern = String(rule.extractRegex || "").trim();
        if (pattern) {
            try {
                const flags = String(rule.regexFlags || "").replace(/[^dgimsuvy]/g, "");
                const match = value.match(new RegExp(pattern, flags));
                if (!match) return "";
                value = match[Math.max(0, Number(rule.regexGroup) || 0)] == null ? "" : String(match[Math.max(0, Number(rule.regexGroup) || 0)]);
            } catch (_) { return ""; }
        }
        return rule.trim !== false ? value.trim() : value;
    }

    function elementRawValue(element, rule) {
        if (!element) return "";
        if (rule.valueSource === "attribute") {
            const name = String(rule.attributeName || "").trim();
            return name ? element.getAttribute(name) : "";
        }
        if (rule.valueSource === "value") return element.value == null ? "" : element.value;
        const cloneNode = element.cloneNode(true);
        cloneNode.querySelectorAll("." + CLUSTER_CLASS + ", .pmk-context-config").forEach(function (node) { node.remove(); });
        const extra = String(rule.excludeSelector || "").trim();
        if (extra) {
            try { cloneNode.querySelectorAll(extra).forEach(function (node) { node.remove(); }); } catch (_) {}
        }
        return cloneNode.textContent || "";
    }

    function readValue(element, rule) {
        return extractValue(elementRawValue(element, rule), rule);
    }

    function transformValue(value, rule) {
        const text = cleanText(value);
        if (!text) return "";
        const length = Math.max(1, Number(rule.length) || 4);
        if (rule.transform === "prefix") return text.slice(0, length);
        if (rule.transform === "suffix") return text.slice(-length);
        return text;
    }

    function accessibleLabel(rule) {
        const configured = detectLanguage() === "en" ? rule.titleEn : rule.titleFr;
        if (cleanText(configured)) return cleanText(configured).replace(/\{n\}/g, String(rule.length || 4));
        if (rule.transform === "prefix") return i18n("Copier les {n} premiers caractères", "Copy first {n} characters").replace("{n}", String(rule.length || 4));
        if (rule.transform === "suffix") return i18n("Copier les {n} derniers caractères", "Copy last {n} characters").replace("{n}", String(rule.length || 4));
        return i18n("Copier", "Copy");
    }

    function visibleText(rule) {
        const value = detectLanguage() === "en" ? rule.buttonTextEn : rule.buttonTextFr;
        return cleanText(value) || i18n("Copier", "Copy");
    }

    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_) {}
        let ta = null;
        try {
            ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "readonly");
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            return Boolean(document.execCommand("copy"));
        } catch (_) {
            return false;
        } finally {
            if (ta) ta.remove();
        }
    }

    function feedbackText(rule, ok) {
        const lang = detectLanguage();
        if (ok) {
            return cleanText(lang === "en" ? rule.feedbackSuccessTextEn : rule.feedbackSuccessTextFr) ||
                (lang === "en" ? "✓ Copied" : "✓ Copié");
        }
        return cleanText(lang === "en" ? rule.feedbackErrorTextEn : rule.feedbackErrorTextFr) ||
            (lang === "en" ? "Copy failed" : "Échec de copie");
    }

    function showFeedback(anchor, ok, rule) {
        if (!rule || rule.feedbackEnabled === false) return;

        const cluster = anchor && anchor.closest && anchor.closest("." + CLUSTER_CLASS);
        const feedback = document.createElement("span");
        feedback.className = FEEDBACK_CLASS + (ok ? " is-ok" : " is-error");
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-live", "polite");
        feedback.textContent = feedbackText(rule, ok);
        feedback.style.color = cleanText(ok ? rule.feedbackSuccessColor : rule.feedbackErrorColor) ||
            (ok ? "#2e7d32" : "#dc3545");
        feedback.style.fontSize = cleanText(rule.feedbackFontSize) || "0.75em";
        feedback.style.fontWeight = cleanText(rule.feedbackFontWeight) || "600";
        feedback.style.margin = cleanText(rule.feedbackMargin) || "0 0 0 5px";
        if (rule.feedbackFade !== false) {
            const fadeMs = Math.max(300, (Number(rule.feedbackDurationMs) || 1700) - 100);
            feedback.style.animation = "pmkCopyFadeOut " + fadeMs + "ms forwards";
        }

        const placement = ["auto", "after-trigger", "parent-end", "floating"].includes(rule.feedbackPlacement)
            ? rule.feedbackPlacement : "auto";

        // Supprime uniquement le feedback de cette action / zone.
        const scope = anchor && anchor.parentNode ? anchor.parentNode : document;
        try {
            scope.querySelectorAll("." + FEEDBACK_CLASS + '[data-pmk-copy-feedback="' + rule.id + '"]')
                .forEach(function (node) { node.remove(); });
        } catch (_) {}
        feedback.setAttribute("data-pmk-copy-feedback", rule.id || "copy");

        if (placement === "floating") {
            document.querySelectorAll("." + FEEDBACK_CLASS + ".is-standalone").forEach(function (node) { node.remove(); });
            feedback.classList.add("is-standalone");
            document.body.appendChild(feedback);
        } else if (placement === "after-trigger" && anchor && anchor.parentNode) {
            anchor.insertAdjacentElement("afterend", feedback);
        } else if (placement === "parent-end" && anchor && anchor.parentNode) {
            anchor.parentNode.appendChild(feedback);
        } else if (cluster) {
            cluster.querySelectorAll("." + FEEDBACK_CLASS).forEach(function (node) { node.remove(); });
            cluster.appendChild(feedback);
        } else if (anchor && anchor.parentNode) {
            // Comportement historique du 107 pour les déclencheurs existants :
            // badge discret à côté de l'icône dans son conteneur.
            anchor.parentNode.appendChild(feedback);
        } else {
            feedback.classList.add("is-standalone");
            document.body.appendChild(feedback);
        }

        window.setTimeout(function () {
            if (feedback.isConnected) feedback.remove();
        }, Math.max(300, Math.min(10000, Number(rule.feedbackDurationMs) || 1700)));
    }

    function appendVisual(button, rule) {
        if (rule.visualType === "image" && cleanText(rule.imageUrl)) {
            const img = document.createElement("img");
            img.src = String(rule.imageUrl).trim();
            img.alt = "";
            img.setAttribute("aria-hidden", "true");
            button.appendChild(img);
        } else if (rule.visualType === "fa" && cleanText(rule.iconClass)) {
            const icon = document.createElement("i");
            icon.className = cleanText(rule.iconClass);
            icon.setAttribute("aria-hidden", "true");
            button.appendChild(icon);
        }
        if (rule.showText === true) {
            const textNode = document.createElement("span");
            textNode.className = "pmk-copy-button-text";
            textNode.textContent = visibleText(rule);
            button.appendChild(textNode);
        }
    }

    function makeButton(element, rule) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = BUTTON_CLASS;
        button.title = accessibleLabel(rule);
        button.style.setProperty("--pmk-copy-icon-color", cleanText(rule.iconColor) || "#6c757d");
        button.style.setProperty("--pmk-copy-icon-hover-color", cleanText(rule.iconHoverColor) || cleanText(rule.iconColor) || "#212529");
        button.style.setProperty("--pmk-copy-action-size", String(rule.actionSizePx || 16) + "px");
        button.style.setProperty("--pmk-copy-text-size", String(rule.textSizePx || 13) + "px");
        button.style.setProperty("--pmk-copy-text-color", cleanText(rule.textColor) || "#495057");
        button.style.setProperty("--pmk-copy-text-hover-color", cleanText(rule.textHoverColor) || cleanText(rule.textColor) || "#212529");
        button.setAttribute("aria-label", accessibleLabel(rule));
        appendVisual(button, rule);
        if (!button.childNodes.length) button.textContent = "⧉";
        button.addEventListener("click", async function (event) {
            event.preventDefault();
            event.stopPropagation();
            const value = transformValue(readValue(element, rule), rule);
            if (!value) { showFeedback(button, false, rule); return; }
            showFeedback(button, await copyToClipboard(value), rule);
        });
        return button;
    }

    function rememberAttribute(element, name) {
        return {
            present: Boolean(element && element.hasAttribute && element.hasAttribute(name)),
            value: element && element.getAttribute ? element.getAttribute(name) : null
        };
    }

    function restoreAttribute(element, name, snapshot) {
        if (!element || !snapshot) return;
        if (snapshot.present) element.setAttribute(name, snapshot.value == null ? "" : snapshot.value);
        else element.removeAttribute(name);
    }

    function clearExistingBindings() {
        existingBindings.forEach(function (binding) {
            const trigger = binding && binding.trigger;
            if (!trigger) return;
            try { trigger.removeEventListener("click", binding.clickHandler); } catch (_) {}
            try { trigger.removeEventListener("keydown", binding.keyHandler); } catch (_) {}
            try { trigger.style.cursor = binding.cursor || ""; } catch (_) {}
            restoreAttribute(trigger, "role", binding.role);
            restoreAttribute(trigger, "tabindex", binding.tabindex);
            restoreAttribute(trigger, "aria-label", binding.ariaLabel);
            restoreAttribute(trigger, "title", binding.title);
            try { trigger.removeAttribute("data-pmk-copy-existing-trigger"); } catch (_) {}
        });
        existingBindings = [];
    }

    function clearTableLifecycleBindings() {
        tableLifecycleBindings.forEach(function (binding) {
            if (!binding) return;
            if (binding.observer) {
                try { binding.observer.disconnect(); } catch (_) {}
            }
            if (binding.$table && binding.eventNamespace) {
                try { binding.$table.off(binding.eventNamespace); } catch (_) {}
            }
        });
        tableLifecycleBindings = [];
    }

    function clearInjected() {
        clearExistingBindings();
        clearTableLifecycleBindings();
        document.querySelectorAll("." + CLUSTER_CLASS + '[data-pmk-copy-module="' + MODULE_ID + '"]').forEach(function (node) { node.remove(); });
        document.querySelectorAll("." + TABLE_BUTTON_CLASS + '[data-pmk-copy-module="' + MODULE_ID + '"]').forEach(function (node) { node.remove(); });
        document.querySelectorAll("." + FEEDBACK_CLASS + ".is-standalone").forEach(function (node) { node.remove(); });
    }

    function ruleApplies(rule) {
        return rule && rule.enabled !== false && normalizePath(rule.pagePath) === normalizePath(window.location.pathname);
    }

    function tableRuleApplies(rule) {
        return rule && rule.enabled !== false && normalizePath(rule.pagePath) === normalizePath(window.location.pathname);
    }

    function safeQueryWithin(root, selector) {
        if (!root || !selector || !root.querySelectorAll) return [];
        try { return Array.from(root.querySelectorAll(selector)); } catch (_) { return []; }
    }

    function resolveSourceForTrigger(trigger, rule, allSources, index) {
        if (!trigger || !rule) return null;
        if (allSources.length === 1) return allSources[0];

        /*
         * Le 056 historique liait souvent une icône à une valeur voisine.
         * On préfère une recherche locale dans la notice / ligne / carte avant
         * de retomber sur l'index global. Cela corrige notamment l'EAN des
         * résultats où .ean-result n'est plus le nextElementSibling du bouton.
         */
        const localScopes = [".firstresult", "li", "tr", ".result-item", ".kx-notice-card", ".page-section"];
        for (const scopeSelector of localScopes) {
            const scope = trigger.closest && trigger.closest(scopeSelector);
            if (!scope) continue;
            const localSources = safeQueryWithin(scope, rule.selector);
            if (localSources.length === 1) return localSources[0];
        }
        return allSources[index] || null;
    }

    function bindExistingTriggerRule(rule) {
        let triggers = safeQueryAll(rule.triggerSelector);
        /*
         * Si une même classe est posée sur un conteneur et son image enfant
         * (cas rencontré dans des personnalisations historiques), on ne garde
         * que le déclencheur extérieur afin d'éviter une double copie au clic.
         */
        triggers = triggers.filter(function (candidate) {
            return !triggers.some(function (other) {
                return other !== candidate && other.contains && other.contains(candidate);
            });
        });
        const sources = safeQueryAll(rule.selector);
        if (rule.matchMode === "first") triggers = triggers.slice(0, 1);
        if (!triggers.length || !sources.length) return;

        triggers.forEach(function (trigger, index) {
            if (!trigger || trigger.closest("#pmk-config-overlay")) return;
            const source = resolveSourceForTrigger(trigger, rule, sources, index);
            if (!source) return;

            const original = {
                trigger: trigger,
                cursor: trigger.style.cursor || "",
                role: rememberAttribute(trigger, "role"),
                tabindex: rememberAttribute(trigger, "tabindex"),
                ariaLabel: rememberAttribute(trigger, "aria-label"),
                title: rememberAttribute(trigger, "title")
            };

            const execute = async function (event) {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                const value = transformValue(readValue(source, rule), rule);
                if (!value) {
                    showFeedback(trigger, false, rule);
                    return;
                }
                showFeedback(trigger, await copyToClipboard(value), rule);
            };

            const clickHandler = function (event) { execute(event); };
            const keyHandler = function (event) {
                if (event.key !== "Enter" && event.key !== " ") return;
                execute(event);
            };

            trigger.addEventListener("click", clickHandler);
            trigger.addEventListener("keydown", keyHandler);
            trigger.style.cursor = "pointer";
            trigger.setAttribute("data-pmk-copy-existing-trigger", rule.id);
            if (!trigger.matches("button,a[href],input,select,textarea,[role='button']")) {
                trigger.setAttribute("role", "button");
            }
            if (!trigger.hasAttribute("tabindex") && !trigger.matches("button,a[href],input,select,textarea")) {
                trigger.setAttribute("tabindex", "0");
            }
            if (!trigger.hasAttribute("aria-label")) trigger.setAttribute("aria-label", accessibleLabel(rule));
            if (!trigger.hasAttribute("title")) trigger.setAttribute("title", accessibleLabel(rule));

            existingBindings.push(Object.assign(original, {
                clickHandler: clickHandler,
                keyHandler: keyHandler
            }));
        });
    }


    function normalizeHeaderLabel(value) {
        return cleanText(value)
            .toLocaleLowerCase("fr")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function splitConfiguredValues(value) {
        return String(value || "")
            .split(/[;\n|]+/)
            .map(function (part) { return cleanText(part); })
            .filter(Boolean);
    }

    function getDataTableApi(table) {
        const jq = window.jQuery;
        if (!table || !jq || !jq.fn || !jq.fn.dataTable) return null;
        try {
            if (typeof jq.fn.dataTable.isDataTable === "function" && !jq.fn.dataTable.isDataTable(table)) return null;
            return jq(table).DataTable();
        } catch (_) {
            return null;
        }
    }

    function apiNodes(apiRows) {
        if (!apiRows || typeof apiRows.nodes !== "function") return [];
        try {
            const nodes = apiRows.nodes();
            if (nodes && typeof nodes.toArray === "function") return nodes.toArray();
            return Array.from(nodes || []);
        } catch (_) {
            return [];
        }
    }

    function rowIsSelected(row, rule) {
        if (!row) return false;
        const rowSelector = cleanText(rule.selectedRowSelector);
        if (rowSelector) {
            try {
                if (row.matches(rowSelector) || row.querySelector(rowSelector)) return true;
            } catch (_) {}
        }
        const checkboxSelector = cleanText(rule.selectionCheckboxSelector);
        if (checkboxSelector) {
            try {
                if (row.querySelector(checkboxSelector)) return true;
            } catch (_) {}
        }
        return false;
    }

    function tableRowsForRule(table, rule) {
        const api = getDataTableApi(table);
        if (api) {
            try {
                if (rule.scope === "visible") {
                    const rows = apiNodes(api.rows({ page: "current", search: "applied", order: "applied" }));
                    if (rows.length) return rows;
                }
                if (rule.scope === "filtered") {
                    const rows = apiNodes(api.rows({ search: "applied", order: "applied" }));
                    if (rows.length) return rows;
                }
                if (rule.scope === "loaded") {
                    const rows = apiNodes(api.rows({ order: "applied" }));
                    if (rows.length) return rows;
                }
                if (rule.scope === "selected") {
                    const jq = window.jQuery;
                    if (jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.select) {
                        const selected = apiNodes(api.rows({ selected: true, search: "applied", order: "applied" }));
                        if (selected.length) return selected;
                    }
                    const filtered = apiNodes(api.rows({ search: "applied", order: "applied" }));
                    return filtered.filter(function (row) { return rowIsSelected(row, rule); });
                }
            } catch (_) {}
        }

        const rows = Array.from(table.querySelectorAll("tbody tr"))
            .filter(function (row) { return !row.querySelector("td.dataTables_empty"); });

        if (rule.scope === "selected") return rows.filter(function (row) { return rowIsSelected(row, rule); });
        if (rule.scope === "visible" || rule.scope === "filtered") {
            return rows.filter(function (row) {
                try {
                    const style = window.getComputedStyle(row);
                    return style.display !== "none" && style.visibility !== "hidden";
                } catch (_) {
                    return true;
                }
            });
        }
        return rows;
    }

    function columnIndexForRule(table, rule) {
        if (!table) return -1;

        const selector = cleanText(rule.columnHeaderSelector);
        if (selector) {
            try {
                const header = table.querySelector(selector);
                if (header && header.parentElement) {
                    const siblings = Array.from(header.parentElement.children).filter(function (node) {
                        return node.tagName === "TH" || node.tagName === "TD";
                    });
                    const index = siblings.indexOf(header);
                    if (index >= 0) return index;
                }
            } catch (_) {}
        }

        const wanted = splitConfiguredValues(rule.columnHeaderLabels).map(normalizeHeaderLabel);
        if (wanted.length) {
            const headers = Array.from(table.querySelectorAll("thead tr:last-child th, thead tr:last-child td"));
            for (let index = 0; index < headers.length; index += 1) {
                const label = normalizeHeaderLabel(headers[index].textContent || "");
                if (wanted.some(function (candidate) {
                    return label === candidate || label.includes(candidate) || candidate.includes(label);
                })) {
                    return index;
                }
            }
        }

        return Number.isInteger(rule.columnIndexHint) ? rule.columnIndexHint : -1;
    }

    function rawTableElementValue(element, rule) {
        if (!element) return "";
        let raw;
        if (rule.valueSource === "attribute") {
            const attribute = cleanText(rule.attributeName) || "href";
            raw = element.getAttribute(attribute) || "";
        } else if (rule.valueSource === "value") {
            raw = element.value == null ? "" : element.value;
        } else {
            const cloneNode = element.cloneNode(true);
            const extra = cleanText(rule.excludeSelector);
            if (extra) {
                try { cloneNode.querySelectorAll(extra).forEach(function (node) { node.remove(); }); } catch (_) {}
            }
            raw = cloneNode.textContent || "";
        }

        if (cleanText(rule.urlParam)) {
            try {
                const parsed = new URL(String(raw || ""), window.location.origin);
                raw = parsed.searchParams.get(cleanText(rule.urlParam)) || "";
            } catch (_) {
                const match = String(raw || "").match(new RegExp("[?&]" + cleanText(rule.urlParam).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^&#]+)"));
                raw = match ? decodeURIComponent(match[1]) : "";
            }
        }

        return transformValue(extractValue(raw, rule), rule);
    }

    function selectorNodesForRow(table, row, selector) {
        if (!selector || !table || !row) return [];
        let local = [];
        try { local = Array.from(row.querySelectorAll(selector)); } catch (_) {}
        if (local.length) return local;
        return safeQueryAll(selector).filter(function (node) {
            return table.contains(node) && node.closest && node.closest("tr") === row;
        });
    }

    function tableValuesForRule(table, rule) {
        const rows = tableRowsForRule(table, rule);
        const values = [];

        if (rule.sourceMode === "column") {
            const columnIndex = columnIndexForRule(table, rule);
            if (columnIndex < 0) return [];
            rows.forEach(function (row) {
                const cells = Array.from(row.children).filter(function (node) {
                    return node.tagName === "TD" || node.tagName === "TH";
                });
                const cell = cells[columnIndex];
                if (!cell || cell.classList.contains("dataTables_empty")) return;
                let sources = [cell];
                if (cleanText(rule.sourceSelector)) {
                    const nested = selectorNodesForRow(table, row, rule.sourceSelector).filter(function (node) {
                        return cell.contains(node);
                    });
                    if (nested.length) sources = nested;
                }
                sources.forEach(function (source) {
                    const value = rawTableElementValue(source, rule);
                    if (value) values.push(value);
                });
            });
        } else {
            rows.forEach(function (row) {
                selectorNodesForRow(table, row, rule.sourceSelector).forEach(function (source) {
                    const value = rawTableElementValue(source, rule);
                    if (value) values.push(value);
                });
            });
        }

        let output = values.filter(function (value) { return cleanText(value) !== ""; });
        if (rule.deduplicate !== false) output = Array.from(new Set(output));

        if (rule.resultOrder === "alpha-asc") output.sort(function (a, b) { return String(a).localeCompare(String(b), detectLanguage(), { numeric: true }); });
        else if (rule.resultOrder === "alpha-desc") output.sort(function (a, b) { return String(b).localeCompare(String(a), detectLanguage(), { numeric: true }); });
        else if (rule.resultOrder === "numeric-asc") output.sort(function (a, b) { return Number(a) - Number(b); });
        else if (rule.resultOrder === "numeric-desc") output.sort(function (a, b) { return Number(b) - Number(a); });

        return output;
    }

    function tableSeparator(rule) {
        if (rule.separator === "comma") return ",";
        if (rule.separator === "semicolon") return ";";
        if (rule.separator === "tab") return "\t";
        if (rule.separator === "space") return " ";
        if (rule.separator === "custom") return String(rule.customSeparator == null ? "" : rule.customSeparator);
        return "\n";
    }

    function tableButtonText(rule) {
        const value = detectLanguage() === "en" ? rule.buttonTextEn : rule.buttonTextFr;
        return cleanText(value) || i18n("Copier", "Copy");
    }

    function tableTitle(rule) {
        const value = detectLanguage() === "en" ? rule.titleEn : rule.titleFr;
        return cleanText(value) || i18n("Copier les valeurs affichées", "Copy displayed values");
    }

    function tableFeedbackMessage(rule, status, count) {
        const lang = detectLanguage();
        let value = "";
        if (status === "success") value = lang === "en" ? rule.feedbackSuccessTextEn : rule.feedbackSuccessTextFr;
        else if (status === "empty") value = lang === "en" ? rule.feedbackEmptyTextEn : rule.feedbackEmptyTextFr;
        else value = lang === "en" ? rule.feedbackErrorTextEn : rule.feedbackErrorTextFr;

        if (!cleanText(value)) {
            if (status === "success") value = lang === "en" ? "{count} value(s) copied!" : "{count} valeur(s) copiée(s) !";
            else if (status === "empty") value = lang === "en" ? "No value found" : "Aucune valeur trouvée";
            else value = lang === "en" ? "Copy failed" : "Erreur lors de la copie";
        }
        return String(value).replace(/\{count\}/g, String(count || 0));
    }

    function showTableFeedback(anchor, status, rule, count) {
        if (rule.feedbackEnabled === false) return;
        const parent = anchor && anchor.parentElement ? anchor.parentElement : document.body;
        try {
            parent.querySelectorAll("." + FEEDBACK_CLASS + '[data-pmk-copy-feedback="' + rule.id + '"]')
                .forEach(function (node) { node.remove(); });
        } catch (_) {}

        const feedback = document.createElement("span");
        feedback.className = FEEDBACK_CLASS + (status === "success" ? " is-ok" : " is-error");
        feedback.dataset.pmkCopyFeedback = rule.id;
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-live", "polite");
        feedback.textContent = tableFeedbackMessage(rule, status, count);
        if (status === "empty") feedback.style.color = "var(--bs-warning-text-emphasis,#856404)";
        feedback.style.marginLeft = ".4rem";
        parent.appendChild(feedback);
        window.setTimeout(function () {
            if (feedback.isConnected) feedback.remove();
        }, rule.feedbackDurationMs || 2000);
    }

    function tableButtonContainer(table, rule) {
        const configured = cleanText(rule.buttonContainerSelector);
        if (configured) {
            try {
                const found = document.querySelector(configured);
                if (found) return found;
            } catch (_) {}
        }

        let wrapper = null;
        if (table.id) wrapper = document.getElementById(table.id + "_wrapper");
        if (!wrapper && table.closest) wrapper = table.closest(".dataTables_wrapper");
        if (wrapper) {
            const toolbar = wrapper.querySelector(".dt-buttons");
            if (toolbar) return toolbar;
        }

        let fallback = table.previousElementSibling;
        if (!fallback || !fallback.classList || !fallback.classList.contains("pmk-copy-table-fallback-toolbar")) {
            fallback = document.createElement("div");
            fallback.className = "pmk-copy-table-fallback-toolbar";
            table.insertAdjacentElement("beforebegin", fallback);
        }
        return fallback;
    }

    function tableButtonSelector(rule) {
        return "." + TABLE_BUTTON_CLASS + '[data-pmk-copy-table-rule="' +
            String(rule.id || "").replace(/"/g, '\\"') + '"]';
    }

    function makeTableButton(table, rule) {
        const button = document.createElement("button");
        button.type = "button";
        if (cleanText(rule.legacyButtonId)) button.id = cleanText(rule.legacyButtonId);
        button.className = (rule.buttonStyle === "koha" ? "btn btn-default btn-sm " : "dt-button copyConditions_controls ") +
            TABLE_BUTTON_CLASS + (cleanText(rule.buttonExtraClass) ? " " + cleanText(rule.buttonExtraClass) : "");
        button.dataset.pmkCopyModule = MODULE_ID;
        button.dataset.pmkCopyTableRule = rule.id;
        button.title = tableTitle(rule);
        button.setAttribute("aria-label", tableTitle(rule));
        if (cleanText(rule.textColor)) button.style.color = cleanText(rule.textColor);
        button.style.fontSize = String(rule.fontSizePx || 13) + "px";

        const iconClass = cleanText(rule.iconClass);
        if (iconClass) {
            const icon = document.createElement("i");
            icon.className = iconClass;
            icon.setAttribute("aria-hidden", "true");
            if (cleanText(rule.iconColor)) icon.style.color = cleanText(rule.iconColor);
            button.appendChild(icon);
        }
        if (rule.showText !== false) {
            const text = document.createElement("span");
            text.className = "dt-button-text";
            text.textContent = tableButtonText(rule);
            button.appendChild(text);
        }

        button.addEventListener("click", async function (event) {
            event.preventDefault();
            event.stopPropagation();
            const values = tableValuesForRule(table, rule);
            if (!values.length) {
                showTableFeedback(button, "empty", rule, 0);
                return;
            }
            const ok = await copyToClipboard(values.join(tableSeparator(rule)));
            showTableFeedback(button, ok ? "success" : "error", rule, values.length);
        });
        return button;
    }

    function ensureTableButton(rule, table) {
        if (!table || !table.isConnected) return;
        const container = tableButtonContainer(table, rule);
        if (!container) return;

        const selector = tableButtonSelector(rule);
        let button = document.querySelector(selector);

        if (!button && cleanText(rule.legacyButtonId)) {
            const legacy = document.getElementById(cleanText(rule.legacyButtonId));
            if (legacy && !legacy.classList.contains(TABLE_BUTTON_CLASS)) {
                /*
                 * Compatibilité de bascule : si le 115 s'est exécuté avant le 006,
                 * on remplace son bouton par un clone PMK afin de retirer ses
                 * handlers historiques sans conserver deux actions concurrentes.
                 */
                try { legacy.remove(); } catch (_) {}
            }
        }

        if (!button) button = makeTableButton(table, rule);
        if (button.parentElement !== container) {
            if (rule.buttonPosition === "prepend") container.insertBefore(button, container.firstChild);
            else container.appendChild(button);
        } else if (rule.buttonPosition === "prepend" && container.firstChild !== button) {
            container.insertBefore(button, container.firstChild);
        }
    }

    function bindTableLifecycle(rule, table) {
        if (!table) return;
        const binding = { observer: null, $table: null, eventNamespace: "" };

        const jq = window.jQuery;
        if (jq && jq.fn && jq.fn.dataTable) {
            try {
                const namespace = ".pmkCopyActions" + String(rule.id || "").replace(/[^A-Za-z0-9]/g, "");
                const $table = jq(table);
                const events = "draw.dt" + namespace + " column-visibility.dt" + namespace + " responsive-resize.dt" + namespace;
                $table.on(events, function () {
                    window.setTimeout(function () { ensureTableButton(rule, table); }, 0);
                });
                binding.$table = $table;
                binding.eventNamespace = namespace;
            } catch (_) {}
        }

        const root = (table.closest && table.closest(".dataTables_wrapper")) || table.parentElement;
        if (root && typeof MutationObserver === "function") {
            const localObserver = new MutationObserver(function (mutations) {
                const relevant = mutations.some(function (mutation) {
                    return Array.from(mutation.addedNodes || []).some(function (node) {
                        return node && node.nodeType === 1 &&
                            !(node.matches && node.matches("." + TABLE_BUTTON_CLASS + ", ." + FEEDBACK_CLASS));
                    });
                });
                if (relevant) window.setTimeout(function () { ensureTableButton(rule, table); }, 0);
            });
            localObserver.observe(root, { childList: true, subtree: true });
            binding.observer = localObserver;
        }

        tableLifecycleBindings.push(binding);
    }

    function renderTableRule(rule) {
        let table = null;
        try { table = document.querySelector(rule.tableSelector); } catch (_) {}
        if (!table) {
            const root = document.querySelector("#main, main, #content, .main");
            if (root && typeof MutationObserver === "function") {
                const discovery = new MutationObserver(function () {
                    let found = null;
                    try { found = document.querySelector(rule.tableSelector); } catch (_) {}
                    if (!found) return;
                    discovery.disconnect();
                    ensureTableButton(rule, found);
                    bindTableLifecycle(rule, found);
                });
                discovery.observe(root, { childList: true, subtree: true });
                tableLifecycleBindings.push({ observer: discovery, $table: null, eventNamespace: "" });
            }
            return;
        }

        ensureTableButton(rule, table);
        bindTableLifecycle(rule, table);
    }

    function renderRule(rule) {
        if (rule.actionMode === "existing-trigger") {
            bindExistingTriggerRule(rule);
            return;
        }

        let elements = safeQueryAll(rule.selector);
        if (rule.matchMode === "first") elements = elements.slice(0, 1);
        elements.forEach(function (element, index) {
            if (!element || element.closest("#pmk-config-overlay")) return;
            const cluster = document.createElement("span");
            cluster.className = CLUSTER_CLASS;
            cluster.dataset.pmkCopyModule = MODULE_ID;
            cluster.dataset.pmkCopyRule = rule.id;
            cluster.dataset.pmkCopyIndex = String(index);
            cluster.appendChild(makeButton(element, rule));
            if (rule.placement === "before") element.insertAdjacentElement("beforebegin", cluster);
            else if (rule.placement === "inside-start") element.insertBefore(cluster, element.firstChild);
            else if (rule.placement === "inside-end") element.appendChild(cluster);
            else element.insertAdjacentElement("afterend", cluster);
        });
    }

    function applyAll(config) {
        clearInjected();
        currentConfig = normalizeConfig(config);
        if (currentConfig.enabled === false) return;
        injectStyles();
        currentConfig.rules.filter(ruleApplies).forEach(renderRule);
        currentConfig.tableRules.filter(tableRuleApplies).forEach(renderTableRule);
    }

    function stopObserver() {
        observers.forEach(function (activeObserver) {
            try { activeObserver.disconnect(); } catch (_) {}
        });
        observers = [];
        if (observerTimer) window.clearTimeout(observerTimer);
        observerTimer = 0;
    }

    function observerRootForRule(rule) {
        const selector = rule && rule.actionMode === "existing-trigger" && rule.triggerSelector
            ? rule.triggerSelector
            : (rule && rule.selector);
        const first = selector ? safeQueryAll(selector)[0] : null;
        if (first && first.closest) {
            return first.closest("table, .page-section, main, #main, #content") ||
                document.querySelector("#main, main, #content");
        }
        return document.querySelector("#main, main, #content");
    }

    function startObserver(config) {
        stopObserver();
        if (!config || config.enabled === false || config.observeDom === false || typeof MutationObserver !== "function") return;

        /*
         * Contrairement au legacy 115, aucun observer global sur document.body.
         * Chaque règle individuelle observe uniquement un conteneur Koha local.
         * Les règles de tableau possèdent leur propre cycle DataTables/local.
         */
        const roots = new Set();
        (config.rules || []).filter(ruleApplies).forEach(function (rule) {
            const root = observerRootForRule(rule);
            if (root) roots.add(root);
        });

        roots.forEach(function (root) {
            const localObserver = new MutationObserver(function (mutations) {
                const relevant = mutations.some(function (mutation) {
                    return Array.from(mutation.addedNodes || []).some(function (node) {
                        if (!node || node.nodeType !== 1) return false;
                        if (node.matches && node.matches("." + CLUSTER_CLASS + ", ." + TABLE_BUTTON_CLASS + ", ." + FEEDBACK_CLASS)) return false;
                        if (node.closest && node.closest("." + CLUSTER_CLASS)) return false;
                        return true;
                    });
                });
                if (!relevant) return;
                window.clearTimeout(observerTimer);
                observerTimer = window.setTimeout(function () {
                    applyAll(currentConfig);
                    startObserver(currentConfig);
                }, currentConfig.observeDelay || 120);
            });
            localObserver.observe(root, { childList: true, subtree: true });
            observers.push(localObserver);
        });
    }

    function selectorCount(selector) {
        return safeQueryAll(selector).length;
    }

    function elementExample(element) {
        if (!element) return "";
        if ((element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") && element.value != null) {
            return String(element.value).trim().slice(0, 160);
        }
        return cleanText(element.textContent).slice(0, 160);
    }

    function fallbackPicker() {
        return new Promise(function (resolve, reject) {
            let hovered = null;
            const style = document.createElement("style");
            style.textContent = ".pmk006-pick{outline:3px solid #408540!important;outline-offset:2px!important;cursor:crosshair!important}";
            document.head.appendChild(style);
            function stableSelector(el) {
                if (el.id) return "#" + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1"));
                const parts = [];
                let node = el;
                while (node && node !== document.body && parts.length < 5) {
                    let part = node.tagName.toLowerCase();
                    const classes = Array.from(node.classList || []).filter(function (c) { return !/^pmk/.test(c); });
                    if (classes.length) part += "." + classes[0];
                    else if (node.parentElement) {
                        const peers = Array.from(node.parentElement.children).filter(function (x) { return x.tagName === node.tagName; });
                        if (peers.length > 1) part += ":nth-of-type(" + (peers.indexOf(node) + 1) + ")";
                    }
                    parts.unshift(part);
                    node = node.parentElement;
                }
                return parts.join(" > ");
            }
            function cleanup() {
                if (hovered) hovered.classList.remove("pmk006-pick");
                document.removeEventListener("mouseover", over, true);
                document.removeEventListener("mouseout", out, true);
                document.removeEventListener("click", click, true);
                document.removeEventListener("keydown", key, true);
                style.remove();
            }
            function over(e) { if (hovered) hovered.classList.remove("pmk006-pick"); hovered = e.target; if (hovered && hovered.classList) hovered.classList.add("pmk006-pick"); }
            function out(e) { if (e.target && e.target.classList) e.target.classList.remove("pmk006-pick"); }
            function click(e) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                const selector = stableSelector(e.target);
                const result = { value: selector, selector: selector, targetName: elementExample(e.target) || e.target.tagName.toLowerCase(), exampleValue: elementExample(e.target), matchCount: selectorCount(selector), pagePath: window.location.pathname };
                cleanup(); resolve(result);
            }
            function key(e) { if (e.key !== "Escape") return; e.preventDefault(); cleanup(); reject(new Error("picker_cancelled")); }
            document.addEventListener("mouseover", over, true);
            document.addEventListener("mouseout", out, true);
            document.addEventListener("click", click, true);
            document.addEventListener("keydown", key, true);
        });
    }

    function getTableRuleIndex(fieldPath) {
        const index = Array.isArray(fieldPath) && fieldPath[0] === "tableRules" ? Number(fieldPath[1]) : NaN;
        return Number.isInteger(index) ? index : null;
    }

    function stableSelectorForElement(element) {
        if (!element || element.nodeType !== 1) return "";
        if (element.id) {
            const escaped = window.CSS && CSS.escape
                ? CSS.escape(element.id)
                : element.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
            return "#" + escaped;
        }

        const tag = element.tagName.toLowerCase();
        const classes = Array.from(element.classList || []).filter(function (name) {
            return name && !/^pmk/.test(name) && !/^sorting/.test(name) && !/^dt-/.test(name);
        });
        for (const className of classes) {
            const escapedClass = window.CSS && CSS.escape
                ? CSS.escape(className)
                : className.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
            const candidate = tag + "." + escapedClass;
            try {
                if (document.querySelectorAll(candidate).length === 1) return candidate;
            } catch (_) {}
        }

        if (element.parentElement) {
            const peers = Array.from(element.parentElement.children).filter(function (node) {
                return node.tagName === element.tagName;
            });
            const parentSelector = stableSelectorForElement(element.parentElement);
            if (parentSelector) {
                return parentSelector + " > " + tag +
                    (peers.length > 1 ? ":nth-of-type(" + (peers.indexOf(element) + 1) + ")" : "");
            }
        }
        return tag;
    }

    function pickedTableMetadata(candidate, result) {
        if (!candidate || !candidate.closest) return result;
        const table = candidate.closest("table");
        if (!table) return result;

        result.tableSelector = table.id
            ? "#" + (window.CSS && CSS.escape ? CSS.escape(table.id) : table.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1"))
            : (candidate === table ? result.selector : "");
        result.tableName = cleanText(table.getAttribute("aria-label") || table.getAttribute("summary") || table.id || "Tableau Koha");

        const row = candidate.closest("tr");
        if (row) {
            let relative = "";
            const tag = candidate.tagName ? candidate.tagName.toLowerCase() : "";
            const stableClass = Array.from(candidate.classList || []).find(function (name) {
                return name && !/^pmk/.test(name) && !/^sorting/.test(name) && !/^dt-/.test(name);
            });
            if (stableClass && tag) {
                relative = tag + "." + stableClass;
            } else if (tag === "a") {
                const href = candidate.getAttribute("href") || "";
                const paramMatch = href.match(/[?&]([A-Za-z0-9_]+)=/);
                if (paramMatch) relative = 'a[href*="' + paramMatch[1] + '="]';
                else relative = "a[href]";
            } else if (tag) {
                relative = tag;
            }
            result.rowRelativeSelector = relative;
        }

        const cell = candidate.closest("td,th");
        if (cell && cell.parentElement) {
            const cells = Array.from(cell.parentElement.children).filter(function (node) {
                return node.tagName === "TD" || node.tagName === "TH";
            });
            const index = cells.indexOf(cell);
            if (index >= 0) {
                result.columnIndexHint = index;
                const headers = Array.from(table.querySelectorAll("thead tr:last-child th, thead tr:last-child td"));
                if (headers[index]) {
                    result.columnHeaderText = cleanText(headers[index].textContent || "");
                    if (headers[index].id) result.columnHeaderSelector = "#" + headers[index].id;
                    else {
                        const stableClass = Array.from(headers[index].classList || []).find(function (name) {
                            return name && !/^sorting/.test(name) && !/^dt-/.test(name);
                        });
                        if (stableClass) result.columnHeaderSelector = "thead th." + stableClass;
                    }
                }
            }
        }
        return result;
    }

    function applyTablePickerResult(rootObject, fieldPath, result) {
        const index = getTableRuleIndex(fieldPath);
        if (index === null || !rootObject || !Array.isArray(rootObject.tableRules) || !rootObject.tableRules[index] || !result) return;
        const rule = rootObject.tableRules[index];
        const fieldName = pickerFieldName(fieldPath);
        rule.pagePath = result.pagePath || rule.pagePath || window.location.pathname;

        if (fieldName === "tableSelector") {
            rule.tableSelector = result.tableSelector || result.selector || rule.tableSelector;
            rule.tableName = result.tableName || result.targetName || rule.tableName || "Tableau Koha";
            rule.tableMatchCount = Number.isInteger(result.matchCount) ? result.matchCount : selectorCount(rule.tableSelector);
            return;
        }

        if (fieldName === "buttonContainerSelector") {
            rule.buttonContainerName = result.targetName || rule.buttonContainerName || "Conteneur du bouton";
            return;
        }

        rule.sourceName = result.targetName || rule.sourceName || "Valeur du tableau";
        rule.exampleValue = result.exampleValue || rule.exampleValue || "";
        if (rule.sourceMode === "selector" && cleanText(result.rowRelativeSelector)) {
            rule.sourceSelector = result.rowRelativeSelector;
        }
        rule.sourceMatchCount = Number.isInteger(result.matchCount) ? result.matchCount : selectorCount(result.selector || rule.sourceSelector);
        if (result.tableSelector) {
            rule.tableSelector = result.tableSelector;
            rule.tableName = result.tableName || rule.tableName;
        }
        if (Number.isInteger(result.columnIndexHint)) rule.columnIndexHint = result.columnIndexHint;
        if (result.columnHeaderSelector) rule.columnHeaderSelector = result.columnHeaderSelector;
        if (result.columnHeaderText && !cleanText(rule.columnHeaderLabels)) rule.columnHeaderLabels = result.columnHeaderText;
    }

    function pickForTableRule(context) {
        const ctx = context || {};
        const index = getTableRuleIndex(ctx.fieldPath);
        const rule = index !== null && ctx.rootObject && Array.isArray(ctx.rootObject.tableRules)
            ? ctx.rootObject.tableRules[index]
            : null;
        const targetUrl = rule && rule.pagePath ? rule.pagePath : window.location.pathname;
        const fieldName = pickerFieldName(ctx.fieldPath);
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (picker && typeof picker.pickForConfig === "function") {
            let banner = i18n("Clique sur une valeur du tableau — Échap annule", "Click a table value — Esc cancels");
            if (fieldName === "tableSelector") banner = i18n("Clique dans le tableau à utiliser — Échap annule", "Click inside the table to use — Esc cancels");
            if (fieldName === "buttonContainerSelector") banner = i18n("Clique sur le conteneur où placer l’action — Échap annule", "Click the container where the action should be placed — Esc cancels");
            return picker.pickForConfig({
                moduleId: MODULE_ID,
                targetUrl: targetUrl,
                fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath.slice() : [],
                rootObject: ctx.rootObject || {},
                adminContext: { sectionId: "tableRules", pagePath: targetUrl },
                options: { bannerText: banner }
            });
        }
        return fallbackPicker();
    }

    function getRuleIndex(fieldPath) {
        const index = Array.isArray(fieldPath) && fieldPath[0] === "rules" ? Number(fieldPath[1]) : NaN;
        return Number.isInteger(index) ? index : null;
    }

    function pickerFieldName(fieldPath) {
        if (!Array.isArray(fieldPath) || !fieldPath.length) return "";
        return String(fieldPath[fieldPath.length - 1] || "");
    }

    function applyPickerResult(rootObject, fieldPath, result) {
        const index = getRuleIndex(fieldPath);
        if (index === null || !rootObject || !Array.isArray(rootObject.rules) || !rootObject.rules[index] || !result) return;
        const rule = rootObject.rules[index];
        const fieldName = pickerFieldName(fieldPath);
        rule.pagePath = result.pagePath || rule.pagePath || window.location.pathname;

        if (fieldName === "triggerSelector") {
            rule.triggerName = result.targetName || rule.triggerName || "Déclencheur de copie";
            rule.triggerMatchCount = Number.isInteger(result.matchCount)
                ? result.matchCount
                : selectorCount(result.selector || rule.triggerSelector);
            return;
        }

        rule.targetName = result.targetName || rule.targetName || "Élément Koha";
        rule.exampleValue = result.exampleValue || rule.exampleValue || "";
        rule.matchCount = Number.isInteger(result.matchCount) ? result.matchCount : selectorCount(result.selector || rule.selector);
    }

    function pickForRule(context) {
        const ctx = context || {};
        const index = getRuleIndex(ctx.fieldPath);
        const rule = index !== null && ctx.rootObject && Array.isArray(ctx.rootObject.rules) ? ctx.rootObject.rules[index] : null;
        const targetUrl = rule && rule.pagePath ? rule.pagePath : window.location.pathname;
        const fieldName = pickerFieldName(ctx.fieldPath);
        const isTriggerPick = fieldName === "triggerSelector";
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (picker && typeof picker.pickForConfig === "function") {
            return picker.pickForConfig({
                moduleId: MODULE_ID,
                targetUrl: targetUrl,
                fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath.slice() : [],
                rootObject: ctx.rootObject || {},
                adminContext: { sectionId: "rules", pagePath: targetUrl },
                options: {
                    bannerText: isTriggerPick
                        ? i18n("Clique sur l’élément qui déclenchera la copie — Échap annule", "Click the element that will trigger copying — Esc cancels")
                        : i18n("Clique sur l’élément dont la valeur doit être copiée — Échap annule", "Click the element whose value must be copied — Esc cancels")
                }
            });
        }
        return fallbackPicker();
    }

    function registerPickerAdapter() {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.register !== "function") return;
        picker.register(MODULE_ID, {
            buildResult: function (candidate, result) {
                result.exampleValue = elementExample(candidate);
                result.matchCount = selectorCount(result.selector);
                return pickedTableMetadata(candidate, result);
            },
            applyPending: function (draft, pending, picked) {
                const fieldPath = pending && pending.fieldPath;
                if (!picked || !draft) return draft;

                const tableIndex = getTableRuleIndex(fieldPath);
                if (tableIndex !== null && Array.isArray(draft.tableRules) && draft.tableRules[tableIndex]) {
                    applyTablePickerResult(draft, fieldPath, picked);
                    return draft;
                }

                const index = getRuleIndex(fieldPath);
                if (index === null || !Array.isArray(draft.rules) || !draft.rules[index]) return draft;
                const rule = draft.rules[index];
                const fieldName = pickerFieldName(fieldPath);
                rule.pagePath = picked.pagePath || rule.pagePath || window.location.pathname;

                if (fieldName === "triggerSelector") {
                    rule.triggerName = picked.targetName || rule.triggerName || "Déclencheur de copie";
                    rule.triggerMatchCount = Number.isInteger(picked.matchCount) ? picked.matchCount : null;
                    return draft;
                }

                rule.targetName = picked.targetName || rule.targetName || "Élément Koha";
                rule.exampleValue = picked.exampleValue || rule.exampleValue || "";
                rule.matchCount = Number.isInteger(picked.matchCount) ? picked.matchCount : null;
                return draft;
            }
        });
    }

    function newRule() {
        return mergeRule({
            id: makeId(),
            label: i18n("Nouvelle action de copie", "New copy action"),
            pagePath: window.location.pathname,
            actionMode: "generated",
            selector: "",
            targetName: "",
            triggerSelector: "",
            triggerName: "",
            iconColor: "#6c757d",
            iconHoverColor: "#212529",
            actionSizePx: 16,
            showText: false,
            textSizePx: 13,
            textColor: "#495057",
            textHoverColor: "#212529",
            titleFr: "Copier",
            titleEn: "Copy"
        }, 0);
    }

    function newTableRule() {
        return mergeTableRule({
            id: makeId().replace(/^copy-/, "copy-table-"),
            label: i18n("Nouvelle copie groupée", "New grouped copy action"),
            pagePath: window.location.pathname,
            tableSelector: "",
            tableName: "",
            sourceMode: "column",
            sourceSelector: "",
            sourceName: "",
            columnHeaderSelector: "",
            columnHeaderLabels: "",
            scope: "visible",
            deduplicate: true,
            separator: "newline",
            resultOrder: "display",
            buttonStyle: "datatable",
            buttonTextFr: "Copier",
            buttonTextEn: "Copy",
            titleFr: "Copier les valeurs affichées",
            titleEn: "Copy displayed values"
        }, 0);
    }

    function validate(config) {
        const cfg = normalizeConfig(config);
        const ids = new Set();
        for (const rule of cfg.rules) {
            if (!rule.id || ids.has(rule.id)) return { ok: false, message: i18n("Chaque action doit avoir un identifiant unique.", "Each action must have a unique identifier.") };
            ids.add(rule.id);
            if (!String(rule.pagePath || "").trim()) return { ok: false, message: i18n("Chaque action doit indiquer une page Koha.", "Each action must specify a Koha page.") };
            if (!String(rule.selector || "").trim()) return { ok: false, message: i18n("Chaque action doit cibler l’élément dont la valeur sera copiée.", "Each action must target the element whose value will be copied.") };
            if (rule.actionMode === "existing-trigger" && !String(rule.triggerSelector || "").trim()) {
                return { ok: false, message: i18n("Cette action doit indiquer l’élément existant qui déclenchera la copie.", "This action must specify the existing element that will trigger copying.") };
            }
            if (rule.valueSource === "attribute" && !String(rule.attributeName || "").trim()) return { ok: false, message: i18n("Le nom de l’attribut à copier est vide.", "The attribute name to copy is empty.") };
            if (rule.transform !== "full" && (!Number.isFinite(Number(rule.length)) || Number(rule.length) < 1)) return { ok: false, message: i18n("Le nombre de caractères doit être supérieur à zéro.", "The character count must be greater than zero.") };
            if (rule.actionMode === "generated" && rule.visualType === "fa" && !cleanText(rule.iconClass)) return { ok: false, message: i18n("Indique une classe Font Awesome ou choisis « aucune icône ».", "Provide a Font Awesome class or choose no icon.") };
            if (rule.actionMode === "generated" && rule.visualType === "image" && !cleanText(rule.imageUrl)) return { ok: false, message: i18n("Indique l’URL de l’image de l’action.", "Provide the action image URL.") };
        }

        for (const rule of cfg.tableRules) {
            if (!rule.id || ids.has(rule.id)) return { ok: false, message: i18n("Chaque action doit avoir un identifiant unique.", "Each action must have a unique identifier.") };
            ids.add(rule.id);
            if (!cleanText(rule.pagePath)) return { ok: false, message: i18n("Chaque copie groupée doit indiquer une page Koha.", "Each grouped copy action must specify a Koha page.") };
            if (!cleanText(rule.tableSelector)) return { ok: false, message: i18n("Chaque copie groupée doit cibler un tableau.", "Each grouped copy action must target a table.") };
            if (rule.sourceMode === "selector" && !cleanText(rule.sourceSelector)) {
                return { ok: false, message: i18n("La copie groupée par sélecteur doit indiquer l’élément à extraire.", "Grouped selector copy must specify the element to extract.") };
            }
            if (rule.sourceMode === "column" && !cleanText(rule.columnHeaderSelector) && !cleanText(rule.columnHeaderLabels) && !Number.isInteger(rule.columnIndexHint)) {
                return { ok: false, message: i18n("La copie groupée par colonne doit identifier la colonne (sélecteur, libellé ou index).", "Grouped column copy must identify the column (selector, label or index).") };
            }
            if (rule.valueSource === "attribute" && !cleanText(rule.attributeName)) {
                return { ok: false, message: i18n("Le nom de l’attribut à copier est vide.", "The attribute name to copy is empty.") };
            }
            if (rule.separator === "custom" && rule.customSeparator === undefined) {
                return { ok: false, message: i18n("Le séparateur personnalisé est invalide.", "The custom separator is invalid.") };
            }
        }
        return { ok: true };
    }

    function ruleFromVisualPath(rootObject, fieldPath) {
        const index = getRuleIndex(fieldPath || []);
        return rootObject && Array.isArray(rootObject.rules) && index !== null
            ? rootObject.rules[index]
            : null;
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: {
                inlinePreview: true,
                styleEyedropper: true,
                livePreview: true
            },
            previewModel: function (context) {
                const rule = ruleFromVisualPath(context && context.rootObject, context && context.fieldPath) || RULE_BASE;
                return {
                    text: rule.showText === true
                        ? visibleText(rule)
                        : i18n("Action de copie", "Copy action"),
                    style: {
                        fontSize: (Number(rule.textSizePx) || 13) + "px",
                        color: cleanText(rule.textColor) || "#495057"
                    },
                    icon: rule.visualType === "none" ? null : {
                        type: rule.visualType,
                        className: rule.visualType === "fa" ? rule.iconClass : "",
                        url: rule.visualType === "image" ? rule.imageUrl : "",
                        size: Number(rule.actionSizePx) || 16,
                        color: cleanText(rule.iconColor) || "#6c757d",
                        position: "before"
                    },
                    title: accessibleLabel(rule)
                };
            },
            styleTargetUrl: function (context) {
                const rule = ruleFromVisualPath(context && context.rootObject, context && context.fieldPath);
                return rule && rule.pagePath ? rule.pagePath : window.location.pathname;
            },
            applyStyleSample: function (context) {
                const rule = ruleFromVisualPath(context && context.rootObject, context && context.fieldPath);
                const sample = context && context.sample;
                if (!rule || !sample) return { rootObject: context && context.rootObject };
                const visual = window.PMKConfig && window.PMKConfig.visualEditor;
                const size = visual && typeof visual.pxNumber === "function"
                    ? visual.pxNumber(sample.fontSize, null)
                    : parseFloat(sample.fontSize);
                const color = visual && typeof visual.colorToHex === "function"
                    ? visual.colorToHex(sample.color)
                    : "";
                if (Number.isFinite(size)) {
                    rule.actionSizePx = Math.max(8, Math.min(64, Math.round(size)));
                    rule.textSizePx = Math.max(8, Math.min(40, Math.round(size)));
                }
                if (color) {
                    rule.iconColor = color;
                    rule.textColor = color;
                }
                return { rootObject: context && context.rootObject };
            },
            previewDraft: function (draft) {
                const before = clone(currentConfig || DEFAULT_CONFIG);
                applyAll(draft);
                return function () {
                    applyAll(before);
                };
            }
        });
        return true;
    }

    function moduleDefinition() {
        const valueSourceOptions = [
            { value: "text", label: { fr: "Texte affiché dans l’élément", en: "Displayed element text" } },
            { value: "value", label: { fr: "Valeur d’un champ de formulaire", en: "Form field value" } },
            { value: "attribute", label: { fr: "Attribut HTML", en: "HTML attribute" } }
        ];
        return {
            id: MODULE_ID,
            schemaVersion: 6,
            name: { fr: "Actions de copie", en: "Copy actions" },
            description: {
                fr: "Centralise les copies individuelles et groupées dans Koha. Les usages historiques du 056 (ISBN, EAN, titre), du 115 (copies groupées en tableaux) et du 133 (copie du code-barres exemplaire sur detail.pl) sont intégrés ici.",
                en: "Centralizes individual and grouped copying in Koha. Historical 056 behavior (ISBN, EAN, title), 115 table behavior and 133 item-barcode copying on detail.pl are integrated here."
            },
            category: { fr: "Interface / outils", en: "Interface / tools" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Actions de copie", en: "Copy actions" },
                    description: {
                        fr: "Ajoute autant d’actions que nécessaire. Une action peut créer un nouveau contrôle ou réutiliser un pictogramme/lien déjà présent. La source et le déclencheur sont choisis avec le picker commun PMK.",
                        en: "Add as many actions as needed. An action can create a new control or reuse an existing icon/link. Source and trigger are selected with the shared PMK picker."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Actions configurées", en: "Configured actions" },
                            addLabel: { fr: "Ajouter une action de copie", en: "Add a copy action" },
                            reorder: true,
                            newItem: newRule,
                            liveTitleKey: "label",
                            itemTitle: function (item, index) { return cleanText(item && item.label) || (i18n("Action ", "Action ") + (index + 1)); },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Action active", en: "Action enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom de l’action", en: "Action name" } },
                                {
                                    key: "actionMode",
                                    type: "select",
                                    label: { fr: "Déclenchement de la copie", en: "Copy trigger" },
                                    options: [
                                        { value: "generated", label: { fr: "Ajouter une action de copie", en: "Add a copy action" } },
                                        { value: "existing-trigger", label: { fr: "Utiliser un élément déjà présent", en: "Use an existing element" } }
                                    ],
                                    refreshOnChange: true
                                },
                                {
                                    key: "pagePath",
                                    type: "text",
                                    label: { fr: "Page Koha", en: "Koha page" },
                                    help: { fr: "Ex. /cgi-bin/koha/catalogue/detail.pl. Si cette page n’est pas ouverte, le picker commun peut y naviguer avant la sélection.", en: "E.g. /cgi-bin/koha/catalogue/detail.pl. If that page is not open, the shared picker can navigate there before selection." }
                                },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Élément dont la valeur sera copiée", en: "Element whose value will be copied" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    emptyLabel: { fr: "Aucun élément choisi", en: "No element selected" },
                                    allowManual: true,
                                    pick: pickForRule,
                                    onPick: applyPickerResult
                                },
                                { key: "targetName", type: "readonly", label: { fr: "Élément source détecté", en: "Detected source element" } },
                                {
                                    key: "triggerSelector",
                                    type: "elementPicker",
                                    label: { fr: "Élément existant qui déclenche la copie", en: "Existing element that triggers copying" },
                                    pickLabel: { fr: "Choisir le déclencheur sur la page", en: "Choose trigger on page" },
                                    emptyLabel: { fr: "Aucun déclencheur choisi", en: "No trigger selected" },
                                    allowManual: true,
                                    pick: pickForRule,
                                    onPick: applyPickerResult,
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "existing-trigger"); }
                                },
                                {
                                    key: "triggerName",
                                    type: "readonly",
                                    label: { fr: "Déclencheur détecté", en: "Detected trigger" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "existing-trigger"); }
                                },
                                {
                                    type: "visualPreview",
                                    label: { fr: "Aperçu de l’action", en: "Action preview" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated"); }
                                },
                                {
                                    type: "styleEyedropper",
                                    label: { fr: "Pipette de style", en: "Style eyedropper" },
                                    buttonLabel: { fr: "Reprendre la taille et la couleur d’un élément…", en: "Reuse an element’s size and color…" },
                                    iconClass: "fa fa-eyedropper",
                                    sectionId: "rules",
                                    help: {
                                        fr: "La pipette adapte uniquement la taille et les couleurs de l’action de copie ; elle ne copie ni position ni comportement.",
                                        en: "The eyedropper only adapts the copy action size and colors; it never copies positioning or behavior."
                                    },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated"); }
                                },
                                {
                                    key: "valueSource",
                                    type: "select",
                                    label: { fr: "Valeur à copier", en: "Value to copy" },
                                    options: valueSourceOptions,
                                    refreshOnChange: true
                                },
                                {
                                    key: "attributeName",
                                    type: "text",
                                    label: { fr: "Nom de l’attribut HTML", en: "HTML attribute name" },
                                    placeholder: { fr: "ex. data-id, href, title", en: "e.g. data-id, href, title" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].valueSource === "attribute"); }
                                },
                                {
                                    key: "transform",
                                    type: "select",
                                    label: { fr: "Partie à copier", en: "Part to copy" },
                                    options: [
                                        { value: "full", label: { fr: "Valeur complète", en: "Full value" } },
                                        { value: "prefix", label: { fr: "Premiers caractères", en: "First characters" } },
                                        { value: "suffix", label: { fr: "Derniers caractères", en: "Last characters" } }
                                    ],
                                    refreshOnChange: true
                                },
                                {
                                    key: "length",
                                    type: "number",
                                    min: 1,
                                    max: 500,
                                    label: { fr: "Nombre de caractères", en: "Number of characters" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].transform !== "full"); }
                                },
                                {
                                    key: "placement",
                                    type: "select",
                                    label: { fr: "Position de l’icône / action", en: "Icon / action position" },
                                    options: [
                                        { value: "before", label: { fr: "Avant l’élément", en: "Before the element" } },
                                        { value: "after", label: { fr: "Après l’élément", en: "After the element" } },
                                        { value: "inside-start", label: { fr: "Au début de l’élément", en: "At the start of the element" } },
                                        { value: "inside-end", label: { fr: "À la fin de l’élément", en: "At the end of the element" } }
                                    ],
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated"); }
                                },
                                {
                                    key: "visualType",
                                    type: "select",
                                    label: { fr: "Visuel de l’action", en: "Action visual" },
                                    options: [
                                        { value: "fa", label: { fr: "Icône Font Awesome", en: "Font Awesome icon" } },
                                        { value: "image", label: { fr: "Image", en: "Image" } },
                                        { value: "none", label: { fr: "Aucun logo", en: "No logo" } }
                                    ],
                                    refreshOnChange: true,
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated"); }
                                },
                                {
                                    key: "iconClass",
                                    type: "text",
                                    label: { fr: "Classe Font Awesome", en: "Font Awesome class" },
                                    placeholder: { fr: "fa fa-copy", en: "fa fa-copy" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].visualType === "fa"); }
                                },
                                {
                                    key: "iconColor",
                                    type: "color",
                                    label: { fr: "Couleur de l’icône Font Awesome", en: "Font Awesome icon color" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].visualType === "fa"); }
                                },
                                {
                                    key: "iconHoverColor",
                                    type: "color",
                                    label: { fr: "Couleur de l’icône au survol", en: "Icon hover color" },
                                    help: { fr: "Le survol reste volontairement discret : changement de couleur et léger agrandissement, sans fond de bouton.", en: "Hover stays intentionally discreet: color change and slight enlargement, with no button background." },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].visualType === "fa"); }
                                },
                                {
                                    key: "actionSizePx",
                                    type: "number",
                                    label: { fr: "Taille de l’action / icône (px)", en: "Action / icon size (px)" },
                                    help: { fr: "Règle la taille de l’icône Font Awesome ou de l’image. Zone conseillée : 12 à 24 px pour rester discrète.", en: "Controls the Font Awesome icon or image size. Recommended range: 12 to 24 px for a discreet action." },
                                    min: 8,
                                    max: 64,
                                    step: 1,
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated"); }
                                },
                                {
                                    key: "imageUrl",
                                    type: "imageUrl",
                                    label: { fr: "Image de l’action", en: "Action image" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].visualType === "image"); }
                                },
                                { key: "showText", type: "boolean", label: { fr: "Afficher un texte à côté de l’icône", en: "Show text next to the icon" }, refreshOnChange: true, when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated"); } },
                                {
                                    key: "textSizePx",
                                    type: "number",
                                    label: { fr: "Taille du texte (px)", en: "Text size (px)" },
                                    min: 8,
                                    max: 40,
                                    step: 1,
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].showText === true); }
                                },
                                {
                                    key: "textColor",
                                    type: "color",
                                    label: { fr: "Couleur du texte", en: "Text color" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].showText === true); }
                                },
                                {
                                    key: "textHoverColor",
                                    type: "color",
                                    label: { fr: "Couleur du texte au survol", en: "Text hover color" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].showText === true); }
                                },
                                {
                                    key: "buttonTextFr",
                                    type: "text",
                                    label: { fr: "Texte de l’action — français", en: "Action text — French" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].showText === true); }
                                },
                                {
                                    key: "buttonTextEn",
                                    type: "text",
                                    label: { fr: "Texte de l’action — anglais", en: "Action text — English" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "generated" && root.rules[i].showText === true); }
                                },
                                { key: "titleFr", type: "text", label: { fr: "Infobulle / libellé accessible — français", en: "Tooltip / accessible label — French" } },
                                { key: "titleEn", type: "text", label: { fr: "Infobulle / libellé accessible — anglais", en: "Tooltip / accessible label — English" } },
                                {
                                    key: "feedbackEnabled",
                                    type: "boolean",
                                    refreshOnChange: true,
                                    label: { fr: "Afficher un retour visuel après copie", en: "Show visual feedback after copy" },
                                    help: { fr: "Disponible pour toutes les actions, y compris les déclencheurs déjà présents dans Koha.", en: "Available for every action, including triggers already present in Koha." }
                                },
                                {
                                    key: "feedbackPlacement",
                                    type: "select",
                                    label: { fr: "Position du retour visuel", en: "Feedback position" },
                                    options: [
                                        { value: "auto", label: { fr: "Automatique — proche de l’action", en: "Automatic — near the action" } },
                                        { value: "after-trigger", label: { fr: "Juste après l’action", en: "Immediately after action" } },
                                        { value: "parent-end", label: { fr: "À la fin du conteneur de l’action", en: "At the end of the action container" } },
                                        { value: "floating", label: { fr: "Message flottant", en: "Floating message" } }
                                    ],
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackDurationMs",
                                    type: "number",
                                    min: 300,
                                    max: 10000,
                                    step: 100,
                                    label: { fr: "Durée du message (ms)", en: "Message duration (ms)" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackSuccessTextFr",
                                    type: "text",
                                    label: { fr: "Texte succès — français", en: "Success text — French" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackSuccessTextEn",
                                    type: "text",
                                    label: { fr: "Texte succès — anglais", en: "Success text — English" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackErrorTextFr",
                                    type: "text",
                                    label: { fr: "Texte erreur — français", en: "Error text — French" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackErrorTextEn",
                                    type: "text",
                                    label: { fr: "Texte erreur — anglais", en: "Error text — English" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackSuccessColor",
                                    type: "color",
                                    label: { fr: "Couleur du succès", en: "Success color" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackErrorColor",
                                    type: "color",
                                    label: { fr: "Couleur de l’erreur", en: "Error color" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackFontSize",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Taille du texte du retour", en: "Feedback text size" },
                                    help: { fr: "Valeur CSS, par exemple 0.75em ou 12px.", en: "CSS value, for example 0.75em or 12px." },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackFontWeight",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Graisse du texte du retour", en: "Feedback font weight" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackMargin",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Marges du retour visuel", en: "Feedback margin" },
                                    help: { fr: "Valeur CSS. Le défaut 0 0 0 5px reprend le 107.", en: "CSS value. Default 0 0 0 5px matches 107." },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                {
                                    key: "feedbackFade",
                                    type: "boolean",
                                    label: { fr: "Faire disparaître progressivement le message", en: "Fade the message out" },
                                    when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].feedbackEnabled !== false); }
                                },
                                { key: "matchMode", type: "select", advanced: true, label: { fr: "Si plusieurs éléments correspondent", en: "If several elements match" }, options: [ { value: "all", label: { fr: "Ajouter une action à chacun", en: "Add an action to each" } }, { value: "first", label: { fr: "Seulement au premier", en: "First one only" } } ] },
                                { key: "excludeSelector", type: "text", advanced: true, label: { fr: "Sous-éléments à exclure du texte copié", en: "Child elements excluded from copied text" } },
                                { key: "trim", type: "boolean", advanced: true, label: { fr: "Supprimer les espaces début/fin", en: "Trim leading/trailing spaces" } },
                                { key: "extractRegex", type: "text", advanced: true, label: { fr: "Extraire avec une RegExp", en: "Extract with RegExp" } },
                                { key: "regexFlags", type: "text", advanced: true, label: { fr: "Options RegExp", en: "RegExp flags" } },
                                { key: "regexGroup", type: "number", advanced: true, label: { fr: "Groupe RegExp utilisé", en: "RegExp group" } },
                                { key: "exampleValue", type: "readonly", advanced: true, label: { fr: "Exemple détecté lors du pick", en: "Example detected when picked" } },
                                { key: "matchCount", type: "readonly", advanced: true, label: { fr: "Sources trouvées lors du pick", en: "Sources found when picked" } },
                                { key: "triggerMatchCount", type: "readonly", advanced: true, label: { fr: "Déclencheurs trouvés lors du pick", en: "Triggers found when picked" }, when: function (root, path) { const i = getRuleIndex(path); return Boolean(i !== null && root.rules[i] && root.rules[i].actionMode === "existing-trigger"); } },
                                { key: "id", type: "readonly", advanced: true, label: { fr: "Identifiant technique", en: "Technical identifier" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "tableRules",
                    label: { fr: "Copies groupées / tableaux", en: "Grouped / table copies" },
                    description: {
                        fr: "Copie en une action plusieurs valeurs d’un tableau Koha. Les six règles historiques du 115 sont fournies par défaut. Utilise le picker pour choisir le tableau et une valeur représentative.",
                        en: "Copies several values from a Koha table in one action. The six historical 115 rules are provided by default. Use the picker to choose the table and a representative value."
                    },
                    fields: [
                        {
                            key: "tableRules",
                            type: "repeater",
                            label: { fr: "Actions groupées configurées", en: "Configured grouped actions" },
                            addLabel: { fr: "Ajouter une copie groupée", en: "Add grouped copy action" },
                            reorder: true,
                            newItem: newTableRule,
                            liveTitleKey: "label",
                            itemTitle: function (item, index) { return cleanText(item && item.label) || (i18n("Copie groupée ", "Grouped copy ") + (index + 1)); },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Action active", en: "Action enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom de l’action", en: "Action name" } },
                                {
                                    key: "pagePath",
                                    type: "text",
                                    label: { fr: "Page Koha", en: "Koha page" },
                                    help: { fr: "Ex. /cgi-bin/koha/circ/returns.pl", en: "E.g. /cgi-bin/koha/circ/returns.pl" }
                                },
                                {
                                    key: "tableSelector",
                                    type: "elementPicker",
                                    label: { fr: "Tableau à exploiter", en: "Table to use" },
                                    pickLabel: { fr: "Choisir le tableau sur la page", en: "Choose table on page" },
                                    emptyLabel: { fr: "Aucun tableau choisi", en: "No table selected" },
                                    allowManual: true,
                                    pick: pickForTableRule,
                                    onPick: applyTablePickerResult
                                },
                                { key: "tableName", type: "readonly", label: { fr: "Tableau détecté", en: "Detected table" } },
                                {
                                    key: "sourceMode",
                                    type: "select",
                                    label: { fr: "Mode d’extraction", en: "Extraction mode" },
                                    refreshOnChange: true,
                                    options: [
                                        { value: "column", label: { fr: "Une colonne du tableau", en: "A table column" } },
                                        { value: "selector", label: { fr: "Éléments ciblés dans chaque ligne", en: "Targeted elements in each row" } }
                                    ]
                                },
                                {
                                    key: "sourceSelector",
                                    type: "elementPicker",
                                    label: { fr: "Valeur représentative", en: "Representative value" },
                                    pickLabel: { fr: "Choisir une valeur dans le tableau", en: "Choose a value in the table" },
                                    emptyLabel: { fr: "Aucune valeur choisie", en: "No value selected" },
                                    allowManual: true,
                                    pick: pickForTableRule,
                                    onPick: applyTablePickerResult,
                                    help: {
                                        fr: "En mode colonne, le picker mémorise surtout la colonne. En mode sélecteur, ce sélecteur est utilisé pour retrouver les valeurs dans chaque ligne.",
                                        en: "In column mode, the picker mainly records the column. In selector mode, this selector is used to find values in each row."
                                    }
                                },
                                { key: "sourceName", type: "readonly", label: { fr: "Valeur détectée", en: "Detected value" } },
                                {
                                    key: "columnHeaderLabels",
                                    type: "text",
                                    label: { fr: "Libellés possibles de la colonne", en: "Possible column labels" },
                                    help: { fr: "Séparer les variantes FR/EN par ;. Utilisé seulement en fallback.", en: "Separate FR/EN variants with ;. Used only as a fallback." },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].sourceMode === "column"); }
                                },
                                {
                                    key: "columnHeaderSelector",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Sélecteur stable de l’en-tête", en: "Stable header selector" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].sourceMode === "column"); }
                                },
                                {
                                    key: "columnIndexHint",
                                    type: "readonly",
                                    advanced: true,
                                    label: { fr: "Index de colonne détecté", en: "Detected column index" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].sourceMode === "column"); }
                                },
                                {
                                    key: "valueSource",
                                    type: "select",
                                    label: { fr: "Valeur à lire", en: "Value to read" },
                                    refreshOnChange: true,
                                    options: valueSourceOptions
                                },
                                {
                                    key: "attributeName",
                                    type: "text",
                                    label: { fr: "Attribut HTML à lire", en: "HTML attribute to read" },
                                    placeholder: { fr: "ex. href, data-id", en: "e.g. href, data-id" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].valueSource === "attribute"); }
                                },
                                {
                                    key: "urlParam",
                                    type: "text",
                                    label: { fr: "Extraire un paramètre de l’URL", en: "Extract URL parameter" },
                                    placeholder: { fr: "ex. biblionumber", en: "e.g. biblionumber" },
                                    advanced: true,
                                    help: { fr: "Laisser vide pour copier l’attribut entier.", en: "Leave empty to copy the whole attribute." }
                                },
                                {
                                    key: "scope",
                                    type: "select",
                                    label: { fr: "Lignes à copier", en: "Rows to copy" },
                                    refreshOnChange: true,
                                    options: [
                                        { value: "visible", label: { fr: "Page actuellement visible — historique 115", en: "Currently visible page — historical 115" } },
                                        { value: "filtered", label: { fr: "Toutes les lignes correspondant au filtre", en: "All rows matching the filter" } },
                                        { value: "selected", label: { fr: "Lignes sélectionnées uniquement", en: "Selected rows only" } },
                                        { value: "loaded", label: { fr: "Toutes les lignes chargées", en: "All loaded rows" } }
                                    ]
                                },
                                {
                                    key: "selectedRowSelector",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Sélecteur d’une ligne sélectionnée", en: "Selected row selector" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].scope === "selected"); }
                                },
                                {
                                    key: "selectionCheckboxSelector",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Case cochée indiquant la sélection", en: "Checked box indicating selection" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].scope === "selected"); }
                                },
                                { key: "deduplicate", type: "boolean", label: { fr: "Supprimer les doublons", en: "Remove duplicates" } },
                                {
                                    key: "resultOrder",
                                    type: "select",
                                    label: { fr: "Ordre des valeurs copiées", en: "Copied value order" },
                                    options: [
                                        { value: "display", label: { fr: "Ordre du tableau", en: "Table order" } },
                                        { value: "alpha-asc", label: { fr: "Alphabétique croissant", en: "Alphabetical ascending" } },
                                        { value: "alpha-desc", label: { fr: "Alphabétique décroissant", en: "Alphabetical descending" } },
                                        { value: "numeric-asc", label: { fr: "Numérique croissant", en: "Numeric ascending" } },
                                        { value: "numeric-desc", label: { fr: "Numérique décroissant", en: "Numeric descending" } }
                                    ]
                                },
                                {
                                    key: "separator",
                                    type: "select",
                                    label: { fr: "Séparateur", en: "Separator" },
                                    refreshOnChange: true,
                                    options: [
                                        { value: "newline", label: { fr: "Une valeur par ligne — historique 115", en: "One value per line — historical 115" } },
                                        { value: "comma", label: { fr: "Virgule", en: "Comma" } },
                                        { value: "semicolon", label: { fr: "Point-virgule", en: "Semicolon" } },
                                        { value: "tab", label: { fr: "Tabulation", en: "Tab" } },
                                        { value: "space", label: { fr: "Espace", en: "Space" } },
                                        { value: "custom", label: { fr: "Personnalisé", en: "Custom" } }
                                    ]
                                },
                                {
                                    key: "customSeparator",
                                    type: "text",
                                    label: { fr: "Séparateur personnalisé", en: "Custom separator" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].separator === "custom"); }
                                },
                                {
                                    key: "transform",
                                    type: "select",
                                    label: { fr: "Partie de chaque valeur à copier", en: "Part of each value to copy" },
                                    refreshOnChange: true,
                                    options: [
                                        { value: "full", label: { fr: "Valeur complète", en: "Full value" } },
                                        { value: "prefix", label: { fr: "Premiers caractères", en: "First characters" } },
                                        { value: "suffix", label: { fr: "Derniers caractères", en: "Last characters" } }
                                    ]
                                },
                                {
                                    key: "length",
                                    type: "number",
                                    min: 1,
                                    max: 500,
                                    label: { fr: "Nombre de caractères", en: "Number of characters" },
                                    when: function (root, path) { const i = getTableRuleIndex(path); return Boolean(i !== null && root.tableRules[i] && root.tableRules[i].transform !== "full"); }
                                },
                                {
                                    key: "buttonStyle",
                                    type: "select",
                                    label: { fr: "Style du bouton", en: "Button style" },
                                    options: [
                                        { value: "datatable", label: { fr: "Bouton DataTables / Koha — historique", en: "DataTables / Koha button — historical" } },
                                        { value: "koha", label: { fr: "Bouton Koha classique", en: "Classic Koha button" } }
                                    ]
                                },
                                { key: "iconClass", type: "text", label: { fr: "Icône Font Awesome", en: "Font Awesome icon" } },
                                { key: "iconColor", type: "color", label: { fr: "Couleur de l’icône", en: "Icon color" } },
                                { key: "showText", type: "boolean", label: { fr: "Afficher le texte du bouton", en: "Show button text" } },
                                { key: "buttonTextFr", type: "text", label: { fr: "Texte du bouton — français", en: "Button text — French" } },
                                { key: "buttonTextEn", type: "text", label: { fr: "Texte du bouton — anglais", en: "Button text — English" } },
                                { key: "textColor", type: "color", label: { fr: "Couleur du texte", en: "Text color" } },
                                { key: "fontSizePx", type: "number", min: 8, max: 40, label: { fr: "Taille du texte (px)", en: "Text size (px)" } },
                                { key: "titleFr", type: "text", label: { fr: "Infobulle — français", en: "Tooltip — French" } },
                                { key: "titleEn", type: "text", label: { fr: "Infobulle — anglais", en: "Tooltip — English" } },
                                {
                                    key: "buttonContainerSelector",
                                    type: "elementPicker",
                                    advanced: true,
                                    label: { fr: "Conteneur du bouton (optionnel)", en: "Button container (optional)" },
                                    pickLabel: { fr: "Choisir un emplacement", en: "Choose a location" },
                                    emptyLabel: { fr: "Automatique : barre DataTables", en: "Automatic: DataTables toolbar" },
                                    allowManual: true,
                                    pick: pickForTableRule,
                                    onPick: applyTablePickerResult
                                },
                                {
                                    key: "buttonPosition",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Position dans le conteneur", en: "Position in container" },
                                    options: [
                                        { value: "append", label: { fr: "À la fin", en: "At the end" } },
                                        { value: "prepend", label: { fr: "Au début", en: "At the beginning" } }
                                    ]
                                },
                                { key: "buttonExtraClass", type: "text", advanced: true, label: { fr: "Classes CSS supplémentaires", en: "Additional CSS classes" } },
                                { key: "feedbackEnabled", type: "boolean", label: { fr: "Afficher un retour après la copie", en: "Show feedback after copy" } },
                                { key: "feedbackSuccessTextFr", type: "text", label: { fr: "Message succès — français", en: "Success message — French" } },
                                { key: "feedbackSuccessTextEn", type: "text", label: { fr: "Message succès — anglais", en: "Success message — English" } },
                                { key: "feedbackEmptyTextFr", type: "text", label: { fr: "Message si aucune valeur — français", en: "Empty message — French" } },
                                { key: "feedbackEmptyTextEn", type: "text", label: { fr: "Message si aucune valeur — anglais", en: "Empty message — English" } },
                                { key: "feedbackErrorTextFr", type: "text", label: { fr: "Message erreur — français", en: "Error message — French" } },
                                { key: "feedbackErrorTextEn", type: "text", label: { fr: "Message erreur — anglais", en: "Error message — English" } },
                                { key: "feedbackDurationMs", type: "number", min: 300, max: 10000, step: 100, label: { fr: "Durée du message (ms)", en: "Message duration (ms)" } },
                                { key: "excludeSelector", type: "text", advanced: true, label: { fr: "Sous-éléments à exclure", en: "Child elements to exclude" } },
                                { key: "trim", type: "boolean", advanced: true, label: { fr: "Supprimer les espaces début/fin", en: "Trim leading/trailing spaces" } },
                                { key: "extractRegex", type: "text", advanced: true, label: { fr: "Extraire avec une RegExp", en: "Extract with RegExp" } },
                                { key: "regexFlags", type: "text", advanced: true, label: { fr: "Options RegExp", en: "RegExp flags" } },
                                { key: "regexGroup", type: "number", advanced: true, label: { fr: "Groupe RegExp utilisé", en: "RegExp group" } },
                                { key: "tableMatchCount", type: "readonly", advanced: true, label: { fr: "Tableaux trouvés lors du pick", en: "Tables found when picked" } },
                                { key: "sourceMatchCount", type: "readonly", advanced: true, label: { fr: "Valeurs trouvées lors du pick", en: "Values found when picked" } },
                                { key: "exampleValue", type: "readonly", advanced: true, label: { fr: "Exemple détecté", en: "Detected example" } },
                                { key: "id", type: "readonly", advanced: true, label: { fr: "Identifiant technique", en: "Technical identifier" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "advanced",
                    label: { fr: "Chargement dynamique", en: "Dynamic loading" },
                    fields: [
                        { key: "observeDom", type: "boolean", advanced: true, label: { fr: "Retraiter les éléments ajoutés après chargement", en: "Process elements added after page load" } },
                        { key: "observeDelay", type: "number", advanced: true, label: { fr: "Délai de retraitement (ms)", en: "Reprocessing delay (ms)" } }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId === "tableRules" ? "tableRules" : "rules";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') ||
                    main.querySelector('[data-pmk-section-id="rules"]');
                if (section) window.setTimeout(function () { section.scrollIntoView({ block: "start", behavior: "smooth" }); }, 0);
            }
        };
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        const active = currentConfig.rules.find(ruleApplies);
        const tableActive = currentConfig.tableRules.find(tableRuleApplies);
        let anchor = null;
        let sectionId = "rules";

        if (active) {
            const preferredSelector = active.actionMode === "existing-trigger" && active.triggerSelector
                ? active.triggerSelector
                : active.selector;
            try { anchor = document.querySelector(preferredSelector) || document.querySelector(active.selector); } catch (_) {}
        }

        if (!anchor && tableActive) {
            sectionId = "tableRules";
            try {
                anchor = document.querySelector(tableButtonSelector(tableActive)) ||
                    document.querySelector(tableActive.tableSelector);
            } catch (_) {}
        }

        anchor = anchor || document.querySelector("h1") || document.querySelector("#breadcrumbs");
        if (!anchor || (!active && !tableActive)) return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: anchor,
            position: "after",
            contextKey: "copy-actions-" + normalizePath(window.location.pathname),
            context: { sectionId: sectionId, pagePath: window.location.pathname }
        });
    }

    async function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return clone(DEFAULT_CONFIG);
        try { return await window.PMKConfig.getConfig(MODULE_ID); } catch (_) { return clone(DEFAULT_CONFIG); }
    }

    async function startWithCore() {
        if (!window.PMKConfig) return;
        registerPickerAdapter();
        registerVisualEditorAdapter();
        if (!registered && typeof window.PMKConfig.registerModule === "function") {
            window.PMKConfig.registerModule(moduleDefinition());
            registered = true;
        }
        const config = normalizeConfig(await loadConfig());
        applyAll(config);
        startObserver(config);
        mountContextAccess();
        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (next) {
                const normalized = normalizeConfig(next);
                applyAll(normalized);
                startObserver(normalized);
                mountContextAccess();
            });
        }
    }

    function startWithoutCore() {
        const config = normalizeConfig(DEFAULT_CONFIG);
        applyAll(config);
        startObserver(config);
    }

    window.PMK006CopyActions = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        normalizeConfig: normalizeConfig,
        moduleDefinition: moduleDefinition,
        apply: applyAll,
        pickElement: fallbackPicker
    };

    function boot() {
        if (window.PMKConfig) startWithCore();
        else {
            startWithoutCore();
            window.addEventListener("pmk:config-ready", startWithCore, { once: true });
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
