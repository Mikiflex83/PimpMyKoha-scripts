/* ============================================================
   124-csp-enfant.js
   PimpMyKoha — Valeurs par défaut selon la catégorie d'adhérent
   Version : 3.0.0-preplugin
   Date : 2026-09-21

   Historique Dracénie conservé : catégorie C -> sort1 = 12
   uniquement si sort1 est vide.

   Extension PMK :
   - plusieurs règles ;
   - catégories d'adhérents proposées depuis l'API Koha ;
   - choix sort1 / sort2 ;
   - catégories et valeurs autorisées proposées dynamiquement ;
   - saisie manuelle de repli si l'API n'est pas accessible.
   ============================================================ */
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK124PatronCategoryDefaults) return;
    window.__PMK124PatronCategoryDefaults = true;

    const MODULE_ID = "patron-category-defaults";
    const MODULE_VERSION = "3.0.0-preplugin";
    const PAGE_PATH = "/cgi-bin/koha/members/memberentry.pl";
    const PAGE_ID = "members.memberentry";

    const DEFAULT_RULES = [
        {
            id: "legacy-child-csp",
            enabled: true,
            label: "Enfant — CSP 12",
            patronCategory: "C",
            targetField: "sort1",
            authorisedValueCategory: "",
            authorisedValue: "",
            manualValue: "12",
            onlyIfEmpty: true
        }
    ];

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        rules: clone(DEFAULT_RULES)
    });

    const catalogs = {
        patronCategories: [{ value: "C", label: { fr: "C — Enfant (historique)", en: "C — Child (legacy)" } }],
        authorisedCategories: [],
        authorisedValues: new Map(),
        loading: null
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribe = null;
    let formObserver = null;

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function clean(value) { return String(value == null ? "" : value).trim(); }
    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") return window.PMKConfig.getLanguage();
        return String(document.documentElement.lang || navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function makeId() {
        return "patron-default-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    }

    function normalizeRule(raw, index) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            id: clean(source.id) || ("patron-default-" + (index + 1)),
            enabled: source.enabled !== false,
            label: clean(source.label) || ("Règle " + (index + 1)),
            patronCategory: clean(source.patronCategory),
            targetField: source.targetField === "sort2" ? "sort2" : "sort1",
            authorisedValueCategory: clean(source.authorisedValueCategory),
            authorisedValue: clean(source.authorisedValue),
            manualValue: clean(source.manualValue),
            onlyIfEmpty: source.onlyIfEmpty !== false
        };
    }

    function normalizeConfig(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const rules = Array.isArray(source.rules) ? source.rules.map(normalizeRule) : clone(DEFAULT_RULES).map(normalizeRule);
        return { enabled: source.enabled !== false, rules: rules };
    }

    async function fetchJson(url, headers) {
        const response = await fetch(url, {
            credentials: "same-origin",
            headers: Object.assign({ "Accept": "application/json" }, headers || {})
        });
        if (!response.ok) {
            const error = new Error("Koha API " + response.status + " — " + url);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    async function prefetchCatalogs() {
        if (catalogs.loading) return catalogs.loading;
        catalogs.loading = Promise.allSettled([
            fetchJson("/api/v1/patron_categories?_per_page=500&_order_by=name"),
            fetchJson("/api/v1/authorised_value_categories?_per_page=500&_order_by=category_name", {
                "x-koha-embed": "authorised_values"
            })
        ]).then(function (results) {
            const patronResult = results[0];
            if (patronResult.status === "fulfilled" && Array.isArray(patronResult.value)) {
                const seen = new Set();
                catalogs.patronCategories = patronResult.value.map(function (row) {
                    const value = clean(row && (row.patron_category_id || row.categorycode));
                    const name = clean(row && (row.name || row.description));
                    if (!value || seen.has(value)) return null;
                    seen.add(value);
                    const display = name ? value + " — " + name : value;
                    return { value: value, label: { fr: display, en: display } };
                }).filter(Boolean);
                if (!seen.has("C")) catalogs.patronCategories.unshift({ value: "C", label: { fr: "C — valeur historique", en: "C — legacy value" } });
            }

            const avResult = results[1];
            if (avResult.status === "fulfilled" && Array.isArray(avResult.value)) {
                catalogs.authorisedCategories = [];
                catalogs.authorisedValues.clear();
                avResult.value.forEach(function (row) {
                    const name = clean(row && row.category_name);
                    if (!name) return;
                    catalogs.authorisedCategories.push({ value: name, label: { fr: name, en: name } });
                    const values = Array.isArray(row.authorised_values) ? row.authorised_values : [];
                    catalogs.authorisedValues.set(name, values.map(function (entry) {
                        const value = clean(entry && entry.value);
                        const description = clean(entry && (entry.description || entry.opac_description));
                        return {
                            value: value,
                            label: { fr: description ? value + " — " + description : value, en: description ? value + " — " + description : value }
                        };
                    }).filter(function (entry) { return entry.value; }));
                });
                catalogs.authorisedCategories.sort(function (a, b) { return a.value.localeCompare(b.value, language()); });
            }
            return catalogs;
        }).finally(function () { catalogs.loading = null; });
        return catalogs.loading;
    }

    function ruleFromPath(root, path) {
        if (!root || !Array.isArray(root.rules) || !Array.isArray(path)) return null;
        const pos = path.indexOf("rules");
        if (pos < 0) return null;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? root.rules[index] : null;
    }

    function optionWithCurrent(list, current, emptyLabel) {
        const result = [{ value: "", label: emptyLabel }].concat(list || []);
        if (current && !result.some(function (entry) { return String(entry.value) === String(current); })) {
            result.push({ value: current, label: { fr: current + " — valeur actuelle", en: current + " — current value" } });
        }
        return result;
    }

    function patronCategoryOptions(root, path) {
        const rule = ruleFromPath(root, path);
        return optionWithCurrent(catalogs.patronCategories, rule && rule.patronCategory, { fr: "— Choisir une catégorie —", en: "— Choose a category —" });
    }

    function authorisedCategoryOptions(root, path) {
        const rule = ruleFromPath(root, path);
        return optionWithCurrent(catalogs.authorisedCategories, rule && rule.authorisedValueCategory, { fr: "— Aucune / valeur manuelle —", en: "— None / manual value —" });
    }

    function authorisedValueOptions(root, path) {
        const rule = ruleFromPath(root, path);
        const category = clean(rule && rule.authorisedValueCategory);
        const values = category ? (catalogs.authorisedValues.get(category) || []) : [];
        return optionWithCurrent(values, rule && rule.authorisedValue, { fr: "— Choisir une valeur —", en: "— Choose a value —" });
    }

    function chosenValue(rule) {
        if (clean(rule.authorisedValueCategory)) return clean(rule.authorisedValue);
        return clean(rule.manualValue);
    }

    function dispatchChange(element) {
        element.dispatchEvent(new Event("change", { bubbles: true }));
        if (window.jQuery) {
            try { window.jQuery(element).trigger("change.select2"); } catch (_) {}
        }
    }

    function isEmptyValue(value) {
        const cleaned = clean(value);
        return cleaned === "" || cleaned === "0";
    }

    function applyRules() {
        if (window.location.pathname !== PAGE_PATH || currentConfig.enabled === false) return;
        const form = document.getElementById("entryform");
        if (!form) return;
        const categorySelect = form.querySelector("#categorycode_entry, #categorycode");
        if (!categorySelect) return;
        const category = clean(categorySelect.value);

        currentConfig.rules.forEach(function (rule) {
            if (!rule || rule.enabled === false || clean(rule.patronCategory) !== category) return;
            const target = form.querySelector("#" + CSS.escape(rule.targetField));
            if (!target) return;
            if (rule.onlyIfEmpty && !isEmptyValue(target.value)) return;
            const value = chosenValue(rule);
            if (!value) return;

            // Si le select ne contient pas encore la valeur (chargement Select2 tardif),
            // on ne crée pas de valeur artificielle : on réessaiera via l'observer.
            if (target.tagName === "SELECT" && !Array.from(target.options).some(function (option) { return String(option.value) === value; })) {
                return;
            }
            if (String(target.value) === value) return;
            target.value = value;
            dispatchChange(target);
        });
    }

    function bindRuntime() {
        if (window.location.pathname !== PAGE_PATH) return;
        const form = document.getElementById("entryform");
        if (!form) return;
        const category = form.querySelector("#categorycode_entry, #categorycode");
        if (category && !category.dataset.pmk124Bound) {
            category.dataset.pmk124Bound = "1";
            category.addEventListener("change", function () { window.setTimeout(applyRules, 0); });
        }
        if (!formObserver && typeof MutationObserver === "function") {
            formObserver = new MutationObserver(function () { window.requestAnimationFrame(applyRules); });
            formObserver.observe(form, { childList: true, subtree: true });
        }
        applyRules();
    }

    function newRule() {
        return {
            id: makeId(),
            enabled: true,
            label: "Nouvelle règle",
            patronCategory: "",
            targetField: "sort1",
            authorisedValueCategory: "",
            authorisedValue: "",
            manualValue: "",
            onlyIfEmpty: true
        };
    }

    function validate(config) {
        const cfg = normalizeConfig(config);
        const ids = new Set();
        for (const rule of cfg.rules) {
            if (ids.has(rule.id)) return { ok: false, message: "Chaque règle doit avoir un identifiant unique." };
            ids.add(rule.id);
            if (rule.enabled && !rule.patronCategory) return { ok: false, message: "Une règle active doit préciser une catégorie d’adhérent." };
            if (rule.enabled && !chosenValue(rule)) return { ok: false, message: "Une règle active doit préciser une valeur à appliquer." };
        }
        return { ok: true };
    }

    function definition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Valeurs par défaut selon la catégorie d’adhérent", en: "Defaults by patron category" },
            description: {
                fr: "Préremplit sort1 ou sort2 selon la catégorie d’adhérent. Les catégories d’adhérents et les valeurs autorisées sont proposées depuis l’API Koha, avec saisie manuelle de repli.",
                en: "Prefills sort1 or sort2 from the patron category. Patron categories and authorised values are loaded from the Koha API, with a manual fallback."
            },
            category: { fr: "Lecteurs / saisie", en: "Patrons / entry" },
            supportedPages: [PAGE_ID],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Règles de préremplissage", en: "Prefill rules" },
                    description: {
                        fr: "Par défaut : catégorie C → sort1 = 12, uniquement si sort1 est vide. Les listes Koha sont préchargées depuis les API REST ; si les droits ne permettent pas leur lecture, les codes actuels restent utilisables.",
                        en: "Default: category C → sort1 = 12, only when sort1 is empty. Koha lists are preloaded from REST APIs; current codes remain usable if API permissions prevent loading them."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Règles", en: "Rules" },
                            addLabel: { fr: "Ajouter une règle", en: "Add rule" },
                            reorder: true,
                            newItem: newRule,
                            itemTitle: function (item, index) { return clean(item && item.label) || ("Règle " + (index + 1)); },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom", en: "Name" } },
                                {
                                    key: "patronCategory",
                                    type: "select",
                                    label: { fr: "Catégorie d’adhérent", en: "Patron category" },
                                    options: patronCategoryOptions
                                },
                                {
                                    key: "targetField",
                                    type: "select",
                                    label: { fr: "Champ à préremplir", en: "Field to prefill" },
                                    options: [
                                        { value: "sort1", label: { fr: "sort1 — catégorie statistique 1", en: "sort1 — statistical category 1" } },
                                        { value: "sort2", label: { fr: "sort2 — catégorie statistique 2", en: "sort2 — statistical category 2" } }
                                    ]
                                },
                                {
                                    key: "authorisedValueCategory",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Catégorie de valeurs autorisées Koha", en: "Koha authorised-value category" },
                                    options: authorisedCategoryOptions,
                                    help: { fr: "Facultatif. Si aucune catégorie n’est choisie, utilisez la valeur manuelle.", en: "Optional. If no category is selected, use the manual value." }
                                },
                                {
                                    key: "authorisedValue",
                                    type: "select",
                                    label: { fr: "Valeur autorisée", en: "Authorised value" },
                                    options: authorisedValueOptions,
                                    help: { fr: "Liste dépendante de la catégorie choisie ci-dessus.", en: "List depends on the category selected above." }
                                },
                                {
                                    key: "manualValue",
                                    type: "text",
                                    label: { fr: "Valeur manuelle de repli", en: "Manual fallback value" },
                                    help: { fr: "Utilisée lorsqu’aucune catégorie de valeurs autorisées n’est sélectionnée. Valeur historique : 12.", en: "Used when no authorised-value category is selected. Historical value: 12." }
                                },
                                { key: "onlyIfEmpty", type: "boolean", label: { fr: "Ne remplir que si le champ est vide", en: "Only fill when the field is empty" } }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(definition()); } catch (_) { return false; }
        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (cfg) { currentConfig = normalizeConfig(cfg); applyRules(); }); } catch (_) {}
        }
        return true;
    }

    async function start() {
        registerModule();
        // Les listes dynamiques ne servent qu'à la configuration PMK, réservée
        // au super-administrateur. On évite ainsi des appels API inutiles (et
        // d'éventuels 403) sur les postes des agents ordinaires.
        const mayConfigure = !window.PMKConfig || typeof window.PMKConfig.isKohaSuperlibrarian !== "function"
            ? false
            : window.PMKConfig.isKohaSuperlibrarian();
        if (mayConfigure) {
            prefetchCatalogs().catch(function (error) { console.info("[PMK124] Listes Koha non préchargées", error); });
        }
        if (window.PMKConfig && typeof window.PMKConfig.getConfig === "function") {
            try { currentConfig = normalizeConfig(await window.PMKConfig.getConfig(MODULE_ID)); } catch (_) {}
        }
        bindRuntime();
    }

    window.PMK124PatronCategoryDefaults = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        refreshCatalogs: function () { catalogs.loading = null; return prefetchCatalogs(); },
        refresh: applyRules
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    if (!window.PMKConfig) window.addEventListener("pmk:config-ready", registerModule, { once: true });
})(window, document);
