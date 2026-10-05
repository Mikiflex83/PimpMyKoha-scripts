/*
 Nom du fichier: 070-date-utils.js
 Module PMK: Dates relatives
 ID PMK: relative-dates
 Version: 2.4.0-pmk-isolated
 Date de dernière modification: 2026-09-22

 Historique / consolidation:
 - conserve l'API historique window.VC_DATE_UTILS ;
 - absorbe la fonction métier de 081-holdings-table-durations-detail.js ;
 - absorbe les améliorations utiles de 100-koha-age-insertion-split.js ;
 - fournit par défaut les trois règles historiques :
   * Date d'acquisition ;
   * Date du dernier emprunt ;
   * Vu en dernier ;
 - traite #holdings_table et #otherholdings_table ;
 - fonctionne sans jQuery ;
 - s'enregistre directement dans PMK sans modifier le socle 000 ;
 - v2.2.0 : ajoute un saut de ligne configurable avant/après/autour du résultat des règles « Élément libre ».
 - v2.3.0 : le picker sait convertir une cellule <td> sans id/classe en ciblage stable de toute sa colonne dans le tableau.
   - v2.4.0 : calcul relatif calendaire précis (années, mois puis jours restants), sans approximation 30,44/365,25.
*/

(function () {
    "use strict";

    const MODULE_ID = "relative-dates";
    const MODULE_VERSION = "2.4.0-pmk-isolated";
    const SCRIPT_GUARD = "__pmk070RelativeDatesV24";
    const STYLE_ID = "pmk070-relative-dates-style";
    const GENERATED_ATTR = "data-pmk-relative-date-generated";
    const DETAIL_PATH = "/cgi-bin/koha/catalogue/detail.pl";
    const DETAIL_PAGE_ID = "catalogue.detail";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    const DEFAULTS = {
        enabled: true,
        pages: {
            detail: {
                enabled: true,
                pageId: DETAIL_PAGE_ID,
                path: DETAIL_PATH
            }
        },
        display: {
            className: "vc-age",
            wrapInParentheses: false,
            pastPrefixFr: "il y a ",
            futurePrefixFr: "dans ",
            instantFr: "à l’instant",
            pastSuffixEn: " ago",
            futurePrefixEn: "in ",
            instantEn: "just now"
        },
        behavior: {
            observeDynamicChanges: true,
            observeDelayMs: 100,
            waitTimeoutMs: 5000
        },
        rules: [
            {
                id: "holdings-acquisition-date",
                enabled: true,
                targetMode: "tableColumn",
                labelFr: "Date d’acquisition",
                labelEn: "Acquisition date",
                pagePath: DETAIL_PATH,
                tableSelector: "#holdings_table, #otherholdings_table",
                columnName: "dateaccessioned",
                headerAliases: "date d'acquisition|date d’acquisition|acquisition|acquisition date",
                parserMode: "date"
            },
            {
                id: "holdings-last-checkout-date",
                enabled: true,
                targetMode: "tableColumn",
                labelFr: "Date du dernier emprunt",
                labelEn: "Last checkout date",
                pagePath: DETAIL_PATH,
                tableSelector: "#holdings_table, #otherholdings_table",
                columnName: "datelastborrowed",
                headerAliases: "date du dernier emprunt|dernier emprunt|last checkout|last borrowed",
                parserMode: "date"
            },
            {
                id: "holdings-last-seen-date",
                enabled: true,
                targetMode: "tableColumn",
                labelFr: "Vu en dernier",
                labelEn: "Last seen",
                pagePath: DETAIL_PATH,
                tableSelector: "#holdings_table, #otherholdings_table",
                columnName: "lastseen",
                headerAliases: "vu en dernier|dernière consultation|derniere consultation|last seen",
                parserMode: "datetime"
            }
        ]
    };

    let currentConfig = clone(DEFAULTS);
    let pmkRegistered = false;
    let unsubscribe = null;
    let observer = null;
    let observerTimer = null;
    let started = false;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function object(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function merge(base, extra) {
        const out = clone(base);
        if (!extra || typeof extra !== "object") return out;
        Object.keys(extra).forEach(function (key) {
            const incoming = extra[key];
            if (Array.isArray(incoming)) {
                out[key] = clone(incoming);
            } else if (
                incoming && typeof incoming === "object" && !Array.isArray(incoming) &&
                out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
            ) {
                out[key] = merge(out[key], incoming);
            } else if (incoming !== undefined) {
                out[key] = incoming;
            }
        });
        return out;
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.round(number)));
    }

    function normalizeText(value) {
        return clean(value)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[’‘`]/g, "'")
            .replace(/\s+/g, " ");
    }

    function validLocalDate(year, month, day, hour, minute, second) {
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        const h = Number(hour || 0);
        const min = Number(minute || 0);
        const sec = Number(second || 0);

        if (![y, m, d, h, min, sec].every(Number.isFinite)) return null;
        if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
        if (h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;

        const date = new Date(y, m - 1, d, h, min, sec, 0);
        if (
            date.getFullYear() !== y ||
            date.getMonth() !== m - 1 ||
            date.getDate() !== d ||
            date.getHours() !== h ||
            date.getMinutes() !== min ||
            date.getSeconds() !== sec
        ) return null;
        return date;
    }

    function parseDate(value) {
        const raw = clean(value);
        if (!raw) return null;

        let match = raw.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            return validLocalDate(match[1], match[2], match[3], match[4], match[5], match[6]);
        }

        match = raw.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            return validLocalDate(match[3], match[2], match[1], match[4], match[5], match[6]);
        }

        return null;
    }

    function parseDateFR(value) {
        return parseDate(value);
    }

    function parseDateTimeFR(value) {
        return parseDate(value);
    }

    function language() {
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try { return api.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const htmlLang = clean(document.documentElement.getAttribute("lang")).toLowerCase();
        if (htmlLang.indexOf("en") === 0) return "en";
        const navLang = clean(navigator.language).toLowerCase();
        return navLang.indexOf("en") === 0 ? "en" : "fr";
    }

    function unitLabel(value, unit, lang) {
        const n = Math.max(0, Math.floor(Math.abs(value)));
        if (lang === "en") {
            const names = {
                year: n === 1 ? "year" : "years",
                month: n === 1 ? "month" : "months",
                day: n === 1 ? "day" : "days",
                hour: n === 1 ? "hour" : "hours",
                minute: n === 1 ? "minute" : "minutes"
            };
            return n + " " + names[unit];
        }
        const names = {
            year: n === 1 ? "an" : "ans",
            month: "mois",
            day: n === 1 ? "jour" : "jours",
            hour: n === 1 ? "heure" : "heures",
            minute: n === 1 ? "minute" : "minutes"
        };
        return n + " " + names[unit];
    }

    function daysInMonth(year, monthIndex) {
        return new Date(year, monthIndex + 1, 0).getDate();
    }

    function addCalendarYears(date, years) {
        const result = new Date(date.getTime());
        const originalDay = result.getDate();
        result.setDate(1);
        result.setFullYear(result.getFullYear() + years);
        result.setDate(Math.min(originalDay, daysInMonth(result.getFullYear(), result.getMonth())));
        return result;
    }

    function addCalendarMonths(date, months) {
        const result = new Date(date.getTime());
        const originalDay = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + months);
        result.setDate(Math.min(originalDay, daysInMonth(result.getFullYear(), result.getMonth())));
        return result;
    }

    function startOfLocalDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    }

    function wholeCalendarDays(from, to) {
        const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
        const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
        return Math.max(0, Math.round((b - a) / 86400000));
    }

    function calendarDifference(startDate, endDate) {
        let cursor = new Date(startDate.getTime());
        let years = 0;
        let months = 0;

        while (true) {
            const next = addCalendarYears(cursor, 1);
            if (next.getTime() > endDate.getTime()) break;
            cursor = next;
            years += 1;
        }

        while (true) {
            const next = addCalendarMonths(cursor, 1);
            if (next.getTime() > endDate.getTime()) break;
            cursor = next;
            months += 1;
        }

        const days = wholeCalendarDays(startOfLocalDay(cursor), startOfLocalDay(endDate));
        return { years: years, months: months, days: days };
    }

    function relativeParts(date, now) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        const reference = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
        const diffMs = date.getTime() - reference.getTime();
        const future = diffMs > 0;
        const absMs = Math.abs(diffMs);

        if (absMs < 60000) return { future: future, unit: "instant", value: 0, values: [] };

        const earlier = future ? reference : date;
        const later = future ? date : reference;
        const earlierDay = startOfLocalDay(earlier);
        const laterDay = startOfLocalDay(later);
        const dayGap = wholeCalendarDays(earlierDay, laterDay);

        if (dayGap === 0) {
            const minutes = Math.floor(absMs / 60000);
            const hours = Math.floor(absMs / 3600000);
            if (hours >= 1) return { future: future, unit: "hour", value: hours, values: [{ unit: "hour", value: hours }] };
            if (minutes >= 1) return { future: future, unit: "minute", value: minutes, values: [{ unit: "minute", value: minutes }] };
            return { future: future, unit: "instant", value: 0, values: [] };
        }

        const diff = calendarDifference(earlierDay, laterDay);
        const values = [];
        if (diff.years) values.push({ unit: "year", value: diff.years });
        if (diff.months) values.push({ unit: "month", value: diff.months });
        if (diff.days) values.push({ unit: "day", value: diff.days });

        if (!values.length) values.push({ unit: "day", value: dayGap });
        return {
            future: future,
            unit: values[0].unit,
            value: values[0].value,
            values: values
        };
    }

    function joinRelativeValues(parts, lang) {
        const values = Array.isArray(parts && parts.values) && parts.values.length
            ? parts.values
            : [{ unit: parts.unit, value: parts.value }];
        const labels = values.map(function (part) {
            return unitLabel(part.value, part.unit, lang);
        });
        if (labels.length <= 1) return labels[0] || "";
        if (lang === "en") return labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1];
        return labels.slice(0, -1).join(", ") + " et " + labels[labels.length - 1];
    }

    function relativeLabel(date, lang, config) {
        const cfg = normalizeConfig(config || currentConfig);
        const selectedLang = lang === "en" ? "en" : "fr";
        const parts = relativeParts(date);
        if (!parts) return "";

        if (parts.unit === "instant") {
            return selectedLang === "en" ? cfg.display.instantEn : cfg.display.instantFr;
        }

        const value = joinRelativeValues(parts, selectedLang);
        if (selectedLang === "en") {
            return parts.future
                ? cfg.display.futurePrefixEn + value
                : value + cfg.display.pastSuffixEn;
        }
        return parts.future
            ? cfg.display.futurePrefixFr + value
            : cfg.display.pastPrefixFr + value;
    }

    function tempsEcoule(date) {
        return relativeLabel(date, language(), currentConfig);
    }

    function newRule() {
        const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
        return {
            id: "relative-date-" + suffix,
            enabled: true,
            labelFr: "Nouvelle date relative",
            labelEn: "New relative date",
            pagePath: window.location.pathname || DETAIL_PATH,
            targetMode: "element",
            selector: "",
            targetName: "",
            matchCount: null,
            tableSelector: "",
            columnName: "",
            headerAliases: "",
            parserMode: "auto",
            sourceMode: "auto",
            sourceAttribute: "datetime",
            dateRegex: "",
            placement: "append",
            lineBreak: "none",
            separator: " — "
        };
    }

    function normalizeRule(rule, index) {
        const source = object(rule);
        const explicitMode = clean(source.targetMode);
        const inferredMode = explicitMode || (clean(source.selector) ? "element" : "tableColumn");
        return {
            id: clean(source.id) || "rule-" + (index + 1),
            enabled: source.enabled !== false,
            labelFr: clean(source.labelFr) || "Date relative " + (index + 1),
            labelEn: clean(source.labelEn) || "Relative date " + (index + 1),
            pagePath: clean(source.pagePath) || DETAIL_PATH,
            targetMode: inferredMode === "element" ? "element" : "tableColumn",
            selector: clean(source.selector),
            targetName: clean(source.targetName),
            matchCount: Number.isInteger(source.matchCount) ? source.matchCount : null,
            tableSelector: clean(source.tableSelector) || (inferredMode === "tableColumn" ? "#holdings_table" : ""),
            columnName: clean(source.columnName),
            headerAliases: clean(source.headerAliases),
            parserMode: ["auto", "date", "datetime"].indexOf(clean(source.parserMode)) >= 0
                ? clean(source.parserMode)
                : "auto",
            sourceMode: ["auto", "text", "value", "attribute"].indexOf(clean(source.sourceMode)) >= 0
                ? clean(source.sourceMode)
                : "auto",
            sourceAttribute: clean(source.sourceAttribute) || "datetime",
            dateRegex: clean(source.dateRegex),
            placement: ["append", "prepend", "after", "before"].indexOf(clean(source.placement)) >= 0
                ? clean(source.placement)
                : "append",
            lineBreak: ["none", "before", "after", "both"].indexOf(clean(source.lineBreak)) >= 0
                ? clean(source.lineBreak)
                : "none",
            separator: source.separator == null ? " — " : String(source.separator)
        };
    }

    function normalizeConfig(config) {
        const cfg = merge(DEFAULTS, object(config));
        cfg.enabled = cfg.enabled !== false;
        cfg.pages = merge(DEFAULTS.pages, object(cfg.pages));
        cfg.pages.detail = merge(DEFAULTS.pages.detail, object(cfg.pages.detail));
        cfg.pages.detail.enabled = cfg.pages.detail.enabled !== false;
        cfg.pages.detail.pageId = DETAIL_PAGE_ID;
        cfg.pages.detail.path = DETAIL_PATH;
        cfg.display = merge(DEFAULTS.display, object(cfg.display));
        cfg.display.className = clean(cfg.display.className) || DEFAULTS.display.className;
        cfg.display.wrapInParentheses = cfg.display.wrapInParentheses === true;
        cfg.behavior = merge(DEFAULTS.behavior, object(cfg.behavior));
        cfg.behavior.observeDynamicChanges = cfg.behavior.observeDynamicChanges !== false;
        cfg.behavior.observeDelayMs = clamp(cfg.behavior.observeDelayMs, 25, 2000, DEFAULTS.behavior.observeDelayMs);
        cfg.behavior.waitTimeoutMs = clamp(cfg.behavior.waitTimeoutMs, 500, 20000, DEFAULTS.behavior.waitTimeoutMs);
        cfg.rules = Array.isArray(cfg.rules) ? cfg.rules.map(normalizeRule) : clone(DEFAULTS.rules);
        return cfg;
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        const ids = new Set();
        for (let i = 0; i < cfg.rules.length; i += 1) {
            const rule = cfg.rules[i];
            if (!rule.id || ids.has(rule.id)) {
                return { ok: false, message: "Chaque règle doit avoir un identifiant unique." };
            }
            ids.add(rule.id);
            if (!rule.enabled) continue;
            if (!rule.pagePath) return { ok: false, message: "Chaque règle active doit indiquer une page Koha." };
            if (rule.targetMode === "element") {
                if (!rule.selector) {
                    return { ok: false, message: "Chaque règle « Élément libre » active doit cibler un élément avec le picker." };
                }
                if (rule.sourceMode === "attribute" && !rule.sourceAttribute) {
                    return { ok: false, message: "Indiquez l’attribut qui contient la date." };
                }
                if (rule.dateRegex) {
                    try { new RegExp(rule.dateRegex); }
                    catch (_) { return { ok: false, message: "L’expression régulière d’extraction de date est invalide." }; }
                }
            } else {
                if (!rule.tableSelector) return { ok: false, message: "Chaque règle de colonne active doit indiquer un tableau cible." };
                if (!rule.columnName && !rule.headerAliases) {
                    return { ok: false, message: "Chaque règle de colonne active doit indiquer un data-colname ou un libellé d’en-tête de secours." };
                }
            }
        }
        return { ok: true };
    }

    function getRuleFromPath(rootObject, fieldPath) {
        const path = Array.isArray(fieldPath) ? fieldPath : [];
        const pos = path.indexOf("rules");
        const index = pos >= 0 ? Number(path[pos + 1]) : NaN;
        if (!Number.isInteger(index) || !rootObject || !Array.isArray(rootObject.rules)) return null;
        return rootObject.rules[index] || null;
    }

    function selectorCount(selector) {
        if (!clean(selector)) return 0;
        try { return document.querySelectorAll(selector).length; } catch (_) { return 0; }
    }

    function applyPickerResult(rootObject, fieldPath, result) {
        const rule = getRuleFromPath(rootObject, fieldPath);
        if (!rule || !result) return;
        rule.pagePath = result.pagePath || rule.pagePath || window.location.pathname;
        rule.targetMode = "element";
        rule.selector = result.selector || result.value || rule.selector || "";
        rule.targetName = result.targetName || rule.targetName || "Élément Koha";
        rule.matchCount = Number.isInteger(result.matchCount)
            ? result.matchCount
            : selectorCount(rule.selector);
    }

    function pickForRule(context) {
        const ctx = context || {};
        const rule = getRuleFromPath(ctx.rootObject, ctx.fieldPath);
        const targetUrl = rule && rule.pagePath ? rule.pagePath : window.location.pathname;
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.pickForConfig !== "function") {
            return Promise.reject(new Error("shared_picker_unavailable"));
        }
        return picker.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: targetUrl,
            fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath.slice() : [],
            rootObject: ctx.rootObject || {},
            adminContext: { sectionId: "rules", pagePath: targetUrl },
            options: {
                bannerText: language() === "en"
                    ? "Click the element containing the date — Esc cancels"
                    : "Clique sur l’élément contenant la date — Échap annule"
            }
        });
    }

    function escapeCssIdent(value) {
        const raw = String(value == null ? "" : value);
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(raw);
        return raw.replace(/[^a-zA-Z0-9_-]/g, function (ch) {
            return "\\" + ch.charCodeAt(0).toString(16) + " ";
        });
    }

    function tableSelectorForCell(cell) {
        const table = cell && cell.closest ? cell.closest("table") : null;
        if (!table) return "";

        if (table.id) return "#" + escapeCssIdent(table.id);

        const stableAttrs = ["data-table", "data-testid", "aria-label", "name"];
        for (let i = 0; i < stableAttrs.length; i += 1) {
            const attr = stableAttrs[i];
            const value = clean(table.getAttribute(attr));
            if (!value) continue;
            const selector = "table[" + attr + '=\"' + value.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"') + '\"]';
            try {
                if (document.querySelectorAll(selector).length === 1) return selector;
            } catch (_) {}
        }

        const usefulClasses = Array.from(table.classList || []).filter(function (name) {
            return name && !/^(table|display|dataTable|no-footer|collapsed|responsive|dtr-inline)$/i.test(name);
        });
        for (let i = 0; i < usefulClasses.length; i += 1) {
            const selector = "table." + escapeCssIdent(usefulClasses[i]);
            try {
                if (document.querySelectorAll(selector).length === 1) return selector;
            } catch (_) {}
        }

        const tables = Array.from(document.querySelectorAll("table"));
        if (tables.length === 1 && tables[0] === table) return "table";
        return "";
    }

    function tableColumnInfoFromCell(candidate) {
        const cell = candidate && candidate.closest ? candidate.closest("td") : null;
        if (!cell || !cell.parentElement) return null;

        const rowCells = Array.from(cell.parentElement.children).filter(function (node) {
            return node && /^(TD|TH)$/.test(node.tagName || "");
        });
        const columnIndex = rowCells.indexOf(cell);
        if (columnIndex < 0) return null;

        const table = cell.closest("table");
        const tableSelector = tableSelectorForCell(cell);
        if (!table || !tableSelector) return null;

        let header = "";
        const headRows = Array.from(table.querySelectorAll("thead tr"));
        for (let i = headRows.length - 1; i >= 0 && !header; i -= 1) {
            const headers = Array.from(headRows[i].children).filter(function (node) {
                return node && /^(TH|TD)$/.test(node.tagName || "");
            });
            if (headers[columnIndex]) header = clean(headers[columnIndex].textContent);
        }

        if (!header) {
            const dataCol = clean(cell.getAttribute("data-colname"));
            if (dataCol) header = dataCol;
        }

        const selector = tableSelector + " tbody tr > td:nth-child(" + (columnIndex + 1) + ")";
        let matchCount = 0;
        try { matchCount = document.querySelectorAll(selector).length; } catch (_) {}

        return {
            selector: selector,
            matchCount: matchCount,
            columnIndex: columnIndex + 1,
            header: header,
            tableSelector: tableSelector
        };
    }

    function registerPickerAdapter() {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.register !== "function") return false;
        try {
            picker.register(MODULE_ID, {
                buildResult: function (candidate, result) {
                    const column = tableColumnInfoFromCell(candidate);
                    if (column) {
                        result.selector = column.selector;
                        result.value = column.selector;
                        result.matchCount = column.matchCount;
                        result.targetName = column.header
                            ? "Colonne « " + column.header + " »"
                            : "Colonne " + column.columnIndex + " du tableau";
                        result.pmkRelativeDateTarget = {
                            kind: "table-column",
                            tableSelector: column.tableSelector,
                            columnIndex: column.columnIndex,
                            header: column.header
                        };
                        return result;
                    }

                    result.targetName = clean(candidate && (candidate.getAttribute("aria-label") || candidate.getAttribute("title")))
                        || clean(candidate && candidate.textContent).slice(0, 120)
                        || (candidate && candidate.tagName ? candidate.tagName.toLowerCase() : "element");
                    result.matchCount = selectorCount(result.selector);
                    return result;
                },
                applyPending: function (draft, pending, picked) {
                    applyPickerResult(draft, pending && pending.fieldPath, picked);
                    return draft;
                }
            });
            return true;
        } catch (_) {
            return false;
        }
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function registerPmkDefinition() {
        const api = pmkApi();
        if (!api || typeof api.registerModule !== "function") return false;
        if (pmkRegistered) return true;

        try {
            api.registerModule({
                id: MODULE_ID,
                schemaVersion: 2,
                name: {
                    fr: "Dates relatives",
                    en: "Relative dates"
                },
                description: {
                    fr: "Ajoute un calcul de date relatif (par exemple « il y a 3 mois ») à n’importe quel élément Koha choisi avec le picker, tout en conservant les trois usages historiques du 081/100 sur la table des exemplaires.",
                    en: "Adds a relative-date calculation (for example “3 months ago”) to any Koha element selected with the picker, while preserving the three historical 081/100 holdings-table uses."
                },
                category: {
                    fr: "Interface / présentation",
                    en: "Interface / presentation"
                },
                supportedPages: ["*"],
                prerequisites: [],
                dependencies: [],
                defaults: clone(DEFAULTS),
                normalize: normalizeConfig,
                validate: validateConfig,
                schema: [
                    {
                        type: "section",
                        id: "activation",
                        label: { fr: "Activation", en: "Activation" },
                        fields: [
                            { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                            { key: "pages.detail.enabled", type: "boolean", label: { fr: "Activer sur detail.pl", en: "Enable on detail.pl" } },
                            { key: "pages.detail.path", type: "readonly", advanced: true, label: { fr: "Page Koha", en: "Koha page" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "wording",
                        label: { fr: "Libellés temporels", en: "Relative-time wording" },
                        description: {
                            fr: "Les valeurs par défaut reproduisent le rendu historique « il y a X » du 081/100.",
                            en: "Defaults preserve the historical 081/100 relative-time rendering."
                        },
                        fields: [
                            { key: "display.instantFr", type: "text", label: { fr: "FR — moins d’une minute", en: "FR — less than one minute" } },
                            { key: "display.pastPrefixFr", type: "text", label: { fr: "FR — préfixe passé", en: "FR — past prefix" } },
                            { key: "display.futurePrefixFr", type: "text", label: { fr: "FR — préfixe futur", en: "FR — future prefix" } },
                            { key: "display.instantEn", type: "text", label: { fr: "EN — moins d’une minute", en: "EN — less than one minute" } },
                            { key: "display.pastSuffixEn", type: "text", label: { fr: "EN — suffixe passé", en: "EN — past suffix" } },
                            { key: "display.futurePrefixEn", type: "text", label: { fr: "EN — préfixe futur", en: "EN — future prefix" } },
                            { key: "display.wrapInParentheses", type: "boolean", label: { fr: "Afficher le libellé entre parenthèses", en: "Wrap relative label in parentheses" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "rules",
                        label: { fr: "Dates concernées", en: "Target dates" },
                        description: {
                            fr: "Les trois premières règles correspondent aux anciennes fonctions du 081/100. Elles sont actives par défaut. Les nouvelles règles peuvent cibler n’importe quel élément d’une page Koha avec le picker commun.",
                            en: "The first three rules reproduce the former 081/100 behavior and are enabled by default. New rules can target any element on a Koha page with the shared picker."
                        },
                        fields: [
                            {
                                key: "rules",
                                type: "repeater",
                                label: { fr: "Règles de dates relatives", en: "Relative-date rules" },
                                addLabel: { fr: "Ajouter une date", en: "Add a date" },
                                emptyLabel: { fr: "Aucune date configurée.", en: "No date configured." },
                                reorder: true,
                                newItem: newRule,
                                itemTitle: function (item, index, lang) {
                                    const label = lang === "en" ? clean(item && item.labelEn) : clean(item && item.labelFr);
                                    return label || ((lang === "en" ? "Relative date " : "Date relative ") + (index + 1));
                                },
                                fields: [
                                    { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                    { key: "labelFr", type: "text", label: { fr: "Nom FR", en: "French name" } },
                                    { key: "labelEn", type: "text", label: { fr: "Nom EN", en: "English name" } },
                                    {
                                        key: "targetMode",
                                        type: "select",
                                        label: { fr: "Type de cible", en: "Target type" },
                                        help: {
                                            fr: "« Élément libre » permet de calculer une date n’importe où dans Koha avec le picker. « Colonne de tableau » conserve les règles historiques 081/100.",
                                            en: "“Free element” calculates a date anywhere in Koha using the picker. “Table column” preserves the historical 081/100 rules."
                                        },
                                        options: [
                                            { value: "element", label: { fr: "Élément libre (picker)", en: "Free element (picker)" } },
                                            { value: "tableColumn", label: { fr: "Colonne de tableau Koha", en: "Koha table column" } }
                                        ]
                                    },
                                    {
                                        key: "pagePath",
                                        type: "text",
                                        label: { fr: "Page Koha", en: "Koha page" },
                                        help: { fr: "Le picker renseigne automatiquement ce chemin. Si vous cliquez une cellule de tableau sans id/classe, PMK cible automatiquement toute la colonne. Utiliser * pour toutes les pages.", en: "The picker fills this path automatically. If you click a table cell without an id/class, PMK automatically targets the whole column. Use * for all pages." }
                                    },
                                    {
                                        key: "selector",
                                        type: "elementPicker",
                                        label: { fr: "Élément contenant la date", en: "Element containing the date" },
                                        pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                        emptyLabel: { fr: "Aucun élément libre choisi", en: "No free element selected" },
                                        help: { fr: "Utilisé uniquement en mode « Élément libre ». Le sélecteur peut aussi être saisi manuellement.", en: "Used only in “Free element” mode. The selector may also be entered manually." },
                                        allowManual: true,
                                        pick: pickForRule,
                                        onPick: applyPickerResult
                                    },
                                    { key: "targetName", type: "readonly", label: { fr: "Élément détecté", en: "Detected element" } },
                                    { key: "matchCount", type: "readonly", advanced: true, label: { fr: "Éléments trouvés lors du choix", en: "Elements found when selected" } },
                                    {
                                        key: "sourceMode",
                                        type: "select",
                                        label: { fr: "Où lire la date", en: "Where to read the date" },
                                        options: [
                                            { value: "auto", label: { fr: "Automatique (recommandé)", en: "Automatic (recommended)" } },
                                            { value: "text", label: { fr: "Texte de l’élément", en: "Element text" } },
                                            { value: "value", label: { fr: "Valeur du champ", en: "Field value" } },
                                            { value: "attribute", label: { fr: "Attribut HTML", en: "HTML attribute" } }
                                        ]
                                    },
                                    { key: "sourceAttribute", type: "text", advanced: true, label: { fr: "Attribut contenant la date", en: "Attribute containing the date" }, help: { fr: "Ex. datetime, data-date. Utilisé si « Attribut HTML » est choisi.", en: "E.g. datetime, data-date. Used when “HTML attribute” is selected." } },
                                    { key: "dateRegex", type: "text", advanced: true, label: { fr: "Extraction par expression régulière", en: "Regular-expression extraction" }, help: { fr: "Optionnel. Le groupe capturant 1 est utilisé s’il existe ; sinon la correspondance complète. Laisser vide dans la majorité des cas.", en: "Optional. Capture group 1 is used when present; otherwise the full match. Leave empty in most cases." } },
                                    {
                                        key: "placement",
                                        type: "select",
                                        label: { fr: "Position du calcul", en: "Calculation position" },
                                        options: [
                                            { value: "append", label: { fr: "Dans l’élément, après le contenu", en: "Inside the element, after content" } },
                                            { value: "prepend", label: { fr: "Dans l’élément, avant le contenu", en: "Inside the element, before content" } },
                                            { value: "after", label: { fr: "Après l’élément", en: "After the element" } },
                                            { value: "before", label: { fr: "Avant l’élément", en: "Before the element" } }
                                        ]
                                    },
                                    {
                                        key: "lineBreak",
                                        type: "select",
                                        label: { fr: "Saut de ligne autour du calcul", en: "Line break around calculation" },
                                        help: {
                                            fr: "Permet de placer le résultat calculé sur une ligne séparée, avant, après, ou des deux côtés.",
                                            en: "Places the calculated result on a separate line, before it, after it, or on both sides."
                                        },
                                        options: [
                                            { value: "none", label: { fr: "Aucun", en: "None" } },
                                            { value: "before", label: { fr: "Avant le calcul", en: "Before calculation" } },
                                            { value: "after", label: { fr: "Après le calcul", en: "After calculation" } },
                                            { value: "both", label: { fr: "Avant et après le calcul", en: "Before and after calculation" } }
                                        ]
                                    },
                                    { key: "separator", type: "text", label: { fr: "Séparateur", en: "Separator" }, help: { fr: "Utilisé pour l’insertion à l’intérieur de l’élément. Par défaut : « — ».", en: "Used for insertion inside the element. Default: “—”." } },
                                    { key: "tableSelector", type: "text", advanced: true, label: { fr: "Tableau cible — mode colonne", en: "Target table — column mode" } },
                                    { key: "columnName", type: "text", advanced: true, label: { fr: "data-colname — mode colonne", en: "data-colname — column mode" } },
                                    {
                                        key: "headerAliases",
                                        type: "text",
                                        advanced: true,
                                        label: { fr: "Libellés d’en-tête de secours — mode colonne", en: "Fallback header labels — column mode" },
                                        help: { fr: "Séparer les variantes par |.", en: "Separate alternatives with |." }
                                    },
                                    {
                                        key: "parserMode",
                                        type: "select",
                                        advanced: true,
                                        label: { fr: "Type de date", en: "Date type" },
                                        options: [
                                            { value: "auto", label: { fr: "Automatique", en: "Automatic" } },
                                            { value: "date", label: { fr: "Date", en: "Date" } },
                                            { value: "datetime", label: { fr: "Date et heure", en: "Date and time" } }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "behavior",
                        label: { fr: "Chargements dynamiques", en: "Dynamic loading" },
                        fields: [
                            { key: "behavior.observeDynamicChanges", type: "boolean", label: { fr: "Retraiter après reconstruction des tableaux", en: "Reprocess after table rebuilds" } },
                            { key: "behavior.observeDelayMs", type: "number", advanced: true, min: 25, max: 2000, label: { fr: "Délai de retraitement (ms)", en: "Reprocessing delay (ms)" } },
                            { key: "behavior.waitTimeoutMs", type: "number", advanced: true, min: 500, max: 20000, label: { fr: "Attente maximale du tableau (ms)", en: "Maximum table wait (ms)" } }
                        ]
                    }
                ],
                focusContext: function (main, context) {
                    if (!main) return;
                    const wanted = context && context.sectionId ? context.sectionId : "rules";
                    const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]');
                    if (!section) return;
                    window.setTimeout(function () {
                        try { section.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (_) {}
                    }, 60);
                }
            });
            pmkRegistered = true;
            registerPickerAdapter();
            return true;
        } catch (_) {
            return false;
        }
    }

    if (!registerPmkDefinition()) {
        window.addEventListener("pmk:config-ready", function () {
            registerPickerAdapter();
            registerPmkDefinition();
        }, { once: true });
    } else {
        registerPickerAdapter();
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = [
            ".pmk-relative-date-age, .vc-age{color:#555;font-size:.85em;margin-top:4px;line-height:1.25;}",
            ".pmk-relative-date-age{white-space:normal;}",
            ".pmk-relative-date-inline{display:inline;margin-left:.35em;margin-right:.35em;white-space:normal;}"
        ].join("\n");
        document.head.appendChild(style);
    }

    function removeGenerated(root) {
        const scope = root || document;
        scope.querySelectorAll("[" + GENERATED_ATTR + "]").forEach(function (node) {
            try { node.remove(); } catch (_) {
                if (node.parentNode) node.parentNode.removeChild(node);
            }
        });
    }

    function aliases(rule) {
        return clean(rule.headerAliases)
            .split("|")
            .map(normalizeText)
            .filter(Boolean);
    }

    function findColumnIndex(table, rule) {
        const headers = Array.from(table.querySelectorAll("thead th"));
        const wantedCol = normalizeText(rule.columnName);
        const fallbackAliases = aliases(rule);
        let aliasMatch = -1;

        for (let i = 0; i < headers.length; i += 1) {
            const th = headers[i];
            const colname = normalizeText(th.getAttribute("data-colname") || "");
            if (wantedCol && colname === wantedCol) return i;

            if (aliasMatch < 0 && fallbackAliases.length) {
                const text = normalizeText(th.textContent || "");
                if (fallbackAliases.some(function (alias) { return text.indexOf(alias) >= 0; })) {
                    aliasMatch = i;
                }
            }
        }
        return aliasMatch;
    }

    function rawCellText(cell) {
        if (!cell) return "";
        const copy = cell.cloneNode(true);
        copy.querySelectorAll("[" + GENERATED_ATTR + "]").forEach(function (node) { node.remove(); });
        return clean(copy.textContent);
    }

    function extractDateSource(value, rule) {
        let raw = clean(value);
        if (!raw) return "";
        if (rule && rule.dateRegex) {
            try {
                const match = raw.match(new RegExp(rule.dateRegex));
                if (!match) return "";
                raw = clean(match[1] != null ? match[1] : match[0]);
            } catch (_) {
                return "";
            }
        }
        return raw;
    }

    function parseByMode(value, mode, rule) {
        const raw = extractDateSource(value, rule || {});
        if (!raw) return null;
        if (mode === "date") return parseDate(raw);
        if (mode === "datetime") return parseDate(raw);
        return parseDate(raw);
    }

    function renderLabel(cell, date, config) {
        if (!cell || !date) return;
        const label = relativeLabel(date, language(), config);
        if (!label) return;

        const div = document.createElement("div");
        div.className = "pmk-relative-date-age " + (clean(config.display.className) || "vc-age");
        div.setAttribute(GENERATED_ATTR, "1");
        div.textContent = config.display.wrapInParentheses ? "(" + label + ")" : label;
        cell.appendChild(div);
    }

    function processTableRule(table, rule, config) {
        const columnIndex = findColumnIndex(table, rule);
        if (columnIndex < 0) return;

        Array.from(table.querySelectorAll("tbody tr")).forEach(function (row) {
            const cells = row.querySelectorAll("td");
            const cell = cells[columnIndex];
            if (!cell) return;

            const previous = cell.querySelectorAll("[" + GENERATED_ATTR + "]");
            previous.forEach(function (node) { node.remove(); });

            const raw = rawCellText(cell);
            if (!raw) return;
            const date = parseByMode(raw, rule.parserMode, rule);
            if (!date || Number.isNaN(date.getTime())) return;
            renderLabel(cell, date, config);
            // Compatibilité 081/100 : leur ancien garde-fou détecte ce marqueur.
            cell.dataset.vcAgeProcessed = "pmk070";
        });
    }

    function elementTextWithoutGenerated(element) {
        if (!element) return "";
        const copy = element.cloneNode(true);
        if (copy.querySelectorAll) {
            copy.querySelectorAll("[" + GENERATED_ATTR + "]").forEach(function (node) { node.remove(); });
        }
        return clean(copy.textContent);
    }

    function elementDateSource(element, rule) {
        if (!element) return "";
        const mode = rule.sourceMode || "auto";
        if (mode === "attribute") return clean(element.getAttribute(rule.sourceAttribute || "datetime"));
        if (mode === "value") return clean(element.value);
        if (mode === "text") return elementTextWithoutGenerated(element);

        const tag = clean(element.tagName).toLowerCase();
        if ((tag === "input" || tag === "textarea" || tag === "select") && element.value != null) {
            const value = clean(element.value);
            if (value) return value;
        }
        const datetime = clean(element.getAttribute && element.getAttribute("datetime"));
        if (datetime) return datetime;
        return elementTextWithoutGenerated(element);
    }

    function genericRenderedText(date, config) {
        const label = relativeLabel(date, language(), config);
        if (!label) return "";
        return config.display.wrapInParentheses ? "(" + label + ")" : label;
    }

    function renderElementLabel(element, date, rule, config) {
        if (!element || !date) return;
        const text = genericRenderedText(date, config);
        if (!text) return;

        const node = document.createElement("span");
        node.className = "pmk-relative-date-age pmk-relative-date-inline " + (clean(config.display.className) || "vc-age");
        node.setAttribute(GENERATED_ATTR, rule.id || "1");
        node.setAttribute("data-pmk-relative-date-rule", rule.id || "");

        const separator = rule.separator == null ? " — " : String(rule.separator);
        const outside = function (where) {
            node.textContent = text;
            try {
                element.insertAdjacentElement(where === "before" ? "beforebegin" : "afterend", node);
                return true;
            } catch (_) {
                if (!element.parentNode) return false;
                if (where === "before") element.parentNode.insertBefore(node, element);
                else element.parentNode.insertBefore(node, element.nextSibling);
                return true;
            }
        };

        function addBreak(where) {
            const br = document.createElement("br");
            br.setAttribute(GENERATED_ATTR, rule.id || "1");
            br.setAttribute("data-pmk-relative-date-rule", rule.id || "");
            try {
                node.insertAdjacentElement(where === "before" ? "beforebegin" : "afterend", br);
            } catch (_) {
                if (!node.parentNode) return;
                if (where === "before") node.parentNode.insertBefore(br, node);
                else node.parentNode.insertBefore(br, node.nextSibling);
            }
        }

        try {
            if (rule.placement === "prepend") {
                node.textContent = text + separator;
                element.insertBefore(node, element.firstChild);
            } else if (rule.placement === "after") {
                outside("after");
            } else if (rule.placement === "before") {
                outside("before");
            } else {
                node.textContent = separator + text;
                element.appendChild(node);
            }

            if (node.isConnected) {
                if (rule.lineBreak === "before" || rule.lineBreak === "both") addBreak("before");
                if (rule.lineBreak === "after" || rule.lineBreak === "both") addBreak("after");
            }
        } catch (_) {
            if (!node.isConnected) outside("after");
            if (node.isConnected) {
                if (rule.lineBreak === "before" || rule.lineBreak === "both") addBreak("before");
                if (rule.lineBreak === "after" || rule.lineBreak === "both") addBreak("after");
            }
        }
    }

    function processElementRule(rule, config) {
        let targets = [];
        try { targets = Array.from(document.querySelectorAll(rule.selector)); } catch (_) { targets = []; }
        targets.forEach(function (element) {
            const raw = elementDateSource(element, rule);
            if (!raw) return;
            const date = parseByMode(raw, rule.parserMode, rule);
            if (!date || Number.isNaN(date.getTime())) return;
            renderElementLabel(element, date, rule, config);
        });
    }

    function ruleAppliesToCurrentPage(rule) {
        const wanted = clean(rule.pagePath);
        const current = window.location.pathname || "";
        if (!wanted || wanted === "*") return true;
        return wanted === current || current.indexOf(wanted) >= 0;
    }

    function processConfiguredRules(config) {
        const cfg = normalizeConfig(config || currentConfig);
        if (!cfg.enabled) {
            removeGenerated(document);
            return;
        }
        if (window.location.pathname === DETAIL_PATH && cfg.pages.detail.enabled === false) {
            removeGenerated(document);
            return;
        }

        removeGenerated(document);
        ensureStyle();
        const tableRulePairs = [];

        cfg.rules.forEach(function (rule) {
            if (!rule.enabled || !ruleAppliesToCurrentPage(rule)) return;
            if (rule.targetMode === "element") {
                processElementRule(rule, cfg);
                return;
            }
            let tables = [];
            try { tables = Array.from(document.querySelectorAll(rule.tableSelector)); } catch (_) { tables = []; }
            tables.forEach(function (table) {
                tableRulePairs.push([table, rule]);
            });
        });

        tableRulePairs.forEach(function (pair) {
            processTableRule(pair[0], pair[1], cfg);
        });
    }

    function waitForAnyRelevantTable(config) {
        const cfg = normalizeConfig(config || currentConfig);
        const selectors = cfg.rules
            .filter(function (rule) { return rule.enabled && ruleAppliesToCurrentPage(rule); })
            .map(function (rule) { return rule.targetMode === "element" ? rule.selector : rule.tableSelector; })
            .filter(Boolean);

        if (!selectors.length) return Promise.resolve(null);
        const selector = selectors.join(", ");

        if (window.KOHA_UTILS && typeof window.KOHA_UTILS.waitFor === "function") {
            return window.KOHA_UTILS.waitFor(selector, cfg.behavior.waitTimeoutMs);
        }

        return new Promise(function (resolve, reject) {
            let first = null;
            try { first = document.querySelector(selector); } catch (_) {}
            if (first) return resolve(first);

            const observerLocal = new MutationObserver(function () {
                let found = null;
                try { found = document.querySelector(selector); } catch (_) {}
                if (!found) return;
                observerLocal.disconnect();
                resolve(found);
            });
            observerLocal.observe(document.documentElement, { childList: true, subtree: true });
            window.setTimeout(function () {
                observerLocal.disconnect();
                reject(new Error("timeout"));
            }, cfg.behavior.waitTimeoutMs);
        });
    }

    function stopObserver() {
        if (observer) {
            try { observer.disconnect(); } catch (_) {}
            observer = null;
        }
        if (observerTimer) {
            window.clearTimeout(observerTimer);
            observerTimer = null;
        }
    }

    function startObserver(config) {
        stopObserver();
        const cfg = normalizeConfig(config || currentConfig);
        if (!cfg.enabled || !cfg.behavior.observeDynamicChanges) return;

        observer = new MutationObserver(function (mutations) {
            const onlyOurNodes = mutations.length > 0 && mutations.every(function (mutation) {
                return Array.from(mutation.addedNodes || []).every(function (node) {
                    return node.nodeType !== 1 ||
                        node.hasAttribute && node.hasAttribute(GENERATED_ATTR) ||
                        node.closest && node.closest("[" + GENERATED_ATTR + "]");
                });
            });
            if (onlyOurNodes) return;

            if (observerTimer) window.clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                observerTimer = null;
                processConfiguredRules(currentConfig);
            }, cfg.behavior.observeDelayMs);
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function mountContextAccess() {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;
        if (window.location.pathname !== DETAIL_PATH) return;
        const anchor = document.querySelector("#holdings_table_wrapper, #holdings_table");
        if (!anchor) return;
        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "before",
                contextKey: DETAIL_PAGE_ID,
                context: { sectionId: "rules", pageId: DETAIL_PAGE_ID }
            });
        } catch (_) {}
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULTS);
        removeGenerated(document);
        processConfiguredRules(currentConfig);
        startObserver(currentConfig);
        mountContextAccess();
    }

    function connectPmkConfig() {
        registerPmkDefinition();
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            applyConfig(DEFAULTS);
            return false;
        }

        api.getConfig(MODULE_ID)
            .then(function (config) { applyConfig(config || DEFAULTS); })
            .catch(function () { applyConfig(DEFAULTS); });

        if (!unsubscribe && typeof api.subscribe === "function") {
            try {
                unsubscribe = api.subscribe(MODULE_ID, function (config) {
                    applyConfig(config || DEFAULTS);
                });
            } catch (_) {}
        }
        return true;
    }

    /*
     * API historique + API consolidée.
     * Les anciens scripts qui consomment VC_DATE_UTILS continuent de fonctionner.
     */
    const publicApi = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        parseDate: parseDate,
        parseDateFR: parseDateFR,
        parseDateTimeFR: parseDateTimeFR,
        relativeLabel: function (date, lang) { return relativeLabel(date, lang || language(), currentConfig); },
        tempsEcoule: tempsEcoule,
        applyConfiguredRules: function () { processConfiguredRules(currentConfig); },
        processTableRule: function (table, rule) { processTableRule(table, normalizeRule(rule || {}, 0), currentConfig); },
        processElementRule: function (rule) { processElementRule(normalizeRule(rule || {}, 0), currentConfig); },
        defaults: clone(DEFAULTS),
        normalizeConfig: normalizeConfig,
        validateConfig: validateConfig,
        skipKohaAgeInsertion: true,
        ownsHoldingsRelativeDates: true
    };

    window.VC_DATE_UTILS = publicApi;
    window.PMK070RelativeDates = publicApi;

    function start() {
        if (started) return;
        started = true;

        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });
        }

        waitForAnyRelevantTable(currentConfig)
            .then(function () { processConfiguredRules(currentConfig); mountContextAccess(); })
            .catch(function () {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
