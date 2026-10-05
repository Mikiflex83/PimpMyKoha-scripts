/*
 Nom du fichier: 055-facets-drawer.js
 Module PMK: Facettes de recherche
 Version: 3.8.2-pmk-quickfilters
 Date de dernière modification: 2026-09-19
 Auteur: Michael Mundet / refactorisation PimpMyKoha

 Fonction:
 - transforme les catégories de facettes de catalogue/search.pl en tiroirs accessibles ;
 - permet de préparer plusieurs ajouts/retraits de facettes avant de relancer la recherche ;
 - distingue clairement l’annulation des modifications en attente de l’effacement de tous les filtres déjà appliqués ;
 - conserve les ouvertures/fermetures manuelles des tiroirs pendant les recalculs asynchrones ;
 - conserve les paramètres de recherche Koha (limit / nolimit) et utilise le préfixe mc- pour regrouper en OU les valeurs d’une même facette ;
 - recalcule les valeurs des familles de facettes actives en facettage disjonctif afin de conserver les autres choix possibles ;
 - signale visuellement les facettes déjà actives ;
 - reprend les deux boutons historiques du 064 sous forme de filtres rapides harmonisés avec Koha ;
 - « Disponibles uniquement » utilise le vrai filtre Koha limit=available ;
 - « Disponibles ici uniquement » reprend la logique historique : il identifie les notices ayant un exemplaire réellement disponible dans le site de connexion ;
 - les libellés des filtres rapides sont personnalisables pour leurs états inactif, actif et indisponible ;
 - les notices hors filtre local peuvent être masquées, atténuées, repliées ou atténuées et reléguées en bas ;
 - ce filtre local reste actif pendant la navigation entre les pages de résultats et se réapplique automatiquement ;
 - peut masquer la facette native « Disponible uniquement » lorsque le bouton rapide la remplace ;
 - permet de renommer les groupes de facettes via des règles FR/EN ;
 - permet de conserver le "Afficher plus / moins" natif ou d'afficher toutes les valeurs ;
 - ne dépend d'aucun texte anglais pour identifier une facette active ;
 - respecte le DOM Koha et restaure ses éléments natifs lors d'une reconfiguration ;
 - FR/EN, responsive, accessible, sans dépendance jQuery.
*/

(function () {
    "use strict";

    const MODULE_ID = "search-facets";
    const MODULE_VERSION = "3.8.0-pmk-quickfilters";
    const PAGE_ID = "catalogue.search.results";
    const PAGE_PATH = "/cgi-bin/koha/catalogue/search.pl";
    const SCRIPT_GUARD = "__pmk055SearchFacetsV3";
    const STYLE_ID = "pmk055-search-facets-style";
    const GENERATED_ATTR = "data-pmk055-generated";
    const NATIVE_TEXT_ATTR = "data-pmk055-native-text";
    const TEMP_ID_ATTR = "data-pmk055-temp-id";
    const LOCAL_HIDDEN_CLASS = "pmk055-local-availability-hidden";
    const LOCAL_DIMMED_CLASS = "pmk055-local-availability-dimmed";
    const LOCAL_COLLAPSED_CLASS = "pmk055-local-availability-collapsed";
    const LOCAL_COMPACT_CELL_CLASS = "pmk055-local-compact-cell";
    const LOCAL_ORIGINAL_CELL_CLASS = "pmk055-local-original-cell";
    const LOCAL_EXCLUDED_CLASS = "pmk055-local-availability-excluded";
    const LOCAL_ORIGINAL_INDEX_ATTR = "data-pmk055-local-original-index";
    const LOCAL_FILTER_STORAGE_KEY = "pmk055:local-availability";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    if (window.location.pathname !== PAGE_PATH) return;

    const DEFAULTS = {
        enabled: true,
        page: {
            enabled: true,
            pageId: PAGE_ID,
            path: PAGE_PATH
        },
        drawers: true,
        initialState: "closed",
        openActive: true,
        multiSelect: true,
        valuesMode: "all",
        recalculateActiveFacets: true,
        highlightActiveFacets: true,
        hideAvailabilityFacet: true,
        quickFilters: {
            availability: {
                enabled: true,
                labelFr: "Documents disponibles uniquement",
                labelEn: "Available records only",
                activeLabelFr: "✓ Documents disponibles uniquement",
                activeLabelEn: "✓ Available records only",
                unavailableLabelFr: "Filtre de disponibilité indisponible",
                unavailableLabelEn: "Availability filter unavailable"
            },
            local: {
                enabled: true,
                labelFr: "Disponibles ici uniquement",
                labelEn: "Available here only",
                activeLabelFr: "✓ Disponibles ici uniquement",
                activeLabelEn: "✓ Available here only",
                unavailableLabelFr: "Disponibilité locale indisponible",
                unavailableLabelEn: "Local availability unavailable",
                persistAcrossPages: true,
                resultDisplay: "dimmed"
            }
        },
        groupRenames: []
    };

    let currentConfig = clone(DEFAULTS);
    let unsubscribe = null;
    let startRetry = null;
    let tempIdCounter = 0;
    let facetRefreshInProgress = false;
    let lastFacetRefreshSignature = "";
    let localAvailabilityActive = false;
    let localAvailabilityHydrated = false;
    let localResultsObserver = null;
    let localFilterScheduled = false;

    const pendingAdds = new Set();
    const pendingRemoves = new Set();
    const drawerStateOverrides = new Map();

    function clone(value) {
        try {
            if (typeof structuredClone === "function") return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }

    function merge(base, extra) {
        const out = clone(base);
        const src = extra && typeof extra === "object" ? extra : {};
        Object.keys(src).forEach(function (key) {
            const incoming = src[key];
            if (
                incoming && typeof incoming === "object" && !Array.isArray(incoming) &&
                out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
            ) {
                out[key] = Object.assign({}, out[key], incoming);
            } else {
                out[key] = incoming;
            }
        });
        return out;
    }

    function normalizeConfig(config) {
        const value = merge(DEFAULTS, config || {});
        value.enabled = value.enabled !== false;
        value.page = Object.assign({}, DEFAULTS.page, value.page || {});
        value.page.enabled = value.page.enabled !== false;
        value.page.pageId = PAGE_ID;
        value.page.path = PAGE_PATH;
        value.drawers = value.drawers !== false;
        value.openActive = value.openActive !== false;
        value.multiSelect = value.multiSelect !== false;
        value.recalculateActiveFacets = value.recalculateActiveFacets !== false;
        value.highlightActiveFacets = value.highlightActiveFacets !== false;
        value.hideAvailabilityFacet = value.hideAvailabilityFacet !== false;

        const quick = value.quickFilters && typeof value.quickFilters === "object"
            ? value.quickFilters
            : {};
        value.quickFilters = {
            availability: Object.assign(
                {},
                DEFAULTS.quickFilters.availability,
                quick.availability && typeof quick.availability === "object" ? quick.availability : {}
            ),
            local: Object.assign(
                {},
                DEFAULTS.quickFilters.local,
                quick.local && typeof quick.local === "object" ? quick.local : {}
            )
        };
        ["availability", "local"].forEach(function (key) {
            const item = value.quickFilters[key];
            const fallback = DEFAULTS.quickFilters[key];
            item.enabled = item.enabled !== false;
            item.labelFr = String(item.labelFr || fallback.labelFr).trim() || fallback.labelFr;
            item.labelEn = String(item.labelEn || fallback.labelEn).trim() || fallback.labelEn;
            item.activeLabelFr = String(item.activeLabelFr || fallback.activeLabelFr).trim() || fallback.activeLabelFr;
            item.activeLabelEn = String(item.activeLabelEn || fallback.activeLabelEn).trim() || fallback.activeLabelEn;
            item.unavailableLabelFr = String(item.unavailableLabelFr || fallback.unavailableLabelFr || item.labelFr).trim() || fallback.unavailableLabelFr || item.labelFr;
            item.unavailableLabelEn = String(item.unavailableLabelEn || fallback.unavailableLabelEn || item.labelEn).trim() || fallback.unavailableLabelEn || item.labelEn;
            if (key === "local") {
                item.persistAcrossPages = item.persistAcrossPages !== false;
                if (!["hidden", "dimmed", "collapsed", "dimmed-bottom"].includes(item.resultDisplay)) {
                    item.resultDisplay = DEFAULTS.quickFilters.local.resultDisplay;
                }
            }
        });

        value.groupRenames = Array.isArray(value.groupRenames)
            ? value.groupRenames.map(function (rule) {
                const item = rule && typeof rule === "object" ? rule : {};
                return {
                    enabled: item.enabled !== false,
                    sourceLabel: String(item.sourceLabel || "").trim(),
                    groupKey: String(item.groupKey || "").trim(),
                    fr: String(item.fr || "").trim(),
                    en: String(item.en || "").trim()
                };
            })
            : [];
        if (!["closed", "open"].includes(value.initialState)) value.initialState = DEFAULTS.initialState;
        if (!["all", "koha"].includes(value.valuesMode)) value.valuesMode = DEFAULTS.valuesMode;
        return value;
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function language() {
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try {
                const lang = String(api.getLanguage() || "").toLowerCase();
                if (lang.startsWith("en")) return "en";
                if (lang.startsWith("fr")) return "fr";
            } catch (_) {}
        }
        const htmlLang = String(document.documentElement.getAttribute("lang") || "").toLowerCase();
        return htmlLang.startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return language() === "en" ? en : fr;
    }

    function directChild(parent, selector) {
        if (!parent) return null;
        return Array.from(parent.children || []).find(function (child) {
            try { return child.matches(selector); } catch (_) { return false; }
        }) || null;
    }

    function directChildren(parent, selector) {
        if (!parent) return [];
        return Array.from(parent.children || []).filter(function (child) {
            try { return child.matches(selector); } catch (_) { return false; }
        });
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #search-facets.pmk055-enhanced {
                --pmk055-border: var(--bs-border-color, #dee2e6);
                --pmk055-muted: var(--bs-secondary-color, #6c757d);
                --pmk055-soft: rgba(0, 0, 0, .035);
            }

            #search-facets.pmk055-enhanced .pmk055-native-heading,
            #search-facets.pmk055-enhanced [${NATIVE_TEXT_ATTR}="1"].pmk055-native-heading {
                display: none !important;
            }

            #search-facets.pmk055-drawers > ul > li {
                border-bottom: 1px solid var(--pmk055-border);
                padding-top: .08rem;
                padding-bottom: .08rem;
            }

            #search-facets.pmk055-drawers > ul > li:last-child {
                border-bottom: 0;
            }

            #search-facets .pmk055-renamed-heading {
                display: block;
                font-weight: 600;
                margin: .25rem 0 .35rem;
                line-height: 1.25;
            }

            #search-facets .pmk055-facet-toggle {
                appearance: none;
                width: 100%;
                border: 0;
                background: transparent;
                color: inherit;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .5rem;
                margin: 0;
                padding: .42rem .15rem;
                font: inherit;
                font-weight: 600;
                line-height: 1.25;
                text-align: left;
                cursor: pointer;
                border-radius: .25rem;
            }

            #search-facets .pmk055-facet-toggle:hover,
            #search-facets .pmk055-facet-toggle:focus-visible {
                background: var(--pmk055-soft);
            }

            #search-facets .pmk055-facet-toggle:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: 2px;
            }

            #search-facets .pmk055-facet-toggle-icon {
                flex: 0 0 auto;
                opacity: .7;
                transition: transform .14s ease;
            }

            #search-facets .pmk055-open > .pmk055-facet-toggle .pmk055-facet-toggle-icon {
                transform: rotate(90deg);
            }

            #search-facets.pmk055-drawers > ul > li > ul {
                display: none;
                margin-top: .05rem;
                padding-top: .15rem;
                padding-bottom: .35rem;
            }

            #search-facets.pmk055-drawers > ul > li.pmk055-open > ul {
                display: block;
            }

            #search-facets.pmk055-values-all .collapsible-facet {
                display: list-item !important;
            }

            #search-facets.pmk055-values-all li.moretoggle {
                display: none !important;
            }

            #search-facets.pmk055-multiselect .pmk055-native-choice {
                display: none !important;
            }

            #search-facets .pmk055-choice-ui {
                display: flex;
                align-items: flex-start;
                gap: .42rem;
                min-width: 0;
                padding: .16rem .08rem;
                font-weight: normal;
            }

            #search-facets .pmk055-choice-ui:hover {
                background: var(--pmk055-soft);
                border-radius: .25rem;
            }

            #search-facets .pmk055-choice-ui .form-check-input {
                -webkit-appearance: checkbox !important;
                appearance: auto !important;
                box-sizing: border-box !important;
                flex: 0 0 auto;
                width: 1.08rem !important;
                height: 1.08rem !important;
                min-width: 1.08rem !important;
                min-height: 1.08rem !important;
                margin: .12rem 0 0 0 !important;
                padding: 0 !important;
                opacity: 1 !important;
                visibility: visible !important;
                cursor: pointer;
                accent-color: var(--bs-primary, #0d6efd);
            }

            #search-facets .pmk055-choice-ui.pmk055-selected {
                background: var(--pmk055-soft);
                border-radius: .25rem;
            }

            #search-facets .pmk055-choice-ui.pmk055-active {
                background: rgba(var(--bs-primary-rgb, 13, 110, 253), .10);
                border-left: 3px solid var(--bs-primary, #0d6efd);
                border-radius: .25rem;
                padding-left: .35rem;
                font-weight: 600;
            }

            #search-facets .pmk055-active-badge,
            #search-facets .pmk055-group-active-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                min-height: 1.25rem;
                padding: .08rem .38rem;
                border: 1px solid rgba(var(--bs-primary-rgb, 13, 110, 253), .35);
                border-radius: 999px;
                background: rgba(var(--bs-primary-rgb, 13, 110, 253), .08);
                color: var(--bs-primary, #0d6efd);
                font-size: .75em;
                font-weight: 600;
                line-height: 1.1;
                white-space: nowrap;
            }

            #search-facets .pmk055-facet-toggle-main {
                display: flex;
                align-items: center;
                gap: .4rem;
                min-width: 0;
            }

            #search-facets .pmk055-hidden-availability {
                display: none !important;
            }

            #search-facets .pmk055-actions.is-refreshing .pmk055-actions-status::before {
                content: "↻ ";
            }

            #search-facets .pmk055-choice-label {
                flex: 1 1 auto;
                min-width: 0;
                cursor: pointer;
                overflow-wrap: anywhere;
            }

            #search-facets .pmk055-choice-count {
                color: var(--pmk055-muted);
                white-space: nowrap;
                font-size: .92em;
            }

            #search-facets .pmk055-choice-ui.pmk055-pending {
                font-weight: 600;
            }

            #search-facets .pmk055-choice-ui.pmk055-pending .pmk055-choice-label::after {
                content: " •";
                color: var(--pmk055-muted);
            }

            #search-facets .pmk055-actions {
                margin: 0;
                padding: .5rem .55rem .55rem;
                border-bottom: 1px solid var(--pmk055-border);
                background: rgba(255,255,255,.32);
            }

            #search-facets .pmk055-actions-status {
                display: block;
                color: var(--pmk055-muted);
                font-size: .88em;
                line-height: 1.3;
                margin-bottom: .4rem;
            }

            #search-facets .pmk055-actions-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: .35rem;
            }

            #search-facets .pmk055-actions-buttons .btn {
                flex: 1 1 auto;
                white-space: normal;
            }

            #pmk-search-quick-filters {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: .35rem;
                margin: 0 0 .55rem;
                padding: .4rem .45rem;
                border: 1px solid var(--bs-border-color, #dee2e6);
                border-radius: .35rem;
                background: var(--bs-body-bg, #fff);
            }

            #pmk-search-quick-filters .pmk-search-quick-filter {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: .32rem;
                min-height: 2rem;
                margin: 0;
                padding: .28rem .55rem;
                line-height: 1.2;
                white-space: normal;
                text-align: center;
            }

            #pmk-search-quick-filters .pmk-search-quick-filter[aria-pressed="true"] {
                font-weight: 600;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18);
            }

            #pmk-search-quick-filters.pmk055-has-active-quick-filter {
                border-left: 3px solid var(--bs-primary, #0d6efd);
                background: rgba(var(--bs-primary-rgb, 13, 110, 253), .045);
            }

            #pmk-search-quick-filters .pmk055-quick-active-count {
                display: inline-flex;
                align-items: center;
                min-height: 1.8rem;
                padding: .14rem .48rem;
                border-radius: 999px;
                background: rgba(var(--bs-primary-rgb, 13, 110, 253), .10);
                color: var(--bs-primary, #0d6efd);
                font-size: .78rem;
                font-weight: 600;
                white-space: nowrap;
            }

            #pmk-search-quick-filters .pmk-search-quick-filter:disabled {
                cursor: not-allowed;
                opacity: .6;
            }

            #pmk-search-quick-filters .pmk-search-quick-status {
                display: inline-flex;
                align-items: center;
                min-height: 2rem;
                padding: .18rem .5rem;
                border-radius: .35rem;
                color: var(--bs-secondary-color, #6c757d);
                font-size: .82rem;
                line-height: 1.2;
            }

            #bookbag_form tbody tr.${LOCAL_HIDDEN_CLASS} {
                display: none !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_DIMMED_CLASS} {
                opacity: .46;
                filter: grayscale(.35);
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_DIMMED_CLASS}:hover {
                opacity: .72;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} {
                opacity: .78;
                font-size: .92em;
                background: rgba(108,117,125,.035);
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td {
                padding-top: .28rem !important;
                padding-bottom: .28rem !important;
                vertical-align: middle !important;
                border-top-color: rgba(108,117,125,.16) !important;
            }

            /* On conserve la vraie ligne Koha : couverture miniature + titre + auteur. */
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td.bookcoverimg {
                width: 48px !important;
                min-width: 48px !important;
                max-width: 48px !important;
                padding-left: .35rem !important;
                padding-right: .25rem !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td.bookcoverimg img {
                max-width: 34px !important;
                max-height: 48px !important;
                width: auto !important;
                height: auto !important;
                object-fit: contain !important;
                margin: 0 !important;
                float: none !important;
                filter: grayscale(.2);
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td.bookcoverimg .hint,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td.bookcoverimg .no-image {
                display: none !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td:nth-child(2) {
                width: 26px !important;
                min-width: 26px !important;
                padding-left: .15rem !important;
                padding-right: .2rem !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-cell {
                min-width: 0 !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-card {
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-head {
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-head-main {
                min-width: 0 !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .titlebibresult,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .titlemikaresult,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .firstresult {
                display: block !important;
                min-width: 0 !important;
                margin: 0 !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .titlebibresult a {
                display: block;
                max-width: 70ch;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-weight: 650;
                line-height: 1.2;
            }

            /* Tout ce qui alourdit la notice disparaît en vue repliée. */
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-head-tools,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-card .hold,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-card .btn-show-more,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-card .notice-details,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .copy-title-result,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-cell > .kx-biblio-line:not(.kx-notice-meta-author),
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kxri-panel,
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .availability {
                display: none !important;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-cell > .kx-notice-meta-author {
                display: block !important;
                margin: .08rem 0 0 !important;
                padding: 0 !important;
                border: 0 !important;
                color: var(--bs-secondary-color, #6c757d);
                font-size: .88em;
                line-height: 1.2;
                list-style: none !important;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kx-notice-cell > .kx-notice-meta-author strong {
                font-weight: 500;
            }

            /* La colonne exemplaires devient simplement un indicateur d'état. */
            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kxri-cell {
                width: 170px !important;
                min-width: 145px !important;
                text-align: right;
            }

            #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kxri-cell::before {
                content: attr(data-pmk055-local-status-label);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 1.55rem;
                padding: .12rem .48rem;
                border: 1px solid rgba(108,117,125,.30);
                border-radius: 999px;
                background: rgba(108,117,125,.08);
                color: var(--bs-secondary-color, #6c757d);
                font-size: .78rem;
                font-weight: 650;
                line-height: 1.15;
                white-space: nowrap;
            }

            @media (max-width: 768px) {
                #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td.bookcoverimg {
                    width: 40px !important;
                    min-width: 40px !important;
                }
                #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} > td.bookcoverimg img {
                    max-width: 28px !important;
                    max-height: 40px !important;
                }
                #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kxri-cell {
                    width: auto !important;
                    min-width: 0 !important;
                }
                #bookbag_form tbody tr.${LOCAL_EXCLUDED_CLASS}.${LOCAL_COLLAPSED_CLASS} .kxri-cell::before {
                    white-space: normal;
                    text-align: center;
                }
            }

            @media (max-width: 768px) {
                #pmk-search-quick-filters {
                    align-items: stretch;
                }

                #pmk-search-quick-filters .pmk-search-quick-filter {
                    flex: 1 1 12rem;
                }
                #search-facets .pmk055-facet-toggle {
                    min-height: 2.35rem;
                    padding: .52rem .2rem;
                }

                #search-facets .pmk055-choice-ui {
                    padding-top: .3rem;
                    padding-bottom: .3rem;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #search-facets .pmk055-facet-toggle-icon {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function effectiveLimitsFromUrl(input) {
        let url;
        try {
            url = input instanceof URL ? input : new URL(String(input || window.location.href), window.location.origin);
        } catch (_) {
            return [];
        }

        const limits = url.searchParams.getAll("limit");
        const noLimits = new Set(url.searchParams.getAll("nolimit"));
        return limits.filter(function (limit) {
            return !noLimits.has(limit);
        });
    }

    function currentEffectiveLimits() {
        return effectiveLimitsFromUrl(new URL(window.location.href));
    }

    function multisetDifference(left, right) {
        const counts = new Map();
        (right || []).forEach(function (value) {
            counts.set(value, (counts.get(value) || 0) + 1);
        });

        const diff = [];
        (left || []).forEach(function (value) {
            const count = counts.get(value) || 0;
            if (count > 0) counts.set(value, count - 1);
            else diff.push(value);
        });
        return diff;
    }

    function tokenToAddFromLink(link) {
        if (!link || !link.getAttribute) return "";
        try {
            const candidateUrl = new URL(link.getAttribute("href") || "", window.location.origin);
            const candidate = effectiveLimitsFromUrl(candidateUrl);
            const current = currentEffectiveLimits();
            const extras = multisetDifference(candidate, current);
            if (extras.length) return String(extras[extras.length - 1] || "");

            const rawLimits = candidateUrl.searchParams.getAll("limit");
            return rawLimits.length ? String(rawLimits[rawLimits.length - 1] || "") : "";
        } catch (_) {
            return "";
        }
    }

    function tokenToRemoveFromLink(link) {
        if (!link || !link.getAttribute) return "";
        try {
            const candidateUrl = new URL(link.getAttribute("href") || "", window.location.origin);
            const noLimits = candidateUrl.searchParams.getAll("nolimit");
            if (noLimits.length) return String(noLimits[noLimits.length - 1] || "");

            const current = currentEffectiveLimits();
            const candidate = effectiveLimitsFromUrl(candidateUrl);
            const removed = multisetDifference(current, candidate);
            return removed.length ? String(removed[removed.length - 1] || "") : "";
        } catch (_) {
            return "";
        }
    }

    function parseLimitToken(token) {
        const raw = String(token || "");
        const colon = raw.indexOf(":");
        if (colon <= 0) {
            return { raw: raw, valid: false, multi: false, index: "", qualifiers: [], operand: "" };
        }

        let head = raw.slice(0, colon);
        const operand = raw.slice(colon + 1);
        const multi = head.indexOf("mc-") === 0;
        if (multi) head = head.slice(3);

        const parts = head.split(",");
        const index = String(parts.shift() || "").trim();
        const qualifiers = parts
            .map(function (value) { return String(value || "").trim(); })
            .filter(Boolean);

        return {
            raw: raw,
            valid: Boolean(index && operand),
            multi: multi,
            index: index,
            qualifiers: qualifiers,
            operand: operand
        };
    }

    function facetGroupKey(token) {
        const parsed = parseLimitToken(token);
        return parsed.valid ? parsed.index : "";
    }

    function facetIdentity(token) {
        const parsed = parseLimitToken(token);
        if (!parsed.valid) return "";
        return parsed.index + ":" + parsed.operand;
    }

    function matchingCurrentLimit(token) {
        const identity = facetIdentity(token);
        if (!identity) return "";
        return currentEffectiveLimits().find(function (current) {
            return facetIdentity(current) === identity;
        }) || "";
    }

    function activeFacetGroupKeys() {
        const keys = new Set();
        currentEffectiveLimits().forEach(function (token) {
            const key = facetGroupKey(token);
            if (key) keys.add(key);
        });
        return Array.from(keys);
    }

    function toMultiChoiceLimit(token) {
        const parsed = parseLimitToken(token);
        if (!parsed.valid) return String(token || "");
        if (parsed.multi) return parsed.raw;

        const qualifiers = parsed.qualifiers.slice();

        // Les types de document sont historiquement transmis par Koha en
        // mc-itype,phr dans la recherche avancée. On conserve cette forme
        // lorsque le lien de facette natif ne porte pas déjà de qualificateur.
        if ((parsed.index === "itype" || parsed.index === "itemtype") && !qualifiers.length) {
            qualifiers.push("phr");
        }

        return "mc-" + parsed.index +
            (qualifiers.length ? "," + qualifiers.join(",") : "") +
            ":" + parsed.operand;
    }

    function normalizeMultiChoiceLimits(limits) {
        const unique = [];
        const seen = new Set();

        (limits || []).forEach(function (limit) {
            const token = String(limit || "");
            if (!token || seen.has(token)) return;
            seen.add(token);
            unique.push(token);
        });

        const groups = new Map();
        unique.forEach(function (token) {
            const key = facetGroupKey(token);
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(token);
        });

        const normalized = unique.map(function (token) {
            const key = facetGroupKey(token);
            const siblings = key ? (groups.get(key) || []) : [];
            return siblings.length > 1 ? toMultiChoiceLimit(token) : token;
        });

        const finalSeen = new Set();
        return normalized.filter(function (token) {
            if (finalSeen.has(token)) return false;
            finalSeen.add(token);
            return true;
        });
    }

    function buildResultUrl() {
        const url = new URL(window.location.href);
        let limits = effectiveLimitsFromUrl(url);

        limits = limits.filter(function (limit) {
            return !pendingRemoves.has(limit);
        });

        pendingAdds.forEach(function (limit) {
            if (!limits.includes(limit)) limits.push(limit);
        });

        // Dans une même facette, plusieurs valeurs élargissent le filtre (OU).
        // Des familles de facettes différentes restent combinées par Koha (ET).
        limits = normalizeMultiChoiceLimits(limits);

        url.searchParams.delete("limit");
        url.searchParams.delete("nolimit");

        limits.forEach(function (limit) {
            url.searchParams.append("limit", limit);
        });

        [
            "offset",
            "page",
            "searchid",
            "gotoPage",
            "gotoNumber"
        ].forEach(function (name) {
            url.searchParams.delete(name);
        });

        return url;
    }

    function buildClearFacetsUrl() {
        const url = new URL(window.location.href);

        // On retire uniquement les facettes. La requête catalogue, le tri et
        // les autres paramètres de recherche restent intacts.
        url.searchParams.delete("limit");
        url.searchParams.delete("nolimit");

        [
            "offset",
            "page",
            "searchid",
            "gotoPage",
            "gotoNumber"
        ].forEach(function (name) {
            url.searchParams.delete(name);
        });

        return url;
    }

    function loggedInBranchCode() {
        const element =
            document.querySelector(".logged-in-branch-code[data-logged-in-branch-code]") ||
            document.querySelector(".logged-in-branch-code");

        if (!element) return "";
        return String(
            element.getAttribute("data-logged-in-branch-code") ||
            element.dataset && element.dataset.loggedInBranchCode ||
            element.textContent ||
            ""
        ).trim();
    }

    function loggedInBranchName() {
        const element =
            document.querySelector(".logged-in-branch-name[data-logged-in-branch-name]") ||
            document.querySelector(".logged-in-branch-name");

        if (!element) return "";
        return String(
            element.getAttribute("data-logged-in-branch-name") ||
            element.dataset && element.dataset.loggedInBranchName ||
            element.textContent ||
            ""
        ).replace(/\s+/g, " ").trim();
    }

    function sameLimitIdentity(left, right) {
        const a = String(left || "");
        const b = String(right || "");
        if (!a || !b) return false;
        if (a === "available" || b === "available") return a === b;

        const aIdentity = facetIdentity(a);
        const bIdentity = facetIdentity(b);
        return Boolean(aIdentity && bIdentity && aIdentity === bIdentity);
    }

    function hasLimit(limits, token) {
        return (limits || []).some(function (current) {
            return sameLimitIdentity(current, token);
        });
    }

    function hydrateLocalAvailabilityState() {
        if (localAvailabilityHydrated) return;
        localAvailabilityHydrated = true;
        localAvailabilityActive = false;

        const localConfig = currentConfig.quickFilters && currentConfig.quickFilters.local
            ? currentConfig.quickFilters.local
            : DEFAULTS.quickFilters.local;

        if (!localConfig || localConfig.persistAcrossPages === false) {
            try { window.sessionStorage.removeItem(LOCAL_FILTER_STORAGE_KEY); } catch (_) {}
            return;
        }

        try {
            localAvailabilityActive = window.sessionStorage.getItem(LOCAL_FILTER_STORAGE_KEY) === "1";
        } catch (_) {
            localAvailabilityActive = false;
        }
    }

    function setLocalAvailabilityState(active) {
        localAvailabilityActive = Boolean(active);
        localAvailabilityHydrated = true;

        const localConfig = currentConfig.quickFilters && currentConfig.quickFilters.local
            ? currentConfig.quickFilters.local
            : DEFAULTS.quickFilters.local;

        try {
            if (localConfig && localConfig.persistAcrossPages !== false && localAvailabilityActive) {
                window.sessionStorage.setItem(LOCAL_FILTER_STORAGE_KEY, "1");
            } else {
                window.sessionStorage.removeItem(LOCAL_FILTER_STORAGE_KEY);
            }
        } catch (_) {}
    }

    function quickFilterState() {
        hydrateLocalAvailabilityState();
        const limits = currentEffectiveLimits();
        const hasAvailable = hasLimit(limits, "available");

        return {
            limits: limits,
            hasAvailable: hasAvailable,
            availabilityMode: hasAvailable,
            localAvailabilityMode: localAvailabilityActive
        };
    }

    function writeQuickFilterLimits(url, limits) {
        const normalized = normalizeMultiChoiceLimits(limits || []);

        url.searchParams.delete("limit");
        url.searchParams.delete("nolimit");
        normalized.forEach(function (limit) {
            url.searchParams.append("limit", limit);
        });

        ["offset", "page", "searchid", "gotoPage", "gotoNumber"].forEach(function (name) {
            url.searchParams.delete(name);
        });

        return url;
    }

    function withoutLimit(limits, token) {
        return (limits || []).filter(function (current) {
            return !sameLimitIdentity(current, token);
        });
    }

    function ensureLimit(limits, token) {
        const out = (limits || []).slice();
        if (token && !hasLimit(out, token)) out.push(token);
        return out;
    }

    function buildAvailabilityQuickFilterUrl(state) {
        const url = new URL(window.location.href);
        let limits = effectiveLimitsFromUrl(url);

        if (state.availabilityMode) {
            limits = withoutLimit(limits, "available");
        } else {
            limits = ensureLimit(limits, "available");
        }

        return writeQuickFilterLimits(url, limits);
    }

    function resultRows() {
        const form = document.getElementById("bookbag_form");
        if (!form) return [];
        return Array.from(form.querySelectorAll('tbody tr[id^="row"]'));
    }

    function normalizedText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function nativeAvailableItemMatchesLocal(item, branchCode, branchName) {
        if (!item) return false;

        if (branchCode) {
            try {
                if (item.classList && item.classList.contains(branchCode)) return true;
            } catch (_) {}

            const explicitCode = String(
                item.getAttribute("data-branchcode") ||
                item.getAttribute("data-branch-code") ||
                item.getAttribute("data-library-id") ||
                ""
            ).trim();
            if (explicitCode && explicitCode === branchCode) return true;
        }

        if (branchName) {
            const haystack = normalizedText(item.textContent);
            const needle = normalizedText(branchName);
            if (needle && haystack.includes(needle)) return true;
        }

        return false;
    }

    function rowHasLocalAvailableItem(row, branchCode, branchName) {
        if (!row) return false;

        // Fallback 129 : le moteur de présentation connaît déjà le statut et le site.
        if (row.querySelector(".kxri-item.is-local.is-available")) return true;

        // Source historique fiable : Koha place ici uniquement les exemplaires disponibles.
        // On vérifie ensuite que l'un de ces exemplaires appartient au site de connexion.
        const availableItems = Array.from(
            row.querySelectorAll("ul.available_items_loop_items li")
        );

        return availableItems.some(function (item) {
            return nativeAvailableItemMatchesLocal(item, branchCode, branchName);
        });
    }

    function ensureQuickFilterStatus(bar) {
        if (!bar) return null;
        let status = bar.querySelector(".pmk-search-quick-status");
        if (status) return status;

        status = document.createElement("span");
        status.className = "pmk-search-quick-status";
        status.setAttribute(GENERATED_ATTR, "1");
        status.setAttribute("aria-live", "polite");
        bar.appendChild(status);
        return status;
    }

    function updateLocalFilterStatus(bar, visible, total) {
        const status = ensureQuickFilterStatus(bar);
        if (!status) return;

        if (!localAvailabilityActive) {
            status.textContent = "";
            status.hidden = true;
            return;
        }

        status.hidden = false;
        status.textContent = language() === "en"
            ? visible + "/" + total + " record" + (total === 1 ? "" : "s") + " on this page · kept during pagination"
            : visible + "/" + total + " notice" + (total === 1 ? "" : "s") + " sur cette page · filtre conservé pendant la pagination";
    }

    function localResultDisplayMode() {
        const localConfig = currentConfig.quickFilters && currentConfig.quickFilters.local
            ? currentConfig.quickFilters.local
            : DEFAULTS.quickFilters.local;
        const mode = String((localConfig && localConfig.resultDisplay) || DEFAULTS.quickFilters.local.resultDisplay);
        return ["hidden", "dimmed", "collapsed", "dimmed-bottom"].includes(mode) ? mode : "dimmed";
    }

    function localCompactTitleLink(row) {
        if (!row) return null;
        return row.querySelector(
            'a.title[href], .title a[href], a[href*="/cgi-bin/koha/catalogue/detail.pl?biblionumber="], a[href*="catalogue/detail.pl?biblionumber="]'
        );
    }

    function localCompactAuthorText(row) {
        if (!row) return "";
        const selectors = [
            '.author',
            '.results_summary.author',
            '.results_summary .author',
            '[class*="author"]'
        ];
        for (const selector of selectors) {
            const node = row.querySelector(selector);
            if (!node) continue;
            const value = String(node.textContent || "")
                .replace(/^\s*(?:Auteur|Author)\s*:\s*/i, "")
                .replace(/\s+/g, " ")
                .trim();
            if (value) return value;
        }
        return "";
    }

    function ensureLocalCompactRow(row) {
        if (!row) return;
        let compactCell = directChild(row, "." + LOCAL_COMPACT_CELL_CLASS);
        if (compactCell) return;

        const originalCells = directChildren(row, "td");
        if (!originalCells.length) return;
        originalCells.forEach(function (cell) {
            cell.classList.add(LOCAL_ORIGINAL_CELL_CLASS);
        });

        compactCell = document.createElement("td");
        compactCell.className = LOCAL_COMPACT_CELL_CLASS;
        compactCell.setAttribute(GENERATED_ATTR, "1");
        compactCell.colSpan = Math.max(1, originalCells.reduce(function (sum, cell) {
            return sum + Math.max(1, Number(cell.colSpan) || 1);
        }, 0));

        const wrap = document.createElement("div");
        wrap.className = "pmk055-local-compact-wrap";

        const main = document.createElement("div");
        main.className = "pmk055-local-compact-main";

        const title = document.createElement("span");
        title.className = "pmk055-local-compact-title";
        const sourceLink = localCompactTitleLink(row);
        if (sourceLink) {
            const link = document.createElement("a");
            link.href = sourceLink.href;
            link.textContent = String(sourceLink.textContent || "").replace(/\s+/g, " ").trim() || t("Notice", "Record");
            title.appendChild(link);
        } else {
            const fallback = String(row.textContent || "").replace(/\s+/g, " ").trim();
            title.textContent = fallback.slice(0, 180) || t("Notice", "Record");
        }
        main.appendChild(title);

        const authorText = localCompactAuthorText(row);
        if (authorText) {
            const author = document.createElement("span");
            author.className = "pmk055-local-compact-author";
            author.textContent = authorText;
            main.appendChild(author);
        }

        const state = document.createElement("span");
        state.className = "pmk055-local-compact-state";
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-location-dot";
        icon.setAttribute("aria-hidden", "true");
        state.appendChild(icon);
        state.appendChild(document.createTextNode(t("Non disponible ici", "Not available here")));

        wrap.appendChild(main);
        wrap.appendChild(state);
        compactCell.appendChild(wrap);
        row.appendChild(compactCell);
    }

    function removeLocalCompactRow(row) {
        if (!row) return;
        directChildren(row, "." + LOCAL_COMPACT_CELL_CLASS).forEach(function (cell) { cell.remove(); });
        directChildren(row, "td." + LOCAL_ORIGINAL_CELL_CLASS).forEach(function (cell) {
            cell.classList.remove(LOCAL_ORIGINAL_CELL_CLASS);
        });
        const itemCell = row.querySelector(".kxri-cell") || directChildren(row, "td").slice(-1)[0];
        if (itemCell) itemCell.removeAttribute("data-pmk055-local-status-label");
    }

    function prepareLocalCollapsedRow(row) {
        if (!row) return;
        const itemCell = row.querySelector(".kxri-cell") || directChildren(row, "td").slice(-1)[0];
        if (itemCell) {
            itemCell.setAttribute(
                "data-pmk055-local-status-label",
                t("Non disponible ici", "Not available here")
            );
        }
    }

    function clearLocalRowPresentation(rows, restoreOrder) {
        (rows || []).forEach(function (row) {
            row.classList.remove(LOCAL_HIDDEN_CLASS, LOCAL_DIMMED_CLASS, LOCAL_COLLAPSED_CLASS, LOCAL_EXCLUDED_CLASS);
            removeLocalCompactRow(row);
        });

        if (restoreOrder) {
            const grouped = new Map();
            (rows || []).forEach(function (row) {
                const parent = row.parentNode;
                if (!parent) return;
                if (!grouped.has(parent)) grouped.set(parent, []);
                grouped.get(parent).push(row);
            });
            grouped.forEach(function (groupRows, parent) {
                groupRows
                    .slice()
                    .sort(function (a, b) {
                        return Number(a.getAttribute(LOCAL_ORIGINAL_INDEX_ATTR) || 0) - Number(b.getAttribute(LOCAL_ORIGINAL_INDEX_ATTR) || 0);
                    })
                    .forEach(function (row) { parent.appendChild(row); });
            });
        }
    }

    function applyLocalRowPresentation(row, keep, mode) {
        row.classList.remove(LOCAL_HIDDEN_CLASS, LOCAL_DIMMED_CLASS, LOCAL_COLLAPSED_CLASS, LOCAL_EXCLUDED_CLASS);
        removeLocalCompactRow(row);
        if (keep) return;
        row.classList.add(LOCAL_EXCLUDED_CLASS);
        if (mode === "hidden") {
            row.classList.add(LOCAL_HIDDEN_CLASS);
        } else if (mode === "collapsed") {
            prepareLocalCollapsedRow(row);
            row.classList.add(LOCAL_COLLAPSED_CLASS);
        } else {
            row.classList.add(LOCAL_DIMMED_CLASS);
        }
    }

    function applyLocalAvailabilityFilter() {
        const rows = resultRows();
        const bar = document.getElementById("pmk-search-quick-filters");

        if (!rows.length) {
            updateLocalFilterStatus(bar, 0, 0);
            return { visible: 0, total: 0 };
        }

        rows.forEach(function (row, index) {
            if (!row.hasAttribute(LOCAL_ORIGINAL_INDEX_ATTR)) {
                row.setAttribute(LOCAL_ORIGINAL_INDEX_ATTR, String(index));
            }
        });

        if (!localAvailabilityActive) {
            clearLocalRowPresentation(rows, true);
            updateLocalFilterStatus(bar, rows.length, rows.length);
            return { visible: rows.length, total: rows.length };
        }

        const branchCode = loggedInBranchCode();
        const branchName = loggedInBranchName();

        if (!branchCode && !branchName) {
            clearLocalRowPresentation(rows, true);
            setLocalAvailabilityState(false);
            updateLocalFilterStatus(bar, rows.length, rows.length);
            return { visible: rows.length, total: rows.length };
        }

        let visible = 0;
        const mode = localResultDisplayMode();
        const keptRows = [];
        const excludedRows = [];

        rows.forEach(function (row) {
            const keep = rowHasLocalAvailableItem(row, branchCode, branchName);
            applyLocalRowPresentation(row, keep, mode);
            if (keep) {
                visible += 1;
                keptRows.push(row);
            } else {
                excludedRows.push(row);
            }
        });

        if (mode === "dimmed-bottom" && rows.length) {
            const parent = rows[0].parentNode;
            if (parent) keptRows.concat(excludedRows).forEach(function (row) { parent.appendChild(row); });
        } else {
            clearLocalRowPresentation([], false);
        }

        updateLocalFilterStatus(bar, visible, rows.length);
        return { visible: visible, total: rows.length };
    }

    function scheduleLocalAvailabilityFilter() {
        if (localFilterScheduled) return;
        localFilterScheduled = true;
        window.requestAnimationFrame(function () {
            localFilterScheduled = false;
            applyLocalAvailabilityFilter();
        });
    }

    function installLocalResultsObserver() {
        if (localResultsObserver) return;
        const form = document.getElementById("bookbag_form");
        if (!form) return;

        localResultsObserver = new MutationObserver(function () {
            if (!localAvailabilityActive) return;
            scheduleLocalAvailabilityFilter();
        });

        localResultsObserver.observe(form, {
            childList: true,
            subtree: true
        });
    }

    function stopLocalResultsObserver() {
        if (localResultsObserver) {
            try { localResultsObserver.disconnect(); } catch (_) {}
            localResultsObserver = null;
        }
        localFilterScheduled = false;
    }

    function ensureQuickFiltersBar(root) {
        let bar = document.getElementById("pmk-search-quick-filters");
        if (bar) return bar;

        bar = document.createElement("div");
        bar.id = "pmk-search-quick-filters";
        bar.className = "pmk-search-quick-filters";
        bar.setAttribute("role", "group");
        bar.setAttribute("aria-label", t("Filtres rapides", "Quick filters"));

        if (root && root.parentNode) root.parentNode.insertBefore(bar, root);
        return bar;
    }

    function quickFilterLabel(kind, active, available) {
        const config = currentConfig.quickFilters && currentConfig.quickFilters[kind]
            ? currentConfig.quickFilters[kind]
            : DEFAULTS.quickFilters[kind];

        if (available === false) {
            return language() === "en" ? config.unavailableLabelEn : config.unavailableLabelFr;
        }
        if (language() === "en") {
            return active ? config.activeLabelEn : config.labelEn;
        }
        return active ? config.activeLabelFr : config.labelFr;
    }

    function createQuickFilterButton(bar, kind, active, options) {
        const config = currentConfig.quickFilters && currentConfig.quickFilters[kind]
            ? currentConfig.quickFilters[kind]
            : DEFAULTS.quickFilters[kind];
        if (!config || config.enabled === false) return null;

        const available = options.available !== false;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "filter-button pmk-search-quick-filter btn btn-sm " +
            (active ? "btn-primary" : "btn-outline-secondary");
        button.setAttribute(GENERATED_ATTR, "1");
        button.setAttribute("data-pmk-quick-filter", kind);
        button.setAttribute("aria-pressed", active ? "true" : "false");

        const icon = document.createElement("i");
        icon.className = options.icon;
        icon.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        text.textContent = quickFilterLabel(kind, active, available);

        button.appendChild(icon);
        button.appendChild(text);

        if (!available) {
            button.disabled = true;
            button.title = options.unavailableTitle || t(
                "Ce filtre n’est pas disponible sur cette page.",
                "This filter is not available on this page."
            );
        } else {
            button.title = active ? options.activeTitle : options.inactiveTitle;
            button.addEventListener("click", function () {
                if (button.disabled) return;

                if (typeof options.onClick === "function") {
                    options.onClick(button);
                    return;
                }

                button.disabled = true;
                const target = options.buildUrl();
                window.location.assign(target.toString());
            });
        }

        if (options.prepend && bar.firstChild) bar.insertBefore(button, bar.firstChild);
        else bar.appendChild(button);
        return button;
    }

    function mountQuickFilters(root) {
        const quick = currentConfig.quickFilters || DEFAULTS.quickFilters;
        if (
            (!quick.availability || quick.availability.enabled === false) &&
            (!quick.local || quick.local.enabled === false)
        ) return;

        const bar = ensureQuickFiltersBar(root);
        if (!bar) return;

        // La barre appartient entièrement au 055 : la reconstruire évite tout doublon.
        bar.replaceChildren();

        const branchCode = loggedInBranchCode();
        const branchName = loggedInBranchName();
        const localDetectionAvailable = Boolean(branchCode || branchName);
        let state = quickFilterState();

        if (!localDetectionAvailable && state.localAvailabilityMode) {
            setLocalAvailabilityState(false);
            state = quickFilterState();
        }

        const activeQuickFilterCount =
            (state.availabilityMode ? 1 : 0) +
            (state.localAvailabilityMode ? 1 : 0);
        bar.classList.toggle("pmk055-has-active-quick-filter", activeQuickFilterCount > 0);

        if (activeQuickFilterCount > 0) {
            const badge = document.createElement("span");
            badge.className = "pmk055-quick-active-count";
            badge.setAttribute(GENERATED_ATTR, "1");
            badge.textContent = language() === "en"
                ? activeQuickFilterCount + " quick filter" + (activeQuickFilterCount > 1 ? "s" : "") + " active"
                : activeQuickFilterCount + " filtre" + (activeQuickFilterCount > 1 ? "s" : "") + " rapide" + (activeQuickFilterCount > 1 ? "s" : "") + " actif" + (activeQuickFilterCount > 1 ? "s" : "");
            bar.appendChild(badge);
        }

        if (quick.availability && quick.availability.enabled !== false) {
            createQuickFilterButton(bar, "availability", state.availabilityMode, {
                prepend: true,
                icon: "fa-solid fa-circle-check",
                buildUrl: function () { return buildAvailabilityQuickFilterUrl(state); },
                inactiveTitle: t(
                    "Limiter la recherche complète aux notices ayant au moins un exemplaire disponible dans le réseau.",
                    "Limit the full search to records with at least one available item anywhere in the network."
                ),
                activeTitle: t(
                    "Retirer uniquement le filtre « Disponibles uniquement ».",
                    "Remove only the “Available only” filter."
                )
            });
        }

        if (quick.local && quick.local.enabled !== false) {
            createQuickFilterButton(bar, "local", state.localAvailabilityMode, {
                icon: "fa-solid fa-location-dot",
                available: localDetectionAvailable,
                onClick: function () {
                    setLocalAvailabilityState(!localAvailabilityActive);
                    applyLocalAvailabilityFilter();
                    mountQuickFilters(root);
                    applyLocalAvailabilityFilter();
                },
                inactiveTitle: branchName
                    ? t(
                        "Conserver uniquement les notices ayant un exemplaire réellement disponible à " + branchName + ". Le mode reste actif en changeant de page de résultats.",
                        "Keep only records with an actually available item at " + branchName + ". The mode stays active when moving through result pages."
                    )
                    : t(
                        "Conserver uniquement les notices ayant un exemplaire réellement disponible dans le site connecté. Le mode reste actif pendant la pagination.",
                        "Keep only records with an actually available item at the logged-in library. The mode stays active during pagination."
                    ),
                activeTitle: t(
                    "Retirer uniquement le filtre local « Disponibles ici uniquement ».",
                    "Remove only the local “Available here only” filter."
                ),
                unavailableTitle: t(
                    "Le site connecté n’a pas pu être détecté dans l’en-tête Koha.",
                    "The logged-in library could not be detected in the Koha header."
                )
            });
        }

        updateLocalFilterStatus(bar, 0, resultRows().length);
    }

    function cleanupQuickFiltersBar() {
        const bar = document.getElementById("pmk-search-quick-filters");
        if (bar && !bar.children.length) bar.remove();
    }

    function appliedFacetCount() {
        return currentEffectiveLimits().length;
    }

    function nativeLabelText(container) {
        if (!container) return "";
        const cloneNode = container.cloneNode(true);
        cloneNode.querySelectorAll("a").forEach(function (a) { a.remove(); });
        return String(cloneNode.textContent || "").replace(/\s+/g, " ").trim();
    }

    function analyzeChoiceLi(li) {
        if (!li || li.classList.contains("moretoggle")) return null;

        const anchors = Array.from(li.querySelectorAll("a[href]"));
        const removeLink = anchors.find(function (link) {
            try {
                const url = new URL(link.getAttribute("href") || "", window.location.origin);
                return url.searchParams.getAll("nolimit").length > 0;
            } catch (_) {
                return false;
            }
        });

        if (removeLink) {
            const token = tokenToRemoveFromLink(removeLink);
            if (!token) return null;

            const labelNode =
                li.querySelector(".facet-label") ||
                li.querySelector(".filter_label") ||
                li.querySelector("span");

            const label = nativeLabelText(labelNode) ||
                String((labelNode && labelNode.textContent) || "").replace(/\s+/g, " ").trim() ||
                token;

            const count = String((li.querySelector(".facet-count") || {}).textContent || "").trim();

            return {
                active: true,
                token: token,
                label: label.replace(/\[\s*x\s*\]\s*$/i, "").trim(),
                count: count
            };
        }

        const addLink =
            li.querySelector(".facet-label a[href]") ||
            li.querySelector(".filter_label a[href]") ||
            anchors.find(function (link) {
                return Boolean(tokenToAddFromLink(link));
            });

        if (!addLink) return null;

        const token = tokenToAddFromLink(addLink);
        if (!token) return null;

        const currentToken = matchingCurrentLimit(token);

        const labelNode =
            li.querySelector(".facet-label") ||
            li.querySelector(".filter_label");

        const label =
            String((labelNode && labelNode.textContent) || addLink.textContent || "")
                .replace(/\s+/g, " ")
                .trim();

        const count = String((li.querySelector(".facet-count") || {}).textContent || "").trim();

        return {
            active: Boolean(currentToken),
            token: currentToken || token,
            label: label || token,
            count: count
        };
    }

    function wrapDirectTextNodes(element, className) {
        Array.from(element.childNodes || []).forEach(function (node) {
            if (node.nodeType !== Node.TEXT_NODE) return;
            if (!String(node.nodeValue || "").trim()) return;

            const span = document.createElement("span");
            span.setAttribute(NATIVE_TEXT_ATTR, "1");
            span.className = className || "";
            span.textContent = node.nodeValue;
            node.replaceWith(span);
        });
    }

    function ensureListId(list) {
        if (list.id) return list.id;
        tempIdCounter += 1;
        list.id = "pmk055-facet-list-" + tempIdCounter;
        list.setAttribute(TEMP_ID_ATTR, "1");
        return list.id;
    }

    function groupLabel(group) {
        const nativeHeading = directChildren(group, "span,h5,h6,strong").find(function (node) {
            return !node.classList.contains("pmk055-choice-ui");
        });

        if (nativeHeading) {
            const label = String(nativeHeading.textContent || "").replace(/\s+/g, " ").trim();
            if (label) return label;
        }

        const textNode = Array.from(group.childNodes || []).find(function (node) {
            return node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim();
        });

        return textNode ? String(textNode.nodeValue || "").replace(/\s+/g, " ").trim() : "";
    }

    function normalizeComparableLabel(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function groupTechnicalKey(group) {
        const identity = facetGroupIdentity(group);
        return identity.indexOf("facet:") === 0 ? identity.slice(6) : "";
    }

    function matchingRenameRule(group, nativeLabel) {
        const rules = Array.isArray(currentConfig.groupRenames) ? currentConfig.groupRenames : [];
        const labelKey = normalizeComparableLabel(nativeLabel);
        const technicalKey = groupTechnicalKey(group);

        return rules.find(function (rule) {
            if (!rule || rule.enabled === false) return false;

            const configuredKey = String(rule.groupKey || "").trim();
            const configuredLabel = normalizeComparableLabel(rule.sourceLabel);

            if (configuredKey && technicalKey && configuredKey === technicalKey) return true;
            return Boolean(configuredLabel && labelKey && configuredLabel === labelKey);
        }) || null;
    }

    function displayGroupLabel(group) {
        const nativeLabel = groupLabel(group);
        const rule = matchingRenameRule(group, nativeLabel);
        if (!rule) return { text: nativeLabel, renamed: false };

        const wanted = language() === "en"
            ? String(rule.en || rule.fr || "").trim()
            : String(rule.fr || rule.en || "").trim();

        return {
            text: wanted || nativeLabel,
            renamed: Boolean(wanted && wanted !== nativeLabel)
        };
    }

    function applyStandaloneRenamedHeading(group, label) {
        if (!group || !label) return;

        markNativeGroupHeading(group);

        const heading = document.createElement("span");
        heading.className = "pmk055-renamed-heading";
        heading.setAttribute(GENERATED_ATTR, "1");
        heading.textContent = label;

        const list = directChild(group, "ul");
        if (list) group.insertBefore(heading, list);
        else group.insertBefore(heading, group.firstChild);
    }

    function markNativeGroupHeading(group) {
        directChildren(group, "span,h5,h6,strong").forEach(function (node) {
            node.classList.add("pmk055-native-heading");
        });

        wrapDirectTextNodes(group, "pmk055-native-heading");
    }

    function groupHasActiveFacet(group) {
        if (!group) return false;
        if (group.id === "availability_facet") {
            return currentEffectiveLimits().includes("available");
        }

        return Array.from(group.querySelectorAll("a[href]")).some(function (link) {
            return Boolean(tokenToRemoveFromLink(link));
        });
    }

    function makeToggleButton(group, list, label, open) {
        const stateKey = facetGroupIdentity(group);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pmk055-facet-toggle";
        button.setAttribute(GENERATED_ATTR, "1");
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.setAttribute("aria-controls", ensureListId(list));

        const main = document.createElement("span");
        main.className = "pmk055-facet-toggle-main";

        const text = document.createElement("span");
        text.textContent = label || t("Filtre", "Filter");
        main.appendChild(text);
        button.appendChild(main);

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-chevron-right pmk055-facet-toggle-icon";
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);

        button.addEventListener("click", function () {
            const nextOpen = !group.classList.contains("pmk055-open");
            group.classList.toggle("pmk055-open", nextOpen);
            button.setAttribute("aria-expanded", nextOpen ? "true" : "false");

            // Le choix explicite de l'agent prime sur l'état initial et sur
            // l'ouverture automatique des groupes actifs tant que la page
            // courante n'est pas réellement rechargée.
            if (stateKey) drawerStateOverrides.set(stateKey, nextOpen);
        });

        group.insertBefore(button, group.firstChild);
    }

    function markNativeChoice(li, generatedUi) {
        Array.from(li.childNodes || []).forEach(function (node) {
            if (node === generatedUi) return;

            if (node.nodeType === Node.TEXT_NODE) {
                if (!String(node.nodeValue || "").trim()) return;
                const span = document.createElement("span");
                span.setAttribute(NATIVE_TEXT_ATTR, "1");
                span.className = "pmk055-native-choice";
                span.textContent = node.nodeValue;
                node.replaceWith(span);
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                node.classList.add("pmk055-native-choice");
            }
        });
    }

    function setPendingState(ui, input, active, token) {
        const checked = input.checked;

        if (active) {
            if (checked) pendingRemoves.delete(token);
            else pendingRemoves.add(token);
            pendingAdds.delete(token);
        } else {
            if (checked) pendingAdds.add(token);
            else pendingAdds.delete(token);
            pendingRemoves.delete(token);
        }

        const changed = (active && !checked) || (!active && checked);
        ui.classList.toggle("pmk055-pending", changed);
        ui.classList.toggle("pmk055-selected", checked);

        if (currentConfig.multiSelect) {
            refreshPendingUi();
        } else if (changed) {
            window.location.assign(buildResultUrl().toString());
        }
    }

    function createChoiceUi(li, choice) {
        const ui = document.createElement("label");
        ui.className = "pmk055-choice-ui";
        ui.setAttribute(GENERATED_ATTR, "1");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "form-check-input";
        input.checked = choice.active === true;
        input.setAttribute("aria-label", choice.label || choice.token);
        ui.classList.toggle("pmk055-selected", input.checked);
        if (currentConfig.highlightActiveFacets) {
            ui.classList.toggle("pmk055-active", choice.active === true);
        }

        const text = document.createElement("span");
        text.className = "pmk055-choice-label";
        text.textContent = choice.label || choice.token;

        ui.appendChild(input);
        ui.appendChild(text);

        if (choice.count) {
            const count = document.createElement("span");
            count.className = "pmk055-choice-count";
            count.textContent = choice.count;
            ui.appendChild(count);
        }

        if (currentConfig.highlightActiveFacets && choice.active === true) {
            const badge = document.createElement("span");
            badge.className = "pmk055-active-badge";
            badge.textContent = t("Actif", "Active");
            ui.appendChild(badge);
        }

        input.addEventListener("change", function () {
            setPendingState(ui, input, choice.active === true, choice.token);
        });

        li.insertBefore(ui, li.firstChild);
        markNativeChoice(li, ui);
    }

    function updateGroupActiveIndicator(group) {
        if (!currentConfig.highlightActiveFacets || !group) return;
        const button = directChild(group, ".pmk055-facet-toggle");
        if (!button) return;

        const main = button.querySelector(".pmk055-facet-toggle-main");
        if (!main) return;

        const old = main.querySelector(".pmk055-group-active-count");
        if (old) old.remove();

        const count = group.querySelectorAll(".pmk055-choice-ui.pmk055-active").length;
        if (!count) return;

        const badge = document.createElement("span");
        badge.className = "pmk055-group-active-count";
        badge.textContent = language() === "en"
            ? count + " active"
            : count + " actif" + (count > 1 ? "s" : "");
        main.appendChild(badge);
    }

    function groupContainsFacetKey(group, key) {
        if (!group || !key) return false;
        return Array.from(group.querySelectorAll("a[href]")).some(function (link) {
            try {
                const url = new URL(link.getAttribute("href") || "", window.location.origin);
                const tokens = url.searchParams.getAll("limit").concat(url.searchParams.getAll("nolimit"));
                return tokens.some(function (token) {
                    return facetGroupKey(token) === key;
                });
            } catch (_) {
                return false;
            }
        });
    }

    function findFacetGroupByKey(root, key) {
        if (!root || !key) return null;
        const mainList = directChild(root, "ul");
        if (!mainList) return null;
        return directChildren(mainList, "li").find(function (group) {
            return groupContainsFacetKey(group, key);
        }) || null;
    }

    function normalizedGroupLabel(group) {
        return String(groupLabel(group) || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function facetGroupIdentity(group) {
        if (!group) return "";

        if (group.id === "availability_facet") {
            return "id:availability_facet";
        }

        const keys = new Set();
        Array.from(group.querySelectorAll("a[href]")).forEach(function (link) {
            try {
                const url = new URL(link.getAttribute("href") || "", window.location.origin);
                url.searchParams.getAll("limit")
                    .concat(url.searchParams.getAll("nolimit"))
                    .forEach(function (token) {
                        const key = facetGroupKey(token);
                        if (key) keys.add(key);
                    });
            } catch (_) {}
        });

        if (keys.size === 1) {
            return "facet:" + Array.from(keys)[0];
        }

        const label = normalizedGroupLabel(group);
        return label ? "label:" + label : "";
    }

    function nativeChoiceIdentity(li) {
        if (!li || li.classList.contains("moretoggle")) return "";

        const choice = analyzeChoiceLi(li);
        if (choice && choice.token) {
            const identity = facetIdentity(choice.token);
            if (identity) return "facet:" + identity;
            return "token:" + String(choice.token);
        }

        return "text:" + String(li.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function mergeDuplicateGroupInto(primary, duplicate) {
        if (!primary || !duplicate || primary === duplicate) return;

        const primaryList = directChild(primary, "ul");
        const duplicateList = directChild(duplicate, "ul");

        if (primaryList && duplicateList) {
            const known = new Set(
                directChildren(primaryList, "li")
                    .map(nativeChoiceIdentity)
                    .filter(Boolean)
            );

            directChildren(duplicateList, "li").forEach(function (li) {
                if (li.classList.contains("moretoggle")) return;
                const identity = nativeChoiceIdentity(li);
                if (identity && known.has(identity)) return;
                if (identity) known.add(identity);
                primaryList.appendChild(li.cloneNode(true));
            });
        }

        duplicate.remove();
    }

    function deduplicateFacetGroups(root) {
        if (!root) return 0;
        const mainList = directChild(root, "ul");
        if (!mainList) return 0;

        const seen = new Map();
        let removed = 0;

        directChildren(mainList, "li").forEach(function (group) {
            const identity = facetGroupIdentity(group);
            if (!identity) return;

            if (!seen.has(identity)) {
                seen.set(identity, group);
                return;
            }

            mergeDuplicateGroupInto(seen.get(identity), group);
            removed += 1;
        });

        return removed;
    }

    function buildFacetRefreshUrl(excludedKey) {
        const url = new URL(window.location.href);
        const limits = effectiveLimitsFromUrl(url).filter(function (token) {
            return facetGroupKey(token) !== excludedKey;
        });

        url.searchParams.delete("limit");
        url.searchParams.delete("nolimit");
        limits.forEach(function (token) {
            url.searchParams.append("limit", token);
        });

        ["offset", "page", "searchid", "gotoPage", "gotoNumber"].forEach(function (name) {
            url.searchParams.delete(name);
        });

        return url;
    }

    function setRefreshStatus(refreshing) {
        const root = document.getElementById("search-facets");
        if (!root) return;
        const bar = root.querySelector(".pmk055-actions");
        if (!bar) return;
        bar.classList.toggle("is-refreshing", Boolean(refreshing));
        const status = bar.querySelector(".pmk055-actions-status");
        if (refreshing && status) {
            status.textContent = t(
                "Recalcul des choix disponibles dans les facettes actives…",
                "Refreshing available choices in active facets…"
            );
        } else if (!refreshing) {
            refreshPendingUi();
        }
    }

    async function recalculateActiveFacetFamilies(root) {
        if (!currentConfig.multiSelect || !currentConfig.recalculateActiveFacets) return;
        if (!root || facetRefreshInProgress) return;

        const keys = activeFacetGroupKeys();
        if (!keys.length) return;

        const signature = window.location.href + "|" + keys.join(",");
        if (lastFacetRefreshSignature === signature) return;
        lastFacetRefreshSignature = signature;
        facetRefreshInProgress = true;
        setRefreshStatus(true);

        let changed = false;

        try {
            for (const key of keys) {
                const currentGroup = findFacetGroupByKey(root, key);
                if (!currentGroup) continue;

                try {
                    const response = await fetch(buildFacetRefreshUrl(key).toString(), {
                        credentials: "same-origin",
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    });
                    if (!response.ok) continue;

                    const html = await response.text();
                    const parsed = new DOMParser().parseFromString(html, "text/html");
                    const freshRoot = parsed.getElementById("search-facets");
                    if (!freshRoot) continue;

                    const freshGroup = findFacetGroupByKey(freshRoot, key);
                    if (!freshGroup) continue;

                    const currentList = directChild(currentGroup, "ul");
                    const freshList = directChild(freshGroup, "ul");
                    if (!currentList || !freshList) continue;

                    // On rafraîchit uniquement le contenu du groupe. Remplacer
                    // l'enveloppe <li> complète peut provoquer des groupes
                    // dupliqués lors d'un second passage du module.
                    const fragment = document.createDocumentFragment();
                    Array.from(freshList.childNodes || []).forEach(function (node) {
                        fragment.appendChild(document.importNode(node, true));
                    });
                    currentList.replaceChildren(fragment);
                    changed = true;
                } catch (_) {
                    // Une facette qui ne peut pas être recalculée conserve le rendu Koha courant.
                }
            }
        } finally {
            facetRefreshInProgress = false;
        }

        if (changed) {
            // On repart du DOM natif avant de reconstruire l'UI PMK, puis on
            // élimine toute éventuelle duplication de groupes.
            restore();
            const refreshedRoot = document.getElementById("search-facets");
            if (refreshedRoot) {
                deduplicateFacetGroups(refreshedRoot);
                enhanceRoot(refreshedRoot);
            }
        } else {
            setRefreshStatus(false);
        }
    }

    function enhanceAvailability(group, list) {
        const current = currentEffectiveLimits();
        const active = current.includes("available");

        const nativeLis = directChildren(list, "li");
        nativeLis.forEach(function (li) {
            li.classList.add("pmk055-native-choice");
        });

        const generatedLi = document.createElement("li");
        generatedLi.setAttribute(GENERATED_ATTR, "1");

        const choice = {
            active: active,
            token: "available",
            label: t("Disponibles uniquement", "Available items only"),
            count: ""
        };

        createChoiceUi(generatedLi, choice);
        list.insertBefore(generatedLi, list.firstChild);
    }

    function enhanceChoices(group, list) {
        if (!currentConfig.multiSelect) return;

        if (group.id === "availability_facet") {
            enhanceAvailability(group, list);
            return;
        }

        directChildren(list, "li").forEach(function (li) {
            if (li.classList.contains("moretoggle")) return;
            const choice = analyzeChoiceLi(li);
            if (!choice) return;
            createChoiceUi(li, choice);
        });
    }

    function restorePendingChoices(root) {
        pendingAdds.clear();
        pendingRemoves.clear();

        root.querySelectorAll(".pmk055-choice-ui").forEach(function (ui) {
            const input = ui.querySelector('input[type="checkbox"]');
            if (!input) return;

            const li = ui.closest("li");
            if (!li) return;

            if (li.parentElement && li.parentElement.parentElement &&
                li.parentElement.parentElement.id === "availability_facet") {
                input.checked = currentEffectiveLimits().includes("available");
            } else {
                const original = Array.from(li.querySelectorAll("a[href]"));
                const isActive = original.some(function (link) {
                    return Boolean(tokenToRemoveFromLink(link));
                });
                input.checked = isActive;
            }

            ui.classList.remove("pmk055-pending");
            ui.classList.toggle("pmk055-selected", input.checked);
        });

        refreshPendingUi();
    }

    function makeActionBar(root) {
        if (!currentConfig.multiSelect) return;

        const bar = document.createElement("div");
        bar.className = "pmk055-actions";
        bar.setAttribute(GENERATED_ATTR, "1");

        const status = document.createElement("span");
        status.className = "pmk055-actions-status";
        status.setAttribute("aria-live", "polite");

        const buttons = document.createElement("div");
        buttons.className = "pmk055-actions-buttons";

        const apply = document.createElement("button");
        apply.type = "button";
        apply.className = "btn btn-sm btn-primary pmk055-apply";
        apply.innerHTML = '<i class="fa-solid fa-filter" aria-hidden="true"></i> <span></span>';
        apply.querySelector("span").textContent = t("Appliquer", "Apply");
        apply.addEventListener("click", function () {
            if (!pendingAdds.size && !pendingRemoves.size) return;
            apply.disabled = true;
            apply.querySelector("span").textContent = t("Application…", "Applying…");
            window.location.assign(buildResultUrl().toString());
        });

        const cancelPending = document.createElement("button");
        cancelPending.type = "button";
        cancelPending.className = "btn btn-sm btn-default pmk055-cancel-pending";
        cancelPending.innerHTML = '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i> <span></span>';
        cancelPending.querySelector("span").textContent = t(
            "Annuler les modifications",
            "Cancel changes"
        );
        cancelPending.title = t(
            "Rétablit les cases telles qu’elles sont réellement appliquées à la recherche.",
            "Restores the checkboxes to the filters actually applied to the search."
        );
        cancelPending.addEventListener("click", function () {
            restorePendingChoices(root);
        });

        const clearAll = document.createElement("button");
        clearAll.type = "button";
        clearAll.className = "btn btn-sm btn-default pmk055-clear-all";
        clearAll.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> <span></span>';
        clearAll.querySelector("span").textContent = t(
            "Effacer les filtres",
            "Clear filters"
        );
        clearAll.title = t(
            "Retire toutes les facettes appliquées à cette recherche, y compris après rechargement.",
            "Removes all facets applied to this search, including after a page reload."
        );
        clearAll.addEventListener("click", function () {
            const hasApplied = appliedFacetCount() > 0;

            pendingAdds.clear();
            pendingRemoves.clear();

            if (!hasApplied) {
                restorePendingChoices(root);
                return;
            }

            clearAll.disabled = true;
            clearAll.querySelector("span").textContent = t("Effacement…", "Clearing…");
            window.location.assign(buildClearFacetsUrl().toString());
        });

        buttons.appendChild(apply);
        buttons.appendChild(cancelPending);
        buttons.appendChild(clearAll);
        bar.appendChild(status);
        bar.appendChild(buttons);

        const title = directChild(root, "h4,h3,h2");
        if (title) title.insertAdjacentElement("afterend", bar);
        else root.insertBefore(bar, root.firstChild);

        refreshPendingUi();
    }

    function refreshPendingUi() {
        const root = document.getElementById("search-facets");
        if (!root) return;

        const bar = root.querySelector(".pmk055-actions");
        if (!bar) return;

        const count = pendingAdds.size + pendingRemoves.size;
        const applied = appliedFacetCount();
        const status = bar.querySelector(".pmk055-actions-status");
        const apply = bar.querySelector(".pmk055-apply");
        const cancelPending = bar.querySelector(".pmk055-cancel-pending");
        const clearAll = bar.querySelector(".pmk055-clear-all");

        if (status) {
            if (!count) {
                if (applied) {
                    status.textContent = language() === "en"
                        ? applied + " active filter" + (applied > 1 ? "s" : "") + ". You can modify them or clear them all."
                        : applied + " filtre" + (applied > 1 ? "s" : "") + " actif" + (applied > 1 ? "s" : "") + ". Vous pouvez les modifier ou tout effacer.";
                } else {
                    status.textContent = t(
                        "Cochez plusieurs filtres puis appliquez-les en une seule fois.",
                        "Select several filters, then apply them all at once."
                    );
                }
            } else {
                status.textContent = language() === "en"
                    ? count + " pending change" + (count > 1 ? "s" : "") + (applied ? " · " + applied + " active" : "")
                    : count + " modification" + (count > 1 ? "s" : "") + " en attente" + (applied ? " · " + applied + " actif" + (applied > 1 ? "s" : "") : "");
            }
        }

        if (apply) apply.disabled = count === 0;
        if (cancelPending) cancelPending.disabled = count === 0;
        if (clearAll) clearAll.disabled = count === 0 && applied === 0;
    }

    function mountContextAccess(root) {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;

        const anchor = directChild(root, "h4,h3,h2") || root;
        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: PAGE_ID,
                context: {
                    sectionId: "multi-select",
                    pageId: PAGE_ID
                }
            });
        } catch (_) {}
    }

    function enhanceRoot(root) {
        if (!root || root.getAttribute("data-pmk055-enhanced") === "1") return;

        // Défense supplémentaire : un groupe de facettes ne doit exister
        // qu'une seule fois, même après un rafraîchissement asynchrone.
        deduplicateFacetGroups(root);

        root.setAttribute("data-pmk055-enhanced", "1");
        root.classList.add("pmk055-enhanced");

        if (currentConfig.drawers) root.classList.add("pmk055-drawers");
        if (currentConfig.multiSelect) root.classList.add("pmk055-multiselect");
        if (currentConfig.valuesMode === "all") root.classList.add("pmk055-values-all");

        pendingAdds.clear();
        pendingRemoves.clear();

        makeActionBar(root);
        mountQuickFilters(root);
        installLocalResultsObserver();
        scheduleLocalAvailabilityFilter();

        const mainList = directChild(root, "ul");
        if (!mainList) {
            mountContextAccess(root);
            return;
        }

        directChildren(mainList, "li").forEach(function (group) {
            const list = directChild(group, "ul");
            if (!list) return;

            if (group.id === "availability_facet" && currentConfig.hideAvailabilityFacet) {
                group.classList.add("pmk055-hidden-availability");
                return;
            }

            const labelInfo = displayGroupLabel(group);
            const label = labelInfo.text;

            if (currentConfig.drawers) {
                markNativeGroupHeading(group);

                const stateKey = facetGroupIdentity(group);
                const explicitState = stateKey && drawerStateOverrides.has(stateKey)
                    ? drawerStateOverrides.get(stateKey)
                    : null;

                const open = explicitState !== null
                    ? explicitState
                    : (
                        currentConfig.initialState === "open" ||
                        (currentConfig.openActive && groupHasActiveFacet(group))
                    );

                group.classList.toggle("pmk055-open", open);
                makeToggleButton(group, list, label, open);
            } else if (labelInfo.renamed) {
                applyStandaloneRenamedHeading(group, label);
            }

            enhanceChoices(group, list);
            updateGroupActiveIndicator(group);
        });

        mountContextAccess(root);

        window.setTimeout(function () {
            recalculateActiveFacetFamilies(root);
        }, 0);
    }

    function restore() {
        pendingAdds.clear();
        pendingRemoves.clear();
        stopLocalResultsObserver();

        clearLocalRowPresentation(resultRows(), true);
        document.querySelectorAll("[" + LOCAL_ORIGINAL_INDEX_ATTR + "]").forEach(function (row) {
            row.removeAttribute(LOCAL_ORIGINAL_INDEX_ATTR);
        });

        document.querySelectorAll("[" + NATIVE_TEXT_ATTR + '="1"]').forEach(function (span) {
            try {
                span.replaceWith(document.createTextNode(span.textContent || ""));
            } catch (_) {}
        });

        document.querySelectorAll("[" + GENERATED_ATTR + '="1"]').forEach(function (node) {
            try { node.remove(); } catch (_) {}
        });

        document.querySelectorAll("[" + TEMP_ID_ATTR + '="1"]').forEach(function (node) {
            node.removeAttribute("id");
            node.removeAttribute(TEMP_ID_ATTR);
        });

        cleanupQuickFiltersBar();

        const root = document.getElementById("search-facets");
        if (!root) return;

        root.removeAttribute("data-pmk055-enhanced");
        root.classList.remove(
            "pmk055-enhanced",
            "pmk055-drawers",
            "pmk055-multiselect",
            "pmk055-values-all"
        );

        root.querySelectorAll(".pmk055-open").forEach(function (node) {
            node.classList.remove("pmk055-open");
        });

        root.querySelectorAll(".pmk055-native-heading").forEach(function (node) {
            node.classList.remove("pmk055-native-heading");
        });

        root.querySelectorAll(".pmk055-native-choice").forEach(function (node) {
            node.classList.remove("pmk055-native-choice");
        });

        root.querySelectorAll(".pmk055-hidden-availability").forEach(function (node) {
            node.classList.remove("pmk055-hidden-availability");
        });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULTS);
        localAvailabilityHydrated = false;
        restore();

        if (!currentConfig.quickFilters.local.enabled) {
            setLocalAvailabilityState(false);
        } else {
            hydrateLocalAvailabilityState();
        }

        if (!currentConfig.enabled || !currentConfig.page.enabled) return;

        const root = document.getElementById("search-facets");
        if (!root) return;

        injectStyles();
        enhanceRoot(root);
    }

    function connectPmkConfig() {
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            applyConfig(DEFAULTS);
            return false;
        }

        api.getConfig(MODULE_ID)
            .then(function (config) {
                applyConfig(config || DEFAULTS);
            })
            .catch(function () {
                applyConfig(DEFAULTS);
            });

        if (!unsubscribe && typeof api.subscribe === "function") {
            try {
                unsubscribe = api.subscribe(MODULE_ID, function (config) {
                    applyConfig(config || DEFAULTS);
                });
            } catch (_) {}
        }

        return true;
    }

    function start() {
        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });

            let attempts = 0;
            startRetry = window.setInterval(function () {
                attempts += 1;
                if (connectPmkConfig() || attempts >= 50) {
                    window.clearInterval(startRetry);
                    startRetry = null;
                }
            }, 100);
        }

        window.setTimeout(function () { applyConfig(currentConfig); }, 250);
        window.setTimeout(function () { applyConfig(currentConfig); }, 900);
    }

    window.PMK055SearchFacets = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: clone(DEFAULTS),
        normalizeConfig: normalizeConfig,
        normalizeMultiChoiceLimits: normalizeMultiChoiceLimits,
        facetIdentity: facetIdentity,
        activeFacetGroupKeys: activeFacetGroupKeys,
        buildFacetRefreshUrl: function (key) { return buildFacetRefreshUrl(key).toString(); },
        applyConfig: applyConfig,
        restore: restore,
        getPending: function () {
            return {
                add: Array.from(pendingAdds),
                remove: Array.from(pendingRemoves)
            };
        },
        buildResultUrl: function () {
            return buildResultUrl().toString();
        },
        buildClearFacetsUrl: function () {
            return buildClearFacetsUrl().toString();
        },
        applyLocalAvailabilityFilter: applyLocalAvailabilityFilter,
        getLocalAvailabilityState: function () { return localAvailabilityActive; },
        normalizeMultiChoiceLimits: function (limits) {
            return normalizeMultiChoiceLimits(Array.isArray(limits) ? limits : []);
        },
        deduplicateFacetGroups: function () {
            const root = document.getElementById("search-facets");
            return root ? deduplicateFacetGroups(root) : 0;
        },
        getGroupDisplayLabel: function (group) {
            return displayGroupLabel(group);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
