/*
 * 103-detail-reservations-summary-style.js
 * PimpMyKoha — module autonome
 *
 * Nom fonctionnel :
 *   FR : Mise en forme conditionnelle — Réservations et listes
 *   EN : Conditional formatting — Holds and lists
 *
 * Objet :
 *   - conserver le rendu historique du 103 sur catalogue/detail.pl ;
 *   - regrouper et mettre en forme les blocs Réservations / Cours / Listes ;
 *   - permettre l'ajout de règles supplémentaires du même type ;
 *   - mettre en évidence le compteur de réservations ;
 *   - NE PLUS gérer la couleur des lignes du tableau d'exemplaires :
 *     cette responsabilité appartient au module 033.
 *
 * Le rendu historique est la configuration par défaut pour toutes les
 * installations, pas un preset spécifique Dracénie.
 */
(function () {
    "use strict";

    const MODULE_ID = "detail-reservations-summary-style";
    const SCHEMA_VERSION = 3;
    const DETAIL_PATH = "/cgi-bin/koha/catalogue/detail.pl";
    const SUMMARY_SELECTOR = "span.results_summary";
    const DESTINATION_SELECTOR = ".catalogue-info";

    let registered = false;
    let booted = false;
    let currentConfig = null;
    let observer = null;
    let reapplyTimer = null;
    let applying = false;

    const movedElements = new Map();
    const originalLabels = new Map();
    const countTargets = new Map();
    const generatedWrappers = new Set();

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function cleanText(value) {
        return String(value == null ? "" : value).trim();
    }

    function normalizeText(value) {
        return cleanText(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .toLowerCase();
    }

    function clampNumber(value, fallback, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function safeCssSelector(selector, fallback) {
        const candidate = cleanText(selector) || fallback;
        try {
            document.querySelector(candidate);
            return candidate;
        } catch (_) {
            return fallback;
        }
    }

    function slug(value, fallback) {
        const normalized = normalizeText(value)
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return normalized || fallback;
    }

    function detectLanguage() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
                const lang = window.PMKConfig.getLanguage();
                if (lang === "en") return "en";
            }
        } catch (_) {}
        const htmlLang = cleanText(document.documentElement && document.documentElement.lang).toLowerCase();
        return htmlLang.indexOf("en") === 0 ? "en" : "fr";
    }

    function isDetailPage() {
        return window.location && window.location.pathname === DETAIL_PATH;
    }

    const DEFAULT_CONFIG = {
        enabled: true,
        page: {
            enabled: true,
            path: DETAIL_PATH
        },
        placement: {
            destinationSelector: DESTINATION_SELECTOR,
            summarySelector: SUMMARY_SELECTOR,
            mode: "append"
        },
        appearance: {
            borderRadiusPx: 5,
            paddingPx: 10,
            fontSizePx: 16,
            marginTopPx: 10,
            uppercase: true,
            centerContent: true
        },
        blocks: [
            {
                id: "reservations",
                enabled: true,
                adminLabelFr: "Réservations",
                adminLabelEn: "Holds",
                matchMode: "contains",
                matchFr: "Réservations",
                matchEn: "Holds",
                selector: "",
                replacementLabelFr: "",
                replacementLabelEn: "",
                backgroundColor: "#32cd32",
                backgroundOpacity: 0.5,
                customTextColor: false,
                textColor: "#212529"
            },
            {
                id: "courses",
                enabled: true,
                adminLabelFr: "Cours / liste d'exemplaires",
                adminLabelEn: "Courses / item list",
                matchMode: "contains",
                matchFr: "Cours ayant réservé ce titre",
                matchEn: "Courses reserving this title",
                selector: "",
                replacementLabelFr: "Est présent dans la liste d'exemplaire : ",
                replacementLabelEn: "Included in an item list: ",
                backgroundColor: "#87cefa",
                backgroundOpacity: 0.5,
                customTextColor: false,
                textColor: "#212529"
            },
            {
                id: "lists",
                enabled: true,
                adminLabelFr: "Listes contenant ce titre",
                adminLabelEn: "Lists containing this title",
                matchMode: "contains",
                matchFr: "Listes contenant ce titre",
                matchEn: "Lists containing this title",
                selector: "",
                replacementLabelFr: "",
                replacementLabelEn: "",
                backgroundColor: "#fa4848",
                backgroundOpacity: 0.5,
                customTextColor: false,
                textColor: "#212529"
            }
        ],
        countHighlight: {
            enabled: true,
            primarySelector: ".number_box a",
            fallbackSelector: 'a[href*="/cgi-bin/koha/reserve/request.pl?biblionumber="]',
            warningFrom: 3,
            criticalFrom: 4,
            warningColor: "#ffa500",
            criticalColor: "#ff0000",
            bold: false
        },
        advanced: {
            watchDynamicContent: true,
            waitMs: 3500
        }
    };

    function normalizeBlock(block, index) {
        const source = block && typeof block === "object" ? block : {};
        const fallbackLabel = cleanText(source.adminLabelFr || source.adminLabelEn || source.matchFr || source.matchEn);
        return {
            id: cleanText(source.id) || slug(fallbackLabel, "rule-" + (index + 1)),
            enabled: source.enabled !== false,
            adminLabelFr: cleanText(source.adminLabelFr) || fallbackLabel || ("Règle " + (index + 1)),
            adminLabelEn: cleanText(source.adminLabelEn) || cleanText(source.adminLabelFr) || fallbackLabel || ("Rule " + (index + 1)),
            matchMode: ["contains", "exact", "regex"].includes(source.matchMode) ? source.matchMode : "contains",
            matchFr: cleanText(source.matchFr),
            matchEn: cleanText(source.matchEn),
            selector: cleanText(source.selector),
            replacementLabelFr: source.replacementLabelFr == null ? "" : String(source.replacementLabelFr),
            replacementLabelEn: source.replacementLabelEn == null ? "" : String(source.replacementLabelEn),
            backgroundColor: cleanText(source.backgroundColor) || "#ffffff",
            backgroundOpacity: clampNumber(source.backgroundOpacity, 1, 0, 1),
            customTextColor: source.customTextColor === true,
            textColor: cleanText(source.textColor) || "#212529"
        };
    }

    function normalize(config) {
        const src = config && typeof config === "object" ? clone(config) : {};
        const merged = clone(DEFAULT_CONFIG);

        if (typeof src.enabled === "boolean") merged.enabled = src.enabled;

        merged.page = Object.assign({}, merged.page, src.page || {});
        merged.page.enabled = merged.page.enabled !== false;
        merged.page.path = cleanText(merged.page.path) || DETAIL_PATH;

        merged.placement = Object.assign({}, merged.placement, src.placement || {});
        merged.placement.destinationSelector = cleanText(merged.placement.destinationSelector) || DESTINATION_SELECTOR;
        merged.placement.summarySelector = cleanText(merged.placement.summarySelector) || SUMMARY_SELECTOR;
        merged.placement.mode = merged.placement.mode === "prepend" ? "prepend" : "append";

        merged.appearance = Object.assign({}, merged.appearance, src.appearance || {});
        merged.appearance.borderRadiusPx = clampNumber(merged.appearance.borderRadiusPx, 5, 0, 50);
        merged.appearance.paddingPx = clampNumber(merged.appearance.paddingPx, 10, 0, 60);
        merged.appearance.fontSizePx = clampNumber(merged.appearance.fontSizePx, 16, 8, 48);
        merged.appearance.marginTopPx = clampNumber(merged.appearance.marginTopPx, 10, 0, 60);
        merged.appearance.uppercase = merged.appearance.uppercase !== false;
        merged.appearance.centerContent = merged.appearance.centerContent !== false;

        if (Array.isArray(src.blocks)) {
            merged.blocks = src.blocks.map(normalizeBlock);
        } else {
            merged.blocks = merged.blocks.map(normalizeBlock);
        }

        merged.countHighlight = Object.assign({}, merged.countHighlight, src.countHighlight || {});
        merged.countHighlight.enabled = merged.countHighlight.enabled !== false;
        merged.countHighlight.primarySelector = cleanText(merged.countHighlight.primarySelector) || ".number_box a";
        merged.countHighlight.fallbackSelector = cleanText(merged.countHighlight.fallbackSelector) ||
            'a[href*="/cgi-bin/koha/reserve/request.pl?biblionumber="]';
        merged.countHighlight.warningFrom = clampNumber(merged.countHighlight.warningFrom, 3, 0, 9999);
        merged.countHighlight.criticalFrom = clampNumber(merged.countHighlight.criticalFrom, 4, 0, 9999);
        if (merged.countHighlight.criticalFrom < merged.countHighlight.warningFrom) {
            merged.countHighlight.criticalFrom = merged.countHighlight.warningFrom;
        }
        merged.countHighlight.warningColor = cleanText(merged.countHighlight.warningColor) || "#ffa500";
        merged.countHighlight.criticalColor = cleanText(merged.countHighlight.criticalColor) || "#ff0000";
        merged.countHighlight.bold = merged.countHighlight.bold === true;

        merged.advanced = Object.assign({}, merged.advanced, src.advanced || {});
        merged.advanced.watchDynamicContent = merged.advanced.watchDynamicContent !== false;
        merged.advanced.waitMs = clampNumber(merged.advanced.waitMs, 3500, 0, 15000);

        return merged;
    }

    function validate(config) {
        const lang = detectLanguage();
        const fail = function (fr, en) {
            return { ok: false, message: lang === "en" ? en : fr };
        };

        const cfg = normalize(config);

        if (!cfg.page.path) {
            return fail("La page Koha doit être définie.", "The Koha page must be defined.");
        }
        if (!cfg.placement.destinationSelector) {
            return fail("La zone de destination doit être définie.", "The destination area must be defined.");
        }
        if (!cfg.placement.summarySelector) {
            return fail("Le sélecteur des résumés Koha doit être défini.", "The Koha summary selector must be defined.");
        }
        if (!Array.isArray(cfg.blocks)) {
            return fail("La liste des règles est invalide.", "The rule list is invalid.");
        }

        const ids = new Set();
        for (let i = 0; i < cfg.blocks.length; i += 1) {
            const rule = cfg.blocks[i];
            if (!rule || rule.enabled === false) continue;
            if (!rule.id || ids.has(rule.id)) {
                return fail(
                    "Chaque règle active doit avoir un identifiant unique.",
                    "Each enabled rule must have a unique identifier."
                );
            }
            ids.add(rule.id);
            if (!rule.selector && !rule.matchFr && !rule.matchEn) {
                return fail(
                    "Chaque règle active doit avoir un sélecteur ou un texte à reconnaître.",
                    "Each enabled rule must have a selector or matching text."
                );
            }
            if (rule.matchMode === "regex") {
                const patterns = [rule.matchFr, rule.matchEn].filter(Boolean);
                for (const pattern of patterns) {
                    try { new RegExp(pattern, "i"); }
                    catch (_) {
                        return fail(
                            "Une expression régulière du module 103 n'est pas valide.",
                            "One of module 103 regular expressions is invalid."
                        );
                    }
                }
            }
        }

        if (cfg.countHighlight.criticalFrom < cfg.countHighlight.warningFrom) {
            return fail(
                "Le seuil rouge doit être supérieur ou égal au seuil orange.",
                "The red threshold must be greater than or equal to the orange threshold."
            );
        }

        return { ok: true };
    }

    function blockItemTitle(item, index, lang) {
        if (!item) return (lang === "en" ? "Rule " : "Règle ") + (index + 1);
        return cleanText(lang === "en" ? item.adminLabelEn : item.adminLabelFr) ||
            cleanText(item.id) ||
            ((lang === "en" ? "Rule " : "Règle ") + (index + 1));
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: SCHEMA_VERSION,
            name: {
                fr: "Mise en forme conditionnelle — Réservations et listes",
                en: "Conditional formatting — Holds and lists"
            },
            description: {
                fr: "Met en forme et regroupe sur la notice les résumés Réservations, Cours et Listes, avec mise en évidence configurable du nombre de réservations. Le rendu historique du 103 est fourni par défaut. Le tableau des exemplaires reste géré par le 033.",
                en: "Formats and groups Holds, Courses and Lists summaries on the record detail page, with configurable hold-count highlighting. Legacy module 103 styling is the default. Item-table styling remains handled by module 033."
            },
            category: {
                fr: "Réservations & transferts",
                en: "Holds & transfers"
            },
            supportedPages: [DETAIL_PATH],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalize,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    description: {
                        fr: "Le module est autonome. Sa désactivation restaure la présentation Koha sans toucher au tableau des exemplaires.",
                        en: "This module is standalone. Disabling it restores Koha presentation without changing the item table."
                    },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Activer le module", en: "Enable module" }
                        },
                        {
                            key: "page.enabled",
                            type: "boolean",
                            label: { fr: "Activer sur la page détail de notice", en: "Enable on record detail page" }
                        },
                        {
                            key: "page.path",
                            type: "readonly",
                            advanced: true,
                            label: { fr: "Page Koha", en: "Koha page" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "appearance",
                    label: { fr: "Rendu visuel", en: "Visual appearance" },
                    description: {
                        fr: "Ces valeurs reproduisent exactement la logique visuelle historique du 103 : 5 px d'arrondi, 10 px de marge intérieure, texte 16 px centré et en majuscules.",
                        en: "These defaults reproduce legacy module 103 styling: 5 px radius, 10 px padding, centered 16 px uppercase text."
                    },
                    fields: [
                        {
                            key: "appearance.borderRadiusPx",
                            type: "number",
                            min: 0,
                            max: 50,
                            label: { fr: "Arrondi des blocs (px)", en: "Block radius (px)" }
                        },
                        {
                            key: "appearance.paddingPx",
                            type: "number",
                            min: 0,
                            max: 60,
                            label: { fr: "Marge intérieure (px)", en: "Inner padding (px)" }
                        },
                        {
                            key: "appearance.fontSizePx",
                            type: "number",
                            min: 8,
                            max: 48,
                            label: { fr: "Taille du texte (px)", en: "Text size (px)" }
                        },
                        {
                            key: "appearance.marginTopPx",
                            type: "number",
                            min: 0,
                            max: 60,
                            label: { fr: "Marge supérieure (px)", en: "Top margin (px)" }
                        },
                        {
                            key: "appearance.uppercase",
                            type: "boolean",
                            label: { fr: "Afficher en majuscules", en: "Use uppercase text" }
                        },
                        {
                            key: "appearance.centerContent",
                            type: "boolean",
                            label: { fr: "Centrer le contenu", en: "Center content" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "blocks",
                    label: { fr: "Réservations, cours et listes", en: "Holds, courses and lists" },
                    description: {
                        fr: "Les trois premières règles sont les réglages historiques du 103. Tu peux les modifier, les réordonner, les désactiver ou ajouter d'autres blocs de même nature.",
                        en: "The first three rules are legacy module 103 defaults. They can be edited, reordered, disabled, or extended with additional summary rules."
                    },
                    fields: [
                        {
                            key: "blocks",
                            type: "repeater",
                            label: { fr: "Règles de mise en forme", en: "Formatting rules" },
                            addLabel: { fr: "Ajouter une règle", en: "Add rule" },
                            emptyLabel: { fr: "Aucune règle configurée.", en: "No rule configured." },
                            reorder: true,
                            removable: true,
                            itemTitle: blockItemTitle,
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: { fr: "Activer cette règle", en: "Enable this rule" }
                                },
                                {
                                    key: "adminLabelFr",
                                    type: "text",
                                    label: { fr: "Nom de la règle — français", en: "Rule name — French" }
                                },
                                {
                                    key: "adminLabelEn",
                                    type: "text",
                                    label: { fr: "Nom de la règle — anglais", en: "Rule name — English" }
                                },
                                {
                                    key: "matchMode",
                                    type: "select",
                                    label: { fr: "Mode de reconnaissance", en: "Matching mode" },
                                    options: [
                                        { value: "contains", label: { fr: "Le texte contient", en: "Text contains" } },
                                        { value: "exact", label: { fr: "Le texte correspond", en: "Exact text" } },
                                        { value: "regex", label: { fr: "Expression régulière", en: "Regular expression" } }
                                    ]
                                },
                                {
                                    key: "matchFr",
                                    type: "text",
                                    label: { fr: "Texte reconnu — français", en: "Matching text — French" }
                                },
                                {
                                    key: "matchEn",
                                    type: "text",
                                    label: { fr: "Texte reconnu — anglais", en: "Matching text — English" }
                                },
                                {
                                    key: "replacementLabelFr",
                                    type: "text",
                                    label: { fr: "Nouveau libellé français (vide = conserver)", en: "French replacement label (blank = keep)" }
                                },
                                {
                                    key: "replacementLabelEn",
                                    type: "text",
                                    label: { fr: "Nouveau libellé anglais (vide = conserver)", en: "English replacement label (blank = keep)" }
                                },
                                {
                                    key: "backgroundColor",
                                    type: "color",
                                    label: { fr: "Couleur de fond", en: "Background color" }
                                },
                                {
                                    key: "backgroundOpacity",
                                    type: "number",
                                    min: 0,
                                    max: 1,
                                    step: 0.05,
                                    label: { fr: "Opacité du fond (0 à 1)", en: "Background opacity (0 to 1)" }
                                },
                                {
                                    key: "customTextColor",
                                    type: "boolean",
                                    refreshOnChange: true,
                                    label: { fr: "Forcer une couleur de texte", en: "Force a text color" }
                                },
                                {
                                    key: "textColor",
                                    type: "color",
                                    label: { fr: "Couleur du texte", en: "Text color" },
                                    when: function (root, path) {
                                        const index = path[path.length - 2];
                                        return Boolean(root.blocks && root.blocks[index] && root.blocks[index].customTextColor);
                                    }
                                },
                                {
                                    key: "selector",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Sélecteur CSS prioritaire", en: "Priority CSS selector" },
                                    help: {
                                        fr: "Optionnel. S'il correspond à un résumé Koha, il est utilisé avant la reconnaissance par texte.",
                                        en: "Optional. When it matches a Koha summary, it is used before text matching."
                                    }
                                },
                                {
                                    key: "id",
                                    type: "readonly",
                                    advanced: true,
                                    label: { fr: "Identifiant interne", en: "Internal identifier" }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "count",
                    label: { fr: "Nombre de réservations", en: "Hold count" },
                    description: {
                        fr: "Par défaut : 3 réservations = orange ; à partir de 4 = rouge. En dessous de 3, Koha conserve son apparence normale.",
                        en: "Default: 3 holds = orange; 4 or more = red. Below 3, Koha keeps its normal appearance."
                    },
                    fields: [
                        {
                            key: "countHighlight.enabled",
                            type: "boolean",
                            label: { fr: "Mettre en évidence le compteur", en: "Highlight hold count" }
                        },
                        {
                            key: "countHighlight.warningFrom",
                            type: "number",
                            min: 0,
                            max: 9999,
                            label: { fr: "Seuil orange à partir de", en: "Orange threshold from" }
                        },
                        {
                            key: "countHighlight.warningColor",
                            type: "color",
                            label: { fr: "Couleur du premier seuil", en: "First threshold color" }
                        },
                        {
                            key: "countHighlight.criticalFrom",
                            type: "number",
                            min: 0,
                            max: 9999,
                            label: { fr: "Seuil rouge à partir de", en: "Red threshold from" }
                        },
                        {
                            key: "countHighlight.criticalColor",
                            type: "color",
                            label: { fr: "Couleur du second seuil", en: "Second threshold color" }
                        },
                        {
                            key: "countHighlight.bold",
                            type: "boolean",
                            label: { fr: "Afficher le compteur en gras", en: "Display count in bold" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "advanced",
                    label: { fr: "Ciblage avancé", en: "Advanced targeting" },
                    fields: [
                        {
                            key: "placement.destinationSelector",
                            type: "text",
                            advanced: true,
                            label: { fr: "Zone de destination", en: "Destination area" }
                        },
                        {
                            key: "placement.summarySelector",
                            type: "text",
                            advanced: true,
                            label: { fr: "Résumés Koha analysés", en: "Koha summaries to inspect" }
                        },
                        {
                            key: "placement.mode",
                            type: "select",
                            advanced: true,
                            label: { fr: "Insertion dans la destination", en: "Insertion in destination" },
                            options: [
                                { value: "append", label: { fr: "À la fin", en: "At the end" } },
                                { value: "prepend", label: { fr: "Au début", en: "At the beginning" } }
                            ]
                        },
                        {
                            key: "countHighlight.primarySelector",
                            type: "text",
                            advanced: true,
                            label: { fr: "Sélecteur principal du compteur", en: "Primary count selector" }
                        },
                        {
                            key: "countHighlight.fallbackSelector",
                            type: "text",
                            advanced: true,
                            label: { fr: "Sélecteur de secours du compteur", en: "Fallback count selector" }
                        },
                        {
                            key: "advanced.watchDynamicContent",
                            type: "boolean",
                            advanced: true,
                            label: { fr: "Détecter les résumés ajoutés dynamiquement", en: "Detect dynamically added summaries" }
                        },
                        {
                            key: "advanced.waitMs",
                            type: "number",
                            min: 0,
                            max: 15000,
                            advanced: true,
                            label: { fr: "Attente maximale initiale (ms)", en: "Initial maximum wait (ms)" }
                        }
                    ]
                }
            ]
        };
    }

    function hexToRgba(hex, alpha) {
        const raw = cleanText(hex).replace("#", "");
        if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) {
            return "rgba(255,255,255," + alpha + ")";
        }
        const normalized = raw.length === 3
            ? raw.split("").map(function (c) { return c + c; }).join("")
            : raw;
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }

    function getRulePatterns(rule, lang) {
        const first = lang === "en" ? rule.matchEn : rule.matchFr;
        const second = lang === "en" ? rule.matchFr : rule.matchEn;
        return [first, second].map(cleanText).filter(Boolean);
    }

    function matchesRule(element, rule, lang) {
        if (!element || !rule || rule.enabled === false) return false;

        if (rule.selector) {
            try {
                if (element.matches(rule.selector) || element.querySelector(rule.selector)) return true;
            } catch (_) {}
        }

        const text = cleanText(element.textContent);
        const normalized = normalizeText(text);
        const patterns = getRulePatterns(rule, lang);
        if (!patterns.length) return false;

        if (rule.matchMode === "regex") {
            return patterns.some(function (pattern) {
                try { return new RegExp(pattern, "i").test(text); }
                catch (_) { return false; }
            });
        }

        if (rule.matchMode === "exact") {
            return patterns.some(function (pattern) {
                return normalized === normalizeText(pattern);
            });
        }

        return patterns.some(function (pattern) {
            return normalized.indexOf(normalizeText(pattern)) !== -1;
        });
    }

    function restorePreviousRun() {
        applying = true;
        try {
            countTargets.forEach(function (previous, element) {
                if (!element || !element.style) return;
                element.style.color = previous.color;
                element.style.fontWeight = previous.fontWeight;
                element.removeAttribute("data-pmk103-count");
            });
            countTargets.clear();

            originalLabels.forEach(function (originalText, label) {
                if (label && label.isConnected) label.textContent = originalText;
            });
            originalLabels.clear();

            movedElements.forEach(function (placeholder, element) {
                if (!element) return;
                element.classList.remove("pmk103-summary");
                element.removeAttribute("data-pmk103-managed");
                if (placeholder && placeholder.parentNode) {
                    placeholder.parentNode.insertBefore(element, placeholder);
                    placeholder.remove();
                }
            });
            movedElements.clear();

            generatedWrappers.forEach(function (wrapper) {
                if (wrapper && wrapper.parentNode) wrapper.remove();
            });
            generatedWrappers.clear();

            const style = document.getElementById("pmk103-style");
            if (style) style.remove();
        } finally {
            applying = false;
        }
    }

    function injectStyles(cfg) {
        const old = document.getElementById("pmk103-style");
        if (old) old.remove();

        const a = cfg.appearance;
        const style = document.createElement("style");
        style.id = "pmk103-style";
        style.textContent = [
            ".pmk103-block{",
            "position:relative;",
            "border-radius:" + a.borderRadiusPx + "px;",
            "}",
            ".pmk103-block .pmk103-summary{",
            "padding:" + a.paddingPx + "px;",
            "border-radius:" + a.borderRadiusPx + "px;",
            "display:flex;",
            "align-items:center;",
            a.centerContent ? "justify-content:center;" : "",
            "font-size:" + a.fontSizePx + "px;",
            a.uppercase ? "text-transform:uppercase;" : "text-transform:none;",
            "margin-top:" + a.marginTopPx + "px;",
            "}",
            ".pmk103-block > .pmk-context-config{",
            "position:absolute;",
            "top:2px;",
            "right:2px;",
            "z-index:2;",
            "opacity:.38;",
            "padding:.15rem .3rem;",
            "line-height:1;",
            "}",
            ".pmk103-block > .pmk-context-config:hover,",
            ".pmk103-block > .pmk-context-config:focus{opacity:1;}"
        ].join("");
        document.head.appendChild(style);
    }

    function replacementForRule(rule, lang) {
        return cleanText(lang === "en" ? rule.replacementLabelEn : rule.replacementLabelFr);
    }

    function applyBlocks(cfg) {
        const destinationSelector = safeCssSelector(cfg.placement.destinationSelector, DESTINATION_SELECTOR);
        const summarySelector = safeCssSelector(cfg.placement.summarySelector, SUMMARY_SELECTOR);
        const destination = document.querySelector(destinationSelector);
        if (!destination) return 0;

        const candidates = Array.from(document.querySelectorAll(summarySelector))
            .filter(function (el) {
                return !el.closest(".pmk103-block");
            });

        if (!candidates.length) return 0;

        const lang = detectLanguage();
        const used = new Set();
        const wrappers = [];

        cfg.blocks.forEach(function (rule) {
            if (!rule || rule.enabled === false) return;

            const matches = candidates.filter(function (element) {
                return !used.has(element) && matchesRule(element, rule, lang);
            });
            if (!matches.length) return;

            const wrapper = document.createElement("div");
            wrapper.className = "pmk103-block pmk103-block-" + slug(rule.id, "rule");
            wrapper.setAttribute("data-pmk103-rule", rule.id);
            wrapper.style.backgroundColor = hexToRgba(rule.backgroundColor, rule.backgroundOpacity);
            wrapper.style.borderRadius = cfg.appearance.borderRadiusPx + "px";
            if (rule.customTextColor) wrapper.style.color = rule.textColor;

            matches.forEach(function (element) {
                used.add(element);

                const placeholder = document.createComment("pmk103:" + rule.id);
                if (element.parentNode) {
                    element.parentNode.insertBefore(placeholder, element);
                    movedElements.set(element, placeholder);
                }

                const label = element.querySelector(".label");
                const replacement = replacementForRule(rule, lang);
                if (label && replacement) {
                    if (!originalLabels.has(label)) originalLabels.set(label, label.textContent);
                    label.textContent = replacement;
                }

                element.classList.add("pmk103-summary");
                element.setAttribute("data-pmk103-managed", rule.id);
                wrapper.appendChild(element);
            });

            generatedWrappers.add(wrapper);
            wrappers.push(wrapper);
        });

        if (!wrappers.length) return 0;

        if (cfg.placement.mode === "prepend") {
            for (let i = wrappers.length - 1; i >= 0; i -= 1) {
                destination.insertBefore(wrappers[i], destination.firstChild);
            }
        } else {
            wrappers.forEach(function (wrapper) {
                destination.appendChild(wrapper);
            });
        }

        mountContextButton(wrappers[0]);
        return wrappers.length;
    }

    function parseCount(element) {
        if (!element) return NaN;

        const dataCandidates = [
            element.getAttribute("data-count"),
            element.getAttribute("data-holds-count"),
            element.getAttribute("data-reservations-count")
        ];
        for (const value of dataCandidates) {
            const n = Number(value);
            if (Number.isFinite(n)) return n;
        }

        const text = cleanText(element.textContent);
        if (!text) return NaN;

        const parenthetical = text.match(/\((\d+)\)\s*$/);
        if (parenthetical) return Number(parenthetical[1]);

        const numbers = text.match(/\d+/g);
        if (!numbers || !numbers.length) return NaN;
        return Number(numbers[numbers.length - 1]);
    }

    function findCountTarget(cfg) {
        const selectors = [
            cfg.countHighlight.primarySelector,
            cfg.countHighlight.fallbackSelector
        ].map(cleanText).filter(Boolean);

        for (const selector of selectors) {
            try {
                const elements = Array.from(document.querySelectorAll(selector));
                for (const element of elements) {
                    const count = parseCount(element);
                    if (Number.isFinite(count)) return { element: element, count: count };
                }
            } catch (_) {}
        }
        return null;
    }

    function applyCountHighlight(cfg) {
        if (!cfg.countHighlight.enabled) return false;

        const found = findCountTarget(cfg);
        if (!found) return false;

        const element = found.element;
        const count = found.count;
        const settings = cfg.countHighlight;

        if (!countTargets.has(element)) {
            countTargets.set(element, {
                color: element.style.color || "",
                fontWeight: element.style.fontWeight || ""
            });
        }

        let color = "";
        if (count >= settings.criticalFrom) {
            color = settings.criticalColor;
        } else if (count >= settings.warningFrom) {
            color = settings.warningColor;
        }

        if (!color) return false;

        element.style.color = color;
        if (settings.bold) element.style.fontWeight = "700";
        element.setAttribute("data-pmk103-count", String(count));
        return true;
    }

    function mountContextButton(anchor) {
        try {
            const pmk = window.PMKConfig;
            if (!pmk || typeof pmk.mountContextButton !== "function" || !anchor) return;
            pmk.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                contextKey: "summary",
                position: "inside",
                context: {
                    page: "catalogue.detail",
                    path: DETAIL_PATH
                }
            });
        } catch (_) {}
    }

    function applyConfig(config) {
        if (!isDetailPage()) return;

        const cfg = normalize(config);
        currentConfig = cfg;

        restorePreviousRun();

        if (!cfg.enabled || !cfg.page.enabled || cfg.page.path !== window.location.pathname) {
            stopObserver();
            return;
        }

        applying = true;
        try {
            injectStyles(cfg);
            applyBlocks(cfg);
            applyCountHighlight(cfg);
        } finally {
            applying = false;
        }

        if (cfg.advanced.watchDynamicContent) startObserver();
        else stopObserver();
    }

    function scheduleReapply() {
        if (applying || !currentConfig) return;
        window.clearTimeout(reapplyTimer);
        reapplyTimer = window.setTimeout(function () {
            if (!currentConfig) return;
            applyConfig(currentConfig);
        }, 80);
    }

    function mutationContainsNewSummary(mutation) {
        const summarySelector = safeCssSelector(
            currentConfig && currentConfig.placement && currentConfig.placement.summarySelector,
            SUMMARY_SELECTOR
        );

        for (const node of Array.from(mutation.addedNodes || [])) {
            if (!node || node.nodeType !== 1) continue;
            const element = node;
            if (element.closest && element.closest(".pmk103-block")) continue;
            try {
                if (element.matches(summarySelector) && !element.hasAttribute("data-pmk103-managed")) return true;
                if (element.querySelector && element.querySelector(summarySelector + ":not([data-pmk103-managed])")) return true;
            } catch (_) {}
        }
        return false;
    }

    function startObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(function (mutations) {
            if (applying || !currentConfig) return;
            if (mutations.some(mutationContainsNewSummary)) scheduleReapply();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        window.clearTimeout(reapplyTimer);
        reapplyTimer = null;
    }

    function waitThenApply(config) {
        const cfg = normalize(config);
        if (!isDetailPage()) return;

        const deadline = Date.now() + cfg.advanced.waitMs;

        function attempt() {
            const destinationSelector = safeCssSelector(cfg.placement.destinationSelector, DESTINATION_SELECTOR);
            const summarySelector = safeCssSelector(cfg.placement.summarySelector, SUMMARY_SELECTOR);
            const destination = document.querySelector(destinationSelector);
            const summaries = document.querySelectorAll(summarySelector);

            if (destination && summaries.length) {
                applyConfig(cfg);
                return;
            }

            if (Date.now() < deadline) {
                window.setTimeout(attempt, 100);
            } else {
                applyConfig(cfg);
            }
        }

        attempt();
    }

    function subscribeToConfig(pmk) {
        if (!pmk || typeof pmk.subscribe !== "function") return;
        pmk.subscribe(MODULE_ID, function (nextConfig) {
            waitThenApply(nextConfig);
        });
    }

    function bootWithPMK() {
        if (booted) return;
        const pmk = window.PMKConfig;
        if (!pmk || typeof pmk.getConfig !== "function") return;

        booted = true;

        if (!isDetailPage()) return;

        pmk.getConfig(MODULE_ID)
            .then(waitThenApply)
            .catch(function () {
                waitThenApply(DEFAULT_CONFIG);
            });

        subscribeToConfig(pmk);
    }

    function registerWithPMK() {
        if (registered) {
            bootWithPMK();
            return true;
        }

        const pmk = window.PMKConfig;
        if (!pmk || typeof pmk.registerModule !== "function") return false;

        pmk.registerModule(moduleDefinition());
        registered = true;
        bootWithPMK();
        return true;
    }

    function standaloneFallback() {
        if (registered || booted || !isDetailPage()) return;
        waitThenApply(DEFAULT_CONFIG);
    }

    function init() {
        if (registerWithPMK()) return;

        window.addEventListener("pmk:config-ready", function () {
            registerWithPMK();
        }, { once: true });

        // Compatibilité : le script reste utilisable isolément même si le
        // socle PMK n'est pas présent. Le rendu historique est alors appliqué.
        window.setTimeout(standaloneFallback, 700);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
