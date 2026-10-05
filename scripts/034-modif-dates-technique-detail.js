/*
 Nom du fichier: 034-modif-dates-technique-detail.js
 Ancien rôle: reformater les dates techniques de catalogue/detail.pl
 Module PMK: date-display-formatting
 Version: 2.0.0-preplugin
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet / refonte PimpMyKoha

 Rôle:
 - moteur transversal de formatage de dates visibles dans l'interface Koha ;
 - règles illimitées, activables page par page ;
 - cible choisie avec le picker visuel PMK ;
 - format de date de sortie configurable ;
 - prise en charge de la date seule ET de la date + heure ;
 - heure: seulement si présente, toujours, ou jamais ;
 - format horaire Koha / 24 h / 24 h avec secondes / 12 h / personnalisé ;
 - traitement idempotent: aucune dégradation lors des réapplications ;
 - ne remplace que la sous-chaîne de date, sans vider le HTML de l'élément ;
 - valeurs historiques « Création notice » et « Modification notice » conservées par défaut ;
 - aucun effet sur les données Koha: présentation uniquement.
*/
(function () {
    "use strict";

    if (window.__PMK034DateDisplayFormattingLoaded) return;
    window.__PMK034DateDisplayFormattingLoaded = true;

    const MODULE_ID = "date-display-formatting";
    const MODULE_VERSION = "2.0.0-preplugin";
    const WRAP_CLASS = "pmk034-date-value";
    const RULE_ATTR = "data-pmk034-rule";
    const SOURCE_ATTR = "data-pmk034-source";
    const PICKER_STYLE_ID = "pmk034-picker-style";
    const PENDING_PICK_KEY = "pmk034-pending-pick-v1";

    const DEFAULT_OUTPUT = {
        dateFormat: "koha",
        customDateFormat: "DD/MM/YYYY",
        timeMode: "auto",
        timeFormat: "koha",
        customTimeFormat: "HH:mm",
        separator: " "
    };

    const DEFAULTS = {
        enabled: true,
        observeDom: true,
        observeDelay: 90,
        rules: [
            {
                id: "legacy-record-creation",
                enabled: true,
                label: "Création notice",
                pages: "/cgi-bin/koha/catalogue/detail.pl",
                selector: "li.date-creation-tech, li.date-modif-tech",
                targetName: "Création notice",
                textContains: "Création notice\nRecord creation\nCreation date\nCreated",
                occurrence: "all",
                output: {
                    dateFormat: "koha",
                    customDateFormat: "DD/MM/YYYY",
                    timeMode: "auto",
                    timeFormat: "koha",
                    customTimeFormat: "HH:mm",
                    separator: " "
                }
            },
            {
                id: "legacy-record-modification",
                enabled: true,
                label: "Modification notice",
                pages: "/cgi-bin/koha/catalogue/detail.pl",
                selector: "li.date-modif-tech, li.date-creation-tech",
                targetName: "Modification notice",
                textContains: "Modification notice\nRecord modification\nModification date\nModified",
                occurrence: "all",
                output: {
                    dateFormat: "koha",
                    customDateFormat: "DD/MM/YYYY",
                    timeMode: "auto",
                    timeFormat: "koha",
                    customTimeFormat: "HH:mm",
                    separator: " "
                }
            }
        ]
    };

    let currentConfig = null;
    let observer = null;
    let observerTimer = 0;
    let applying = false;

    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function merge(target, source) {
        if (!isPlainObject(source)) return target;
        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) {
                target[key] = deepClone(value);
            } else if (isPlainObject(value)) {
                if (!isPlainObject(target[key])) target[key] = {};
                merge(target[key], value);
            } else {
                target[key] = value;
            }
        });
        return target;
    }

    function normalizeConfig(config) {
        const out = merge(deepClone(DEFAULTS), config || {});
        if (!Array.isArray(out.rules)) out.rules = deepClone(DEFAULTS.rules);
        out.rules = out.rules.map(function (rule, index) {
            return merge({
                id: "rule-" + (index + 1),
                enabled: true,
                label: "",
                pages: "*",
                selector: "",
                targetName: "",
                textContains: "",
                occurrence: "all",
                output: deepClone(DEFAULT_OUTPUT)
            }, rule || {});
        });
        return out;
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const htmlLang = String(document.documentElement && document.documentElement.lang || "").toLowerCase();
        if (htmlLang.indexOf("en") === 0) return "en";
        if (htmlLang.indexOf("fr") === 0) return "fr";
        return String(navigator.language || "fr").toLowerCase().indexOf("en") === 0 ? "en" : "fr";
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

    function splitLines(value) {
        if (Array.isArray(value)) return value.map(String).map(function (v) { return v.trim(); }).filter(Boolean);
        return String(value || "")
            .split(/[\n;,]+/)
            .map(function (v) { return v.trim(); })
            .filter(Boolean);
    }

    function normalizePath(value) {
        let path = String(value || "").trim();
        if (!path) return "";
        try {
            if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
        } catch (_) {}
        if (path.charAt(0) !== "/" && path !== "*" && path !== "all") path = "/cgi-bin/koha/" + path.replace(/^\/+/, "");
        return path.replace(/[?#].*$/, "");
    }

    function pageMatches(rule) {
        const pages = splitLines(rule && rule.pages);
        if (!pages.length) return true;
        return pages.some(function (page) {
            const wanted = normalizePath(page);
            return !wanted || wanted === "*" || wanted === "all" || window.location.pathname === wanted;
        });
    }

    function firstConcretePage(rule) {
        const pages = splitLines(rule && rule.pages);
        for (let i = 0; i < pages.length; i += 1) {
            const path = normalizePath(pages[i]);
            if (path && path !== "*" && path !== "all") return path;
        }
        return "";
    }

    function ruleTextMatches(element, rule) {
        const filters = splitLines(rule && rule.textContains);
        if (!filters.length) return true;
        const haystack = normalizeText(element && element.textContent);
        return filters.some(function (value) {
            const needle = normalizeText(value);
            return needle && haystack.indexOf(needle) !== -1;
        });
    }

    function pad2(value) {
        return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
    }

    function daysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    function validParts(year, month, day, hour, minute, second) {
        if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
        if (!Number.isInteger(month) || month < 1 || month > 12) return false;
        if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return false;
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
        if (!Number.isInteger(minute) || minute < 0 || minute > 59) return false;
        if (!Number.isInteger(second) || second < 0 || second > 59) return false;
        return true;
    }

    function inferKohaDateOrder() {
        try {
            if (typeof window.$date === "function") {
                const probe = String(window.$date("2001-02-03", { no_tz_adjust: true }) || "").trim();
                if (/^03\D02\D2001/.test(probe)) return "dmy";
                if (/^02\D03\D2001/.test(probe)) return "mdy";
                if (/^2001\D02\D03/.test(probe)) return "ymd";
            }
        } catch (_) {}
        return detectLanguage() === "en" ? "mdy" : "dmy";
    }

    function parseNumericDate(a, b, year, separator) {
        const first = Number(a);
        const second = Number(b);
        const y = Number(year);
        let day;
        let month;

        if (first > 12 && second <= 12) {
            day = first;
            month = second;
        } else if (second > 12 && first <= 12) {
            month = first;
            day = second;
        } else {
            const order = separator === "." ? "dmy" : inferKohaDateOrder();
            if (order === "mdy") {
                month = first;
                day = second;
            } else {
                day = first;
                month = second;
            }
        }

        return { year: y, month: month, day: day };
    }

    function parseTime(hourText, minuteText, secondText, ampmText) {
        let hour = Number(hourText || 0);
        const minute = Number(minuteText || 0);
        const second = Number(secondText || 0);
        const ampm = String(ampmText || "").trim().toUpperCase();

        if (ampm === "AM" || ampm === "PM") {
            if (hour < 1 || hour > 12) return null;
            if (ampm === "AM" && hour === 12) hour = 0;
            if (ampm === "PM" && hour !== 12) hour += 12;
        }

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
        return { hour: hour, minute: minute, second: second };
    }

    function candidateRegex() {
        /*
         * 1. ISO / RFC3339 : 2026-09-17, 2026-09-17 14:35:20, 2026-09-17T14:35:20+02:00
         * 2. Numérique local : 17/09/2026, 09/17/2026, 17.09.2026, 17-09-2026 + heure facultative
         */
        return /\b(?:\d{4}[-\/]\d{1,2}[-\/]\d{1,2}(?:[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?)?|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}(?:[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)?)\b/gi;
    }

    function parseCandidate(source) {
        const raw = String(source || "").trim();
        if (!raw) return null;

        let match = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?)?$/i);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const hasTime = match[4] !== undefined;
            const time = parseTime(match[4], match[5], match[6], "");
            if (!time || !validParts(year, month, day, time.hour, time.minute, time.second)) return null;

            const timezone = String(match[7] || "");
            if (timezone) {
                try {
                    let iso = year + "-" + pad2(month) + "-" + pad2(day) + "T" + pad2(time.hour) + ":" + pad2(time.minute) + ":" + pad2(time.second);
                    iso += timezone === "Z" ? "Z" : timezone.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
                    const d = new Date(iso);
                    if (!Number.isNaN(d.getTime())) {
                        return {
                            raw: raw,
                            year: d.getFullYear(),
                            month: d.getMonth() + 1,
                            day: d.getDate(),
                            hour: d.getHours(),
                            minute: d.getMinutes(),
                            second: d.getSeconds(),
                            hasTime: hasTime,
                            hadSeconds: match[6] !== undefined,
                            originalTime: hasTime ? raw.substring(raw.search(/[T\s]+\d{1,2}:\d{2}/)).replace(/^[T\s]+/, "") : ""
                        };
                    }
                } catch (_) {}
            }

            return {
                raw: raw,
                year: year,
                month: month,
                day: day,
                hour: time.hour,
                minute: time.minute,
                second: time.second,
                hasTime: hasTime,
                hadSeconds: match[6] !== undefined,
                originalTime: hasTime ? raw.substring(raw.search(/[T\s]+\d{1,2}:\d{2}/)).replace(/^[T\s]+/, "") : ""
            };
        }

        match = raw.match(/^(\d{1,2})([\/.\-])(\d{1,2})\2(\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
        if (!match) return null;

        const date = parseNumericDate(match[1], match[3], match[4], match[2]);
        const hasTime = match[5] !== undefined;
        const time = parseTime(match[5], match[6], match[7], match[8]);
        if (!time || !validParts(date.year, date.month, date.day, time.hour, time.minute, time.second)) return null;

        return {
            raw: raw,
            year: date.year,
            month: date.month,
            day: date.day,
            hour: time.hour,
            minute: time.minute,
            second: time.second,
            hasTime: hasTime,
            hadSeconds: match[7] !== undefined,
            originalTime: hasTime ? [match[5] + ":" + match[6] + (match[7] !== undefined ? ":" + match[7] : ""), match[8] || ""].join(" ").trim() : ""
        };
    }

    function canonicalLocal(parsed) {
        return String(parsed.year).padStart(4, "0") + "-" + pad2(parsed.month) + "-" + pad2(parsed.day) +
            "T" + pad2(parsed.hour) + ":" + pad2(parsed.minute) + ":" + pad2(parsed.second);
    }

    function formatPattern(parsed, pattern) {
        const p = String(pattern || "");
        const canonical = canonicalLocal(parsed);
        if (window.dayjs && typeof window.dayjs === "function") {
            try {
                const d = window.dayjs(canonical);
                if (d && typeof d.isValid === "function" && d.isValid()) return d.format(p);
            } catch (_) {}
        }

        const hour12 = parsed.hour % 12 || 12;
        const replacements = {
            YYYY: String(parsed.year).padStart(4, "0"),
            MM: pad2(parsed.month),
            DD: pad2(parsed.day),
            HH: pad2(parsed.hour),
            mm: pad2(parsed.minute),
            ss: pad2(parsed.second),
            hh: pad2(hour12),
            A: parsed.hour >= 12 ? "PM" : "AM"
        };
        return p.replace(/YYYY|MM|DD|HH|mm|ss|hh|A/g, function (token) { return replacements[token]; });
    }

    function kohaDatePart(parsed) {
        const canonical = canonicalLocal(parsed);
        if (typeof window.$date === "function") {
            try {
                return String(window.$date(canonical, { withtime: false, no_tz_adjust: true }) || "").trim();
            } catch (_) {}
        }
        return detectLanguage() === "en"
            ? pad2(parsed.month) + "/" + pad2(parsed.day) + "/" + parsed.year
            : pad2(parsed.day) + "/" + pad2(parsed.month) + "/" + parsed.year;
    }

    function kohaTimePart(parsed) {
        const canonical = canonicalLocal(parsed);
        if (typeof window.$date === "function") {
            try {
                const full = String(window.$date(canonical, {
                    dateformat: "iso",
                    withtime: true,
                    no_tz_adjust: true
                }) || "").trim();
                if (full.length > 10) return full.substring(10).trim();
            } catch (_) {}
        }
        return pad2(parsed.hour) + ":" + pad2(parsed.minute);
    }

    function formatDatePart(parsed, output) {
        switch (output.dateFormat) {
            case "dmy-slash": return formatPattern(parsed, "DD/MM/YYYY");
            case "mdy-slash": return formatPattern(parsed, "MM/DD/YYYY");
            case "iso": return formatPattern(parsed, "YYYY-MM-DD");
            case "dmy-dot": return formatPattern(parsed, "DD.MM.YYYY");
            case "dmy-dash": return formatPattern(parsed, "DD-MM-YYYY");
            case "custom": return formatPattern(parsed, output.customDateFormat || "DD/MM/YYYY");
            case "koha":
            default: return kohaDatePart(parsed);
        }
    }

    function formatTimePart(parsed, output) {
        switch (output.timeFormat) {
            case "24h": return formatPattern(parsed, "HH:mm");
            case "24h-seconds": return formatPattern(parsed, "HH:mm:ss");
            case "12h": return formatPattern(parsed, "hh:mm A");
            case "source": return parsed.originalTime || formatPattern(parsed, parsed.hadSeconds ? "HH:mm:ss" : "HH:mm");
            case "custom": return formatPattern(parsed, output.customTimeFormat || "HH:mm");
            case "koha":
            default: return kohaTimePart(parsed);
        }
    }

    function formatParsed(parsed, outputConfig) {
        const output = merge(deepClone(DEFAULT_OUTPUT), outputConfig || {});
        const dateText = formatDatePart(parsed, output);
        const showTime = output.timeMode === "always" || (output.timeMode === "auto" && parsed.hasTime);
        if (!showTime) return dateText;
        const timeText = formatTimePart(parsed, output);
        if (!timeText) return dateText;
        return dateText + String(output.separator === undefined ? " " : output.separator) + timeText;
    }

    function restoreAll() {
        const spans = Array.from(document.querySelectorAll("." + WRAP_CLASS + "[" + SOURCE_ATTR + "]"));
        spans.forEach(function (span) {
            const source = span.getAttribute(SOURCE_ATTR);
            if (!span.parentNode) return;
            span.parentNode.replaceChild(document.createTextNode(source === null ? span.textContent : source), span);
        });
    }

    function updateWrappedSpan(span, rule) {
        const source = span.getAttribute(SOURCE_ATTR) || "";
        const parsed = parseCandidate(source);
        if (!parsed) return false;
        span.textContent = formatParsed(parsed, rule.output);
        return true;
    }

    function createFormattedSpan(source, rule) {
        const parsed = parseCandidate(source);
        if (!parsed) return null;
        const span = document.createElement("span");
        span.className = WRAP_CLASS;
        span.setAttribute(RULE_ATTR, String(rule.id || "rule"));
        span.setAttribute(SOURCE_ATTR, source);
        span.textContent = formatParsed(parsed, rule.output);
        return span;
    }

    function processTextNode(node, rule, remaining) {
        if (!node || node.nodeType !== 3 || !node.parentNode) return remaining;
        const parent = node.parentNode;
        if (parent.nodeType === 1 && parent.closest && parent.closest("." + WRAP_CLASS)) return remaining;
        if (parent.nodeType === 1 && /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|OPTION)$/i.test(parent.tagName || "")) return remaining;

        const text = node.nodeValue || "";
        const regex = candidateRegex();
        const matches = [];
        let match;
        while ((match = regex.exec(text))) {
            if (!parseCandidate(match[0])) continue;
            matches.push({ index: match.index, text: match[0] });
            if (rule.occurrence === "first" || remaining === 1) break;
        }
        if (!matches.length) return remaining;

        const fragment = document.createDocumentFragment();
        let cursor = 0;
        let used = 0;
        matches.forEach(function (entry) {
            if (remaining === 0) return;
            fragment.appendChild(document.createTextNode(text.slice(cursor, entry.index)));
            const span = createFormattedSpan(entry.text, rule);
            if (span) {
                fragment.appendChild(span);
                used += 1;
                if (remaining > 0) remaining -= 1;
            } else {
                fragment.appendChild(document.createTextNode(entry.text));
            }
            cursor = entry.index + entry.text.length;
        });
        fragment.appendChild(document.createTextNode(text.slice(cursor)));
        if (used) parent.replaceChild(fragment, node);
        return remaining;
    }

    function processElement(element, rule) {
        if (!element || !ruleTextMatches(element, rule)) return;

        const existing = Array.from(element.querySelectorAll("." + WRAP_CLASS + "[" + RULE_ATTR + '=\"' + cssEscapeAttr(String(rule.id || "rule")) + '\"]'));
        existing.forEach(function (span) { updateWrappedSpan(span, rule); });

        let remaining = rule.occurrence === "first" ? (existing.length ? 0 : 1) : -1;
        if (remaining === 0) return;

        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.closest && parent.closest("." + WRAP_CLASS)) return NodeFilter.FILTER_REJECT;
                    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|OPTION)$/i.test(parent.tagName || "")) return NodeFilter.FILTER_REJECT;
                    return candidateRegex().test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );

        const nodes = [];
        let current;
        while ((current = walker.nextNode())) nodes.push(current);
        nodes.forEach(function (node) {
            if (remaining === 0) return;
            remaining = processTextNode(node, rule, remaining);
        });
    }

    function cssEscapeAttr(value) {
        return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function applyRule(rule) {
        if (!rule || rule.enabled === false || !pageMatches(rule)) return;
        const selector = String(rule.selector || "").trim();
        if (!selector) return;
        let elements = [];
        try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { return; }
        elements.forEach(function (element) { processElement(element, rule); });
    }

    function applyAll() {
        if (!currentConfig || currentConfig.enabled === false) return;
        applying = true;
        try {
            restoreAll();
            (currentConfig.rules || []).forEach(applyRule);
        } finally {
            window.setTimeout(function () { applying = false; }, 0);
        }
    }

    function stopObserver() {
        if (observerTimer) window.clearTimeout(observerTimer);
        observerTimer = 0;
        if (observer) observer.disconnect();
        observer = null;
    }

    function startObserver() {
        if (observer || !document.body || !window.MutationObserver) return;
        observer = new MutationObserver(function (mutations) {
            if (applying) return;
            const relevant = mutations.some(function (mutation) {
                const target = mutation.target && mutation.target.nodeType === 1
                    ? mutation.target
                    : mutation.target && mutation.target.parentElement;
                if (target && target.closest && target.closest("." + WRAP_CLASS)) return false;
                return mutation.type === "childList" || mutation.type === "characterData";
            });
            if (!relevant) return;
            if (observerTimer) window.clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                stopObserver();
                applyAll();
                if (currentConfig && currentConfig.enabled !== false && currentConfig.observeDom !== false) startObserver();
            }, Math.max(40, Number(currentConfig && currentConfig.observeDelay) || 90));
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function refresh(config) {
        stopObserver();
        applying = true;
        try { restoreAll(); } finally { applying = false; }
        currentConfig = normalizeConfig(config);
        if (currentConfig.enabled !== false) {
            applyAll();
            if (currentConfig.observeDom !== false) startObserver();
            mountContextAccess();
        }
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c; });
    }

    function stableSelector(element) {
        if (!element || element.nodeType !== 1) return "";

        if (element.id) {
            try {
                const byId = "#" + cssEscape(element.id);
                if (document.querySelectorAll(byId).length === 1) return byId;
            } catch (_) {}
        }

        const dataAttrs = ["data-tabname", "data-bs-target", "name", "role"];
        for (let i = 0; i < dataAttrs.length; i += 1) {
            const attr = dataAttrs[i];
            const value = element.getAttribute && element.getAttribute(attr);
            if (!value) continue;
            const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            const selector = element.tagName.toLowerCase() + "[" + attr + '=\"' + escaped + '\"]';
            try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (_) {}
        }

        const classes = Array.from(element.classList || []).filter(function (name) {
            return !/^pmk|^active$|^selected$|^hover$|^focus$|^show$|^open$/.test(name);
        });
        if (classes.length) {
            const candidate = element.tagName.toLowerCase() + "." + classes.slice(0, 2).map(cssEscape).join(".");
            try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) {}
        }

        const parts = [];
        let node = element;
        while (node && node !== document.body && parts.length < 6) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += "#" + cssEscape(node.id);
                parts.unshift(part);
                break;
            }
            const usable = Array.from(node.classList || []).filter(function (name) {
                return !/^pmk|^active$|^selected$|^hover$|^focus$|^show$|^open$/.test(name);
            });
            if (usable.length) part += "." + cssEscape(usable[0]);
            const parent = node.parentElement;
            if (parent && !usable.length) {
                const peers = Array.from(parent.children).filter(function (x) { return x.tagName === node.tagName; });
                if (peers.length > 1) part += ":nth-of-type(" + (peers.indexOf(node) + 1) + ")";
            }
            parts.unshift(part);
            node = parent;
        }
        return parts.join(" > ");
    }

    function pickerBannerText() {
        return detectLanguage() === "en"
            ? "Click the element containing the date — Escape to cancel"
            : "Clique sur l’élément contenant la date — Échap pour annuler";
    }

    function pickElementOnCurrentPage() {
        return new Promise(function (resolve, reject) {
            const overlay = document.getElementById("pmk-config-overlay");
            const previousDisplay = overlay ? overlay.style.display : "";
            if (overlay) overlay.style.display = "none";

            let style = document.getElementById(PICKER_STYLE_ID);
            if (!style) {
                style = document.createElement("style");
                style.id = PICKER_STYLE_ID;
                style.textContent = [
                    ".pmk034-picker-hover{outline:3px solid #0d6efd!important;outline-offset:2px!important;cursor:crosshair!important;}",
                    ".pmk034-picker-banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483646;background:#fff;border:1px solid #aaa;border-radius:5px;padding:9px 13px;box-shadow:0 2px 10px rgba(0,0,0,.28);font-size:14px;max-width:calc(100vw - 20px)}"
                ].join("");
                (document.head || document.documentElement).appendChild(style);
            }

            const banner = document.createElement("div");
            banner.className = "pmk034-picker-banner";
            banner.textContent = pickerBannerText();
            document.body.appendChild(banner);

            let hovered = null;
            function cleanup() {
                if (hovered) hovered.classList.remove("pmk034-picker-hover");
                document.removeEventListener("mouseover", over, true);
                document.removeEventListener("mouseout", out, true);
                document.removeEventListener("click", click, true);
                document.removeEventListener("keydown", key, true);
                if (banner.isConnected) banner.remove();
                if (overlay) overlay.style.display = previousDisplay;
            }
            function over(event) {
                if (hovered) hovered.classList.remove("pmk034-picker-hover");
                hovered = event.target && event.target.nodeType === 1 ? event.target : null;
                if (hovered && !hovered.closest(".pmk034-picker-banner")) hovered.classList.add("pmk034-picker-hover");
            }
            function out(event) {
                if (event.target && event.target.classList) event.target.classList.remove("pmk034-picker-hover");
            }
            function click(event) {
                if (event.target && event.target.closest && event.target.closest(".pmk034-picker-banner")) return;
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                const element = event.target;
                const selector = stableSelector(element);
                const targetName = String(element && element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) ||
                    (element && element.tagName ? element.tagName.toLowerCase() : "element");
                cleanup();
                if (!selector) return reject(new Error("selector_unavailable"));
                resolve({ value: selector, selector: selector, targetName: targetName });
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

    function ruleIndexFromFieldPath(path) {
        if (!Array.isArray(path)) return -1;
        const pos = path.indexOf("rules");
        if (pos === -1) return -1;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function pickForConfig(context) {
        const rootObject = context && context.rootObject ? context.rootObject : null;
        const fieldPath = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const index = ruleIndexFromFieldPath(fieldPath);
        const rule = rootObject && Array.isArray(rootObject.rules) && index >= 0 ? rootObject.rules[index] : null;
        const wantedPage = firstConcretePage(rule);

        if (wantedPage && window.location.pathname !== wantedPage) {
            try {
                sessionStorage.setItem(PENDING_PICK_KEY, JSON.stringify({
                    moduleId: MODULE_ID,
                    ruleIndex: index,
                    page: wantedPage,
                    draft: deepClone(rootObject || DEFAULTS),
                    startedAt: Date.now()
                }));
            } catch (_) {}
            window.location.href = window.location.origin + wantedPage;
            return new Promise(function () {});
        }

        return pickElementOnCurrentPage();
    }

    async function resumePendingPick() {
        let pending = null;
        try {
            const raw = sessionStorage.getItem(PENDING_PICK_KEY);
            if (raw) pending = JSON.parse(raw);
        } catch (_) {}
        if (!pending || pending.moduleId !== MODULE_ID) return false;
        if (Date.now() - Number(pending.startedAt || 0) > 15 * 60 * 1000) {
            try { sessionStorage.removeItem(PENDING_PICK_KEY); } catch (_) {}
            return false;
        }
        if (normalizePath(pending.page) !== window.location.pathname) return false;
        try { sessionStorage.removeItem(PENDING_PICK_KEY); } catch (_) {}

        window.setTimeout(async function () {
            try {
                const picked = await pickElementOnCurrentPage();
                const draft = normalizeConfig(pending.draft || DEFAULTS);
                const index = Number(pending.ruleIndex);
                if (!Number.isInteger(index) || !draft.rules[index]) return;
                draft.rules[index].selector = picked.selector;
                draft.rules[index].targetName = picked.targetName || picked.selector;
                if (!String(draft.rules[index].label || "").trim()) draft.rules[index].label = draft.rules[index].targetName;

                if (window.PMKConfig && typeof window.PMKConfig.saveConfig === "function") {
                    await window.PMKConfig.saveConfig(MODULE_ID, draft);
                    refresh(draft);
                    if (typeof window.PMKConfig.openAdmin === "function") {
                        await window.PMKConfig.openAdmin(MODULE_ID, { ruleIndex: index, sectionId: "rules" });
                    }
                } else {
                    refresh(draft);
                }
            } catch (_) {}
        }, 0);
        return true;
    }

    function newRule() {
        return {
            id: "rule-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
            enabled: true,
            label: "",
            pages: window.location.pathname || "*",
            selector: "",
            targetName: "",
            textContains: "",
            occurrence: "all",
            output: deepClone(DEFAULT_OUTPUT)
        };
    }

    function onTargetPick(rootObject, fieldPath, result) {
        const index = ruleIndexFromFieldPath(fieldPath);
        if (!rootObject || !Array.isArray(rootObject.rules) || index < 0 || !rootObject.rules[index] || !result) return;
        rootObject.rules[index].targetName = result.targetName || result.selector || "";
        if (!String(rootObject.rules[index].label || "").trim()) rootObject.rules[index].label = rootObject.rules[index].targetName;
    }

    function validate(config) {
        const lang = detectLanguage();
        const fail = function (fr, en) { return { ok: false, message: lang === "en" ? en : fr }; };
        if (!config || !Array.isArray(config.rules)) {
            return fail("La liste des règles de dates est invalide.", "The date rule list is invalid.");
        }
        const validDateFormats = ["koha", "dmy-slash", "mdy-slash", "iso", "dmy-dot", "dmy-dash", "custom"];
        const validTimeModes = ["auto", "always", "never"];
        const validTimeFormats = ["koha", "24h", "24h-seconds", "12h", "source", "custom"];
        const validOccurrences = ["first", "all"];

        for (let i = 0; i < config.rules.length; i += 1) {
            const rule = config.rules[i];
            if (!rule || rule.enabled === false) continue;
            if (!String(rule.pages || "").trim()) return fail("La règle " + (i + 1) + " doit avoir au moins une page Koha.", "Rule " + (i + 1) + " must have at least one Koha page.");
            if (!String(rule.selector || "").trim()) return fail("La règle " + (i + 1) + " doit avoir un élément cible.", "Rule " + (i + 1) + " must have a target element.");
            if (validOccurrences.indexOf(rule.occurrence || "all") === -1) return fail("Le mode d'occurrence de la règle " + (i + 1) + " est invalide.", "Rule " + (i + 1) + " has an invalid occurrence mode.");
            const output = merge(deepClone(DEFAULT_OUTPUT), rule.output || {});
            if (validDateFormats.indexOf(output.dateFormat) === -1) return fail("Le format de date de la règle " + (i + 1) + " est invalide.", "Rule " + (i + 1) + " has an invalid date format.");
            if (validTimeModes.indexOf(output.timeMode) === -1) return fail("Le mode d'affichage de l'heure de la règle " + (i + 1) + " est invalide.", "Rule " + (i + 1) + " has an invalid time display mode.");
            if (validTimeFormats.indexOf(output.timeFormat) === -1) return fail("Le format horaire de la règle " + (i + 1) + " est invalide.", "Rule " + (i + 1) + " has an invalid time format.");
            if (output.dateFormat === "custom" && !String(output.customDateFormat || "").trim()) return fail("Le format de date personnalisé de la règle " + (i + 1) + " est vide.", "Rule " + (i + 1) + " has an empty custom date format.");
            if (output.timeFormat === "custom" && !String(output.customTimeFormat || "").trim()) return fail("Le format horaire personnalisé de la règle " + (i + 1) + " est vide.", "Rule " + (i + 1) + " has an empty custom time format.");
        }
        return { ok: true };
    }

    function buildModuleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Formatage des dates affichées", en: "Displayed date formatting" },
            description: {
                fr: "Reformate des dates visibles dans Koha sans modifier les données. Chaque règle choisit une page, un élément, un format de date et le comportement de l'heure lorsqu'elle est présente.",
                en: "Reformats visible dates in Koha without changing data. Each rule selects a page, an element, a date format, and how time is displayed when present."
            },
            category: { fr: "Interface / présentation", en: "Interface / presentation" },
            supportedPages: ["catalogue.detail", "custom"],
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULTS),
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation générale", en: "General activation" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le formatage des dates", en: "Enable date formatting" } },
                        { key: "observeDom", type: "boolean", label: { fr: "Réappliquer après les mises à jour dynamiques de Koha", en: "Reapply after dynamic Koha updates" } },
                        { key: "observeDelay", type: "number", advanced: true, label: { fr: "Délai de retraitement du DOM (ms)", en: "DOM reprocessing delay (ms)" } }
                    ]
                },
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Dates à formater", en: "Dates to format" },
                    description: {
                        fr: "Ajoutez autant de règles que nécessaire. Le format « Koha » suit le réglage date/heure de l'installation. En mode heure « Si présente », une date seule reste une date seule et une date+heure conserve son heure.",
                        en: "Add as many rules as needed. The “Koha” format follows the installation date/time settings. With “If present”, a date-only value stays date-only and a date+time value keeps its time."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Règles de formatage", en: "Formatting rules" },
                            addLabel: { fr: "Ajouter une date", en: "Add date" },
                            emptyLabel: { fr: "Aucune date configurée.", en: "No date configured." },
                            reorder: true,
                            newItem: newRule,
                            itemTitle: function (item, index) {
                                return String(item && (item.label || item.targetName || item.selector) || "").trim() || "Date " + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom de la règle", en: "Rule name" } },
                                {
                                    key: "pages",
                                    type: "textarea",
                                    label: { fr: "Pages Koha actives", en: "Active Koha pages" },
                                    help: { fr: "Un chemin par ligne. Le picker ouvre automatiquement la première page indiquée si nécessaire.", en: "One path per line. The picker automatically opens the first configured page when needed." }
                                },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Élément contenant la date", en: "Element containing the date" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    emptyLabel: { fr: "Aucun élément choisi", en: "No element selected" },
                                    allowManual: true,
                                    pick: pickForConfig,
                                    onPick: onTargetPick
                                },
                                { key: "targetName", type: "text", readOnly: true, advanced: true, label: { fr: "Élément détecté", en: "Detected element" } },
                                {
                                    key: "textContains",
                                    type: "textarea",
                                    advanced: true,
                                    label: { fr: "Limiter aux éléments contenant l'un de ces textes", en: "Limit to elements containing one of these texts" },
                                    help: { fr: "Optionnel, un texte par ligne. Utile si un même sélecteur CSS correspond à plusieurs lignes différentes.", en: "Optional, one text per line. Useful when one CSS selector matches several different rows." }
                                },
                                {
                                    key: "occurrence",
                                    type: "select",
                                    label: { fr: "Dates à traiter dans l'élément", en: "Dates to process in the element" },
                                    options: [
                                        { value: "all", label: { fr: "Toutes les dates trouvées", en: "All dates found" } },
                                        { value: "first", label: { fr: "Première date seulement", en: "First date only" } }
                                    ]
                                },
                                {
                                    key: "output.dateFormat",
                                    type: "select",
                                    label: { fr: "Format de sortie de la date", en: "Output date format" },
                                    options: [
                                        { value: "koha", label: { fr: "Format configuré dans Koha", en: "Koha configured format" } },
                                        { value: "dmy-slash", label: { fr: "JJ/MM/AAAA — 31/12/2026", en: "DD/MM/YYYY — 31/12/2026" } },
                                        { value: "mdy-slash", label: { fr: "MM/JJ/AAAA — 12/31/2026", en: "MM/DD/YYYY — 12/31/2026" } },
                                        { value: "iso", label: { fr: "AAAA-MM-JJ — 2026-12-31", en: "YYYY-MM-DD — 2026-12-31" } },
                                        { value: "dmy-dot", label: { fr: "JJ.MM.AAAA — 31.12.2026", en: "DD.MM.YYYY — 31.12.2026" } },
                                        { value: "dmy-dash", label: { fr: "JJ-MM-AAAA — 31-12-2026", en: "DD-MM-YYYY — 31-12-2026" } },
                                        { value: "custom", label: { fr: "Format personnalisé", en: "Custom format" } }
                                    ]
                                },
                                {
                                    key: "output.customDateFormat",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Format de date personnalisé", en: "Custom date format" },
                                    help: { fr: "Jetons disponibles : YYYY, MM, DD. Exemple : DD/MM/YYYY.", en: "Available tokens: YYYY, MM, DD. Example: DD/MM/YYYY." }
                                },
                                {
                                    key: "output.timeMode",
                                    type: "select",
                                    label: { fr: "Affichage de l'heure", en: "Time display" },
                                    options: [
                                        { value: "auto", label: { fr: "Seulement si l'heure existe dans la valeur d'origine", en: "Only when time exists in the original value" } },
                                        { value: "always", label: { fr: "Toujours afficher l'heure", en: "Always show time" } },
                                        { value: "never", label: { fr: "Ne jamais afficher l'heure", en: "Never show time" } }
                                    ]
                                },
                                {
                                    key: "output.timeFormat",
                                    type: "select",
                                    label: { fr: "Format de sortie de l'heure", en: "Output time format" },
                                    options: [
                                        { value: "koha", label: { fr: "Format horaire configuré dans Koha", en: "Koha configured time format" } },
                                        { value: "24h", label: { fr: "24 h — 23:45", en: "24-hour — 23:45" } },
                                        { value: "24h-seconds", label: { fr: "24 h avec secondes — 23:45:30", en: "24-hour with seconds — 23:45:30" } },
                                        { value: "12h", label: { fr: "12 h — 11:45 PM", en: "12-hour — 11:45 PM" } },
                                        { value: "source", label: { fr: "Conserver le format horaire d'origine", en: "Keep original time format" } },
                                        { value: "custom", label: { fr: "Format personnalisé", en: "Custom format" } }
                                    ]
                                },
                                {
                                    key: "output.customTimeFormat",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Format horaire personnalisé", en: "Custom time format" },
                                    help: { fr: "Jetons : HH, hh, mm, ss, A. Exemple : HH:mm:ss.", en: "Tokens: HH, hh, mm, ss, A. Example: HH:mm:ss." }
                                },
                                {
                                    key: "output.separator",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Séparateur entre date et heure", en: "Separator between date and time" },
                                    help: { fr: "Par défaut : un espace. Exemple possible : « à ».", en: "Default: one space. Example: “ at ”." }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "compatibility",
                    label: { fr: "Compatibilité", en: "Compatibility" },
                    description: {
                        fr: "Le module reconnaît les dates ISO et les dates numériques locales avec ou sans heure. Il ne modifie jamais une valeur qu'il ne parvient pas à valider. Le formatage visuel n'est pas destiné à servir de source de données métier à d'autres modules.",
                        en: "The module recognizes ISO and local numeric dates with or without time. It never changes a value it cannot validate. Visual formatting is not intended to be used as a business-data source by other modules."
                    },
                    fields: []
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : "rules";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') || main.querySelector('[data-pmk-section-id="rules"]');
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

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (window.location.pathname !== "/cgi-bin/koha/catalogue/detail.pl") return;
        const anchor = document.querySelector("strong.infotech") || document.querySelector(".technique-text") || document.querySelector(".technique");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: "date-formatting-catalogue-detail",
                context: { sectionId: "rules", page: "catalogue.detail" }
            });
        } catch (_) {}
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(deepClone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return normalizeConfig(cfg || {}); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function start() {
        registerModuleIfNeeded();
        resumePendingPick();
        loadConfig().then(refresh);
        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try { window.PMKConfig.subscribe(MODULE_ID, refresh); } catch (_) {}
        }
    }

    window.PMK034DateDisplayFormatting = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        parseCandidate: parseCandidate,
        formatParsed: formatParsed,
        formatValue: function (value, output) {
            const parsed = parseCandidate(value);
            return parsed ? formatParsed(parsed, output || DEFAULT_OUTPUT) : value;
        },
        getConfig: function () { return deepClone(currentConfig); },
        moduleDefinition: buildModuleDefinition
    };

    start();
})();
