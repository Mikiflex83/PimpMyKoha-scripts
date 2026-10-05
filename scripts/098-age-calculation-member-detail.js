/*
 Nom du fichier: 098-age-calculation-member-detail.js
 Version: 3.0.0-pmk-isolated
 Date de dernière modification: 2026-09-22
 Auteur: Michael Mundet
 Module PMK: patron-age-display

 Description:
   Personnalise l'affichage de l'âge d'un lecteur à partir de sa date de naissance.

   Pages prises en charge :
   - /cgi-bin/koha/members/moremember.pl
   - /cgi-bin/koha/circ/circulation.pl
   - /cgi-bin/koha/members/memberentry.pl

   Principes :
   - conserve l'élément natif Koha .age_years lorsqu'il existe ;
   - ne casse pas le module 049 (signe astrologique), qui s'appuie sur ce même élément ;
   - propose années / années+mois / années+mois+jours ;
   - aperçu dynamique sur memberentry.pl ;
   - configuration PMKConfig avec valeurs locales de secours ;
   - FR / EN ;
   - idempotent et sans dépendance externe.
*/
(function () {
    "use strict";

    const MODULE_ID = "patron-age-display";
    const VERSION = "3.0.0-pmk-isolated";
    const SCRIPT_GUARD = "__pmk098PatronAgeDisplayV3";
    const GENERATED_ATTR = "data-pmk098-generated";
    const ACTIVE_ATTR = "data-pmk098-age-display";
    const ORIGINAL_ATTR = "data-pmk098-original-text";

    const PAGE_DEFS = {
        moremember: {
            id: "members.moremember",
            path: "/cgi-bin/koha/members/moremember.pl"
        },
        circulation: {
            id: "circ.circulation",
            path: "/cgi-bin/koha/circ/circulation.pl"
        },
        memberentry: {
            id: "members.memberentry",
            path: "/cgi-bin/koha/members/memberentry.pl"
        }
    };

    const DEFAULTS = {
        enabled: true,
        format: "years",
        language: "auto",
        parentheses: true,
        pages: {
            moremember: { enabled: true },
            circulation: { enabled: true },
            memberentry: { enabled: true }
        }
    };

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    let currentConfig = clone(DEFAULTS);
    let observer = null;
    let refreshQueued = false;
    let dateInput = null;
    let dateInputHandler = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function merge(base, extra) {
        const out = clone(base);
        if (!isObject(extra)) return out;
        Object.keys(extra).forEach(function (key) {
            if (isObject(extra[key]) && isObject(out[key])) out[key] = merge(out[key], extra[key]);
            else if (extra[key] !== undefined) out[key] = clone(extra[key]);
        });
        return out;
    }

    function normalizeConfig(config) {
        const value = merge(DEFAULTS, config || {});
        value.enabled = value.enabled !== false;
        if (!["years", "years_months", "years_months_days"].includes(value.format)) {
            value.format = DEFAULTS.format;
        }
        if (!["auto", "fr", "en"].includes(value.language)) value.language = DEFAULTS.language;
        value.parentheses = value.parentheses !== false;
        value.pages = merge(DEFAULTS.pages, value.pages || {});
        Object.keys(DEFAULTS.pages).forEach(function (key) {
            value.pages[key].enabled = value.pages[key].enabled !== false;
        });
        return value;
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function languageOf(config) {
        if (config.language === "fr" || config.language === "en") return config.language;
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try {
                const lang = String(api.getLanguage() || "").toLowerCase();
                if (lang.startsWith("en")) return "en";
                if (lang.startsWith("fr")) return "fr";
            } catch (_) {}
        }
        return String(document.documentElement.lang || "").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function currentPageKey() {
        const path = window.location.pathname || "";
        return Object.keys(PAGE_DEFS).find(function (key) {
            return path === PAGE_DEFS[key].path;
        }) || "";
    }

    function pageEnabled(config) {
        const key = currentPageKey();
        return Boolean(key && config.pages && config.pages[key] && config.pages[key].enabled !== false);
    }

    function normaliseSpaces(value) {
        return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }

    function makeDate(year, month, day) {
        year = Number(year);
        month = Number(month);
        day = Number(day);
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
        if (year < 1800 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = new Date(Date.UTC(year, month - 1, day));
        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) return null;
        return date;
    }

    function parseDate(value) {
        const text = normaliseSpaces(value);
        let match = text.match(/(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
        if (match) return makeDate(match[1], match[2], match[3]);

        match = text.match(/(?:^|\D)(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\D|$)/);
        if (match) return makeDate(match[3], match[2], match[1]);
        return null;
    }

    function daysInMonthUtc(year, monthZeroBased) {
        return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
    }

    function addYearsClamped(date, years) {
        const year = date.getUTCFullYear() + years;
        const month = date.getUTCMonth();
        const day = Math.min(date.getUTCDate(), daysInMonthUtc(year, month));
        return new Date(Date.UTC(year, month, day));
    }

    function addMonthsClamped(date, months) {
        const raw = date.getUTCMonth() + months;
        const year = date.getUTCFullYear() + Math.floor(raw / 12);
        const month = ((raw % 12) + 12) % 12;
        const day = Math.min(date.getUTCDate(), daysInMonthUtc(year, month));
        return new Date(Date.UTC(year, month, day));
    }

    function todayUtc() {
        const now = new Date();
        return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    function calculateAgeParts(birth) {
        const today = todayUtc();
        if (!birth || birth.getTime() > today.getTime()) return null;

        let years = today.getUTCFullYear() - birth.getUTCFullYear();
        let afterYears = addYearsClamped(birth, years);
        if (afterYears.getTime() > today.getTime()) {
            years--;
            afterYears = addYearsClamped(birth, years);
        }

        let months = 0;
        while (months < 11) {
            const candidate = addMonthsClamped(afterYears, months + 1);
            if (candidate.getTime() > today.getTime()) break;
            months++;
        }

        const afterMonths = addMonthsClamped(afterYears, months);
        const days = Math.floor((today.getTime() - afterMonths.getTime()) / 86400000);

        if (years < 0 || years > 130 || months < 0 || months > 11 || days < 0 || days > 31) return null;
        return { years: years, months: months, days: days };
    }

    function unit(value, singular, plural) {
        return value + " " + (value === 1 ? singular : plural);
    }

    function formatAge(parts, config) {
        const lang = languageOf(config);
        let chunks;

        if (lang === "en") {
            chunks = [unit(parts.years, "year", "years")];
            if (config.format !== "years") chunks.push(unit(parts.months, "month", "months"));
            if (config.format === "years_months_days") chunks.push(unit(parts.days, "day", "days"));
        } else {
            chunks = [unit(parts.years, "an", "ans")];
            if (config.format !== "years") chunks.push(unit(parts.months, "mois", "mois"));
            if (config.format === "years_months_days") chunks.push(unit(parts.days, "jour", "jours"));
        }

        const text = chunks.join(" ");
        return config.parentheses ? "(" + text + ")" : text;
    }

    function rememberOriginal(span) {
        if (!span || span.hasAttribute(ORIGINAL_ATTR)) return;
        span.setAttribute(ORIGINAL_ATTR, span.textContent || "");
    }

    function restoreExistingSpans() {
        document.querySelectorAll('.age_years[' + ACTIVE_ATTR + '="1"]').forEach(function (span) {
            if (span.hasAttribute(ORIGINAL_ATTR)) {
                span.textContent = span.getAttribute(ORIGINAL_ATTR) || "";
                span.removeAttribute(ORIGINAL_ATTR);
            }
            span.removeAttribute(ACTIVE_ATTR);
            span.removeAttribute("data-pmk098-age-years");
            span.removeAttribute("data-pmk098-version");
        });
    }

    function removeGenerated() {
        document.querySelectorAll('[' + GENERATED_ATTR + '="1"]').forEach(function (node) {
            node.remove();
        });
    }

    function birthFromContainer(container) {
        if (!container) return null;
        const cloneNode = container.cloneNode(true);
        cloneNode.querySelectorAll('.age_years, [data-koha-astro-sign], .pmk-astro049-sign, .pmk-context-config').forEach(function (el) {
            el.remove();
        });
        return parseDate(cloneNode.textContent || "");
    }

    function birthForAgeSpan(span) {
        if (!span) return null;

        const container = span.closest("li, dd, .patrondateofbirth, .form-group, .form-row");
        const fromContainer = birthFromContainer(container);
        if (fromContainer) return fromContainer;

        let node = span.previousSibling;
        let hops = 0;
        while (node && hops < 8) {
            const parsed = parseDate(node.textContent || "");
            if (parsed) return parsed;
            node = node.previousSibling;
            hops++;
        }
        return null;
    }

    function renderNativeAgeSpans(config) {
        let count = 0;
        document.querySelectorAll(".age_years").forEach(function (span) {
            if (span.getAttribute(GENERATED_ATTR) === "1") return;
            const birth = birthForAgeSpan(span);
            const parts = calculateAgeParts(birth);
            if (!parts) return;

            const wanted = formatAge(parts, config);
            rememberOriginal(span);
            if ((span.textContent || "") !== wanted) span.textContent = wanted;
            span.setAttribute(ACTIVE_ATTR, "1");
            span.setAttribute("data-pmk098-age-years", String(parts.years));
            span.setAttribute("data-pmk098-version", VERSION);
            count++;
        });
        return count;
    }

    function findDateInput() {
        return document.querySelector(
            '#dateofbirth, input[name="dateofbirth"], input[name="borrower_dateofbirth"], input[data-patron-field="dateofbirth"]'
        );
    }

    function renderMemberEntryPreview(config) {
        const input = findDateInput();
        if (!input) return 0;

        const birth = parseDate(input.value || input.getAttribute("value") || "");
        const parts = calculateAgeParts(birth);
        let preview = document.querySelector('.pmk098-age-preview[' + GENERATED_ATTR + '="1"]');

        if (!parts) {
            if (preview) preview.hidden = true;
            return 0;
        }

        if (!preview) {
            preview = document.createElement("span");
            preview.className = "age_years pmk098-age-preview";
            preview.setAttribute(GENERATED_ATTR, "1");
            preview.setAttribute(ACTIVE_ATTR, "1");
            preview.setAttribute("data-pmk098-version", VERSION);
            preview.style.marginInlineStart = ".5rem";
            input.insertAdjacentElement("afterend", preview);
        }

        preview.textContent = formatAge(parts, config);
        preview.setAttribute("data-pmk098-age-years", String(parts.years));
        preview.hidden = false;
        return 1;
    }

    function bindDateInput() {
        const input = findDateInput();
        if (!input || input === dateInput) return;

        unbindDateInput();
        dateInput = input;
        dateInputHandler = function () { scheduleRefresh(); };
        input.addEventListener("input", dateInputHandler);
        input.addEventListener("change", dateInputHandler);
    }

    function unbindDateInput() {
        if (dateInput && dateInputHandler) {
            dateInput.removeEventListener("input", dateInputHandler);
            dateInput.removeEventListener("change", dateInputHandler);
        }
        dateInput = null;
        dateInputHandler = null;
    }

    function mountConfigShortcut() {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;

        const pageKey = currentPageKey();
        let anchor = null;

        if (pageKey === "moremember" || pageKey === "circulation") {
            anchor = document.querySelector("#patron-information .patroninfo-heading, #patron-information h2, .patroninfo-heading");
        } else if (pageKey === "memberentry") {
            anchor = document.querySelector("#memberentry_identity legend, #memberentry_identity h2, #memberentry_identity");
        }
        if (!anchor) return;

        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: PAGE_DEFS[pageKey].id,
                context: {
                    sectionId: "format",
                    pageId: PAGE_DEFS[pageKey].id
                }
            });
        } catch (_) {}
    }

    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        unbindDateInput();
        restoreExistingSpans();
        removeGenerated();
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config);

        if (!currentConfig.enabled || !pageEnabled(currentConfig)) {
            cleanup();
            return;
        }

        const pageKey = currentPageKey();
        if (!pageKey) return;

        if (pageKey === "memberentry") {
            bindDateInput();
            renderMemberEntryPreview(currentConfig);
        } else {
            renderNativeAgeSpans(currentConfig);
        }

        mountConfigShortcut();
        ensureObserver();
    }

    function refresh() {
        if (!currentConfig.enabled || !pageEnabled(currentConfig)) return;
        const pageKey = currentPageKey();
        if (pageKey === "memberentry") {
            bindDateInput();
            renderMemberEntryPreview(currentConfig);
        } else {
            renderNativeAgeSpans(currentConfig);
        }
        mountConfigShortcut();
    }

    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        window.requestAnimationFrame(function () {
            refreshQueued = false;
            refresh();
        });
    }

    function ensureObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                if (mutation.type !== "childList") return false;
                return Array.from(mutation.addedNodes || []).some(function (node) {
                    if (!node || node.nodeType !== 1) return false;
                    return (
                        node.matches && node.matches(".age_years, #dateofbirth, [name=dateofbirth]")
                    ) || (
                        node.querySelector && node.querySelector(".age_years, #dateofbirth, [name=dateofbirth]")
                    );
                });
            });
            if (relevant) scheduleRefresh();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function connectPmkConfig(attempt) {
        attempt = attempt || 0;
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            if (attempt < 40) {
                window.setTimeout(function () { connectPmkConfig(attempt + 1); }, 100);
                return;
            }
            applyConfig(DEFAULTS);
            return;
        }

        mountConfigShortcut();

        try {
            if (typeof api.subscribe === "function") {
                api.subscribe(MODULE_ID, function (config) {
                    applyConfig(config);
                });
            }
        } catch (_) {}

        api.getConfig(MODULE_ID)
            .then(applyConfig)
            .catch(function () { applyConfig(DEFAULTS); });
    }

    function start() {
        if (!currentPageKey()) return;
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () {
                connectPmkConfig(0);
            }, { once: true });
        } else {
            connectPmkConfig(0);
        }
    }

    window.PMK098PatronAgeDisplay = {
        version: VERSION,
        moduleId: MODULE_ID,
        refresh: scheduleRefresh,
        getConfig: function () { return clone(currentConfig); }
    };

    start();
})();
