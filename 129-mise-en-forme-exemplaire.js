/******************************************************************************/
/*Travail sur les données exemplaires page resultats de recherche*/
/**********************************************************************************/
(() => {
    "use strict";

    /* ============================================================
       129-mise-en-forme-exemplaire.js — V8.2 PMK (base V8.1)
       Koha 25.11

       PAGE :
       /cgi-bin/koha/catalogue/search.pl UNIQUEMENT

       Fonctionnalités :
       - cloisonnement strict à la page de résultats
       - titre vert Koha
       - suppression numéro avant titre
       - présentation bibliographique compacte
       - suppression lignes réellement vides
       - suppression notice-details vide
       - acquisition intégrée au fond blanc
       - suppression fonds orange sujets / mots-clés
       - contraste renforcé
       - actions notice en bas à droite
       - actions mobiles par icônes
       - Afficher plus / Afficher moins fonctionnel sur mobile
       - respect des éléments initialement masqués
       - cartes exemplaires via API REST
       - appels API sérialisés par pool limité
       - site local en priorité
       - statut / cote / localisation / collection
       - icônes natives Koha
       - recherche progressive par cote
       - statistiques rapport 4537
       - détails exemplaire
       - bouton global Afficher tous les exemplaires
       ============================================================ */


    /* ============================================================
       GARDE ABSOLUE
       ============================================================ */

    const SEARCH_PATH =
        "/cgi-bin/koha/catalogue/search.pl";

    const MOBILE_QUERY =
        "(max-width: 767px)";

    const MODULE_ID =
        "search-results-master";

    const MODULE_VERSION =
        "8.2.0-preplugin";

    const MODULE_BASE_VERSION =
        "V8.1";

    const LOCAL_CONFIG_KEY =
        "PimpMyKoha.search-results-master.runtime.v2";

    const PMK_CONFIG_EVENT =
        "pmk129:config-changed";


    /* ============================================================
       CONFIGURATION PMK — valeurs par défaut = V8.1 actuel
       ============================================================ */

    const DEFAULT_CONFIG = {
        enabled: true,

        notice: {
            layoutEnabled: true,
            removeResultNumber: true,
            removeEmptyLines: true,
            mobileCollapseEnabled: true,
            mobileActionIconsEnabled: true
        },

        items: {
            cardsEnabled: true,
            prioritizeCurrentSite: true,
            prioritizeStatus: true,
            summaryEnabled: true,
            nativeItemTypeIcons: true,
            progressiveCallnumberSearch: true,
            collectionLinkEnabled: true,
            barcodeVisible: true,
            barcodeCopyEnabled: true,
            quickStatsEnabled: true,
            ownerVisible: true,
            itemTypeVisible: true,
            dueDateVisible: true,
            detailsEnabled: true,
            globalToggleEnabled: true,
            actions: {
                edit: true,
                statistics: true,
                movements: true,
                loanHistory: true
            }
        },

        reports: {
            statisticsReportId: 4537
        },

        performance: {
            apiPerPage: 100,
            maxPages: 20,
            concurrentRequests: 1
        },

        appearance: {
            titleColor: "#4f772d",
            titleHoverColor: "#365314",
            localBadgeVisible: true,
            localBadgeBackground: "#e1edf9",
            localBadgeTextColor: "#28649a",
            cardRadius: 7,
            availableAccent: "#3b9858",
            loanAccent: "#d89614",
            transferAccent: "#417db3",
            holdAccent: "#7558a6",
            unavailableAccent: "#a15b5b"
        },

        labels: {
            mySiteFr: "MON SITE",
            mySiteEn: "MY LIBRARY",
            unknownSiteFr: "Site inconnu",
            unknownSiteEn: "Unknown library",
            copyFr: "Copier",
            copyEn: "Copy",
            copiedFr: "Copié ✓",
            copiedEn: "Copied ✓",
            detailsFr: "Détails",
            detailsEn: "Details",
            reduceFr: "Réduire",
            reduceEn: "Collapse",
            showAllFr: "Afficher tous les exemplaires",
            showAllEn: "Show all items",
            hideAllFr: "Masquer tous les exemplaires",
            hideAllEn: "Hide all items",
            loanHistoryFr: "Historique de prêt",
            loanHistoryEn: "Loan history"
        }
    };

    function pmkClone(value) {
        if (value === undefined) return undefined;
        try { return JSON.parse(JSON.stringify(value)); }
        catch (_) { return value; }
    }

    function pmkIsObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function pmkMerge(base, extra) {
        const out = pmkClone(base);
        if (!pmkIsObject(extra)) return out;
        Object.keys(extra).forEach(key => {
            const value = extra[key];
            if (pmkIsObject(value) && pmkIsObject(out[key])) out[key] = pmkMerge(out[key], value);
            else if (value !== undefined) out[key] = pmkClone(value);
        });
        return out;
    }

    function pmkClamp(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function normalizePmkConfig(input) {
        const incoming = pmkIsObject(input) ? input : {};
        const result = pmkMerge(DEFAULT_CONFIG, incoming);

        /* Migration de l'ancienne tentative PMK v4 si une config existe déjà. */
        if (incoming.statisticsReportId !== undefined &&
            !(incoming.reports && incoming.reports.statisticsReportId !== undefined)) {
            result.reports.statisticsReportId = incoming.statisticsReportId;
        }

        result.enabled = result.enabled !== false;

        result.notice.layoutEnabled = result.notice.layoutEnabled !== false;
        result.notice.removeResultNumber = result.notice.removeResultNumber !== false;
        result.notice.removeEmptyLines = result.notice.removeEmptyLines !== false;
        result.notice.mobileCollapseEnabled = result.notice.mobileCollapseEnabled !== false;
        result.notice.mobileActionIconsEnabled = result.notice.mobileActionIconsEnabled !== false;

        result.items.cardsEnabled = result.items.cardsEnabled !== false;
        result.items.prioritizeCurrentSite = result.items.prioritizeCurrentSite !== false;
        result.items.prioritizeStatus = result.items.prioritizeStatus !== false;
        result.items.summaryEnabled = result.items.summaryEnabled !== false;
        result.items.nativeItemTypeIcons = result.items.nativeItemTypeIcons !== false;
        result.items.progressiveCallnumberSearch = result.items.progressiveCallnumberSearch !== false;
        result.items.collectionLinkEnabled = result.items.collectionLinkEnabled !== false;
        result.items.barcodeVisible = result.items.barcodeVisible !== false;
        result.items.barcodeCopyEnabled = result.items.barcodeCopyEnabled !== false;
        result.items.quickStatsEnabled = result.items.quickStatsEnabled !== false;
        result.items.ownerVisible = result.items.ownerVisible !== false;
        result.items.itemTypeVisible = result.items.itemTypeVisible !== false;
        result.items.dueDateVisible = result.items.dueDateVisible !== false;
        result.items.detailsEnabled = result.items.detailsEnabled !== false;
        result.items.globalToggleEnabled = result.items.globalToggleEnabled !== false;
        result.items.actions.edit = result.items.actions.edit !== false;
        result.items.actions.statistics = result.items.actions.statistics !== false;
        result.items.actions.movements = result.items.actions.movements !== false;
        result.items.actions.loanHistory = result.items.actions.loanHistory !== false;

        result.reports.statisticsReportId = Math.max(0, Number(result.reports.statisticsReportId) || 0);
        result.performance.apiPerPage = pmkClamp(result.performance.apiPerPage, 1, 500, 100);
        result.performance.maxPages = pmkClamp(result.performance.maxPages, 1, 100, 20);
        result.performance.concurrentRequests = pmkClamp(result.performance.concurrentRequests, 1, 5, 1);

        result.appearance.cardRadius = pmkClamp(result.appearance.cardRadius, 0, 24, 7);
        [
            "titleColor", "titleHoverColor", "localBadgeBackground", "localBadgeTextColor",
            "availableAccent", "loanAccent", "transferAccent", "holdAccent", "unavailableAccent"
        ].forEach(key => {
            if (typeof result.appearance[key] !== "string" || !result.appearance[key].trim()) {
                result.appearance[key] = DEFAULT_CONFIG.appearance[key];
            }
        });
        result.appearance.localBadgeVisible = result.appearance.localBadgeVisible !== false;

        Object.keys(DEFAULT_CONFIG.labels).forEach(key => {
            if (typeof result.labels[key] !== "string" || !result.labels[key].trim()) {
                result.labels[key] = DEFAULT_CONFIG.labels[key];
            }
        });

        return result;
    }

    function readLocalPmkConfig() {
        try {
            const raw = window.localStorage.getItem(LOCAL_CONFIG_KEY);
            return raw ? normalizePmkConfig(JSON.parse(raw)) : null;
        }
        catch (_) {
            return null;
        }
    }

    function writeLocalPmkConfig(config) {
        try {
            window.localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(normalizePmkConfig(config)));
        }
        catch (_) {}
    }

    let currentPmkConfig =
        readLocalPmkConfig()
        ||
        normalizePmkConfig(DEFAULT_CONFIG);

    let runtimeInitialized = false;
    let runtimeNeedsReload = false;
    let pmkSubscribed = false;

    const CONFIG = {
        reportId: currentPmkConfig.reports.statisticsReportId,
        apiPerPage: currentPmkConfig.performance.apiPerPage,
        maxPages: currentPmkConfig.performance.maxPages,
        concurrentRequests: currentPmkConfig.performance.concurrentRequests
    };

    function syncLegacyRuntimeConfig() {
        CONFIG.reportId = currentPmkConfig.reports.statisticsReportId;
        CONFIG.apiPerPage = currentPmkConfig.performance.apiPerPage;
        CONFIG.maxPages = currentPmkConfig.performance.maxPages;
        CONFIG.concurrentRequests = currentPmkConfig.performance.concurrentRequests;
    }

    function pmkLanguage() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            }
        }
        catch (_) {}
        return String(document.documentElement.lang || navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function pmkLabel(frKey, enKey) {
        return pmkLanguage() === "en"
            ? currentPmkConfig.labels[enKey]
            : currentPmkConfig.labels[frKey];
    }

    function pmkFeature(path) {
        if (!currentPmkConfig.enabled) return false;
        const parts = String(path || "").split(".").filter(Boolean);
        let value = currentPmkConfig;
        for (const part of parts) {
            if (!value || typeof value !== "object") return false;
            value = value[part];
        }
        return value !== false;
    }

    function structuralFingerprint(config) {
        return JSON.stringify({
            enabled: config.enabled,
            notice: config.notice,
            items: config.items,
            reports: config.reports,
            performance: config.performance,
            labels: config.labels
        });
    }

    function applyPmkAppearance() {
        if (window.location.pathname !== SEARCH_PATH) return;
        let style = document.getElementById("pmk129-runtime-config-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "pmk129-runtime-config-style";
            document.head.appendChild(style);
        }

        const a = currentPmkConfig.appearance;
        const r = Number(a.cardRadius) || 0;
        style.textContent = `
body.kx-search-results-page .kx-notice-head .titlebibresult a { color:${a.titleColor} !important; }
body.kx-search-results-page .kx-notice-head .titlebibresult a:hover { color:${a.titleHoverColor} !important; }
body.kx-search-results-page .kxri-local-badge { background:${a.localBadgeBackground} !important; color:${a.localBadgeTextColor} !important; ${a.localBadgeVisible ? "" : "display:none !important;"} }
body.kx-search-results-page .kx-notice-card,
body.kx-search-results-page .kxri-item { border-radius:${r}px !important; }
body.kx-search-results-page .kx-notice-cell.kx-has-external-biblio > .kx-notice-card { border-radius:${r}px ${r}px 0 0 !important; }
body.kx-search-results-page .kxri-item.is-available { border-left-color:${a.availableAccent} !important; }
body.kx-search-results-page .kxri-item.is-loan { border-left-color:${a.loanAccent} !important; }
body.kx-search-results-page .kxri-item.is-transfer { border-left-color:${a.transferAccent} !important; }
body.kx-search-results-page .kxri-item.is-hold { border-left-color:${a.holdAccent} !important; }
body.kx-search-results-page .kxri-item.is-unavailable { border-left-color:${a.unavailableAccent} !important; }
        `;
    }

    function applyPmkConfig(nextConfig) {
        const previousFingerprint = structuralFingerprint(currentPmkConfig);
        currentPmkConfig = normalizePmkConfig(nextConfig || DEFAULT_CONFIG);
        syncLegacyRuntimeConfig();
        writeLocalPmkConfig(currentPmkConfig);
        applyPmkAppearance();

        if (runtimeInitialized && previousFingerprint !== structuralFingerprint(currentPmkConfig)) {
            runtimeNeedsReload = true;
        }

        try {
            window.dispatchEvent(new CustomEvent(PMK_CONFIG_EVENT, { detail: pmkClone(currentPmkConfig) }));
        }
        catch (_) {}
    }

    function validatePmkConfig(config) {
        const c = normalizePmkConfig(config);
        if (c.items.actions.statistics && c.reports.statisticsReportId <= 0) {
            return {
                ok: false,
                message: "Le bouton Statistiques est actif mais aucun identifiant de rapport n'est renseigné."
            };
        }
        return { ok: true };
    }

    function registerPmkModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;

        try {
            window.PMKConfig.registerModule({
                id: MODULE_ID,
                schemaVersion: 3,
                name: {
                    fr: "Résultats catalogue — présentation et exemplaires",
                    en: "Catalog results — layout and items"
                },
                description: {
                    fr: "Améliore et organise l’affichage des résultats du catalogue : présentation des notices, exemplaires, disponibilités, actions, tri et chargement des données, tout en conservant le rendu configuré par défaut.",
                    en: "Improves and organizes catalogue search results: record layout, item availability, actions, sorting and on-demand data loading while preserving the configured default rendering."
                },
                category: {
                    fr: "Catalogue / résultats",
                    en: "Catalog / results"
                },
                supportedPages: ["catalogue.search"],
                prerequisites: [],
                dependencies: [],
                defaults: pmkClone(DEFAULT_CONFIG),
                normalize: normalizePmkConfig,
                validate: validatePmkConfig,
                schema: [
                    {
                        type: "section",
                        id: "activation",
                        label: { fr: "Activation", en: "Activation" },
                        description: {
                            fr: "Le rendu historique V8.1 est la valeur par défaut. Les changements structurels prennent effet au prochain chargement de search.pl.",
                            en: "The historical V8.1 rendering is the default. Structural changes take effect on the next search.pl load."
                        },
                        fields: [
                            { key: "enabled", type: "boolean", label: { fr: "Activer le module 129", en: "Enable module 129" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "notice",
                        label: { fr: "Présentation des notices", en: "Record layout" },
                        fields: [
                            { key: "notice.layoutEnabled", type: "boolean", label: { fr: "Activer la présentation V8.1 des notices", en: "Enable V8.1 record layout" } },
                            { key: "notice.removeResultNumber", type: "boolean", label: { fr: "Masquer le numéro placé avant le titre", en: "Hide result number before title" } },
                            { key: "notice.removeEmptyLines", type: "boolean", label: { fr: "Supprimer les lignes bibliographiques réellement vides", en: "Remove truly empty bibliographic lines" } },
                            { key: "notice.mobileCollapseEnabled", type: "boolean", label: { fr: "Afficher plus / moins sur mobile", en: "Show more / less on mobile" } },
                            { key: "notice.mobileActionIconsEnabled", type: "boolean", label: { fr: "Actions notice compactes sur mobile", en: "Compact record actions on mobile" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "items",
                        label: { fr: "Cartes exemplaires", en: "Item cards" },
                        description: {
                            fr: "Chaque option conserve le comportement V8.1 lorsqu'elle est activée. Les options structurelles nécessitent un rechargement après sauvegarde.",
                            en: "Each enabled option preserves V8.1 behavior. Structural options require a reload after saving."
                        },
                        fields: [
                            { key: "items.cardsEnabled", type: "boolean", label: { fr: "Remplacer l'affichage natif par les cartes exemplaires", en: "Replace native display with item cards" } },
                            { key: "items.summaryEnabled", type: "boolean", label: { fr: "Afficher le résumé des exemplaires", en: "Show item summary" } },
                            { key: "items.nativeItemTypeIcons", type: "boolean", label: { fr: "Réutiliser les icônes natives des types de document", en: "Reuse native item type icons" } },
                            { key: "items.progressiveCallnumberSearch", type: "boolean", label: { fr: "Recherches progressives depuis la cote", en: "Progressive call-number searches" } },
                            { key: "items.collectionLinkEnabled", type: "boolean", label: { fr: "Code collection cliquable", en: "Clickable collection code" } },
                            { key: "items.barcodeVisible", type: "boolean", label: { fr: "Afficher le code-barres", en: "Show barcode" } },
                            { key: "items.barcodeCopyEnabled", type: "boolean", label: { fr: "Bouton Copier sur le code-barres", en: "Copy button for barcode" } },
                            { key: "items.quickStatsEnabled", type: "boolean", label: { fr: "Indicateurs rapides prêts / échéance", en: "Quick checkout / due-date indicators" } },
                            { key: "items.ownerVisible", type: "boolean", label: { fr: "Afficher le site propriétaire s'il diffère", en: "Show home library when different" } },
                            { key: "items.itemTypeVisible", type: "boolean", label: { fr: "Afficher le type de document", en: "Show item type" } },
                            { key: "items.dueDateVisible", type: "boolean", label: { fr: "Afficher le retour prévu", en: "Show due date" } },
                            { key: "items.detailsEnabled", type: "boolean", label: { fr: "Détails exemplaire repliables", en: "Expandable item details" } },
                            { key: "items.globalToggleEnabled", type: "boolean", label: { fr: "Bouton global Afficher / masquer tous les exemplaires", en: "Global show / hide all items button" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "sorting",
                        label: { fr: "Ordre des exemplaires", en: "Item ordering" },
                        fields: [
                            { key: "items.prioritizeCurrentSite", type: "boolean", label: { fr: "Placer mon site en premier", en: "Put current library first" } },
                            { key: "items.prioritizeStatus", type: "boolean", label: { fr: "Puis trier par disponibilité / statut", en: "Then sort by availability / status" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "actions",
                        label: { fr: "Actions exemplaire", en: "Item actions" },
                        fields: [
                            { key: "items.actions.edit", type: "boolean", label: { fr: "Modifier", en: "Edit" } },
                            { key: "items.actions.statistics", type: "boolean", label: { fr: "Statistiques", en: "Statistics" } },
                            { key: "items.actions.movements", type: "boolean", label: { fr: "Mouvements", en: "Movements" } },
                            { key: "items.actions.loanHistory", type: "boolean", label: { fr: "Historique de prêt", en: "Loan history" } },
                            {
                                key: "reports.statisticsReportId",
                                type: "number",
                                min: 0,
                                step: 1,
                                label: { fr: "ID du rapport Statistiques", en: "Statistics report ID" },
                                help: { fr: "Valeur historique Dracénie : 4537.", en: "Historical Dracénie value: 4537." }
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "appearance",
                        label: { fr: "Apparence", en: "Appearance" },
                        fields: [
                            { key: "appearance.titleColor", type: "color", label: { fr: "Couleur du titre", en: "Title color" } },
                            { key: "appearance.titleHoverColor", type: "color", label: { fr: "Couleur du titre au survol", en: "Title hover color" } },
                            { key: "appearance.localBadgeVisible", type: "boolean", label: { fr: "Afficher le badge MON SITE", en: "Show MY LIBRARY badge" } },
                            { key: "appearance.localBadgeBackground", type: "color", label: { fr: "Fond du badge MON SITE", en: "MY LIBRARY badge background" } },
                            { key: "appearance.localBadgeTextColor", type: "color", label: { fr: "Texte du badge MON SITE", en: "MY LIBRARY badge text" } },
                            { key: "appearance.cardRadius", type: "number", min: 0, max: 24, step: 1, advanced: true, label: { fr: "Arrondi des cartes (px)", en: "Card radius (px)" } },
                            { key: "appearance.availableAccent", type: "color", advanced: true, label: { fr: "Accent Disponible", en: "Available accent" } },
                            { key: "appearance.loanAccent", type: "color", advanced: true, label: { fr: "Accent En prêt", en: "On-loan accent" } },
                            { key: "appearance.transferAccent", type: "color", advanced: true, label: { fr: "Accent En transfert", en: "Transfer accent" } },
                            { key: "appearance.holdAccent", type: "color", advanced: true, label: { fr: "Accent Réservé", en: "Hold accent" } },
                            { key: "appearance.unavailableAccent", type: "color", advanced: true, label: { fr: "Accent Indisponible", en: "Unavailable accent" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "labels",
                        label: { fr: "Libellés", en: "Labels" },
                        fields: [
                            { key: "labels.mySiteFr", type: "text", label: { fr: "Badge mon site — FR", en: "My library badge — FR" } },
                            { key: "labels.mySiteEn", type: "text", label: { fr: "Badge mon site — EN", en: "My library badge — EN" } },
                            { key: "labels.showAllFr", type: "text", advanced: true, label: { fr: "Afficher tous — FR", en: "Show all — FR" } },
                            { key: "labels.showAllEn", type: "text", advanced: true, label: { fr: "Afficher tous — EN", en: "Show all — EN" } },
                            { key: "labels.hideAllFr", type: "text", advanced: true, label: { fr: "Masquer tous — FR", en: "Hide all — FR" } },
                            { key: "labels.hideAllEn", type: "text", advanced: true, label: { fr: "Masquer tous — EN", en: "Hide all — EN" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "performance",
                        label: { fr: "API et performances", en: "API and performance" },
                        description: {
                            fr: "Valeurs historiques : 100 exemplaires/page, 20 pages maximum, 1 requête simultanée. N'augmentez la concurrence qu'après test de charge Koha.",
                            en: "Historical values: 100 items/page, 20 pages maximum, 1 concurrent request. Increase concurrency only after Koha load testing."
                        },
                        fields: [
                            { key: "performance.apiPerPage", type: "number", min: 1, max: 500, step: 1, advanced: true, label: { fr: "Exemplaires par page API", en: "Items per API page" } },
                            { key: "performance.maxPages", type: "number", min: 1, max: 100, step: 1, advanced: true, label: { fr: "Pages API maximum", en: "Maximum API pages" } },
                            { key: "performance.concurrentRequests", type: "number", min: 1, max: 5, step: 1, advanced: true, label: { fr: "Requêtes simultanées", en: "Concurrent requests" } }
                        ]
                    }
                ]
            });
        }
        catch (_) {
            return false;
        }

        if (typeof window.PMKConfig.getConfig === "function") {
            Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
                .then(config => applyPmkConfig(config || DEFAULT_CONFIG))
                .catch(() => {});
        }

        if (!pmkSubscribed && typeof window.PMKConfig.subscribe === "function") {
            pmkSubscribed = true;
            try {
                window.PMKConfig.subscribe(MODULE_ID, config => applyPmkConfig(config || DEFAULT_CONFIG));
            }
            catch (_) {}
        }

        return true;
    }

    function mountPmkContextButton() {
        if (window.location.pathname !== SEARCH_PATH) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor =
            document.getElementById("toggle-all-exemplaires")
            || document.querySelector("#searchheader")
            || document.querySelector("#searchresults h1")
            || document.querySelector("h1");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor,
                position: "after",
                contextKey: "catalogue-search-results",
                context: { sectionId: "items" }
            });
        }
        catch (_) {}
    }

    function connectPmk() {
        if (registerPmkModule()) return;
        window.addEventListener("pmk:config-ready", registerPmkModule, { once: true });
    }

    window.PMK129SearchResults = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        baseVersion: MODULE_BASE_VERSION,
        getConfig: () => pmkClone(currentPmkConfig),
        featureEnabled: pmkFeature,
        needsReload: () => runtimeNeedsReload,
        diagnostic: () => ({
            version: MODULE_VERSION,
            baseVersion: MODULE_BASE_VERSION,
            enabled: currentPmkConfig.enabled,
            loadedOnSearchPage: window.location.pathname === SEARCH_PATH,
            runtimeInitialized,
            needsReload: runtimeNeedsReload,
            cards: document.querySelectorAll(".kxri-item").length,
            notices: document.querySelectorAll(".kx-notice-card").length,
            config: pmkClone(currentPmkConfig)
        })
    };

    connectPmk();


    if (
        window.location.pathname !==
        SEARCH_PATH
    ) {
        return;
    }


    if (
        window.__KX_SEARCH_RESULTS_V8__
    ) {
        return;
    }


    window.__KX_SEARCH_RESULTS_V8__ =
        true;


    const mobileMedia =
        window.matchMedia(
            MOBILE_QUERY
        );


    const originalShowMoreState =
        new WeakMap();

    let allExemplairesExpanded =
        false;


    let loggedBranchName =
        "";


    /* ============================================================
       CONTRÔLE DE PAGE
       ============================================================ */

    function isKohaSearchResultsPage() {

        return (
            window.location.pathname ===
                SEARCH_PATH

            &&

            !!document.getElementById(
                "bookbag_form"
            )

            &&

            !!document.querySelector(
                '#bookbag_form tbody tr[id^="row"]'
            )
        );
    }


    function isMobile() {

        return mobileMedia.matches;
    }


    /* ============================================================
       CSS
       ============================================================ */

    function installStyles() {

        if (
            !isKohaSearchResultsPage()
            ||
            document.getElementById(
                "kx-search-results-v8-style"
            )
        ) {
            return;
        }


        const style =
            document.createElement(
                "style"
            );


        style.id =
            "kx-search-results-v8-style";


        style.textContent = `


/* ============================================================
   PORTÉE STRICTE
   ============================================================ */

body.kx-search-results-page
#bookbag_form > table {
    width: 100%;
}


body.kx-search-results-page
#bookbag_form tbody > tr > td {
    vertical-align: top;
}


/* ============================================================
   COLONNE NOTICE
   ============================================================ */

body.kx-search-results-page
#bookbag_form tbody tr
> td.kx-notice-cell {

    position: relative;

    padding:
        7px
        10px
        54px
        10px !important;

    vertical-align:
        top !important;
}


/* ============================================================
   CARTE NOTICE
   ============================================================ */

body.kx-search-results-page
.kx-notice-card {

    position: static;

    box-sizing:
        border-box;

    background:
        #fff;

    border:
        1px solid
        #d9dfe3;

    border-radius:
        7px;

    box-shadow:
        0 1px 2px
        rgba(0,0,0,.025);

    overflow:
        visible;
}


/*
 * Lorsque les lignes bibliographiques sont
 * directement placées après la carte titre,
 * elles constituent la suite du même bloc.
 */

body.kx-search-results-page
.kx-notice-cell.kx-has-external-biblio
> .kx-notice-card {

    border-bottom:
        0;

    border-radius:
        7px
        7px
        0
        0;
}


/* ============================================================
   NOTICE-DETAILS VIDE
   ============================================================ */

body.kx-search-results-page
.kx-notice-details-empty {

    display:
        none !important;

    margin:
        0 !important;

    padding:
        0 !important;

    width:
        0 !important;

    height:
        0 !important;

    min-height:
        0 !important;

    border:
        0 !important;

    overflow:
        hidden !important;
}


/* ============================================================
   EN-TÊTE NOTICE
   ============================================================ */

body.kx-search-results-page
.kx-notice-head {

    display:
        flex;

    align-items:
        flex-start;

    justify-content:
        space-between;

    gap:
        10px;

    padding:
        8px
        11px;

    background:
        #f3f5f6;

    border-radius:
        7px
        7px
        0
        0;
}


body.kx-search-results-page
.kx-notice-head-main {

    min-width:
        0;

    flex:
        1;
}


/* ============================================================
   TITRE — VERT KOHA
   ============================================================ */

body.kx-search-results-page
.kx-notice-head
.firstresult {

    margin:
        0 !important;

    padding:
        0 !important;

    color:
        #26343b;

    line-height:
        1.35;
}


body.kx-search-results-page
.kx-notice-head
.titlemikaresult {

    color:
        #26343b;

    line-height:
        1.35;
}


body.kx-search-results-page
.kx-notice-head
.titlebibresult {

    font-size:
        17px;

    line-height:
        1.3;
}


body.kx-search-results-page
.kx-notice-head
.titlebibresult a {

    color:
        #4f772d !important;

    text-decoration:
        none;

    font-weight:
        700;
}


body.kx-search-results-page
.kx-notice-head
.titlebibresult a:hover {

    color:
        #365314 !important;

    text-decoration:
        underline;
}


/* Copier le titre */

body.kx-search-results-page
.kx-notice-head
.copy-title-result {

    width:
        15px !important;

    height:
        15px !important;

    margin-left:
        6px;

    opacity:
        .66;

    vertical-align:
        -2px;

    cursor:
        pointer;
}


body.kx-search-results-page
.kx-notice-head
.copy-title-result:hover {

    opacity:
        1;
}


/* ============================================================
   OUTILS DE L'ENTÊTE
   ============================================================ */

body.kx-search-results-page
.kx-notice-head-tools {

    display:
        flex;

    align-items:
        center;

    gap:
        5px;

    flex:
        0 0 auto;
}


/* ============================================================
   AFFICHER PLUS
   ============================================================ */

body.kx-search-results-page
.kx-notice-head
.btn-show-more {

    margin:
        0 !important;

    padding:
        4px
        8px !important;

    border:
        1px solid
        #c7d0d5 !important;

    border-radius:
        5px !important;

    background:
        #fff !important;

    color:
        #304b59 !important;

    font-size:
        11px !important;

    font-weight:
        600;

    box-shadow:
        none !important;

    outline:
        none !important;
}


body.kx-search-results-page
.kx-notice-head
.btn-show-more:hover {

    background:
        #eaf0f3 !important;

    border-color:
        #aebdc5 !important;

    color:
        #183d52 !important;
}


/* ============================================================
   PARTAGE
   ============================================================ */

body.kx-search-results-page
.kx-notice-head
.liens_externes {

    position:
        relative !important;

    width:
        auto !important;

    height:
        auto !important;

    margin:
        0 !important;

    padding:
        0 !important;
}


body.kx-search-results-page
.kx-notice-head
.liens_externes > br {

    display:
        none !important;
}


body.kx-search-results-page
.kx-notice-head
.share-button {

    width:
        29px !important;

    height:
        29px !important;

    margin:
        0 !important;

    padding:
        5px !important;

    border:
        1px solid
        #c7d0d5 !important;

    border-radius:
        5px !important;

    background:
        #fff !important;

    box-shadow:
        none !important;

    outline:
        none !important;
}


body.kx-search-results-page
.kx-notice-head
.share-button:hover {

    background:
        #eaf0f3 !important;
}


body.kx-search-results-page
.kx-notice-head
.share-button img {

    width:
        16px !important;

    height:
        16px !important;

    margin:
        0 !important;

    object-fit:
        contain;
}


body.kx-search-results-page
.kx-notice-head
.share-menu {

    z-index:
        5000 !important;

    top:
        calc(100% + 4px) !important;

    right:
        0 !important;

    left:
        auto !important;

    min-width:
        175px;

    padding:
        8px !important;

    background:
        #fff;

    border:
        1px solid
        #c9d2d7;

    border-radius:
        7px;

    box-shadow:
        0 5px 14px
        rgba(0,0,0,.18);
}


/* ============================================================
   DONNÉES DANS NOTICE-DETAILS
   ============================================================ */

body.kx-search-results-page
.kx-notice-card
.notice-details {

    margin:
        0 !important;

    padding:
        4px
        11px
        8px !important;

    background:
        #fff;

    color:
        #29373f;
}


body.kx-search-results-page
.kx-notice-card
.notice-details
> li.kx-biblio-line {

    margin:
        0;

    padding:
        4px
        5px;

    border:
        0 !important;

    line-height:
        1.42;

    color:
        #29373f !important;
}


/* ============================================================
   MÉTADONNÉES DIRECTEMENT DANS LE TD
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
> li.kx-biblio-line {

    box-sizing:
        border-box;

    margin:
        0 !important;

    padding:
        4px
        11px !important;

    list-style:
        none;

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;

    border-left:
        1px solid
        #d9dfe3;

    border-right:
        1px solid
        #d9dfe3;

    line-height:
        1.42;

    color:
        #29373f !important;
}


/* ============================================================
   CONTRASTE TEXTE
   ============================================================ */

body.kx-search-results-page
.kx-biblio-line {

    color:
        #29373f !important;
}


body.kx-search-results-page
.kx-biblio-line
> strong:first-child {

    color:
        #344a55 !important;

    font-weight:
        700;
}


body.kx-search-results-page
.kx-biblio-line a {

    color:
        #155b83;

    text-decoration-thickness:
        1px;

    text-underline-offset:
        2px;
}


body.kx-search-results-page
.kx-biblio-line a:hover {

    color:
        #073f60;
}


body.kx-search-results-page
.kx-biblio-line span,

body.kx-search-results-page
.kx-biblio-line p {

    color:
        inherit;
}


/* ============================================================
   COLLECTION / SÉRIE / CONTIENT
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
> li.kx-notice-meta-series {

    margin:
        0 !important;

    padding:
        4px
        11px !important;

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;

    border-left:
        1px solid
        #d9dfe3 !important;

    border-right:
        1px solid
        #d9dfe3 !important;

    border-radius:
        0 !important;
}


body.kx-search-results-page
.kx-notice-card
.kx-notice-meta-series {

    background:
        transparent !important;

    border:
        0 !important;
}


body.kx-search-results-page
.kx-notice-meta-series
> strong:first-child {

    color:
        #344a55 !important;
}


/* ============================================================
   AUTEUR / DONNÉES CLASSIQUES
   ============================================================ */

body.kx-search-results-page
.kx-notice-meta-basic,

body.kx-search-results-page
.kx-notice-meta-author {

    background:
        #fff !important;
}


body.kx-search-results-page
.kx-notice-meta-author a {

    font-weight:
        500;
}


/* ============================================================
   SUJETS / INDEXATION
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
> li.kx-notice-meta-subject {

    margin:
        0 !important;

    padding:
        4px
        11px !important;

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;

    border-left:
        1px solid
        #d9dfe3 !important;

    border-right:
        1px solid
        #d9dfe3 !important;

    border-radius:
        0 !important;
}


body.kx-search-results-page
.kx-notice-card
.kx-notice-meta-subject {

    background:
        transparent !important;

    border:
        0 !important;
}


/* ============================================================
   ACQUISITION 099
   Intégrée au même bloc blanc.
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
> li.kx-notice-meta-acquisition {

    margin:
        0 !important;

    padding:
        4px
        11px !important;

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;

    border-left:
        1px solid
        #d9dfe3 !important;

    border-right:
        1px solid
        #d9dfe3 !important;

    border-radius:
        0 !important;

    box-shadow:
        none !important;

    line-height:
        1.55 !important;

    color:
        #29373f !important;
}


body.kx-search-results-page
.kx-notice-card
.kx-notice-meta-acquisition {

    margin:
        0 !important;

    padding:
        4px
        5px !important;

    background:
        #fff !important;

    border:
        0 !important;

    border-radius:
        0 !important;

    box-shadow:
        none !important;

    line-height:
        1.55 !important;

    color:
        #29373f !important;
}


body.kx-search-results-page
.kx-notice-meta-acquisition
> strong:first-child {

    color:
        #344a55 !important;

    font-weight:
        700;
}


body.kx-search-results-page
.kx-notice-meta-acquisition u {

    text-decoration:
        none;

    color:
        #344a55 !important;

    font-size:
        10px;

    font-weight:
        700;

    text-transform:
        uppercase;

    letter-spacing:
        .025em;
}


body.kx-search-results-page
.kx-notice-meta-acquisition
img.acq-domaine,

body.kx-search-results-page
.kx-notice-meta-acquisition
img.acq-sous-domaine {

    max-width:
        18px !important;

    max-height:
        18px !important;

    vertical-align:
        -4px;

    opacity:
        .78;
}


body.kx-search-results-page
.kx-notice-meta-acquisition
img:hover {

    opacity:
        1;
}


/* ============================================================
   RÉSUMÉ / MOTS-CLÉS
   ============================================================ */

body.kx-search-results-page
.kx-notice-meta-fold {

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;
}


body.kx-search-results-page
.kx-notice-meta-subject.kx-notice-meta-fold {

    background:
        #fff !important;
}


body.kx-search-results-page
.kx-notice-meta-fold p {

    margin:
        0 !important;
}


body.kx-search-results-page
.kx-notice-meta-fold
.bouton {

    padding:
        3px
        8px;

    background:
        #edf1f3 !important;

    border:
        1px solid
        #cbd4d9 !important;

    border-radius:
        5px;

    color:
        #294553 !important;

    font-size:
        11px;

    font-weight:
        700;

    cursor:
        pointer;

    box-shadow:
        none !important;

    outline:
        none !important;
}


body.kx-search-results-page
.kx-notice-meta-fold
.bouton:hover {

    background:
        #e2e9ed !important;

    border-color:
        #aebcc4 !important;

    color:
        #153a4e !important;
}


/*
 * IMPORTANT :
 * aucun display n'est imposé ici.
 *
 * Si Koha ou ton ancien script masque une section,
 * elle reste masquée.
 */

body.kx-search-results-page
.kx-notice-meta-fold
.sectionz {

    margin-top:
        6px !important;

    padding:
        8px
        9px !important;

    background:
        #fff !important;

    border:
        1px solid
        #d5dde1 !important;

    border-radius:
        5px;

    color:
        #27363e !important;

    line-height:
        1.5;

    box-shadow:
        none !important;
}


body.kx-search-results-page
.kx-notice-meta-fold
.sectionz p,

body.kx-search-results-page
.kx-notice-meta-fold
.sectionz strong {

    color:
        #27363e;
}


/* ============================================================
   OUTILS ISBN / EAN / EFFICACITÉ
   ============================================================ */

body.kx-search-results-page
.kx-notice-meta-tools {

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;

    color:
        #29373f !important;
}


body.kx-search-results-page
.kx-notice-cell
> li.kx-notice-meta-tools {

    padding:
        6px
        10px !important;

    background:
        #fff !important;

    border-top:
        0 !important;

    border-bottom:
        0 !important;
}


body.kx-search-results-page
.kx-notice-meta-tools
> a,

body.kx-search-results-page
.kx-notice-meta-tools
> span,

body.kx-search-results-page
.kx-notice-meta-tools
> div {

    margin-right:
        6px;
}


body.kx-search-results-page
.kx-notice-meta-tools
> a > img {

    max-width:
        20px;

    max-height:
        20px;

    vertical-align:
        middle;
}


body.kx-search-results-page
.kx-notice-meta-tools
span.copy-isbn-result,

body.kx-search-results-page
.kx-notice-meta-tools
span.copy-ean-result {

    display:
        inline-flex;

    align-items:
        center;

    gap:
        4px;

    min-height:
        22px;

    box-sizing:
        border-box;

    padding:
        2px
        6px;

    background:
        #f4f6f7 !important;

    border:
        1px solid
        #ced6da !important;

    border-radius:
        4px;

    color:
        #344a55 !important;

    font-size:
        10px;

    line-height:
        1.2;

    vertical-align:
        middle;

    cursor:
        pointer;
}


body.kx-search-results-page
.kx-notice-meta-tools
span.copy-isbn-result:hover,

body.kx-search-results-page
.kx-notice-meta-tools
span.copy-ean-result:hover {

    background:
        #eaf0f3 !important;

    border-color:
        #aebdc5 !important;

    color:
        #183d52 !important;
}


body.kx-search-results-page
.kx-notice-meta-tools
span.copy-isbn-result > img.copy-isbn-result,

body.kx-search-results-page
.kx-notice-meta-tools
span.copy-ean-result > img.copy-ean-result {

    display:
        inline-block !important;

    flex:
        0 0 auto;

    width:
        13px !important;

    height:
        13px !important;

    min-width:
        13px !important;

    max-width:
        13px !important;

    min-height:
        13px !important;

    max-height:
        13px !important;

    margin:
        0 !important;

    padding:
        0 !important;

    border:
        0 !important;

    border-radius:
        0 !important;

    background:
        transparent !important;

    box-shadow:
        none !important;

    object-fit:
        contain;

    vertical-align:
        middle;

    opacity:
        .78;
}


body.kx-search-results-page
.kx-notice-meta-tools
span.copy-isbn-result:hover > img.copy-isbn-result,

body.kx-search-results-page
.kx-notice-meta-tools
span.copy-ean-result:hover > img.copy-ean-result {

    opacity:
        1;
}


body.kx-search-results-page
.kx-notice-meta-tools
.global-efficiency-indicator {

    margin:
        2px !important;

    padding:
        3px
        6px !important;

    font-size:
        11px !important;

    border-radius:
        5px !important;
}


/* ============================================================
   DERNIÈRE LIGNE DU BLOC BIBLIO
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
> li.kx-biblio-last {

    border-bottom:
        1px solid
        #d9dfe3 !important;

    border-radius:
        0 0 7px 7px;
}


/* ============================================================
   ACTIONS NOTICE — DESKTOP
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
p.hold {

    position:
        absolute;

    right:
        10px;

    bottom:
        8px;

    margin:
        0 !important;

    padding:
        0 !important;

    text-align:
        right;

    line-height:
        29px !important;

    white-space:
        normal;
}


body.kx-search-results-page
.kx-notice-cell
p.hold > a {

    margin-left:
        4px;

    padding:
        4px
        7px;

    background:
        #f4f6f7;

    border:
        1px solid
        #cfd7db;

    border-radius:
        5px;

    color:
        #294a5d;

    text-decoration:
        none;

    font-size:
        11px;

    white-space:
        nowrap;

    outline:
        none !important;

    outline-offset:
        0 !important;

    box-shadow:
        none !important;
}


body.kx-search-results-page
.kx-notice-cell
p.hold > a:hover {

    background:
        #e6eef2;

    border-color:
        #aebdc5;

    color:
        #123e58;

    text-decoration:
        none;

    outline:
        none !important;

    box-shadow:
        none !important;
}


body.kx-search-results-page
.kx-notice-cell
p.hold > a:focus,

body.kx-search-results-page
.kx-notice-cell
p.hold > a:active,

body.kx-search-results-page
.kx-notice-cell
p.hold > a:focus-visible {

    outline:
        none !important;

    outline-offset:
        0 !important;

    box-shadow:
        none !important;

    text-decoration:
        none !important;
}


body.kx-search-results-page
.kx-notice-cell
p.hold > a::-moz-focus-inner {

    border:
        0 !important;
}


body.kx-search-results-page
.kx-notice-cell
p.hold
> a[id^="reserve_"] {

    background:
        #eef4f8;

    border-color:
        #c5d5df;

    color:
        #24546f;
}


body.kx-search-results-page
.kx-notice-cell
p.hold
> a[href*="/cataloguing/"] {

    background:
        #f6f4ed;

    border-color:
        #d9d2bd;

    color:
        #554f36;
}


/* ============================================================
   ÉLÉMENTS TECHNIQUES VIDES
   ============================================================ */

body.kx-search-results-page
.kx-notice-cell
.result-item:empty {

    display:
        none !important;
}


/* ============================================================
   COLONNE EXEMPLAIRES
   ============================================================ */

body.kx-search-results-page
td.kxri-cell {

    min-width:
        370px;

    vertical-align:
        top !important;
}


body.kx-search-results-page
.kxri-panel {

    width:
        100%;

    box-sizing:
        border-box;

    font-size:
        13px;
}


/*
 * Masqué uniquement après réussite API.
 */

body.kx-search-results-page
.kxri-native-hidden {

    display:
        none !important;
}


/* ============================================================
   RÉSUMÉ EXEMPLAIRES
   ============================================================ */

body.kx-search-results-page
.kxri-summary {

    display:
        flex;

    flex-wrap:
        wrap;

    align-items:
        center;

    gap:
        5px;

    margin:
        0
        0
        8px
        0;

    padding:
        6px
        8px;

    background:
        #f7f8fa;

    border:
        1px solid
        #dfe3e7;

    border-radius:
        6px;
}


body.kx-search-results-page
.kxri-summary-total {

    font-weight:
        700;

    color:
        #263a47;

    margin-right:
        3px;
}


body.kx-search-results-page
.kxri-summary-badge {

    display:
        inline-flex;

    align-items:
        center;

    padding:
        2px
        7px;

    border-radius:
        12px;

    font-size:
        11px;

    font-weight:
        600;

    white-space:
        nowrap;
}


body.kx-search-results-page
.kxri-summary-badge.is-available {

    background:
        #dff1e4;

    color:
        #1c6534;
}


body.kx-search-results-page
.kxri-summary-badge.is-loan {

    background:
        #ffedbf;

    color:
        #704900;
}


body.kx-search-results-page
.kxri-summary-badge.is-unavailable {

    background:
        #f2dddd;

    color:
        #713f3f;
}


/* ============================================================
   LISTE EXEMPLAIRES
   ============================================================ */

body.kx-search-results-page
.kxri-items {

    display:
        flex;

    flex-direction:
        column;

    gap:
        8px;
}


/* ============================================================
   CARTE EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-item {

    position:
        relative;

    box-sizing:
        border-box;

    border:
        1px solid
        #d8dde2;

    border-left:
        4px solid
        #9aa5ae;

    border-radius:
        7px;

    background:
        #fff;

    overflow:
        visible;

    transition:
        box-shadow .15s ease,
        border-color .15s ease;
}


body.kx-search-results-page
.kxri-item:hover {

    box-shadow:
        0 2px 7px
        rgba(0,0,0,.10);
}


/* Statuts */

body.kx-search-results-page
.kxri-item.is-available {

    border-left-color:
        #3b9858;
}


body.kx-search-results-page
.kxri-item.is-loan {

    border-left-color:
        #d89614;
}


body.kx-search-results-page
.kxri-item.is-transfer {

    border-left-color:
        #417db3;
}


body.kx-search-results-page
.kxri-item.is-hold {

    border-left-color:
        #7558a6;
}


body.kx-search-results-page
.kxri-item.is-unavailable {

    border-left-color:
        #a15b5b;
}


/* Fonds */

body.kx-search-results-page
.kxri-item.is-available
.kxri-main {

    background:
        #f0f8f2;
}


body.kx-search-results-page
.kxri-item.is-loan
.kxri-main {

    background:
        #fff8e7;
}


body.kx-search-results-page
.kxri-item.is-transfer
.kxri-main {

    background:
        #eef6fc;
}


body.kx-search-results-page
.kxri-item.is-hold
.kxri-main {

    background:
        #f5f1fa;
}


body.kx-search-results-page
.kxri-item.is-unavailable
.kxri-main {

    background:
        #fbefef;
}


body.kx-search-results-page
.kxri-item.is-local {

    box-shadow:
        inset
        0
        0
        0
        1px
        rgba(58,123,213,.25);
}


/* ============================================================
   CORPS EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-main {

    padding:
        8px
        9px;

    border-radius:
        6px
        6px
        0
        0;
}


body.kx-search-results-page
.kxri-topline {

    display:
        flex;

    align-items:
        flex-start;

    justify-content:
        space-between;

    gap:
        8px;
}


body.kx-search-results-page
.kxri-library-wrap {

    display:
        flex;

    align-items:
        center;

    gap:
        7px;

    min-width:
        0;

    flex:
        1;
}


body.kx-search-results-page
.kxri-itemtype-icon {

    flex:
        0 0 auto;

    width:
        28px;

    height:
        28px;

    object-fit:
        contain;
}


body.kx-search-results-page
.kxri-library-text {

    min-width:
        0;
}


body.kx-search-results-page
.kxri-library {

    font-size:
        14px;

    font-weight:
        700;

    line-height:
        1.2;

    color:
        #253746;
}


body.kx-search-results-page
.kxri-local-badge {

    display:
        inline-block;

    margin-left:
        5px;

    padding:
        1px
        5px;

    font-size:
        9px;

    border-radius:
        8px;

    background:
        #e1edf9;

    color:
        #28649a;
}


/* ============================================================
   STATUT EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-status {

    flex:
        0 0 auto;

    padding:
        3px
        7px;

    border-radius:
        11px;

    font-size:
        10px;

    line-height:
        15px;

    font-weight:
        700;

    white-space:
        nowrap;
}


body.kx-search-results-page
.kxri-status.is-available {

    background:
        #d7ecde;

    color:
        #226638;
}


body.kx-search-results-page
.kxri-status.is-loan {

    background:
        #ffe6ad;

    color:
        #744d00;
}


body.kx-search-results-page
.kxri-status.is-transfer {

    background:
        #dcebf7;

    color:
        #315f88;
}


body.kx-search-results-page
.kxri-status.is-hold {

    background:
        #e9e0f4;

    color:
        #604589;
}


body.kx-search-results-page
.kxri-status.is-unavailable {

    background:
        #efd8d8;

    color:
        #754343;
}


/* ============================================================
   LOCALISATION / COTE
   ============================================================ */

body.kx-search-results-page
.kxri-location-line {

    display:
        flex;

    flex-wrap:
        wrap;

    align-items:
        center;

    gap:
        5px
        8px;

    margin-top:
        6px;
}


body.kx-search-results-page
.kxri-location {

    color:
        #3f515c;
}


body.kx-search-results-page
.kxri-callnumber-wrap {

    display:
        inline-flex;

    align-items:
        center;

    gap:
        3px;

    position:
        relative;
}


body.kx-search-results-page
.kxri-callnumber {

    font-weight:
        700;

    font-size:
        13px;
}


body.kx-search-results-page
.kxri-callnumber > a {

    color:
        #195e84;

    text-decoration:
        none;
}


body.kx-search-results-page
.kxri-callnumber > a:hover {

    text-decoration:
        underline;
}


/* ============================================================
   MENU COTE
   ============================================================ */

body.kx-search-results-page
.kxri-callnumber-menu {

    position:
        relative;

    display:
        inline-block;
}


body.kx-search-results-page
.kxri-callnumber-menu
> summary {

    list-style:
        none;

    cursor:
        pointer;

    padding:
        1px
        5px;

    border-radius:
        4px;

    background:
        rgba(255,255,255,.75);

    color:
        #3e5867;

    font-size:
        11px;

    user-select:
        none;
}


body.kx-search-results-page
.kxri-callnumber-menu
> summary::-webkit-details-marker {

    display:
        none;
}


body.kx-search-results-page
.kxri-callnumber-menu
> summary:hover {

    background:
        #fff;
}


body.kx-search-results-page
.kxri-callnumber-options {

    position:
        absolute;

    z-index:
        5000;

    top:
        calc(100% + 3px);

    left:
        0;

    min-width:
        210px;

    max-width:
        320px;

    padding:
        5px;

    background:
        #fff;

    border:
        1px solid
        #cfd6dc;

    border-radius:
        6px;

    box-shadow:
        0 4px 12px
        rgba(0,0,0,.18);
}


body.kx-search-results-page
.kxri-callnumber-options-title {

    padding:
        3px
        6px
        5px;

    font-size:
        10px;

    font-weight:
        700;

    text-transform:
        uppercase;

    color:
        #596d78;
}


body.kx-search-results-page
.kxri-callnumber-option {

    display:
        block;

    padding:
        5px
        7px;

    border-radius:
        4px;

    color:
        #245b79;

    text-decoration:
        none;

    font-size:
        12px;
}


body.kx-search-results-page
.kxri-callnumber-option:hover {

    background:
        #edf4f8;

    text-decoration:
        none;
}


/* ============================================================
   COLLECTION EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-collection {

    margin-top:
        5px;

    font-size:
        11px;

    color:
        #465b67;
}


body.kx-search-results-page
.kxri-collection a {

    display:
        inline-block;

    padding:
        1px
        6px;

    border-radius:
        9px;

    background:
        rgba(255,255,255,.75);

    color:
        #385769;

    text-decoration:
        none;

    font-weight:
        600;
}


body.kx-search-results-page
.kxri-collection a:hover {

    background:
        #fff;

    color:
        #195e84;

    text-decoration:
        underline;
}


/* ============================================================
   CODE-BARRES
   ============================================================ */

body.kx-search-results-page
.kxri-barcode-line {

    display:
        flex;

    align-items:
        center;

    flex-wrap:
        wrap;

    gap:
        5px;

    margin-top:
        6px;
}


body.kx-search-results-page
.kxri-barcode {

    padding:
        2px
        5px;

    background:
        rgba(255,255,255,.78);

    border-radius:
        4px;

    color:
        #2f414b;

    font-family:
        Consolas,
        "Courier New",
        monospace;

    font-size:
        12px;
}


body.kx-search-results-page
.kxri-copy {

    padding:
        2px
        4px;

    border:
        0;

    background:
        transparent;

    color:
        #405d6e;

    cursor:
        pointer;

    font-size:
        11px;

    outline:
        none !important;

    box-shadow:
        none !important;
}


body.kx-search-results-page
.kxri-copy:hover {

    color:
        #195e84;

    text-decoration:
        underline;
}


/* ============================================================
   INFOS EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-secondary {

    margin-top:
        5px;

    color:
        #445863;

    font-size:
        11px;

    line-height:
        1.4;
}


body.kx-search-results-page
.kxri-due {

    margin-top:
        5px;

    color:
        #795300;

    font-size:
        11px;

    font-weight:
        700;
}


body.kx-search-results-page
.kxri-quickstats {

    display:
        flex;

    flex-wrap:
        wrap;

    align-items:
        center;

    gap:
        5px;

    margin-top:
        6px;
}


body.kx-search-results-page
.kxri-quickstat {

    display:
        inline-flex;

    align-items:
        center;

    gap:
        4px;

    padding:
        2px
        6px;

    border:
        1px solid
        rgba(0,0,0,.10);

    border-radius:
        10px;

    background:
        rgba(255,255,255,.76);

    color:
        #3d505b;

    font-size:
        10px;

    font-weight:
        700;

    line-height:
        1.35;

    white-space:
        nowrap;
}


body.kx-search-results-page
.kxri-quickstat.is-loans {

    color:
        #315b72;

    border-color:
        #c7d9e4;

    background:
        #eef6fa;
}


body.kx-search-results-page
.kxri-quickstat.is-due-future {

    color:
        #5e5200;

    border-color:
        #e2d596;

    background:
        #fff8d9;
}


body.kx-search-results-page
.kxri-quickstat.is-due-today {

    color:
        #704900;

    border-color:
        #dfbd6e;

    background:
        #ffedbf;
}


body.kx-search-results-page
.kxri-quickstat.is-overdue {

    color:
        #8a2f2f;

    border-color:
        #e2b2b2;

    background:
        #fbe2e2;
}


body.kx-search-results-page
.kxri-quickstat.is-not-for-loan {
    background: #f4e4e4;
    border-color: #ddbcbc;
    color: #7a3838;
}

body.kx-search-results-page
.kxri-date-age {
    margin-left: 5px;
    color: #6f7d85;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
}

body.kx-search-results-page
.kxri-date-age.is-overdue {
    color: #a13f38;
    font-weight: 700;
}

body.kx-search-results-page
.kxri-date-age.is-future {
    color: #6d5500;
    font-weight: 700;
}


/* ============================================================
   ACTIONS EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-actions {

    display:
        flex;

    flex-wrap:
        wrap;

    align-items:
        center;

    gap:
        4px;

    padding:
        5px
        8px;

    background:
        #fafbfc;

    border-top:
        1px solid
        #e1e6e9;
}


body.kx-search-results-page
.kxri-action {

    display:
        inline-flex;

    align-items:
        center;

    gap:
        4px;

    padding:
        3px
        5px;

    border:
        0;

    border-radius:
        4px;

    background:
        transparent;

    color:
        #315a70;

    text-decoration:
        none;

    font-size:
        11px;

    cursor:
        pointer;

    outline:
        none !important;

    box-shadow:
        none !important;
}


body.kx-search-results-page
.kxri-action:hover {

    background:
        #edf3f7;

    color:
        #174d6d;

    text-decoration:
        none;
}


body.kx-search-results-page
.kxri-action:disabled {

    opacity:
        .55;

    cursor:
        wait;
}


/* ============================================================
   DÉTAILS EXEMPLAIRE
   ============================================================ */

body.kx-search-results-page
.kxri-details {

    display:
        none;

    padding:
        7px
        9px
        9px;

    background:
        #fff;

    border-top:
        1px solid
        #edf0f2;

    border-radius:
        0
        0
        6px
        6px;
}


body.kx-search-results-page
.kxri-item.is-expanded
.kxri-details {

    display:
        block;
}


body.kx-search-results-page
.kxri-detail-grid {

    display:
        grid;

    grid-template-columns:
        max-content
        1fr;

    gap:
        3px
        8px;

    font-size:
        11px;
}


body.kx-search-results-page
.kxri-detail-label {

    font-weight:
        700;

    color:
        #415762;
}


body.kx-search-results-page
.kxri-detail-value {

    min-width:
        0;

    color:
        #273940;

    overflow-wrap:
        anywhere;
}


body.kx-search-results-page
.kxri-detail-value a {

    color:
        #195e84;
}


/* ============================================================
   CHARGEMENT
   ============================================================ */

body.kx-search-results-page
.kxri-loading {

    padding:
        8px;

    color:
        #435966;

    font-size:
        11px;

    font-style:
        italic;
}


/* ============================================================
   BOUTON GLOBAL
   ============================================================ */

body.kx-search-results-page
#toggle-all-exemplaires.kx-all-open {

    background:
        #eef4f7 !important;

    border-color:
        #b9c9d2 !important;

    color:
        #315c73 !important;
}


/* ============================================================
   TABLETTE
   ============================================================ */

@media (max-width: 1200px) {

    body.kx-search-results-page
    td.kxri-cell {

        min-width:
            290px;
    }
}


/* ============================================================
   MOBILE
   ============================================================ */

@media (max-width: 767px) {


    /* --------------------------------------------------------
       CELLULE NOTICE
       -------------------------------------------------------- */

    body.kx-search-results-page
    #bookbag_form tbody tr
    > td.kx-notice-cell {

        padding-bottom:
            58px !important;
    }


    /* --------------------------------------------------------
       HEADER
       -------------------------------------------------------- */

    body.kx-search-results-page
    .kx-notice-head {

        display:
            grid;

        grid-template-columns:
            minmax(0,1fr)
            auto;

        align-items:
            start;

        gap:
            7px;

        padding:
            8px
            9px;
    }


    body.kx-search-results-page
    .kx-notice-head-tools {

        display:
            flex;

        align-items:
            center;

        justify-content:
            flex-end;

        gap:
            5px;
    }


    body.kx-search-results-page
    .kx-notice-head
    .titlebibresult {

        font-size:
            15px;
    }


    /* --------------------------------------------------------
       AFFICHER PLUS / MOINS
       -------------------------------------------------------- */

    body.kx-search-results-page
    .kx-notice-head
    .btn-show-more {

        min-height:
            29px;

        padding:
            4px
            8px !important;

        background:
            #fff !important;

        border:
            1px solid
            #bfcbd1 !important;

        color:
            #294553 !important;

        font-size:
            10px !important;

        font-weight:
            700;

        white-space:
            nowrap;
    }


    body.kx-search-results-page
    .kx-notice-cell.kx-mobile-collapsed
    .btn-show-more::after {

        content:
            "  ▾";
    }


    body.kx-search-results-page
    .kx-notice-cell.kx-mobile-expanded
    .btn-show-more::after {

        content:
            "  ▴";
    }


    /*
     * Repli :
     * on masque uniquement les lignes que notre script
     * a identifiées comme données bibliographiques.
     */

    body.kx-search-results-page
    .kx-notice-cell.kx-mobile-collapsed
    > li.kx-biblio-line {

        display:
            none !important;
    }


    body.kx-search-results-page
    .kx-notice-cell.kx-mobile-collapsed
    .notice-details
    > li.kx-biblio-line {

        display:
            none !important;
    }


    body.kx-search-results-page
    .kx-notice-cell.kx-mobile-collapsed
    .notice-details {

        padding-top:
            0 !important;

        padding-bottom:
            0 !important;
    }


    /*
     * Quand replié, la carte titre se referme visuellement.
     */

    body.kx-search-results-page
    .kx-notice-cell.kx-mobile-collapsed
    > .kx-notice-card {

        border-bottom:
            1px solid
            #d9dfe3 !important;

        border-radius:
            7px !important;
    }


    /* --------------------------------------------------------
       ACTIONS NOTICE MOBILE
       -------------------------------------------------------- */

    body.kx-search-results-page
    .kx-notice-cell
    p.hold {

        display:
            flex;

        align-items:
            center;

        justify-content:
            flex-end;

        gap:
            5px;

        right:
            8px;

        bottom:
            8px;

        line-height:
            normal !important;
    }


    /*
     * Boutons carrés cohérents.
     */

    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-mobile-action {

        display:
            inline-flex !important;

        align-items:
            center;

        justify-content:
            center;

        width:
            34px;

        height:
            34px;

        box-sizing:
            border-box;

        margin:
            0 !important;

        padding:
            0 !important;

        background:
            #f7f9f8 !important;

        border:
            1px solid
            #cbd5cf !important;

        border-radius:
            7px !important;

        color:
            #45682f !important;

        /*
         * Le libellé reste dans le DOM
         * mais n'est plus affiché visuellement.
         */
        font-size:
            0 !important;

        text-decoration:
            none !important;

        outline:
            none !important;

        box-shadow:
            none !important;
    }


    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-mobile-action:hover,

    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-mobile-action:focus {

        background:
            #edf3ea !important;

        border-color:
            #9eb292 !important;

        color:
            #365622 !important;

        outline:
            none !important;

        box-shadow:
            none !important;
    }


    /*
     * Une seule famille graphique :
     * on neutralise d'éventuelles anciennes icônes.
     */

    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-mobile-action
    > i,

    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-mobile-action
    > img {

        display:
            none !important;
    }


    /*
     * Koha charge déjà Font Awesome.
     */

    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-mobile-action::before {

        display:
            inline-block;

        font-family:
            FontAwesome;

        font-size:
            15px;

        font-style:
            normal;

        font-weight:
            normal;

        line-height:
            1;

        text-rendering:
            auto;

        -webkit-font-smoothing:
            antialiased;
    }


    /*
     * Réserver
     * bookmark
     */
    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-action-reserve::before {

        content:
            "\\f02e";
    }


    /*
     * Ajouter au panier
     * cart-plus
     */
    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-action-cart::before {

        content:
            "\\f217";
    }


    /*
     * Modifier notice
     * pencil-square
     */
    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-action-edit-biblio::before {

        content:
            "\\f044";
    }


    /*
     * Modifier exemplaires
     * list-alt
     */
    body.kx-search-results-page
    .kx-notice-cell
    p.hold
    > a.kx-action-edit-items::before {

        content:
            "\\f022";
    }


    /* --------------------------------------------------------
       EXEMPLAIRES MOBILE
       -------------------------------------------------------- */

    body.kx-search-results-page
    td.kxri-cell {

        min-width:
            280px;
    }


    body.kx-search-results-page
    .kxri-topline {

        flex-direction:
            column;
    }


    body.kx-search-results-page
    .kxri-status {

        align-self:
            flex-start;
    }

}

        `;


        document.head.appendChild(
            style
        );
    }


    /* ============================================================
       HELPERS
       ============================================================ */

    function normalize(value) {

        return String(
            value || ""
        )
            .normalize("NFD")
            .replace(
                /[\u0300-\u036f]/g,
                ""
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .toLowerCase();
    }


    function escapeHtml(value) {

        return String(
            value ?? ""
        )
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#039;"
            );
    }


    function normalizedText(element) {

        return String(
            element?.textContent || ""
        )
            .replace(
                /\u00a0/g,
                " "
            )
            .replace(
                /[\u200B-\u200D\uFEFF]/g,
                ""
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();
    }


    function hasMeaningfulContent(
        element
    ) {

        if (!element) {
            return false;
        }


        if (
            normalizedText(
                element
            )
        ) {
            return true;
        }


        return !!element.querySelector(
            [
                "a",
                "button",
                "img",
                "input",
                "select",
                "textarea",
                "svg",
                ".global-efficiency-indicator"
            ].join(",")
        );
    }


    function getString(
        item,
        key
    ) {

        const value =
            item?._strings?.[key];


        if (
            value == null
        ) {
            return "";
        }


        if (
            typeof value ===
            "string"
        ) {
            return value;
        }


        return (
            value.str
            ||
            value.description
            ||
            value.name
            ||
            ""
        );
    }


    function formatDate(value) {

        if (!value) {
            return "";
        }


        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return String(value);
        }


        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                day:
                    "2-digit",

                month:
                    "2-digit",

                year:
                    "numeric"
            }
        ).format(date);
    }


    function getBiblioNumber(row) {

        const match =
            row.id?.match(
                /^row(\d+)$/
            );


        if (match) {
            return match[1];
        }


        return (
            row
                .querySelector(
                    "[data-biblionumber]"
                )
                ?.dataset
                ?.biblionumber
            ||
            ""
        );
    }


    function getLoggedBranchName() {

        const selectors = [
            ".logged-in-branch-name",
            "#logged-in-info .branch-name",
            "#logged-in-info .logged-in-branch",
            "[data-branch-name]"
        ];


        for (
            const selector
            of selectors
        ) {

            const element =
                document.querySelector(
                    selector
                );


            if (!element) {
                continue;
            }


            const value =
                normalize(
                    element.textContent
                    ||
                    element.dataset
                        ?.branchName
                );


            if (value) {
                return value;
            }
        }


        return "";
    }


    /* ============================================================
       NOTICE-DETAILS VIDE
       ============================================================ */

    function syncNoticeDetailsState(
        cell
    ) {

        if (!cell) {
            return;
        }


        cell
            .querySelectorAll(
                ".notice-details"
            )
            .forEach(
                details => {

                    details.classList.toggle(
                        "kx-notice-details-empty",

                        !hasMeaningfulContent(
                            details
                        )
                    );
                }
            );
    }


    /* ============================================================
       SUPPRESSION LIGNES RÉELLEMENT VIDES
       ============================================================ */

    function removeEmptyBibliographicLines(
        cell
    ) {

        if (!pmkFeature("notice.removeEmptyLines")) {
            return;
        }

        if (!cell) {
            return;
        }


        /*
         * LI directement sous le TD.
         */

        Array
            .from(
                cell.children
            )
            .forEach(
                element => {

                    if (
                        element.tagName !==
                        "LI"
                    ) {
                        return;
                    }


                    if (
                        element.closest(
                            ".share-menu"
                        )
                        ||
                        element.closest(
                            ".availability"
                        )
                    ) {
                        return;
                    }


                    if (
                        !hasMeaningfulContent(
                            element
                        )
                    ) {

                        element.remove();
                    }
                }
            );


        /*
         * LI dans notice-details.
         */

        cell
            .querySelectorAll(
                ".notice-details > li"
            )
            .forEach(
                element => {

                    if (
                        !hasMeaningfulContent(
                            element
                        )
                    ) {

                        element.remove();
                    }
                }
            );


        /*
         * &nbsp; ou espaces seuls
         * directement dans le TD.
         */

        Array
            .from(
                cell.childNodes
            )
            .forEach(
                node => {

                    if (
                        node.nodeType !==
                        Node.TEXT_NODE
                    ) {
                        return;
                    }


                    const text =
                        String(
                            node.textContent
                            ||
                            ""
                        )
                            .replace(
                                /\u00a0/g,
                                " "
                            )
                            .replace(
                                /[\u200B-\u200D\uFEFF]/g,
                                ""
                            )
                            .trim();


                    if (!text) {
                        node.remove();
                    }
                }
            );
    }


    /* ============================================================
       NUMÉRO AVANT TITRE
       ============================================================ */

    function removeResultNumber(
        cell
    ) {

        if (!pmkFeature("notice.removeResultNumber")) {
            return;
        }

        if (!cell) {
            return;
        }


        Array
            .from(
                cell.childNodes
            )
            .forEach(
                node => {

                    if (
                        node.nodeType !==
                        Node.TEXT_NODE
                    ) {
                        return;
                    }


                    const text =
                        String(
                            node.textContent
                            ||
                            ""
                        )
                            .replace(
                                /\u00a0/g,
                                " "
                            )
                            .trim();


                    if (
                        /^\d+\.$/.test(
                            text
                        )
                    ) {

                        node.remove();
                    }
                }
            );
    }


    /* ============================================================
       CLASSIFICATION BIBLIO
       ============================================================ */

    function classifyBibliographicLine(
        element
    ) {

        if (
            !element
            ||
            element.nodeType !==
            Node.ELEMENT_NODE
            ||
            element.tagName !==
            "LI"
        ) {
            return;
        }


        if (
            element.closest(
                ".share-menu"
            )
            ||
            element.classList.contains(
                "liste-tech-site"
            )
        ) {
            return;
        }


        if (
            element.closest(
                ".availability"
            )
            ||
            element.classList.contains(
                "result_itype_image"
            )
        ) {
            return;
        }


        if (
            !hasMeaningfulContent(
                element
            )
        ) {

            element.remove();

            return;
        }


        element.classList.add(
            "kx-biblio-line"
        );


        const zone =
            element.getAttribute(
                "title"
            )
            ||
            "";


        const text =
            normalizedText(
                element
            );


        /* Collection / série / contient */

        if (
            /Zone\s*:\s*(225|461|464)/i
                .test(zone)
            ||
            /^(Collection|Série|Contient)\s*:/i
                .test(text)
        ) {

            element.classList.add(
                "kx-notice-meta-series"
            );
        }


        /* Auteurs */

        if (
            /Zone\s*:\s*(700|701|702|710|711|712)/i
                .test(zone)
            ||
            /^Auteur/i
                .test(text)
        ) {

            element.classList.add(
                "kx-notice-meta-author"
            );
        }


        /* Données classiques */

        if (
            /Zone\s*:\s*(101|200|205|210|214|215|333)/i
                .test(zone)
            ||
            /^(Edition|Édition|Description|Langue|Public|Type document bibliographique)\s*:/i
                .test(text)
        ) {

            element.classList.add(
                "kx-notice-meta-basic"
            );
        }


        /* Acquisition */

        if (
            /Zone\s*:\s*099/i
                .test(zone)
            ||
            /^Acquisition\s*:/i
                .test(text)
        ) {

            element.classList.add(
                "kx-notice-meta-acquisition"
            );
        }


        /* Sujet */

        if (
            /Zone\s*:\s*(6xx|600|601|602|606|607|608|610|903)/i
                .test(zone)
            ||
            /Sujet\s*-\s*(Indexation|Genre)/i
                .test(text)
        ) {

            element.classList.add(
                "kx-notice-meta-subject"
            );
        }


        /* Résumé / mots clés */

        if (
            element.querySelector(
                ".bouton"
            )
            ||
            element.querySelector(
                ".sectionz"
            )
        ) {

            element.classList.add(
                "kx-notice-meta-fold"
            );
        }


        /* Outils */

        if (
            element.querySelector(
                ".global-efficiency-indicator"
            )
            ||
            element.querySelector(
                ".copy-isbn-result"
            )
            ||
            element.querySelector(
                ".copy-ean-result"
            )
            ||
            element.querySelector(
                'a[href*="id=4537"]'
            )
        ) {

            element.classList.add(
                "kx-notice-meta-tools"
            );
        }
    }


    /* ============================================================
       DERNIÈRE LIGNE BIBLIO
       ============================================================ */

    function updateExternalBibliographicLines(
        cell
    ) {

        if (!cell) {
            return;
        }


        const lines =
            Array
                .from(
                    cell.children
                )
                .filter(
                    element =>
                        element.matches(
                            "li.kx-biblio-line"
                        )
                );


        lines.forEach(
            line =>
                line.classList.remove(
                    "kx-biblio-last"
                )
        );


        if (
            lines.length
        ) {

            lines[
                lines.length - 1
            ].classList.add(
                "kx-biblio-last"
            );


            cell.classList.add(
                "kx-has-external-biblio"
            );

        }
        else {

            cell.classList.remove(
                "kx-has-external-biblio"
            );
        }
    }


    /* ============================================================
       MOBILE : AFFICHER PLUS / MOINS
       ============================================================ */

    function syncMobileNoticeControl(
        cell
    ) {

        if (!cell) {
            return;
        }


        const button =
            cell.querySelector(
                ".btn-show-more"
            );


        if (!button) {
            return;
        }


        /*
         * On mémorise l'état originel du bouton
         * pour le restaurer sur desktop.
         */

        if (
            !originalShowMoreState.has(
                button
            )
        ) {

            originalShowMoreState.set(
                button,
                {
                    html:
                        button.innerHTML,

                    ariaExpanded:
                        button.getAttribute(
                            "aria-expanded"
                        )
                }
            );
        }


        /*
         * DESKTOP :
         * notre système mobile est désactivé.
         */

        if (!isMobile() || !pmkFeature("notice.mobileCollapseEnabled")) {

            cell.classList.remove(
                "kx-mobile-collapsed",
                "kx-mobile-expanded"
            );


            const original =
                originalShowMoreState.get(
                    button
                );


            if (original) {

                button.innerHTML =
                    original.html;


                if (
                    original.ariaExpanded ===
                    null
                ) {

                    button.removeAttribute(
                        "aria-expanded"
                    );

                }
                else {

                    button.setAttribute(
                        "aria-expanded",
                        original.ariaExpanded
                    );
                }
            }


            return;
        }


        /*
         * Première initialisation mobile :
         * fermé par défaut sauf si l'ancien bouton
         * était explicitement ouvert.
         */

        if (
            cell.dataset
                .kxMobileExpanded ===
                undefined
        ) {

            cell.dataset
                .kxMobileExpanded =

                button.getAttribute(
                    "aria-expanded"
                ) === "true"

                    ? "1"

                    : "0";
        }


        const expanded =
            cell.dataset
                .kxMobileExpanded ===
                "1";


        cell.classList.toggle(
            "kx-mobile-expanded",
            expanded
        );


        cell.classList.toggle(
            "kx-mobile-collapsed",
            !expanded
        );


        button.textContent =
            expanded

                ? "Afficher moins"

                : "Afficher plus";


        button.setAttribute(
            "aria-expanded",
            String(expanded)
        );
    }


    function syncAllMobileNoticeControls(
        form
    ) {

        if (!form) {
            return;
        }


        form
            .querySelectorAll(
                "td.kx-notice-cell"
            )
            .forEach(
                syncMobileNoticeControl
            );
    }


    function toggleMobileNotice(
        button
    ) {

        const cell =
            button.closest(
                "td.kx-notice-cell"
            );


        if (!cell) {
            return;
        }


        const currentlyExpanded =
            cell.dataset
                .kxMobileExpanded ===
                "1";


        cell.dataset
            .kxMobileExpanded =

            currentlyExpanded

                ? "0"

                : "1";


        syncMobileNoticeControl(
            cell
        );
    }


    /* ============================================================
       ACTIONS MOBILE NOTICE
       ============================================================ */

    function prepareHoldActions(
        hold
    ) {

        if (!hold) {
            return;
        }


        hold
            .querySelectorAll(
                ":scope > a"
            )
            .forEach(
                link => {

                    /*
                     * Ne pas toucher au lien Supprimer du panier
                     * dont Koha gère lui-même la visibilité.
                     */

                    if (
                        link.classList.contains(
                            "cartRemove"
                        )
                    ) {
                        return;
                    }


                    const label =
                        normalizedText(
                            link
                        );


                    /*
                     * Info accessible + infobulle.
                     */

                    if (
                        label
                        &&
                        !link.getAttribute(
                            "title"
                        )
                    ) {

                        link.setAttribute(
                            "title",
                            label
                        );
                    }


                    if (
                        label
                        &&
                        !link.getAttribute(
                            "aria-label"
                        )
                    ) {

                        link.setAttribute(
                            "aria-label",
                            label
                        );
                    }


                    /* Réservation */

                    if (
                        /^reserve_/i.test(
                            link.id || ""
                        )
                    ) {

                        if (!pmkFeature("notice.mobileActionIconsEnabled")) return;

                        link.classList.add(
                            "kx-mobile-action",
                            "kx-action-reserve"
                        );

                        return;
                    }


                    /* Panier */

                    if (
                        link.classList.contains(
                            "addtocart"
                        )
                    ) {

                        if (!pmkFeature("notice.mobileActionIconsEnabled")) return;

                        link.classList.add(
                            "kx-mobile-action",
                            "kx-action-cart"
                        );

                        return;
                    }


                    const href =
                        link.getAttribute(
                            "href"
                        )
                        ||
                        "";


                    /* Modifier notice */

                    if (
                        /\/cataloguing\/addbiblio\.pl/i
                            .test(href)
                    ) {

                        if (!pmkFeature("notice.mobileActionIconsEnabled")) return;

                        link.classList.add(
                            "kx-mobile-action",
                            "kx-action-edit-biblio"
                        );

                        return;
                    }


                    /* Modifier exemplaires */

                    if (
                        /\/cataloguing\/additem\.pl/i
                            .test(href)
                    ) {

                        if (!pmkFeature("notice.mobileActionIconsEnabled")) return;

                        link.classList.add(
                            "kx-mobile-action",
                            "kx-action-edit-items"
                        );
                    }
                }
            );
    }


    /* ============================================================
       NETTOYAGE ACTIONS
       ============================================================ */

    function cleanActionSeparators(
        hold
    ) {

        if (!hold) {
            return;
        }


        Array
            .from(
                hold.childNodes
            )
            .forEach(
                node => {

                    if (
                        node.nodeType !==
                        Node.TEXT_NODE
                    ) {
                        return;
                    }


                    if (
                        /^[\s|\u00a0]*$/.test(
                            node.textContent
                            ||
                            ""
                        )
                    ) {

                        node.remove();
                    }
                }
            );


        prepareHoldActions(
            hold
        );
    }


    /* ============================================================
       TRAITEMENT CELLULE BIBLIO
       ============================================================ */

    function processBibliographicCell(
        cell
    ) {

        if (!pmkFeature("notice.layoutEnabled")) {
            return;
        }

        if (
            !cell
            ||
            !isKohaSearchResultsPage()
        ) {
            return;
        }


        removeResultNumber(
            cell
        );


        removeEmptyBibliographicLines(
            cell
        );


        /*
         * LI directs.
         */

        Array
            .from(
                cell.children
            )
            .forEach(
                element => {

                    if (
                        element.tagName ===
                        "LI"
                    ) {

                        classifyBibliographicLine(
                            element
                        );
                    }
                }
            );


        /*
         * LI dans notice-details.
         */

        cell
            .querySelectorAll(
                ".notice-details > li"
            )
            .forEach(
                classifyBibliographicLine
            );


        removeEmptyBibliographicLines(
            cell
        );


        syncNoticeDetailsState(
            cell
        );


        updateExternalBibliographicLines(
            cell
        );


        syncMobileNoticeControl(
            cell
        );
    }


    /* ============================================================
       OBSERVATEUR CELLULE BIBLIO
       ============================================================ */

    function observeBibliographicCell(
        cell
    ) {

        if (
            !cell
            ||
            cell.dataset
                .kxBiblioObserver ===
                "1"
        ) {
            return;
        }


        cell.dataset
            .kxBiblioObserver =
            "1";


        let scheduled =
            false;


        const observer =
            new MutationObserver(
                mutations => {

                    if (
                        !isKohaSearchResultsPage()
                    ) {

                        observer.disconnect();

                        return;
                    }


                    const changed =
                        mutations.some(
                            mutation =>
                                mutation
                                    .addedNodes
                                    .length
                                ||
                                mutation
                                    .removedNodes
                                    .length
                        );


                    if (
                        !changed
                        ||
                        scheduled
                    ) {
                        return;
                    }


                    scheduled =
                        true;


                    requestAnimationFrame(
                        () => {

                            scheduled =
                                false;


                            processBibliographicCell(
                                cell
                            );
                        }
                    );
                }
            );


        observer.observe(
            cell,
            {
                childList:
                    true,

                subtree:
                    true
            }
        );
    }


    /* ============================================================
       PRÉSENTATION NOTICE
       ============================================================ */

    function enhanceNoticeRow(
        row
    ) {

        if (!pmkFeature("notice.layoutEnabled")) {
            return;
        }

        if (
            !isKohaSearchResultsPage()
            ||
            row.dataset
                .kxNoticeDone ===
                "1"
        ) {
            return;
        }


        const cells =
            Array
                .from(
                    row.children
                )
                .filter(
                    element =>
                        element.tagName ===
                        "TD"
                );


        if (
            cells.length < 4
        ) {
            return;
        }


        const cell =
            cells[2];


        if (!cell) {
            return;
        }


        cell.classList.add(
            "kx-notice-cell"
        );


        removeResultNumber(
            cell
        );


        const firstResult =
            cell.querySelector(
                ":scope > .firstresult"
            );


        const share =
            cell.querySelector(
                ":scope > .liens_externes"
            );


        const showMore =
            cell.querySelector(
                ":scope > .btn-show-more"
            );


        const details =
            cell.querySelector(
                ":scope > .notice-details"
            );


        /*
         * D'autres scripts peuvent injecter
         * ces éléments après notre initialisation.
         */

        if (
            !firstResult
            &&
            !details
        ) {

            observeBibliographicCell(
                cell
            );

            return;
        }


        /* ========================================================
           CARTE
           ======================================================== */

        const card =
            document.createElement(
                "div"
            );


        card.className =
            "kx-notice-card";


        cell.insertBefore(
            card,
            cell.firstChild
        );


        /* ========================================================
           HEADER
           ======================================================== */

        const head =
            document.createElement(
                "div"
            );


        head.className =
            "kx-notice-head";


        const main =
            document.createElement(
                "div"
            );


        main.className =
            "kx-notice-head-main";


        if (firstResult) {

            main.appendChild(
                firstResult
            );
        }


        head.appendChild(
            main
        );


        /* ========================================================
           OUTILS
           ======================================================== */

        const tools =
            document.createElement(
                "div"
            );


        tools.className =
            "kx-notice-head-tools";


        if (showMore) {

            tools.appendChild(
                showMore
            );
        }


        if (share) {

            share
                .querySelectorAll(
                    ":scope > br"
                )
                .forEach(
                    br =>
                        br.remove()
                );


            tools.appendChild(
                share
            );
        }


        /*
         * Compatibilité avec le module Mouvements :
         *
         * - si le bouton a déjà été injecté dans .hold avant que
         *   cette mise en page ne soit construite, on le déplace
         *   dans les outils du titre ;
         * - le conteneur .kx-notice-head-tools est toujours ajouté,
         *   même vide, afin que le module Mouvements puisse y
         *   injecter son bouton s'il démarre après ce script.
         *
         * Le résultat est indépendant de l'ordre de chargement
         * des deux scripts.
         */

        const existingMovementButton =
            (
                cell.closest("tr")
                ||
                cell
            ).querySelector(
                ".kxmv-notice-btn"
            );


        if (
            existingMovementButton
            &&
            !tools.contains(
                existingMovementButton
            )
        ) {

            tools.appendChild(
                existingMovementButton
            );
        }


        head.appendChild(
            tools
        );


        card.appendChild(
            head
        );


        /* ========================================================
           NOTICE DETAILS
           ======================================================== */

        if (details) {

            details
                .querySelectorAll(
                    ":scope > li"
                )
                .forEach(
                    classifyBibliographicLine
                );


            const hold =
                details.querySelector(
                    ":scope > p.hold"
                );


            if (hold) {

                cleanActionSeparators(
                    hold
                );
            }


            card.appendChild(
                details
            );
        }


        /* ========================================================
           ACTIONS DIRECTES
           ======================================================== */

        const externalHold =
            cell.querySelector(
                ":scope > p.hold"
            );


        if (externalHold) {

            cleanActionSeparators(
                externalHold
            );


            card.appendChild(
                externalHold
            );
        }


        /*
         * BR directement sous TD uniquement.
         */

        Array
            .from(
                cell.children
            )
            .filter(
                element =>
                    element.tagName ===
                    "BR"
            )
            .forEach(
                br =>
                    br.remove()
            );


        observeBibliographicCell(
            cell
        );


        processBibliographicCell(
            cell
        );


        row.dataset
            .kxNoticeDone =
            "1";
    }


    /* ============================================================
       ICÔNES NATIVES EXEMPLAIRES
       ============================================================ */

    function buildNativeIconMap(
        row
    ) {

        const map =
            new Map();


        row
            .querySelectorAll(
                ".availability li.result_itype_image"
            )
            .forEach(
                li => {

                    const image =
                        li.querySelector(
                            ".itemtype-image"
                        );


                    const type =
                        li.querySelector(
                            ".item-itype-desc"
                        );


                    if (
                        !image
                        ||
                        !type
                    ) {
                        return;
                    }


                    const key =
                        normalize(
                            type.textContent
                        );


                    const src =
                        image.getAttribute(
                            "src"
                        );


                    if (
                        key
                        &&
                        src
                        &&
                        !map.has(key)
                    ) {

                        map.set(
                            key,
                            src
                        );
                    }
                }
            );


        return map;
    }


    /* ============================================================
       API KOHA
       ============================================================ */

    async function apiRequest(
        url,
        withEmbeds = true
    ) {

        const headers = {
            Accept:
                "application/json"
        };


        headers[
            "x-koha-embed"
        ] =
            withEmbeds

                ? "+strings,checkout,transfer,first_hold"

                : "+strings";


        const response =
            await fetch(
                url,
                {
                    method:
                        "GET",

                    credentials:
                        "same-origin",

                    headers
                }
            );


        if (!response.ok) {

            throw new Error(
                `API Koha ${response.status} ${response.statusText}`
            );
        }


        return response;
    }


    async function fetchItemsPage(
        biblioNumber,
        page,
        withEmbeds
    ) {

        const url =
            `/api/v1/biblios/${encodeURIComponent(biblioNumber)}/items`
            +
            `?_page=${page}`
            +
            `&_per_page=${CONFIG.apiPerPage}`;


        const response =
            await apiRequest(
                url,
                withEmbeds
            );


        return {
            items:
                await response.json(),

            total:
                Number(
                    response.headers.get(
                        "x-total-count"
                    )
                    ||
                    0
                )
        };
    }


    async function fetchAllItems(
        biblioNumber
    ) {

        async function load(
            withEmbeds
        ) {

            const result =
                [];


            let page =
                1;


            let total =
                0;


            while (
                page <=
                CONFIG.maxPages
            ) {

                const response =
                    await fetchItemsPage(
                        biblioNumber,
                        page,
                        withEmbeds
                    );


                const items =
                    Array.isArray(
                        response.items
                    )
                        ? response.items
                        : [];


                result.push(
                    ...items
                );


                total =
                    response.total
                    ||
                    result.length;


                if (
                    items.length <
                        CONFIG.apiPerPage
                    ||
                    result.length >=
                        total
                ) {
                    break;
                }


                page++;
            }


            return result;
        }


        try {

            return await load(
                true
            );

        }
        catch (error) {

            (function(){})(
                "[KXRI] Repli API +strings",
                error
            );


            return await load(
                false
            );
        }
    }


    /* ============================================================
       STATUT EXEMPLAIRE
       ============================================================ */

    function getStatus(item) {

        const lost =
            Number(
                item.lost_status
                ||
                0
            );


        const withdrawn =
            Number(
                item.withdrawn_status
                ??
                item.withdrawn
                ??
                0
            );


        const damaged =
            Number(
                item.damaged_status
                ||
                0
            );


        const notForLoan =
            Number(
                item.effective_not_for_loan_status
                ??
                item.not_for_loan_status
                ??
                0
            );


        if (lost) {

            return {
                key:
                    "unavailable",

                label:
                    getString(
                        item,
                        "lost_status"
                    )
                    ||
                    "Perdu"
            };
        }


        if (withdrawn) {

            return {
                key:
                    "unavailable",

                label:
                    getString(
                        item,
                        "withdrawn_status"
                    )
                    ||
                    getString(
                        item,
                        "withdrawn"
                    )
                    ||
                    "Retiré"
            };
        }


        if (damaged) {

            return {
                key:
                    "unavailable",

                label:
                    getString(
                        item,
                        "damaged_status"
                    )
                    ||
                    "Endommagé"
            };
        }


        if (item.checkout) {

            return {
                key:
                    "loan",

                label:
                    "En prêt"
            };
        }


        if (item.transfer) {

            return {
                key:
                    "transfer",

                label:
                    "En transit"
            };
        }


        if (item.first_hold) {

            return {
                key:
                    "hold",

                label:
                    "Réservé"
            };
        }


        if (notForLoan) {

            return {
                key:
                    "unavailable",

                label:
                    getString(
                        item,
                        "effective_not_for_loan_status"
                    )
                    ||
                    getString(
                        item,
                        "not_for_loan_status"
                    )
                    ||
                    "Indisponible"
            };
        }


        return {
            key:
                "available",

            label:
                "Disponible"
        };
    }


    /* ============================================================
       DONNÉES EXEMPLAIRE
       ============================================================ */

    function getItemTypeCode(item) {

        return (
            item.effective_item_type_id
            ||
            item.item_type_id
            ||
            ""
        );
    }


    function getItemTypeLabel(item) {

        return (
            getString(
                item,
                "effective_item_type_id"
            )
            ||
            getString(
                item,
                "item_type_id"
            )
            ||
            getItemTypeCode(item)
            ||
            ""
        );
    }


    function getHoldingLibrary(item) {

        return (
            getString(
                item,
                "holding_library_id"
            )
            ||
            item.holding_library?.name
            ||
            item.holding_library_id
            ||
            ""
        );
    }


    function getHomeLibrary(item) {

        return (
            getString(
                item,
                "home_library_id"
            )
            ||
            item.home_library?.name
            ||
            item.home_library_id
            ||
            ""
        );
    }


    function getLocation(item) {

        return (
            getString(
                item,
                "location"
            )
            ||
            item.location
            ||
            ""
        );
    }


    function getCollectionCode(item) {

        return (
            item.collection_code
            ||
            ""
        );
    }


    function getCollectionLabel(item) {

        return (
            getString(
                item,
                "collection_code"
            )
            ||
            getCollectionCode(item)
            ||
            ""
        );
    }


    /* ============================================================
       URLS
       ============================================================ */

    function getCallnumberUrl(
        callnumber
    ) {

        return (
            "/cgi-bin/koha/catalogue/search.pl"
            +
            "?idx=callnum&q="
            +
            encodeURIComponent(
                `"${callnumber}"`
            )
        );
    }


    function getCollectionUrl(
        collectionCode
    ) {

        return (
            "/cgi-bin/koha/catalogue/search.pl?q="
            +
            encodeURIComponent(
                `ccode:"${collectionCode}"`
            )
        );
    }


    function getEditUrl(
        itemId
    ) {

        return (
            "/cgi-bin/koha/cataloguing/additem.pl"
            +
            "?op=edititem"
            +
            "&itemnumber="
            +
            encodeURIComponent(
                itemId
            )
        );
    }


    /* ============================================================
       RAPPORT STATISTIQUES 4537
       ============================================================ */

    function getStatsUrl(
        itemId
    ) {

        const params =
            new URLSearchParams();


        params.set(
            "id",
            CONFIG.reportId
        );


        function add(
            name,
            value
        ) {

            params.append(
                "param_name",
                name
            );


            params.append(
                "sql_params",
                value
            );
        }


        add(
            "Site|branches:all",
            "%"
        );


        add(
            "Public|public:all",
            "%"
        );


        add(
            "Localisation|LOC:all",
            "%"
        );


        add(
            "Limiter par cote|YES_NO",
            "0"
        );


        add(
            "Cote de début (incluse)",
            ""
        );


        add(
            "Cote de fin (incluse)",
            ""
        );


        add(
            "Type de document|itemtypes:all",
            "%"
        );


        add(
            "Limiter par 610a|YES_NO",
            "0"
        );


        add(
            "610|610a:all",
            "%"
        );


        add(
            "Limiter par numero exemplaire|YES_NO",
            "1"
        );


        add(
            "Numéro exemplaire",
            itemId
        );


        add(
            "Limiter par numero de notice|YES_NO",
            "0"
        );


        add(
            "Numéri de notice",
            ""
        );


        params.set(
            "op",
            "run"
        );


        return (
            "/cgi-bin/koha/reports/guided_reports.pl?"
            +
            params.toString()
        );
    }


    /* ============================================================
       RECHERCHES PROGRESSIVES COTE
       ============================================================ */

    function buildCallnumberSearches(
        callnumber
    ) {

        const cleaned =
            String(
                callnumber || ""
            )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();


        if (!cleaned) {
            return [];
        }


        const values =
            [];


        function add(value) {

            value =
                String(
                    value || ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            if (
                value
                &&
                !values.includes(
                    value
                )
            ) {

                values.push(
                    value
                );
            }
        }


        const parts =
            cleaned.split(" ");


        for (
            let length =
                parts.length;

            length >= 1;

            length--
        ) {

            add(
                parts
                    .slice(
                        0,
                        length
                    )
                    .join(" ")
            );
        }


        /*
         * Exemple :
         * 641.5944 DUR
         * → 641.5944 DUR
         * → 641.5944
         * → 641
         */

        const decimal =
            parts[0].match(
                /^(\d+)\.(\d+)$/
            );


        if (decimal) {

            add(
                decimal[1]
            );
        }


        return values;
    }


    function buildCallnumberHtml(
        callnumber
    ) {

        if (!callnumber) {
            return "";
        }


        const searches =
            pmkFeature("items.progressiveCallnumberSearch")
                ? buildCallnumberSearches(callnumber)
                : [String(callnumber).trim()].filter(Boolean);


        let menu =
            "";


        if (
            searches.length >
            1
        ) {

            const links =
                searches
                    .map(
                        (
                            value,
                            index
                        ) => `

<a
    class="kxri-callnumber-option"
    href="${getCallnumberUrl(value)}"
    title="Rechercher la cote ${escapeHtml(value)}"
>
    ${
        index === 0
            ? `<strong>${escapeHtml(value)}</strong>`
            : escapeHtml(value)
    }
</a>

                        `
                    )
                    .join("");


            menu = `

<details class="kxri-callnumber-menu">

    <summary
        title="Autres recherches à partir de cette cote"
    >
        ▾
    </summary>

    <div class="kxri-callnumber-options">

        <div class="kxri-callnumber-options-title">
            Rechercher par cote
        </div>

        ${links}

    </div>

</details>

            `;
        }


        return `

<span class="kxri-callnumber-wrap">

    <span class="kxri-callnumber">

        <a
            href="${getCallnumberUrl(callnumber)}"
            title="Rechercher exactement cette cote"
        >
            ${escapeHtml(callnumber)}
        </a>

    </span>

    ${menu}

</span>

        `;
    }


    /* ============================================================
       OUVERTURE DÉTAILS EXEMPLAIRE
       ============================================================ */

    function setCardExpanded(
        card,
        expanded
    ) {

        if (!card) {
            return;
        }


        card.classList.toggle(
            "is-expanded",
            expanded
        );


        const button =
            card.querySelector(
                ".kxri-toggle-details"
            );


        if (button) {

            button.textContent =
                expanded

                    ? "▴ " + pmkLabel("reduceFr", "reduceEn")

                    : "⋯ " + pmkLabel("detailsFr", "detailsEn");
        }
    }


    /* ============================================================
       COMPTEUR DE PRÊTS + ÉCHÉANCE VISIBLE
       ============================================================ */

    function getCheckoutCount(
        item
    ) {

        const value =
            item?.checkouts_count;

        if (
            value ===
                undefined
            ||
            value ===
                null
            ||
            value ===
                ""
        ) {
            return null;
        }


        const number =
            Number(
                value
            );


        return Number.isFinite(
            number
        )
            ? number
            : null;
    }


    function parseKohaCalendarDate(
        value
    ) {

        const text =
            String(
                value || ""
            )
                .trim();


        if (!text) {
            return null;
        }


        const match =
            text.match(
                /^(\d{4})-(\d{2})-(\d{2})/
            );


        if (match) {

            const date =
                new Date(
                    Number(match[1]),
                    Number(match[2]) - 1,
                    Number(match[3])
                );


            return Number.isNaN(
                date.getTime()
            )
                ? null
                : date;
        }


        const parsed =
            new Date(
                text
            );


        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {
            return null;
        }


        return new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate()
        );
    }


    function getDueStatus(
        dueDate
    ) {

        const due =
            parseKohaCalendarDate(
                dueDate
            );


        if (!due) {
            return null;
        }


        const now =
            new Date();


        const today =
            new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            );


        const millisecondsPerDay =
            24
            *
            60
            *
            60
            *
            1000;


        const days =
            Math.round(
                (
                    due.getTime()
                    -
                    today.getTime()
                )
                /
                millisecondsPerDay
            );


        if (days < 0) {

            const lateDays =
                Math.abs(
                    days
                );


            return {
                key:
                    "overdue",

                days:
                    lateDays,

                label:
                    `En retard de ${lateDays} jour${lateDays > 1 ? "s" : ""}`
            };
        }


        if (days === 0) {

            return {
                key:
                    "today",

                days:
                    0,

                label:
                    "À rendre aujourd’hui"
            };
        }


        return {
            key:
                "future",

            days:
                days,

            label:
                `${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""}`
        };
    }


    function buildQuickStatsHtml(
        item,
        dueDate
    ) {

        const parts =
            [];


        const checkoutCount =
            getCheckoutCount(
                item
            );


        if (
            checkoutCount !==
                null
        ) {

            parts.push(
                `
<span
    class="kxri-quickstat is-loans"
    title="Nombre total de prêts enregistré sur cet exemplaire"
>
    ↻
    ${checkoutCount}
    prêt${checkoutCount > 1 ? "s" : ""}
</span>
                `
            );
        }


        const notForLoanReason =
            getNotForLoanReason(
                item
            );


        if (notForLoanReason) {

            parts.push(
                `
<span
    class="kxri-quickstat is-not-for-loan"
    title="Cet exemplaire est exclu du prêt"
>
    ⛔
    Exclu du prêt :
    ${escapeHtml(notForLoanReason)}
</span>
                `
            );
        }


        const due =
            getDueStatus(
                dueDate
            );


        if (due) {

            const className =
                due.key ===
                    "overdue"

                    ? "is-overdue"

                    : due.key ===
                        "today"

                        ? "is-due-today"

                        : "is-due-future";


            parts.push(
                `
<span
    class="kxri-quickstat ${className}"
    title="Retour prévu le ${escapeHtml(formatDate(dueDate))}"
>
    ${due.key === "overdue" ? "⚠" : "⌛"}
    ${escapeHtml(due.label)}
</span>
                `
            );
        }


        if (!parts.length) {
            return "";
        }


        return `
<div class="kxri-quickstats">
    ${parts.join("")}
</div>
        `;
    }


    /* ============================================================
       EXCLUSION DU PRÊT + DURÉES RELATIVES
       ============================================================ */

    function getNotForLoanReason(
        item
    ) {

        const value =
            Number(
                item?.effective_not_for_loan_status
                ??
                item?.not_for_loan_status
                ??
                0
            );


        if (!value) {
            return "";
        }


        return (
            getString(
                item,
                "effective_not_for_loan_status"
            )
            ||
            getString(
                item,
                "not_for_loan_status"
            )
            ||
            "Exclu du prêt"
        );
    }


    function getCalendarParts(
        value
    ) {

        const date =
            parseKohaCalendarDate(
                value
            );


        if (!date) {
            return null;
        }


        const now =
            new Date();


        const today =
            new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            );


        return {
            date,
            today
        };
    }


    function relativeDateLabel(
        value
    ) {

        const parts =
            getCalendarParts(
                value
            );


        if (!parts) {
            return "";
        }


        const { date, today } =
            parts;


        const direction =
            date.getTime() <=
                today.getTime()

                ? "past"
                : "future";


        const start =
            direction === "past"
                ? date
                : today;


        const end =
            direction === "past"
                ? today
                : date;


        let years =
            end.getFullYear()
            -
            start.getFullYear();


        let months =
            end.getMonth()
            -
            start.getMonth();


        let days =
            end.getDate()
            -
            start.getDate();


        if (days < 0) {

            const previousMonthDays =
                new Date(
                    end.getFullYear(),
                    end.getMonth(),
                    0
                ).getDate();


            days +=
                previousMonthDays;


            months--;
        }


        if (months < 0) {
            years--;
            months += 12;
        }


        if (
            years === 0
            &&
            months === 0
            &&
            days === 0
        ) {
            return "aujourd’hui";
        }


        const values =
            [];


        if (years > 0) {

            values.push(
                `${years} an${years > 1 ? "s" : ""}`
            );


            if (months > 0) {
                values.push(
                    `${months} mois`
                );
            }
        }
        else if (months > 0) {

            values.push(
                `${months} mois`
            );


            if (
                days > 0
                &&
                months < 3
            ) {
                values.push(
                    `${days} jour${days > 1 ? "s" : ""}`
                );
            }
        }
        else {

            values.push(
                `${days} jour${days > 1 ? "s" : ""}`
            );
        }


        const duration =
            values.join(" et ");


        return direction === "past"
            ? `il y a ${duration}`
            : `dans ${duration}`;
    }


    function buildDateWithRelativeHtml(
        value,
        options = {}
    ) {

        const formatted =
            formatDate(
                value
            );


        if (!formatted) {
            return "—";
        }


        let relative =
            relativeDateLabel(
                value
            );


        let className =
            "kxri-date-age";


        if (
            options.due === true
        ) {

            const due =
                getDueStatus(
                    value
                );


            if (due) {
                relative =
                    due.label;


                if (
                    due.key ===
                    "overdue"
                ) {
                    className +=
                        " is-overdue";
                }
                else if (
                    due.key ===
                    "future"
                ) {
                    className +=
                        " is-future";
                }
            }
        }


        return (
            `${escapeHtml(formatted)}`
            +
            (
                relative
                    ? ` <span class="${className}">(${escapeHtml(relative)})</span>`
                    : ""
            )
        );
    }


    /* ============================================================
       ACCÈS DIRECT AUX MOUVEMENTS DANS LA COLONNE NOTICE
       ============================================================ */

    function waitForElement(
        root,
        finder,
        timeout = 12000
    ) {

        return new Promise(
            resolve => {

                const immediate =
                    finder();

                if (immediate) {
                    resolve(
                        immediate
                    );
                    return;
                }


                let finished =
                    false;


                const finish =
                    value => {

                        if (finished) {
                            return;
                        }


                        finished =
                            true;


                        observer.disconnect();

                        clearTimeout(
                            timer
                        );


                        resolve(
                            value
                        );
                    };


                const observer =
                    new MutationObserver(
                        () => {

                            const found =
                                finder();


                            if (found) {
                                finish(
                                    found
                                );
                            }
                        }
                    );


                observer.observe(
                    root,
                    {
                        childList:
                            true,

                        subtree:
                            true
                    }
                );


                const timer =
                    setTimeout(
                        () => finish(
                            null
                        ),
                        timeout
                    );
            }
        );
    }


    function findMovementItemDetailButton(
        panel,
        itemId
    ) {

        if (!panel) {
            return null;
        }


        return (
            Array
                .from(
                    panel.querySelectorAll(
                        "[data-kxmv-open-item]"
                    )
                )
                .find(
                    button =>
                        String(
                            button.dataset
                                .kxmvOpenItem
                            ||
                            ""
                        )
                        ===
                        String(
                            itemId
                        )
                )
            ||
            null
        );
    }


    function findMovementItemDetailHolder(
        panel,
        itemId
    ) {

        if (!panel) {
            return null;
        }


        return (
            Array
                .from(
                    panel.querySelectorAll(
                        "[data-kxmv-inline-detail]"
                    )
                )
                .find(
                    holder =>
                        String(
                            holder.dataset
                                .kxmvInlineDetail
                            ||
                            ""
                        )
                        ===
                        String(
                            itemId
                        )
                )
            ||
            null
        );
    }


    async function openItemInCentralMovements(
        card
    ) {

        if (
            !card
            ||
            !isKohaSearchResultsPage()
        ) {
            return;
        }


        const itemId =
            String(
                card.dataset.itemId
                ||
                ""
            );


        if (!itemId) {
            return;
        }


        const resultRow =
            card.closest(
                'tr[id^="row"]'
            );


        if (!resultRow) {
            return;
        }


        /*
         * Le module Mouvements est un script indépendant.
         * On attend son bouton si son initialisation DOM n'est
         * pas encore terminée. Aucun appel Koha n'est fait ici.
         */

        let noticeButton =
            resultRow.querySelector(
                ".kxmv-notice-btn"
            );


        if (!noticeButton) {

            noticeButton =
                await waitForElement(
                    resultRow,
                    () =>
                        resultRow.querySelector(
                            ".kxmv-notice-btn"
                        ),
                    5000
                );
        }


        if (!noticeButton) {

            (function(){})(
                "[KXRI] Module Mouvements introuvable pour cette notice."
            );

            return;
        }


        const targetCell =
            resultRow.querySelector(
                ".kx-notice-cell"
            )
            ||
            resultRow.cells?.[2]
            ||
            resultRow;


        let movementPanel =
            targetCell.querySelector(
                ":scope > .kxmv-panel"
            );


        /*
         * Équivalent au premier clic :
         * "Mouvements" au niveau du titre.
         *
         * Si le panneau existe déjà et est ouvert,
         * surtout ne pas recliquer : cela le refermerait.
         */

        if (
            !movementPanel
            ||
            movementPanel.hidden
        ) {

            noticeButton.click();
        }


        if (!movementPanel) {

            movementPanel =
                await waitForElement(
                    targetCell,
                    () =>
                        targetCell.querySelector(
                            ":scope > .kxmv-panel"
                        ),
                    12000
                );
        }


        if (!movementPanel) {

            (function(){})(
                "[KXRI] Panneau central Mouvements introuvable."
            );

            return;
        }


        /*
         * Le panneau apparaît avant la fin de son chargement.
         * On attend donc que le bouton "Voir le détail" de
         * l'exemplaire ciblé soit réellement rendu.
         */

        let itemDetailButton =
            findMovementItemDetailButton(
                movementPanel,
                itemId
            );


        if (!itemDetailButton) {

            itemDetailButton =
                await waitForElement(
                    movementPanel,
                    () =>
                        findMovementItemDetailButton(
                            movementPanel,
                            itemId
                        ),
                    12000
                );
        }


        if (!itemDetailButton) {

            (function(){})(
                `[KXRI] Exemplaire ${itemId} introuvable dans le panneau Mouvements.`
            );

            return;
        }


        const holder =
            findMovementItemDetailHolder(
                movementPanel,
                itemId
            );


        /*
         * Équivalent au second clic :
         * "Voir le détail" pour CE seul exemplaire.
         *
         * Si le détail est déjà ouvert, on le laisse ouvert.
         */

        if (
            !holder
            ||
            holder.hidden
        ) {

            itemDetailButton.click();
        }
    }


    /* ============================================================
       RENDU EXEMPLAIRE
       ============================================================ */

    function renderItem(
        item,
        iconMap
    ) {

        const status =
            getStatus(item);


        const itemId =
            item.item_id
            ||
            "";


        const barcode =
            item.external_id
            ||
            "";


        const holding =
            getHoldingLibrary(
                item
            );


        const home =
            getHomeLibrary(
                item
            );


        const location =
            getLocation(
                item
            );


        const callnumber =
            item.callnumber
            ||
            "";


        const itemTypeLabel =
            getItemTypeLabel(
                item
            );


        const collectionCode =
            getCollectionCode(
                item
            );


        const collectionLabel =
            getCollectionLabel(
                item
            );


        const dueDate =
            item.checkout?.due_date
            ||
            "";


        const quickStatsHtml =
            pmkFeature("items.quickStatsEnabled")
                ? buildQuickStatsHtml(item, dueDate)
                : "";


        const local =
            loggedBranchName
            &&
            normalize(holding)
            ===
            loggedBranchName;


        /* ========================================================
           ICÔNE TYPE DOCUMENT
           ======================================================== */

        let iconSrc =
            pmkFeature("items.nativeItemTypeIcons")
                ? iconMap.get(
                normalize(
                    itemTypeLabel
                )
            )
            ||
            ""
                : "";


        /*
         * Une seule icône native trouvée sur la notice :
         * elle peut servir de fallback.
         */

        if (
            pmkFeature("items.nativeItemTypeIcons")
            &&
            !iconSrc
            &&
            iconMap.size ===
            1
        ) {

            iconSrc =
                Array
                    .from(
                        iconMap.values()
                    )[0];
        }


        const iconHtml =
            iconSrc

                ? `
<img
    class="kxri-itemtype-icon"
    src="${escapeHtml(iconSrc)}"
    alt=""
    title="${escapeHtml(itemTypeLabel)}"
>
                  `

                : "";


        /* ========================================================
           LOCALISATION
           ======================================================== */

        const locationParts =
            [];


        if (location) {

            locationParts.push(
                `
<span class="kxri-location">
    ${escapeHtml(location)}
</span>
                `
            );
        }


        if (callnumber) {

            locationParts.push(
                buildCallnumberHtml(
                    callnumber
                )
            );
        }


        /* ========================================================
           PROPRIÉTAIRE
           ======================================================== */

        const ownerHtml =
            pmkFeature("items.ownerVisible")
            &&
            home
            &&
            normalize(home) !==
            normalize(holding)

                ? `
<div class="kxri-secondary">
    Propriétaire :
    <strong>
        ${escapeHtml(home)}
    </strong>
</div>
                  `

                : "";


        /* ========================================================
           COLLECTION
           ======================================================== */

        const collectionHtml =
            collectionCode

                ? `
<div class="kxri-collection">

    Code collection :

    ${
        pmkFeature("items.collectionLinkEnabled")
            ? `<a href="${getCollectionUrl(collectionCode)}">${escapeHtml(collectionLabel)}</a>`
            : `<strong>${escapeHtml(collectionLabel)}</strong>`
    }

</div>
                  `

                : "";


        /* ========================================================
           CARTE
           ======================================================== */

        const card =
            document.createElement(
                "div"
            );


        card.className =
            `kxri-item is-${status.key}`
            +
            (
                local
                    ? " is-local"
                    : ""
            );


        card.dataset.itemId =
            itemId;


        card.dataset.barcode =
            barcode;


        card.innerHTML = `

<div class="kxri-main">

    <div class="kxri-topline">

        <div class="kxri-library-wrap">

            ${iconHtml}

            <div class="kxri-library-text">

                <div class="kxri-library">

                    ${escapeHtml(
                        holding
                        ||
                        pmkLabel("unknownSiteFr", "unknownSiteEn")
                    )}

                    ${
                        local
                            ? `
<span class="kxri-local-badge">
    ${escapeHtml(pmkLabel("mySiteFr", "mySiteEn"))}
</span>
                              `
                            : ""
                    }

                </div>

            </div>

        </div>


        <span
            class="kxri-status is-${status.key}"
        >
            ${escapeHtml(status.label)}
        </span>

    </div>


    ${
        locationParts.length

            ? `
<div class="kxri-location-line">
    ${locationParts.join("")}
</div>
              `

            : ""
    }


    ${collectionHtml}


    ${
        pmkFeature("items.barcodeVisible")
            ? `
    <div class="kxri-barcode-line">

        ${
            barcode

                ? `
<span class="kxri-barcode">
    ${escapeHtml(barcode)}
</span>

${
    pmkFeature("items.barcodeCopyEnabled")
        ? `<button type="button" class="kxri-copy" data-copy="${escapeHtml(barcode)}">${escapeHtml(pmkLabel("copyFr", "copyEn"))}</button>`
        : ""
}
                  `

                : `
<span class="kxri-barcode">
    Exemplaire #${escapeHtml(itemId)}
</span>
                  `
        }

    </div>
              `
            : ""
    }


    ${quickStatsHtml}


    ${ownerHtml}


    ${
        pmkFeature("items.itemTypeVisible") && itemTypeLabel

            ? `
<div class="kxri-secondary">
    ${escapeHtml(itemTypeLabel)}
</div>
              `

            : ""
    }


    ${
        pmkFeature("items.dueDateVisible") && dueDate

            ? `
<div class="kxri-due">
    Retour prévu :
    ${escapeHtml(
        formatDate(
            dueDate
        )
    )}
</div>
              `

            : ""
    }

</div>


<div class="kxri-actions">

    ${pmkFeature("items.actions.edit") ? `
    <a
        class="kxri-action"
        href="${getEditUrl(itemId)}"
        target="_blank"
        rel="noopener"
        title="Modifier cet exemplaire"
    >
        ✎ Modifier
    </a>` : ""}


    ${pmkFeature("items.actions.statistics") && CONFIG.reportId > 0 ? `
    <a
        class="kxri-action"
        href="${getStatsUrl(itemId)}"
        target="_blank"
        rel="noopener"
        title="Consulter les statistiques de cet exemplaire"
    >
        ▥ Statistiques
    </a>` : ""}


    ${pmkFeature("items.actions.movements") ? `
    <button
        type="button"
        class="kxri-action kxri-open-central-movements"
        title="Ouvrir directement cet exemplaire dans les mouvements de la notice"
    >
        <i class="fa-solid fa-route"></i>
        Mouvements
    </button>` : ""}


    ${pmkFeature("items.detailsEnabled") ? `
    <button
        type="button"
        class="kxri-action kxri-toggle-details"
    >
        ⋯ ${escapeHtml(pmkLabel("detailsFr", "detailsEn"))}
    </button>` : ""}

</div>


${pmkFeature("items.detailsEnabled") ? `
<div class="kxri-details">

    <div class="kxri-detail-grid">

        <div class="kxri-detail-label">
            N° exemplaire
        </div>

        <div class="kxri-detail-value">
            ${escapeHtml(itemId)}
        </div>


        <div class="kxri-detail-label">
            Site propriétaire
        </div>

        <div class="kxri-detail-value">
            ${escapeHtml(home || "—")}
        </div>


        <div class="kxri-detail-label">
            Site actuel
        </div>

        <div class="kxri-detail-value">
            ${escapeHtml(holding || "—")}
        </div>


        <div class="kxri-detail-label">
            Localisation
        </div>

        <div class="kxri-detail-value">
            ${escapeHtml(location || "—")}
        </div>


        <div class="kxri-detail-label">
            Cote
        </div>

        <div class="kxri-detail-value">

            ${
                callnumber

                    ? `
<a href="${getCallnumberUrl(callnumber)}">
    ${escapeHtml(callnumber)}
</a>
                      `

                    : "—"
            }

        </div>


        <div class="kxri-detail-label">
            Code-barres
        </div>

        <div class="kxri-detail-value">
            ${escapeHtml(barcode || "—")}
        </div>


        <div class="kxri-detail-label">
            Type
        </div>

        <div class="kxri-detail-value">
            ${escapeHtml(itemTypeLabel || "—")}
        </div>


        <div class="kxri-detail-label">
            Code collection
        </div>

        <div class="kxri-detail-value">

            ${
                collectionCode

                    ? (
                        pmkFeature("items.collectionLinkEnabled")
                            ? `<a href="${getCollectionUrl(collectionCode)}">${escapeHtml(collectionLabel)}</a>`
                            : escapeHtml(collectionLabel)
                      )

                    : "—"
            }

        </div>


        ${
            getNotForLoanReason(
                item
            )

                ? `
<div class="kxri-detail-label">
    Exclusion du prêt
</div>

<div class="kxri-detail-value">
    <strong>
        ${escapeHtml(
            getNotForLoanReason(
                item
            )
        )}
    </strong>
</div>
                  `

                : ""
        }


        <div class="kxri-detail-label">
            Création
        </div>

        <div class="kxri-detail-value">
            ${
                buildDateWithRelativeHtml(
                    item.acquisition_date
                )
            }
        </div>


        <div class="kxri-detail-label">
            Vu dernièrement
        </div>

        <div class="kxri-detail-value">
            ${
                buildDateWithRelativeHtml(
                    item.last_seen_date
                )
            }
        </div>


        <div class="kxri-detail-label">
            Dernier emprunt
        </div>

        <div class="kxri-detail-value">
            ${
                buildDateWithRelativeHtml(
                    item.last_checkout_date
                )
            }
        </div>


        ${
            dueDate

                ? `
<div class="kxri-detail-label">
    Retour prévu
</div>

<div class="kxri-detail-value">
    ${buildDateWithRelativeHtml(
        dueDate,
        { due: true }
    )}
</div>
                  `

                : ""
        }


        <div class="kxri-detail-label">
            Nombre de prêts
        </div>

        <div class="kxri-detail-value">
            ${
                item.checkouts_count !==
                    undefined
                &&
                item.checkouts_count !==
                    null

                    ? escapeHtml(
                        item.checkouts_count
                    )

                    : "—"
            }
        </div>


        ${
            item.inventory_number

                ? `
<div class="kxri-detail-label">
    Inventaire
</div>

<div class="kxri-detail-value">
    ${escapeHtml(item.inventory_number)}
</div>
                  `

                : ""
        }


        ${
            item.internal_notes

                ? `
<div class="kxri-detail-label">
    Note interne
</div>

<div class="kxri-detail-value">
    ${escapeHtml(item.internal_notes)}
</div>
                  `

                : ""
        }

    </div>

</div>
` : ""}

        `;


        if (
            pmkFeature("items.detailsEnabled")
            &&
            allExemplairesExpanded
        ) {

            setCardExpanded(
                card,
                true
            );
        }


        return card;
    }


    /* ============================================================
       RÉSUMÉ EXEMPLAIRES
       ============================================================ */

    function buildSummary(
        items
    ) {

        const counts = {
            available:
                0,

            loan:
                0,

            unavailable:
                0
        };


        items.forEach(
            item => {

                const key =
                    getStatus(
                        item
                    ).key;


                if (
                    key ===
                    "available"
                ) {

                    counts.available++;

                }
                else if (
                    key ===
                    "loan"
                ) {

                    counts.loan++;

                }
                else {

                    counts.unavailable++;
                }
            }
        );


        const summary =
            document.createElement(
                "div"
            );


        summary.className =
            "kxri-summary";


        summary.innerHTML = `

<span class="kxri-summary-total">
    ${items.length}
    exemplaire${items.length > 1 ? "s" : ""}
</span>


${
    counts.available

        ? `
<span class="kxri-summary-badge is-available">
    ${counts.available}
    disponible${counts.available > 1 ? "s" : ""}
</span>
          `

        : ""
}


${
    counts.loan

        ? `
<span class="kxri-summary-badge is-loan">
    ${counts.loan}
    en prêt
</span>
          `

        : ""
}


${
    counts.unavailable

        ? `
<span class="kxri-summary-badge is-unavailable">
    ${counts.unavailable}
    indisponible${counts.unavailable > 1 ? "s" : ""}
</span>
          `

        : ""
}

        `;


        return summary;
    }


    /* ============================================================
       TRI EXEMPLAIRES
       ============================================================ */

    function sortItems(
        items
    ) {

        const priority = {
            available:
                0,

            hold:
                1,

            transfer:
                2,

            loan:
                3,

            unavailable:
                4
        };


        return [
            ...items
        ].sort(
            (
                a,
                b
            ) => {

                const holdingA =
                    normalize(
                        getHoldingLibrary(
                            a
                        )
                    );


                const holdingB =
                    normalize(
                        getHoldingLibrary(
                            b
                        )
                    );


                const localA =
                    loggedBranchName
                    &&
                    holdingA ===
                    loggedBranchName;


                const localB =
                    loggedBranchName
                    &&
                    holdingB ===
                    loggedBranchName;


                if (
                    pmkFeature("items.prioritizeCurrentSite")
                    &&
                    localA !==
                    localB
                ) {

                    return localA
                        ? -1
                        : 1;
                }


                const statusA =
                    priority[
                        getStatus(
                            a
                        ).key
                    ]
                    ??
                    9;


                const statusB =
                    priority[
                        getStatus(
                            b
                        ).key
                    ]
                    ??
                    9;


                if (
                    pmkFeature("items.prioritizeStatus")
                    &&
                    statusA !==
                    statusB
                ) {

                    return (
                        statusA -
                        statusB
                    );
                }


                return holdingA.localeCompare(
                    holdingB,
                    "fr",
                    {
                        sensitivity:
                            "base"
                    }
                );
            }
        );
    }


    /* ============================================================
       TRAITEMENT EXEMPLAIRES
       ============================================================ */

    async function processExemplairesRow(
        row
    ) {

        if (
            !isKohaSearchResultsPage()
            ||
            row.dataset.kxriDone ===
                "1"
            ||
            row.dataset.kxriDone ===
                "loading"
        ) {
            return;
        }


        const biblioNumber =
            getBiblioNumber(
                row
            );


        if (!biblioNumber) {
            return;
        }


        const nativeAvailability =
            row.querySelector(
                ".availability"
            );


        if (!nativeAvailability) {
            return;
        }


        const cell =
            nativeAvailability.closest(
                "td"
            );


        if (!cell) {
            return;
        }


        row.dataset.kxriDone =
            "loading";


        const iconMap =
            buildNativeIconMap(
                row
            );


        cell.classList.add(
            "kxri-cell"
        );


        const panel =
            document.createElement(
                "div"
            );


        panel.className =
            "kxri-panel";


        panel.innerHTML = `

<div class="kxri-loading">
    Chargement des exemplaires…
</div>

        `;


        cell.insertBefore(
            panel,
            nativeAvailability
        );


        try {

            const items =
                await fetchAllItems(
                    biblioNumber
                );


            /*
             * Vérification post-API.
             */

            if (
                !isKohaSearchResultsPage()
            ) {

                panel.remove();

                return;
            }


            if (
                !items.length
            ) {

                throw new Error(
                    "Aucun exemplaire retourné."
                );
            }


            const sorted =
                sortItems(
                    items
                );


            panel.replaceChildren();


            if (pmkFeature("items.summaryEnabled")) {
                panel.appendChild(
                    buildSummary(
                        sorted
                    )
                );
            }


            const list =
                document.createElement(
                    "div"
                );


            list.className =
                "kxri-items";


            sorted.forEach(
                item => {

                    list.appendChild(
                        renderItem(
                            item,
                            iconMap
                        )
                    );
                }
            );


            panel.appendChild(
                list
            );


            /*
             * Le natif Koha n'est masqué
             * qu'après succès complet.
             */

            nativeAvailability
                .classList
                .add(
                    "kxri-native-hidden"
                );


            row.dataset.kxriDone =
                "1";


            syncGlobalToggleButton();

        }
        catch (error) {

            (function(){})(
                `[KXRI] Notice ${biblioNumber}`,
                error
            );


            panel.remove();


            row.dataset.kxriDone =
                "error";
        }
    }


    /* ============================================================
       BOUTON GLOBAL EXEMPLAIRES
       ============================================================ */

    function syncGlobalToggleButton() {

        if (!pmkFeature("items.globalToggleEnabled") || !pmkFeature("items.detailsEnabled")) {
            return;
        }

        if (
            !isKohaSearchResultsPage()
        ) {
            return;
        }


        const button =
            document.getElementById(
                "toggle-all-exemplaires"
            );


        if (!button) {
            return;
        }


        button.classList.toggle(
            "kx-all-open",
            allExemplairesExpanded
        );


        button.setAttribute(
            "aria-pressed",
            String(
                allExemplairesExpanded
            )
        );


        button.innerHTML =
            allExemplairesExpanded

                ? `
<i class="fa fa-list-alt"></i>
${escapeHtml(pmkLabel("hideAllFr", "hideAllEn"))}
                  `

                : `
<i class="fa fa-list-alt"></i>
${escapeHtml(pmkLabel("showAllFr", "showAllEn"))}
                  `;
    }


    function toggleAllExemplaires() {

        if (
            !isKohaSearchResultsPage()
        ) {
            return;
        }


        const cards =
            Array.from(
                document.querySelectorAll(
                    "#bookbag_form .kxri-item"
                )
            );


        if (
            !cards.length
        ) {
            return;
        }


        const allCurrentlyExpanded =
            cards.every(
                card =>
                    card.classList.contains(
                        "is-expanded"
                    )
            );


        allExemplairesExpanded =
            !allCurrentlyExpanded;


        cards.forEach(
            card =>
                setCardExpanded(
                    card,
                    allExemplairesExpanded
                )
        );


        syncGlobalToggleButton();
    }


    /* ============================================================
       ÉVÉNEMENTS
       ============================================================ */

    function installEvents(
        form
    ) {

        if (
            !form
            ||
            form.dataset.kxV8Events ===
                "1"
        ) {
            return;
        }


        form.dataset.kxV8Events =
            "1";


        /* ========================================================
           AFFICHER PLUS MOBILE

           Capture volontaire :
           notre script prend la main avant l'ancien
           listener sur mobile uniquement.
           ======================================================== */

        form.addEventListener(
            "click",

            event => {

                if (
                    !isKohaSearchResultsPage()
                    ||
                    !isMobile()
                    ||
                    !pmkFeature("notice.mobileCollapseEnabled")
                ) {
                    return;
                }


                const button =
                    event.target.closest(
                        ".btn-show-more"
                    );


                if (
                    !button
                    ||
                    !form.contains(
                        button
                    )
                ) {
                    return;
                }


                event.preventDefault();

                event.stopPropagation();

                event.stopImmediatePropagation();


                toggleMobileNotice(
                    button
                );
            },

            true
        );


        /* ========================================================
           AUTRES INTERACTIONS
           ======================================================== */

        form.addEventListener(
            "click",

            async event => {

                if (
                    !isKohaSearchResultsPage()
                ) {
                    return;
                }


                /* Copier code-barres */

                const copy =
                    pmkFeature("items.barcodeCopyEnabled")
                        ? event.target.closest(
                        ".kxri-copy"
                    )
                        : null;


                if (
                    copy
                    &&
                    form.contains(
                        copy
                    )
                ) {

                    event.preventDefault();


                    const value =
                        copy.dataset.copy
                        ||
                        "";


                    try {

                        await navigator
                            .clipboard
                            .writeText(
                                value
                            );


                        const original =
                            copy.textContent;


                        copy.textContent =
                            pmkLabel("copiedFr", "copiedEn");


                        setTimeout(
                            () => {

                                copy.textContent =
                                    original;

                            },
                            1200
                        );

                    }
                    catch (error) {

                        (function(){})(
                            "[KXRI] Copie impossible",
                            error
                        );
                    }


                    return;
                }


                /* Accès direct aux mouvements dans la colonne notice */

                const centralMovements =
                    pmkFeature("items.actions.movements")
                        ? event.target.closest(
                        ".kxri-open-central-movements"
                    )
                        : null;


                if (
                    centralMovements
                    &&
                    form.contains(
                        centralMovements
                    )
                ) {

                    event.preventDefault();

                    event.stopPropagation();


                    const card =
                        centralMovements.closest(
                            ".kxri-item"
                        );


                    if (!card) {
                        return;
                    }


                    centralMovements.disabled =
                        true;


                    try {

                        await openItemInCentralMovements(
                            card
                        );

                    }
                    catch (error) {

                        (function(){})(
                            "[KXRI] Ouverture directe Mouvements impossible",
                            error
                        );

                    }
                    finally {

                        centralMovements.disabled =
                            false;
                    }


                    return;
                }


                /* Détails exemplaire */

                const toggle =
                    pmkFeature("items.detailsEnabled")
                        ? event.target.closest(
                        ".kxri-toggle-details"
                    )
                        : null;


                if (
                    toggle
                    &&
                    form.contains(
                        toggle
                    )
                ) {

                    event.preventDefault();


                    const card =
                        toggle.closest(
                            ".kxri-item"
                        );


                    if (!card) {
                        return;
                    }


                    const expanded =
                        !card.classList.contains(
                            "is-expanded"
                        );


                    setCardExpanded(
                        card,
                        expanded
                    );


                    const cards =
                        Array.from(
                            form.querySelectorAll(
                                ".kxri-item"
                            )
                        );


                    allExemplairesExpanded =
                        cards.length > 0
                        &&
                        cards.every(
                            current =>
                                current
                                    .classList
                                    .contains(
                                        "is-expanded"
                                    )
                        );


                    syncGlobalToggleButton();


                    return;
                }


                /* Fermer menus cote */

                form
                    .querySelectorAll(
                        ".kxri-callnumber-menu[open]"
                    )
                    .forEach(
                        menu => {

                            if (
                                !menu.contains(
                                    event.target
                                )
                            ) {

                                menu.removeAttribute(
                                    "open"
                                );
                            }
                        }
                    );
            }
        );


        /* ========================================================
           BOUTON GLOBAL
           ======================================================== */

        const globalButton =
            document.getElementById(
                "toggle-all-exemplaires"
            );


        if (
            pmkFeature("items.globalToggleEnabled")
            &&
            pmkFeature("items.detailsEnabled")
            &&
            globalButton
            &&
            globalButton.dataset
                .kxV8Listener !==
                "1"
        ) {

            globalButton.dataset
                .kxV8Listener =
                "1";


            globalButton.addEventListener(
                "click",

                event => {

                    if (
                        !isKohaSearchResultsPage()
                    ) {
                        return;
                    }


                    event.preventDefault();

                    event.stopImmediatePropagation();


                    toggleAllExemplaires();
                },

                true
            );
        }
    }


    /* ============================================================
       POOL API
       ============================================================ */

    async function runPool(
        rows
    ) {

        let index =
            0;


        async function worker() {

            while (
                index <
                rows.length
            ) {

                if (
                    !isKohaSearchResultsPage()
                ) {
                    return;
                }


                const current =
                    index++;


                await processExemplairesRow(
                    rows[current]
                );
            }
        }


        const workers =
            Array.from(
                {
                    length:
                        Math.min(
                            CONFIG.concurrentRequests,
                            rows.length
                        )
                },

                worker
            );


        await Promise.all(
            workers
        );
    }


    /* ============================================================
       OBSERVATEUR GLOBAL
       ============================================================ */

    function installGlobalObserver(
        form
    ) {

        if (
            !form
            ||
            form.dataset
                .kxV8Observer ===
                "1"
        ) {
            return;
        }


        form.dataset
            .kxV8Observer =
            "1";


        let scheduled =
            false;


        const observer =
            new MutationObserver(
                () => {

                    if (
                        !isKohaSearchResultsPage()
                    ) {

                        observer.disconnect();

                        return;
                    }


                    if (scheduled) {
                        return;
                    }


                    scheduled =
                        true;


                    requestAnimationFrame(
                        () => {

                            scheduled =
                                false;


                            if (
                                !isKohaSearchResultsPage()
                            ) {
                                return;
                            }


                            const rows =
                                Array.from(
                                    form.querySelectorAll(
                                        'tbody tr[id^="row"]'
                                    )
                                );


                            rows.forEach(
                                row => {

                                    if (
                                        row.dataset
                                            .kxNoticeDone !==
                                            "1"
                                    ) {

                                        enhanceNoticeRow(
                                            row
                                        );
                                    }


                                    const cells =
                                        Array
                                            .from(
                                                row.children
                                            )
                                            .filter(
                                                element =>
                                                    element.tagName ===
                                                    "TD"
                                            );


                                    if (
                                        cells.length >=
                                        3
                                    ) {

                                        processBibliographicCell(
                                            cells[2]
                                        );
                                    }
                                }
                            );
                        }
                    );
                }
            );


        observer.observe(
            form,
            {
                childList:
                    true,

                subtree:
                    true
            }
        );
    }


    /* ============================================================
       INIT
       ============================================================ */

    function init() {

        /*
         * Deuxième verrou.
         */

        if (!currentPmkConfig.enabled) {
            mountPmkContextButton();
            return;
        }

        if (
            !isKohaSearchResultsPage()
        ) {
            return;
        }


        const form =
            document.getElementById(
                "bookbag_form"
            );


        if (!form) {
            return;
        }


        const rows =
            Array.from(
                form.querySelectorAll(
                    'tbody tr[id^="row"]'
                )
            );


        if (
            !rows.length
        ) {
            return;
        }


        /*
         * Marqueur CSS ajouté uniquement
         * sur la vraie page de résultats.
         */

        document.body.classList.add(
            "kx-search-results-page"
        );


        loggedBranchName =
            getLoggedBranchName();


        installStyles();
        applyPmkAppearance();


        /* Notices */

        if (pmkFeature("notice.layoutEnabled")) {
            rows.forEach(
                enhanceNoticeRow
            );
        }


        /* Interactions */

        installEvents(
            form
        );


        /* Injections tardives */

        installGlobalObserver(
            form
        );


        /* Mobile */

        const onMediaChange =
            () => {

                if (
                    !isKohaSearchResultsPage()
                ) {
                    return;
                }


                if (pmkFeature("notice.layoutEnabled") && pmkFeature("notice.mobileCollapseEnabled")) {
                    syncAllMobileNoticeControls(
                        form
                    );
                }
            };


        if (
            typeof mobileMedia.addEventListener ===
            "function"
        ) {

            mobileMedia.addEventListener(
                "change",
                onMediaChange
            );

        }
        else if (
            typeof mobileMedia.addListener ===
            "function"
        ) {

            /*
             * Compatibilité navigateurs plus anciens.
             */

            mobileMedia.addListener(
                onMediaChange
            );
        }


        if (pmkFeature("notice.layoutEnabled") && pmkFeature("notice.mobileCollapseEnabled")) {
            syncAllMobileNoticeControls(
                form
            );
        }


        /* Exemplaires */

        if (pmkFeature("items.cardsEnabled")) {
            runPool(
                rows
            );
        }


        runtimeInitialized = true;
        syncGlobalToggleButton();
        mountPmkContextButton();
    }


    /* ============================================================
       DÉMARRAGE
       ============================================================ */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",

            () => {

                if (
                    window.location.pathname ===
                    SEARCH_PATH
                ) {

                    init();
                }
            },

            {
                once:
                    true
            }
        );

    }
    else {

        init();
    }

})();


/*******************************************************************************
 * PATCH AUTONOME — HISTORIQUE DE PRÊT DANS LES CARTES EXEMPLAIRES
 *
 * IMPORTANT : volontairement placé HORS du gros IIFE précédent.
 * Il ne dépend ni de renderItem(), ni du verrou __KX_SEARCH_RESULTS_V8__,
 * ni du module Mouvements. Il travaille uniquement sur le DOM effectivement
 * rendu dans la page.
 *******************************************************************************/
(() => {
    "use strict";

    const SEARCH_PATH = "/cgi-bin/koha/catalogue/search.pl";

    if (window.location.pathname !== SEARCH_PATH) {
        return;
    }

    if (window.__KX_LOAN_HISTORY_STANDALONE_V1__) {
        return;
    }
    window.__KX_LOAN_HISTORY_STANDALONE_V1__ = true;

    function loanHistoryEnabled() {
        try {
            return !window.PMK129SearchResults
                || window.PMK129SearchResults.featureEnabled("items.actions.loanHistory") !== false;
        }
        catch (_) {
            return true;
        }
    }

    function getBiblioNumber(card) {
        const row = card.closest('tr[id^="row"]');

        if (row) {
            const match = String(row.id || "").match(/^row(\d+)$/);
            if (match) {
                return match[1];
            }

            const candidate = row.querySelector(
                'a[href*="biblionumber="], a[href*="/catalogue/detail.pl?"]'
            );

            if (candidate?.href) {
                try {
                    const url = new URL(candidate.href, window.location.origin);
                    const value = url.searchParams.get("biblionumber");
                    if (value) {
                        return value;
                    }
                }
                catch (_) {}
            }
        }

        return "";
    }

    function getBarcode(card) {
        const fromDataset = String(card.dataset.barcode || "").trim();
        if (fromDataset) {
            return fromDataset;
        }

        const node = card.querySelector(".kxri-barcode");
        if (!node) {
            return "";
        }

        const value = String(node.textContent || "").trim();

        // Ne pas confondre le fallback « Exemplaire #123 » avec un code-barres.
        if (/^Exemplaire\s*#/i.test(value)) {
            return "";
        }

        return value;
    }

    function getItemNumber(card) {
        const fromDataset = String(card.dataset.itemId || "").trim();
        if (fromDataset) {
            return fromDataset;
        }

        const editLink = card.querySelector(
            '.kxri-actions a[href*="itemnumber="]'
        );

        if (editLink?.href) {
            try {
                return new URL(
                    editLink.href,
                    window.location.origin
                ).searchParams.get("itemnumber") || "";
            }
            catch (_) {}
        }

        return "";
    }

    function openLoanHistory(card) {
        const biblioNumber = getBiblioNumber(card);
        const barcode = getBarcode(card);
        const itemNumber = getItemNumber(card);

        if (!biblioNumber || !barcode) {
            (function(){})("[KX historique prêt] Données manquantes", {
                biblioNumber,
                barcode,
                itemNumber,
                card
            });

            window.alert(
                "Impossible d’ouvrir l’historique : numéro de notice ou code-barres introuvable."
            );
            return;
        }

        const url = new URL(
            "/cgi-bin/koha/catalogue/issuehistory.pl",
            window.location.origin
        );

        url.searchParams.set("biblionumber", biblioNumber);
        url.searchParams.set("krt_barcode", barcode);

        if (itemNumber) {
            url.searchParams.set("krt_itemnumber", itemNumber);
        }

        url.hash = "krt-biblio-timeline";

        window.location.assign(url.toString());
    }

    function injectIntoCard(card) {
        if (!(card instanceof Element)) {
            return;
        }

        const existingButton = card.querySelector(".kxri-loan-history-standalone");
        if (!loanHistoryEnabled()) {
            if (existingButton) existingButton.remove();
            return;
        }

        const actions = card.querySelector(".kxri-actions");
        if (!actions) {
            return;
        }

        if (existingButton || actions.querySelector(".kxri-loan-history-standalone")) {
            return;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "kxri-action kxri-loan-history-standalone";
        button.title = "Historique de prêt préfiltré sur le code-barres de cet exemplaire";
        const loanLabel = (() => {
            try {
                const cfg = window.PMK129SearchResults && window.PMK129SearchResults.getConfig();
                const lang = String(document.documentElement.lang || navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
                return lang === "en" ? (cfg?.labels?.loanHistoryEn || "Loan history") : (cfg?.labels?.loanHistoryFr || "Historique de prêt");
            }
            catch (_) { return "Historique de prêt"; }
        })();
        button.innerHTML =
            '<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ' + loanLabel;

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            openLoanHistory(card);
        });

        const movements = actions.querySelector(
            ".kxri-open-central-movements, .kxmv-item-btn"
        );

        const details = actions.querySelector(".kxri-toggle-details");

        if (movements) {
            movements.insertAdjacentElement("afterend", button);
        }
        else if (details) {
            actions.insertBefore(button, details);
        }
        else {
            actions.appendChild(button);
        }
    }

    function scan() {
        if (!loanHistoryEnabled()) {
            document.querySelectorAll(".kxri-loan-history-standalone").forEach(button => button.remove());
            return;
        }

        document
            .querySelectorAll(".kxri-item")
            .forEach(injectIntoCard);
    }

    let scheduled = false;

    function scheduleScan() {
        if (scheduled) {
            return;
        }

        scheduled = true;
        window.requestAnimationFrame(() => {
            scheduled = false;
            scan();
        });
    }

    function installPatchStyle() {
        if (document.getElementById("kx-loan-history-standalone-style")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "kx-loan-history-standalone-style";
        style.textContent = `
body.kx-search-results-page .kxri-actions > .kxri-loan-history-standalone,
.kxri-actions > .kxri-loan-history-standalone {
    display: inline-flex !important;
    visibility: visible !important;
    opacity: 1 !important;
}
`;
        document.head.appendChild(style);
    }

    function start() {
        installPatchStyle();
        scan();

        window.addEventListener("pmk129:config-changed", scheduleScan);

        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        // Filet de sécurité pour les cartes construites tardivement.
        window.setTimeout(scan, 500);
        window.setTimeout(scan, 1500);
        window.setTimeout(scan, 3000);

        (function(){})(
            "[KX historique prêt] patch autonome chargé — scan DOM actif."
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    }
    else {
        start();
    }
})();
