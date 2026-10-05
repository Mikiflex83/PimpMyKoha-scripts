/*
 Nom du fichier: 029-subscription-periodiques.js
 Version: 4.2.4-preplugin
 Date de dernière modification: 2026-10-03
 Auteur: Michael Mundet

 Module PimpMyKoha (phase pré-plugin) : Gestion des périodiques

 Fonctions :
 - améliore la lisibilité des statuts de fascicules sans détruire le DOM Koha ;
 - calcule, pour chaque fascicule "Attendu / Expected", l'échéance de réclamation
   à partir de la période de grâce définie dans l'abonnement Koha ;
 - accepte une période de grâce égale à 0 ;
 - affiche un calendrier des fascicules sur desktop/tablette et une vue agenda sur mobile ;
 - prend en charge les principaux statuts FR/EN ;
 - évite les positions de colonnes fixes quand Koha expose des en-têtes exploitables ;
 - conserve des fallbacks historiques strictement contrôlés ;
 - résiste aux redraws de tableaux et aux doubles injections ;
 - lit sa configuration via window.PMKConfig lorsqu'il est disponible ;
 - reprend les fonctions utiles de l'ancien 030 sans cloner le DOM : mise en page de
   subscription-detail.pl, filtrage des liens de bulletinage et transport du prix fascicule ;
 - fonctionne aussi sur serials-search.pl et reste compatible avec l'ancien .tableau-fasci
   pendant la phase de recette ;
 - intègre désormais intégralement l'ancien 073-serials-bulletinage.js sur serials-edit.pl :
   remplissage assisté, prix fascicule, HS, préconfigurations d'exemplaire, signalement et protection.
 - les préconfigurations historiques Dracénie sont conservées à l'identique comme valeurs par défaut,
   mais deviennent configurables, extensibles et désactivables individuellement.
 - absorbe la fonction utile de l'ancien 094 sur serials-collection.pl : tri naturel configurable
   de la colonne Numéro dans chaque tableau annuel, sans clic simulé et sans modification métier ;
 - absorbe l'ancien 104 sur subscription-add.pl : assistant explicite de calcul de la durée
   d'abonnement, sans table d'identifiants de périodicité codée en dur.

 Important :
 - le renommage historique "Date prévue" -> "Date de réception" est conservé par défaut
   comme option de compatibilité, afin de restituer le fonctionnement utilisé avant fusion ;
 - le comportement historique .bouton / .sectionz du 030 est également conservé par défaut ;
 - aucune action de réclamation Koha n'est lancée automatiquement ; le module affiche
   uniquement une aide visuelle calculée à partir des données présentes sur la page.
*/

(function () {
    "use strict";

    if (window.__PMK029_SERIALS_TRACKING__) return;
    window.__PMK029_SERIALS_TRACKING__ = true;

    const MODULE_ID = "serials-tracking";
    const MODULE_VERSION = "4.2.4-preplugin";
    const DETAIL_PAGE_ID = "serials.subscription_detail";
    const DETAIL_PAGE_PATH = "/cgi-bin/koha/serials/subscription-detail.pl";
    const SEARCH_PAGE_ID = "serials.serials_search";
    const SEARCH_PAGE_PATH = "/cgi-bin/koha/serials/serials-search.pl";
    const EDIT_PAGE_ID = "serials.serials_edit";
    const EDIT_PAGE_PATH = "/cgi-bin/koha/serials/serials-edit.pl";
    const COLLECTION_PAGE_ID = "serials.serials_collection";
    const COLLECTION_PAGE_PATH = "/cgi-bin/koha/serials/serials-collection.pl";
    const ADD_PAGE_ID = "serials.subscription_add";
    const ADD_PAGE_PATH = "/cgi-bin/koha/serials/subscription-add.pl";
    const CONTEXT_STORAGE_KEY = "pmk.serials.context";
    const LEGACY_PRICE_KEY = "selectedPrice";

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: [
            { id: DETAIL_PAGE_ID, enabled: true, path: DETAIL_PAGE_PATH },
            { id: SEARCH_PAGE_ID, enabled: true, path: SEARCH_PAGE_PATH },
            { id: EDIT_PAGE_ID, enabled: true, path: EDIT_PAGE_PATH },
            { id: COLLECTION_PAGE_ID, enabled: true, path: COLLECTION_PAGE_PATH },
            { id: ADD_PAGE_ID, enabled: true, path: ADD_PAGE_PATH }
        ],
        layout: {
            enabled: true,
            mode: "historical-three-columns",
            hideNativeTabs: true,
            responsiveWrap: true,
            gap: 20,
            sections: [
                { key: "information", enabled: true, labelFr: "Information", labelEn: "Information" },
                { key: "planning", enabled: true, labelFr: "Calendrier", labelEn: "Planning" },
                { key: "issues", enabled: true, labelFr: "Fascicules", labelEn: "Issues" },
                { key: "summary", enabled: true, labelFr: "Résumé", labelEn: "Summary" }
            ]
        },
        display: {
            statusBadges: true,
            statusIcons: false
        },
        claims: {
            enabled: true,
            showOkState: true,
            showDaysLate: false,
            showIcons: true
        },
        calendar: {
            enabled: true,
            months: 6,
            navigationStep: 6,
            anchorMode: "current",
            collapsible: false,
            expandedByDefault: true
        },
        collectionSort: {
            enabled: true,
            direction: "desc"
        },
        subscriptionLength: {
            enabled: true,
            buttonLabelFr: "Calculer",
            buttonLabelEn: "Calculate",
            automatic: false,
            showDetails: true,
            issuesStartSource: "nextacquidate",
            fallbackToFirstPublication: true,
            fetchFrequencyDefinition: true,
            selectors: {
                startDate: "#acqui_date, [name=\"acqui_date\"]",
                endDate: "#to, [name=\"to\"]",
                nextIssueDate: "#nextacquidate, [name=\"nextacquidate\"]",
                frequency: "#frequency, [name=\"frequency\"]",
                subtype: "#subtype, [name=\"subtype\"]",
                length: "#sublength, [name=\"sublength\"]"
            }
        },
        bulletinage: {
            enabled: true,
            rewriteStatuses: true,
            statusCodes: "1,3,7,4,41,42,43,44,6"
        },
        priceContext: {
            enabled: true,
            ttlMinutes: 60,
            legacyMirror: true,
            storageKey: CONTEXT_STORAGE_KEY
        },
        receivingAssistant: {
            enabled: true,
            fill: {
                enabled: true,
                buttonLabelFr: "Remplir les champs",
                buttonLabelEn: "Fill fields",
                issueNumberEnabled: true,
                issueNumberFieldLabel: "v - Numéro de la revue",
                callNumberEnabled: true,
                callNumberFieldLabel: "k - Cote",
                priceEnabled: true,
                priceFieldLabel: "p - Prix",
                setPlannedDateToday: true,
                dateLocale: "fr-FR"
            },
            specialIssue: {
                enabled: true,
                buttonLabelFr: "Ajouter HS",
                buttonLabelEn: "Add special issue",
                marker: "HS"
            },
            duplicateIssue: {
                enabled: false,
                buttonLabelFr: "Ajouter Doublon",
                buttonLabelEn: "Add duplicate",
                marker: "(Doublon)"
            },
            presetsEnabled: true,
            presets: [
                {
                    id: "jeunesse-draguignan", legacyId: "exemplaire-jeunesse-button", enabled: true, labelFr: "Jeunesse Draguignan", labelEn: "Jeunesse Draguignan",
                    values: [
                        { enabled: true, fieldLabel: "q - Public", value: "j", mode: "legacy" },
                        { enabled: true, fieldLabel: "s - Etage", value: "RDC", mode: "legacy" },
                        { enabled: true, fieldLabel: "j - Sous localisation", value: "petit-kiosque", mode: "legacy" }
                    ]
                },
                {
                    id: "adulte-draguignan", legacyId: "exemplaire-adulte-button", enabled: true, labelFr: "Adulte Draguignan", labelEn: "Adulte Draguignan",
                    values: [
                        { enabled: true, fieldLabel: "q - Public", value: "a", mode: "legacy" },
                        { enabled: true, fieldLabel: "s - Etage", value: "RDC", mode: "legacy" },
                        { enabled: true, fieldLabel: "j - Sous localisation", value: "Le Kiosque", mode: "legacy" }
                    ]
                },
                {
                    id: "jeunesse-site-exterieur", legacyId: "exemplaire-jeunesse-site-exterieur-button", enabled: true, labelFr: "Jeunesse Site extérieur", labelEn: "Jeunesse Site extérieur",
                    values: [
                        { enabled: true, fieldLabel: "q - Public", value: "j", mode: "legacy" },
                        { enabled: true, fieldLabel: "s - Etage", value: "RDC", mode: "legacy" }
                    ]
                },
                {
                    id: "adulte-site-exterieur", legacyId: "exemplaire-adulte-site-exterieur-button", enabled: true, labelFr: "Adulte Site extérieur", labelEn: "Adulte Site extérieur",
                    values: [
                        { enabled: true, fieldLabel: "q - Public", value: "a", mode: "legacy" },
                        { enabled: true, fieldLabel: "s - Etage", value: "RDC", mode: "legacy" }
                    ]
                },
                {
                    id: "atp", legacyId: "ATP", enabled: true, labelFr: "ATP", labelEn: "ATP",
                    values: [
                        { enabled: true, fieldLabel: "q - Public", value: "a", mode: "legacy" },
                        { enabled: true, fieldLabel: "s - Etage", value: "2eme etage", mode: "legacy" }
                    ]
                }
            ],
            report: {
                enabled: true,
                buttonLabelFr: "Signaler un problème de bulletinage",
                buttonLabelEn: "Report a receiving problem",
                recipients: "contact@example.org,contact@example.org",
                subjectTemplate: "Problème de Bulletinage : {SUBSCRIPTION} de {CALLNUMBER}",
                bodyTemplate: "Bonjour,\n\nJe vous signale un problème lors du bulletinage. Voici les informations présentes avant le bulletinage :\n\n- Nom de l'abonnement : {SUBSCRIPTION}\n- Côte : {CALLNUMBER}\n- Nom de l'utilisateur : {USER}\n- Numéro de fascicule : {ISSUE}\n- Date de publication : {DATE}\n- Code-barres : {BARCODE}\n\nMerci de renseigner ici les informations qui étaient attendues :\n\n- Nom de l'abonnement : {SUBSCRIPTION}\n- Côte : {CALLNUMBER}\n- Numéro de fascicule : ____________\n- Date de publication : ____________\n- Code-barres : ____________\n- Autres remarques :\n\n\nCordialement,"
            },
            protection: {
                enabled: true,
                overlayOnFascicleRows: true,
                requireAddItemLink: true,
                unlockShortcutEnabled: true,
                unlockKey: "U",
                shortcutScope: "all",
                fields: [
                    { enabled: true, label: "b - Site Propriétaire" },
                    { enabled: true, label: "c - Site actuel" },
                    { enabled: true, label: "s - Etage" },
                    { enabled: true, label: "e - Localisation" },
                    { enabled: true, label: "j - Sous localisation" },
                    { enabled: true, label: "k - Cote" },
                    { enabled: true, label: "r - Type de document" },
                    { enabled: true, label: "q - Public" },
                    { enabled: true, label: "t - Achat/don" },
                    { enabled: true, label: "A - Fournisseur" },
                    { enabled: true, label: "p - Prix" },
                    { enabled: true, label: "u - Note interne" },
                    { enabled: true, label: "v - Numéro de la revue" },
                    { enabled: true, label: "x - Note OPAC" }
                ]
            },
            buttons: {
                background: "#4CAF50",
                hoverBackground: "#45a049",
                color: "#ffffff"
            }
        },
        compatibility: {
            renamePlannedDate: true,
            legacySectionToggles: true
        },
        colors: {
            arrived: "#008000",
            expected: "#ffa500",
            late: "#ff0000",
            claimed: "#ff0000",
            missing: "#ff0000",
            other: "#ff0000"
        }
    };

    const STATUS_ALIASES = {
        arrived: ["arrivé", "arrive", "arrived", "received", "reçu", "recu"],
        expected: ["attendu", "expected"],
        late: ["en retard", "retard", "late", "overdue"],
        claimed: ["réclamé", "reclame", "claimed", "claim sent"],
        missing: ["manquant", "missing", "lost"],
        other: []
    };

    const STATUS_ICONS = {
        arrived: "✓",
        expected: "⌛",
        late: "!",
        claimed: "✉",
        missing: "?",
        other: "•"
    };

    const COLUMN_ALIASES = {
        title: [
            "titre", "title", "fascicule", "issue", "numéro", "numero", "number",
            "publication", "serial", "numéro de fascicule", "issue number"
        ],
        date: [
            "date prévue", "date prevue", "planned date", "expected date",
            "date de publication", "publication date", "date de réception",
            "date de reception", "receive date", "received date", "date"
        ],
        status: [
            "statut", "status", "état", "etat", "state"
        ]
    };

    const PRICE_COLUMN_ALIASES = [
        "prix fascicule", "prix du fascicule", "issue price", "price per issue", "unit price"
    ];

    const PRICE_LABEL_ALIASES = [
        "prix fascicule", "prix du fascicule", "prix par fascicule", "prix au fascicule",
        "prix unitaire", "issue price", "price per issue", "unit price"
    ];

    const SECTION_META = {
        information: { panelId: "subscription_info_panel", tabId: "subscription_info-tab" },
        planning: { panelId: "subscription_planning_panel", tabId: "subscription_planning-tab" },
        issues: { panelId: "subscription_issues_panel", tabId: "subscription_issues-tab" },
        summary: { panelId: "subscription_summary_panel", tabId: "subscription_summary-tab" }
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let observers = [];
    let mutationTimer = null;
    let initialized = false;
    let renamedDateTextNodes = [];
    let collectionRetryTimer = null;
    const collectionOriginalOrders = new WeakMap();
    const frequencyDefinitionCache = new Map();
    const detailPriceFetches = new Map();
    let subscriptionLengthListeners = [];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) {
            return Array.isArray(override) ? clone(override) : clone(base);
        }
        if (!isObject(base)) {
            return override === undefined ? clone(base) : clone(override);
        }
        const out = clone(base);
        if (!isObject(override)) return out;
        Object.keys(override).forEach(function (key) {
            out[key] = key in base ? deepMerge(base[key], override[key]) : clone(override[key]);
        });
        return out;
    }

    function normalizeConfig(config) {
        const merged = deepMerge(DEFAULT_CONFIG, config || {});

        const storedPages = Array.isArray(merged.pages) ? merged.pages : [];
        merged.pages = DEFAULT_CONFIG.pages.map(function (defaultPage) {
            const existing = storedPages.find(function (page) { return page && page.id === defaultPage.id; });
            return Object.assign({}, defaultPage, existing || {});
        });

        const storedSections = merged.layout && Array.isArray(merged.layout.sections)
            ? merged.layout.sections
            : [];
        merged.layout = Object.assign({}, DEFAULT_CONFIG.layout, merged.layout || {});
        merged.layout.mode = "historical-three-columns";
        merged.layout.sections = DEFAULT_CONFIG.layout.sections.map(function (defaultSection) {
            const existing = storedSections.find(function (section) { return section && section.key === defaultSection.key; });
            return Object.assign({}, defaultSection, existing || {});
        });

        if (!merged.receivingAssistant || typeof merged.receivingAssistant !== "object") {
            merged.receivingAssistant = clone(DEFAULT_CONFIG.receivingAssistant);
        }
        if (!Array.isArray(merged.receivingAssistant.presets)) {
            merged.receivingAssistant.presets = clone(DEFAULT_CONFIG.receivingAssistant.presets);
        }
        if (!merged.receivingAssistant.protection || typeof merged.receivingAssistant.protection !== "object") {
            merged.receivingAssistant.protection = clone(DEFAULT_CONFIG.receivingAssistant.protection);
        }
        if (!Array.isArray(merged.receivingAssistant.protection.fields)) {
            merged.receivingAssistant.protection.fields = clone(DEFAULT_CONFIG.receivingAssistant.protection.fields);
        }

        merged.subscriptionLength = Object.assign(
            {},
            DEFAULT_CONFIG.subscriptionLength,
            merged.subscriptionLength || {}
        );
        merged.subscriptionLength.selectors = Object.assign(
            {},
            DEFAULT_CONFIG.subscriptionLength.selectors,
            merged.subscriptionLength.selectors || {}
        );
        if (!["nextacquidate", "acqui_date"].includes(merged.subscriptionLength.issuesStartSource)) {
            merged.subscriptionLength.issuesStartSource = DEFAULT_CONFIG.subscriptionLength.issuesStartSource;
        }

        return merged;
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            } catch (_) {}
        }
        const lang = String(document.documentElement.lang || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return detectLanguage() === "en" ? en : fr;
    }

    function currentPageDefinition() {
        if (window.location.pathname === DETAIL_PAGE_PATH) return { id: DETAIL_PAGE_ID, path: DETAIL_PAGE_PATH };
        if (window.location.pathname === SEARCH_PAGE_PATH) return { id: SEARCH_PAGE_ID, path: SEARCH_PAGE_PATH };
        if (window.location.pathname === EDIT_PAGE_PATH) return { id: EDIT_PAGE_ID, path: EDIT_PAGE_PATH };
        if (window.location.pathname === COLLECTION_PAGE_PATH) return { id: COLLECTION_PAGE_ID, path: COLLECTION_PAGE_PATH };
        if (window.location.pathname === ADD_PAGE_PATH) return { id: ADD_PAGE_ID, path: ADD_PAGE_PATH };
        return null;
    }

    function isPageEnabled(config, pageId) {
        const cfg = config || currentConfig;
        if (!cfg || cfg.enabled === false) return false;
        const current = currentPageDefinition();
        const wantedId = pageId || (current && current.id);
        if (!wantedId) return false;
        const pages = Array.isArray(cfg.pages) ? cfg.pages : [];
        const page = pages.find(function (item) { return item && item.id === wantedId; });
        if (!page || page.enabled === false) return false;
        if (wantedId === DETAIL_PAGE_ID) return page.path === DETAIL_PAGE_PATH;
        if (wantedId === SEARCH_PAGE_ID) return page.path === SEARCH_PAGE_PATH;
        if (wantedId === EDIT_PAGE_ID) return page.path === EDIT_PAGE_PATH;
        if (wantedId === COLLECTION_PAGE_ID) return page.path === COLLECTION_PAGE_PATH;
        if (wantedId === ADD_PAGE_ID) return page.path === ADD_PAGE_PATH;
        return false;
    }

    function safeQuery(root, selector) {
        try {
            return root ? root.querySelector(selector) : null;
        } catch (_) {
            return null;
        }
    }

    function localWaitForSelector(selector, timeout) {
        const max = Number(timeout) > 0 ? Number(timeout) : 5000;
        return new Promise(function (resolve, reject) {
            const immediate = document.querySelector(selector);
            if (immediate) {
                resolve(immediate);
                return;
            }

            let finished = false;
            let timer = null;
            const observer = new MutationObserver(function () {
                const found = document.querySelector(selector);
                if (!found) return;
                finish(resolve, found);
            });

            function finish(callback, value) {
                if (finished) return;
                finished = true;
                observer.disconnect();
                if (timer) clearTimeout(timer);
                callback(value);
            }

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            timer = window.setTimeout(function () {
                finish(reject, new Error("timeout"));
            }, max);
        });
    }

    const waitForSelector =
        window.KOHA_UTILS && typeof window.KOHA_UTILS.waitForSelector === "function"
            ? window.KOHA_UTILS.waitForSelector
            : localWaitForSelector;

    function installStyles() {
        if (document.getElementById("pmk029-serials-style")) return;

        const style = document.createElement("style");
        style.id = "pmk029-serials-style";
        style.textContent = `
            .pmk029-status-badge-target {
                display: inline-block !important;
                max-width: 100%;
                padding: 4px 8px !important;
                border-radius: 12px !important;
                background: var(--pmk029-status-bg) !important;
                color: var(--pmk029-status-fg) !important;
                font-weight: bold !important;
                line-height: 1.25 !important;
                white-space: normal;
            }
            .tableau-fasci .pmk029-status-badge-target {
                padding: 2px 5px !important;
                border-radius: 4px !important;
                font-size: .9em !important;
                font-weight: normal !important;
            }
            .pmk029-status-badge-target[data-pmk029-icon]::before {
                content: attr(data-pmk029-icon);
                flex: 0 0 auto;
                font-weight: 700;
            }
            .pmk029-claim-note {
                display: block;
                margin-top: .35rem;
                padding: .32rem .5rem;
                border-radius: .25rem;
                font-size: .875rem;
                line-height: 1.35;
                max-width: 32rem;
            }
            .pmk029-claim-note.is-due {
                border-left: 4px solid #dc3545;
                background: rgba(220, 53, 69, .08);
            }
            .pmk029-claim-note.is-ok {
                border-left: 4px solid #198754;
                background: rgba(25, 135, 84, .08);
            }
            .pmk029-calendar-panel {
                margin-top: 1rem;
                border: 1px solid #d7dce0;
                border-radius: .35rem;
                background: #fff;
                overflow: hidden;
            }
            .pmk029-calendar-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .75rem;
                padding: .65rem .8rem;
                background: #f5f6f7;
                border-bottom: 1px solid #d7dce0;
            }
            .pmk029-calendar-title-wrap {
                display: flex;
                align-items: center;
                gap: .5rem;
                min-width: 0;
            }
            .pmk029-calendar-title {
                margin: 0;
                font-size: 1rem;
                font-weight: 600;
            }
            .pmk029-calendar-actions {
                display: flex;
                align-items: center;
                gap: .25rem;
                flex: 0 0 auto;
            }
            .pmk029-calendar-body {
                padding: .75rem;
            }
            .pmk029-calendar-navigation {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .75rem;
                margin-bottom: .75rem;
            }
            .pmk029-calendar-range {
                margin: 0;
                text-align: center;
                font-size: .95rem;
                font-weight: 600;
            }
            .pmk029-calendar-months {
                display: grid;
                gap: 1rem;
            }
            .pmk029-month-block h4 {
                margin: 0 0 .4rem;
                font-size: .95rem;
            }
            .pmk029-calendar-grid {
                display: grid;
                grid-template-columns: repeat(7, minmax(0, 1fr));
                border-top: 1px solid #dee2e6;
                border-left: 1px solid #dee2e6;
            }
            .pmk029-calendar-weekday,
            .pmk029-calendar-day {
                min-width: 0;
                border-right: 1px solid #dee2e6;
                border-bottom: 1px solid #dee2e6;
                padding: .35rem;
            }
            .pmk029-calendar-weekday {
                background: #f8f9fa;
                text-align: center;
                font-weight: 600;
                font-size: .8rem;
            }
            .pmk029-calendar-day {
                min-height: 4.6rem;
            }
            .pmk029-calendar-day.is-empty {
                background: #fafafa;
            }
            .pmk029-day-number {
                display: block;
                margin-bottom: .25rem;
                font-weight: 600;
                font-size: .82rem;
            }
            .pmk029-event-list {
                margin: 0;
                padding: 0;
                list-style: none;
            }
            .pmk029-event {
                display: block;
                margin: 0 0 .2rem;
                padding: .18rem .3rem;
                border-radius: .2rem;
                background: var(--pmk029-event-bg);
                color: var(--pmk029-event-fg);
                font-size: .75rem;
                line-height: 1.25;
                overflow-wrap: anywhere;
            }
            .pmk029-calendar-warning {
                margin: 0 0 .75rem;
            }
            .pmk029-agenda {
                display: none;
            }
            .pmk029-agenda-month + .pmk029-agenda-month {
                margin-top: 1rem;
            }
            .pmk029-agenda-month h4 {
                margin: 0 0 .35rem;
                font-size: .95rem;
            }
            .pmk029-agenda-list {
                margin: 0;
                padding: 0;
                list-style: none;
                border-top: 1px solid #e5e7e9;
            }
            .pmk029-agenda-item {
                display: grid;
                grid-template-columns: minmax(5.5rem, auto) 1fr;
                gap: .65rem;
                padding: .5rem 0;
                border-bottom: 1px solid #e5e7e9;
            }
            .pmk029-agenda-date {
                font-weight: 600;
            }
            .pmk029-agenda-event {
                display: inline-flex;
                align-items: center;
                gap: .4rem;
                max-width: 100%;
                margin: 0 .25rem .2rem 0;
                padding: .18rem .38rem;
                border-radius: .25rem;
                background: var(--pmk029-event-bg);
                color: var(--pmk029-event-fg);
                font-size: .82rem;
                overflow-wrap: anywhere;
            }
            @media (max-width: 767.98px) {
                .pmk029-calendar-header,
                .pmk029-calendar-navigation {
                    align-items: stretch;
                }
                .pmk029-calendar-header {
                    flex-wrap: wrap;
                }
                .pmk029-calendar-title-wrap {
                    flex: 1 1 14rem;
                }
                .pmk029-calendar-actions {
                    margin-left: auto;
                }
                .pmk029-calendar-navigation {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                }
                .pmk029-calendar-range {
                    grid-column: 1 / -1;
                    grid-row: 1;
                }
                .pmk029-calendar-grid-wrap {
                    display: none;
                }
                .pmk029-agenda {
                    display: block;
                }
                .pmk029-agenda-item {
                    grid-template-columns: 1fr;
                    gap: .25rem;
                }
                .pmk029-status-badge-target {
                    border-radius: .3rem !important;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeStyles() {
        const style = document.getElementById("pmk029-serials-style");
        if (style) style.remove();
    }

    function contrastColor(hex) {
        const value = String(hex || "").replace("#", "");
        if (!/^[0-9a-f]{6}$/i.test(value)) return "#ffffff";
        const r = parseInt(value.slice(0, 2), 16);
        const g = parseInt(value.slice(2, 4), 16);
        const b = parseInt(value.slice(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.62 ? "#212529" : "#ffffff";
    }

    function statusKeyFromText(value) {
        const normalized = normalizeText(value);
        if (!normalized) return "other";

        const keys = ["arrived", "expected", "late", "claimed", "missing"];
        for (const key of keys) {
            const aliases = STATUS_ALIASES[key];
            if (aliases.some(function (alias) {
                const n = normalizeText(alias);
                return normalized === n || normalized.indexOf(n) !== -1;
            })) {
                return key;
            }
        }
        return "other";
    }

    function getColor(key) {
        const colors = currentConfig && currentConfig.colors ? currentConfig.colors : DEFAULT_CONFIG.colors;
        const value = colors && colors[key] ? String(colors[key]) : DEFAULT_CONFIG.colors[key] || DEFAULT_CONFIG.colors.other;
        return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_CONFIG.colors[key] || DEFAULT_CONFIG.colors.other;
    }

    function getHeaderRow(table) {
        if (!table) return null;

        // Koha peut rendre les en-têtes soit dans <thead>, soit directement
        // dans le premier <tr> du <tbody> (cas réel subscription-detail.pl
        // observé sur l'installation Dracénie en Koha 25.11).
        const theadRow = safeQuery(table, "thead tr:last-child") || safeQuery(table, "thead tr");
        if (theadRow && theadRow.querySelector("th")) return theadRow;

        const rows = Array.from(table.rows || []);
        return rows.find(function (row) {
            const thCount = row.querySelectorAll("th").length;
            const tdCount = row.querySelectorAll("td").length;
            return thCount > 0 && tdCount === 0;
        }) || rows.find(function (row) {
            return Boolean(row.querySelector("th"));
        }) || null;
    }

    function getTableHeaders(table) {
        const row = getHeaderRow(table);
        return row ? Array.from(row.cells || []) : [];
    }

    function getDataRows(table) {
        if (!table) return [];
        return Array.from(table.querySelectorAll("tbody tr")).filter(function (row) {
            return Boolean(row.querySelector("td"));
        });
    }

    function headerIdentity(header) {
        if (!header) return "";
        return normalizeText([
            header.getAttribute("data-colname") || "",
            header.getAttribute("data-column") || "",
            header.id || "",
            header.className || "",
            header.textContent || ""
        ].join(" "));
    }

    function resolveColumnIndex(table, type) {
        const aliases = (COLUMN_ALIASES[type] || []).map(normalizeText);
        const headers = getTableHeaders(table);

        for (let i = 0; i < headers.length; i += 1) {
            const identity = headerIdentity(headers[i]);
            if (!identity) continue;
            const found = aliases.some(function (alias) {
                return identity === alias || identity.indexOf(alias) !== -1;
            });
            if (found) return i;
        }

        return historicalFallbackIndex(table, type);
    }

    function historicalFallbackIndex(table, type) {
        const firstRow = getDataRows(table)[0] || null;
        if (!firstRow || !firstRow.cells) return -1;
        const cells = firstRow.cells;
        const isYearTable = table.classList.contains("subscription-year-table");
        const isFascicleTable = isLikelyFascicleTable(table);

        if (isYearTable && type === "status" && cells.length >= 6) {
            // Parité legacy 029 : la sixième colonne était toujours traitée comme
            // colonne de statut, même pour une valeur inconnue (alors colorée en rouge).
            return 5;
        }

        if (isFascicleTable && cells.length >= 5) {
            if (type === "title") return 0;
            if (type === "date") {
                return parseDateText(cells[1].textContent) ? 1 : -1;
            }
            // Parité legacy 029 : la cinquième colonne de .tableau-fasci est le statut.
            if (type === "status") return 4;
        }

        return -1;
    }

    function getCell(row, index) {
        if (!row || !row.cells || index < 0 || !row.cells[index]) return null;
        return row.cells[index];
    }

    function getRawStatusText(cell) {
        if (!cell) return "";
        const cloneCell = cell.cloneNode(true);
        cloneCell.querySelectorAll(".pmk029-claim-note").forEach(function (node) { node.remove(); });
        return String(cloneCell.textContent || "").replace(/\s+/g, " ").trim();
    }

    function findBadgeTarget(cell, rawStatus) {
        if (!cell) return null;
        const candidates = Array.from(cell.querySelectorAll(".status-container, span, div"));
        const normalized = normalizeText(rawStatus);
        for (const candidate of candidates) {
            if (candidate.classList.contains("pmk029-status-generated")) return candidate;
            if (candidate.querySelector("button, a, input, select, textarea")) continue;
            if (normalizeText(candidate.textContent) === normalized) return candidate;
        }

        // Fallback prudent : si la cellule ne contient que du texte, on l'enveloppe
        // sans toucher à une éventuelle structure interactive Koha.
        if (!cell.querySelector("*")) {
            const generated = document.createElement("span");
            generated.className = "pmk029-status-generated";
            generated.textContent = rawStatus;
            cell.textContent = "";
            cell.appendChild(generated);
            return generated;
        }

        return null;
    }

    function decorateStatusCell(cell) {
        if (!cell) return "other";
        const raw = getRawStatusText(cell);
        const key = statusKeyFromText(raw);

        cell.dataset.pmk029StatusKey = key;
        const oldTarget = cell.querySelector(".pmk029-status-badge-target");
        if (oldTarget && oldTarget !== cell) {
            oldTarget.classList.remove("pmk029-status-badge-target");
            oldTarget.style.removeProperty("--pmk029-status-bg");
            oldTarget.style.removeProperty("--pmk029-status-fg");
            oldTarget.removeAttribute("data-pmk029-icon");
        }
        if (cell.classList.contains("pmk029-status-badge-target")) {
            cell.classList.remove("pmk029-status-badge-target");
            cell.style.removeProperty("--pmk029-status-bg");
            cell.style.removeProperty("--pmk029-status-fg");
            cell.removeAttribute("data-pmk029-icon");
        }

        if (!(currentConfig.display && currentConfig.display.statusBadges !== false)) {
            return key;
        }

        const target = findBadgeTarget(cell, raw);
        if (!target) return key;
        const bg = getColor(key);
        target.classList.add("pmk029-status-badge-target");
        target.style.setProperty("--pmk029-status-bg", bg);
        target.style.setProperty("--pmk029-status-fg", contrastColor(bg));

        if (currentConfig.display.statusIcons !== false) {
            target.setAttribute("data-pmk029-icon", STATUS_ICONS[key] || STATUS_ICONS.other);
        } else {
            target.removeAttribute("data-pmk029-icon");
        }

        return key;
    }

    function parseDateText(value) {
        const text = String(value || "").trim();
        if (!text) return null;

        let match = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
        if (match) {
            return createDate(Number(match[1]), Number(match[2]), Number(match[3]));
        }

        match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
        if (match) {
            const a = Number(match[1]);
            const b = Number(match[2]);
            const year = Number(match[3]);
            let day;
            let month;

            if (a > 12) {
                day = a;
                month = b;
            } else if (b > 12) {
                month = a;
                day = b;
            } else if (detectLanguage() === "en") {
                month = a;
                day = b;
            } else {
                day = a;
                month = b;
            }
            return createDate(year, month, day);
        }

        return null;
    }

    function createDate(year, month, day) {
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = new Date(year, month - 1, day, 12, 0, 0, 0);
        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) return null;
        return date;
    }

    function dateOnly(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    }

    function addDays(date, days) {
        const result = dateOnly(date);
        result.setDate(result.getDate() + Number(days || 0));
        return result;
    }

    function dayDiff(later, earlier) {
        const ms = dateOnly(later).getTime() - dateOnly(earlier).getTime();
        return Math.round(ms / 86400000);
    }

    function formatDate(date) {
        try {
            return new Intl.DateTimeFormat(detectLanguage() === "en" ? "en-GB" : "fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }).format(date);
        } catch (_) {
            return [
                String(date.getDate()).padStart(2, "0"),
                String(date.getMonth() + 1).padStart(2, "0"),
                date.getFullYear()
            ].join("/");
        }
    }

    function getGracePeriod() {
        const candidates = Array.from(document.querySelectorAll(
            "div.rows ol li, div.rows ul li, .rows > ol > li, .rows > ul > li"
        ));
        const aliases = [
            "période de grâce", "periode de grace", "grace period"
        ].map(normalizeText);

        for (const item of candidates) {
            const label = safeQuery(item, ".label, .field-label, dt");
            const labelText = normalizeText(label ? label.textContent : item.textContent);
            const matches = aliases.some(function (alias) {
                return labelText.indexOf(alias) !== -1;
            });
            if (!matches) continue;

            const fullText = String(item.textContent || "");
            const numbers = fullText.match(/-?\d+/g);
            if (!numbers || !numbers.length) continue;
            const value = Number(numbers[numbers.length - 1]);
            if (Number.isFinite(value) && value >= 0) return value;
        }

        return null;
    }

    function removeClaimNotes(root) {
        (root || document).querySelectorAll(".pmk029-claim-note").forEach(function (node) {
            node.remove();
        });
    }

    function addClaimNote(cell, state, dueDate, overdueDays) {
        if (!cell) return;
        const note = document.createElement("div");
        note.className = "pmk029-claim-note " + (state === "due" ? "is-due" : "is-ok");
        note.setAttribute("data-pmk029-claim", "1");

        const showIcon = !(currentConfig.claims && currentConfig.claims.showIcons === false);
        if (state === "due") {
            const daysPart = currentConfig.claims.showDaysLate !== false && overdueDays > 0
                ? t(
                    " — échéance dépassée de " + overdueDays + " jour" + (overdueDays > 1 ? "s" : ""),
                    " — " + overdueDays + " day" + (overdueDays > 1 ? "s" : "") + " overdue"
                )
                : "";
            note.textContent = (showIcon ? "❌ " : "") + t("À réclamer", "Claim due") + daysPart;
        } else {
            note.textContent = (showIcon ? "✅ " : "") + t(
                "Aucune réclamation à faire — échéance le " + formatDate(dueDate),
                "No claim needed — due on " + formatDate(dueDate)
            );
        }

        cell.appendChild(note);
    }

    function processClaims(table, indexes, gracePeriod) {
        if (!(currentConfig.claims && currentConfig.claims.enabled !== false)) return;
        if (gracePeriod === null || gracePeriod === undefined) return;
        if (indexes.status < 0 || indexes.date < 0) return;

        const today = dateOnly(new Date());
        getDataRows(table).forEach(function (row) {
            const statusCell = getCell(row, indexes.status);
            const dateCell = getCell(row, indexes.date);
            if (!statusCell || !dateCell) return;

            const key = statusKeyFromText(getRawStatusText(statusCell));
            if (key !== "expected") return;

            const publicationDate = parseDateText(dateCell.textContent);
            if (!publicationDate) return;

            const dueDate = addDays(publicationDate, gracePeriod);
            const overdueDays = dayDiff(today, dueDate);

            if (today.getTime() > dueDate.getTime()) {
                addClaimNote(statusCell, "due", dueDate, overdueDays);
            } else if (currentConfig.claims.showOkState !== false) {
                addClaimNote(statusCell, "ok", dueDate, 0);
            }
        });
    }

    function processTable(table, gracePeriod) {
        if (!table || !table.tBodies || !table.tBodies.length) return null;

        const indexes = {
            title: resolveColumnIndex(table, "title"),
            date: resolveColumnIndex(table, "date"),
            status: resolveColumnIndex(table, "status")
        };

        if (indexes.status < 0) return indexes;

        getDataRows(table).forEach(function (row) {
            const statusCell = getCell(row, indexes.status);
            if (statusCell) decorateStatusCell(statusCell);
        });

        processClaims(table, indexes, gracePeriod);
        return indexes;
    }

    function isLikelyFascicleTable(table) {
        if (!(table instanceof HTMLTableElement)) return false;
        if (table.closest("#subscription_issues_panel, .tableau-fasci")) return true;
        if (table.classList.contains("subscription-year-table")) return false;
        const headers = getTableHeaders(table);
        const identities = headers.map(headerIdentity);
        const hasTitle = identities.some(function (identity) {
            return COLUMN_ALIASES.title.some(function (alias) { return identity.indexOf(normalizeText(alias)) !== -1; });
        });
        const hasDate = identities.some(function (identity) {
            return COLUMN_ALIASES.date.some(function (alias) { return identity.indexOf(normalizeText(alias)) !== -1; });
        });
        const hasStatus = identities.some(function (identity) {
            return COLUMN_ALIASES.status.some(function (alias) { return identity.indexOf(normalizeText(alias)) !== -1; });
        });
        return hasTitle && hasDate && hasStatus;
    }

    function addUniqueTable(found, table) {
        if (table instanceof HTMLTableElement && found.indexOf(table) === -1) found.push(table);
    }

    function getRelevantTables() {
        const found = [];
        document.querySelectorAll("#subscription_issues_panel table, .tableau-fasci table, table.subscription-year-table").forEach(function (table) {
            addUniqueTable(found, table);
        });
        if (!found.some(isLikelyFascicleTable)) {
            document.querySelectorAll("#subscription_info_panel table, .tab-content table").forEach(function (table) {
                if (isLikelyFascicleTable(table)) addUniqueTable(found, table);
            });
        }
        return found;
    }

    function getPrimaryFascicleTable() {
        const nativeTable = document.querySelector("#subscription_issues_panel table");
        if (nativeTable instanceof HTMLTableElement && isLikelyFascicleTable(nativeTable)) return nativeTable;
        const legacyTable = document.querySelector(".tableau-fasci table");
        if (legacyTable instanceof HTMLTableElement && isLikelyFascicleTable(legacyTable)) return legacyTable;
        return getRelevantTables().find(isLikelyFascicleTable) || null;
    }

    function extractEvents(table) {
        if (!table) return [];
        const indexes = {
            title: resolveColumnIndex(table, "title"),
            date: resolveColumnIndex(table, "date"),
            status: resolveColumnIndex(table, "status")
        };
        if (indexes.title < 0 || indexes.date < 0 || indexes.status < 0) return [];

        const events = [];
        getDataRows(table).forEach(function (row, rowIndex) {
            const titleCell = getCell(row, indexes.title);
            const dateCell = getCell(row, indexes.date);
            const statusCell = getCell(row, indexes.status);
            if (!titleCell || !dateCell || !statusCell) return;

            const date = parseDateText(dateCell.textContent);
            if (!date) return;

            const title = String(titleCell.textContent || "").replace(/\s+/g, " ").trim();
            if (!title) return;

            events.push({
                id: "pmk029-event-" + rowIndex + "-" + date.getTime(),
                title: title,
                date: dateOnly(date),
                status: statusKeyFromText(getRawStatusText(statusCell))
            });
        });
        return events;
    }

    function monthLabel(year, month) {
        return new Intl.DateTimeFormat(detectLanguage() === "en" ? "en-GB" : "fr-FR", {
            month: "long",
            year: "numeric"
        }).format(new Date(year, month, 1));
    }

    function weekdayLabels() {
        return detectLanguage() === "en"
            ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            : ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    }

    function getWindowMonths(anchorYear, anchorMonth, count) {
        const months = [];
        for (let offset = 0; offset < count; offset += 1) {
            const cursor = new Date(anchorYear, anchorMonth - offset, 1);
            months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
        }
        return months;
    }

    function eventsForMonth(events, year, month) {
        return events.filter(function (event) {
            return event.date.getFullYear() === year && event.date.getMonth() === month;
        });
    }

    function eventChip(event, className) {
        const node = document.createElement("span");
        node.className = className;
        const bg = getColor(event.status);
        node.style.setProperty("--pmk029-event-bg", bg);
        node.style.setProperty("--pmk029-event-fg", contrastColor(bg));
        node.textContent = (currentConfig.display.statusIcons !== false ? (STATUS_ICONS[event.status] || STATUS_ICONS.other) + " " : "") + event.title;
        node.title = event.title;
        return node;
    }

    function renderCalendarMonth(container, events, year, month) {
        const block = document.createElement("section");
        block.className = "pmk029-month-block";

        const heading = document.createElement("h4");
        heading.textContent = monthLabel(year, month);
        block.appendChild(heading);

        const wrap = document.createElement("div");
        wrap.className = "pmk029-calendar-grid-wrap";

        const grid = document.createElement("div");
        grid.className = "pmk029-calendar-grid";
        weekdayLabels().forEach(function (label) {
            const day = document.createElement("div");
            day.className = "pmk029-calendar-weekday";
            day.textContent = label;
            grid.appendChild(day);
        });

        const first = new Date(year, month, 1);
        const firstDay = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i += 1) {
            const empty = document.createElement("div");
            empty.className = "pmk029-calendar-day is-empty";
            empty.setAttribute("aria-hidden", "true");
            grid.appendChild(empty);
        }

        for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
            const day = document.createElement("div");
            day.className = "pmk029-calendar-day";

            const number = document.createElement("span");
            number.className = "pmk029-day-number";
            number.textContent = String(dayNumber);
            day.appendChild(number);

            const list = document.createElement("ul");
            list.className = "pmk029-event-list";

            events.filter(function (event) {
                return event.date.getDate() === dayNumber;
            }).forEach(function (event) {
                const li = document.createElement("li");
                const chip = eventChip(event, "pmk029-event");
                li.appendChild(chip);
                list.appendChild(li);
            });

            day.appendChild(list);
            grid.appendChild(day);
        }

        wrap.appendChild(grid);
        block.appendChild(wrap);
        container.appendChild(block);
    }

    function renderAgendaMonth(container, events, year, month) {
        const block = document.createElement("section");
        block.className = "pmk029-agenda-month";

        const heading = document.createElement("h4");
        heading.textContent = monthLabel(year, month);
        block.appendChild(heading);

        const list = document.createElement("ul");
        list.className = "pmk029-agenda-list";

        if (!events.length) {
            const li = document.createElement("li");
            li.className = "pmk029-agenda-item";
            li.textContent = t("Aucun fascicule daté pour ce mois.", "No dated issue for this month.");
            list.appendChild(li);
        } else {
            const grouped = new Map();
            events.slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (event) {
                const key = event.date.getFullYear() + "-" + event.date.getMonth() + "-" + event.date.getDate();
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(event);
            });

            grouped.forEach(function (dayEvents) {
                const li = document.createElement("li");
                li.className = "pmk029-agenda-item";

                const date = document.createElement("div");
                date.className = "pmk029-agenda-date";
                date.textContent = new Intl.DateTimeFormat(detectLanguage() === "en" ? "en-GB" : "fr-FR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit"
                }).format(dayEvents[0].date);

                const eventWrap = document.createElement("div");
                dayEvents.forEach(function (event) {
                    eventWrap.appendChild(eventChip(event, "pmk029-agenda-event"));
                });

                li.appendChild(date);
                li.appendChild(eventWrap);
                list.appendChild(li);
            });
        }

        block.appendChild(list);
        container.appendChild(block);
    }

    function buildCalendarPanel(table) {
        if (!(currentConfig.calendar && currentConfig.calendar.enabled !== false)) return;
        if (!table) return;

        const holder = table.closest("#subscription_issues_panel, .tableau-fasci") || table;
        if (!holder) return;

        let panel = document.getElementById("pmk029-calendar-panel");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "pmk029-calendar-panel";
            panel.className = "pmk029-calendar-panel";
            panel.setAttribute("data-pmk-module", MODULE_ID);
            panel.setAttribute("data-pmk-version", MODULE_VERSION);
            if (holder.id === "subscription_issues_panel" || holder.classList.contains("tableau-fasci")) {
                holder.appendChild(panel);
            } else if (holder.parentNode) {
                holder.parentNode.insertBefore(panel, holder.nextSibling);
            } else {
                return;
            }
        }

        const oldAnchor = panel.dataset.anchorDate;
        const initialEvents = extractEvents(table);
        let anchorDate;
        if (oldAnchor && /^\d{4}-\d{2}$/.test(oldAnchor)) {
            const parts = oldAnchor.split("-").map(Number);
            anchorDate = new Date(parts[0], parts[1] - 1, 1);
        } else if (currentConfig.calendar && currentConfig.calendar.anchorMode === "latest" && initialEvents.length) {
            const latest = initialEvents.reduce(function (best, event) {
                return !best || event.date > best.date ? event : best;
            }, null);
            anchorDate = new Date(latest.date.getFullYear(), latest.date.getMonth(), 1);
        } else {
            // Valeur historique : mois civil courant, puis les mois précédents.
            anchorDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        }

        panel.innerHTML = "";

        const header = document.createElement("div");
        header.className = "pmk029-calendar-header";

        const titleWrap = document.createElement("div");
        titleWrap.className = "pmk029-calendar-title-wrap";
        const title = document.createElement("h3");
        title.className = "pmk029-calendar-title";
        title.textContent = t("Calendrier des fascicules", "Issue calendar");
        titleWrap.appendChild(title);

        const actions = document.createElement("div");
        actions.className = "pmk029-calendar-actions";

        const body = document.createElement("div");
        body.className = "pmk029-calendar-body";
        body.id = "pmk029-calendar-body";

        const collapsible = currentConfig.calendar.collapsible !== false;
        let expanded = currentConfig.calendar.expandedByDefault !== false;
        if (panel.dataset.expanded === "0") expanded = false;
        if (panel.dataset.expanded === "1") expanded = true;

        if (collapsible) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "btn btn-default btn-sm";
            toggle.setAttribute("aria-controls", body.id);
            toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
            toggle.innerHTML = '<i class="fa fa-chevron-' + (expanded ? "up" : "down") + '" aria-hidden="true"></i> <span>' +
                (expanded ? t("Replier", "Collapse") : t("Déplier", "Expand")) + "</span>";
            toggle.addEventListener("click", function () {
                expanded = !expanded;
                panel.dataset.expanded = expanded ? "1" : "0";
                body.hidden = !expanded;
                toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
                toggle.innerHTML = '<i class="fa fa-chevron-' + (expanded ? "up" : "down") + '" aria-hidden="true"></i> <span>' +
                    (expanded ? t("Replier", "Collapse") : t("Déplier", "Expand")) + "</span>";
            });
            actions.appendChild(toggle);
        }

        header.appendChild(titleWrap);
        header.appendChild(actions);
        panel.appendChild(header);
        body.hidden = !expanded;
        panel.appendChild(body);

        const navigation = document.createElement("div");
        navigation.className = "pmk029-calendar-navigation";

        const previous = document.createElement("button");
        previous.type = "button";
        previous.className = "btn btn-default btn-sm";
        previous.innerHTML = '<i class="fa fa-chevron-left" aria-hidden="true"></i> ' + t("Précédent", "Previous");

        const range = document.createElement("p");
        range.className = "pmk029-calendar-range";

        const next = document.createElement("button");
        next.type = "button";
        next.className = "btn btn-default btn-sm";
        next.innerHTML = t("Suivant", "Next") + ' <i class="fa fa-chevron-right" aria-hidden="true"></i>';

        navigation.appendChild(previous);
        navigation.appendChild(range);
        navigation.appendChild(next);
        body.appendChild(navigation);

        const desktop = document.createElement("div");
        desktop.className = "pmk029-calendar-months";
        const agenda = document.createElement("div");
        agenda.className = "pmk029-agenda";
        body.appendChild(desktop);
        body.appendChild(agenda);

        function render() {
            const count = Math.min(12, Math.max(1, Number(currentConfig.calendar.months) || 6));
            const months = getWindowMonths(anchorDate.getFullYear(), anchorDate.getMonth(), count);
            const events = extractEvents(table);
            desktop.innerHTML = "";
            agenda.innerHTML = "";
            body.querySelectorAll(".pmk029-calendar-warning").forEach(function (node) { node.remove(); });

            if (!events.length && getDataRows(table).length) {
                const warning = document.createElement("div");
                warning.className = "alert alert-warning pmk029-calendar-warning";
                warning.textContent = t(
                    "Aucun fascicule daté n'a pu être lu dans le tableau. Vérifier la structure des colonnes après une mise à jour Koha.",
                    "No dated issue could be read from the table. Check the column structure after a Koha update."
                );
                body.insertBefore(warning, desktop);
            }

            months.forEach(function (monthInfo) {
                const monthEvents = eventsForMonth(events, monthInfo.year, monthInfo.month);
                renderCalendarMonth(desktop, monthEvents, monthInfo.year, monthInfo.month);
                renderAgendaMonth(agenda, monthEvents, monthInfo.year, monthInfo.month);
            });

            const oldest = months[months.length - 1];
            range.textContent = monthLabel(oldest.year, oldest.month) + " — " + monthLabel(months[0].year, months[0].month);
            panel.dataset.anchorDate = anchorDate.getFullYear() + "-" + String(anchorDate.getMonth() + 1).padStart(2, "0");
        }

        previous.addEventListener("click", function () {
            const step = Math.min(12, Math.max(1, Number(currentConfig.calendar.navigationStep) || 6));
            anchorDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - step, 1);
            render();
        });

        next.addEventListener("click", function () {
            const step = Math.min(12, Math.max(1, Number(currentConfig.calendar.navigationStep) || 6));
            anchorDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + step, 1);
            render();
        });

        render();
        mountContextAccess(actions);
    }

    function mountContextAccess(anchor) {
        if (!anchor) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "serials-tracking-calendar",
                context: {
                    page: DETAIL_PAGE_ID,
                    sectionId: "calendar"
                }
            });
        } catch (_) {}
    }

    function restorePlannedDateLabels() {
        renamedDateTextNodes.forEach(function (entry) {
            if (entry && entry.node && entry.node.isConnected) entry.node.nodeValue = entry.original;
        });
        renamedDateTextNodes = [];
    }

    function applyPlannedDateLabelCompatibility() {
        restorePlannedDateLabels();
        const cfg = currentConfig.compatibility || {};
        if (cfg.renamePlannedDate === false) return;

        const replacements = [
            { from: "Date prévue", to: "Date de réception" },
            { from: "Planned date", to: "Received date" }
        ];
        document.querySelectorAll("#subscription_issues_panel th, .tableau-fasci th, table.subscription-year-table th").forEach(function (header) {
            const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                let value = String(node.nodeValue || "");
                let changed = value;
                replacements.forEach(function (rule) { changed = changed.split(rule.from).join(rule.to); });
                if (changed !== value) {
                    renamedDateTextNodes.push({ node: node, original: value });
                    node.nodeValue = changed;
                }
            }
        });
    }

    function installLegacySectionToggleCompatibility() {
        if (document.documentElement.dataset.pmk029SectionToggleDelegation === "1") return;
        document.documentElement.dataset.pmk029SectionToggleDelegation = "1";
        document.addEventListener("click", function (event) {
            const page = currentPageDefinition();
            if (!page || !isPageEnabled(currentConfig, page.id)) return;
            const cfg = currentConfig.compatibility || {};
            if (cfg.legacySectionToggles === false) return;

            const button = event.target.closest && event.target.closest(".bouton");
            const sections = Array.from(document.querySelectorAll(".sectionz"));
            if (!sections.length) return;

            if (button) {
                const section = button.parentElement && button.parentElement.nextElementSibling;
                if (!section || !section.classList || !section.classList.contains("sectionz")) return;
                sections.forEach(function (candidate) {
                    if (candidate !== section) candidate.style.display = "none";
                });
                section.style.display = section.style.display === "block" ? "none" : "block";
                return;
            }

            sections.forEach(function (section) { section.style.display = "none"; });
        });
    }

    let historicalLayoutState = null;

    function installManagementStyles() {
        if (document.getElementById("pmk029-management-style")) return;
        const style = document.createElement("style");
        style.id = "pmk029-management-style";
        style.textContent = `
            .three-column-container.pmk029-historical-layout { display: flex; flex-wrap: wrap; gap: var(--pmk029-layout-gap, 20px); }
            .three-column-container.pmk029-historical-layout > .column { flex: 1; min-width: 150px; }
            .three-column-container.pmk029-historical-layout .column-content { background-color: #f9f9f9; padding: 10px; }
            .three-column-container.pmk029-historical-layout .section-header { background-color: #408540; color: #ffffff; padding: 10px; }
            .three-column-container.pmk029-historical-layout .section-header .pmk-context-config { color: inherit !important; float: right; }
            .pmk029-hidden-native-tab { display: none !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeManagementStyles() {
        const style = document.getElementById("pmk029-management-style");
        if (style) style.remove();
    }

    function getLayoutSections() {
        const sections = currentConfig.layout && Array.isArray(currentConfig.layout.sections)
            ? currentConfig.layout.sections
            : DEFAULT_CONFIG.layout.sections;
        return DEFAULT_CONFIG.layout.sections.map(function (defaultItem) {
            const stored = sections.find(function (item) { return item && item.key === defaultItem.key; });
            return Object.assign({}, defaultItem, stored || {});
        });
    }

    function sectionLabel(section) {
        const fallback = DEFAULT_CONFIG.layout.sections.find(function (item) { return item.key === section.key; }) || section;
        const value = detectLanguage() === "en" ? section.labelEn : section.labelFr;
        const fallbackValue = detectLanguage() === "en" ? fallback.labelEn : fallback.labelFr;
        return String(value || fallbackValue || section.key);
    }

    function findTabItem(tabId) {
        const tab = document.getElementById(tabId);
        return tab ? tab.closest("li") : null;
    }

    function restoreHistoricalLayout() {
        if (!historicalLayoutState) {
            document.querySelectorAll(".pmk029-hidden-native-tab").forEach(function (node) { node.classList.remove("pmk029-hidden-native-tab"); });
            removeManagementStyles();
            return;
        }
        historicalLayoutState.sections.forEach(function (state) {
            if (!state.panel) return;
            while (state.content.firstChild) state.panel.appendChild(state.content.firstChild);
            state.panel.hidden = state.originalHidden;
        });
        if (historicalLayoutState.container) historicalLayoutState.container.remove();
        historicalLayoutState.hiddenTabs.forEach(function (item) { if (item) item.classList.remove("pmk029-hidden-native-tab"); });
        historicalLayoutState = null;
        removeManagementStyles();
    }

    function cleanupLayout() { restoreHistoricalLayout(); }

    function legacyLayoutAlreadyApplied() {
        const info = document.getElementById("subscription_info_panel");
        return Boolean(info && info.querySelector(":scope > .three-column-container"));
    }

    function makeHistoricalBlock(section, contentClass) {
        const spacer = document.createElement("div");
        spacer.className = "column-content";
        const heading = document.createElement("h2");
        heading.className = "section-header";
        heading.textContent = sectionLabel(section);
        const content = document.createElement("div");
        if (contentClass) content.className = contentClass;
        return { spacer: spacer, heading: heading, content: content };
    }

    function appendHistoricalBlock(column, block, enabled) {
        column.appendChild(block.spacer);
        column.appendChild(block.heading);
        column.appendChild(block.content);
        if (enabled === false) {
            block.spacer.hidden = true;
            block.heading.hidden = true;
            block.content.hidden = true;
        }
    }

    function applyDetailLayout() {
        cleanupLayout();
        const layout = currentConfig.layout || {};
        if (layout.enabled === false) return;

        const infoPanel = document.getElementById("subscription_info_panel");
        const planningPanel = document.getElementById("subscription_planning_panel");
        const issuesPanel = document.getElementById("subscription_issues_panel");
        const summaryPanel = document.getElementById("subscription_summary_panel");
        if (!infoPanel) return;

        const sections = getLayoutSections();
        const byKey = Object.fromEntries(sections.map(function (section) { return [section.key, section]; }));
        const container = document.createElement("div");
        container.className = "three-column-container pmk029-historical-layout";
        container.style.setProperty("--pmk029-layout-gap", Math.min(60, Math.max(0, Number(layout.gap) || 20)) + "px");

        const column1 = document.createElement("div"); column1.className = "column";
        const column2 = document.createElement("div"); column2.className = "column";
        const column3 = document.createElement("div"); column3.className = "column";

        const blockInfo = makeHistoricalBlock(byKey.information || DEFAULT_CONFIG.layout.sections[0]);
        const blockPlanning = makeHistoricalBlock(byKey.planning || DEFAULT_CONFIG.layout.sections[1]);
        const blockIssues = makeHistoricalBlock(byKey.issues || DEFAULT_CONFIG.layout.sections[2], "tableau-fasci");
        const blockSummary = makeHistoricalBlock(byKey.summary || DEFAULT_CONFIG.layout.sections[3]);

        appendHistoricalBlock(column1, blockInfo, !byKey.information || byKey.information.enabled !== false);
        appendHistoricalBlock(column2, blockPlanning, !byKey.planning || byKey.planning.enabled !== false);
        appendHistoricalBlock(column2, blockIssues, !byKey.issues || byKey.issues.enabled !== false);
        appendHistoricalBlock(column3, blockSummary, !byKey.summary || byKey.summary.enabled !== false);
        container.appendChild(column1);
        container.appendChild(column2);
        container.appendChild(column3);

        const sectionStates = [];
        [
            { panel: infoPanel, target: blockInfo.content },
            { panel: planningPanel, target: blockPlanning.content },
            { panel: issuesPanel, target: blockIssues.content },
            { panel: summaryPanel, target: blockSummary.content }
        ].forEach(function (entry) {
            if (!entry.panel) return;
            sectionStates.push({ panel: entry.panel, content: entry.target, originalHidden: entry.panel.hidden });
            while (entry.panel.firstChild) entry.target.appendChild(entry.panel.firstChild);
            if (entry.panel !== infoPanel) entry.panel.hidden = true;
        });

        infoPanel.appendChild(container);
        installManagementStyles();
        mountContextButton(blockInfo.heading, "layout");

        const hiddenTabs = [];
        ["planning", "issues", "summary"].forEach(function (key) {
            const meta = SECTION_META[key];
            const tabItem = meta ? findTabItem(meta.tabId) : null;
            if (tabItem && layout.hideNativeTabs !== false) {
                tabItem.classList.add("pmk029-hidden-native-tab");
                hiddenTabs.push(tabItem);
            }
        });
        historicalLayoutState = { container: container, sections: sectionStates, hiddenTabs: hiddenTabs };
    }

    function mountContextButton(anchor, sectionId) {
        if (!anchor || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "serials-management-" + sectionId,
                context: { page: currentPageDefinition() && currentPageDefinition().id, sectionId: sectionId }
            });
        } catch (_) {}
    }

    function normalizedStatusCodes() {
        const raw = currentConfig.bulletinage && currentConfig.bulletinage.statusCodes;
        const seen = new Set();
        return String(raw || "")
            .split(/[;,\s]+/)
            .map(function (value) { return value.trim(); })
            .filter(function (value) {
                if (!/^\d+$/.test(value) || seen.has(value)) return false;
                seen.add(value);
                return true;
            });
    }

    function rewriteBulletinageLinks() {
        const cfg = currentConfig.bulletinage || {};
        if (cfg.enabled === false || cfg.rewriteStatuses === false) return;
        const codes = normalizedStatusCodes();
        if (!codes.length) return;
        document.querySelectorAll('a[href*="serials-edit.pl"]').forEach(function (link) {
            const href = link.getAttribute("href");
            if (!href || href.indexOf("subscriptionid=") === -1) return;
            try {
                const url = new URL(href, window.location.href);
                url.searchParams.set("serstatus", codes.join(","));
                const rendered = url.origin === window.location.origin
                    ? url.pathname + url.search + url.hash
                    : url.toString();
                link.setAttribute("href", rendered);
                link.dataset.pmk029Statuses = codes.join(",");
            } catch (_) {}
        });
    }

    function getPriceColumnIndex(table) {
        const headers = getTableHeaders(table);
        for (let i = 0; i < headers.length; i += 1) {
            const identity = headerIdentity(headers[i]);
            if (PRICE_COLUMN_ALIASES.some(function (alias) { return identity.indexOf(normalizeText(alias)) !== -1; })) return i;
        }
        return -1;
    }

    function subscriptionIdFromHref(href) {
        if (!href) return "";
        try {
            const url = new URL(href, window.location.href);
            return url.searchParams.get("subscriptionid") || url.searchParams.get("subscription_id") || "";
        } catch (_) { return ""; }
    }

    function subscriptionIdFromPage() {
        const query = new URLSearchParams(window.location.search);
        const fromQuery = query.get("subscriptionid") || query.get("subscription_id");
        if (fromQuery) return fromQuery;
        const items = Array.from(document.querySelectorAll("#subscription_info_panel li, .three-column-container li, div.rows li"));
        const labels = ["abonnement n", "subscription no", "subscription number"];
        for (const item of items) {
            const text = normalizeText(item.textContent);
            if (!labels.some(function (label) { return text.indexOf(label) !== -1; })) continue;
            const match = String(item.textContent || "").match(/\b(\d+)\b/);
            if (match) return match[1];
        }
        return "";
    }

    function priceLabelMatches(value) {
        const normalized = normalizeText(value);
        if (!normalized) return false;
        return PRICE_LABEL_ALIASES.some(function (alias) {
            return normalized.indexOf(normalizeText(alias)) !== -1;
        });
    }

    function cleanPriceText(value) {
        return String(value == null ? "" : value)
            .replace(/\u00a0/g, " ")
            .replace(/^\s*[:\-–—]\s*/, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function findDetailPriceInDocument(rootDocument) {
        const scope = rootDocument && typeof rootDocument.querySelectorAll === "function"
            ? rootDocument
            : document;
        const roots = Array.from(scope.querySelectorAll(
            "#subscription_info_panel, .three-column-container, div.rows"
        ));
        if (!roots.length) roots.push(scope);

        for (const root of roots) {
            // Présentation Koha classique : <li><span class="label">Prix fascicule :</span> valeur</li>
            const items = Array.from(root.querySelectorAll("li, .form-group, .row"));
            for (const item of items) {
                const label = item.querySelector(".label, .field-label, label, strong");
                if (!label || !priceLabelMatches(label.textContent)) continue;
                const cloneItem = item.cloneNode(true);
                const cloneLabel = cloneItem.querySelector(".label, .field-label, label, strong");
                if (cloneLabel) cloneLabel.remove();
                const value = cleanPriceText(cloneItem.textContent);
                if (value) return value;
            }

            // Fallback pour les rendus <dl><dt>...</dt><dd>...</dd></dl>.
            const terms = Array.from(root.querySelectorAll("dt"));
            for (const term of terms) {
                if (!priceLabelMatches(term.textContent)) continue;
                const valueNode = term.nextElementSibling;
                if (valueNode && valueNode.matches("dd")) {
                    const value = cleanPriceText(valueNode.textContent);
                    if (value) return value;
                }
            }

            // Fallback pour une éventuelle présentation tabulaire.
            const rows = Array.from(root.querySelectorAll("tr"));
            for (const row of rows) {
                const cells = Array.from(row.cells || []);
                if (cells.length < 2 || !priceLabelMatches(cells[0].textContent)) continue;
                const value = cleanPriceText(cells.slice(1).map(function (cell) {
                    return cell.textContent;
                }).join(" "));
                if (value) return value;
            }
        }

        return "";
    }

    function findDetailPrice() {
        return findDetailPriceInDocument(document);
    }

    function detailUrlForSubscription(subscriptionId) {
        const id = String(subscriptionId || "").trim();
        if (!id) return "";
        try {
            const url = new URL(DETAIL_PAGE_PATH, window.location.origin);
            url.searchParams.set("subscriptionid", id);
            return url.pathname + url.search;
        } catch (_) {
            return DETAIL_PAGE_PATH + "?subscriptionid=" + encodeURIComponent(id);
        }
    }

    async function fetchDetailPriceForSubscription(subscriptionId, source) {
        const id = String(subscriptionId || "").trim();
        const cfg = currentConfig.priceContext || {};
        if (!id || cfg.enabled === false || typeof window.fetch !== "function") return "";

        // Si on est déjà sur la fiche de ce même abonnement, inutile de refaire une requête.
        if (window.location.pathname === DETAIL_PAGE_PATH && subscriptionIdFromPage() === id) {
            const localPrice = findDetailPrice();
            if (localPrice) {
                writePriceContext(localPrice, id, source || "subscription-detail-current");
                return localPrice;
            }
        }

        // Mutualise les requêtes si l'initialisation et un clic utilisateur demandent
        // le même abonnement simultanément.
        if (detailPriceFetches.has(id)) return detailPriceFetches.get(id);

        const request = (async function () {
            try {
                const url = detailUrlForSubscription(id);
                if (!url) return "";
                const response = await window.fetch(url, {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store"
                });
                if (!response.ok) return "";

                const html = await response.text();
                if (!html) return "";

                const parsed = new DOMParser().parseFromString(html, "text/html");
                const price = findDetailPriceInDocument(parsed);
                if (!price) return "";

                writePriceContext(price, id, source || "serials-edit-direct");
                return price;
            } catch (error) {
                try {
                    console.warn("[PMK029] Impossible de récupérer le prix fascicule de l'abonnement " + id, error);
                } catch (_) {}
                return "";
            } finally {
                detailPriceFetches.delete(id);
            }
        })();

        detailPriceFetches.set(id, request);
        return request;
    }

    function captureDetailPriceContext(source) {
        if (window.location.pathname !== DETAIL_PAGE_PATH) return "";
        const price = findDetailPrice();
        if (!price) return "";
        writePriceContext(price, subscriptionIdFromPage(), source || "subscription-detail");
        return price;
    }

    function writePriceContext(price, subscriptionId, source) {
        const cfg = currentConfig.priceContext || {};
        if (cfg.enabled === false || !String(price || "").trim()) return;
        const ttlMinutes = Math.min(1440, Math.max(5, Number(cfg.ttlMinutes) || 60));
        const now = Date.now();
        const context = {
            version: 1,
            price: String(price).trim(),
            subscriptionId: String(subscriptionId || ""),
            source: String(source || ""),
            capturedAt: now,
            expiresAt: now + ttlMinutes * 60000
        };
        const key = String(cfg.storageKey || CONTEXT_STORAGE_KEY);
        try { window.sessionStorage.setItem(key, JSON.stringify(context)); } catch (_) {}
        if (cfg.legacyMirror !== false) {
            try { window.localStorage.setItem(LEGACY_PRICE_KEY, context.price); } catch (_) {}
        }
    }

    function readPriceContext() {
        const cfg = currentConfig.priceContext || {};
        const key = String(cfg.storageKey || CONTEXT_STORAGE_KEY);
        try {
            const parsed = JSON.parse(window.sessionStorage.getItem(key) || "null");
            if (!parsed || !parsed.price) return null;
            if (Number(parsed.expiresAt) && Date.now() > Number(parsed.expiresAt)) {
                window.sessionStorage.removeItem(key);
                return null;
            }
            return parsed;
        } catch (_) { return null; }
    }

    function clearPriceContext() {
        const cfg = currentConfig.priceContext || {};
        const key = String(cfg.storageKey || CONTEXT_STORAGE_KEY);
        try { window.sessionStorage.removeItem(key); } catch (_) {}
    }

    function installSearchDelegation() {
        if (document.documentElement.dataset.pmk029SearchDelegation === "1") return;
        document.documentElement.dataset.pmk029SearchDelegation = "1";
        document.addEventListener("click", function (event) {
            if (window.location.pathname !== SEARCH_PAGE_PATH) return;
            if (!isPageEnabled(currentConfig, SEARCH_PAGE_ID)) return;
            const action = event.target.closest('a[href*="serials-edit.pl"], .btn-group a, .btn-group button');
            if (!action) return;
            const row = action.closest("tr");
            if (!row) return;
            const table = row.closest("table");
            if (!(table instanceof HTMLTableElement)) return;
            const index = getPriceColumnIndex(table);
            if (index < 0 || !row.cells[index]) return;
            const link = action.matches('a[href*="serials-edit.pl"]') ? action : row.querySelector('a[href*="serials-edit.pl"]');
            writePriceContext(row.cells[index].textContent, subscriptionIdFromHref(link && link.getAttribute("href")), "serials-search");
        }, true);
    }

    function installDetailDelegation() {
        if (document.documentElement.dataset.pmk029DetailDelegation === "1") return;
        document.documentElement.dataset.pmk029DetailDelegation = "1";

        function captureBeforeBulletinage(event) {
            if (window.location.pathname !== DETAIL_PAGE_PATH) return;
            if (!isPageEnabled(currentConfig, DETAIL_PAGE_ID)) return;
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const action = target.closest(
                '#receive, a[href*="serials-edit.pl"], ' +
                'form[action*="serials-edit.pl"] button, form[action*="serials-edit.pl"] input[type="submit"]'
            );
            if (!action) return;
            captureDetailPriceContext("subscription-detail");
        }

        document.addEventListener("pointerdown", captureBeforeBulletinage, true);
        document.addEventListener("click", captureBeforeBulletinage, true);
    }

    function refreshSearchPage() {
        if (!isPageEnabled(currentConfig, SEARCH_PAGE_ID)) return;
        rewriteBulletinageLinks();
        installSearchDelegation();
    }

    function observeSearchPage() {
        if (observers.length) disconnectObservers();
        const root = document.querySelector("main") || document.body;
        if (!root) return;
        const observer = new MutationObserver(function () {
            if (mutationTimer) clearTimeout(mutationTimer);
            mutationTimer = window.setTimeout(function () {
                mutationTimer = null;
                refreshSearchPage();
            }, 180);
        });
        observer.observe(root, { childList: true, subtree: true });
        observers.push(observer);
    }

    let receivingShortcutInstalled = false;
    let receivingProtectionLocked = true;

    function receivingCfg() {
        return currentConfig.receivingAssistant || {};
    }

    function receivingButtonText(group, frFallback, enFallback) {
        const lang = detectLanguage();
        if (lang === "en") return String(group && group.buttonLabelEn || enFallback);
        return String(group && group.buttonLabelFr || frFallback);
    }

    function receivingStyleConfig() {
        const cfg = receivingCfg().buttons || {};
        return {
            background: String(cfg.background || "#4CAF50"),
            hoverBackground: String(cfg.hoverBackground || "#45a049"),
            color: String(cfg.color || "#ffffff")
        };
    }

    function applyReceivingButtonStyles(button) {
        const colors = receivingStyleConfig();
        button.style.backgroundColor = colors.background;
        button.style.border = "none";
        button.style.color = colors.color;
        button.style.padding = "5px 5px";
        button.style.textAlign = "center";
        button.style.textDecoration = "none";
        button.style.display = "inline-block";
        button.style.fontSize = "13px";
        button.style.margin = "2px 2px";
        button.style.cursor = "pointer";
        button.style.borderRadius = "5px";
        button.style.transition = "background-color 0.3s ease";
        button.addEventListener("mouseover", function () { button.style.backgroundColor = colors.hoverBackground; });
        button.addEventListener("mouseout", function () { button.style.backgroundColor = colors.background; });
    }

    function receivingItemSections() {
        const legends = Array.from(document.querySelectorAll("legend")).filter(function (legend) {
            const text = normalizeText(legend.textContent);
            return text.includes("exemplaire") || text.includes("item");
        });
        return legends.map(function (legend, index) {
            return { legend: legend, section: legend.closest("fieldset") || legend.parentElement, index: index };
        }).filter(function (entry) { return entry.section; });
    }

    function receivingFindField(section, labelText) {
        const wanted = normalizeText(labelText);
        if (!wanted || !section) return null;
        const label = Array.from(section.querySelectorAll("label")).find(function (candidate) {
            return normalizeText(candidate.textContent) === wanted;
        });
        if (!label) return null;
        const li = label.closest("li") || label.parentElement;
        if (!li) return null;
        return li.querySelector('input:not([type="hidden"]), select, textarea');
    }

    function receivingApplyField(section, fieldLabel, value, mode) {
        const input = receivingFindField(section, fieldLabel);
        if (!input) return false;
        const text = String(value == null ? "" : value);
        if (input.tagName === "SELECT") {
            const exact = Array.from(input.options).find(function (option) { return String(option.value) === text; });
            if (exact) {
                input.value = exact.value;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
            }
            return false;
        }
        const selectedMode = String(mode || "legacy");
        if (selectedMode === "replace") input.value = text;
        else if (selectedMode === "append" || selectedMode === "legacy") input.value = input.value.trim() ? input.value.trim() + " " + text : text;
        else input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function receivingExtractNumber(text) {
        const patterns = [/N°\s*(\d+)(?:\s*-\s*(.*))?/i, /N°\s*(\d+)(?:-(\d+))?/i];
        for (const pattern of patterns) {
            const match = String(text || "").match(pattern);
            if (match) return { number: String(match[1]).trim(), fullText: match[2] ? String(match[2]).trim() : "" };
        }
        return null;
    }

    function receivingFormatDate(dateString) {
        if (!dateString) return "Invalid Date";
        const date = new Date(dateString);
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Invalid Date";
        const locale = String(receivingCfg().fill && receivingCfg().fill.dateLocale || "fr-FR");
        try { return date.toLocaleDateString(locale); } catch (_) { return date.toLocaleDateString("fr-FR"); }
    }

    function receivingPrice() {
        const structured = readPriceContext();
        const currentSubscriptionId = subscriptionIdFromPage();

        if (structured && structured.price) {
            const storedSubscriptionId = String(structured.subscriptionId || "");

            // Sur serials-edit.pl, un prix n'est considéré fiable que s'il appartient
            // explicitement à l'abonnement courant. Un ancien contexte ne doit jamais
            // contaminer le bulletinage d'un autre abonnement.
            if (currentSubscriptionId) {
                if (storedSubscriptionId && currentSubscriptionId === storedSubscriptionId) {
                    return String(structured.price);
                }
                return "";
            }

            // Sans identifiant d'abonnement exploitable, on conserve la compatibilité
            // historique avec le contexte structuré.
            return String(structured.price);
        }

        // Ancien 073/030 : ne servir de secours que lorsqu'on ne connaît pas
        // l'abonnement courant. Avec un subscriptionid présent, on préfère toujours
        // interroger directement la fiche Koha pour éviter un prix périmé.
        if (!currentSubscriptionId) {
            try { return String(window.localStorage.getItem(LEGACY_PRICE_KEY) || ""); } catch (_) {}
        }
        return "";
    }

    async function ensureReceivingPrice() {
        const currentSubscriptionId = subscriptionIdFromPage();
        let price = receivingPrice();
        if (price) return price;

        if (currentSubscriptionId) {
            price = await fetchDetailPriceForSubscription(currentSubscriptionId, "serials-edit-direct");
            if (price) return price;
        }

        return "";
    }

    async function receivingFillSection(entry) {
        const cfg = receivingCfg().fill || {};
        if (cfg.enabled === false) return;

        // Le prix est indépendant de la forme du numéro de fascicule :
        // même si serialseq n'est pas de type "N° 123", p - Prix doit être renseigné.
        if (cfg.priceEnabled !== false) {
            const price = String(await ensureReceivingPrice() || "").trim().replace(/,/g, ".");
            if (price) receivingApplyField(entry.section, cfg.priceFieldLabel || "p - Prix", price, "legacy");
        }

        const serialSeqInputs = document.querySelectorAll('input[name="serialseq"]');
        const plannedDateInputs = document.querySelectorAll('input[name="planneddate"]');
        const serialSeqInput = serialSeqInputs[entry.index];
        const plannedDateInput = plannedDateInputs[entry.index];

        if (!serialSeqInput || !plannedDateInput) return;

        const extracted = receivingExtractNumber(serialSeqInput.value);
        if (extracted) {
            const plannedDate = plannedDateInput.value;
            const formattedInitialDate = receivingFormatDate(plannedDate);
            const formattedValue = `${extracted.number} ${extracted.fullText} (${formattedInitialDate})`;

            if (cfg.issueNumberEnabled !== false) {
                receivingApplyField(entry.section, cfg.issueNumberFieldLabel || "v - Numéro de la revue", formattedValue, "legacy");
            }
            if (cfg.callNumberEnabled !== false) {
                receivingApplyField(entry.section, cfg.callNumberFieldLabel || "k - Cote", extracted.number, "legacy");
            }
        }

        if (cfg.setPlannedDateToday !== false) {
            plannedDateInput.value = new Date().toISOString().split("T")[0];
        }
    }

    function receivingAppendMarker(entry, marker) {
        const serialSeqInputs = document.querySelectorAll('input[name="serialseq"]');
        const serialSeqInput = serialSeqInputs[entry.index];
        if (serialSeqInput) serialSeqInput.value = `${serialSeqInput.value.trim()} ${marker}`;

        const cfg = receivingCfg().fill || {};
        const callField = receivingFindField(entry.section, cfg.callNumberFieldLabel || "k - Cote");
        if (callField && callField.tagName !== "SELECT") callField.value = `${String(callField.value || "").trim()} ${marker}`;
        const issueField = receivingFindField(entry.section, cfg.issueNumberFieldLabel || "v - Numéro de la revue");
        if (issueField && issueField.tagName !== "SELECT") {
            const currentValue = String(issueField.value || "").trim();
            const position = currentValue.indexOf("(");
            if (position !== -1) issueField.value = `${currentValue.slice(0, position)} ${marker} ${currentValue.slice(position)}`;
            else issueField.value = `${currentValue} ${marker}`;
        }
    }

    function receivingPresetLabel(preset) {
        return detectLanguage() === "en"
            ? String(preset.labelEn || preset.labelFr || preset.id || "Preset")
            : String(preset.labelFr || preset.labelEn || preset.id || "Préconfiguration");
    }

    function receivingApplyPreset(entry, preset) {
        const values = Array.isArray(preset.values) ? preset.values : [];
        values.forEach(function (setting) {
            if (!setting || setting.enabled === false) return;
            const label = String(setting.fieldLabel || "").trim();
            if (!label) return;
            receivingApplyField(entry.section, label, setting.value, setting.mode || "legacy");
        });
    }

    function receivingTemplate(template, values) {
        return String(template || "").replace(/\{([A-Z_]+)\}/g, function (_, key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] == null ? "" : values[key]) : "{" + key + "}";
        });
    }

    function receivingReportContext() {
        const h1Em = document.querySelector("h1 em");
        const h1 = document.querySelector("h1");
        const h1Text = h1 ? h1.textContent : "";
        const coteMatch = h1Text.match(/:\s*([A-Z]{3})/);
        const user = document.querySelector(".loggedinusername");
        const issue = document.querySelector('input[name="serialseq"]');
        const plannedDate = document.querySelector('input[name="planneddate"]');
        const barcode = document.querySelector('input[name="barcode"]');
        return {
            SUBSCRIPTION: h1Em ? h1Em.textContent : "Nom non disponible",
            CALLNUMBER: coteMatch ? coteMatch[1] : "Côte non disponible",
            USER: user ? user.textContent : "Nom d'utilisateur non disponible",
            ISSUE: issue ? issue.value : "Numéro de fascicule non disponible",
            DATE: plannedDate ? plannedDate.value : "Date de publication non disponible",
            BARCODE: barcode ? barcode.value : "Code-barres non disponible"
        };
    }

    function receivingSendReport() {
        const cfg = receivingCfg().report || {};
        if (cfg.enabled === false) return;
        const values = receivingReportContext();
        const subject = receivingTemplate(cfg.subjectTemplate || DEFAULT_CONFIG.receivingAssistant.report.subjectTemplate, values);
        const body = receivingTemplate(cfg.bodyTemplate || DEFAULT_CONFIG.receivingAssistant.report.bodyTemplate, values);
        const recipients = String(cfg.recipients || DEFAULT_CONFIG.receivingAssistant.report.recipients).trim();
        window.location.href = "mailto:" + recipients + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    }

    function receivingInstallProtectionStyles() {
        if (document.getElementById("pmk029-receiving-protection-style")) return;
        const style = document.createElement("style");
        style.id = "pmk029-receiving-protection-style";
        style.textContent = `.pmk029-receiving-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.05);pointer-events:auto;visibility:visible;opacity:1;transition:visibility 0s,opacity .5s linear;z-index:10}.pmk029-receiving-overlay.hidden{visibility:hidden;opacity:0}.pmk029-receiving-blocked{background-color:#f5f5f5!important;pointer-events:none!important;opacity:.5!important}`;
        (document.head || document.documentElement).appendChild(style);
    }

    function receivingBlockConfiguredFields() {
        const cfg = receivingCfg().protection || {};
        if (cfg.enabled === false) return;
        receivingInstallProtectionStyles();
        const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
        receivingItemSections().forEach(function (entry) {
            fields.forEach(function (field) {
                if (!field || field.enabled === false) return;
                const input = receivingFindField(entry.section, field.label);
                if (input) input.classList.add("pmk029-receiving-blocked");
            });
        });

        const needLink = cfg.requireAddItemLink !== false;
        const addButtonExists = Array.from(document.querySelectorAll("a")).some(function (link) {
            const text = normalizeText(link.textContent);
            return text.includes("ajouter un exemplaire") || text.includes("add item");
        });
        if (cfg.overlayOnFascicleRows !== false && (!needLink || addButtonExists)) {
            document.querySelectorAll("table tbody tr").forEach(function (row) {
                const text = normalizeText(row.textContent);
                if (!(text.includes("fascicule") || text.includes("issue"))) return;
                if (row.querySelector(":scope > .pmk029-receiving-overlay")) return;
                const overlay = document.createElement("div");
                overlay.className = "pmk029-receiving-overlay";
                row.style.position = "relative";
                row.appendChild(overlay);
                row.querySelectorAll("input, select").forEach(function (input) { input.classList.add("pmk029-receiving-blocked"); });
            });
        }
    }

    function receivingToggleProtection() {
        const cfg = receivingCfg().protection || {};
        if (cfg.enabled === false) return;
        const unlockNow = receivingProtectionLocked;
        document.querySelectorAll(".pmk029-receiving-overlay").forEach(function (overlay) {
            overlay.classList.toggle("hidden", unlockNow);
        });
        const scopeAll = String(cfg.shortcutScope || "all") === "all";
        const inputs = scopeAll
            ? document.querySelectorAll("input, select")
            : document.querySelectorAll(".pmk029-receiving-blocked, .pmk029-receiving-unlocked");
        inputs.forEach(function (input) {
            if (unlockNow) {
                input.classList.remove("pmk029-receiving-blocked");
                input.classList.add("pmk029-receiving-unlocked");
                input.style.pointerEvents = "auto";
                input.style.opacity = "1";
            } else {
                input.classList.remove("pmk029-receiving-unlocked");
                input.classList.add("pmk029-receiving-blocked");
                input.style.removeProperty("pointer-events");
                input.style.removeProperty("opacity");
            }
        });
        receivingProtectionLocked = !unlockNow;
    }

    function receivingInstallShortcut() {
        if (receivingShortcutInstalled) return;
        receivingShortcutInstalled = true;
        document.addEventListener("keydown", function (event) {
            if (window.location.pathname !== EDIT_PAGE_PATH) return;
            const cfg = receivingCfg().protection || {};
            if (cfg.enabled === false || cfg.unlockShortcutEnabled === false) return;
            const key = String(cfg.unlockKey || "U").toLowerCase();
            if (event.ctrlKey && event.shiftKey && !event.altKey && String(event.key || "").toLowerCase() === key) {
                event.preventDefault();
                receivingToggleProtection();
            }
        });
    }

    function cleanupReceivingAssistant() {
        document.querySelectorAll(".pmk029-receiving-generated").forEach(function (node) { node.remove(); });
        document.querySelectorAll(".pmk029-receiving-overlay").forEach(function (node) { node.remove(); });
        document.querySelectorAll(".pmk029-receiving-blocked").forEach(function (node) {
            node.classList.remove("pmk029-receiving-blocked", "pmk029-receiving-unlocked");
            node.style.removeProperty("pointer-events");
            node.style.removeProperty("opacity");
        });
        const style = document.getElementById("pmk029-receiving-protection-style");
        if (style) style.remove();
        receivingProtectionLocked = true;
    }

    function receivingAddButton(entry, text, action, legacyId, extraClass) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = "pmk029-receiving-generated" + (extraClass ? " " + extraClass : "");
        if (legacyId) button.id = legacyId;
        button.addEventListener("click", function (event) {
            event.preventDefault();
            try {
                const result = action();
                if (result && typeof result.catch === "function") {
                    result.catch(function (error) {
                        try { console.warn("[PMK029] Action de bulletinage en erreur", error); } catch (_) {}
                    });
                }
            } catch (error) {
                try { console.warn("[PMK029] Action de bulletinage en erreur", error); } catch (_) {}
            }
        });
        applyReceivingButtonStyles(button);
        entry.section.appendChild(button);
        return button;
    }

    function renderReceivingAssistant() {
        cleanupReceivingAssistant();
        if (window.location.pathname !== EDIT_PAGE_PATH) return;
        if (!isPageEnabled(currentConfig, EDIT_PAGE_ID)) return;
        const cfg = receivingCfg();
        if (cfg.enabled === false) return;

        const entries = receivingItemSections();
        entries.forEach(function (entry) {
            const fill = cfg.fill || {};
            if (fill.enabled !== false) {
                receivingAddButton(entry, receivingButtonText(fill, "Remplir les champs", "Fill fields"), function () {
                    receivingFillSection(entry);
                }, "exemplaire-button-fill");
            }

            const special = cfg.specialIssue || {};
            if (special.enabled !== false) {
                receivingAddButton(entry, receivingButtonText(special, "Ajouter HS", "Add special issue"), function () {
                    receivingAppendMarker(entry, String(special.marker || "HS"));
                }, "exemplaire-button-hs");
            }

            const duplicate = cfg.duplicateIssue || {};
            if (duplicate.enabled === true) {
                receivingAddButton(entry, receivingButtonText(duplicate, "Ajouter Doublon", "Add duplicate"), function () {
                    receivingAppendMarker(entry, String(duplicate.marker || "(Doublon)"));
                }, "exemplaire-button-duplicate");
            }

            if (cfg.presetsEnabled !== false) {
                const presets = Array.isArray(cfg.presets) ? cfg.presets : [];
                presets.forEach(function (preset) {
                    if (!preset || preset.enabled === false) return;
                    receivingAddButton(entry, receivingPresetLabel(preset), function () {
                        receivingApplyPreset(entry, preset);
                    }, preset.legacyId || null, "pmk029-receiving-preset");
                });
            }
        });

        const report = cfg.report || {};
        if (report.enabled !== false) {
            entries.forEach(function (entry, index) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "pmk029-receiving-generated";
                button.textContent = receivingButtonText(report, "Signaler un problème de bulletinage", "Report a receiving problem");
                button.style.marginLeft = "10px";
                button.addEventListener("click", function (event) { event.preventDefault(); receivingSendReport(); });
                entry.legend.parentNode.insertBefore(button, entry.legend.nextSibling);
                if (index === 0) mountContextButton(entry.legend, "receiving-assistant");
            });
        } else if (entries[0]) {
            mountContextButton(entries[0].legend, "receiving-assistant");
        }

        receivingBlockConfiguredFields();
        receivingInstallShortcut();
    }

    /* ============================================================
       COLLECTION DES FASCICULES — ABSORPTION DU 094
       ============================================================ */

    function collectionSortConfig() {
        const cfg = currentConfig && currentConfig.collectionSort;
        return cfg && typeof cfg === "object" ? cfg : DEFAULT_CONFIG.collectionSort;
    }

    function collectionNumberColumnIndex(table) {
        if (!table) return -1;
        const headers = Array.from(table.querySelectorAll("thead th"));
        const exact = ["numero", "number", "issue number", "numero de fascicule"];
        return headers.findIndex(function (header) {
            return exact.includes(normalizeText(header.textContent));
        });
    }

    function collectionNaturalKey(value) {
        return normalizeText(value).replace(/\d+/g, function (digits) {
            return digits.padStart(20, "0");
        });
    }

    function prepareCollectionNaturalKeys(table, columnIndex) {
        if (!table || columnIndex < 0) return;
        Array.from(table.tBodies || []).forEach(function (tbody) {
            Array.from(tbody.rows || []).forEach(function (row) {
                const cell = row.cells && row.cells[columnIndex];
                if (!cell) return;
                if (!cell.hasAttribute("data-pmk029-natural-order")) {
                    cell.setAttribute("data-pmk029-had-order", cell.hasAttribute("data-order") ? "1" : "0");
                    cell.setAttribute("data-pmk029-original-order", cell.getAttribute("data-order") || "");
                }
                cell.setAttribute("data-order", collectionNaturalKey(cell.textContent || ""));
                cell.setAttribute("data-pmk029-natural-order", "1");
            });
        });
    }

    function collectionDataTable(table) {
        const jq = window.jQuery || window.$;
        if (!jq || !jq.fn || !jq.fn.dataTable || typeof jq.fn.dataTable.isDataTable !== "function") return null;
        if (!jq.fn.dataTable.isDataTable(table)) return null;
        try { return jq(table).DataTable(); } catch (_) { return null; }
    }

    function applyCollectionSortToTable(table) {
        if (!table || !table.matches("table.subscription-year-table")) return false;
        const cfg = collectionSortConfig();
        if (cfg.enabled === false) return true;
        const columnIndex = collectionNumberColumnIndex(table);
        if (columnIndex < 0) return false;

        prepareCollectionNaturalKeys(table, columnIndex);
        const api = collectionDataTable(table);
        if (!api) return false;

        if (!collectionOriginalOrders.has(table)) {
            try {
                const currentOrder = api.order();
                collectionOriginalOrders.set(table, Array.isArray(currentOrder) ? currentOrder.map(function (pair) { return pair.slice(); }) : []);
            } catch (_) {
                collectionOriginalOrders.set(table, []);
            }
        }

        try {
            api.rows().invalidate("dom");
            api.order([[columnIndex, cfg.direction === "asc" ? "asc" : "desc"]]).draw(false);
            table.setAttribute("data-pmk029-collection-sorted", "1");
            return true;
        } catch (_) {
            return false;
        }
    }

    function cleanupCollectionSort(restoreOrder) {
        if (collectionRetryTimer) {
            clearTimeout(collectionRetryTimer);
            collectionRetryTimer = null;
        }

        const jq = window.jQuery || window.$;
        if (jq) {
            try { jq(document).off("init.dt.pmk029CollectionSort"); } catch (_) {}
        }

        document.querySelectorAll('td[data-pmk029-natural-order="1"]').forEach(function (cell) {
            if (cell.getAttribute("data-pmk029-had-order") === "1") {
                cell.setAttribute("data-order", cell.getAttribute("data-pmk029-original-order") || "");
            } else {
                cell.removeAttribute("data-order");
            }
            cell.removeAttribute("data-pmk029-natural-order");
            cell.removeAttribute("data-pmk029-had-order");
            cell.removeAttribute("data-pmk029-original-order");
        });

        document.querySelectorAll('table.subscription-year-table[data-pmk029-collection-sorted="1"]').forEach(function (table) {
            table.removeAttribute("data-pmk029-collection-sorted");
            if (restoreOrder !== true) return;
            const api = collectionDataTable(table);
            const original = collectionOriginalOrders.get(table);
            if (!api || !Array.isArray(original) || !original.length) return;
            try { api.rows().invalidate("dom"); api.order(original).draw(false); } catch (_) {}
        });
    }

    function refreshCollectionSort() {
        if (window.location.pathname !== COLLECTION_PAGE_PATH) return;
        if (!isPageEnabled(currentConfig, COLLECTION_PAGE_ID) || collectionSortConfig().enabled === false) {
            cleanupCollectionSort(true);
            return;
        }

        const tables = Array.from(document.querySelectorAll("table.subscription-year-table"));
        tables.forEach(function (table) {
            const columnIndex = collectionNumberColumnIndex(table);
            if (columnIndex >= 0) prepareCollectionNaturalKeys(table, columnIndex);
        });

        const pending = tables.filter(function (table) { return !applyCollectionSortToTable(table); });
        if (!pending.length) return;

        let attempts = 0;
        const retry = function () {
            attempts += 1;
            const stillPending = pending.filter(function (table) { return document.contains(table) && !applyCollectionSortToTable(table); });
            if (stillPending.length && attempts < 40) collectionRetryTimer = window.setTimeout(retry, 100);
            else collectionRetryTimer = null;
        };
        collectionRetryTimer = window.setTimeout(retry, 50);
    }

    function initializeCollectionPage() {
        cleanupCollectionSort(false);
        if (!isPageEnabled(currentConfig, COLLECTION_PAGE_ID) || collectionSortConfig().enabled === false) return;

        const jq = window.jQuery || window.$;
        if (jq) {
            try {
                jq(document)
                    .off("init.dt.pmk029CollectionSort")
                    .on("init.dt.pmk029CollectionSort", function (event, settings) {
                        const table = settings && settings.nTable;
                        if (table && table.matches && table.matches("table.subscription-year-table")) {
                            window.setTimeout(function () { applyCollectionSortToTable(table); }, 0);
                        }
                    });
            } catch (_) {}
        }

        waitForSelector("table.subscription-year-table", 6000)
            .then(refreshCollectionSort)
            .catch(refreshCollectionSort);
    }

    function subscriptionLengthConfig() {
        const cfg = currentConfig && currentConfig.subscriptionLength;
        return cfg && typeof cfg === "object" ? cfg : DEFAULT_CONFIG.subscriptionLength;
    }

    function installSubscriptionLengthStyles() {
        if (document.getElementById("pmk029-subscription-length-style")) return;
        const style = document.createElement("style");
        style.id = "pmk029-subscription-length-style";
        style.textContent = `
            .pmk029-subscription-length-tools {
                display: inline-flex;
                flex-wrap: wrap;
                align-items: center;
                gap: .4rem;
                margin: .45rem 0 .15rem .45rem;
                vertical-align: middle;
            }
            .pmk029-subscription-length-tools .pmk029-subscription-calc {
                display: inline-flex;
                align-items: center;
                gap: .35rem;
            }
            .pmk029-subscription-length-status {
                flex-basis: 100%;
                margin: .15rem 0 0;
                max-width: 52rem;
                font-size: .86rem;
                line-height: 1.35;
                color: #495057;
            }
            .pmk029-subscription-length-status.is-error { color: #b02a37; }
            .pmk029-subscription-length-status.is-success { color: #146c43; }
            .pmk029-subscription-length-status.is-info { color: #495057; }
            .pmk029-subscription-length-tools .pmk-context-config {
                opacity: .45;
                padding: .15rem .3rem;
                line-height: 1;
            }
            .pmk029-subscription-length-tools .pmk-context-config:hover,
            .pmk029-subscription-length-tools .pmk-context-config:focus { opacity: 1; }
            @media (max-width: 767.98px) {
                .pmk029-subscription-length-tools {
                    display: flex;
                    width: 100%;
                    margin-left: 0;
                    margin-top: .5rem;
                }
                .pmk029-subscription-length-tools .pmk029-subscription-calc {
                    width: auto;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeSubscriptionLengthStyles() {
        const style = document.getElementById("pmk029-subscription-length-style");
        if (style) style.remove();
    }

    function removeSubscriptionLengthListeners() {
        subscriptionLengthListeners.forEach(function (entry) {
            try { entry.node.removeEventListener(entry.type, entry.handler); } catch (_) {}
        });
        subscriptionLengthListeners = [];
    }

    function addSubscriptionLengthListener(node, type, handler) {
        if (!node) return;
        node.addEventListener(type, handler);
        subscriptionLengthListeners.push({ node: node, type: type, handler: handler });
    }

    function subscriptionField(name) {
        const cfg = subscriptionLengthConfig();
        const selectors = cfg.selectors || DEFAULT_CONFIG.subscriptionLength.selectors;
        const selector = String(selectors[name] || DEFAULT_CONFIG.subscriptionLength.selectors[name] || "").trim();
        if (!selector) return null;
        try { return document.querySelector(selector); } catch (_) { return null; }
    }

    function parseKohaDate(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;

        let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (match) {
            const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            return Number.isNaN(date.getTime()) ? null : date;
        }

        match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
        if (match) {
            const first = Number(match[1]);
            const second = Number(match[2]);
            const year = Number(match[3]);
            const day = detectLanguage() === "en" && first <= 12 && second > 12 ? second : first;
            const month = detectLanguage() === "en" && first <= 12 && second > 12 ? first : second;
            const date = new Date(year, month - 1, day);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const nativeDate = new Date(raw);
        return Number.isNaN(nativeDate.getTime()) ? null : nativeDate;
    }

    function calendarDayDiff(start, end) {
        const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
        const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
        return Math.round((b - a) / 86400000);
    }

    function addCalendarMonthsClamped(date, months) {
        const targetMonthIndex = date.getMonth() + Number(months || 0);
        const year = date.getFullYear() + Math.floor(targetMonthIndex / 12);
        const month = ((targetMonthIndex % 12) + 12) % 12;
        const lastDay = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(date.getDate(), lastDay));
    }

    function calendarMonthsCeil(start, end) {
        if (end <= start) return 0;
        let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (months < 0) return 0;
        if (addCalendarMonthsClamped(start, months) < end) months += 1;
        return months;
    }

    function normalizedFrequencyUnit(value) {
        const unit = normalizeText(value);
        if (!unit || ["none", "aucune", "aucun", "irregular", "irregulier", "irrégulier"].includes(unit)) return "none";
        if (["day", "days", "jour", "jours"].includes(unit)) return "day";
        if (["week", "weeks", "semaine", "semaines"].includes(unit)) return "week";
        if (["month", "months", "mois"].includes(unit)) return "month";
        if (["year", "years", "annee", "annees", "année", "années", "an", "ans"].includes(unit)) return "year";
        return unit;
    }

    function finitePositive(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function dataValue(element, names) {
        if (!element) return "";
        for (const name of names) {
            if (element.dataset && element.dataset[name] != null && String(element.dataset[name]).trim()) {
                return String(element.dataset[name]).trim();
            }
            const dashed = name.replace(/[A-Z]/g, function (letter) { return "-" + letter.toLowerCase(); });
            const attr = element.getAttribute && element.getAttribute("data-" + dashed);
            if (attr != null && String(attr).trim()) return String(attr).trim();
        }
        return "";
    }

    function frequencyFromSelectedOption(select) {
        if (!select || !select.options || select.selectedIndex < 0) return null;
        const option = select.options[select.selectedIndex];
        if (!option) return null;

        const unit = dataValue(option, ["unit", "frequencyUnit"]);
        const issues = finitePositive(dataValue(option, ["issuesperunit", "issuesPerUnit"]));
        const units = finitePositive(dataValue(option, ["unitsperissue", "unitsPerIssue"]));
        if (!unit || !issues || !units) return null;

        return {
            id: String(option.value || ""),
            description: String(option.textContent || "").trim(),
            unit: normalizedFrequencyUnit(unit),
            issuesPerUnit: issues,
            unitsPerIssue: units,
            source: "page"
        };
    }

    function inputValueFromDocument(doc, selectors) {
        for (const selector of selectors) {
            const node = doc.querySelector(selector);
            if (!node) continue;
            if (node.type === "radio") {
                const checked = doc.querySelector(selector.replace(/:checked$/, "") + ":checked");
                if (checked) return String(checked.value || "").trim();
            }
            if (node.tagName === "SELECT") return String(node.value || "").trim();
            return String(node.value || node.textContent || "").trim();
        }
        return "";
    }

    function parseFrequencyDocument(doc, id) {
        if (!doc) return null;
        const unit = inputValueFromDocument(doc, [
            '#unit', 'select[name="unit"]', 'input[name="unit"]:checked', 'input[name="unit"]'
        ]);
        const issues = finitePositive(inputValueFromDocument(doc, [
            '#issuesperunit', '[name="issuesperunit"]', '[name="issues_per_unit"]'
        ]));
        const units = finitePositive(inputValueFromDocument(doc, [
            '#unitsperissue', '[name="unitsperissue"]', '[name="units_per_issue"]'
        ]));
        const description = inputValueFromDocument(doc, [
            '#description', '[name="description"]'
        ]);

        if (!unit || !issues || !units) return null;
        return {
            id: String(id || ""),
            description: description,
            unit: normalizedFrequencyUnit(unit),
            issuesPerUnit: issues,
            unitsPerIssue: units,
            source: "koha-frequency"
        };
    }

    function frequencyDefinitionUrl(id) {
        return "/cgi-bin/koha/serials/subscription-frequencies.pl?op=modify&frequencyid=" + encodeURIComponent(id);
    }

    async function fetchFrequencyDefinition(id) {
        const key = String(id || "").trim();
        if (!key) return null;
        if (frequencyDefinitionCache.has(key)) return frequencyDefinitionCache.get(key);

        const promise = (async function () {
            try {
                const response = await fetch(frequencyDefinitionUrl(key), {
                    method: "GET",
                    credentials: "same-origin",
                    headers: { "Accept": "text/html" },
                    cache: "no-store"
                });
                if (!response.ok) return null;
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, "text/html");
                return parseFrequencyDocument(doc, key);
            } catch (_) {
                return null;
            }
        })();

        frequencyDefinitionCache.set(key, promise);
        return promise;
    }

    async function resolveFrequencyDefinition() {
        const select = subscriptionField("frequency");
        if (!select) return null;

        const direct = frequencyFromSelectedOption(select);
        if (direct) return direct;

        const cfg = subscriptionLengthConfig();
        if (cfg.fetchFrequencyDefinition === false) return null;
        return fetchFrequencyDefinition(select.value);
    }

    function formatDateForMessage(date) {
        if (!date) return "";
        try {
            return new Intl.DateTimeFormat(detectLanguage() === "en" ? "en-GB" : "fr-FR").format(date);
        } catch (_) {
            return [String(date.getDate()).padStart(2, "0"), String(date.getMonth() + 1).padStart(2, "0"), date.getFullYear()].join("/");
        }
    }

    function frequencyHumanLabel(frequency) {
        if (!frequency) return "";
        const unitLabels = detectLanguage() === "en"
            ? { day: "day", week: "week", month: "month", year: "year" }
            : { day: "jour", week: "semaine", month: "mois", year: "année" };
        const unit = unitLabels[frequency.unit] || frequency.unit;
        if (detectLanguage() === "en") {
            return frequency.issuesPerUnit + " issue(s) every " + frequency.unitsPerIssue + " " + unit + "(s)";
        }
        return frequency.issuesPerUnit + " fascicule(s) pour " + frequency.unitsPerIssue + " " + unit + "(s)";
    }

    function countIssuesBetween(start, end, frequency) {
        if (!frequency) return { ok: false, reason: t("Périodicité introuvable.", "Frequency definition not found.") };
        if (frequency.unit === "none") {
            return { ok: false, reason: t("La périodicité est irrégulière : le nombre de fascicules ne peut pas être calculé automatiquement.", "The frequency is irregular: issue count cannot be calculated automatically.") };
        }
        if (end < start) return { ok: false, reason: t("La date de fin est antérieure à la date de départ.", "End date is before start date.") };

        const issuesPerUnit = finitePositive(frequency.issuesPerUnit);
        const unitsPerIssue = finitePositive(frequency.unitsPerIssue);
        if (!issuesPerUnit || !unitsPerIssue) {
            return { ok: false, reason: t("La définition de périodicité Koha est incomplète.", "Koha frequency definition is incomplete.") };
        }

        const diffDays = calendarDayDiff(start, end);
        if (frequency.unit === "day" || frequency.unit === "week") {
            const daysPerUnit = frequency.unit === "week" ? 7 : 1;
            const theoreticalInterval = (daysPerUnit * unitsPerIssue) / issuesPerUnit;
            if (!Number.isFinite(theoreticalInterval) || theoreticalInterval <= 0) {
                return { ok: false, reason: t("La périodicité ne permet pas un calcul fiable.", "The frequency cannot be calculated reliably.") };
            }
            const value = Math.floor((diffDays / theoreticalInterval) + 1e-9) + 1;
            return { ok: true, value: Math.max(1, value), estimated: issuesPerUnit > 1 };
        }

        if ((frequency.unit === "month" || frequency.unit === "year") && issuesPerUnit === 1) {
            const stepMonths = unitsPerIssue * (frequency.unit === "year" ? 12 : 1);
            let count = 0;
            let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            while (cursor <= end && count < 10000) {
                count += 1;
                cursor = addCalendarMonthsClamped(cursor, stepMonths);
            }
            if (count >= 10000) {
                return { ok: false, reason: t("Le calcul dépasse la limite de sécurité.", "The calculation exceeds the safety limit.") };
            }
            return { ok: true, value: Math.max(1, count), estimated: false };
        }

        return {
            ok: false,
            reason: t(
                "Cette périodicité publie plusieurs fascicules par mois/année ; leur position exacte ne peut pas être déduite sans le prévisionnel Koha.",
                "This frequency publishes multiple issues per month/year; exact positions cannot be inferred without Koha's prediction pattern."
            )
        };
    }

    async function calculateSubscriptionLengthProposal() {
        const cfg = subscriptionLengthConfig();
        const subtypeNode = subscriptionField("subtype");
        const endNode = subscriptionField("endDate");
        const firstNode = subscriptionField("startDate");
        const nextNode = subscriptionField("nextIssueDate");

        if (!subtypeNode || !endNode || !firstNode) {
            return { ok: false, reason: t("Les champs nécessaires au calcul n'ont pas été trouvés dans cette version de Koha.", "Required fields were not found in this Koha version.") };
        }

        const subtype = String(subtypeNode.value || "").trim().toLowerCase();
        const end = parseKohaDate(endNode.value);
        const first = parseKohaDate(firstNode.value);
        if (!end) return { ok: false, reason: t("Renseigne une date de fin valide.", "Enter a valid end date.") };

        if (subtype === "weeks") {
            if (!first) return { ok: false, reason: t("Renseigne une date de début valide.", "Enter a valid start date.") };
            if (end < first) return { ok: false, reason: t("La date de fin est antérieure à la date de début.", "End date is before start date.") };
            const value = Math.ceil(calendarDayDiff(first, end) / 7);
            return {
                ok: true,
                value: Math.max(0, value),
                detail: t(
                    value + " semaine(s), du " + formatDateForMessage(first) + " au " + formatDateForMessage(end) + ".",
                    value + " week(s), from " + formatDateForMessage(first) + " to " + formatDateForMessage(end) + "."
                )
            };
        }

        if (subtype === "months") {
            if (!first) return { ok: false, reason: t("Renseigne une date de début valide.", "Enter a valid start date.") };
            if (end < first) return { ok: false, reason: t("La date de fin est antérieure à la date de début.", "End date is before start date.") };
            const value = calendarMonthsCeil(first, end);
            return {
                ok: true,
                value: Math.max(0, value),
                detail: t(
                    value + " mois calendaire(s), du " + formatDateForMessage(first) + " au " + formatDateForMessage(end) + ".",
                    value + " calendar month(s), from " + formatDateForMessage(first) + " to " + formatDateForMessage(end) + "."
                )
            };
        }

        if (subtype !== "issues") {
            return { ok: false, reason: t("Le type de durée sélectionné n'est pas reconnu.", "Selected subscription-length type is not recognized.") };
        }

        let start = null;
        let sourceLabel = "";
        if (cfg.issuesStartSource === "acqui_date") {
            start = first;
            sourceLabel = t("date du premier fascicule", "first issue date");
        } else {
            start = nextNode ? parseKohaDate(nextNode.value) : null;
            sourceLabel = t("prochaine date d'acquisition", "next acquisition date");
            if (!start && cfg.fallbackToFirstPublication !== false) {
                start = first;
                sourceLabel = t("date du premier fascicule (secours)", "first issue date (fallback)");
            }
        }

        if (!start) {
            return { ok: false, reason: t("La date servant de départ au calcul des fascicules n'est pas renseignée.", "The start date used for issue calculation is missing.") };
        }

        const frequency = await resolveFrequencyDefinition();
        if (!frequency) {
            return {
                ok: false,
                reason: t(
                    "Impossible de lire la définition réelle de la périodicité Koha. Aucune valeur n'a été écrite.",
                    "Could not read the real Koha frequency definition. No value was written."
                )
            };
        }

        const result = countIssuesBetween(start, end, frequency);
        if (!result.ok) return result;
        const frequencyLabel = frequency.description || frequencyHumanLabel(frequency);
        return {
            ok: true,
            value: result.value,
            detail: t(
                result.value + " fascicule(s), du " + formatDateForMessage(start) + " au " + formatDateForMessage(end) +
                    " — " + sourceLabel + " — " + (frequencyLabel || frequencyHumanLabel(frequency)) +
                    (result.estimated ? " (calcul proportionnel)" : "") + ".",
                result.value + " issue(s), from " + formatDateForMessage(start) + " to " + formatDateForMessage(end) +
                    " — " + sourceLabel + " — " + (frequencyLabel || frequencyHumanLabel(frequency)) +
                    (result.estimated ? " (proportional calculation)" : "") + "."
            )
        };
    }

    function subscriptionLengthStatusNode() {
        return document.getElementById("pmk029-subscription-length-status");
    }

    function setSubscriptionLengthStatus(kind, text) {
        const node = subscriptionLengthStatusNode();
        if (!node) return;
        node.className = "pmk029-subscription-length-status " + (kind ? "is-" + kind : "is-info");
        node.textContent = text || "";
        node.hidden = !text;
    }

    async function runSubscriptionLengthCalculation(options) {
        const opts = options || {};
        const lengthInput = subscriptionField("length");
        if (!lengthInput) {
            setSubscriptionLengthStatus("error", t("Champ Durée d'abonnement introuvable.", "Subscription length field not found."));
            return false;
        }

        const button = document.querySelector("#pmk029-subscription-length-tools .pmk029-subscription-calc");
        if (button) button.disabled = true;
        setSubscriptionLengthStatus("info", t("Calcul en cours…", "Calculating…"));

        try {
            const proposal = await calculateSubscriptionLengthProposal();
            if (!proposal.ok) {
                setSubscriptionLengthStatus("error", proposal.reason || t("Calcul impossible.", "Calculation unavailable."));
                return false;
            }

            lengthInput.value = String(proposal.value);
            try { lengthInput.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
            try { lengthInput.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}

            const cfg = subscriptionLengthConfig();
            if (cfg.showDetails !== false) {
                setSubscriptionLengthStatus("success", proposal.detail || t("Durée calculée.", "Subscription length calculated."));
            } else {
                setSubscriptionLengthStatus("success", t("Durée calculée : ", "Calculated length: ") + proposal.value);
            }
            return true;
        } finally {
            if (button) button.disabled = false;
        }
    }

    function mountSubscriptionLengthContextButton(tools) {
        if (!tools || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: tools,
                contextKey: "subscription-length",
                position: "inside",
                context: { sectionId: "subscription-length", pageId: ADD_PAGE_ID }
            });
        } catch (_) {}
    }

    function renderSubscriptionLengthAssistant() {
        cleanupSubscriptionLengthAssistant();
        if (window.location.pathname !== ADD_PAGE_PATH) return;
        if (!isPageEnabled(currentConfig, ADD_PAGE_ID)) return;

        const cfg = subscriptionLengthConfig();
        if (cfg.enabled === false) return;

        const lengthInput = subscriptionField("length");
        if (!lengthInput || !lengthInput.parentNode) return;
        installSubscriptionLengthStyles();

        const tools = document.createElement("span");
        tools.id = "pmk029-subscription-length-tools";
        tools.className = "pmk029-subscription-length-tools";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-default btn-sm pmk029-subscription-calc";
        button.innerHTML = '<i class="fa fa-calculator" aria-hidden="true"></i><span></span>';
        button.querySelector("span").textContent = detectLanguage() === "en"
            ? String(cfg.buttonLabelEn || "Calculate")
            : String(cfg.buttonLabelFr || "Calculer");
        button.title = t("Calculer la durée à partir des dates et de la périodicité Koha", "Calculate length from dates and Koha frequency");
        addSubscriptionLengthListener(button, "click", function () { runSubscriptionLengthCalculation({ automatic: false }); });
        tools.appendChild(button);

        const status = document.createElement("small");
        status.id = "pmk029-subscription-length-status";
        status.className = "pmk029-subscription-length-status is-info";
        status.hidden = true;
        tools.appendChild(status);

        const host = lengthInput.closest("li, .form-group, .row, .col-sm-10, .col-md-10") || lengthInput.parentNode;
        host.appendChild(tools);
        mountSubscriptionLengthContextButton(tools);

        if (cfg.automatic === true) {
            ["startDate", "endDate", "nextIssueDate", "frequency", "subtype"].forEach(function (fieldName) {
                const node = subscriptionField(fieldName);
                if (!node) return;
                addSubscriptionLengthListener(node, "change", function () {
                    runSubscriptionLengthCalculation({ automatic: true });
                });
            });
        }
    }

    function cleanupSubscriptionLengthAssistant() {
        removeSubscriptionLengthListeners();
        const tools = document.getElementById("pmk029-subscription-length-tools");
        if (tools) tools.remove();
        removeSubscriptionLengthStyles();
    }

    function initializeSubscriptionAddPage() {
        if (!isPageEnabled(currentConfig, ADD_PAGE_ID)) {
            cleanupSubscriptionLengthAssistant();
            return;
        }
        waitForSelector('#sublength, [name="sublength"]', 6000)
            .then(renderSubscriptionLengthAssistant)
            .catch(renderSubscriptionLengthAssistant);
    }

    function initializeEditPage() {
        if (!isPageEnabled(currentConfig, EDIT_PAGE_ID)) {
            cleanupReceivingAssistant();
            return;
        }

        // Précharge le prix depuis la fiche Koha de l'abonnement courant.
        // Ainsi serials-edit.pl fonctionne même lorsqu'on y arrive directement,
        // sans être passé auparavant par subscription-detail.pl ou serials-search.pl.
        const currentSubscriptionId = subscriptionIdFromPage();
        if (currentSubscriptionId) {
            fetchDetailPriceForSubscription(currentSubscriptionId, "serials-edit-preload");
        }

        waitForSelector('legend, input[name="serialseq"]', 6000)
            .then(renderReceivingAssistant)
            .catch(renderReceivingAssistant);
    }

    window.PMK029Serials = Object.freeze({
        version: MODULE_VERSION,
        getContext: readPriceContext,
        clearContext: clearPriceContext,
        refreshPrice: function () {
            return fetchDetailPriceForSubscription(subscriptionIdFromPage(), "manual-refresh");
        },
        refresh: function () {
            if (window.location.pathname === DETAIL_PAGE_PATH) refreshPage(true);
            else if (window.location.pathname === SEARCH_PAGE_PATH) refreshSearchPage();
            else if (window.location.pathname === EDIT_PAGE_PATH) renderReceivingAssistant();
            else if (window.location.pathname === COLLECTION_PAGE_PATH) refreshCollectionSort();
            else if (window.location.pathname === ADD_PAGE_PATH) renderSubscriptionLengthAssistant();
        }
    });

    function disconnectObservers() {
        observers.forEach(function (observer) {
            try { observer.disconnect(); } catch (_) {}
        });
        observers = [];
        if (mutationTimer) {
            clearTimeout(mutationTimer);
            mutationTimer = null;
        }
    }

    function observeTables(tables) {
        disconnectObservers();
        tables.forEach(function (table) {
            const tbody = table.tBodies && table.tBodies[0];
            if (!tbody) return;
            const observer = new MutationObserver(function (mutations) {
                const onlyPmk = mutations.every(function (mutation) {
                    return Array.from(mutation.addedNodes || []).every(function (node) {
                        return node.nodeType !== 1 ||
                            (node.matches && node.matches(".pmk029-claim-note, .pmk029-calendar-panel")) ||
                            (node.closest && node.closest(".pmk029-claim-note, .pmk029-calendar-panel"));
                    });
                });
                if (onlyPmk) return;

                if (mutationTimer) clearTimeout(mutationTimer);
                mutationTimer = window.setTimeout(function () {
                    mutationTimer = null;
                    refreshPage(false);
                }, 180);
            });
            observer.observe(tbody, { childList: true, subtree: true, characterData: true });
            observers.push(observer);
        });
    }

    function cleanupDecorations() {
        disconnectObservers();
        removeClaimNotes(document);

        document.querySelectorAll(".pmk029-status-badge-target").forEach(function (node) {
            node.classList.remove("pmk029-status-badge-target");
            node.style.removeProperty("--pmk029-status-bg");
            node.style.removeProperty("--pmk029-status-fg");
            node.removeAttribute("data-pmk029-icon");
        });

        document.querySelectorAll("[data-pmk029-status-key]").forEach(function (node) {
            node.removeAttribute("data-pmk029-status-key");
        });

        document.querySelectorAll(".pmk029-status-generated").forEach(function (node) {
            const textNode = document.createTextNode(node.textContent || "");
            node.replaceWith(textNode);
        });

        const panel = document.getElementById("pmk029-calendar-panel");
        if (panel) panel.remove();
        restorePlannedDateLabels();
        cleanupLayout();
        removeStyles();
    }

    function refreshPage(rebuildObservers) {
        if (window.location.pathname !== DETAIL_PAGE_PATH) return;
        if (!isPageEnabled(currentConfig, DETAIL_PAGE_ID)) {
            cleanupDecorations();
            return;
        }

        installStyles();
        applyDetailLayout();
        applyPlannedDateLabelCompatibility();
        installLegacySectionToggleCompatibility();
        installDetailDelegation();
        captureDetailPriceContext("subscription-detail-load");
        removeClaimNotes(document);
        const gracePeriod = getGracePeriod();
        const tables = getRelevantTables();
        tables.forEach(function (table) { processTable(table, gracePeriod); });

        const primary = getPrimaryFascicleTable();
        if (primary) {
            if (currentConfig.calendar && currentConfig.calendar.enabled !== false) {
                buildCalendarPanel(primary);
            } else {
                const panel = document.getElementById("pmk029-calendar-panel");
                if (panel) panel.remove();
            }
        }

        if (rebuildObservers !== false) observeTables(tables);
    }

    function initializeDetailPage() {
        if (initialized) {
            refreshPage(true);
            return;
        }
        initialized = true;

        waitForSelector("#subscription_info_panel, #subscription_issues_panel, .tableau-fasci, table.subscription-year-table", 6000)
            .then(function () { refreshPage(true); })
            .catch(function () {
                applyDetailLayout();
                refreshPage(true);
            });
    }

    function initializeSearchPage() {
        if (initialized) {
            refreshSearchPage();
            return;
        }
        initialized = true;
        installLegacySectionToggleCompatibility();
        installSearchDelegation();
        waitForSelector('a[href*="serials-edit.pl"], table.dataTable', 6000)
            .then(function () {
                refreshSearchPage();
                observeSearchPage();
            })
            .catch(function () { observeSearchPage(); });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config);
        const page = currentPageDefinition();
        if (!page) return;

        if (!isPageEnabled(currentConfig, page.id)) {
            if (page.id === DETAIL_PAGE_ID) cleanupDecorations();
            if (page.id === EDIT_PAGE_ID) cleanupReceivingAssistant();
            if (page.id === COLLECTION_PAGE_ID) cleanupCollectionSort(true);
            if (page.id === ADD_PAGE_ID) cleanupSubscriptionLengthAssistant();
            disconnectObservers();
            return;
        }

        if (page.id === DETAIL_PAGE_ID) initializeDetailPage();
        else if (page.id === SEARCH_PAGE_ID) initializeSearchPage();
        else if (page.id === EDIT_PAGE_ID) initializeEditPage();
        else if (page.id === COLLECTION_PAGE_ID) initializeCollectionPage();
        else if (page.id === ADD_PAGE_ID) initializeSubscriptionAddPage();
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            return Promise.resolve(clone(DEFAULT_CONFIG));
        }
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (config) { return normalizeConfig(config); })
            .catch(function () { return clone(DEFAULT_CONFIG); });
    }

    function start() {
        if (!currentPageDefinition()) return;

        loadConfig().then(applyConfig);

        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try { window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }

})();
