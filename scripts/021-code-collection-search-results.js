/* ============================================================
   PimpMyKoha - Pré-plugin
   Fichier : 021-code-collection-search-results.js
   Version : 2.3.0-isolated

   Module fonctionnel : Liens dynamiques

   Fonction :
   - rend un élément Koha cliquable à partir d'une valeur détectée ;
   - construit dynamiquement l'URL à partir d'un modèle contenant {value} ;
   - permet de choisir visuellement l'élément sur la page ;
   - prend en charge texte, attribut, valeur de formulaire et DataTables ;
   - conserve le comportement historique « code collection -> recherche ccode »
     comme configuration par défaut ;
   - FR/EN, responsive, idempotent et fail-safe ;
   - configuration partagée via 000-pmk-config-firestore.js ;
   - aucune dépendance directe à Firebase dans la logique métier.
   ============================================================ */
(function () {
    "use strict";

    if (window.__PMK_021_DYNAMIC_LINKS__) return;
    window.__PMK_021_DYNAMIC_LINKS__ = true;

    const MODULE_ID = "contextual-search-links"; // identifiant conservé pour ne pas perdre la configuration existante
    const MODULE_VERSION = "2.3.0-isolated";
    const MARK_ATTR = "data-pmk021-dynamic-link";
    const RULE_ATTR = "data-pmk021-rule";
    const ORIGINAL_HREF_ATTR = "data-pmk021-original-href";
    const ORIGINAL_TARGET_ATTR = "data-pmk021-original-target";
    const ORIGINAL_REL_ATTR = "data-pmk021-original-rel";
    const PICKER_STYLE_ID = "pmk021-picker-style";

    const DEFAULTS = {
        enabled: true,
        observeDom: true,
        observeDelay: 100,
        rules: [
            {
                id: "legacy-search-ccode",
                enabled: true,
                label: "Code collection — résultats de recherche",
                engine: "dom",
                pagePath: "/cgi-bin/koha/catalogue/search.pl",
                selector: "span.ccode",
                targetName: "Code collection",
                exampleValue: "ROM",
                matchCount: null,
                valueSource: "text",
                attributeName: "",
                trim: true,
                extractRegex: "",
                regexFlags: "",
                regexGroup: 0,
                encodeValue: true,
                urlTemplate: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\"",
                linkMode: "element",
                presentation: "legacy-ccode-block",
                legacyPrefixFr: "Code collection :",
                legacyPrefixEn: "Collection code:",
                legacySeparator: ", ",
                linkTextTemplate: "{value}",
                openInNewTab: false,
                tableSelector: "",
                columnName: "",
                dataField: "",
                previewUrl: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"ROM\""
            },
            {
                id: "detail-holdings-ccode",
                enabled: true,
                label: "Code collection — exemplaires",
                engine: "datatable-column",
                pagePath: "/cgi-bin/koha/catalogue/detail.pl",
                selector: "",
                targetName: "Code collection des exemplaires",
                exampleValue: "ROM",
                matchCount: null,
                valueSource: "datatable-field",
                attributeName: "",
                trim: true,
                extractRegex: "",
                regexFlags: "",
                regexGroup: 0,
                encodeValue: true,
                urlTemplate: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\"",
                linkMode: "element",
                presentation: "element",
                legacyPrefixFr: "Code collection :",
                legacyPrefixEn: "Collection code:",
                legacySeparator: ", ",
                linkTextTemplate: "{value}",
                openInNewTab: true,
                tableSelector: "#holdings_table",
                columnName: "ccode",
                dataField: "collection_code",
                previewUrl: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"ROM\""
            },
            {
                id: "detail-otherholdings-ccode",
                enabled: true,
                label: "Code collection — autres exemplaires",
                engine: "datatable-column",
                pagePath: "/cgi-bin/koha/catalogue/detail.pl",
                selector: "",
                targetName: "Code collection des autres exemplaires",
                exampleValue: "ROM",
                matchCount: null,
                valueSource: "datatable-field",
                attributeName: "",
                trim: true,
                extractRegex: "",
                regexFlags: "",
                regexGroup: 0,
                encodeValue: true,
                urlTemplate: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\"",
                linkMode: "element",
                presentation: "element",
                legacyPrefixFr: "Code collection :",
                legacyPrefixEn: "Collection code:",
                legacySeparator: ", ",
                linkTextTemplate: "{value}",
                openInNewTab: true,
                tableSelector: "#otherholdings_table",
                columnName: "ccode",
                dataField: "collection_code",
                previewUrl: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"ROM\""
            }
        ]
    };

    let currentConfig = null;
    let observer = null;
    let observerTimer = 0;
    let unsubscribe = null;
    let coreRegistered = false;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) return Array.isArray(override) ? clone(override) : clone(base);
        if (!base || typeof base !== "object") return override === undefined ? clone(base) : clone(override);
        const out = clone(base) || {};
        if (!override || typeof override !== "object" || Array.isArray(override)) return out;
        Object.keys(override).forEach(function (key) {
            if (Array.isArray(override[key])) out[key] = clone(override[key]);
            else if (override[key] && typeof override[key] === "object" && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
                out[key] = deepMerge(out[key], override[key]);
            } else out[key] = clone(override[key]);
        });
        return out;
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") return window.PMKConfig.getLanguage();
        const lang = (document.documentElement.getAttribute("lang") || navigator.language || "").toLowerCase();
        return lang.startsWith("fr") ? "fr" : "en";
    }

    function normalizePath(path) {
        let value = String(path || "").trim();
        if (!value) return "";
        try {
            if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
        } catch (_) {}
        if (!value.startsWith("/")) {
            if (value.startsWith("cgi-bin/koha/")) value = "/" + value;
            else value = "/cgi-bin/koha/" + value.replace(/^\/+/, "");
        }
        return value.replace(/\/+$/, "") || "/";
    }

    function ruleAppliesHere(rule) {
        if (!rule || rule.enabled === false) return false;
        return normalizePath(rule.pagePath) === normalizePath(window.location.pathname);
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (character) { return "\\" + character; });
    }

    function selectorCount(selector) {
        if (!selector) return 0;
        try { return document.querySelectorAll(selector).length; } catch (_) { return 0; }
    }

    function isUsableClass(name) {
        return name && !/^(pmk|active$|selected$|hover$|focus$|show$|open$|collapsed$|odd$|even$)/i.test(name);
    }

    function reusableSelector(element) {
        if (!element || element.nodeType !== 1) return "";

        if (element.id) {
            const byId = "#" + cssEscape(element.id);
            if (selectorCount(byId) === 1) return byId;
        }

        const stableAttributes = ["data-colname", "name", "data-field", "data-column", "data-testid", "role"];
        for (const attribute of stableAttributes) {
            const value = element.getAttribute && element.getAttribute(attribute);
            if (!value) continue;
            const candidate = element.tagName.toLowerCase() + "[" + attribute + "=\"" + String(value).replace(/"/g, "\\\"") + "\"]";
            if (selectorCount(candidate) > 0) return candidate;
        }

        const classes = Array.from(element.classList || []).filter(isUsableClass);
        if (classes.length) {
            for (let take = Math.min(2, classes.length); take >= 1; take -= 1) {
                const candidate = element.tagName.toLowerCase() + "." + classes.slice(0, take).map(cssEscape).join(".");
                if (selectorCount(candidate) > 0) return candidate;
            }
        }

        const parts = [];
        let node = element;
        while (node && node !== document.body && parts.length < 5) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += "#" + cssEscape(node.id);
                parts.unshift(part);
                break;
            }
            const nodeClasses = Array.from(node.classList || []).filter(isUsableClass);
            if (nodeClasses.length) part += "." + cssEscape(nodeClasses[0]);
            else if (node.parentElement) {
                const peers = Array.from(node.parentElement.children).filter(function (candidate) { return candidate.tagName === node.tagName; });
                if (peers.length > 1) part += ":nth-of-type(" + (peers.indexOf(node) + 1) + ")";
            }
            parts.unshift(part);
            node = node.parentElement;
        }
        const candidate = parts.join(" > ");
        return selectorCount(candidate) > 0 ? candidate : "";
    }

    function elementExample(element) {
        if (!element) return "";
        if ((element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") && element.value != null) {
            return String(element.value).trim().slice(0, 160);
        }
        return String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
    }

    function visualElementPicker() {
        return new Promise(function (resolve, reject) {
            const admin = document.querySelector("#pmk-config-overlay, .pmk-admin-overlay, #pmk-config-admin");
            const oldDisplay = admin ? admin.style.display : "";
            if (admin) admin.style.display = "none";

            const oldStyle = document.getElementById(PICKER_STYLE_ID);
            if (oldStyle) oldStyle.remove();
            const style = document.createElement("style");
            style.id = PICKER_STYLE_ID;
            style.textContent = ".pmk021-picker-hover{outline:3px solid #2f7d32!important;outline-offset:2px!important;cursor:crosshair!important;}";
            document.head.appendChild(style);

            let hovered = null;
            function cleanup() {
                if (hovered) hovered.classList.remove("pmk021-picker-hover");
                document.removeEventListener("mouseover", over, true);
                document.removeEventListener("mouseout", out, true);
                document.removeEventListener("click", click, true);
                document.removeEventListener("keydown", key, true);
                style.remove();
                if (admin) admin.style.display = oldDisplay;
            }
            function over(event) {
                if (hovered) hovered.classList.remove("pmk021-picker-hover");
                hovered = event.target && event.target.nodeType === 1 ? event.target : null;
                if (hovered) hovered.classList.add("pmk021-picker-hover");
            }
            function out(event) {
                if (event.target && event.target.classList) event.target.classList.remove("pmk021-picker-hover");
            }
            function click(event) {
                event.preventDefault();
                event.stopPropagation();
                const element = event.target;
                const selector = reusableSelector(element);
                if (!selector) {
                    cleanup();
                    reject(new Error("selector_unavailable"));
                    return;
                }
                const example = elementExample(element);
                const result = {
                    value: selector,
                    selector: selector,
                    targetName: example || element.tagName.toLowerCase(),
                    exampleValue: example,
                    pagePath: window.location.pathname,
                    matchCount: selectorCount(selector)
                };
                cleanup();
                resolve(result);
            }
            function key(event) {
                if (event.key !== "Escape") return;
                event.preventDefault();
                cleanup();
                reject(new Error("picker_cancelled"));
            }
            document.addEventListener("mouseover", over, true);
            document.addEventListener("mouseout", out, true);
            document.addEventListener("click", click, true);
            document.addEventListener("keydown", key, true);
        });
    }

    function normalizeRule(rule, index) {
        const base = {
            id: "rule-" + (index + 1),
            enabled: true,
            label: "",
            engine: "dom",
            pagePath: window.location.pathname,
            selector: "",
            targetName: "",
            exampleValue: "",
            matchCount: null,
            valueElementMode: "target",
            valueSelector: "",
            valueTargetName: "",
            valueMatchCount: null,
            valuePairing: "auto",
            valueSource: "text",
            attributeName: "",
            trim: true,
            extractRegex: "",
            regexFlags: "",
            regexGroup: 0,
            encodeValue: true,
            urlTemplate: "",
            linkMode: "element",
            presentation: "element",
            legacyPrefixFr: "Code collection :",
            legacyPrefixEn: "Collection code:",
            legacySeparator: ", ",
            linkTextTemplate: "Ouvrir",
            openInNewTab: false,
            tableSelector: "",
            columnName: "",
            dataField: "",
            previewUrl: ""
        };
        return deepMerge(base, rule || {});
    }

    function normalizeConfig(config) {
        const merged = deepMerge(DEFAULTS, config || {});
        if (!Array.isArray(merged.rules) || !merged.rules.length) merged.rules = clone(DEFAULTS.rules);
        merged.rules = merged.rules.map(normalizeRule);
        return merged;
    }

    function extractValue(rawValue, rule) {
        let value = rawValue == null ? "" : String(rawValue);
        if (rule.trim !== false) value = value.trim();
        if (!value) return "";
        const pattern = String(rule.extractRegex || "").trim();
        if (pattern) {
            try {
                const flags = String(rule.regexFlags || "").replace(/[^dgimsuvy]/g, "");
                const match = value.match(new RegExp(pattern, flags));
                if (!match) return "";
                const group = Math.max(0, Number(rule.regexGroup) || 0);
                value = match[group] == null ? "" : String(match[group]);
            } catch (_) {
                return "";
            }
        }
        return rule.trim !== false ? value.trim() : value;
    }

    function readDomValue(element, rule) {
        if (!element) return "";
        if (rule.valueSource === "attribute") {
            const name = String(rule.attributeName || "").trim();
            if (!name) return "";
            return extractValue(element.getAttribute(name), rule);
        }
        if (rule.valueSource === "value") {
            return extractValue(element.value, rule);
        }
        return extractValue(element.textContent, rule);
    }

    function templateValue(value, encode) {
        return encode === false ? String(value) : encodeURIComponent(String(value));
    }

    function buildUrl(rule, value) {
        const template = String(rule.urlTemplate || "").trim();
        if (!template || template.indexOf("{value}") === -1) return "";
        const encoded = templateValue(value, rule.encodeValue !== false);
        const raw = String(value);
        const url = template
            .replace(/\{value\}/g, encoded)
            .replace(/\{raw\}/g, raw);
        if (/^\s*(javascript|data|vbscript):/i.test(url)) return "";
        return url;
    }

    function previewForRule(rule) {
        const example = String(rule.exampleValue || "").trim() || "EXEMPLE";
        return buildUrl(rule, example);
    }

    function getRuleIndex(fieldPath) {
        const index = Array.isArray(fieldPath) && fieldPath[0] === "rules" ? Number(fieldPath[1]) : NaN;
        return Number.isInteger(index) ? index : null;
    }

    function refreshRulePreview(rootObject, fieldPath) {
        const index = getRuleIndex(fieldPath);
        if (index === null || !rootObject || !Array.isArray(rootObject.rules) || !rootObject.rules[index]) return;
        rootObject.rules[index].previewUrl = previewForRule(rootObject.rules[index]);
    }

    function applyPickerResult(rootObject, fieldPath, result) {
        const index = getRuleIndex(fieldPath);
        if (index === null || !rootObject.rules || !rootObject.rules[index] || !result) return;
        const rule = rootObject.rules[index];
        rule.engine = "dom";
        rule.pagePath = result.pagePath || window.location.pathname;
        rule.targetName = result.targetName || rule.targetName || "Élément Koha";
        rule.matchCount = Number.isInteger(result.matchCount) ? result.matchCount : selectorCount(result.selector || rule.selector);
        if ((rule.valueElementMode || "target") === "target") {
            rule.exampleValue = result.exampleValue || rule.exampleValue || "";
        }
        rule.previewUrl = previewForRule(rule);
    }

    function applyValuePickerResult(rootObject, fieldPath, result) {
        const index = getRuleIndex(fieldPath);
        if (index === null || !rootObject.rules || !rootObject.rules[index] || !result) return;
        const rule = rootObject.rules[index];
        rule.valueElementMode = "picked";
        rule.pagePath = result.pagePath || rule.pagePath || window.location.pathname;
        rule.valueTargetName = result.targetName || rule.valueTargetName || "Source de valeur";
        rule.valueMatchCount = Number.isInteger(result.matchCount) ? result.matchCount : selectorCount(result.selector || rule.valueSelector);
        rule.exampleValue = result.exampleValue || rule.exampleValue || "";
        rule.previewUrl = previewForRule(rule);
    }

    function pickForRule(context, role) {
        const ctx = context || {};
        const index = getRuleIndex(ctx.fieldPath);
        const rule = index !== null && ctx.rootObject && Array.isArray(ctx.rootObject.rules) ? ctx.rootObject.rules[index] : null;
        const targetUrl = rule && rule.pagePath ? rule.pagePath : window.location.pathname;
        const common = window.PMKConfig && window.PMKConfig.elementPicker;
        if (common && typeof common.pickForConfig === "function") {
            return common.pickForConfig({
                moduleId: MODULE_ID,
                targetUrl: targetUrl,
                fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath.slice() : [],
                rootObject: ctx.rootObject || {},
                meta: { role: role || "target" },
                adminContext: { sectionId: "rules", pagePath: targetUrl },
                options: {
                    bannerText: role === "value"
                        ? (detectLanguage() === "en" ? "Click the element that supplies {value} — Esc cancels" : "Clique sur l’élément qui fournit {value} — Échap annule")
                        : (detectLanguage() === "en" ? "Click the element that will receive the link — Esc cancels" : "Clique sur l’élément qui recevra le lien — Échap annule")
                }
            });
        }
        return visualElementPicker();
    }

    function registerCommonPickerAdapter() {
        const common = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!common || typeof common.register !== "function") return;
        common.register(MODULE_ID, {
            buildResult: function (candidate, result) {
                result.exampleValue = elementExample(candidate);
                result.matchCount = selectorCount(result.selector);
                return result;
            },
            applyPending: function (draft, pending, picked) {
                const index = getRuleIndex(pending && pending.fieldPath);
                if (index === null || !draft || !Array.isArray(draft.rules) || !draft.rules[index] || !picked) return draft;
                const rule = draft.rules[index];
                const role = pending && pending.meta && pending.meta.role === "value" ? "value" : "target";
                rule.pagePath = picked.pagePath || rule.pagePath || window.location.pathname;
                if (role === "value") {
                    rule.valueElementMode = "picked";
                    rule.valueTargetName = picked.targetName || rule.valueTargetName || "Source de valeur";
                    rule.valueMatchCount = Number.isInteger(picked.matchCount) ? picked.matchCount : null;
                    rule.exampleValue = picked.exampleValue || rule.exampleValue || "";
                } else {
                    rule.engine = "dom";
                    rule.targetName = picked.targetName || rule.targetName || "Élément Koha";
                    rule.matchCount = Number.isInteger(picked.matchCount) ? picked.matchCount : null;
                    if ((rule.valueElementMode || "target") === "target") rule.exampleValue = picked.exampleValue || rule.exampleValue || "";
                }
                rule.previewUrl = previewForRule(rule);
                return draft;
            }
        });
    }

    function newRule() {
        const rule = normalizeRule({
            id: "rule-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
            label: detectLanguage() === "fr" ? "Nouveau lien dynamique" : "New dynamic link",
            pagePath: window.location.pathname,
            linkTextTemplate: detectLanguage() === "fr" ? "Ouvrir" : "Open"
        }, 0);
        return rule;
    }

    function validateConfig(config) {
        const lang = detectLanguage();
        const fail = function (fr, en) { return { ok: false, message: lang === "en" ? en : fr }; };
        if (!config || !Array.isArray(config.rules)) return fail("La liste des règles est invalide.", "The rule list is invalid.");
        const ids = new Set();
        for (let i = 0; i < config.rules.length; i += 1) {
            const rule = normalizeRule(config.rules[i], i);
            if (!rule.id || ids.has(rule.id)) return fail("Chaque règle doit avoir un identifiant unique.", "Each rule must have a unique identifier.");
            ids.add(rule.id);
            if (!rule.pagePath) return fail("Chaque règle doit indiquer une page Koha.", "Each rule must specify a Koha page.");
            if (!rule.urlTemplate || rule.urlTemplate.indexOf("{value}") === -1) {
                return fail("Chaque URL doit contenir la variable {value}.", "Each URL must contain the {value} variable.");
            }
            if (rule.engine === "dom" && !rule.selector) return fail("Une règle d'élément doit cibler un élément de la page.", "An element rule must target a page element.");
            if (rule.engine === "dom" && rule.valueElementMode === "picked" && !String(rule.valueSelector || "").trim()) {
                return fail("La source de {value} doit être sélectionnée sur la page.", "The {value} source must be selected on the page.");
            }
            if (rule.engine === "datatable-column" && (!rule.tableSelector || !rule.columnName || !rule.dataField)) {
                return fail("Une règle DataTables doit indiquer le tableau, la colonne et le champ de données.", "A DataTables rule must specify the table, column and data field.");
            }
            if (rule.valueSource === "attribute" && !String(rule.attributeName || "").trim()) {
                return fail("Le nom de l'attribut à lire est vide.", "The attribute name to read is empty.");
            }
        }
        return { ok: true };
    }

    function moduleDefinition() {
        const valueSourceOptions = [
            { value: "text", label: { fr: "Texte affiché dans l'élément", en: "Text displayed in the element" } },
            { value: "value", label: { fr: "Valeur d'un champ de formulaire", en: "Form field value" } },
            { value: "attribute", label: { fr: "Attribut HTML", en: "HTML attribute" } }
        ];

        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Liens dynamiques", en: "Dynamic links" },
            description: {
                fr: "Rend des éléments de Koha cliquables et construit leur destination à partir d'une URL dynamique utilisant la valeur détectée sur la page.",
                en: "Makes Koha elements clickable and builds their destination from a dynamic URL using the value detected on the page."
            },
            category: { fr: "Interface / navigation", en: "Interface / navigation" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULTS),
            normalize: normalizeConfig,
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "general",
                    label: { fr: "Fonctionnement", en: "Behaviour" },
                    description: {
                        fr: "Une règle choisit un élément sur une page, récupère sa valeur puis remplace {value} dans le modèle d'URL.",
                        en: "A rule chooses an element on a page, reads its value, then replaces {value} in the URL template."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Module actif", en: "Module enabled" } },
                        { key: "observeDom", type: "boolean", advanced: true, label: { fr: "Retraiter les éléments ajoutés dynamiquement", en: "Process dynamically added elements" } },
                        { key: "observeDelay", type: "number", advanced: true, label: { fr: "Délai de retraitement (ms)", en: "Reprocessing delay (ms)" } }
                    ]
                },
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Règles de liens dynamiques", en: "Dynamic link rules" },
                    description: {
                        fr: "Ajoute une règle, choisis l'élément directement dans Koha puis indique la structure de l'URL. Exemple : /cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\".",
                        en: "Add a rule, choose the element directly in Koha, then define the URL structure. Example: /cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\"."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Liens configurés", en: "Configured links" },
                            addLabel: { fr: "Ajouter un lien dynamique", en: "Add dynamic link" },
                            reorder: true,
                            newItem: newRule,
                            liveTitleKey: "label",
                            itemTitle: function (item, index) {
                                return String(item && (item.label || item.targetName) || "").trim() || "Règle " + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom de la règle", en: "Rule name" } },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Élément à rendre cliquable", en: "Element to make clickable" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    emptyLabel: { fr: "Aucun élément choisi", en: "No element selected" },
                                    allowManual: true,
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        return index === null || !rootObject.rules[index] || rootObject.rules[index].engine !== "datatable-column";
                                    },
                                    pick: function (context) { return pickForRule(context, "target"); },
                                    onPick: applyPickerResult
                                },
                                {
                                    key: "targetName",
                                    type: "readonly",
                                    label: { fr: "Élément détecté", en: "Detected element" }
                                },
                                {
                                    key: "pagePath",
                                    type: "text",
                                    label: { fr: "Page Koha", en: "Koha page" },
                                    help: {
                                        fr: "Renseignée automatiquement lors du choix sur la page. Une URL complète n'est pas nécessaire.",
                                        en: "Filled automatically when choosing on the page. A full URL is not required."
                                    }
                                },
                                {
                                    key: "valueElementMode",
                                    type: "select",
                                    label: { fr: "Source de {value}", en: "{value} source" },
                                    options: [
                                        { value: "target", label: { fr: "Même élément que celui qui reçoit le lien", en: "Same element that receives the link" } },
                                        { value: "picked", label: { fr: "Un autre élément choisi sur la page", en: "Another element selected on the page" } }
                                    ],
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        return index === null || !rootObject.rules[index] || rootObject.rules[index].engine !== "datatable-column";
                                    },
                                    refreshOnChange: true
                                },
                                {
                                    key: "valueSelector",
                                    type: "elementPicker",
                                    label: { fr: "Élément qui fournit {value}", en: "Element supplying {value}" },
                                    pickLabel: { fr: "Choisir la source sur la page", en: "Choose source on page" },
                                    emptyLabel: { fr: "Aucune source choisie", en: "No source selected" },
                                    allowManual: true,
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        const rule = index !== null && rootObject.rules ? rootObject.rules[index] : null;
                                        return Boolean(rule && rule.engine !== "datatable-column" && rule.valueElementMode === "picked");
                                    },
                                    pick: function (context) { return pickForRule(context, "value"); },
                                    onPick: applyValuePickerResult
                                },
                                {
                                    key: "valueTargetName",
                                    type: "readonly",
                                    label: { fr: "Source détectée", en: "Detected source" },
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        const rule = index !== null && rootObject.rules ? rootObject.rules[index] : null;
                                        return Boolean(rule && rule.engine !== "datatable-column" && rule.valueElementMode === "picked");
                                    }
                                },
                                {
                                    key: "valuePairing",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Association cible / source", en: "Target / source pairing" },
                                    options: [
                                        { value: "auto", label: { fr: "Automatique : même ligne/carte puis même index", en: "Automatic: same row/card then same index" } },
                                        { value: "same-index", label: { fr: "Même position dans les listes", en: "Same position in the lists" } },
                                        { value: "first", label: { fr: "Toujours la première source trouvée", en: "Always use the first matching source" } }
                                    ],
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        const rule = index !== null && rootObject.rules ? rootObject.rules[index] : null;
                                        return Boolean(rule && rule.engine !== "datatable-column" && rule.valueElementMode === "picked");
                                    }
                                },
                                {
                                    key: "valueSource",
                                    type: "select",
                                    label: { fr: "Comment lire la valeur source", en: "How to read the source value" },
                                    options: valueSourceOptions,
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        return index === null || !rootObject.rules[index] || rootObject.rules[index].engine !== "datatable-column";
                                    },
                                    refreshOnChange: true,
                                    onChange: refreshRulePreview
                                },
                                {
                                    key: "attributeName",
                                    type: "text",
                                    label: { fr: "Nom de l'attribut", en: "Attribute name" },
                                    placeholder: { fr: "ex. data-id, href, title", en: "e.g. data-id, href, title" },
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        const rule = index !== null && rootObject.rules ? rootObject.rules[index] : null;
                                        return Boolean(rule && rule.engine !== "datatable-column" && rule.valueSource === "attribute");
                                    }
                                },
                                {
                                    key: "urlTemplate",
                                    type: "textarea",
                                    rows: 2,
                                    label: { fr: "Structure de l'URL", en: "URL template" },
                                    placeholder: { fr: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\"", en: "/cgi-bin/koha/catalogue/search.pl?q=ccode:\"{value}\"" },
                                    help: {
                                        fr: "{value} est remplacé par la valeur lue dans la source choisie ci-dessus. {raw} insère la même valeur sans encodage URL.",
                                        en: "{value} is replaced by the value read from the source selected above. {raw} inserts the same value without URL encoding."
                                    },
                                    refreshOnChange: true,
                                    onChange: refreshRulePreview
                                },
                                {
                                    key: "exampleValue",
                                    type: "text",
                                    label: { fr: "Valeur d'exemple", en: "Example value" },
                                    help: {
                                        fr: "Détectée automatiquement lors du choix ; modifiable pour tester l'URL.",
                                        en: "Detected automatically when choosing; editable to test the URL."
                                    },
                                    refreshOnChange: true,
                                    onChange: refreshRulePreview
                                },
                                {
                                    key: "previewUrl",
                                    type: "readonly",
                                    label: { fr: "Aperçu de l'URL produite", en: "Generated URL preview" }
                                },
                                {
                                    key: "linkMode",
                                    type: "select",
                                    label: { fr: "Comportement", en: "Behaviour" },
                                    options: [
                                        { value: "element", label: { fr: "Rendre l'élément lui-même cliquable", en: "Make the element itself clickable" } },
                                        { value: "after", label: { fr: "Ajouter un lien à côté", en: "Add a link next to it" } }
                                    ],
                                    refreshOnChange: true
                                },
                                {
                                    key: "linkTextTemplate",
                                    type: "text",
                                    label: { fr: "Texte du lien ajouté", en: "Added link text" },
                                    help: { fr: "Utilisé seulement avec « Ajouter un lien à côté ». {value} est accepté.", en: "Used only with “Add a link next to it”. {value} is supported." },
                                    when: function (rootObject, fieldPath) {
                                        const index = getRuleIndex(fieldPath);
                                        const rule = index !== null && rootObject.rules ? rootObject.rules[index] : null;
                                        return Boolean(rule && rule.linkMode === "after");
                                    }
                                },
                                { key: "openInNewTab", type: "boolean", label: { fr: "Ouvrir dans un nouvel onglet", en: "Open in a new tab" } },

                                { key: "encodeValue", type: "boolean", advanced: true, label: { fr: "Encoder {value} pour l'URL", en: "URL-encode {value}" }, onChange: refreshRulePreview, refreshOnChange: true },
                                { key: "trim", type: "boolean", advanced: true, label: { fr: "Supprimer les espaces au début et à la fin", en: "Trim leading and trailing whitespace" } },
                                { key: "extractRegex", type: "text", advanced: true, label: { fr: "Extraire la valeur avec une expression régulière", en: "Extract value with a regular expression" } },
                                { key: "regexFlags", type: "text", advanced: true, label: { fr: "Options RegExp", en: "RegExp flags" } },
                                { key: "regexGroup", type: "number", advanced: true, label: { fr: "Groupe RegExp utilisé", en: "RegExp group to use" } },
                                {
                                    key: "presentation",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Présentation spéciale", en: "Special presentation" },
                                    options: [
                                        { value: "element", label: { fr: "Présentation normale", en: "Normal presentation" } },
                                        { value: "legacy-ccode-block", label: { fr: "Bloc historique du code collection", en: "Historical collection-code block" } }
                                    ],
                                    refreshOnChange: true
                                },
                                { key: "legacyPrefixFr", type: "text", advanced: true, label: { fr: "Préfixe historique français", en: "Historical French prefix" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].presentation === "legacy-ccode-block"); } },
                                { key: "legacyPrefixEn", type: "text", advanced: true, label: { fr: "Préfixe historique anglais", en: "Historical English prefix" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].presentation === "legacy-ccode-block"); } },
                                { key: "legacySeparator", type: "text", advanced: true, label: { fr: "Séparateur historique", en: "Historical separator" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].presentation === "legacy-ccode-block"); } },
                                {
                                    key: "engine",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Moteur de ciblage", en: "Targeting engine" },
                                    options: [
                                        { value: "dom", label: { fr: "Élément de page", en: "Page element" } },
                                        { value: "datatable-column", label: { fr: "Colonne DataTables Koha", en: "Koha DataTables column" } }
                                    ],
                                    refreshOnChange: true
                                },
                                { key: "tableSelector", type: "text", advanced: true, label: { fr: "Tableau DataTables", en: "DataTables table" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].engine === "datatable-column"); } },
                                { key: "columnName", type: "text", advanced: true, label: { fr: "Nom technique de colonne", en: "Technical column name" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].engine === "datatable-column"); } },
                                { key: "dataField", type: "text", advanced: true, label: { fr: "Champ de données utilisé comme valeur", en: "Data field used as value" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].engine === "datatable-column"); } },
                                { key: "selector", type: "text", readOnly: true, advanced: true, label: { fr: "Sélecteur technique", en: "Technical selector" }, when: function (rootObject, fieldPath) { const i = getRuleIndex(fieldPath); return Boolean(i !== null && rootObject.rules[i] && rootObject.rules[i].engine === "datatable-column"); } },
                                { key: "matchCount", type: "readonly", advanced: true, label: { fr: "Correspondances lors de la sélection", en: "Matches when selected" } },
                                { key: "id", type: "text", readOnly: true, advanced: true, label: { fr: "Identifiant technique", en: "Technical identifier" } }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main) {
                if (!main) return;
                const section = main.querySelector('[data-pmk-section-id="rules"]');
                if (section) window.setTimeout(function () { section.scrollIntoView({ block: "start", behavior: "smooth" }); }, 0);
            }
        };
    }

    function safeQueryAll(selector) {
        if (!selector) return [];
        try { return Array.from(document.querySelectorAll(selector)); } catch (_) { return []; }
    }

    function storeOriginalAnchor(anchor) {
        if (!anchor || anchor.getAttribute(MARK_ATTR) === "1") return;
        anchor.setAttribute(ORIGINAL_HREF_ATTR, anchor.hasAttribute("href") ? anchor.getAttribute("href") : "__PMK_NONE__");
        anchor.setAttribute(ORIGINAL_TARGET_ATTR, anchor.hasAttribute("target") ? anchor.getAttribute("target") : "__PMK_NONE__");
        anchor.setAttribute(ORIGINAL_REL_ATTR, anchor.hasAttribute("rel") ? anchor.getAttribute("rel") : "__PMK_NONE__");
    }

    function configureAnchor(anchor, rule, href) {
        if (!anchor || !href) return false;
        anchor.setAttribute(MARK_ATTR, "1");
        anchor.setAttribute(RULE_ATTR, rule.id || "");
        anchor.setAttribute("href", href);
        if (rule.openInNewTab === true) {
            anchor.setAttribute("target", "_blank");
            anchor.setAttribute("rel", "noopener noreferrer");
        } else {
            anchor.removeAttribute("target");
            anchor.removeAttribute("rel");
        }
        return true;
    }

    function restoreOwnChanges() {
        document.querySelectorAll('[data-pmk021-legacy-block="1"]').forEach(function (block) { block.remove(); });
        document.querySelectorAll('[data-pmk021-legacy-hidden="1"]').forEach(function (element) {
            element.hidden = element.getAttribute("data-pmk021-original-hidden") === "1";
            element.removeAttribute("data-pmk021-legacy-hidden");
            element.removeAttribute("data-pmk021-original-hidden");
        });
        document.querySelectorAll('a[' + MARK_ATTR + '="1"]').forEach(function (anchor) {
            if (anchor.hasAttribute(ORIGINAL_HREF_ATTR)) {
                const href = anchor.getAttribute(ORIGINAL_HREF_ATTR);
                const target = anchor.getAttribute(ORIGINAL_TARGET_ATTR);
                const rel = anchor.getAttribute(ORIGINAL_REL_ATTR);
                if (href === "__PMK_NONE__") anchor.removeAttribute("href"); else anchor.setAttribute("href", href);
                if (target === "__PMK_NONE__") anchor.removeAttribute("target"); else anchor.setAttribute("target", target);
                if (rel === "__PMK_NONE__") anchor.removeAttribute("rel"); else anchor.setAttribute("rel", rel);
                anchor.removeAttribute(MARK_ATTR);
                anchor.removeAttribute(RULE_ATTR);
                anchor.removeAttribute(ORIGINAL_HREF_ATTR);
                anchor.removeAttribute(ORIGINAL_TARGET_ATTR);
                anchor.removeAttribute(ORIGINAL_REL_ATTR);
                return;
            }
            if (anchor.getAttribute("data-pmk021-wrapper") === "1") {
                const parent = anchor.parentNode;
                if (!parent) return;
                while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
                anchor.remove();
                return;
            }
            if (anchor.getAttribute("data-pmk021-added") === "1") anchor.remove();
        });
    }

    function linkText(rule, value) {
        const template = String(rule.linkTextTemplate || "").trim() || (detectLanguage() === "fr" ? "Ouvrir" : "Open");
        return template.replace(/\{value\}/g, String(value)).replace(/\{raw\}/g, String(value));
    }

    function applyLinkToElement(element, rule, value) {
        if (!element || !value) return;
        const href = buildUrl(rule, value);
        if (!href) return;

        if (rule.linkMode === "after") {
            const anchor = document.createElement("a");
            anchor.setAttribute("data-pmk021-added", "1");
            anchor.className = "pmk021-dynamic-link";
            anchor.textContent = linkText(rule, value);
            if (!configureAnchor(anchor, rule, href)) return;
            anchor.style.marginLeft = ".35em";
            element.insertAdjacentElement("afterend", anchor);
            return;
        }

        if (element.tagName === "A") {
            storeOriginalAnchor(element);
            configureAnchor(element, rule, href);
            return;
        }

        if (element.closest('a[' + MARK_ATTR + '="1"]')) return;
        if (element.querySelector("a, button, input, select, textarea")) return;
        const anchor = document.createElement("a");
        anchor.setAttribute("data-pmk021-wrapper", "1");
        if (!configureAnchor(anchor, rule, href)) return;
        while (element.firstChild) anchor.appendChild(element.firstChild);
        element.appendChild(anchor);
    }

    function applyLegacyCollectionBlock(rule) {
        if (normalizePath(window.location.pathname) !== "/cgi-bin/koha/catalogue/search.pl") return;
        document.querySelectorAll("span.item-itype-desc").forEach(function (itemTypeDesc) {
            const parent = itemTypeDesc.parentElement;
            if (!parent) return;
            let candidates = [];
            try { candidates = Array.from(parent.querySelectorAll(rule.selector)); } catch (_) { return; }
            const values = candidates.map(function (element) {
                return { element: element, value: readDomValue(element, rule) };
            }).filter(function (entry) { return Boolean(entry.value); });
            if (!values.length) return;

            const block = document.createElement("div");
            block.className = "ccode2 pmk021-dynamic-link-block";
            block.setAttribute("data-pmk021-legacy-block", "1");
            const prefix = detectLanguage() === "fr" ? String(rule.legacyPrefixFr || "") : String(rule.legacyPrefixEn || "");
            if (prefix) block.appendChild(document.createTextNode(prefix + (/\s$/.test(prefix) ? "" : " ")));
            const separator = String(rule.legacySeparator == null ? ", " : rule.legacySeparator);

            values.forEach(function (entry, index) {
                const href = buildUrl(rule, entry.value);
                if (!href) return;
                const anchor = document.createElement("a");
                anchor.className = "ccode-link pmk021-dynamic-link";
                anchor.textContent = entry.value;
                configureAnchor(anchor, rule, href);
                block.appendChild(anchor);
                if (index < values.length - 1) block.appendChild(document.createTextNode(separator));
                if (!entry.element.hasAttribute("data-pmk021-legacy-hidden")) {
                    entry.element.setAttribute("data-pmk021-original-hidden", entry.element.hidden ? "1" : "0");
                    entry.element.setAttribute("data-pmk021-legacy-hidden", "1");
                    entry.element.hidden = true;
                }
            });
            itemTypeDesc.insertAdjacentElement("afterend", block);
        });
    }

    function resolveValueElement(target, rule, targetIndex, targets, sources) {
        if (!target) return null;
        if ((rule.valueElementMode || "target") !== "picked") return target;
        const list = Array.isArray(sources) ? sources : safeQueryAll(rule.valueSelector);
        if (!list.length) return null;
        if (rule.valuePairing === "first" || list.length === 1) return list[0];
        if (rule.valuePairing === "same-index") return list[targetIndex] || null;

        const containerSelectors = [
            "tr", "li", "article", ".result", ".search-result", ".page-section", ".card", ".panel", ".accordion-item", "tbody"
        ];
        for (const containerSelector of containerSelectors) {
            const container = target.closest && target.closest(containerSelector);
            if (!container) continue;
            let local = [];
            try { local = Array.from(container.querySelectorAll(rule.valueSelector)); } catch (_) { local = []; }
            if (local.length === 1) return local[0];
            if (local.length > 1) {
                const targetPeers = targets.filter(function (candidate) { return container.contains(candidate); });
                const localIndex = targetPeers.indexOf(target);
                if (localIndex >= 0 && local[localIndex]) return local[localIndex];
            }
        }
        if (list.length === targets.length) return list[targetIndex] || null;
        return list[0];
    }

    function applyDomRule(rule) {
        if (rule.presentation === "legacy-ccode-block") {
            applyLegacyCollectionBlock(rule);
            return;
        }
        const targets = safeQueryAll(rule.selector);
        const sources = rule.valueElementMode === "picked" ? safeQueryAll(rule.valueSelector) : [];
        targets.forEach(function (element, index) {
            const valueElement = resolveValueElement(element, rule, index, targets, sources);
            const value = readDomValue(valueElement, rule);
            if (!value) return;
            applyLinkToElement(element, rule, value);
        });
    }

    function getDataTableApi(table) {
        if (!table || !window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable) return null;
        if (typeof window.jQuery.fn.dataTable.isDataTable !== "function") return null;
        if (!window.jQuery.fn.dataTable.isDataTable(table)) return null;
        try { return window.jQuery(table).DataTable(); } catch (_) { return null; }
    }

    function resolveDataTableColumn(api, table, columnName) {
        if (!api || !table || !columnName) return null;
        const header = table.querySelector('thead tr:first-child th[data-colname="' + String(columnName).replace(/"/g, "\\\"") + '"]');
        if (!header) return null;
        try {
            const index = api.column(header).index();
            return Number.isInteger(index) ? index : null;
        } catch (_) {
            const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));
            const index = headers.indexOf(header);
            return index >= 0 ? index : null;
        }
    }

    function applyDataTableRule(rule) {
        const table = document.querySelector(rule.tableSelector);
        if (!table) return;
        const api = getDataTableApi(table);
        if (!api) return;
        const columnIndex = resolveDataTableColumn(api, table, rule.columnName);
        if (columnIndex === null) return;
        try {
            api.rows({ page: "current" }).every(function () {
                const rowData = this.data();
                if (!rowData || rowData[rule.dataField] == null) return;
                const value = extractValue(rowData[rule.dataField], rule);
                if (!value) return;
                let cell = null;
                try { cell = api.cell(this.index(), columnIndex).node(); } catch (_) { cell = null; }
                if (!cell || !cell.textContent.trim()) return;
                applyLinkToElement(cell, rule, value);
            });
        } catch (_) {}
    }

    function applyAll(config) {
        restoreOwnChanges();
        const normalized = normalizeConfig(config);
        currentConfig = normalized;
        if (normalized.enabled === false) return;
        normalized.rules.forEach(function (rule) {
            if (!ruleAppliesHere(rule)) return;
            if (rule.engine === "datatable-column") applyDataTableRule(rule);
            else applyDomRule(rule);
        });
    }

    function stopObserver() {
        if (observer) observer.disconnect();
        observer = null;
        if (observerTimer) window.clearTimeout(observerTimer);
        observerTimer = 0;
    }

    function startObserver(config) {
        stopObserver();
        if (!config || config.enabled === false || config.observeDom === false || !document.body) return;
        const delay = Math.max(25, Math.min(2000, Number(config.observeDelay) || 100));
        observer = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                return Array.from(mutation.addedNodes || []).some(function (node) {
                    return node && node.nodeType === 1 && !(node.matches && node.matches('a[' + MARK_ATTR + '="1"]'));
                });
            });
            if (!relevant) return;
            window.clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () { applyAll(currentConfig); }, delay);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const activeRule = currentConfig && currentConfig.rules && currentConfig.rules.find(ruleAppliesHere);
        if (!activeRule) return;
        const anchor = document.querySelector("h1") || document.querySelector("h2") || document.querySelector("#breadcrumbs");
        if (!anchor) return;
        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: anchor,
            position: "after",
            contextKey: "dynamic-links-" + normalizePath(window.location.pathname),
            context: { sectionId: "rules", pagePath: window.location.pathname }
        });
    }

    function refresh(config) {
        const normalized = normalizeConfig(config || DEFAULTS);
        currentConfig = normalized;
        applyAll(normalized);
        startObserver(normalized);
        mountContextAccess();
    }

    async function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return clone(DEFAULTS);
        try { return await window.PMKConfig.getConfig(MODULE_ID); } catch (_) { return clone(DEFAULTS); }
    }

    async function startWithCore() {
        if (!window.PMKConfig) return;
        registerCommonPickerAdapter();
        if (!coreRegistered && typeof window.PMKConfig.registerModule === "function") {
            window.PMKConfig.registerModule(moduleDefinition());
            coreRegistered = true;
        }
        const config = await loadConfig();
        refresh(config);
        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (nextConfig) { refresh(nextConfig); });
        }
    }

    function startWithoutCore() {
        refresh(DEFAULTS);
    }

    window.PMK021DynamicLinks = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULTS),
        moduleDefinition: moduleDefinition,
        pickElement: function () { return pickForRule({}, "target"); },
        reusableSelector: reusableSelector,
        buildUrl: buildUrl,
        refresh: refresh,
        apply: applyAll,
        restore: restoreOwnChanges
    };

    function boot() {
        if (window.PMKConfig) startWithCore();
        else {
            startWithoutCore();
            window.addEventListener("pmk:config-ready", function () { startWithCore(); }, { once: true });
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
