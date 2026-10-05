/*
 Nom du fichier: 050-line-counter.js
 Version: 3.1.0-pmk-isolated
 Date de dernière modification: 2026-09-19
 Auteur: Michael Mundet / refonte préparatoire PimpMyKoha
 Description:
   Compteur compact pour les champs Koha contenant une liste multi-lignes.

   Refonte préparatoire PimpMyKoha :
   - conserve les deux usages historiques : batchMod.pl et guided_reports.pl ;
   - compte les lignes non vides, les valeurs uniques et les doublons ;
   - traite toutes les zones sql_params d'un rapport, pas seulement la première ;
   - ajoute deux adaptateurs préparés mais désactivés : inventaire et prêt par lot ;
   - permet d'ajouter librement d'autres pages Koha et d'autres zones multiligne depuis la configuration PMK ;
   - configuration via PMKConfig, avec valeurs par défaut locales en secours ;
   - affichage compact, responsive, FR/EN et intégré visuellement à Koha ;
   - idempotent : pas de compteur ni d'événement dupliqué ;
   - aucun console.* et aucun appel réseau propre au module.
*/
(function () {
    "use strict";

    const MODULE_ID = "multiline-list-counter";
    const SCRIPT_GUARD = "__pmk050MultilineListCounterV3";
    const STYLE_ID = "pmk050-line-counter-style";
    const COUNTER_ATTR = "data-pmk050-counter";
    const BOUND_ATTR = "data-pmk050-bound";
    const DESCRIBEDBY_ATTR = "data-pmk050-describedby-added";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    const DEFAULTS = {
        enabled: true,
        display: {
            showTotal: true,
            showUnique: true,
            showDuplicates: true,
            hideZeroDuplicates: true
        },
        pages: [
            {
                id: "tools.batchmod",
                enabled: true,
                path: "/cgi-bin/koha/tools/batchMod.pl",
                query: "",
                labelFr: "Modification d'exemplaires par lot",
                labelEn: "Batch item modification",
                fields: [
                    {
                        id: "barcodelist",
                        enabled: true,
                        labelFr: "Liste de codes-barres",
                        labelEn: "Barcode list",
                        selector: "#barcodelist",
                        multiple: false
                    }
                ]
            },
            {
                id: "reports.guided_reports",
                enabled: true,
                path: "/cgi-bin/koha/reports/guided_reports.pl",
                query: "",
                labelFr: "Rapports",
                labelEn: "Reports",
                fields: [
                    {
                        id: "sql-list-parameters",
                        enabled: true,
                        labelFr: "Paramètres de type liste",
                        labelEn: "List parameters",
                        selector: "textarea[name=\"sql_params\"]",
                        multiple: true
                    }
                ]
            },
            {
                id: "tools.inventory",
                enabled: false,
                path: "/cgi-bin/koha/tools/inventory.pl",
                query: "",
                labelFr: "Inventaire",
                labelEn: "Inventory",
                fields: [
                    {
                        id: "barcodelist",
                        enabled: true,
                        labelFr: "Liste de codes-barres",
                        labelEn: "Barcode list",
                        selector: "#barcodelist",
                        multiple: false
                    }
                ]
            },
            {
                id: "circ.batch_checkouts",
                enabled: false,
                path: "/cgi-bin/koha/circ/circulation.pl",
                query: "batch=1",
                labelFr: "Prêt par lot",
                labelEn: "Batch checkout",
                fields: [
                    {
                        id: "barcodelist",
                        enabled: true,
                        labelFr: "Liste de codes-barres",
                        labelEn: "Barcode list",
                        selector: "#barcodelist",
                        multiple: false
                    }
                ]
            }
        ]
    };


    let currentConfig = clone(DEFAULTS);
    let observer = null;
    let observerTimer = 0;
    let configSubscribed = false;

    const bindings = new Map();

    function clone(value) {
        try {
            if (typeof structuredClone === "function") return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }

    function deepMerge(target, source) {
        const out = target && typeof target === "object" ? target : {};
        if (!source || typeof source !== "object") return out;

        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) {
                out[key] = clone(value);
            } else if (value && typeof value === "object") {
                const base = out[key] && typeof out[key] === "object" && !Array.isArray(out[key]) ? out[key] : {};
                out[key] = deepMerge(base, value);
            } else {
                out[key] = value;
            }
        });
        return out;
    }

    function normalizeField(field, pageIndex, fieldIndex) {
        const fallback = {
            id: "field-" + (pageIndex + 1) + "-" + (fieldIndex + 1),
            enabled: true,
            labelFr: "Champ de liste",
            labelEn: "List field",
            selector: "",
            multiple: false
        };
        const value = deepMerge(fallback, field && typeof field === "object" ? clone(field) : {});
        value.id = String(value.id || fallback.id);
        value.enabled = value.enabled !== false;
        value.labelFr = String(value.labelFr || "").trim();
        value.labelEn = String(value.labelEn || "").trim();
        value.selector = String(value.selector || "").trim();
        value.multiple = value.multiple === true;
        return value;
    }

    function normalizePage(page, index) {
        const fallback = DEFAULTS.pages[index] || {
            id: "page-" + (index + 1),
            enabled: false,
            path: "",
            query: "",
            labelFr: "Page Koha",
            labelEn: "Koha page",
            fields: []
        };
        const value = deepMerge(clone(fallback), page && typeof page === "object" ? clone(page) : {});
        value.id = String(value.id || fallback.id);
        value.enabled = value.enabled !== false;
        value.path = String(value.path || fallback.path || "").trim();
        value.query = String(value.query || "").trim();
        value.labelFr = String(value.labelFr || fallback.labelFr || "").trim();
        value.labelEn = String(value.labelEn || fallback.labelEn || "").trim();
        value.fields = Array.isArray(value.fields)
            ? value.fields.map(function (field, fieldIndex) { return normalizeField(field, index, fieldIndex); })
            : clone(fallback.fields || []).map(function (field, fieldIndex) { return normalizeField(field, index, fieldIndex); });
        return value;
    }

    function normalizeConfig(config) {
        const merged = deepMerge(clone(DEFAULTS), config && typeof config === "object" ? clone(config) : {});
        merged.enabled = merged.enabled !== false;
        merged.display = deepMerge(clone(DEFAULTS.display), merged.display || {});
        merged.display.showTotal = merged.display.showTotal !== false;
        merged.display.showUnique = merged.display.showUnique !== false;
        merged.display.showDuplicates = merged.display.showDuplicates !== false;
        merged.display.hideZeroDuplicates = merged.display.hideZeroDuplicates !== false;

        const incomingPages = Array.isArray(merged.pages) ? merged.pages : [];
        const knownIds = new Set(DEFAULTS.pages.map(function (page) { return page.id; }));
        const normalizedDefaults = DEFAULTS.pages.map(function (defaultPage, index) {
            const saved = incomingPages.find(function (page) { return page && page.id === defaultPage.id; });
            return normalizePage(saved || defaultPage, index);
        });
        const customPages = incomingPages
            .filter(function (page) { return page && !knownIds.has(String(page.id || "")); })
            .map(function (page, offset) { return normalizePage(page, DEFAULTS.pages.length + offset); })
            .filter(function (page) { return /^\/cgi-bin\/koha\//.test(page.path); });
        merged.pages = normalizedDefaults.concat(customPages);

        return merged;
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function language() {
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try {
                const detected = String(api.getLanguage() || "").toLowerCase();
                if (detected.startsWith("en")) return "en";
                if (detected.startsWith("fr")) return "fr";
            } catch (_) {}
        }
        return String(document.documentElement.getAttribute("lang") || "").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function labels() {
        if (language() === "en") {
            return {
                valueOne: "value",
                valueMany: "values",
                uniqueOne: "unique",
                uniqueMany: "unique",
                duplicateOne: "duplicate",
                duplicateMany: "duplicates"
            };
        }
        return {
            valueOne: "valeur",
            valueMany: "valeurs",
            uniqueOne: "unique",
            uniqueMany: "uniques",
            duplicateOne: "doublon",
            duplicateMany: "doublons"
        };
    }

    function pageMatches(page) {
        if (!page || page.enabled === false || page.path !== window.location.pathname) return false;
        if (!page.query) return true;

        try {
            const expected = new URLSearchParams(page.query);
            const actual = new URLSearchParams(window.location.search);
            for (const pair of expected.entries()) {
                if (actual.get(pair[0]) !== pair[1]) return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    function currentPageConfig(config) {
        if (!config || !Array.isArray(config.pages)) return null;
        return config.pages.find(pageMatches) || null;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk050-counter {
                display: inline-flex;
                flex-wrap: wrap;
                align-items: center;
                gap: .12rem .38rem;
                width: fit-content;
                max-width: 100%;
                margin: .22rem 0 .38rem;
                padding: .16rem .42rem;
                border: 1px solid rgba(0,0,0,.09);
                border-radius: .35rem;
                background: rgba(0,0,0,.025);
                color: var(--bs-secondary-color, #59636d);
                font-size: .79rem;
                line-height: 1.25;
                vertical-align: middle;
                box-sizing: border-box;
            }
            .pmk050-counter[hidden] {
                display: none !important;
            }
            .pmk050-stats {
                display: inline-flex;
                flex-wrap: wrap;
                align-items: center;
                gap: .12rem .38rem;
                min-width: 0;
            }
            .pmk050-stat {
                display: inline-flex;
                align-items: baseline;
                gap: .18rem;
                min-width: 0;
                white-space: nowrap;
            }
            .pmk050-stat + .pmk050-stat::before {
                content: "·";
                margin-inline-end: .18rem;
                color: rgba(0,0,0,.35);
                font-weight: 400;
            }
            .pmk050-stat strong {
                color: var(--bs-body-color, #212529);
                font-size: .86rem;
                font-weight: 650;
            }
            .pmk050-stat.pmk050-duplicates.is-positive {
                color: var(--bs-warning-text-emphasis, #744c00);
            }
            .pmk050-stat.pmk050-duplicates.is-positive strong {
                color: inherit;
            }
            .pmk050-counter .pmk-context-config {
                margin: 0 0 0 .05rem !important;
                padding: 0 .12rem !important;
                min-width: 1.35rem;
                min-height: 1.35rem;
                line-height: 1.1;
                font-size: .76rem;
                opacity: .62;
                vertical-align: middle;
            }
            .pmk050-counter .pmk-context-config:hover,
            .pmk050-counter .pmk-context-config:focus-visible {
                opacity: 1;
            }
            @media (max-width: 768px) {
                .pmk050-counter {
                    display: flex;
                    width: 100%;
                    gap: .14rem .34rem;
                    font-size: .78rem;
                }
                .pmk050-stat {
                    white-space: normal;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function analyze(value) {
        const lines = String(value || "").split(/\r?\n/);
        let total = 0;
        const unique = new Set();

        lines.forEach(function (line) {
            const normalized = String(line || "").trim();
            if (!normalized) return;
            total += 1;
            unique.add(normalized);
        });

        return {
            total: total,
            unique: unique.size,
            duplicates: Math.max(0, total - unique.size)
        };
    }

    function word(count, singular, plural) {
        return count === 1 ? singular : plural;
    }

    function createStat(className) {
        const span = document.createElement("span");
        span.className = "pmk050-stat " + className;

        const count = document.createElement("strong");
        count.className = "pmk050-count";
        const text = document.createElement("span");
        text.className = "pmk050-label";

        span.append(count, text);
        return span;
    }

    function counterId(pageId, fieldId, index) {
        return "pmk050-counter-" + String(pageId + "-" + fieldId + "-" + index)
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function ensureAriaDescription(textarea, counter) {
        if (!textarea || !counter || !counter.id) return;
        const current = String(textarea.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
        if (!current.includes(counter.id)) {
            current.push(counter.id);
            textarea.setAttribute("aria-describedby", current.join(" "));
            textarea.setAttribute(DESCRIBEDBY_ATTR, counter.id);
        }
    }

    function removeAriaDescription(textarea) {
        if (!textarea) return;
        const added = textarea.getAttribute(DESCRIBEDBY_ATTR);
        if (!added) return;
        const current = String(textarea.getAttribute("aria-describedby") || "")
            .split(/\s+/)
            .filter(Boolean)
            .filter(function (id) { return id !== added; });
        if (current.length) textarea.setAttribute("aria-describedby", current.join(" "));
        else textarea.removeAttribute("aria-describedby");
        textarea.removeAttribute(DESCRIBEDBY_ATTR);
    }

    function renderCounter(binding) {
        if (!binding || !binding.textarea || !binding.counter) return;

        const counts = analyze(binding.textarea.value);
        const l = labels();
        const display = currentConfig.display || DEFAULTS.display;
        const counter = binding.counter;
        let stats = counter.querySelector(".pmk050-stats");
        if (!stats) {
            stats = document.createElement("span");
            stats.className = "pmk050-stats";
            counter.prepend(stats);
        }
        stats.replaceChildren();

        if (display.showTotal !== false) {
            const stat = createStat("pmk050-total");
            stat.querySelector(".pmk050-count").textContent = String(counts.total);
            stat.querySelector(".pmk050-label").textContent = word(counts.total, l.valueOne, l.valueMany);
            stats.appendChild(stat);
        }

        if (display.showUnique !== false) {
            const stat = createStat("pmk050-unique");
            stat.querySelector(".pmk050-count").textContent = String(counts.unique);
            stat.querySelector(".pmk050-label").textContent = word(counts.unique, l.uniqueOne, l.uniqueMany);
            stats.appendChild(stat);
        }

        if (display.showDuplicates !== false && !(display.hideZeroDuplicates !== false && counts.duplicates === 0)) {
            const stat = createStat("pmk050-duplicates" + (counts.duplicates > 0 ? " is-positive" : ""));
            stat.querySelector(".pmk050-count").textContent = String(counts.duplicates);
            stat.querySelector(".pmk050-label").textContent = word(counts.duplicates, l.duplicateOne, l.duplicateMany);
            stats.appendChild(stat);
        }

        if (!stats.children.length) {
            counter.hidden = true;
            return;
        }
        counter.hidden = false;

        mountContextShortcut(binding);
    }

    function mountContextShortcut(binding) {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function" || !binding || !binding.counter) return;

        api.mountContextButton({
            moduleId: MODULE_ID,
            anchor: binding.counter,
            position: "append",
            contextKey: binding.contextKey,
            context: {
                sectionId: "pages",
                pageId: binding.pageId,
                fieldId: binding.fieldId
            }
        });
    }

    function unbindTextarea(textarea) {
        const binding = bindings.get(textarea);
        if (!binding) return;

        try { textarea.removeEventListener("input", binding.onInput); } catch (_) {}
        removeAriaDescription(textarea);
        textarea.removeAttribute(BOUND_ATTR);

        if (binding.counter && binding.counter.parentNode) {
            binding.counter.remove();
        }
        bindings.delete(textarea);
    }

    function clearBindings() {
        Array.from(bindings.keys()).forEach(unbindTextarea);
        document.querySelectorAll("[" + COUNTER_ATTR + "]").forEach(function (counter) {
            counter.remove();
        });
    }

    function bindTextarea(textarea, page, field, fieldIndex, targetIndex) {
        if (!(textarea instanceof HTMLTextAreaElement)) return;

        const existing = bindings.get(textarea);
        const key = page.id + "|" + field.id + "|" + targetIndex;
        if (existing && existing.bindingKey === key) {
            existing.pageId = page.id;
            existing.fieldId = field.id;
            renderCounter(existing);
            return;
        }
        if (existing) unbindTextarea(textarea);

        const counter = document.createElement("div");
        counter.id = counterId(page.id, field.id, targetIndex);
        counter.className = "pmk050-counter";
        counter.setAttribute(COUNTER_ATTR, "1");
        counter.setAttribute("aria-label", language() === "en" ? "List count" : "Comptage de la liste");

        textarea.insertAdjacentElement("afterend", counter);
        textarea.setAttribute(BOUND_ATTR, key);
        ensureAriaDescription(textarea, counter);

        const binding = {
            textarea: textarea,
            counter: counter,
            bindingKey: key,
            pageId: page.id,
            fieldId: field.id,
            contextKey: page.id + "-" + field.id + "-" + targetIndex,
            onInput: null
        };

        binding.onInput = function () {
            renderCounter(binding);
        };

        textarea.addEventListener("input", binding.onInput);
        bindings.set(textarea, binding);
        renderCounter(binding);
    }

    function safeQueryAll(selector) {
        if (!selector) return [];
        try {
            return Array.from(document.querySelectorAll(selector));
        } catch (_) {
            return [];
        }
    }

    function applyPage(page) {
        if (!page || !Array.isArray(page.fields)) return;

        page.fields.forEach(function (field, fieldIndex) {
            if (!field || field.enabled === false || !field.selector) return;

            const targets = safeQueryAll(field.selector).filter(function (node) {
                return node instanceof HTMLTextAreaElement;
            });
            if (!targets.length) return;

            const selected = field.multiple === true ? targets : targets.slice(0, 1);
            selected.forEach(function (textarea, targetIndex) {
                bindTextarea(textarea, page, field, fieldIndex, targetIndex);
            });
        });
    }

    function refresh() {
        stopObserver();

        if (!currentConfig.enabled) {
            clearBindings();
            return;
        }

        const page = currentPageConfig(currentConfig);
        if (!page) {
            clearBindings();
            return;
        }

        injectStyles();

        /*
         * refresh() est appelé lors d'un changement de configuration : on
         * reconstruit alors les liaisons pour que désactivation, suppression
         * ou changement de cible soient pris en compte immédiatement.
         * Les simples mutations DOM utilisent scheduleRefresh() et ne passent
         * pas ici, ce qui évite le clignotement pendant l'usage normal.
         */
        clearBindings();
        applyPage(page);
        startObserver(page);
    }

    function scheduleRefresh() {
        window.clearTimeout(observerTimer);
        observerTimer = window.setTimeout(function () {
            observerTimer = 0;
            const page = currentPageConfig(currentConfig);
            if (!page || !currentConfig.enabled) return;
            applyPage(page);
        }, 80);
    }

    function startObserver(page) {
        if (!page || observer || typeof MutationObserver !== "function") return;

        const root = document.querySelector("main") || document.body;
        if (!root) return;

        observer = new MutationObserver(function (mutations) {
            let relevant = false;

            for (const mutation of mutations) {
                if (mutation.type !== "childList") continue;
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches && node.matches("textarea")) {
                        relevant = true;
                        break;
                    }
                    if (node.querySelector && node.querySelector("textarea")) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }

            if (relevant) scheduleRefresh();
        });

        observer.observe(root, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (!observer) return;
        try { observer.disconnect(); } catch (_) {}
        observer = null;
    }

    function useConfig(config) {
        currentConfig = normalizeConfig(config);
        refresh();
    }

    function connectPmkConfig() {
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            useConfig(DEFAULTS);
            return false;
        }

        if (!configSubscribed && typeof api.subscribe === "function") {
            try {
                api.subscribe(MODULE_ID, function (config) {
                    useConfig(config);
                });
                configSubscribed = true;
            } catch (_) {}
        }

        api.getConfig(MODULE_ID)
            .then(useConfig)
            .catch(function () {
                useConfig(DEFAULTS);
            });

        return true;
    }

    function start() {
        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
