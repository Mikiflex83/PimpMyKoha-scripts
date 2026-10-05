/* ============================================================
   Nom du fichier : 011-moredetail-layout.js
   Module PMK      : moredetail-layout
   Version         : 3.2.0
   Mise à jour     : 2026-09-17
   Auteur          : Michael Mundet

   Fonction :
   - améliore la présentation de catalogue/moredetail.pl sans cloner
     ni détruire le DOM natif Koha ;
   - présente les exemplaires sous forme de cartes responsives ;
   - permet d'afficher/masquer, renommer, déplacer et mettre en
     évidence des éléments ciblés ;
   - permet de sélectionner visuellement un élément directement
     sur la page Koha depuis la configuration PMK ;
   - conserve les formulaires, événements et interactions natives ;
   - applique par défaut les adaptations historiques Dracénie.

   Préparation PimpMyKoha :
   - identifiant fonctionnel stable : moredetail-layout ;
   - adaptateur : catalogue.moredetail ;
   - Firestore n'est jamais appelé directement par ce module ;
   - la couche de configuration est fournie par window.PMKConfig.
   ============================================================ */
(function () {
    "use strict";

    const MODULE_ID = "moredetail-layout";
    const MODULE_VERSION = "3.2.0";
    const STYLE_ID = "pmk-moredetail-layout-styles";
    const GRID_ID = "pmk-moredetail-items-grid";
    const PAGE_ID = "catalogue.moredetail";

    const KNOWN_FIELD_CLASSES = new Set([
        "biblionumber", "itemtype", "rentalcharge", "rentalcharge_daily",
        "rentalcharge_hourly", "isbn", "publication_details", "volume",
        "physical_details", "biblio_note", "item_count", "homebranch", "itype",
        "ccode", "itemcallnumber", "copynumber", "location", "replacementprice",
        "materials", "holdingbranch", "checkout_status", "renewals_count", "lost",
        "damaged", "withdrawn", "local_holds_priority", "bookable", "order_info",
        "dateaccessioned", "invoice", "issues", "datelastseen", "datelastborrowed",
        "previous_borrowers", "paidfor", "enumchron", "itemnotes",
        "itemnotes_nonpublic"
    ]);

    const GENERIC_CLASSES = new Set([
        "page-section", "clearfix", "listgroup", "rows", "bibliodetails", "label",
        "expanded", "collapsed", "form-control", "form-select", "btn", "btn-primary",
        "btn-xs", "inline", "hint", "help-block", "alert", "alert-info", "alert-warning"
    ]);

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: [
            {
                pageId: PAGE_ID,
                enabled: true,
                path: "catalogue/moredetail.pl"
            }
        ],
        layout: {
            mode: "cards",
            desktopColumns: 3,
            tabletColumns: 2,
            mobileColumns: 1,
            gap: 20,
            outerPadding: 10,
            showBibliographicBlock: true,
            numberItems: true,
            itemNumberLabelFr: "Exemplaire",
            itemNumberLabelEn: "Item",
            cardBackground: "#f1f1f1",
            pageBackground: "#f9f9f9",
            sectionBackground: "#ffffff",
            borderColor: "#cccccc"
        },
        highlight: {
            enabled: true,
            storageKey: "searchbox_value",
            backgroundColor: "#7abf87",
            scrollIntoView: false
        },
        catalogueInfo: {
            enabled: true,
            selector: ".catalogue-info",
            waitMs: 5000
        },
        sections: [
            {
                key: "information",
                visible: true,
                labelFr: "",
                labelEn: "",
                collapsible: false,
                collapsedByDefault: false
            },
            {
                key: "statuses",
                visible: true,
                labelFr: "",
                labelEn: "",
                collapsible: false,
                collapsedByDefault: false
            },
            {
                key: "priority",
                visible: true,
                labelFr: "",
                labelEn: "",
                collapsible: false,
                collapsedByDefault: false
            },
            {
                key: "history",
                visible: true,
                labelFr: "",
                labelEn: "",
                collapsible: false,
                collapsedByDefault: false
            }
        ],
        fieldRules: [
            {
                enabled: true,
                targetName: "Numéro de copie / Copy number",
                targetKind: "field",
                scope: "item",
                selector: ".copynumber",
                visible: true,
                labelFr: "Sous-localisation",
                labelEn: "Sub-location",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            },
            {
                enabled: true,
                targetName: "Statut perdu / Lost status",
                targetKind: "field",
                scope: "item",
                selector: ".lost",
                visible: true,
                labelFr: "Motif d'exclusion",
                labelEn: "Exclusion reason",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            },
            {
                enabled: true,
                targetName: "Énumération du périodique / Serial enumeration",
                targetKind: "field",
                scope: "item",
                selector: ".enumchron",
                visible: true,
                labelFr: "Etage",
                labelEn: "Floor",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            },
            {
                enabled: true,
                targetName: "Statut de prêt / Checkout status",
                targetKind: "field",
                scope: "item",
                selector: ".checkout_status",
                visible: true,
                labelFr: "Informations de prêt",
                labelEn: "Checkout information",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            },
            {
                enabled: true,
                targetName: "Coût du prêt / Rental charge",
                targetKind: "field",
                scope: "biblio",
                selector: ".rentalcharge",
                visible: false,
                labelFr: "",
                labelEn: "",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            },
            {
                enabled: true,
                targetName: "Coût du prêt par jour / Daily rental charge",
                targetKind: "field",
                scope: "biblio",
                selector: ".rentalcharge_daily",
                visible: false,
                labelFr: "",
                labelEn: "",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            },
            {
                enabled: true,
                targetName: "Frais de location horaires / Hourly rental charge",
                targetKind: "field",
                scope: "biblio",
                selector: ".rentalcharge_hourly",
                visible: false,
                labelFr: "",
                labelEn: "",
                destinationGroup: "keep",
                order: null,
                hideWhenEmpty: false,
                emphasis: "normal",
                highlight: false
            }
        ]
    };

    const state = {
        config: null,
        root: null,
        biblioSection: null,
        items: [],
        originalItemsParent: null,
        originalAfterItems: null,
        movedNodes: [],
        renamedLabels: new Map(),
        renamedHeadings: new Map(),
        addedNodes: [],
        touchedNodes: new Set(),
        catalogueObserver: null,
        unsubscribe: null,
        applied: false
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function currentLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang.startsWith("fr")) return "fr";
        if (htmlLang.startsWith("en")) return "en";
        return (navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function isMoreDetailPage() {
        return /\/catalogue\/moredetail\.pl$/.test(window.location.pathname);
    }

    function pageEnabled(config) {
        if (!config || config.enabled === false) return false;
        const pages = Array.isArray(config.pages) ? config.pages : [];
        const page = pages.find(function (entry) {
            return entry && entry.pageId === PAGE_ID;
        });
        return !page || page.enabled !== false;
    }

    function clampInteger(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.round(number)));
    }

    function cleanText(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (char) {
            return "\\" + char;
        });
    }

    function safeQueryAll(root, selector) {
        if (!root || !selector) return [];
        try {
            return Array.from(root.querySelectorAll(selector));
        } catch (_) {
            return [];
        }
    }

    function pagePath() {
        return "catalogue/moredetail.pl";
    }

    function newFieldRule() {
        return {
            enabled: true,
            targetName: "",
            targetKind: "field",
            scope: "item",
            selector: "",
            visible: true,
            labelFr: "",
            labelEn: "",
            destinationGroup: "keep",
            order: null,
            hideWhenEmpty: false,
            emphasis: "normal",
            highlight: false
        };
    }

    function fieldRuleFromPath(rootObject, path) {
        if (!rootObject || !Array.isArray(rootObject.fieldRules)) return null;
        const index = path[path.length - 2];
        return Number.isInteger(index) ? rootObject.fieldRules[index] : null;
    }

    function visualPickerResultTarget(rawTarget) {
        if (!rawTarget || !(rawTarget instanceof Element)) return null;

        const itemContainer = rawTarget.closest('#catalogue_detail_biblio > div[id^="container"]');
        if (itemContainer) {
            return rawTarget.closest("li, .listgroup, h3, .page-section") || itemContainer;
        }

        const biblioSection = rawTarget.closest("#catalogue_detail_biblio > .page-section");
        if (biblioSection) {
            return rawTarget.closest("li, .listgroup, h2, h4, .page-section") || biblioSection;
        }

        return rawTarget.closest("#catalogue_detail_biblio *");
    }

    function detectPickerScope(element) {
        if (!element) return "page";
        if (element.closest('#catalogue_detail_biblio > div[id^="container"]')) return "item";
        if (element.closest("#catalogue_detail_biblio > .page-section")) return "biblio";
        return "page";
    }

    function detectTargetKind(element) {
        if (!element) return "custom";
        if (element.matches("li")) return "field";
        if (element.matches(".listgroup")) return "section";
        if (element.matches("h2,h3,h4")) return "heading";
        return "custom";
    }

    function bestTargetName(element) {
        if (!element) return "";
        const label = element.querySelector && element.querySelector(":scope > .label, .label");
        if (label && cleanText(label.textContent)) return cleanText(label.textContent).replace(/\s*:\s*$/, "");

        if (element.matches && element.matches(".listgroup")) {
            const heading = element.querySelector(":scope > h4");
            if (heading) return cleanText(heading.textContent).replace(/\s+/g, " ").slice(0, 100);
        }

        const text = cleanText(element.textContent).replace(/\s+/g, " ");
        return text.slice(0, 100);
    }

    function selectorFromElement(element, scope) {
        if (!element) return "";

        if (element.matches("li")) {
            const classes = Array.from(element.classList || []);
            const known = classes.find(function (className) {
                return KNOWN_FIELD_CLASSES.has(className);
            });
            if (known) return "." + known;

            const stableClass = classes.find(function (className) {
                return className && !GENERIC_CLASSES.has(className) && !/^pmk-/.test(className);
            });
            if (stableClass) return "." + stableClass;
        }

        if (element.id && !/^(item|container|collapse_item)\d+$/.test(element.id)) {
            return "#" + cssEscape(element.id);
        }

        const classes = Array.from(element.classList || []).filter(function (className) {
            return className && !GENERIC_CLASSES.has(className) && !/^pmk-/.test(className);
        });
        if (classes.length) return "." + classes.map(cssEscape).join(".");

        const root = scope === "item"
            ? element.closest('#catalogue_detail_biblio > div[id^="container"]')
            : (scope === "biblio" ? element.closest("#catalogue_detail_biblio > .page-section") : document.body);

        if (!root) return "";

        const parts = [];
        let current = element;
        while (current && current !== root && current.nodeType === 1) {
            let part = current.tagName.toLowerCase();
            const parent = current.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(function (child) {
                    return child.tagName === current.tagName;
                });
                if (sameTag.length > 1) {
                    part += ":nth-of-type(" + (sameTag.indexOf(current) + 1) + ")";
                }
            }
            parts.unshift(part);
            current = parent;
        }
        return parts.join(" > ");
    }

    function registerCommonPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== "function") return false;
        service.register(MODULE_ID, {
            getOptions: function () {
                return {
                    rootSelector: "#catalogue_detail_biblio",
                    bannerText: currentLanguage() === "en"
                        ? "Click the Koha element to configure — Esc cancels"
                        : "Clique sur l’élément Koha à configurer — Échap annule"
                };
            },
            resolveTarget: function (element) {
                return visualPickerResultTarget(element);
            },
            buildResult: function (element, base) {
                const scope = detectPickerScope(element);
                const selector = selectorFromElement(element, scope) || base.selector;
                return Object.assign({}, base, {
                    value: selector,
                    selector: selector,
                    scope: scope,
                    targetKind: detectTargetKind(element),
                    targetName: bestTargetName(element)
                });
            },
            applyPending: function (draft, pending, picked) {
                onPickedTarget(draft, pending && pending.fieldPath || [], picked || {});
                return draft;
            }
        });
        return true;
    }

    function visualElementPicker(context) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pickForConfig !== "function") {
            return Promise.reject(new Error("pmk_common_picker_unavailable"));
        }
        registerCommonPickerAdapter();
        const ctx = context || {};
        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: pagePath(),
            rootObject: ctx.rootObject || {},
            fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath : [],
            adminContext: { sectionId: "elements" },
            options: { rootSelector: "#catalogue_detail_biblio" }
        });
    }

    function onPickedTarget(rootObject, fieldPath, result) {
        const rule = fieldRuleFromPath(rootObject, fieldPath);
        if (!rule || !result) return;
        if (result.scope) rule.scope = result.scope;
        if (result.targetKind) rule.targetKind = result.targetKind;
        if (result.targetName) rule.targetName = result.targetName;
    }

    function destinationOptions() {
        return [
            { value: "keep", label: { fr: "Conserver son bloc actuel", en: "Keep current section" } },
            { value: "information", label: { fr: "Informations exemplaire", en: "Item information" } },
            { value: "statuses", label: { fr: "Statuts", en: "Statuses" } },
            { value: "priority", label: { fr: "Priorité", en: "Priority" } },
            { value: "history", label: { fr: "Historique", en: "History" } }
        ];
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 3,
            name: {
                fr: "Présentation des détails des exemplaires",
                en: "Item details layout"
            },
            description: {
                fr: "Réorganise moredetail.pl sans casser le DOM natif Koha et permet de cibler directement les éléments à afficher, masquer, renommer ou déplacer.",
                en: "Reorganizes moredetail.pl without breaking Koha's native DOM and lets you directly target elements to show, hide, rename or move."
            },
            category: {
                fr: "Catalogue / exemplaires",
                en: "Catalog / items"
            },
            supportedPages: [PAGE_ID],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Activer le module", en: "Enable module" }
                        },
                        {
                            key: "pages",
                            type: "repeater",
                            label: { fr: "Pages", en: "Pages" },
                            reorder: false,
                            removable: false,
                            canAdd: function () { return false; },
                            cannotAddHelp: {
                                fr: "Ce module est volontairement limité à moredetail.pl.",
                                en: "This module is intentionally limited to moredetail.pl."
                            },
                            itemTitle: function () {
                                return currentLanguage() === "en" ? "Item details" : "Détails des exemplaires";
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: { fr: "Activer sur cette page", en: "Enable on this page" }
                                },
                                {
                                    key: "pageId",
                                    type: "text",
                                    readOnly: true,
                                    advanced: true,
                                    label: { fr: "Identifiant page", en: "Page identifier" }
                                },
                                {
                                    key: "path",
                                    type: "text",
                                    readOnly: true,
                                    label: { fr: "Chemin Koha", en: "Koha path" }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "layout",
                    label: { fr: "Mise en page", en: "Layout" },
                    description: {
                        fr: "La présentation en cartes déplace les nœuds Koha réels : aucun formulaire ni événement natif n'est cloné.",
                        en: "Card layout moves the real Koha nodes: no native form or event is cloned."
                    },
                    fields: [
                        {
                            key: "layout.mode",
                            type: "select",
                            label: { fr: "Présentation des exemplaires", en: "Item presentation" },
                            options: [
                                { value: "cards", label: { fr: "Cartes responsives", en: "Responsive cards" } },
                                { value: "native", label: { fr: "Présentation native Koha", en: "Native Koha layout" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "layout-details",
                    label: { fr: "Réglages des cartes", en: "Card settings" },
                    fields: [
                        { key: "layout.desktopColumns", type: "number", label: { fr: "Colonnes grand écran", en: "Desktop columns" } },
                        { key: "layout.tabletColumns", type: "number", label: { fr: "Colonnes écran moyen", en: "Tablet columns" } },
                        { key: "layout.mobileColumns", type: "number", label: { fr: "Colonnes mobile", en: "Mobile columns" } },
                        { key: "layout.gap", type: "number", label: { fr: "Espacement entre cartes (px)", en: "Card gap (px)" } },
                        { key: "layout.outerPadding", type: "number", label: { fr: "Marge intérieure générale (px)", en: "Outer padding (px)" } },
                        { key: "layout.showBibliographicBlock", type: "boolean", label: { fr: "Afficher le bloc bibliographique", en: "Show bibliographic block" } },
                        { key: "layout.numberItems", type: "boolean", label: { fr: "Afficher « Exemplaire 1, 2… »", en: "Show “Item 1, 2…”" } },
                        { key: "layout.itemNumberLabelFr", type: "text", label: { fr: "Libellé français de la numérotation", en: "French numbering label" } },
                        { key: "layout.itemNumberLabelEn", type: "text", label: { fr: "Libellé anglais de la numérotation", en: "English numbering label" } },
                        { key: "layout.pageBackground", type: "color", label: { fr: "Fond de la zone", en: "Area background" } },
                        { key: "layout.cardBackground", type: "color", label: { fr: "Fond des cartes", en: "Card background" } },
                        { key: "layout.sectionBackground", type: "color", label: { fr: "Fond du bloc bibliographique", en: "Bibliographic block background" } },
                        { key: "layout.borderColor", type: "color", label: { fr: "Couleur des bordures", en: "Border color" } }
                    ]
                },
                {
                    type: "section",
                    id: "sections",
                    label: { fr: "Blocs des exemplaires", en: "Item sections" },
                    description: {
                        fr: "L'ordre des cartes ci-dessous détermine l'ordre des blocs dans chaque exemplaire.",
                        en: "The order of the cards below determines the section order inside each item."
                    },
                    fields: [
                        {
                            key: "sections",
                            type: "repeater",
                            label: { fr: "Blocs", en: "Sections" },
                            reorder: true,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function (item, index, lang) {
                                const names = {
                                    information: { fr: "Informations exemplaire", en: "Item information" },
                                    statuses: { fr: "Statuts", en: "Statuses" },
                                    priority: { fr: "Priorité", en: "Priority" },
                                    history: { fr: "Historique", en: "History" }
                                };
                                const label = names[item && item.key];
                                return label ? (label[lang] || label.fr) : "Bloc " + (index + 1);
                            },
                            fields: [
                                { key: "visible", type: "boolean", label: { fr: "Afficher ce bloc", en: "Show this section" } },
                                { key: "labelFr", type: "text", label: { fr: "Nouveau titre français (vide = Koha)", en: "French title (blank = Koha)" } },
                                { key: "labelEn", type: "text", label: { fr: "Nouveau titre anglais (vide = Koha)", en: "English title (blank = Koha)" } },
                                { key: "collapsible", type: "boolean", label: { fr: "Permettre de replier ce bloc", en: "Allow this section to collapse" } },
                                { key: "collapsedByDefault", type: "boolean", label: { fr: "Replié par défaut", en: "Collapsed by default" } },
                                { key: "key", type: "text", readOnly: true, advanced: true, label: { fr: "Identifiant technique", en: "Technical identifier" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "elements",
                    label: { fr: "Éléments ciblés", en: "Targeted elements" },
                    description: {
                        fr: "Ajoute une règle puis utilise « Choisir sur la page » pour viser un champ Koha sans connaître son sélecteur CSS.",
                        en: "Add a rule then use “Choose on page” to target a Koha field without knowing its CSS selector."
                    },
                    fields: [
                        {
                            key: "fieldRules",
                            type: "repeater",
                            label: { fr: "Règles d'affichage", en: "Display rules" },
                            addLabel: { fr: "Ajouter une règle / cibler un élément", en: "Add rule / target an element" },
                            reorder: true,
                            newItem: newFieldRule,
                            itemTitle: function (item, index) {
                                return cleanText(item && item.targetName) || cleanText(item && item.selector) || "Règle " + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "targetName", type: "text", label: { fr: "Nom dans la configuration", en: "Configuration name" } },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Élément à cibler", en: "Element to target" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    emptyLabel: { fr: "Aucun élément choisi", en: "No element selected" },
                                    help: {
                                        fr: "Le sélecteur est généré automatiquement. Le mode avancé permet aussi de le saisir manuellement.",
                                        en: "The selector is generated automatically. Advanced mode also allows manual entry."
                                    },
                                    allowManual: true,
                                    pick: visualElementPicker,
                                    onPick: onPickedTarget
                                },
                                {
                                    key: "scope",
                                    type: "select",
                                    label: { fr: "Zone de recherche", en: "Search scope" },
                                    options: [
                                        { value: "item", label: { fr: "Dans chaque exemplaire", en: "Inside each item" } },
                                        { value: "biblio", label: { fr: "Bloc bibliographique", en: "Bibliographic block" } },
                                        { value: "page", label: { fr: "Toute la page", en: "Whole page" } }
                                    ]
                                },
                                { key: "visible", type: "boolean", label: { fr: "Afficher l'élément", en: "Show element" } },
                                { key: "labelFr", type: "text", label: { fr: "Nouveau libellé français (vide = conserver)", en: "French label (blank = keep)" } },
                                { key: "labelEn", type: "text", label: { fr: "Nouveau libellé anglais (vide = conserver)", en: "English label (blank = keep)" } },
                                {
                                    key: "destinationGroup",
                                    type: "select",
                                    label: { fr: "Déplacer dans", en: "Move to" },
                                    options: destinationOptions()
                                },
                                {
                                    key: "order",
                                    type: "number",
                                    label: { fr: "Position dans le bloc (vide = conserver)", en: "Position inside section (blank = keep)" },
                                    help: { fr: "1 place l'élément en premier, 2 en deuxième, etc.", en: "1 places the element first, 2 second, and so on." }
                                },
                                { key: "hideWhenEmpty", type: "boolean", label: { fr: "Masquer si la valeur est vide", en: "Hide when value is empty" } },
                                {
                                    key: "emphasis",
                                    type: "select",
                                    label: { fr: "Présentation", en: "Presentation" },
                                    options: [
                                        { value: "normal", label: { fr: "Normale", en: "Normal" } },
                                        { value: "muted", label: { fr: "Discrète", en: "Muted" } },
                                        { value: "accent", label: { fr: "Accentué", en: "Emphasized" } }
                                    ]
                                },
                                { key: "highlight", type: "boolean", label: { fr: "Mettre en évidence", en: "Highlight" } },
                                { key: "targetKind", type: "text", readOnly: true, advanced: true, label: { fr: "Type détecté", en: "Detected type" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "highlight",
                    label: { fr: "Exemplaire recherché", en: "Searched item" },
                    fields: [
                        { key: "highlight.enabled", type: "boolean", label: { fr: "Mettre en évidence le code-barres mémorisé", en: "Highlight remembered barcode" } },
                        { key: "highlight.backgroundColor", type: "color", label: { fr: "Couleur de surbrillance", en: "Highlight color" } },
                        { key: "highlight.scrollIntoView", type: "boolean", label: { fr: "Faire défiler jusqu'à l'exemplaire", en: "Scroll to highlighted item" } },
                        { key: "highlight.storageKey", type: "text", advanced: true, label: { fr: "Clé localStorage", en: "localStorage key" } }
                    ]
                },
                {
                    type: "section",
                    id: "catalogue-info",
                    label: { fr: "Bloc catalogue-info", en: "catalogue-info block" },
                    description: {
                        fr: "Compatibilité avec le bloc facultatif ajouté par d'autres personnalisations.",
                        en: "Compatibility with the optional block added by other customizations."
                    },
                    fields: [
                        { key: "catalogueInfo.enabled", type: "boolean", label: { fr: "Replacer ce bloc avec les informations bibliographiques", en: "Move this block with bibliographic information" } },
                        { key: "catalogueInfo.selector", type: "text", advanced: true, label: { fr: "Sélecteur du bloc", en: "Block selector" } },
                        { key: "catalogueInfo.waitMs", type: "number", advanced: true, label: { fr: "Durée maximale d'attente (ms)", en: "Maximum wait time (ms)" } }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context) return;
                const wanted = context.sectionId || "elements";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    function validateConfig(config) {
        const lang = currentLanguage();
        const fail = function (fr, en) {
            return { ok: false, message: lang === "en" ? en : fr };
        };

        if (!config || typeof config !== "object") {
            return fail("La configuration du module n'est pas valide.", "The module configuration is invalid.");
        }

        const layout = config.layout || {};
        const desktop = Number(layout.desktopColumns);
        const tablet = Number(layout.tabletColumns);
        const mobile = Number(layout.mobileColumns);
        if (![desktop, tablet, mobile].every(function (value) { return Number.isFinite(value) && value >= 1 && value <= 6; })) {
            return fail("Le nombre de colonnes doit être compris entre 1 et 6.", "Column counts must be between 1 and 6.");
        }

        if (layout.mode !== "cards" && layout.mode !== "native") {
            return fail("Le mode de mise en page est invalide.", "The layout mode is invalid.");
        }

        if (!Array.isArray(config.fieldRules)) {
            return fail("La liste des éléments ciblés est invalide.", "The targeted element list is invalid.");
        }

        for (const rule of config.fieldRules) {
            if (!rule || rule.enabled === false) continue;
            if (!cleanText(rule.selector)) {
                return fail("Une règle active ne cible aucun élément.", "An enabled rule does not target any element.");
            }
            if (!["item", "biblio", "page"].includes(rule.scope)) {
                return fail("Une règle utilise une zone de recherche inconnue.", "A rule uses an unknown search scope.");
            }
            try {
                document.createDocumentFragment().querySelector(rule.selector);
            } catch (_) {
                return fail("Un sélecteur CSS configuré n'est pas valide : " + rule.selector, "A configured CSS selector is invalid: " + rule.selector);
            }
        }

        return { ok: true };
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: {
                livePreview: true
            },
            canPreview: function () { return isMoreDetailPage(); },
            previewDraft: function (draft) {
                if (!isMoreDetailPage()) throw new Error("visual_preview_wrong_page");
                const before = clone(state.config || DEFAULT_CONFIG);
                applyConfig(draft);
                return function () {
                    applyConfig(before);
                };
            }
        });
        return true;
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        window.PMKConfig.registerModule(moduleDefinition());
        registerCommonPickerAdapter();
        return true;
    }

    function waitForPMKConfig(timeout) {
        const max = Number(timeout) || 6000;
        if (registerModule()) return Promise.resolve(true);

        return new Promise(function (resolve) {
            let done = false;
            const finish = function (value) {
                if (done) return;
                done = true;
                window.removeEventListener("pmk:config-ready", onReady);
                resolve(value);
            };
            const onReady = function () {
                finish(registerModule());
            };
            window.addEventListener("pmk:config-ready", onReady, { once: true });
            window.setTimeout(function () { finish(registerModule()); }, max);
        });
    }

    function identifyStructure() {
        const root = document.getElementById("catalogue_detail_biblio");
        if (!root) return null;

        const biblioSection = Array.from(root.children).find(function (child) {
            return child.matches && child.matches(".page-section") && child.querySelector("ol.bibliodetails");
        }) || null;

        const items = Array.from(root.children).filter(function (child) {
            return child.matches && child.matches('div[id^="container"]') &&
                child.querySelector(':scope > h3[id^="item"]') &&
                child.querySelector(':scope > .page-section[id^="collapse_item"]');
        });

        if (!biblioSection || !items.length) return null;
        return { root: root, biblioSection: biblioSection, items: items };
    }

    function sectionKey(listgroup) {
        if (!listgroup) return null;
        if (listgroup.querySelector(".homebranch, .itype, .ccode, .itemcallnumber, .copynumber, .location, .replacementprice, .materials")) return "information";
        if (listgroup.querySelector(".holdingbranch, .checkout_status, .renewals_count, .lost, .damaged, .withdrawn")) return "statuses";
        if (listgroup.querySelector(".local_holds_priority, .bookable")) return "priority";
        if (listgroup.querySelector(".issues, .datelastseen, .datelastborrowed, .enumchron, .itemnotes, .itemnotes_nonpublic, .dateaccessioned")) return "history";
        return null;
    }

    function findSection(itemContainer, key) {
        const pageSection = itemContainer && itemContainer.querySelector(':scope > .page-section[id^="collapse_item"]');
        if (!pageSection) return null;
        return Array.from(pageSection.querySelectorAll(":scope > .listgroup")).find(function (group) {
            return sectionKey(group) === key;
        }) || null;
    }

    function rememberMove(node) {
        if (!node || !node.parentNode) return;
        state.movedNodes.push({
            node: node,
            parent: node.parentNode,
            nextSibling: node.nextSibling
        });
    }

    function rememberLabel(label) {
        if (!label || state.renamedLabels.has(label)) return;
        state.renamedLabels.set(label, label.textContent);
    }

    function rememberHeading(heading) {
        if (!heading || state.renamedHeadings.has(heading)) return;
        const target = heading.querySelector(":scope > span") || Array.from(heading.childNodes).find(function (node) {
            return node.nodeType === Node.TEXT_NODE && cleanText(node.textContent);
        });
        if (!target) return;
        state.renamedHeadings.set(heading, {
            target: target,
            text: target.textContent
        });
    }

    function setHeadingLabel(group, label) {
        if (!group || !label) return;
        const heading = group.querySelector(":scope > h4");
        if (!heading) return;
        rememberHeading(heading);

        const stored = state.renamedHeadings.get(heading);
        if (!stored || !stored.target) return;
        stored.target.textContent = label + (stored.target.nodeType === Node.TEXT_NODE ? " " : "");
    }

    function injectStyles(config) {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }

        const layout = config.layout || {};
        const desktopColumns = clampInteger(layout.desktopColumns, 1, 6, 3);
        const tabletColumns = clampInteger(layout.tabletColumns, 1, 6, Math.min(2, desktopColumns));
        const mobileColumns = clampInteger(layout.mobileColumns, 1, 3, 1);
        const gap = clampInteger(layout.gap, 0, 80, 20);
        const padding = clampInteger(layout.outerPadding, 0, 80, 10);
        const pageBackground = cleanText(layout.pageBackground) || "#f9f9f9";
        const cardBackground = cleanText(layout.cardBackground) || "#f1f1f1";
        const sectionBackground = cleanText(layout.sectionBackground) || "#ffffff";
        const borderColor = cleanText(layout.borderColor) || "#cccccc";
        const highlightColor = cleanText(config.highlight && config.highlight.backgroundColor) || "#7abf87";

        style.textContent = `
            #catalogue_detail_biblio.pmk-md-active {
                padding: ${padding}px;
                background: ${pageBackground};
                border: 1px solid ${borderColor};
                box-sizing: border-box;
            }
            #catalogue_detail_biblio.pmk-md-active > .pmk-md-biblio {
                padding: 10px;
                border: 1px solid ${borderColor};
                border-radius: 4px;
                background: ${sectionBackground};
                box-sizing: border-box;
                margin-bottom: ${gap}px;
            }
            #${GRID_ID} {
                display: grid;
                grid-template-columns: repeat(${desktopColumns}, minmax(0, 1fr));
                gap: ${gap}px;
                align-items: start;
            }
            #${GRID_ID} > .pmk-md-item-card {
                min-width: 0;
                box-sizing: border-box;
                padding: 10px;
                border: 1px solid ${borderColor};
                border-radius: 4px;
                background: ${cardBackground};
            }
            #${GRID_ID} > .pmk-md-item-card > h3 {
                margin-top: 0;
            }
            .pmk-md-item-sequence {
                font-weight: 700;
                margin: 0 0 .35rem;
            }
            .pmk-md-hidden { display: none !important; }
            .pmk-md-field-muted { opacity: .62; }
            .pmk-md-field-accent {
                border-left: 4px solid ${highlightColor};
                padding-left: .45rem;
            }
            .pmk-md-field-highlight {
                background: ${highlightColor} !important;
                border-radius: .2rem;
                padding: .15rem .35rem;
            }
            .pmk-md-item-highlight {
                background: ${highlightColor} !important;
                box-shadow: 0 0 0 2px ${highlightColor};
            }
            .pmk-md-section-toggle {
                border: 0;
                background: transparent;
                padding: .1rem .35rem;
                margin-left: .35rem;
                font-size: .9em;
            }
            .pmk-md-section-collapsed > .rows { display: none !important; }
            @media (max-width: 1200px) {
                #${GRID_ID} { grid-template-columns: repeat(${tabletColumns}, minmax(0, 1fr)); }
            }
            @media (max-width: 768px) {
                #catalogue_detail_biblio.pmk-md-active { padding: ${Math.min(padding, 6)}px; }
                #${GRID_ID} { grid-template-columns: repeat(${mobileColumns}, minmax(0, 1fr)); }
                #${GRID_ID} > .pmk-md-item-card { padding: 8px; }
            }
        `;
    }

    function removeStyles() {
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
    }

    function cleanup() {
        if (state.catalogueObserver) {
            state.catalogueObserver.disconnect();
            state.catalogueObserver = null;
        }

        state.addedNodes.forEach(function (node) {
            if (node && node.parentNode) node.remove();
        });
        state.addedNodes = [];

        Array.from(state.renamedLabels.entries()).forEach(function (entry) {
            const label = entry[0];
            if (label && label.isConnected) label.textContent = entry[1];
        });
        state.renamedLabels.clear();

        Array.from(state.renamedHeadings.entries()).forEach(function (entry) {
            const stored = entry[1];
            if (stored && stored.target && stored.target.isConnected) stored.target.textContent = stored.text;
        });
        state.renamedHeadings.clear();

        state.touchedNodes.forEach(function (node) {
            if (!node || !node.classList) return;
            node.classList.remove(
                "pmk-md-hidden",
                "pmk-md-field-muted",
                "pmk-md-field-accent",
                "pmk-md-field-highlight",
                "pmk-md-item-highlight",
                "pmk-md-section-collapsed",
                "pmk-md-item-card",
                "pmk-md-biblio"
            );
            node.removeAttribute("data-pmk-md-order");
        });
        state.touchedNodes.clear();

        for (let index = state.movedNodes.length - 1; index >= 0; index -= 1) {
            const record = state.movedNodes[index];
            if (!record || !record.node || !record.parent || !record.parent.isConnected) continue;
            const next = record.nextSibling && record.nextSibling.parentNode === record.parent
                ? record.nextSibling
                : null;
            record.parent.insertBefore(record.node, next);
        }
        state.movedNodes = [];

        const grid = document.getElementById(GRID_ID);
        if (grid && !grid.children.length) grid.remove();
        else if (grid) {
            const parent = state.originalItemsParent;
            if (parent) {
                Array.from(grid.children).forEach(function (child) {
                    parent.insertBefore(child, state.originalAfterItems && state.originalAfterItems.parentNode === parent ? state.originalAfterItems : null);
                });
            }
            grid.remove();
        }

        if (state.root) state.root.classList.remove("pmk-md-active");
        removeStyles();
        state.applied = false;
    }

    function buildCards(config) {
        if (!state.root || !state.items.length) return;
        const layout = config.layout || {};

        state.root.classList.add("pmk-md-active");
        state.biblioSection.classList.add("pmk-md-biblio");
        state.touchedNodes.add(state.biblioSection);

        if (layout.showBibliographicBlock === false) {
            state.biblioSection.classList.add("pmk-md-hidden");
        }

        if (layout.mode !== "cards") return;

        const grid = document.createElement("div");
        grid.id = GRID_ID;
        grid.setAttribute("data-pmk-module", MODULE_ID);

        const lastItem = state.items[state.items.length - 1];
        state.originalItemsParent = lastItem.parentNode;
        state.originalAfterItems = lastItem.nextSibling;
        state.originalItemsParent.insertBefore(grid, state.items[0]);

        state.items.forEach(function (item, index) {
            item.classList.add("pmk-md-item-card");
            state.touchedNodes.add(item);
            grid.appendChild(item);

            if (layout.numberItems !== false) {
                const label = document.createElement("div");
                label.className = "pmk-md-item-sequence";
                const base = currentLanguage() === "en"
                    ? (cleanText(layout.itemNumberLabelEn) || "Item")
                    : (cleanText(layout.itemNumberLabelFr) || "Exemplaire");
                label.textContent = base + " " + (index + 1);
                item.insertBefore(label, item.firstChild);
                state.addedNodes.push(label);
            }
        });
    }

    function applySectionRules(config) {
        const rules = Array.isArray(config.sections) ? config.sections : [];
        if (!rules.length) return;

        state.items.forEach(function (item) {
            const pageSection = item.querySelector(':scope > .page-section[id^="collapse_item"]');
            if (!pageSection) return;

            const groupMap = new Map();
            Array.from(pageSection.querySelectorAll(":scope > .listgroup")).forEach(function (group) {
                const key = sectionKey(group);
                if (key) groupMap.set(key, group);
            });

            rules.forEach(function (rule) {
                const group = groupMap.get(rule && rule.key);
                if (!group) return;
                state.touchedNodes.add(group);

                if (rule.visible === false) group.classList.add("pmk-md-hidden");

                const customLabel = currentLanguage() === "en"
                    ? cleanText(rule.labelEn)
                    : cleanText(rule.labelFr);
                if (customLabel) setHeadingLabel(group, customLabel);

                if (rule.collapsible === true) {
                    const heading = group.querySelector(":scope > h4");
                    const rows = group.querySelector(":scope > .rows");
                    if (heading && rows) {
                        const button = document.createElement("button");
                        button.type = "button";
                        button.className = "pmk-md-section-toggle";
                        button.setAttribute("aria-expanded", rule.collapsedByDefault ? "false" : "true");
                        button.title = currentLanguage() === "en" ? "Expand/collapse section" : "Déplier/replier le bloc";
                        button.innerHTML = '<i class="fa fa-caret-down" aria-hidden="true"></i>';
                        button.addEventListener("click", function (event) {
                            event.preventDefault();
                            event.stopPropagation();
                            const collapsed = group.classList.toggle("pmk-md-section-collapsed");
                            button.setAttribute("aria-expanded", collapsed ? "false" : "true");
                            const icon = button.querySelector("i");
                            if (icon) {
                                icon.classList.toggle("fa-caret-right", collapsed);
                                icon.classList.toggle("fa-caret-down", !collapsed);
                            }
                        });
                        heading.appendChild(button);
                        state.addedNodes.push(button);
                        if (rule.collapsedByDefault) {
                            group.classList.add("pmk-md-section-collapsed");
                            const icon = button.querySelector("i");
                            if (icon) {
                                icon.classList.remove("fa-caret-down");
                                icon.classList.add("fa-caret-right");
                            }
                        }
                    }
                }
            });

            const ordered = rules.map(function (rule) {
                return groupMap.get(rule && rule.key);
            }).filter(Boolean);

            ordered.forEach(function (group) {
                rememberMove(group);
                pageSection.appendChild(group);
            });
        });
    }

    function selectedLabel(rule) {
        return currentLanguage() === "en" ? cleanText(rule.labelEn) : cleanText(rule.labelFr);
    }

    /*
     * Retrouve le libellé métier lié à une cible, même si la règle vise
     * directement le span.label, un formulaire, un select ou un autre
     * descendant du <li>. Cela rend le renommage indépendant du niveau
     * exact choisi avec le sélecteur visuel / CSS manuel.
     */
    function findLabelNode(target) {
        if (!target || !target.matches) return null;

        if (target.matches(".label")) return target;

        let label = null;
        try {
            label = target.querySelector(":scope > .label");
        } catch (_) {
            label = null;
        }
        if (label) return label;

        if (target.querySelector) {
            label = target.querySelector(".label");
            if (label) return label;
        }

        const field = target.closest("li");
        if (field) {
            try {
                label = field.querySelector(":scope > .label");
            } catch (_) {
                label = null;
            }
            if (label) return label;
            label = field.querySelector(".label");
            if (label) return label;
        }

        return null;
    }

    function applyLabelReplacement(target, rule) {
        const labelText = selectedLabel(rule);
        if (!labelText || !target) return false;

        const label = findLabelNode(target);
        if (label) {
            rememberLabel(label);
            const original = cleanText(label.textContent);
            const suffix = /:\s*$/.test(original) ? ":" : "";
            label.textContent = labelText + suffix;
            return true;
        }

        if (target.matches && target.matches(".listgroup")) {
            setHeadingLabel(target, labelText);
            return true;
        }

        const heading = target.matches && target.matches("h2,h3,h4")
            ? target
            : (target.closest ? target.closest("h2,h3,h4") : null);
        if (heading) {
            rememberHeading(heading);
            const storedHeading = state.renamedHeadings.get(heading);
            if (storedHeading && storedHeading.target) {
                storedHeading.target.textContent = labelText +
                    (storedHeading.target.nodeType === Node.TEXT_NODE ? " " : "");
                return true;
            }
        }

        return false;
    }

    function isEffectivelyEmpty(element) {
        if (!element) return true;
        if (element.querySelector("input:not([type='hidden']), select, textarea, button, a")) return false;
        const cloneNode = element.cloneNode(true);
        safeQueryAll(cloneNode, ".label").forEach(function (label) { label.remove(); });
        return cleanText(cloneNode.textContent).replace(/[:\u00a0]/g, "").trim() === "";
    }

    function targetRootsForRule(rule) {
        if (rule.scope === "biblio") return state.biblioSection ? [state.biblioSection] : [];
        if (rule.scope === "page") return [document];
        return state.items.slice();
    }

    function moveTargetToGroup(target, rule) {
        if (!target || rule.scope !== "item" || !rule.destinationGroup || rule.destinationGroup === "keep") return;
        const item = target.closest('#catalogue_detail_biblio > div[id^="container"]');
        if (!item) return;
        const group = findSection(item, rule.destinationGroup);
        const list = group && group.querySelector(":scope > .rows > ol.bibliodetails");
        if (!list || target.parentNode === list) return;
        rememberMove(target);
        list.appendChild(target);
    }

    function applyOneFieldRule(rule, index) {
        if (!rule || rule.enabled === false || !cleanText(rule.selector)) return;
        const roots = targetRootsForRule(rule);
        roots.forEach(function (root) {
            safeQueryAll(root, rule.selector).forEach(function (target) {
                if (!target || target.closest("#pmk-config-overlay")) return;
                state.touchedNodes.add(target);

                if (rule.visible === false) target.classList.add("pmk-md-hidden");
                if (rule.hideWhenEmpty === true && isEffectivelyEmpty(target)) target.classList.add("pmk-md-hidden");

                applyLabelReplacement(target, rule);

                if (rule.emphasis === "muted") target.classList.add("pmk-md-field-muted");
                if (rule.emphasis === "accent") target.classList.add("pmk-md-field-accent");
                if (rule.highlight === true) target.classList.add("pmk-md-field-highlight");

                moveTargetToGroup(target, rule);

                const order = Number(rule.order);
                if (Number.isFinite(order) && order > 0 && target.matches("li")) {
                    target.setAttribute("data-pmk-md-order", String(order));
                    target.setAttribute("data-pmk-md-rule-index", String(index));
                }
            });
        });
    }

    function applyConfiguredOrder() {
        const lists = new Set();
        state.touchedNodes.forEach(function (node) {
            if (node && node.matches && node.matches("li") && node.parentElement && node.parentElement.matches("ol.bibliodetails")) {
                lists.add(node.parentElement);
            }
        });

        lists.forEach(function (list) {
            const children = Array.from(list.children);
            const ordered = children.filter(function (child) {
                return child.hasAttribute("data-pmk-md-order");
            }).sort(function (a, b) {
                const ao = Number(a.getAttribute("data-pmk-md-order")) || 9999;
                const bo = Number(b.getAttribute("data-pmk-md-order")) || 9999;
                if (ao !== bo) return ao - bo;
                const ai = Number(a.getAttribute("data-pmk-md-rule-index")) || 0;
                const bi = Number(b.getAttribute("data-pmk-md-rule-index")) || 0;
                return ai - bi;
            });

            ordered.forEach(function (node) {
                const wanted = Math.max(0, (Number(node.getAttribute("data-pmk-md-order")) || 1) - 1);
                const reference = list.children[wanted] || null;
                if (reference === node) return;
                rememberMove(node);
                list.insertBefore(node, reference);
            });
        });
    }

    function applyFieldRules(config) {
        const rules = Array.isArray(config.fieldRules) ? config.fieldRules : [];
        rules.forEach(applyOneFieldRule);
        applyConfiguredOrder();
    }

    function applyBarcodeHighlight(config) {
        const highlight = config.highlight || {};
        if (highlight.enabled === false) return;
        const storageKey = cleanText(highlight.storageKey) || "searchbox_value";
        let value = "";
        try {
            value = cleanText(window.localStorage.getItem(storageKey));
        } catch (_) {
            value = "";
        }
        if (!value) return;

        const normalized = value.toLowerCase();
        const item = state.items.find(function (container) {
            const heading = container.querySelector(':scope > h3[id^="item"]');
            return heading && cleanText(heading.textContent).toLowerCase().includes(normalized);
        });
        if (!item) return;

        item.classList.add("pmk-md-item-highlight");
        state.touchedNodes.add(item);
        if (highlight.scrollIntoView === true) {
            window.setTimeout(function () {
                item.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 0);
        }
    }

    function moveCatalogueInfoNow(config) {
        const info = config.catalogueInfo || {};
        if (info.enabled === false || !state.biblioSection) return false;
        const selector = cleanText(info.selector) || ".catalogue-info";
        let block = null;
        try {
            block = document.querySelector(selector);
        } catch (_) {
            return false;
        }
        if (!block || state.biblioSection.contains(block)) return Boolean(block);

        const list = state.biblioSection.querySelector("ol.bibliodetails");
        if (!list) return false;
        rememberMove(block);
        list.insertAdjacentElement("afterend", block);
        return true;
    }

    function monitorCatalogueInfo(config) {
        const info = config.catalogueInfo || {};
        if (info.enabled === false) return;
        if (moveCatalogueInfoNow(config)) return;

        const waitMs = clampInteger(info.waitMs, 0, 30000, 5000);
        if (waitMs <= 0) return;

        state.catalogueObserver = new MutationObserver(function () {
            if (moveCatalogueInfoNow(config) && state.catalogueObserver) {
                state.catalogueObserver.disconnect();
                state.catalogueObserver = null;
            }
        });
        state.catalogueObserver.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(function () {
            if (state.catalogueObserver) {
                state.catalogueObserver.disconnect();
                state.catalogueObserver = null;
            }
        }, waitMs);
    }

    function applyConfig(config) {
        cleanup();
        state.config = clone(config || DEFAULT_CONFIG);
        if (!isMoreDetailPage() || !pageEnabled(state.config)) return false;

        const structure = identifyStructure();
        if (!structure) return false;

        state.root = structure.root;
        state.biblioSection = structure.biblioSection;
        state.items = structure.items;

        injectStyles(state.config);
        buildCards(state.config);
        applySectionRules(state.config);
        applyFieldRules(state.config);
        applyBarcodeHighlight(state.config);
        monitorCatalogueInfo(state.config);
        state.applied = true;
        return true;
    }

    function diagnoseFieldRules(config) {
        const cfg = config || state.config || DEFAULT_CONFIG;
        const rules = Array.isArray(cfg.fieldRules) ? cfg.fieldRules : [];
        return rules.map(function (rule, index) {
            const roots = targetRootsForRule(rule || {});
            const matches = [];
            roots.forEach(function (root) {
                safeQueryAll(root, cleanText(rule && rule.selector)).forEach(function (target) {
                    const label = findLabelNode(target);
                    matches.push({
                        tag: target.tagName || "",
                        className: target.className || "",
                        currentLabel: label ? cleanText(label.textContent) : ""
                    });
                });
            });
            return {
                index: index,
                enabled: !(rule && rule.enabled === false),
                selector: cleanText(rule && rule.selector),
                scope: cleanText(rule && rule.scope) || "item",
                expectedLabel: rule ? selectedLabel(rule) : "",
                matchCount: matches.length,
                matches: matches.slice(0, 12)
            };
        });
    }

    function mountContextButton() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const heading = document.querySelector("#catalogue_detail_biblio > .page-section h2");
        if (!heading) return;
        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: heading,
            position: "after",
            contextKey: "moredetail-layout",
            context: { sectionId: "elements" }
        });
    }

    async function start() {
        if (!isMoreDetailPage()) return;
        await waitForPMKConfig(6000);

        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            applyConfig(DEFAULT_CONFIG);
            return;
        }

        state.config = await window.PMKConfig.getConfig(MODULE_ID);
        applyConfig(state.config);
        mountContextButton();

        if (typeof window.PMKConfig.subscribe === "function") {
            state.unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (nextConfig) {
                applyConfig(nextConfig);
                mountContextButton();
            });
        }
    }

    function boot() {
        registerVisualEditorAdapter();
        registerModule();
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", start, { once: true });
        } else {
            start();
        }
    }

    window.PMK011MoreDetail = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        pagePath: pagePath,
        moduleDefinition: moduleDefinition,
        pickElement: visualElementPicker,
        apply: function (config) {
            return applyConfig(config || state.config || DEFAULT_CONFIG);
        },
        diagnoseFieldRules: function () {
            return diagnoseFieldRules(state.config || DEFAULT_CONFIG);
        },
        cleanup: cleanup,
        refresh: function () {
            return applyConfig(state.config || DEFAULT_CONFIG);
        },
        getState: function () {
            return {
                applied: state.applied,
                itemCount: state.items.length,
                page: isMoreDetailPage()
            };
        }
    };

    boot();
})();
