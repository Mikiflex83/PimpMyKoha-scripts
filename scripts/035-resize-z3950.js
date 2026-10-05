/*
 Nom du fichier : 035-resize-z3950.js
 Dépendances : 000-pmk-config-firestore.js 0.4.19+ recommandé (facultatif : valeurs par défaut intégrées)
 Date de dernière modification : 2026-09-17
 Version : 2.0.0-preplugin
 Auteur : Michael Mundet / refonte PimpMyKoha
 Description : Améliore le confort de la recherche Z39.50/SRU : hauteur adaptative,
               redimensionnement optionnel de la fenêtre et normalisation configurable
               des termes de recherche. Prépare un service de normalisation réutilisable
               par le futur module 048 sans modifier les données de Koha.
*/
(function () {
    "use strict";

    const MODULE_ID = "z3950-workspace";
    const MODULE_VERSION = "2.1.0-preplugin";
    const PAGE_PATH = "/cgi-bin/koha/cataloguing/z3950_search.pl";
    const STYLE_ID = "pmk035-z3950-style";
    const CONTEXT_KEY = "z3950-workspace-main";

    const DEFAULTS = {
        enabled: true,
        pages: [
            {
                id: "cataloguing.z3950-search",
                enabled: true,
                path: PAGE_PATH
            }
        ],
        layout: {
            enabled: true,
            adaptiveHeight: true,
            heightRatio: 0.75,
            minHeight: 260,
            maxHeight: 900,
            compactBreakpoint: 768,
            compactTargetMaxHeight: 320,
            criteriaSelector: "#cat_z3950_search .col-6 fieldset.rows, #cat_z3950_search .col-xs-6 .rows",
            targetsSelector: "#z3950_search_targets"
        },
        windowSizing: {
            enabled: true,
            widthRatio: 0.80,
            heightRatio: 0.80,
            position: "top-left",
            minViewportWidth: 900,
            runOncePerPage: true
        },
        normalization: {
            enabled: true,
            mode: "before-submit",
            normalizePrefilledOnLoad: false,
            trimSpaces: false,
            collapseSpaces: false,
            extraMappings: true,
            fields: [
                { id: "isbn", enabled: true, labelFr: "ISBN", labelEn: "ISBN", selector: "#isbn, input[name='isbn']" },
                { id: "issn", enabled: true, labelFr: "ISSN", labelEn: "ISSN", selector: "#issn, input[name='issn']" },
                { id: "title", enabled: true, labelFr: "Titre", labelEn: "Title", selector: "#title, input[name='title']" },
                { id: "author", enabled: true, labelFr: "Auteur", labelEn: "Author", selector: "#author, input[name='author']" },
                { id: "publicationyear", enabled: true, labelFr: "Année de publication", labelEn: "Publication year", selector: "#publicationyear, input[name='publicationyear']" },
                { id: "subject", enabled: true, labelFr: "Sujet", labelEn: "Subject", selector: "#subject, input[name='subject']" },
                { id: "srchany", enabled: true, labelFr: "Mot-clé", labelEn: "Keyword", selector: "#srchany, input[name='srchany']" },
                { id: "lccall", enabled: true, labelFr: "Cote LC", labelEn: "LC call number", selector: "#lccall, input[name='lccall']" },
                { id: "controlnumber", enabled: true, labelFr: "Numéro de contrôle", labelEn: "Control number", selector: "#controlnumber, input[name='controlnumber']" },
                { id: "dewey", enabled: true, labelFr: "Dewey", labelEn: "Dewey", selector: "#dewey, input[name='dewey']" },
                { id: "stdid", enabled: true, labelFr: "Identifiant standard", labelEn: "Standard ID", selector: "#stdid, input[name='stdid']" }
            ]
        }
    };

    let currentConfig = deepClone(DEFAULTS);
    let resizeHandler = null;
    let submitHandler = null;
    let inputHandler = null;
    let mutationObserver = null;
    let applyTimer = 0;
    let windowSizingAttempted = false;
    const originalInlineStyles = new Map();

    function deepClone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) return Array.isArray(override) ? deepClone(override) : deepClone(base);
        if (!isPlainObject(base)) return override === undefined ? deepClone(base) : deepClone(override);
        const out = deepClone(base) || {};
        if (!isPlainObject(override)) return out;
        Object.keys(override).forEach(function (key) {
            const value = override[key];
            if (Array.isArray(value)) out[key] = deepClone(value);
            else if (isPlainObject(value)) out[key] = deepMerge(isPlainObject(out[key]) ? out[key] : {}, value);
            else out[key] = value;
        });
        return out;
    }

    function clampNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function normalizeConfig(config) {
        const out = deepMerge(DEFAULTS, config || {});
        out.enabled = out.enabled !== false;
        if (!Array.isArray(out.pages)) out.pages = deepClone(DEFAULTS.pages);
        out.layout.heightRatio = clampNumber(out.layout.heightRatio, 0.30, 1, 0.75);
        out.layout.minHeight = Math.max(80, Number(out.layout.minHeight) || 260);
        out.layout.maxHeight = Math.max(out.layout.minHeight, Number(out.layout.maxHeight) || 900);
        out.layout.compactBreakpoint = Math.max(320, Number(out.layout.compactBreakpoint) || 768);
        out.layout.compactTargetMaxHeight = Math.max(100, Number(out.layout.compactTargetMaxHeight) || 320);
        out.windowSizing.widthRatio = clampNumber(out.windowSizing.widthRatio, 0.30, 1, 0.80);
        out.windowSizing.heightRatio = clampNumber(out.windowSizing.heightRatio, 0.30, 1, 0.80);
        out.windowSizing.minViewportWidth = Math.max(320, Number(out.windowSizing.minViewportWidth) || 900);
        if (["none", "top-left", "center"].indexOf(out.windowSizing.position) === -1) out.windowSizing.position = "top-left";
        if (["none", "before-submit", "live"].indexOf(out.normalization.mode) === -1) out.normalization.mode = "before-submit";
        if (!Array.isArray(out.normalization.fields)) out.normalization.fields = deepClone(DEFAULTS.normalization.fields);
        return out;
    }

    function pageEnabled() {
        if (window.location.pathname !== PAGE_PATH) return false;
        const pages = Array.isArray(currentConfig.pages) ? currentConfig.pages : [];
        const page = pages.find(function (entry) {
            return entry && (entry.path === PAGE_PATH || entry.id === "cataloguing.z3950-search");
        });
        return !page || page.enabled !== false;
    }

    function installSharedNormalizationService() {
        if (window.PMKInputNormalization && typeof window.PMKInputNormalization.stripDiacritics === "function") return;

        function stripDiacritics(value, extraMappings) {
            let text = value == null ? "" : String(value);
            if (extraMappings !== false) {
                text = text
                    .replace(/œ/g, "oe").replace(/Œ/g, "OE")
                    .replace(/æ/g, "ae").replace(/Æ/g, "AE")
                    .replace(/ø/g, "o").replace(/Ø/g, "O")
                    .replace(/ð/g, "d").replace(/Ð/g, "D")
                    .replace(/þ/g, "th").replace(/Þ/g, "TH")
                    .replace(/ł/g, "l").replace(/Ł/g, "L");
            }
            try {
                text = text.normalize("NFD");
            } catch (_) {}
            try {
                return text.replace(/\p{M}+/gu, "");
            } catch (_) {
                return text.replace(/[\u0300-\u036f]/g, "");
            }
        }

        function normalizeText(value, options) {
            const opts = options || {};
            let text = stripDiacritics(value, opts.extraMappings);
            if (opts.collapseSpaces === true) text = text.replace(/\s+/g, " ");
            if (opts.trimSpaces === true) text = text.trim();
            return text;
        }

        window.PMKInputNormalization = {
            version: "1.0.0",
            stripDiacritics: stripDiacritics,
            normalizeText: normalizeText
        };
    }

    function normalizeText(value) {
        installSharedNormalizationService();
        return window.PMKInputNormalization.normalizeText(value, {
            extraMappings: currentConfig.normalization.extraMappings !== false,
            trimSpaces: currentConfig.normalization.trimSpaces === true,
            collapseSpaces: currentConfig.normalization.collapseSpaces === true
        });
    }

    function activeFieldRules() {
        if (!currentConfig.normalization || currentConfig.normalization.enabled === false) return [];
        return (Array.isArray(currentConfig.normalization.fields) ? currentConfig.normalization.fields : [])
            .filter(function (rule) {
                return rule && rule.enabled !== false && String(rule.selector || "").trim();
            });
    }

    function collectConfiguredInputs(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const seen = new Set();
        const inputs = [];
        activeFieldRules().forEach(function (rule) {
            let found = [];
            try { found = Array.from(scope.querySelectorAll(rule.selector)); } catch (_) { found = []; }
            found.forEach(function (input) {
                if (!input || seen.has(input)) return;
                if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
                seen.add(input);
                inputs.push(input);
            });
        });
        return inputs;
    }

    function inputMatchesConfiguredRule(input) {
        if (!input || !input.matches) return false;
        return activeFieldRules().some(function (rule) {
            try { return input.matches(rule.selector); } catch (_) { return false; }
        });
    }

    function normalizeInput(input) {
        if (!input || typeof input.value !== "string") return false;
        const before = input.value;
        const after = normalizeText(before);
        if (before === after) return false;

        const canSelect = typeof input.selectionStart === "number" && typeof input.selectionEnd === "number";
        const start = canSelect ? input.selectionStart : null;
        const end = canSelect ? input.selectionEnd : null;
        input.value = after;

        if (canSelect && typeof input.setSelectionRange === "function") {
            try {
                const newStart = normalizeText(before.slice(0, start)).length;
                const newEnd = normalizeText(before.slice(0, end)).length;
                input.setSelectionRange(newStart, newEnd);
            } catch (_) {}
        }
        return true;
    }

    function normalizeAllConfiguredInputs(root) {
        collectConfiguredInputs(root).forEach(normalizeInput);
    }

    function rememberStyle(element) {
        if (!element || originalInlineStyles.has(element)) return;
        originalInlineStyles.set(element, {
            height: element.style.height,
            minHeight: element.style.minHeight,
            maxHeight: element.style.maxHeight,
            overflowY: element.style.overflowY
        });
    }

    function restoreLayout() {
        originalInlineStyles.forEach(function (styles, element) {
            if (!element || !element.style) return;
            element.style.height = styles.height || "";
            element.style.minHeight = styles.minHeight || "";
            element.style.maxHeight = styles.maxHeight || "";
            element.style.overflowY = styles.overflowY || "";
            element.removeAttribute("data-pmk035-layout");
        });
        originalInlineStyles.clear();
    }

    function queryElements(selector) {
        if (!String(selector || "").trim()) return [];
        try { return Array.from(document.querySelectorAll(selector)); } catch (_) { return []; }
    }

    function applyLayout() {
        restoreLayout();
        if (!currentConfig.enabled || !pageEnabled() || currentConfig.layout.enabled === false) return;

        const layout = currentConfig.layout;
        const criteria = queryElements(layout.criteriaSelector);
        const targets = queryElements(layout.targetsSelector);
        const all = [];
        const seen = new Set();
        criteria.concat(targets).forEach(function (element) {
            if (!element || seen.has(element)) return;
            seen.add(element);
            all.push(element);
        });
        if (!all.length) return;

        const compact = window.innerWidth < Number(layout.compactBreakpoint || 768);
        if (compact) {
            criteria.forEach(function (element) {
                rememberStyle(element);
                element.style.height = "auto";
                element.style.minHeight = "";
                element.style.maxHeight = "none";
                element.style.overflowY = "visible";
                element.setAttribute("data-pmk035-layout", "compact-criteria");
            });
            targets.forEach(function (element) {
                rememberStyle(element);
                element.style.height = "auto";
                element.style.minHeight = "";
                element.style.maxHeight = String(layout.compactTargetMaxHeight || 320) + "px";
                element.style.overflowY = "auto";
                element.setAttribute("data-pmk035-layout", "compact-targets");
            });
            return;
        }

        if (layout.adaptiveHeight === false) return;
        const rawHeight = Math.round(window.innerHeight * Number(layout.heightRatio || 0.75));
        const height = Math.min(Number(layout.maxHeight || 900), Math.max(Number(layout.minHeight || 260), rawHeight));
        all.forEach(function (element) {
            rememberStyle(element);
            element.style.height = height + "px";
            element.style.maxHeight = height + "px";
            element.style.overflowY = "auto";
            element.setAttribute("data-pmk035-layout", "adaptive");
        });
    }

    function installStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = [
            "#cat_z3950_search [data-pmk035-layout='adaptive']{box-sizing:border-box;}",
            "#cat_z3950_search .pmk-context-config{vertical-align:middle;}",
            "@media (max-width:767.98px){#cat_z3950_search .row{row-gap:.75rem;}}"
        ].join("\n");
        (document.head || document.documentElement).appendChild(style);
    }

    function maybeResizeWindow() {
        const cfg = currentConfig.windowSizing || {};
        if (!currentConfig.enabled || !pageEnabled() || cfg.enabled === false) return;
        if (cfg.runOncePerPage !== false && windowSizingAttempted) return;
        if (window.innerWidth < Number(cfg.minViewportWidth || 900)) return;

        windowSizingAttempted = true;
        try {
            const availWidth = Number(window.screen && window.screen.availWidth) || Number(window.screen && window.screen.width) || window.innerWidth;
            const availHeight = Number(window.screen && window.screen.availHeight) || Number(window.screen && window.screen.height) || window.innerHeight;
            const width = Math.max(480, Math.round(availWidth * Number(cfg.widthRatio || 0.8)));
            const height = Math.max(420, Math.round(availHeight * Number(cfg.heightRatio || 0.8)));
            window.resizeTo(width, height);

            if (cfg.position === "top-left") {
                window.moveTo(0, 0);
            } else if (cfg.position === "center") {
                const left = Math.max(0, Math.round((availWidth - width) / 2));
                const top = Math.max(0, Math.round((availHeight - height) / 2));
                window.moveTo(left, top);
            }
        } catch (_) {
            /* Le navigateur peut légitimement refuser resizeTo/moveTo. */
        }
    }

    function detachRuntimeListeners() {
        if (resizeHandler) {
            window.removeEventListener("resize", resizeHandler);
            resizeHandler = null;
        }
        if (submitHandler) {
            document.removeEventListener("submit", submitHandler, true);
            submitHandler = null;
        }
        if (inputHandler) {
            document.removeEventListener("input", inputHandler, true);
            inputHandler = null;
        }
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
        }
        window.clearTimeout(applyTimer);
        applyTimer = 0;
    }

    function scheduleApplyLayout() {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(function () {
            applyTimer = 0;
            applyLayout();
            mountContextAccess();
        }, 60);
    }

    function attachRuntimeListeners() {
        detachRuntimeListeners();
        if (!currentConfig.enabled || !pageEnabled()) return;

        resizeHandler = function () { scheduleApplyLayout(); };
        window.addEventListener("resize", resizeHandler, { passive: true });

        const normalization = currentConfig.normalization || {};
        if (normalization.enabled !== false && normalization.mode === "before-submit") {
            submitHandler = function (event) {
                const form = event && event.target;
                if (!form || !form.matches || !form.matches("#cat_z3950_search form[name='f'], #cat_z3950_search form[action*='z3950_search.pl']")) return;
                normalizeAllConfiguredInputs(form);
            };
            document.addEventListener("submit", submitHandler, true);
        }

        if (normalization.enabled !== false && normalization.mode === "live") {
            inputHandler = function (event) {
                const input = event && event.target;
                if (!inputMatchesConfiguredRule(input)) return;
                normalizeInput(input);
            };
            document.addEventListener("input", inputHandler, true);
        }

        mutationObserver = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                if (mutation.type !== "childList" || !mutation.addedNodes || !mutation.addedNodes.length) return false;
                return Array.from(mutation.addedNodes).some(function (node) {
                    if (!node || node.nodeType !== 1) return false;
                    if (node.matches && node.matches("#z3950_search_targets, fieldset.rows, form[name='f']")) return true;
                    return Boolean(node.querySelector && node.querySelector("#z3950_search_targets, fieldset.rows, form[name='f']"));
                });
            });
            if (relevant) scheduleApplyLayout();
        });
        mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    function mountContextAccess() {
        if (!currentConfig.enabled || !pageEnabled()) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = document.querySelector("#cat_z3950_search h1") || document.querySelector("h1");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: CONTEXT_KEY,
                context: { page: "cataloguing.z3950-search", sectionId: "layout" }
            });
        } catch (_) {}
    }

    function newFieldRule() {
        return {
            id: "custom-" + Date.now().toString(36),
            enabled: true,
            labelFr: "Nouveau champ",
            labelEn: "New field",
            selector: ""
        };
    }

    function validateConfig(config) {
        const fail = function (fr, en) {
            const lang = window.PMKConfig && typeof window.PMKConfig.getLanguage === "function" ? window.PMKConfig.getLanguage() : "fr";
            return { ok: false, message: lang === "en" ? en : fr };
        };
        const cfg = normalizeConfig(config);
        if (!Array.isArray(cfg.pages)) return fail("La liste des pages du 035 est invalide.", "Module 035 page list is invalid.");
        if (cfg.layout.heightRatio < 0.30 || cfg.layout.heightRatio > 1) return fail("Le ratio de hauteur doit être compris entre 0,30 et 1.", "Height ratio must be between 0.30 and 1.");
        if (cfg.windowSizing.widthRatio < 0.30 || cfg.windowSizing.widthRatio > 1 || cfg.windowSizing.heightRatio < 0.30 || cfg.windowSizing.heightRatio > 1) {
            return fail("Les ratios de fenêtre doivent être compris entre 0,30 et 1.", "Window ratios must be between 0.30 and 1.");
        }
        const modes = ["none", "before-submit", "live"];
        if (modes.indexOf(cfg.normalization.mode) === -1) return fail("Le mode de normalisation est invalide.", "Normalization mode is invalid.");
        for (let i = 0; i < cfg.normalization.fields.length; i += 1) {
            const field = cfg.normalization.fields[i];
            if (!field || field.enabled === false) continue;
            if (!String(field.selector || "").trim()) return fail("Un champ de normalisation actif n'a pas de cible.", "An enabled normalization field has no target.");
            try { document.createDocumentFragment().querySelector(field.selector); } catch (_) {
                return fail("Un sélecteur de champ du 035 est invalide : " + field.selector, "A module 035 field selector is invalid: " + field.selector);
            }
        }
        return { ok: true };
    }

    function buildModuleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Confort de recherche Z39.50 / SRU", en: "Z39.50 / SRU search workspace" },
            description: {
                fr: "Adapte l'espace de travail Z39.50/SRU à la fenêtre et peut normaliser les termes envoyés aux serveurs externes. Le module ne modifie aucune notice ni donnée Koha.",
                en: "Adapts the Z39.50/SRU workspace to the window and can normalize search terms sent to external servers. The module changes no Koha record or stored data."
            },
            category: { fr: "Catalogage / interface", en: "Cataloging / interface" },
            supportedPages: ["cataloguing.z3950-search"],
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULTS),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation et page", en: "Activation and page" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                        {
                            key: "pages",
                            type: "repeater",
                            reorder: false,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function () { return "Z39.50 / SRU"; },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Actif sur cette page", en: "Enabled on this page" } },
                                { key: "id", type: "readonly", advanced: true, label: { fr: "Identifiant", en: "Identifier" } },
                                { key: "path", type: "readonly", label: { fr: "Chemin Koha", en: "Koha path" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "layout",
                    label: { fr: "Confort d'affichage", en: "Display comfort" },
                    description: {
                        fr: "Sur grand écran, les critères et la liste des serveurs utilisent une part configurable de la hauteur disponible. Sur petite fenêtre, le module revient automatiquement à une présentation plus souple.",
                        en: "On large screens, criteria and target lists use a configurable share of available height. On small windows, the module automatically returns to a more flexible layout."
                    },
                    fields: [
                        { key: "layout.enabled", type: "boolean", label: { fr: "Améliorer la hauteur des zones", en: "Improve panel heights" } },
                        { key: "layout.adaptiveHeight", type: "boolean", label: { fr: "Adapter automatiquement à la hauteur de la fenêtre", en: "Automatically adapt to window height" } },
                        { key: "layout.heightRatio", type: "number", label: { fr: "Part de la hauteur de fenêtre (0,30 à 1)", en: "Share of window height (0.30 to 1)" } },
                        { key: "layout.minHeight", type: "number", label: { fr: "Hauteur minimale (px)", en: "Minimum height (px)" } },
                        { key: "layout.maxHeight", type: "number", label: { fr: "Hauteur maximale (px)", en: "Maximum height (px)" } },
                        { key: "layout.compactBreakpoint", type: "number", advanced: true, label: { fr: "Seuil petite fenêtre (px)", en: "Small-window breakpoint (px)" } },
                        { key: "layout.compactTargetMaxHeight", type: "number", advanced: true, label: { fr: "Hauteur maxi des serveurs sur petite fenêtre (px)", en: "Max target-list height on small windows (px)" } },
                        { key: "layout.criteriaSelector", type: "text", advanced: true, label: { fr: "Cible zone critères", en: "Criteria area target" } },
                        { key: "layout.targetsSelector", type: "text", advanced: true, label: { fr: "Cible liste des serveurs", en: "Target-list target" } }
                    ]
                },
                {
                    type: "section",
                    id: "window",
                    label: { fr: "Fenêtre Z39.50", en: "Z39.50 window" },
                    description: {
                        fr: "Le navigateur peut refuser le redimensionnement, notamment si la page n'est pas une fenêtre ouverte par script ou comporte plusieurs onglets. Le refus est silencieux et n'empêche pas le reste du module de fonctionner.",
                        en: "The browser may refuse resizing, especially when the page is not a script-opened window or has multiple tabs. Refusal is silent and does not prevent the rest of the module from working."
                    },
                    fields: [
                        { key: "windowSizing.enabled", type: "boolean", label: { fr: "Tenter d'agrandir la fenêtre", en: "Try to enlarge the window" } },
                        { key: "windowSizing.widthRatio", type: "number", label: { fr: "Largeur cible (0,30 à 1)", en: "Target width (0.30 to 1)" } },
                        { key: "windowSizing.heightRatio", type: "number", label: { fr: "Hauteur cible (0,30 à 1)", en: "Target height (0.30 to 1)" } },
                        {
                            key: "windowSizing.position",
                            type: "select",
                            label: { fr: "Position", en: "Position" },
                            options: [
                                { value: "none", label: { fr: "Ne pas déplacer", en: "Do not move" } },
                                { value: "top-left", label: { fr: "Coin supérieur gauche", en: "Top-left corner" } },
                                { value: "center", label: { fr: "Centrer", en: "Center" } }
                            ]
                        },
                        { key: "windowSizing.minViewportWidth", type: "number", advanced: true, label: { fr: "Ne pas redimensionner sous cette largeur (px)", en: "Do not resize below this width (px)" } },
                        { key: "windowSizing.runOncePerPage", type: "boolean", advanced: true, label: { fr: "Une seule tentative par chargement", en: "Only one attempt per page load" } }
                    ]
                },
                {
                    type: "section",
                    id: "normalization",
                    label: { fr: "Termes de recherche et accents", en: "Search terms and accents" },
                    description: {
                        fr: "Par défaut, les accents sont retirés juste avant l'envoi du formulaire afin de conserver une saisie naturelle à l'écran. Le mode direct permet de normaliser au fur et à mesure de la frappe et du collage.",
                        en: "By default, accents are removed just before form submission so typing remains natural on screen. Live mode normalizes as the user types or pastes."
                    },
                    fields: [
                        { key: "normalization.enabled", type: "boolean", label: { fr: "Activer la normalisation", en: "Enable normalization" } },
                        {
                            key: "normalization.mode",
                            type: "select",
                            label: { fr: "Moment de la normalisation", en: "When to normalize" },
                            options: [
                                { value: "none", label: { fr: "Aucune modification", en: "No modification" } },
                                { value: "before-submit", label: { fr: "Juste avant la recherche", en: "Just before search" } },
                                { value: "live", label: { fr: "Pendant la saisie et le collage", en: "While typing and pasting" } }
                            ]
                        },
                        { key: "normalization.normalizePrefilledOnLoad", type: "boolean", label: { fr: "Normaliser aussi les valeurs déjà présentes au chargement", en: "Also normalize prefilled values on load" } },
                        { key: "normalization.extraMappings", type: "boolean", advanced: true, label: { fr: "Convertir aussi œ, æ, ø, ł…", en: "Also convert œ, æ, ø, ł…" } },
                        { key: "normalization.trimSpaces", type: "boolean", advanced: true, label: { fr: "Supprimer les espaces en début et fin", en: "Trim leading and trailing spaces" } },
                        { key: "normalization.collapseSpaces", type: "boolean", advanced: true, label: { fr: "Réduire les espaces multiples", en: "Collapse repeated spaces" } },
                        {
                            key: "normalization.fields",
                            type: "repeater",
                            label: { fr: "Champs concernés", en: "Affected fields" },
                            addLabel: { fr: "Ajouter un champ", en: "Add field" },
                            reorder: true,
                            newItem: newFieldRule,
                            itemTitle: function (item, index, lang) {
                                const value = lang === "en" ? item && item.labelEn : item && item.labelFr;
                                return String(value || item && item.id || "").trim() || "Champ " + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Champ actif", en: "Field enabled" } },
                                { key: "labelFr", type: "text", label: { fr: "Nom français", en: "French name" } },
                                { key: "labelEn", type: "text", label: { fr: "Nom anglais", en: "English name" } },
                                { key: "selector", type: "text", advanced: true, label: { fr: "Sélecteur du champ", en: "Field selector" } },
                                { key: "id", type: "text", advanced: true, label: { fr: "Identifiant interne", en: "Internal identifier" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "compatibility",
                    label: { fr: "Compatibilité et futur 048", en: "Compatibility and future 048" },
                    description: {
                        fr: "La normalisation est isolée dans un petit service réutilisable (PMKInputNormalization). Lors de l'audit du 048, son contrôle des accents pourra utiliser le même moteur au lieu de maintenir deux implémentations concurrentes.",
                        en: "Normalization is isolated in a small reusable service (PMKInputNormalization). During the module 048 audit, its accent control can use the same engine instead of maintaining two competing implementations."
                    },
                    fields: []
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : "layout";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') || main.querySelector('[data-pmk-section-id="layout"]');
                if (!section) return;
                window.setTimeout(function () { section.scrollIntoView({ block: "start", behavior: "smooth" }); }, 0);
            }
        };
    }

    function registerModuleIfNeeded() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return;
        let exists = false;
        try {
            exists = typeof window.PMKConfig.listModules === "function" &&
                window.PMKConfig.listModules().some(function (module) { return module && module.id === MODULE_ID; });
        } catch (_) {}
        if (!exists) window.PMKConfig.registerModule(buildModuleDefinition());
    }

    function loadConfig() {
        registerModuleIfNeeded();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(deepClone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return normalizeConfig(cfg); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config);
        restoreLayout();
        detachRuntimeListeners();

        if (!currentConfig.enabled || !pageEnabled()) return;

        installStyles();
        installSharedNormalizationService();
        applyLayout();
        maybeResizeWindow();
        attachRuntimeListeners();

        if (currentConfig.normalization.enabled !== false &&
            currentConfig.normalization.mode !== "none" &&
            currentConfig.normalization.normalizePrefilledOnLoad === true) {
            normalizeAllConfiguredInputs(document);
        }

        mountContextAccess();
    }

    function refresh() {
        loadConfig().then(applyConfig);
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: { livePreview: true },
            canPreview: function () { return window.location.pathname === PAGE_PATH; },
            previewDraft: function (draft) {
                if (window.location.pathname !== PAGE_PATH) throw new Error("visual_preview_wrong_page");
                const before = deepClone(currentConfig || DEFAULTS);
                applyConfig(draft);
                return function () { applyConfig(before); };
            }
        });
        return true;
    }

    function start() {
        registerModuleIfNeeded();
        registerVisualEditorAdapter();
        if (window.location.pathname !== PAGE_PATH) return;
        refresh();
        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try { window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }
    }

    window.addEventListener("pmk:config-ready", registerVisualEditorAdapter, { once: true });

    window.PMK035Z3950Workspace = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        applyLayout: applyLayout,
        normalizeText: function (value) { return normalizeText(value); },
        getConfig: function () { return deepClone(currentConfig); },
        destroy: function () {
            detachRuntimeListeners();
            restoreLayout();
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
